// Spiel-Controller: verbindet Menüs, Welten, Eingabe, Speichern und die Render-Schleife.
import * as THREE from 'three';
import { AUTOSAVE_INTERVAL_MS, APP_VERSION, DIFFICULTIES, GAME_MODES } from './config.js';
import { TextureAtlas } from './assets/texture-atlas.js';
import { REQUIRED_TEXTURES } from './assets/texture-names.js';
import { hashString } from './engine/random.js';
import { Input } from './engine/input.js';
import { createPanorama } from './ui/panorama.js';
import { buildTitleScreen } from './ui/menu.js';
import { buildWorldSelection } from './ui/world-selection.js';
import { buildAchievementScreen, buildPauseMenu, buildStatsScreen } from './ui/pause-menu.js';
import { buildOptionsScreen, buildControlsScreen } from './ui/options.js';
import { buildLoadingScreen } from './ui/loading.js';
import { buildDeathScreen } from './ui/death-screen.js';
import { buildHud } from './ui/hud.js';
import { button, closeAllDialogs, dirtTileCss, h, openDialog, ScreenManager } from './ui/ui-kit.js';
import { saveSystem } from './systems/save-system.js';
import { settings } from './systems/settings.js';
import { GameSession } from './session.js';
import { ChunkWorkerPool } from './world/worker-chunks.js';

const MENU_SCREENS_WITH_BACK = ['worlds', 'options', 'controls', 'achievements', 'stats'];

/** Seed aus Text: Zahlen bleiben Zahlen, Text wird gehasht, leer ergibt einen Zufallswert. */
export function seedFromText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return Math.floor(Math.random() * 0x100000000) | 0;
  if (/^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isSafeInteger(n)) return n | 0;
  }
  return hashString(trimmed) | 0;
}

