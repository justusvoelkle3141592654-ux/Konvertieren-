// Block-Register. Rein (ohne Browser-APIs), damit Worker und Tests es nutzen können.
//
// Jeder Block hat eine numerische ID (u8 im Chunk-Speicher), einen Namen und Eigenschaften.
// Texturen werden über Namen wie "block/stone" referenziert; der Texture-Atlas löst sie auf.
// Die Form (shape) bestimmt Geometrie, kollisionsrelevante Boxen stehen in shapes.js.

/** Erzeugt die Texturzuordnung für die sechs Blockseiten. */
export function faces(spec) {
  if (typeof spec === 'string') {
    return { top: spec, bottom: spec, north: spec, south: spec, east: spec, west: spec };
  }
  const side = spec.side ?? spec.all;
  return {
    top: spec.top ?? spec.all ?? side,
    bottom: spec.bottom ?? spec.all ?? side,
    north: spec.north ?? side,
    south: spec.south ?? side,
    east: spec.east ?? side,
    west: spec.west ?? side,
  };
}

const DEFAULTS = {
  shape: 'cube',       // Form: cube | cross | crop | slab | stairs | fence | door | torch | ladder | fluid | …
  solid: true,         // hat Kollision
  opaque: true,        // verdeckt Nachbarflächen vollständig
  transparent: false,  // Alpha-Blending-Pass (Glas, Wasser, Eis)
  cutout: false,       // Alpha-Test (Laub, Pflanzen)
  lightOpacity: 15,    // wie stark Licht gedämpft wird (0 = Luft)
  lightEmit: 0,        // Leuchtstärke 0–15
  hardness: 1,         // Abbauzeit-Basis, -1 = unzerstörbar
  tool: null,          // benötigtes Werkzeug (pickaxe, axe, shovel, hoe, shears)
  tier: 0,             // Mindeststufe für Drops (0 Holz … 5 Netherit)
  drop: 'self',        // Item-Name, 'self' oder null
  tint: null,          // grass | foliage | water
  sound: 'stone',      // Geräuschgruppe
  flammable: false,
  falls: false,        // fällt bei fehlender Unterstützung (Sand, Kies)
  category: 'bausteine',
  placeable: true,
  axis: false,         // Stamm mit Ausrichtung (Meta: 0 y, 1 x, 2 z)
  facing: false,       // Horizontale Ausrichtung (Meta & 3: 0 Nord, 1 Ost, 2 Süd, 3 West)
};

export const BLOCKS = [];
export const BLOCK_BY_NAME = new Map();

/** Schnellzugriff: B.stone === Block-ID von Stein. */
export const B = {};

function define(name, label, texture, options = {}) {
  const id = BLOCKS.length;
  if (id > 255) throw new Error('Block-Register überschreitet 255 IDs (u8).');
  const def = { ...DEFAULTS, ...options, id, name, label, tex: faces(texture) };
  BLOCKS.push(def);
  BLOCK_BY_NAME.set(name, def);
  B[name] = id;
  return def;
}

// Luft ist immer ID 0.
define('air', 'Luft', 'block/stone', { shape: 'none', solid: false, opaque: false, lightOpacity: 0, placeable: false, hardness: 0, category: 'none' });

const PICK = { tool: 'pickaxe' };
const AXE = { tool: 'axe' };
const SHOVEL = { tool: 'shovel' };
const HOE = { tool: 'hoe' };
const FLAM = { flammable: true };
const CLEAR = { solid: false, opaque: false, lightOpacity: 0 };
const PLANT = { ...CLEAR, shape: 'cross', cutout: true, hardness: 0, drop: 'self', sound: 'grass', category: 'pflanzen' };

