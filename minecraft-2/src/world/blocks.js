// Block-Register. Rein (ohne Browser-APIs), damit Worker und Tests es nutzen können.
//
// Jeder Block hat eine numerische ID (u8 im Chunk-Speicher), einen Namen und
// Eigenschaften. Texturen werden über Namen wie "block/stone" referenziert;
// der Texture-Atlas löst sie auf.

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
  shape: 'cube',       // Form: cube | cross | slab | stairs | fence | door | torch | ladder | fluid | …
  solid: true,         // hat Kollision
  opaque: true,        // verdeckt Nachbarflächen vollständig und blockiert Licht
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
};

export const BLOCKS = [];
export const BLOCK_BY_NAME = new Map();

/** Schnellzugriff: B.stone === Block-ID von Stein. */
export const B = {};

function define(name, label, texture, options = {}) {
  const id = BLOCKS.length;
  if (id > 255) throw new Error('Block-Register überschreitet 255 IDs (u8).');
  const def = {
    ...DEFAULTS,
    ...options,
    id,
    name,
    label,
    tex: faces(texture),
  };
  BLOCKS.push(def);
  BLOCK_BY_NAME.set(name, def);
  B[name] = id;
  return def;
}

// Luft ist immer ID 0.
BLOCKS.push({ ...DEFAULTS, id: 0, name: 'air', label: 'Luft', shape: 'none', solid: false, opaque: false, lightOpacity: 0, tex: faces('block/stone'), placeable: false, hardness: 0 });
BLOCK_BY_NAME.set('air', BLOCKS[0]);
B.air = 0;

// --- Grundblöcke (Phase 1: Testwelt) ---------------------------------------
define('bedrock', 'Bedrock', 'block/bedrock', { hardness: -1, category: 'bausteine' });
define('stone', 'Stein', 'block/stone', { tool: 'pickaxe', tier: 0, hardness: 1.5, drop: 'cobblestone' });
define('dirt', 'Erde', 'block/dirt', { tool: 'shovel', hardness: 0.5, sound: 'gravel' });
define('grass_block', 'Grasblock', { top: 'block/grass_block_top', bottom: 'block/dirt', side: 'block/grass_block_side' }, { tool: 'shovel', hardness: 0.6, drop: 'dirt', sound: 'grass', tint: 'grass', tintFaces: ['top'] });
define('cobblestone', 'Bruchstein', 'block/cobblestone', { tool: 'pickaxe', tier: 0, hardness: 2 });

export function getBlockDef(id) {
  return BLOCKS[id] ?? BLOCKS[0];
}

export function blockIdByName(name) {
  const def = BLOCK_BY_NAME.get(name);
  return def ? def.id : 0;
}
