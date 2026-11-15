// Oberwelt-Generator (rein, läuft im Worker): Höhe und Biom je Spalte, Untergrund,
// Höhlen, Schluchten, Erze und Vegetation. Alle Entscheidungen hängen nur von Seed und
// Weltkoordinaten ab – dadurch passen Chunks an ihren Grenzen zusammen.
import { CHUNK_SIZE, SEA_LEVEL, WORLD_MAX_Y, WORLD_MIN_Y } from '../../config.js';
import { B, blockIdByName } from '../blocks.js';
import { biomeDef, pickBiome } from '../biomes.js';
import { chunkIndex } from '../chunk.js';
import { clamp, createNoise, smoothstep } from '../noise.js';
import { hash2, hashToUnit, mulberry32 } from '../../engine/random.js';

const LAVA_LEVEL = -54;
const RAVINE_BOTTOM = 12;

/** Erzeugt den Generator für einen Seed (Noise-Felder werden einmal aufgebaut). */
export function createOverworldGenerator(seed) {
  const seedInt = seed | 0;
  const continentNoise = createNoise(seedInt ^ 0x1001);
  const hillNoise = createNoise(seedInt ^ 0x2002);
  const ridgeNoise = createNoise(seedInt ^ 0x3003);
  const detailNoise = createNoise(seedInt ^ 0x4004);
  const tempNoise = createNoise(seedInt ^ 0x5005);
  const humidNoise = createNoise(seedInt ^ 0x6006);
  const mushroomNoise = createNoise(seedInt ^ 0x7007);
  const caveCheese = createNoise(seedInt ^ 0x8008);
  const caveTunnelA = createNoise(seedInt ^ 0x9009);
  const caveTunnelB = createNoise(seedInt ^ 0xa00a);
  const ravineNoise = createNoise(seedInt ^ 0xb00b);
  const blobNoise = createNoise(seedInt ^ 0xc00c);
  const riverNoise = createNoise(seedInt ^ 0xd00d);
  const lakeNoise = createNoise(seedInt ^ 0xe00e);

  const columnCache = new Map();

  /** Spaltendaten: Höhe, Biom und Klima an einer Weltposition. */
  function column(wx, wz) {
    const key = (wx + 1000000) * 2000003 + (wz + 1000000);
    const cached = columnCache.get(key);
    if (cached) return cached;

    const continent = continentNoise.fbm2(wx / 900, wz / 900, 4, 2, 0.5);
    const hill = hillNoise.fbm2(wx / 140, wz / 140, 4, 2, 0.5);
    const detail = detailNoise.fbm2(wx / 30, wz / 30, 2, 2, 0.5);
    const ridgeRaw = ridgeNoise.fbm2(wx / 360, wz / 360, 3, 2, 0.5);
    const ridge = 1 - Math.abs(ridgeRaw);
    const temp = tempNoise.fbm2(wx / 700 + 300, wz / 700 - 300, 2, 2, 0.5);
    const humid = humidNoise.fbm2(wx / 650 - 400, wz / 650 + 400, 2, 2, 0.5);
    const mush = mushroomNoise.fbm2(wx / 520 + 900, wz / 520 + 200, 2, 2, 0.5);

    const landBlend = smoothstep(-0.18, 0.06, continent);
    const baseLand = SEA_LEVEL + 4 + hill * 9 + detail * 2;
    const mountainMask = smoothstep(0.08, 0.45, continent) * smoothstep(0.5, 0.85, ridge);
    const ocean = SEA_LEVEL - 22 + hill * 4 + detail;
    let height = ocean + (baseLand + mountainMask * 80 - ocean) * landBlend;
    height = Math.round(clamp(height, WORLD_MIN_Y + 8, WORLD_MAX_Y - 80));

    // Flüsse: schmale Rinnen im Flachland, deren Sohle unter dem Meeresspiegel liegt
    const riverN = Math.abs(riverNoise.fbm2(wx / 420, wz / 420, 2, 2, 0.5));
    if (landBlend > 0.4 && height > SEA_LEVEL - 3 && height < SEA_LEVEL + 14 && riverN < 0.022) {
      height = SEA_LEVEL - 2;
    }
    // Seen: runde Becken im Flachland, mit Wasser bis zum Meeresspiegel gefüllt
    const lakeN = lakeNoise.fbm2(wx / 240, wz / 240, 2, 2, 0.5);
    if (landBlend > 0.5 && height > SEA_LEVEL - 2 && height < SEA_LEVEL + 10 && lakeN > 0.72) {
      height = SEA_LEVEL - 3;
    }

    const biome = pickBiome({ continent, temp, humid, height, seaLevel: SEA_LEVEL, mushroomNoise: mush });
    const frozen = temp < -0.45 && height <= SEA_LEVEL;
    const result = { height, biome, temp, humid, continent, frozen, ravine: 0 };
    if (columnCache.size > 40000) columnCache.clear();
    columnCache.set(key, result);
    return result;
  }

  /** Höhlen: Schwammhöhlen plus Tunnel aus dem Schnitt zweier Rauschfelder. */
  function isCave(wx, y, wz) {
    if (caveCheese.noise3(wx / 34, y / 20, wz / 34) > 0.62) return true;
    const a = caveTunnelA.noise3(wx / 48, y / 26, wz / 48);
    if (Math.abs(a) > 0.085) return false;
    const b = caveTunnelB.noise3(wx / 48 + 77, y / 26, wz / 48 - 31);
    return Math.abs(b) < 0.085;
  }

  /** Schlucht: schmaler Schlitz im Rauschen, der vom Gelände bis zur Schluchtsohle reicht. */
  function isRavine(wx, wz) {
    const r = Math.abs(ravineNoise.fbm2(wx / 240, wz / 240, 2, 2, 0.5));
    const width = 0.018 + 0.012 * (ravineNoise.noise2(wx / 90, wz / 90) + 1) * 0.5;
    return r < width;
  }

  /** Gestein im Untergrund: Tiefenschiefer ab y=0, Diorit/Andesit als Adern. */
  function rockAt(wx, y, wz) {
    const n = blobNoise.noise3(wx / 22, y / 22, wz / 22);
    if (n > 0.6) return B.andesite;
    if (n < -0.6) return B.diorite;
    return y < 0 ? B.deepslate : B.stone;
  }

  /** Füllt eine Spalte des Chunks mit Blöcken (Wasser, Gelände, Luft). */
  function fillColumn(blocks, meta, idx, wx, wz, col) {
    const h = col.height;
    const def = biomeDef(col.biome);
    const topId = blockIdByName(def.top);
    const fillerId = blockIdByName(def.filler);
    const depth = 3 + (hash2(wx, wz) & 1);
    const underwater = h < SEA_LEVEL;
    // Flussbetten und Seeböden: stellenweise Ton statt Sand
    const bedClay = underwater && h > SEA_LEVEL - 4 && (hash2(wx, wz) & 7) < 3;
    const topIdFinal = h > 140 && h < 150 ? B.stone : h >= 150 ? B.snow_block : topId;
    const ravine = h > SEA_LEVEL && isRavine(wx, wz);

    for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
      let id = 0;
      if (y === WORLD_MIN_Y) id = B.bedrock;
      else if (y < WORLD_MIN_Y + 5 && hashToUnit(hash2(wx * 31 + y, wz)) < (WORLD_MIN_Y + 5 - y) / 5) id = B.bedrock;
      else if (y <= h) {
        if (y === h) id = bedClay ? B.clay : underwater ? blockIdByName(def.top) : topIdFinal;
        else if (y > h - depth) id = fillerId;
        else id = rockAt(wx, y, wz);
        if (y < h - 3 && isCave(wx, y, wz)) id = y <= LAVA_LEVEL ? B.lava : 0;
        if (ravine && y > RAVINE_BOTTOM && y < h) id = 0;
      } else if (y <= SEA_LEVEL) {
        id = col.frozen && y === SEA_LEVEL ? B.ice : B.water;
      }
      if (id !== 0) blocks[chunkIndex(idx.lx, y, idx.lz)] = id;
    }
    return ravine;
  }

  return { seed: seedInt, column, isCave, fillColumn, rockAt, mushroomNoise, humidNoise, tempNoise };
}

