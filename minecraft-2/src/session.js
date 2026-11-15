// Eine geladene Welt: Szene, Kamera, Chunks, Himmel, Wetter und Spielzeit.
import * as THREE from 'three';
import { CHUNK_SIZE } from './config.js';
import { FlyController } from './player/fly-controller.js';
import { Sky } from './systems/day-night.js';
import { settings } from './systems/settings.js';
import { saveSystem } from './systems/save-system.js';
import { RainEffect, Weather } from './systems/weather.js';
import { ChunkManager } from './world/chunk-manager.js';
import { createBlockMaterials } from './world/block-material.js';
import { handleScheduledUpdate } from './world/fluids.js';
import { World, worldToChunk } from './world/world.js';

const SPAWN_RADIUS_CHUNKS = 2;
const DEFAULT_TIME = 1000; // früher Morgen

export class GameSession {
  /**
   * @param {{ meta: object, atlas: import('./assets/texture-atlas.js').TextureAtlas,
   *           pool: import('./world/worker-chunks.js').ChunkWorkerPool }} deps
   */
  constructor({ meta, atlas, pool }) {
    this.meta = meta;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fc4ff');
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';

    this.world = new World({ dimension: meta.dimension || 'overworld', seed: meta.seed });
    this.world.worldId = meta.id;
    this.materials = createBlockMaterials(atlas.texture);
    const persistence = {
      load: (cx, cz) => saveSystem.getChunk(`${meta.id}|${this.world.dimension}|${cx}|${cz}`),
      save: (records) => saveSystem.putChunks(records),
    };
    this.chunkManager = new ChunkManager({
      world: this.world,
      pool,
      scene: this.scene,
      atlas,
      materials: this.materials,
      options: () => ({ smoothLighting: settings.get('smoothLighting') }),
      persistence,
    });
    this.chunkManager.setGenerator(meta.generator === 'flat' ? 'flat' : 'default', meta.structures !== false);
    this.chunkManager.renderDistance = settings.get('renderDistance');
    this.world.onChunkChanged = (chunk) => this.chunkManager.meshQueue.add(chunk.key);

    this.sky = new Sky(this.scene);
    this.weather = new Weather(meta.weather ?? {});
    this.rain = new RainEffect(this.scene);
    this.time = meta.time ?? DEFAULT_TIME;
    this.cloudTime = 0;

    const p = meta.player?.pos ?? [0.5, 1, 0.5];
    this.controller = new FlyController({ x: p[0], y: p[1] + 1.6, z: p[2] });
    if (meta.player?.rot) {
      this.controller.yaw = meta.player.rot[0];
      this.controller.pitch = meta.player.rot[1];
    }
    this.disposed = false;
  }

  get position() {
    return { x: this.controller.x, y: this.controller.y, z: this.controller.z };
  }

  /** Spiel-Tick (20 pro Sekunde): geplante Updates, Zeit, Wetter. */
  tick() {
    this.world.processScheduled(handleScheduledUpdate);
    this.time = (this.time + 1) % (24000 * 1000);
    this.weather.tick();
  }

  /** Bildaktualisierung: Eingabe, Chunks, Himmel, Kamera. */
  update(dt, input, locked) {
    this.controller.update(dt, input, locked);
    this.chunkManager.renderDistance = settings.get('renderDistance');
    this.chunkManager.update(worldToChunk(Math.floor(this.controller.x)), worldToChunk(Math.floor(this.controller.z)));
    this.chunkManager.rebuildMeshes(6);
    this.weather.update(dt);
    this.cloudTime += dt * 20;
    this.applyEnvironment(dt);
    this.syncCamera();
  }

  /** Himmelsfarben, Licht, Nebel und Regen für den aktuellen Zeitpunkt. */
  applyEnvironment(dt) {
    const camera = this.camera;
    const { daylight, skyColor } = this.sky.update(this.time, camera, {
      rain: this.weather.rain,
      thunder: this.weather.thunder,
      cloudsVisible: settings.get('clouds'),
      cloudTime: this.cloudTime,
    });
    const flash = this.weather.flash;
    this.scene.background = skyColor;
    const shared = this.materials.shared;
    shared.uDaylight.value = Math.min(1, daylight + flash * 0.4);
    shared.uFogColor.value.copy(skyColor);
    const viewDistance = Math.max(2, this.chunkManager.renderDistance) * CHUNK_SIZE;
    shared.uFogNear.value = viewDistance * 0.55;
    shared.uFogFar.value = viewDistance * 1.02;
    shared.uAoStrength.value = settings.get('smoothLighting') ? 1 : 0;
    this.rain.update(dt, camera, this.weather.rain);
  }

  syncCamera() {
    this.camera.position.set(this.controller.x, this.controller.y, this.controller.z);
    this.camera.rotation.set(this.controller.pitch, this.controller.yaw, 0);
    const fov = settings.get('fov');
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Wartet, bis der Bereich um den Spawn geladen und vermascht ist. */
  async waitForSpawnArea(onProgress, timeoutMs = 120000) {
    const started = performance.now();
    const cx = worldToChunk(Math.floor(this.controller.x));
    const cz = worldToChunk(Math.floor(this.controller.z));
    const needed = [];
    for (let dz = -SPAWN_RADIUS_CHUNKS; dz <= SPAWN_RADIUS_CHUNKS; dz++) {
      for (let dx = -SPAWN_RADIUS_CHUNKS; dx <= SPAWN_RADIUS_CHUNKS; dx++) {
        if (dx * dx + dz * dz <= SPAWN_RADIUS_CHUNKS * SPAWN_RADIUS_CHUNKS) needed.push([cx + dx, cz + dz]);
      }
    }
    for (;;) {
      this.chunkManager.update(cx, cz);
      this.chunkManager.rebuildMeshes(12);
      let ready = 0;
      for (const [x, z] of needed) {
        const chunk = this.world.getChunk(x, z);
        if (chunk && chunk.meshes && !chunk.dirty) ready++;
      }
      const fraction = ready / needed.length;
      onProgress?.(fraction * 0.95 + 0.05, `Chunks: ${ready} / ${needed.length}`);
      if (ready === needed.length) break;
      if (this.chunkManager.errors.length) throw new Error(this.chunkManager.errors[0]);
      if (performance.now() - started > timeoutMs) throw new Error('Zeitüberschreitung beim Erzeugen der Welt.');
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    this.applyEnvironment(0);
    this.syncCamera();
    onProgress?.(1, 'Fertig');
  }

  /** Speichert veränderte Chunks und den Weltzustand (Zeit, Wetter). */
  async saveChunks() {
    return this.chunkManager.saveModified();
  }

  /** Aktualisiert die Metadaten für den Speicherstand. */
  updateMeta() {
    const pos = this.position;
    this.meta.time = this.time;
    this.meta.weather = this.weather.snapshot();
    this.meta.player = { pos: [pos.x, pos.y - 1.6, pos.z], rot: [this.controller.yaw, this.controller.pitch] };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.chunkManager.dispose();
    this.sky.dispose();
    this.rain.dispose();
    this.materials.opaque.dispose();
    this.materials.transparent.dispose();
    this.scene.clear();
  }
}
