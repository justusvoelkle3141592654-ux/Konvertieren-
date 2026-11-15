// Vegetation und Bäume. Jede Spalte entscheidet unabhängig (Seed + Weltkoordinate),
// welche Pflanze oder welcher Baum dort entsteht. Die Blöcke eines Baums können über
// Chunk-Grenzen reichen; jeder Chunk übernimmt daher alle Entscheidungen seiner
// Nachbarn und schreibt nur die Blöcke, die in ihn hineinfallen.
import { CHUNK_SIZE, SEA_LEVEL, WORLD_MAX_Y, WORLD_MIN_Y } from '../../config.js';
import { B, blockIdByName, BLOCK_BY_NAME } from '../blocks.js';
import { biomeDef } from '../biomes.js';
import { chunkIndex } from '../chunk.js';
import { hash2, mulberry32 } from '../../engine/random.js';
import { columnRandom } from './overworld.js';

const PLANT_TABLE = [
  ['short_grass', 0.55],
  ['fern', 0.15],
  ['dandelion', 0.09],
  ['poppy', 0.08],
  ['cornflower', 0.04],
  ['allium', 0.03],
  ['azure_bluet', 0.03],
  ['oxeye_daisy', 0.03],
];

const REPLACEABLE_PLANTS = new Set(
  ['short_grass', 'fern', 'dead_bush', 'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'red_mushroom', 'brown_mushroom', 'snow']
    .map((name) => BLOCK_BY_NAME.get(name)?.id)
    .filter((id) => id !== undefined)
);

/** Wählt eine Pflanze nach Gewichten. */
function pickPlant(r) {
  let acc = 0;
  for (const [name, weight] of PLANT_TABLE) {
    acc += weight;
    if (r < acc) return blockIdByName(name);
  }
  return blockIdByName('short_grass');
}

/** Ein Baum als Liste von Schreibvorgängen relativ zur Basis. */
function treeShape(type, rnd, base) {
  const writes = [];
  const log = blockIdByName(`${type}_log`);
  const leaves = blockIdByName(`${type}_leaves`);
  const leaf = (dx, dy, dz) => writes.push([base[0] + dx, base[1] + dy, base[2] + dz, leaves, 0, 'leaf']);
  const trunk = (height) => {
    for (let i = 0; i < height; i++) writes.push([base[0], base[1] + i, base[2], log, 0, 'log']);
  };
  const disc = (y, radius, cornerChance) => {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
        if (corner && rnd() < cornerChance) continue;
        if (dx * dx + dz * dz > radius * radius + 1) continue;
        leaf(dx, y, dz);
      }
    }
  };

  switch (type) {
    case 'birch': {
      const h = 5 + Math.floor(rnd() * 3);
      trunk(h);
      disc(h - 2, 2, 0.5); disc(h - 1, 2, 0.5); disc(h, 2, 0.6); disc(h + 1, 1, 0.3);
      break;
    }
    case 'spruce': {
      const h = 6 + Math.floor(rnd() * 4);
      trunk(h);
      for (let y = 2; y <= h + 1; y++) {
        const radius = Math.min(2, 1 + Math.floor((h + 1 - y) / 3));
        if (y < h + 1) disc(y, radius, 0.4);
      }
      leaf(0, h + 1, 0);
      leaf(0, h + 2, 0);
      break;
    }
    case 'jungle': {
      const h = 7 + Math.floor(rnd() * 6);
      trunk(h);
      disc(h - 3, 3, 0.5); disc(h - 2, 3, 0.4); disc(h - 1, 2, 0.3); disc(h, 2, 0.3); disc(h + 1, 1, 0.2);
      leaf(0, h + 2, 0);
      break;
    }
    case 'acacia': {
      const h = 5 + Math.floor(rnd() * 2);
      trunk(h);
      disc(h, 2, 0.7); disc(h + 1, 1, 0.4);
      break;
    }
    case 'dark_oak': {
      const h = 5 + Math.floor(rnd() * 3);
      trunk(h);
      disc(h - 2, 3, 0.45); disc(h - 1, 3, 0.45); disc(h, 2, 0.4); disc(h + 1, 2, 0.5);
      break;
    }
    default: { // oak
      const h = 4 + Math.floor(rnd() * 3);
      trunk(h);
      disc(h - 2, 2, 0.5); disc(h - 1, 2, 0.5); disc(h, 2, 0.6); disc(h + 1, 1, 0.3);
    }
  }
  return writes;
}

/**
 * Bestimmt das Element an einer Spalte: Baum, Pflanze, Kaktus, Zuckerrohr …
 * @returns {{ writes: Array<[number, number, number, number, number, string]> } | null}
 */
