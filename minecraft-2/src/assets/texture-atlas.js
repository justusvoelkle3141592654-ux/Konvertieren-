// Texture-Atlas: alle Blocktexturen in einer Canvas-Textur.
//  - NearestFilter, keine Mipmaps → pixelgenaue Darstellung
//  - Animierte Texturen (Wasser, Lava, Feuer, Portal) werden über die .mcmeta-Daten
//    bzw. die Platzhalter-Animation Frame für Frame in ihre Kachel gezeichnet.
import * as THREE from 'three';
import { fetchLocalImage, fetchMcmeta } from './texture-loader.js';
import { createFallbackTexture, createMissingTexture, TILE } from './fallback-textures.js';

const MISSING = 'missing';
const TICK_MS = 50;

export class TextureAtlas {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.texture = null;
    this.size = 0;
    this.cols = 0;
    this.tiles = new Map(); // Name → { x, y }
    this.animations = [];
    this.stats = { local: 0, fallback: 0, animated: 0 };
  }

  /** Baut den Atlas für die übergebenen Texturnamen. */
  async build(names, onProgress) {
    const unique = [...new Set([...names, MISSING])];
    const count = unique.length;
    this.cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / this.cols);
    let size = 64;
    while (size < Math.max(this.cols, rows) * TILE) size *= 2;
    this.size = size;

    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < count; i++) {
      const name = unique[i];
      const x = (i % this.cols) * TILE;
      const y = Math.floor(i / this.cols) * TILE;
      this.tiles.set(name, { x, y });
      await this.fillTile(name, x, y);
      if (onProgress) onProgress((i + 1) / count);
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;
    return this.texture;
  }

  async fillTile(name, x, y) {
    const local = name === MISSING ? null : await fetchLocalImage(name);
    if (local) {
      const s = local.width;
      const frames = Math.max(1, Math.floor(local.height / s));
      this.ctx.drawImage(local, 0, 0, s, s, x, y, TILE, TILE);
      this.stats.local++;
      if (frames > 1) {
        const meta = (await fetchMcmeta(name))?.animation ?? {};
        this.addAnimation({ x, y, source: local, srcSize: s, frames, frametime: meta.frametime ?? 1, sequence: meta.frames ?? null });
      }
      return;
    }

    const fallback = name === MISSING ? createMissingTexture() : createFallbackTexture(name);
    this.stats.fallback++;
    this.ctx.drawImage(fallback.canvas, 0, 0, TILE, TILE, x, y, TILE, TILE);
    if (fallback.frames > 1) {
      this.addAnimation({ x, y, source: fallback.canvas, srcSize: TILE, frames: fallback.frames, frametime: fallback.frametime, sequence: null });
    }
  }

  addAnimation(anim) {
    // Reihenfolge der Frames: explizite Liste aus .mcmeta oder 0..n-1.
    const sequence = anim.sequence
      ? anim.sequence.map((f) => (typeof f === 'number' ? { index: f, time: anim.frametime } : { index: f.index, time: f.time ?? anim.frametime }))
      : Array.from({ length: anim.frames }, (_, i) => ({ index: i, time: anim.frametime }));
    const total = sequence.reduce((sum, f) => sum + Math.max(1, f.time), 0);
    this.animations.push({ ...anim, sequence, total, shown: -1 });
    this.stats.animated++;
  }

  /** Aktualisiert animierte Kacheln. Gibt true zurück, wenn sich etwas geändert hat. */
  update(nowMs) {
    if (!this.animations.length || !this.ctx) return false;
    const tick = Math.floor(nowMs / TICK_MS);
    let changed = false;
    for (const anim of this.animations) {
      let t = tick % anim.total;
      let frame = anim.sequence[0].index;
      for (const step of anim.sequence) {
        const span = Math.max(1, step.time);
        if (t < span) {
          frame = step.index;
          break;
        }
        t -= span;
      }
      const key = frame;
      if (anim.shown === key) continue;
      anim.shown = key;
      this.ctx.clearRect(anim.x, anim.y, TILE, TILE);
      this.ctx.drawImage(anim.source, 0, frame * anim.srcSize, anim.srcSize, anim.srcSize, anim.x, anim.y, TILE, TILE);
      changed = true;
    }
    if (changed && this.texture) this.texture.needsUpdate = true;
    return changed;
  }

  /** UV-Rechteck einer Kachel als [u0, v0, u1, v1] (flipY = false, Ursprung oben links). */
  uv(name) {
    const tile = this.tiles.get(name) ?? this.tiles.get(MISSING);
    const s = this.size;
    // Um einen halben Texel nach innen, damit nächstes Sampling nie in die Nachbarkachel greift
    const inset = 0.5;
    return [(tile.x + inset) / s, (tile.y + inset) / s, (tile.x + TILE - inset) / s, (tile.y + TILE - inset) / s];
  }

  dispose() {
    this.texture?.dispose();
    this.texture = null;
    this.canvas = null;
    this.ctx = null;
    this.animations = [];
    this.tiles.clear();
  }
}