/** Zufallswert in [0, 1) für eine Spalte und einen Zweck (Salz). */
export function columnRandom(seed, wx, wz, salt) {
  return hashToUnit(hash2(hash2(seed ^ salt, wx), wz));
}

/** Erze: Anzahl je Chunk, Höhenbereich, Adergröße. */
const ORE_SPECS = [
  { ore: 'coal_ore', deep: 'deepslate_coal_ore', count: 20, min: 0, max: 320, peak: 96, size: 7 },
  { ore: 'copper_ore', deep: 'deepslate_copper_ore', count: 6, min: -16, max: 112, peak: 48, size: 9 },
  { ore: 'iron_ore', deep: 'deepslate_iron_ore', count: 10, min: -64, max: 72, peak: 16, size: 7 },
  { ore: 'gold_ore', deep: 'deepslate_gold_ore', count: 2, min: -64, max: 32, peak: -16, size: 8 },
  { ore: 'redstone_ore', deep: 'deepslate_redstone_ore', count: 6, min: -64, max: 16, peak: -40, size: 7 },
  { ore: 'lapis_ore', deep: 'deepslate_lapis_ore', count: 2, min: -32, max: 32, peak: 0, size: 5 },
  { ore: 'diamond_ore', deep: 'deepslate_diamond_ore', count: 1, min: -64, max: 16, peak: -58, size: 4 },
  { ore: 'emerald_ore', deep: 'deepslate_emerald_ore', count: 1, min: 4, max: 32, peak: 16, size: 2, chance: 0.25 },
];