function workerCount() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(4, cores - 1));
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.uiRoot = document.getElementById('ui-root');
    this.scaler = document.getElementById('ui-scaler');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.input = new Input();
    this.screens = new ScreenManager(this.uiRoot);
    this.panorama = createPanorama();
    this.atlas = new TextureAtlas();
    this.atlasPromise = null;
    this.pool = null;
    this.session = null;
    this.mode = 'menu'; // menu | loading | playing | paused
    this.busy = false;
    this.lastFrame = performance.now();
    this.previewResolvers = [];
    this.lastAutosave = 0;
    this.frameCount = 0;
    this.fpsSince = performance.now();
    this.fps = 0;
  }

  async init() {
    if (!this.renderer.capabilities.isWebGL2) {
      throw new Error('WebGL 2 wird von diesem Browser nicht unterstützt.');
    }
    document.documentElement.style.setProperty('--dirt-tile', dirtTileCss());

    const title = buildTitleScreen(this);
    this.screens.register('title', title.element, { onShow: title.onShow });
    const worlds = buildWorldSelection(this);
    this.screens.register('worlds', worlds.element, { onShow: worlds.onShow });
    const options = buildOptionsScreen(this);
    this.screens.register('options', options.element, { onShow: options.onShow });
    const controls = buildControlsScreen(this);
    this.screens.register('controls', controls.element, { onShow: controls.onShow, onHide: controls.onHide });
    const achievements = buildAchievementScreen(this);
    this.screens.register('achievements', achievements.element, { onShow: achievements.onShow });
    const stats = buildStatsScreen(this);
    this.screens.register('stats', stats.element, { onShow: stats.onShow });
    this.loading = buildLoadingScreen();
    this.screens.register('loading', this.loading.element);
    this.hud = buildHud();
    this.screens.register('hud', this.hud.element);
    const pause = buildPauseMenu(this);
    this.screens.register('pause', pause.element, { overlay: true, onShow: pause.onShow });
    const death = buildDeathScreen(this);
    this.screens.register('death', death.element, { overlay: true });

    this.applyDisplaySettings();
    settings.onChange((_, key) => {
      if (['guiScale', 'renderScale', 'fov', 'renderDistance', 'smoothLighting', 'clouds', 'shadows'].includes(key)) this.applyDisplaySettings();
    });
    window.addEventListener('resize', () => this.applyDisplaySettings());
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.canvas.addEventListener('mousedown', () => this.requestLock());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'playing' || this.mode === 'paused')) this.saveGame().catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
      if (this.mode === 'playing' || this.mode === 'paused') this.saveGame().catch(() => {});
    });

    this.screens.show('title', { replace: true });
    this.ensureAtlas().catch((err) => console.error('Texture-Atlas:', err));
    requestAnimationFrame((now) => this.frame(now));
    setInterval(() => {
      if ((this.mode === 'playing' || this.mode === 'paused') && !this.busy) {
        this.saveGame().catch((err) => console.warn('Autosave fehlgeschlagen:', err));
      }
    }, AUTOSAVE_INTERVAL_MS);
  }

  /** Texturen werden einmal geladen und danach wiederverwendet. */
  ensureAtlas(onProgress) {
    if (!this.atlasPromise) {
      this.atlasPromise = this.atlas.build(REQUIRED_TEXTURES, onProgress);
    }
    return this.atlasPromise;
  }

  // ----- Anzeige ---------------------------------------------------------

  applyDisplaySettings() {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const guiSetting = settings.get('guiScale');
    const scale = guiSetting === 'auto' ? Math.max(1, Math.min(4, Math.floor(Math.min(w / 480, hgt / 300)))) : guiSetting;
    document.documentElement.style.setProperty('--gui', String(scale));
    this.scaler.style.transform = `scale(${scale})`;
    this.scaler.style.width = `${w / scale}px`;
    this.scaler.style.height = `${hgt / scale}px`;

    const ratio = Math.min(window.devicePixelRatio || 1, 2) * (settings.get('renderScale') / 100);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, hgt, false);
    this.panorama.resize(w, hgt);
    if (this.session) {
      this.session.camera.aspect = w / hgt;
      this.session.camera.fov = settings.get('fov');
      this.session.camera.updateProjectionMatrix();
      this.session.materials.shared.uAoStrength.value = settings.get('smoothLighting') ? 1 : 0;
    }
  }

  // ----- Schleife --------------------------------------------------------

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.session) {
      if (this.mode === 'playing') {
        this.session.update(dt, this.input, Boolean(document.pointerLockElement));
        this.session.meta.playTime = (this.session.meta.playTime || 0) + dt;
      } else {
        this.session.chunkManager.rebuildMeshes(4);
        this.session.syncCamera();
      }
      this.atlas.update(now);
      this.renderer.render(this.session.scene, this.session.camera);
    } else {
      this.panorama.update(dt);
      this.renderer.render(this.panorama.scene, this.panorama.camera);
    }

    if (this.previewResolvers.length) this.resolvePreviews();

    this.frameCount++;
    if (now - this.fpsSince >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsSince));
      this.frameCount = 0;
      this.fpsSince = now;
    }
    this.hud.setLockHint(this.mode === 'playing' && !document.pointerLockElement);
    this.input.endFrame();
  }

  resolvePreviews() {
    const resolvers = this.previewResolvers.splice(0);
    const small = document.createElement('canvas');
    small.width = 192;
    small.height = 108;
    small.getContext('2d').drawImage(this.canvas, 0, 0, small.width, small.height);
    small.toBlob((blob) => resolvers.forEach((resolve) => resolve(blob)), 'image/png');
  }

  capturePreview() {
    return new Promise((resolve) => this.previewResolvers.push(resolve));
  }

  // ----- Tastatur und Zeiger ---------------------------------------------

  onKeyDown(event) {
    if (event.target instanceof HTMLInputElement) {
      if (event.code === 'Escape') {
        event.target.blur();
      }
      return;
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      if (this.closeTopDialog()) return;
      if (this.mode === 'playing') this.pause();
      else if (this.mode === 'paused') this.resume();
      else if (MENU_SCREENS_WITH_BACK.includes(this.screens.current)) this.screens.back('title');
      return;
    }
  }

  closeTopDialog() {
    const layers = this.uiRoot.querySelectorAll('.dialog-layer');
    if (!layers.length) return false;
    layers[layers.length - 1].remove();
    return true;
  }

  requestLock() {
    if (this.mode !== 'playing' || document.pointerLockElement) return;
    try {
      const result = this.canvas.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Der Browser verweigert den Zeigerfang; das Spiel bleibt bedienbar.
    }
  }

  onPointerLockChange() {
    if (!document.pointerLockElement && this.mode === 'playing') {
      this.pause();
    }
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.screens.show('pause', { push: true });
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.input.reset();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.screens.hideAll();
    this.screens.show('hud', { replace: true });
    this.input.reset();
    this.requestLock();
  }

  // ----- Welten ----------------------------------------------------------

  async listWorlds() {
    return saveSystem.listWorlds();
  }

  async createWorld(options) {
    const now = Date.now();
    const meta = {
      id: `w${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      name: options.name,
      seedText: options.seedText || '',
      seed: seedFromText(options.seedText),
      mode: GAME_MODES.includes(options.mode) ? options.mode : 'survival',
      difficulty: DIFFICULTIES.includes(options.difficulty) ? options.difficulty : 'normal',
      generator: options.generator || 'default',
      structures: options.structures !== false,
      created: now,
      lastPlayed: now,
      playTime: 0,
      dimension: 'overworld',
      spawn: [0, 1, 0],
      player: { pos: [0.5, 1, 0.5], rot: [0, -0.25] },
      achievements: [],
      stats: {},
      beatGame: false,
      version: APP_VERSION,
    };
    await saveSystem.putWorld(meta);
    return meta;
  }

  async updateWorld(id, patch) {
    const meta = await saveSystem.getWorld(id);
    if (!meta) return null;
    Object.assign(meta, patch);
    await saveSystem.putWorld(meta);
    return meta;
  }

  async deleteWorld(id) {
    await saveSystem.deleteWorld(id);
  }

  async loadWorld(id) {
    if (this.busy) return;
    this.busy = true;
    try {
      const meta = await saveSystem.getWorld(id);
      if (!meta) throw new Error('Die Welt wurde nicht gefunden.');
      this.mode = 'loading';
      this.screens.hideAll();
      this.screens.show('loading', { replace: true });
      this.loading.setProgress(0, 'Texturen werden geladen …');
      await this.ensureAtlas((p) => this.loading.setProgress(p * 0.2, 'Texturen werden geladen …'));
      if (!this.pool) this.pool = new ChunkWorkerPool(workerCount());
      this.session = new GameSession({ meta, atlas: this.atlas, pool: this.pool });
      this.applyDisplaySettings();
      await this.session.waitForSpawnArea((p, text) => this.loading.setProgress(0.2 + p * 0.8, `Gelände wird gebaut … ${text}`));
      this.mode = 'playing';
      this.screens.hideAll();
      this.screens.show('hud', { replace: true });
      this.hud.setHint('WASD bewegen · Leertaste hoch · Umschalt runter · ESC Menü');
      this.input.reset();
      this.requestLock();
      this.lastAutosave = performance.now();
    } catch (err) {
      console.error(err);
      this.disposeSession();
      this.mode = 'menu';
      this.screens.hideAll();
      this.screens.show('worlds', { replace: true });
      this.showMessage('Welt konnte nicht geladen werden', err.message || String(err));
    } finally {
      this.busy = false;
    }
  }

  /** Speichert Spielerzustand, Metadaten und veränderte Chunks. */
  async saveGame() {
    const session = this.session;
    if (!session) return;
    const meta = session.meta;
    const pos = session.position;
    meta.lastPlayed = Date.now();
    meta.player = { pos: [pos.x, pos.y - 1.6, pos.z], rot: [session.controller.yaw, session.controller.pitch] };
    meta.preview = await this.capturePreview().catch(() => undefined);
    const modified = [...session.world.chunks.values()].filter((chunk) => chunk.modified);
    await saveSystem.putChunks(modified.map((chunk) => chunk.serialize(meta.id, session.world.dimension)));
    for (const chunk of modified) chunk.modified = false;
    await saveSystem.putWorld(meta);
  }

  disposeSession() {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
  }

  async exitToTitle() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.saveGame();
    } catch (err) {
      this.showMessage('Speichern fehlgeschlagen', err.message || String(err));
    } finally {
      this.disposeSession();
      this.mode = 'menu';
      if (document.pointerLockElement) document.exitPointerLock?.();
      closeAllDialogs(this.uiRoot);
      this.screens.hideAll();
      this.screens.show('title', { replace: true });
      this.busy = false;
    }
  }

  quit() {
    openDialog(this.uiRoot, {
      title: 'Spiel beenden',
      width: 340,
      body: [h('p', {}, 'Du kannst diesen Browser-Tab jetzt schließen. Der Spielstand bleibt gespeichert.')],
      buttons: [
        button('Tab schließen', () => window.close(), { wide: true }),
        button('Abbrechen', (e) => e.currentTarget.closest('.dialog-layer')?.remove(), { wide: true }),
      ],
    });
  }

  showMessage(title, text) {
    openDialog(this.uiRoot, {
      title,
      width: 360,
      body: [h('p', {}, text)],
      buttons: [button('OK', (e) => e.currentTarget.closest('.dialog-layer')?.remove(), { wide: true })],
    });
  }

  respawn() {
    if (!this.session) return;
    this.screens.hideAll();
    this.screens.show('hud', { replace: true });
    this.mode = 'playing';
    this.requestLock();
  }

  // ----- Statistiken -----------------------------------------------------

  getAchievements() {
    return [];
  }

  getWorldStats() {
    const session = this.session;
    if (!session) return null;
    const meta = session.meta;
    const p = session.position;
    return {
      name: meta.name,
      seedText: meta.seedText || String(meta.seed),
      mode: meta.mode,
      difficulty: meta.difficulty,
      playTime: meta.playTime || 0,
      dimensionLabel: 'Oberwelt',
      position: `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`,
      kills: meta.stats?.kills ?? 0,
      diamonds: meta.stats?.diamonds ?? 0,
    };
  }
}

