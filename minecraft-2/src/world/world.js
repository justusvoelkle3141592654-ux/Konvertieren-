// Welt einer Dimension (Hauptthread): geladene Chunks, Blockzugriff, Licht und geplante Updates.
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { BLOCKS } from './blocks.js';
import { Chunk, chunkIndex, chunkKey } from './chunk.js';
import { refreshLightAt, stitchChunkLight, WorldAccess } from './light.js';

export function worldToChunk(v) {
  return Math.floor(v / CHUNK_SIZE);
}

export function mod16(v) {
  return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

const NEIGHBOR_DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class World {
  /**
   * @param {{ dimension?: string, seed?: number, onChunkChanged?: (chunk: Chunk) => void }} options
   */
  constructor({ dimension = 'overworld', seed = 0, onChunkChanged = null } = {}) {
    this.dimension = dimension;
    this.seed = seed;
    this.chunks = new Map();
    this.onChunkChanged = onChunkChanged;
    this.access = new WorldAccess(this);
    this.tickCount = 0;
    this.scheduled = new Map(); // Tick → Map<Schlüssel, {x,y,z}>
    this.scheduledKeys = new Map(); // Schlüssel → spätester Auslösetick
    this.pendingLimit = 6000;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) ?? null;
  }

  /** Nimmt einen Chunk auf und verbindet sein Licht mit den Nachbarn. */
  addChunk(chunk) {
    this.chunks.set(chunk.key, chunk);
    stitchChunkLight(this.access, chunk, (cx, cz) => this.getChunk(cx, cz));
    this.touch(chunk);
  }

  removeChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    this.chunks.delete(key);
    return chunk ?? null;
  }

  /** Blockkennung an Weltkoordinaten (Luft für nicht geladene Bereiche). */
  getBlock(x, y, z) {
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return 0;
    const chunk = this.getChunk(worldToChunk(x), worldToChunk(z));
    if (!chunk) return 0;
    return chunk.blocks[chunkIndex(mod16(x), y, mod16(z))];
  }

  getMeta(x, y, z) {
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return 0;
    const chunk = this.getChunk(worldToChunk(x), worldToChunk(z));
    if (!chunk) return 0;
    return chunk.meta[chunkIndex(mod16(x), y, mod16(z))];
  }

  /** Blocklicht bzw. Himmelslicht an einer Position (0–15). */
  getLightLevel(x, y, z, sky = false) {
    return this.access.getLevel(sky ? 1 : 0, x, y, z);
  }

  /**
   * Setzt Block und Metadaten. Licht, Meshes und Nachbar-Updates werden angepasst.
   * @returns {boolean} true, wenn sich etwas geändert hat
   */
  setBlock(x, y, z, id, metaValue = 0, { light = true, notify = true } = {}) {
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return false;
    const cx = worldToChunk(x);
    const cz = worldToChunk(z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const lx = mod16(x);
    const lz = mod16(z);
    const i = chunkIndex(lx, y, lz);
    const oldId = chunk.blocks[i];
    if (oldId === id && chunk.meta[i] === metaValue) return false;
    chunk.blocks[i] = id;
    chunk.meta[i] = metaValue;
    chunk.modified = true;
    this.touch(chunk);
    if (lx === 0) this.touch(this.getChunk(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.touch(this.getChunk(cx + 1, cz));
    if (lz === 0) this.touch(this.getChunk(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.touch(this.getChunk(cx, cz + 1));
    if (light) refreshLightAt(this.access, x, y, z);
    if (notify) {
      this.scheduleUpdate(x, y, z, 1);
      for (const [dx, dy, dz] of NEIGHBOR_DIRS) this.scheduleUpdate(x + dx, y + dy, z + dz, 1);
    }
    return true;
  }

  touch(chunk) {
    if (!chunk) return;
    chunk.version++;
    if (!chunk.dirty) {
      chunk.dirty = true;
      if (this.onChunkChanged) this.onChunkChanged(chunk);
    }
  }

  /** Wird vom Lichtsystem für jede geänderte Lichtstufe aufgerufen. */
  touchLight(chunk) {
    this.touch(chunk);
  }

  isSolid(x, y, z) {
    return BLOCKS[this.getBlock(x, y, z)]?.solid === true;
  }

  /** Plant ein Update der Zelle für `delay` Ticks (dedupliziert). */
  scheduleUpdate(x, y, z, delay) {
    const due = this.tickCount + Math.max(1, delay);
    const key = `${x},${y},${z}`;
    const existing = this.scheduledKeys.get(key);
    if (existing !== undefined && existing <= due) return;
    this.scheduledKeys.set(key, due);
    let bucket = this.scheduled.get(due);
    if (!bucket) {
      bucket = new Map();
      this.scheduled.set(due, bucket);
    }
    bucket.set(key, { x, y, z });
  }

  /**
   * Führt alle fälligen Updates aus. Wird einmal pro Spiel-Tick aufgerufen.
   * @param {(world: World, x: number, y: number, z: number) => void} handler
   */
  processScheduled(handler) {
    this.tickCount++;
    const bucket = this.scheduled.get(this.tickCount);
    if (!bucket) return 0;
    this.scheduled.delete(this.tickCount);
    let done = 0;
    for (const [key, pos] of bucket) {
      this.scheduledKeys.delete(key);
      if (done >= this.pendingLimit) {
        // Überlauf: im nächsten Tick weiterverarbeiten statt verwerfen
        this.scheduleUpdate(pos.x, pos.y, pos.z, 1);
        continue;
      }
      if (!this.getChunk(worldToChunk(pos.x), worldToChunk(pos.z))) continue;
      handler(this, pos.x, pos.y, pos.z);
      done++;
    }
    return done;
  }
}