// --- Gestein und Untergrund -------------------------------------------------
define('bedrock', 'Bedrock', 'block/bedrock', { hardness: -1, drop: null, category: 'bausteine' });
define('stone', 'Stein', 'block/stone', { ...PICK, tier: 0, hardness: 1.5, drop: 'cobblestone' });
define('granite', 'Granit', 'block/granite', { ...PICK, hardness: 1.5 });
define('diorite', 'Diorit', 'block/diorite', { ...PICK, hardness: 1.5 });
define('andesite', 'Andesit', 'block/andesite', { ...PICK, hardness: 1.5 });
define('cobblestone', 'Bruchstein', 'block/cobblestone', { ...PICK, hardness: 2 });
define('deepslate', 'Tiefenschiefer', { top: 'block/deepslate_top', side: 'block/deepslate' }, { ...PICK, hardness: 3, drop: 'cobbled_deepslate' });
define('cobbled_deepslate', 'Tiefenschiefer-Bruchstein', 'block/cobbled_deepslate', { ...PICK, hardness: 3.5 });
define('dirt', 'Erde', 'block/dirt', { ...SHOVEL, hardness: 0.5, sound: 'gravel', category: 'natur' });
define('grass_block', 'Grasblock', { top: 'block/grass_block_top', bottom: 'block/dirt', side: 'block/grass_block_side' }, {
  ...SHOVEL, hardness: 0.6, drop: 'dirt', sound: 'grass', tint: 'grass', tintFaces: ['top'], category: 'natur',
});
define('mycelium', 'Myzel', { top: 'block/mycelium_top', side: 'block/mycelium_side', bottom: 'block/dirt' }, { ...SHOVEL, hardness: 0.6, drop: 'dirt', sound: 'grass', category: 'natur' });
define('sand', 'Sand', 'block/sand', { ...SHOVEL, hardness: 0.5, falls: true, sound: 'sand', category: 'natur' });
define('gravel', 'Kies', 'block/gravel', { ...SHOVEL, hardness: 0.6, falls: true, sound: 'gravel', category: 'natur' });
define('clay', 'Ton', 'block/clay', { ...SHOVEL, hardness: 0.6, drop: 'clay_ball', category: 'natur' });
define('sandstone', 'Sandstein', { top: 'block/sandstone_top', bottom: 'block/sandstone_bottom', side: 'block/sandstone' }, { ...PICK, hardness: 0.8 });
define('snow_block', 'Schneeblock', 'block/snow', { ...SHOVEL, hardness: 0.2, drop: 'snowball', sound: 'snow', category: 'natur' });
define('snow', 'Schneeschicht', 'block/snow', { ...SHOVEL, shape: 'carpet', ...CLEAR, hardness: 0.1, drop: 'snowball', sound: 'snow', category: 'natur', cutout: false });
define('ice', 'Eis', 'block/ice', { ...PICK, transparent: true, opaque: false, lightOpacity: 1, hardness: 0.5, drop: null, sound: 'glass', category: 'natur' });
define('water', 'Wasser', { top: 'block/water_still', side: 'block/water_flow', bottom: 'block/water_still' }, {
  shape: 'fluid', fluid: 'water', solid: false, opaque: false, transparent: true, lightOpacity: 2, tint: 'water',
  hardness: -1, drop: null, placeable: false, category: 'fluessigkeiten', sound: 'water',
});
define('lava', 'Lava', { top: 'block/lava_still', side: 'block/lava_flow', bottom: 'block/lava_still' }, {
  shape: 'fluid', fluid: 'lava', solid: false, opaque: false, lightOpacity: 1, lightEmit: 15,
  hardness: -1, drop: null, placeable: false, category: 'fluessigkeiten', sound: 'lava',
});
define('netherrack', 'Netherrack', 'block/netherrack', { ...PICK, hardness: 0.4, category: 'nether' });
define('soul_sand', 'Seelensand', 'block/soul_sand', { ...SHOVEL, hardness: 0.5, sound: 'sand', category: 'nether' });
define('soul_soil', 'Seelenerde', 'block/soul_soil', { ...SHOVEL, hardness: 0.5, sound: 'sand', category: 'nether' });
define('glowstone', 'Glowstone', 'block/glowstone', { ...PICK, lightEmit: 15, hardness: 0.3, drop: 'glowstone_dust', category: 'nether' });
define('basalt', 'Basalt', { top: 'block/basalt_top', side: 'block/basalt_side', bottom: 'block/basalt_top' }, { ...PICK, hardness: 1.25, category: 'nether' });
define('blackstone', 'Schwarzstein', 'block/blackstone', { ...PICK, hardness: 1.5, category: 'nether' });
define('magma_block', 'Magmablock', 'block/magma', { ...PICK, lightEmit: 3, hardness: 0.5, category: 'nether' });
define('nether_quartz_ore', 'Netherquarzerz', 'block/nether_quartz_ore', { ...PICK, hardness: 3, drop: 'quartz', category: 'nether' });
define('nether_gold_ore', 'Nethergolderz', 'block/nether_gold_ore', { ...PICK, hardness: 3, drop: 'gold_nugget', category: 'nether' });
define('ancient_debris', 'Antiker Schrott', { top: 'block/ancient_debris_top', side: 'block/ancient_debris_side' }, { ...PICK, tier: 3, hardness: 30, category: 'nether' });
define('netherite_block', 'Netheritblock', 'block/netherite_block', { ...PICK, tier: 3, hardness: 50, category: 'nether' });
define('nether_bricks', 'Netherziegel', 'block/nether_bricks', { ...PICK, hardness: 2, category: 'nether' });
define('end_stone', 'Endstein', 'block/end_stone', { ...PICK, hardness: 3, category: 'ende' });
define('obsidian', 'Obsidian', 'block/obsidian', { ...PICK, tier: 3, hardness: 50, category: 'ende' });
define('end_portal_frame', 'Endportalrahmen', { top: 'block/end_portal_frame_top', side: 'block/end_portal_frame_side', bottom: 'block/end_stone' }, {
  ...PICK, tier: 0, hardness: -1, drop: null, shape: 'endframe', facing: true, category: 'ende',
});
define('end_portal', 'Endportal', 'block/end_portal', { shape: 'portal', solid: false, opaque: false, transparent: true, lightOpacity: 0, lightEmit: 15, hardness: -1, drop: null, placeable: false, category: 'ende' });
define('nether_portal', 'Netherportal', 'block/nether_portal', { shape: 'portal', solid: false, opaque: false, transparent: true, lightOpacity: 0, lightEmit: 11, hardness: -1, drop: null, placeable: false, category: 'nether' });
define('stone_bricks', 'Steinziegel', 'block/stone_bricks', { ...PICK, hardness: 1.5 });
define('bricks', 'Ziegel', 'block/bricks', { ...PICK, hardness: 2 });
define('stone_slab', 'Steinstufe', 'block/stone', { ...PICK, shape: 'slab', hardness: 2, category: 'treppen' });
define('stone_brick_slab', 'Steinziegelstufe', 'block/stone_bricks', { ...PICK, shape: 'slab', hardness: 2, category: 'treppen' });
define('cobblestone_stairs', 'Bruchsteintreppe', 'block/cobblestone', { ...PICK, shape: 'stairs', facing: true, hardness: 2, category: 'treppen' });
define('stone_brick_stairs', 'Steinziegeltreppe', 'block/stone_bricks', { ...PICK, shape: 'stairs', facing: true, hardness: 2, category: 'treppen' });
define('nether_brick_fence', 'Netherziegelzaun', 'block/nether_bricks', { ...PICK, shape: 'fence', opaque: false, lightOpacity: 0, hardness: 2, category: 'treppen' });
define('blaze_spawner', 'Monsterkäfig', 'block/spawner', { shape: 'cube', cutout: true, opaque: false, lightOpacity: 0, hardness: 5, ...PICK, drop: null, category: 'nether' });