export function columnFeature(gen, wx, wz) {
  const col = gen.column(wx, wz);
  if (col.height < SEA_LEVEL || col.height >= WORLD_MAX_Y - 24) return null;
  const def = biomeDef(col.biome);
  const seed = gen.seed;
  const y = col.height + 1;
  const r = columnRandom(seed, wx, wz, 0x1111);

  if (def.top === 'grass_block' || def.top === 'mycelium' || def.top === 'snow_block') {
    // Bäume: Dichten je Art werden hintereinander gestapelt
    let acc = 0;
    for (const [tree, density] of def.trees) {
      acc += density;
      if (r < acc) {
        const rnd = mulberry32(hash2(seed ^ 0x7777, hash2(wx, wz)));
        return { writes: treeShape(tree, rnd, [wx, y, wz]) };
      }
    }
    const r2 = columnRandom(seed, wx, wz, 0x2222);
    if (def.mushrooms && r2 < def.mushrooms) {
      return { writes: [[wx, y, wz, blockIdByName(columnRandom(seed, wx, wz, 0x3333) < 0.5 ? 'red_mushroom' : 'brown_mushroom'), 0, 'plant']] };
    }
    const r3 = columnRandom(seed, wx, wz, 0x4444);
    if (def.snowLayers && r3 < def.snowLayers && col.height > SEA_LEVEL) {
      return { writes: [[wx, y, wz, B.snow, 0, 'plant']] };
    }
    const r4 = columnRandom(seed, wx, wz, 0x5555);
    if (r4 < def.plants) {
      return { writes: [[wx, y, wz, pickPlant(columnRandom(seed, wx, wz, 0x6666)), 0, 'plant']] };
    }
    return null;
  }

  if (def.top === 'sand' && col.height > SEA_LEVEL) {
    if (def.cactus && r < def.cactus) {
      const tall = 1 + Math.floor(columnRandom(seed, wx, wz, 0x7777) * 3);
      const writes = [];
      for (let i = 0; i < tall; i++) writes.push([wx, y + i, wz, B.cactus, 0, 'plant']);
      return { writes };
    }
    if (def.deadBush && r < def.cactus + def.deadBush) {
      return { writes: [[wx, y, wz, B.dead_bush, 0, 'plant']] };
    }
  }

  // Zuckerrohr am Wasserrand (Sand, Höhe knapp über dem Meeresspiegel)
  if (col.height >= SEA_LEVEL && col.height <= SEA_LEVEL + 1 && def.top === 'sand') {
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => gen.column(wx + dx, wz + dz).height < SEA_LEVEL);
    if (nearWater && columnRandom(seed, wx, wz, 0x8888) < 0.25) {
      const tall = 1 + Math.floor(columnRandom(seed, wx, wz, 0x9999) * 3);
      const writes = [];
      for (let i = 0; i < tall; i++) writes.push([wx, y + i, wz, B.sugar_cane, 0, 'plant']);
      return { writes };
    }
  }
  return null;
}

/**
 * Schreibt alle Elemente der Nachbarschaft, die in den Chunk (cx, cz) hineinreichen.
 * Reihenfolge der Ursprünge ist fest, damit Chunks an ihren Grenzen übereinstimmen.
 */
export function placeFeatures(gen, blocks, meta, cx, cz) {
  const minX = cx * CHUNK_SIZE;
  const minZ = cz * CHUNK_SIZE;
  for (let oz = cz - 1; oz <= cz + 1; oz++) {
    for (let ox = cx - 1; ox <= cx + 1; ox++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = ox * CHUNK_SIZE + lx;
          const wz = oz * CHUNK_SIZE + lz;
          const feature = columnFeature(gen, wx, wz);
          if (!feature) continue;
          for (const [x, y, z, id, m, mode] of feature.writes) {
            if (x < minX || x >= minX + CHUNK_SIZE || z < minZ || z >= minZ + CHUNK_SIZE) continue;
            if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) continue;
            const i = chunkIndex(x - minX, y, z - minZ);
            const current = blocks[i];
            if (mode === 'log') {
              if (current === 0 || REPLACEABLE_PLANTS.has(current) || isLeaf(current)) {
                blocks[i] = id;
                meta[i] = m;
              }
            } else if (mode === 'leaf') {
              if (current === 0 || REPLACEABLE_PLANTS.has(current)) {
                blocks[i] = id;
                meta[i] = m;
              }
            } else if (current === 0) {
              blocks[i] = id;
              meta[i] = m;
            }
          }
        }
      }
    }
  }
}

const LEAF_IDS = new Set(['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak'].map((t) => blockIdByName(`${t}_leaves`)));
function isLeaf(id) {
  return LEAF_IDS.has(id);
}

