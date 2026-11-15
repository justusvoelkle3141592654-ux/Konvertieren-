// Reine Chunk-Erzeugung (läuft im Worker und in Tests). Keine Browser-APIs.
// Phase 1: Flachwelt (Superflat). Die echte Oberwelt folgt in Phase 2.
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { B } from './blocks.js';
import { chunkIndex } from './chunk.js';

/** Schichtung der Flachwelt: Bedrock, Stein, Erde, Grasblock (Oberfläche bei y = 0). */
function flatBlockAt(y) {
  if (y === WORLD_MIN_Y) return B.bedrock;
  if (y < -2) return B.stone;
  if (y < 0) return B.dirt;
  if (y === 0) return B.grass_block;
  return B.air;
}

/**
 * Erzeugt Blockdaten für einen Chunk.
 * @returns {{ blocks: Uint8Array, meta: Uint8Array, light: Uint8Array, heightmap: Int16Array, biomes: Uint8Array, blockEntities: Array }}
 */
export function generateChunkData({ cx, cz }) {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  const meta = new Uint8Array(CHUNK_VOLUME);
  const light = new Uint8Array(CHUNK_VOLUME);
  const heightmap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(1);

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      heightmap[lz * CHUNK_SIZE + lx] = 0;
      for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
        const id = flatBlockAt(y);
        const i = chunkIndex(lx, y, lz);
        blocks[i] = id;
        // Himmelslicht: volle Stufe über der Oberfläche
        light[i] = (y > 0 ? 15 : 0) << 4;
      }
    }
  }
  return { blocks, meta, light, heightmap, biomes, blockEntities: [] };
}
