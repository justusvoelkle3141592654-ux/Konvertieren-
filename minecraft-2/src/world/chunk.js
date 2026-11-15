// Chunk-Datenstruktur: 16 × 384 × 16 Blöcke, flache Typed Arrays.
// Index: ((y − WORLD_MIN_Y) · 16 + z) · 16 + x
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_MIN_Y } from '../config.js';

export function chunkIndex(lx, y, lz) {
  return ((y - WORLD_MIN_Y) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

/** Eindeutiger numerischer Schlüssel für Chunk-Koordinaten. */
export function chunkKey(cx, cz) {
  return (cx + 32768) * 65536 + (cz + 32768);
}

export class Chunk {
  /**
   * @param {number} cx Chunk-X
   * @param {number} cz Chunk-Z
   * @param {object} data { blocks, meta, light, heightmap, biomes, blockEntities, modified }
   */
  constructor(cx, cz, data) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = data.blocks ?? new Uint8Array(CHUNK_VOLUME);
    this.meta = data.meta ?? new Uint8Array(CHUNK_VOLUME);
    this.light = data.light ?? new Uint8Array(CHUNK_VOLUME);
    this.heightmap = data.heightmap ?? new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    this.biomes = data.biomes ?? new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    this.blockEntities = new Map(data.blockEntities ?? []);
    this.modified = Boolean(data.modified);
    this.dirty = true;
    this.version = 0;
    this.meshes = null;
  }

  get key() {
    return chunkKey(this.cx, this.cz);
  }

  get originX() {
    return this.cx * CHUNK_SIZE;
  }

  get originZ() {
    return this.cz * CHUNK_SIZE;
  }

  /** Eintrag für IndexedDB (nur veränderte Chunks werden gespeichert). */
  serialize(worldId, dimension) {
    return {
      key: `${worldId}|${dimension}|${this.cx}|${this.cz}`,
      worldId,
      dimension,
      cx: this.cx,
      cz: this.cz,
      blocks: this.blocks,
      meta: this.meta,
      light: this.light,
      heightmap: this.heightmap,
      biomes: this.biomes,
      blockEntities: [...this.blockEntities.entries()],
    };
  }
}
