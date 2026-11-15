// Chunk-Erzeugung (rein, läuft im Worker und in Tests). Keine Browser-APIs.
//  - "default": Oberwelt mit Biomen, Höhlen, Erzen und Vegetation
//  - "flat":    Flachwelt (Grasblock bei y = 0)
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { B } from './blocks.js';
import { chunkIndex } from './chunk.js';
import { createOverworldGenerator, placeOres } from './gen/overworld.js';
import { placeFeatures } from './gen/features.js';

const generators = new Map();

/** Generator je Seed (wenige Einträge, damit der Speicher begrenzt bleibt). */
function overworldFor(seed) {
  let gen = generators.get(seed);
  if (!gen) {
    if (generators.size > 2) generators.clear();
    gen = createOverworldGenerator(seed);
    generators.set(seed, gen);
  }
  return gen;
}

function emptyChunk() {
  return {
    blocks: new Uint8Array(CHUNK_VOLUME),
    meta: new Uint8Array(CHUNK_VOLUME),
    light: new Uint8Array(CHUNK_VOLUME),
    heightmap: new Int16Array(CHUNK_SIZE * CHUNK_SIZE),
    biomes: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
    blockEntities: [],
  };
}

function generateFlat(cx, cz) {
  const out = emptyChunk();
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      out.biomes[lz * CHUNK_SIZE + lx] = 1;
      out.heightmap[lz * CHUNK_SIZE + lx] = 0;
      for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
        let id = B.air;
        if (y === WORLD_MIN_Y) id = B.bedrock;
        else if (y < -2) id = B.stone;
        else if (y < 0) id = B.dirt;
        else if (y === 0) id = B.grass_block;
        const i = chunkIndex(lx, y, lz);
        out.blocks[i] = id;
        out.light[i] = (y > 0 ? 15 : 0) << 4;
      }
    }
  }
  return out;
}

function generateOverworld(seed, cx, cz) {
  const gen = overworldFor(seed);
  const out = emptyChunk();
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;
      const col = gen.column(wx, wz);
      const idx = lz * CHUNK_SIZE + lx;
      out.biomes[idx] = col.biome;
      out.heightmap[idx] = col.height;
      gen.fillColumn(out.blocks, out.meta, { lx, lz }, wx, wz, col);
    }
  }
  placeOres(gen, out.blocks, out.meta, cx, cz);
  placeFeatures(gen, out.blocks, out.meta, cx, cz);
  return out;
}

/**
 * Erzeugt die Blockdaten eines Chunks (Licht wird danach im Worker berechnet).
 * @param {{ cx: number, cz: number, seed: number, dimension?: string, generator?: string }} params
 */
export function generateChunkData({ cx, cz, seed = 0, dimension = 'overworld', generator = 'default' }) {
  if (generator === 'flat') return generateFlat(cx, cz);
  if (dimension === 'overworld') return generateOverworld(seed, cx, cz);
  throw new Error(`Die Dimension „${dimension}“ ist noch nicht verfügbar.`);
}