// --- Erze und Metallblöcke --------------------------------------------------
const ORES = [
  ['coal', 'Kohle', 0, 'coal', 3],
  ['iron', 'Eisen', 1, 'raw_iron', 3],
  ['copper', 'Kupfer', 1, 'raw_copper', 3],
  ['gold', 'Gold', 2, 'raw_gold', 3],
  ['redstone', 'Redstone', 2, 'redstone', 3],
  ['lapis', 'Lapislazuli', 1, 'lapis_lazuli', 3],
  ['diamond', 'Diamant', 2, 'diamond', 3],
  ['emerald', 'Smaragd', 2, 'emerald', 3],
];
for (const [key, label, tier, drop, hardness] of ORES) {
  define(`${key}_ore`, `${label}erz`, `block/${key}_ore`, { ...PICK, tier, hardness, drop, category: 'erze' });
  define(`deepslate_${key}_ore`, `Tiefenschiefer-${label}erz`, `block/deepslate_${key}_ore`, { ...PICK, tier, hardness: hardness + 1.5, drop, category: 'erze' });
}
define('coal_block', 'Kohleblock', 'block/coal_block', { ...PICK, hardness: 5, category: 'metall' });
define('iron_block', 'Eisenblock', 'block/iron_block', { ...PICK, tier: 1, hardness: 5, category: 'metall' });
define('copper_block', 'Kupferblock', 'block/copper_block', { ...PICK, tier: 1, hardness: 3, category: 'metall' });
define('gold_block', 'Goldblock', 'block/gold_block', { ...PICK, tier: 2, hardness: 3, category: 'metall' });
define('redstone_block', 'Redstoneblock', 'block/redstone_block', { ...PICK, hardness: 5, category: 'metall' });
define('lapis_block', 'Lapislazuliblock', 'block/lapis_block', { ...PICK, tier: 1, hardness: 3, category: 'metall' });
define('diamond_block', 'Diamantblock', 'block/diamond_block', { ...PICK, tier: 2, hardness: 5, category: 'metall' });
define('emerald_block', 'Smaragdblock', 'block/emerald_block', { ...PICK, tier: 2, hardness: 5, category: 'metall' });