const STONE_LIKE = new Set([B.stone, B.deepslate, B.andesite, B.diorite, B.granite]);

/** Platziert Erzadern eines Chunks (nur in Gestein). */
export function placeOres(gen, blocks, meta, cx, cz) {
  const rnd = mulberry32(hash2(gen.seed ^ 0x0e0e, hash2(cx, cz)));
  for (const spec of ORE_SPECS) {
    for (let k = 0; k < spec.count; k++) {
      if (spec.chance !== undefined && rnd() > spec.chance) continue;
      // Höhe: dreieckige Verteilung um den Schwerpunkt (peak)
      const y = Math.round(spec.peak + ((rnd() + rnd()) - 1) * (spec.max - spec.min) / 2);
      const yy = clamp(y, spec.min, spec.max);
      const x0 = cx * CHUNK_SIZE + Math.floor(rnd() * CHUNK_SIZE);
      const z0 = cz * CHUNK_SIZE + Math.floor(rnd() * CHUNK_SIZE);
      const radius = spec.size / 4 + rnd() * 1.4;
      placeVein(gen, blocks, meta, cx, cz, x0, yy, z0, radius, spec);
    }
  }
}

function placeVein(gen, blocks, meta, cx, cz, x0, y0, z0, radius, spec) {
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.hypot(dx, dy * 1.2, dz);
        if (dist > radius) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        const z = z0 + dz;
        if (x < cx * CHUNK_SIZE || x >= (cx + 1) * CHUNK_SIZE || z < cz * CHUNK_SIZE || z >= (cz + 1) * CHUNK_SIZE) continue;
        if (y < WORLD_MIN_Y + 1 || y > WORLD_MAX_Y) continue;
        const lx = x - cx * CHUNK_SIZE;
        const lz = z - cz * CHUNK_SIZE;
        const i = chunkIndex(lx, y, lz);
        if (!STONE_LIKE.has(blocks[i])) continue;
        if (hashToUnit(hash2(x * 131 + y, z)) < 0.12) continue; // unregelmäßige Ränder
        const deep = blocks[i] === B.deepslate;
        blocks[i] = deep ? blockIdByName(spec.deep) : blockIdByName(spec.ore);
        meta[i] = 0;
      }
    }
  }
}


/**
 * Sucht einen trockenen, offenen Startpunkt nahe dem Ursprung.
 * @returns {{ x: number, y: number, z: number }} Füße des Spielers (Blockoberkante)
 */
export function findSpawn(seed) {
  const gen = createOverworldGenerator(seed);
  for (let radius = 0; radius < 400; radius += 4) {
    for (let step = 0; step < Math.max(1, radius * 8); step++) {
      const angle = (step / Math.max(1, radius * 8)) * Math.PI * 2;
      const x = Math.round(Math.cos(angle) * radius);
      const z = Math.round(Math.sin(angle) * radius);
      const col = gen.column(x, z);
      const def = biomeDef(col.biome);
      if (col.height > SEA_LEVEL + 2 && !def.ocean && def.top !== 'sand' && col.height < 110) {
        return { x: x + 0.5, y: col.height + 1, z: z + 0.5 };
      }
    }
  }
  return { x: 0.5, y: SEA_LEVEL + 1, z: 0.5 };
}
