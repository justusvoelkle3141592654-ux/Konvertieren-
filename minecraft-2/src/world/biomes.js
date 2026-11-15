// Biome: Definitionen und Auswahl. Rein, ohne Browser-APIs.
// Jedes Biom bestimmt Deckschicht, Vegetation, Farben und Mob-Spawnregeln (Mobs folgen in Phase 6).

export const BIOME = {
  plains: 1,
  forest: 2,
  dark_forest: 3,
  birch_forest: 4,
  desert: 5,
  savanna: 6,
  taiga: 7,
  snowy_plains: 8,
  jungle: 9,
  swamp: 10,
  mountains: 11,
  ocean: 12,
  frozen_ocean: 13,
  warm_ocean: 14,
  beach: 15,
  mushroom_fields: 16,
};

/**
 * Eigenschaften je Biom.
 *  top/filler: Blöcke der Oberfläche; trees: Baumarten mit Dichte; plants: Pflanzen-Dichte (0–1)
 *  grass/foliage/water: Farben (RGB 0–1) für Gras, Laub und Wasser
 *  temp/rain: Klima (für Blockfarben und Mobs)
 */
const DEF = {
  1: { name: 'Ebene', top: 'grass_block', filler: 'dirt', trees: [['oak', 0.004]], plants: 0.35, grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4' },
  2: { name: 'Wald', top: 'grass_block', filler: 'dirt', trees: [['oak', 0.05], ['birch', 0.012]], plants: 0.3, grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4' },
  3: { name: 'Dunkler Wald', top: 'grass_block', filler: 'dirt', trees: [['dark_oak', 0.07]], plants: 0.25, grass: '#507a32', foliage: '#406e2d', water: '#3f76e4', mushrooms: 0.02 },
  4: { name: 'Birkenwald', top: 'grass_block', filler: 'dirt', trees: [['birch', 0.06]], plants: 0.3, grass: '#88bb67', foliage: '#6ba941', water: '#3f76e4' },
  5: { name: 'Wüste', top: 'sand', filler: 'sandstone', trees: [], plants: 0.06, cactus: 0.012, deadBush: 0.01, grass: '#bfb755', foliage: '#aea42a', water: '#3f76e4' },
  6: { name: 'Savanne', top: 'grass_block', filler: 'dirt', trees: [['acacia', 0.008]], plants: 0.25, grass: '#bfb755', foliage: '#aea42a', water: '#3f76e4' },
  7: { name: 'Taiga', top: 'grass_block', filler: 'dirt', trees: [['spruce', 0.045]], plants: 0.2, grass: '#86b783', foliage: '#68a464', water: '#3f71e4', snowLayers: 0.04 },
  8: { name: 'Verschneite Ebene', top: 'snow_block', filler: 'dirt', trees: [['spruce', 0.004]], plants: 0.02, snowLayers: 0.5, grass: '#ffffff', foliage: '#ffffff', water: '#3d57d6' },
  9: { name: 'Dschungel', top: 'grass_block', filler: 'dirt', trees: [['jungle', 0.09]], plants: 0.5, grass: '#59c93c', foliage: '#30bb0b', water: '#3f76e4', cocoa: 0 },
  10: { name: 'Sumpf', top: 'grass_block', filler: 'dirt', trees: [['oak', 0.012]], plants: 0.45, grass: '#6a7039', foliage: '#6a7039', water: '#617b64', swampy: true },
  11: { name: 'Berge', top: 'grass_block', filler: 'stone', trees: [['spruce', 0.006]], plants: 0.08, grass: '#8ab689', foliage: '#6da36b', water: '#3f76e4', mountain: true },
  12: { name: 'Ozean', top: 'gravel', filler: 'sand', trees: [], plants: 0, grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4', ocean: true },
  13: { name: 'Kalter Ozean', top: 'gravel', filler: 'sand', trees: [], plants: 0, grass: '#91bd59', foliage: '#77ab2f', water: '#3d57d6', ocean: true, ice: true },
  14: { name: 'Warmer Ozean', top: 'sand', filler: 'sandstone', trees: [], plants: 0, grass: '#91bd59', foliage: '#77ab2f', water: '#43d5ee', ocean: true },
  15: { name: 'Strand', top: 'sand', filler: 'sandstone', trees: [], plants: 0.03, grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4' },
  16: { name: 'Pilzinsel', top: 'mycelium', filler: 'dirt', trees: [], plants: 0.1, mushrooms: 0.12, grass: '#55c93f', foliage: '#2bbb0f', water: '#3f76e4', mushroomIsland: true },
};

/** Wandelt eine Hex-Farbe in RGB-Werte (0–1) um. */
export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export const BIOME_DEFS = {};
for (const [name, id] of Object.entries(BIOME)) {
  const d = DEF[id];
  BIOME_DEFS[id] = {
    id,
    key: name,
    ...d,
    grassRgb: hexToRgb(d.grass),
    foliageRgb: hexToRgb(d.foliage),
    waterRgb: hexToRgb(d.water),
  };
}

export function biomeDef(id) {
  return BIOME_DEFS[id] ?? BIOME_DEFS[BIOME.plains];
}

/**
 * Bestimmt das Biom aus Klima und Höhe.
 * @param {number} continent  −1 (tief im Ozean) … +1 (Inland)
 * @param {number} temp       −1 (kalt) … +1 (heiß)
 * @param {number} humid      −1 (trocken) … +1 (feucht)
 * @param {number} height     Oberflächenhöhe
 * @param {number} seaLevel   Meeresspiegel
 * @param {number} mushroomNoise  Sonderwert für Pilzinseln (> 0.6 = Pilzinsel)
 */
export function pickBiome({ continent, temp, humid, height, seaLevel, mushroomNoise = -1 }) {
  if (mushroomNoise > 0.62 && continent > 0.25) return BIOME.mushroom_fields;
  if (height < seaLevel - 1) {
    if (temp < -0.45) return BIOME.frozen_ocean;
    if (temp > 0.5) return BIOME.warm_ocean;
    return BIOME.ocean;
  }
  if (height < seaLevel + 2) return BIOME.beach;
  if (height > 118 && continent > 0.1) return BIOME.mountains;
  if (temp < -0.45) return humid > 0.1 ? BIOME.taiga : BIOME.snowy_plains;
  if (temp < -0.1) {
    if (humid > 0.72) return BIOME.dark_forest;
    if (humid > 0.45) return BIOME.birch_forest;
    if (humid > 0.1) return BIOME.forest;
    return BIOME.plains;
  }
  if (temp < 0.35) {
    if (humid > 0.5 && height < seaLevel + 4) return BIOME.swamp;
    if (humid > 0.25) return BIOME.forest;
    return BIOME.plains;
  }
  if (humid < -0.25) return BIOME.desert;
  if (humid < 0.2) return BIOME.savanna;
  return BIOME.jungle;
}