// --- Holz (sechs Arten) -----------------------------------------------------
const WOODS = [
  ['oak', 'Eichen', 'Eichen'],
  ['birch', 'Birken', 'Birken'],
  ['spruce', 'Fichten', 'Fichten'],
  ['jungle', 'Tropen', 'Tropen'],
  ['acacia', 'Akazien', 'Akazien'],
  ['dark_oak', 'Dunkeleichen', 'Dunkeleichen'],
];
for (const [key, label] of WOODS) {
  define(`${key}_log`, `${label}stamm`, { top: `block/${key}_log_top`, side: `block/${key}_log` }, { ...AXE, axis: true, hardness: 2, sound: 'wood', category: 'holz', ...FLAM });
  define(`${key}_planks`, `${label}bretter`, `block/${key}_planks`, { ...AXE, hardness: 2, sound: 'wood', category: 'holz', ...FLAM });
  define(`${key}_leaves`, `${label}laub`, `block/${key}_leaves`, {
    ...CLEAR, cutout: true, lightOpacity: 1, tint: 'foliage', hardness: 0.2, drop: null, sound: 'grass', category: 'natur', ...FLAM,
  });
  define(`${key}_sapling`, `${label}setzling`, `block/${key}_sapling`, { ...PLANT, category: 'natur', ...FLAM });
}
define('red_mushroom_block', 'Roter Pilzblock', 'block/red_mushroom_block', { ...AXE, hardness: 0.2, category: 'natur' });
define('brown_mushroom_block', 'Brauner Pilzblock', 'block/brown_mushroom_block', { ...AXE, hardness: 0.2, category: 'natur' });
define('mushroom_stem', 'Pilzstiel', 'block/mushroom_stem', { ...AXE, hardness: 0.2, category: 'natur' });

