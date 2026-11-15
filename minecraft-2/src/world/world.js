// Welt einer Dimension: verwaltet geladene Chunks und den Blockzugriff.
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { BLOCKS } from './blocks.js';
import { Chunk, chunkIndex, chunkKey } from './chunk.js';

export function worldToChunk(v) {
  return Math.floor(v / CHUNK_SIZE);
}

export class World {
  /**
   * @param {{ dimension: string, seed: number, onChunkChanged?: (chunk: Chunk) => void }} options
   */
  constructor({ dimension = 'overworld', seed = 0, onChunkChanged = null } = {}) {
    this.dimension = dimension;
    this.seed = seed;
    this.chunks = new Map();
    this.onChunkChanged = onChunkChanged;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) ?? null;
  }

  addChunk(chunk) {
    this.chunks.set(chunk.key, chunk);
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

  /** Setzt Block und Metadaten, markiert betroffene Chunks für ein neues Mesh. */
  setBlock(x, y, z, id, metaValue = 0) {
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return false;
    const cx = worldToChunk(x);
    const cz = worldToChunk(z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const lx = mod16(x);
    const lz = mod16(z);
    const i = chunkIndex(lx, y, lz);
    if (chunk.blocks[i] === id && chunk.meta[i] === metaValue) return false;
    chunk.blocks[i] = id;
    chunk.meta[i] = metaValue;
    chunk.modified = true;
    this.touch(chunk);
    // Am Chunk-Rand betrifft die Änderung auch die Nachbarn
    if (lx === 0) this.touch(this.getChunk(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.touch(this.getChunk(cx + 1, cz));
    if (lz === 0) this.touch(this.getChunk(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.touch(this.getChunk(cx, cz + 1));
    return true;
  }

  touch(chunk) {
    if (!chunk) return;
    chunk.dirty = true;
    if (this.onChunkChanged) this.onChunkChanged(chunk);
  }

  isSolid(x, y, z) {
    return BLOCKS[this.getBlock(x, y, z)]?.solid === true;
  }
}

export function mod16(v) {
  return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}