// --- Pflanzen ---------------------------------------------------------------
define('short_grass', 'Gras', 'block/short_grass', { ...PLANT, tint: 'grass', drop: null, category: 'pflanzen' });
define('fern', 'Farn', 'block/fern', { ...PLANT, tint: 'grass', drop: null, category: 'pflanzen' });
define('dead_bush', 'Totes Gebüsch', 'block/dead_bush', { ...PLANT, drop: 'stick' });
define('dandelion', 'Löwenzahn', 'block/dandelion', PLANT);
define('poppy', 'Mohn', 'block/poppy', PLANT);
define('blue_orchid', 'Blaue Orchidee', 'block/blue_orchid', PLANT);
define('allium', 'Lauch-Zierlauch', 'block/allium', PLANT);
define('azure_bluet', 'Porzellanblümchen', 'block/azure_bluet', PLANT);
define('oxeye_daisy', 'Margerite', 'block/oxeye_daisy', PLANT);
define('cornflower', 'Kornblume', 'block/cornflower', PLANT);
define('red_mushroom', 'Roter Pilz', 'block/red_mushroom', PLANT);
define('brown_mushroom', 'Brauner Pilz', 'block/brown_mushroom', { ...PLANT, lightEmit: 1 });
define('sugar_cane', 'Zuckerrohr', 'block/sugar_cane', { ...PLANT, drop: 'sugar_cane', sound: 'grass' });
define('cactus', 'Kaktus', { top: 'block/cactus_top', bottom: 'block/cactus_bottom', side: 'block/cactus_side' }, {
  shape: 'cactus', solid: true, opaque: false, lightOpacity: 0, hardness: 0.4, drop: 'self', sound: 'cloth', category: 'natur',
});
define('cobweb', 'Spinnennetz', 'block/cobweb', { shape: 'cube', cutout: true, solid: false, opaque: false, lightOpacity: 0, hardness: 4, tool: 'shears', drop: 'string', sound: 'cloth', category: 'natur' });
define('fire', 'Feuer', 'block/fire_0', { shape: 'cube', cutout: true, solid: false, opaque: false, lightOpacity: 0, lightEmit: 15, hardness: 0, drop: null, placeable: false, category: 'nether' });
define('wheat', 'Weizen', 'block/wheat_stage7', { shape: 'crop', cropPrefix: 'block/wheat_stage', stages: 8, ...CLEAR, cutout: true, hardness: 0, drop: 'wheat', tool: null, category: 'landwirtschaft', sound: 'grass' });
define('carrots', 'Karotten', 'block/carrots_stage3', { shape: 'crop', cropPrefix: 'block/carrots_stage', stages: 4, ...CLEAR, cutout: true, hardness: 0, drop: 'carrot', category: 'landwirtschaft', sound: 'grass' });
define('potatoes', 'Kartoffeln', 'block/potatoes_stage3', { shape: 'crop', cropPrefix: 'block/potatoes_stage', stages: 4, ...CLEAR, cutout: true, hardness: 0, drop: 'potato', category: 'landwirtschaft', sound: 'grass' });
define('nether_wart', 'Netherwarze', 'block/nether_wart_stage2', { shape: 'crop', cropPrefix: 'block/nether_wart_stage', stages: 3, ...CLEAR, cutout: true, hardness: 0, drop: 'nether_wart', category: 'landwirtschaft', sound: 'grass' });
define('farmland', 'Ackerboden', { top: 'block/farmland', side: 'block/dirt', bottom: 'block/dirt' }, {
  ...SHOVEL, shape: 'farmland', solid: true, opaque: false, lightOpacity: 0, hardness: 0.6, drop: 'dirt', category: 'landwirtschaft', sound: 'gravel',
});
define('redstone_dust', 'Redstone-Staub', 'block/redstone_dust_dot', { shape: 'dust', ...CLEAR, solid: false, hardness: 0, drop: 'redstone', placeable: true, category: 'funktion', sound: 'stone', tool: null });

// --- Holzbauteile und Möbel (Eiche) -----------------------------------------
define('oak_slab', 'Eichenstufe', 'block/oak_planks', { ...AXE, shape: 'slab', hardness: 2, category: 'treppen', ...FLAM });
define('oak_stairs', 'Eichentreppe', 'block/oak_planks', { ...AXE, shape: 'stairs', facing: true, hardness: 2, category: 'treppen', ...FLAM });
define('oak_fence', 'Eichenzaun', 'block/oak_planks', { ...AXE, shape: 'fence', opaque: false, lightOpacity: 0, hardness: 2, category: 'treppen', ...FLAM });
define('oak_door', 'Eichentür', 'block/oak_door_bottom', { ...AXE, shape: 'door', facing: true, texUpper: 'block/oak_door_top', solid: true, opaque: false, lightOpacity: 0, cutout: true, hardness: 3, drop: 'oak_door', category: 'funktion', ...FLAM });
define('ladder', 'Leiter', 'block/ladder', { ...AXE, shape: 'ladder', facing: true, solid: false, opaque: false, lightOpacity: 0, cutout: true, hardness: 0.4, category: 'funktion', ...FLAM });
define('torch', 'Fackel', 'block/torch', { shape: 'torch', facing: true, solid: false, opaque: false, lightOpacity: 0, cutout: true, lightEmit: 14, hardness: 0, drop: 'self', category: 'funktion', placeable: true });
define('redstone_torch', 'Redstonefackel', 'block/redstone_torch', { shape: 'torch', facing: true, solid: false, opaque: false, lightOpacity: 0, cutout: true, lightEmit: 7, hardness: 0, drop: 'redstone_torch', category: 'funktion' });
define('lever', 'Hebel', 'block/lever', { shape: 'lever', facing: true, solid: false, opaque: false, lightOpacity: 0, cutout: true, hardness: 0.5, ...PICK, category: 'funktion' });
define('stone_button', 'Steinknopf', 'block/stone', { shape: 'button', facing: true, solid: false, opaque: false, lightOpacity: 0, hardness: 0.5, ...PICK, category: 'funktion' });
define('stone_pressure_plate', 'Steindruckplatte', 'block/stone', { shape: 'plate', solid: false, opaque: false, lightOpacity: 0, hardness: 0.5, ...PICK, category: 'funktion' });
define('rail', 'Schiene', 'block/rail', { shape: 'rail', facing: true, solid: false, opaque: false, lightOpacity: 0, cutout: true, hardness: 0.7, ...PICK, category: 'transport' });
define('glass', 'Glas', 'block/glass', { transparent: true, cutout: true, opaque: false, lightOpacity: 0, hardness: 0.3, drop: null, sound: 'glass', category: 'bausteine' });
define('crafting_table', 'Werkbank', { top: 'block/crafting_table_top', side: 'block/crafting_table_side', bottom: 'block/oak_planks', north: 'block/crafting_table_front' }, { ...AXE, hardness: 2.5, category: 'funktion', ...FLAM });
define('furnace', 'Ofen', { top: 'block/furnace_top', side: 'block/furnace_side', bottom: 'block/furnace_top' }, { ...PICK, facing: true, frontTex: 'block/furnace_front', frontLitTex: 'block/furnace_front_on', litEmit: 13, hardness: 3.5, category: 'funktion', blockEntity: 'furnace' });
define('chest', 'Truhe', 'block/oak_planks', { ...AXE, shape: 'chest', facing: true, solid: true, opaque: false, lightOpacity: 0, hardness: 2.5, category: 'funktion', blockEntity: 'chest', ...FLAM });
define('enchanting_table', 'Zaubertisch', { top: 'block/enchanting_table_top', side: 'block/enchanting_table_side', bottom: 'block/obsidian' }, { ...PICK, tier: 0, hardness: 5, category: 'funktion', lightOpacity: 0, opaque: false, blockEntity: 'enchanting' });
define('anvil', 'Amboss', { top: 'block/anvil_top', side: 'block/anvil' }, { ...PICK, shape: 'anvil', facing: true, solid: true, opaque: false, lightOpacity: 0, tier: 0, hardness: 5, category: 'funktion' });
define('brewing_stand', 'Brauständer', 'block/brewing_stand', { ...PICK, shape: 'stand', solid: false, opaque: false, lightOpacity: 0, lightEmit: 1, hardness: 0.5, category: 'funktion', blockEntity: 'brewing' });
define('bed', 'Bett', { top: 'block/red_wool', side: 'block/red_wool', bottom: 'block/oak_planks' }, { ...AXE, shape: 'bed', facing: true, solid: false, opaque: false, lightOpacity: 0, hardness: 0.2, drop: 'bed', category: 'funktion', sound: 'cloth', ...FLAM });
define('white_wool', 'Wolle', 'block/white_wool', { hardness: 0.8, tool: 'shears', sound: 'cloth', category: 'bausteine', ...FLAM });
define('red_wool', 'Rote Wolle', 'block/red_wool', { hardness: 0.8, tool: 'shears', sound: 'cloth', category: 'bausteine', ...FLAM });

export function getBlockDef(id) {
  return BLOCKS[id] ?? BLOCKS[0];
}

export function blockIdByName(name) {
  const def = BLOCK_BY_NAME.get(name);
  return def ? def.id : 0;
}

/** Zugeordneter Name je Block-ID (Debug und Speicher). */
export function blockName(id) {
  return BLOCKS[id]?.name ?? 'air';
}
