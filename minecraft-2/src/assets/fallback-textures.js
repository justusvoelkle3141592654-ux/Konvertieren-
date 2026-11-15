// Selbst erzeugte Platzhalter-Texturen (16×16 Pixel, Canvas).
// Sie werden verwendet, wenn keine lokalen Originaltexturen vorhanden sind.
// Farbige Oberflächen, die biomabhängig eingefärbt werden (Gras, Laub, Wasser),
// sind graustufig gehalten – genau wie die Originaltexturen.
import { hashString, mulberry32 } from '../engine/random.js';

export const TILE = 16;

const WATER = { kind: 'water', frames: 2, frametime: 2 };
const LAVA = { kind: 'lava', frames: 3, frametime: 3 };
const FIRE = { kind: 'fire', frames: 4, frametime: 2 };
const PORTAL = { kind: 'portal', frames: 4, frametime: 2 };

const GRAY_LEAVES = { kind: 'leaves', base: [150, 150, 150] };
const GRAY_GRASS = { kind: 'noise', base: [196, 196, 196], amp: 26 };

const WOOD = {
  oak: { log: [104, 81, 48], plank: [162, 130, 78] },
  birch: { log: [216, 210, 196], plank: [196, 170, 110] },
  spruce: { log: [67, 48, 30], plank: [116, 88, 52] },
  jungle: { log: [85, 67, 40], plank: [160, 115, 80] },
  acacia: { log: [103, 96, 88], plank: [168, 90, 50] },
  dark_oak: { log: [60, 44, 26], plank: [72, 52, 30] },
};

const ORES = {
  coal: [30, 30, 30],
  iron: [216, 175, 147],
  copper: [200, 120, 80],
  gold: [252, 238, 77],
  redstone: [220, 30, 30],
  lapis: [40, 70, 190],
  diamond: [92, 219, 213],
  emerald: [30, 200, 90],
};

/**
 * Katalog: Name → Erzeugungsart mit Farben. Namen ohne Eintrag erhalten eine
 * Farbe aus dem Namens-Hash (unterscheidbar, aber ohne Muster).
 */
const CATALOG = {
  // Gestein und Untergrund
  'block/bedrock': { kind: 'noise', base: [76, 76, 76], amp: 70 },
  'block/stone': { kind: 'noise', base: [125, 125, 125], amp: 30 },
  'block/granite': { kind: 'speckle', base: [149, 103, 86], dot: [120, 80, 66], p: 0.25 },
  'block/diorite': { kind: 'speckle', base: [192, 192, 192], dot: [160, 160, 160], p: 0.2 },
  'block/andesite': { kind: 'speckle', base: [136, 136, 136], dot: [112, 112, 112], p: 0.25 },
  'block/cobblestone': { kind: 'cobble', base: [120, 120, 120], amp: 34 },
  'block/cobbled_deepslate': { kind: 'cobble', base: [70, 70, 76], amp: 26 },
  'block/deepslate': { kind: 'rings', base: [78, 78, 84], dark: [58, 58, 64] },
  'block/deepslate_top': { kind: 'rings', base: [88, 88, 94], dark: [62, 62, 68] },
  'block/dirt': { kind: 'noise', base: [134, 96, 67], amp: 34 },
  'block/grass_block_top': GRAY_GRASS,
  'block/grass_block_side': { kind: 'grassSide' },
  'block/mycelium_top': { kind: 'noise', base: [111, 99, 108], amp: 26 },
  'block/mycelium_side': { kind: 'speckle', base: [134, 96, 67], dot: [111, 99, 108], p: 0.35 },
  'block/sand': { kind: 'noise', base: [219, 211, 160], amp: 14 },
  'block/gravel': { kind: 'speckle', base: [131, 127, 126], dot: [96, 92, 92], p: 0.35 },
  'block/clay': { kind: 'noise', base: [160, 166, 179], amp: 10 },
  'block/sandstone': { kind: 'bands', base: [216, 203, 155], band: [196, 184, 136] },
  'block/sandstone_top': { kind: 'noise', base: [218, 206, 160], amp: 10 },
  'block/sandstone_bottom': { kind: 'noise', base: [208, 196, 150], amp: 10 },
  'block/snow': { kind: 'noise', base: [248, 248, 250], amp: 6 },
  'block/ice': { kind: 'glass', base: [145, 190, 240], border: [170, 210, 250], alpha: 200 },
  'block/water_still': WATER,
  'block/water_flow': WATER,
  'block/lava_still': LAVA,
  'block/lava_flow': LAVA,
  'block/fire_0': FIRE,
  'block/nether_portal': PORTAL,
  'block/end_portal': { kind: 'stars', base: [14, 14, 28] },
  'block/netherrack': { kind: 'speckle', base: [111, 54, 52], dot: [88, 40, 40], p: 0.3 },
  'block/soul_sand': { kind: 'speckle', base: [84, 64, 51], dot: [58, 44, 35], p: 0.3 },
  'block/soul_soil': { kind: 'speckle', base: [76, 57, 46], dot: [52, 38, 30], p: 0.3 },
  'block/glowstone': { kind: 'dots', base: [236, 178, 100], dot: [255, 240, 160] },
  'block/basalt_top': { kind: 'rings', base: [82, 82, 86], dark: [52, 52, 58] },
  'block/basalt_side': { kind: 'bark', base: [78, 78, 84], dark: [56, 56, 62] },
  'block/blackstone': { kind: 'noise', base: [40, 36, 42], amp: 12 },
  'block/magma': { kind: 'speckle', base: [140, 60, 20], dot: [245, 140, 40], p: 0.3 },
  'block/nether_quartz_ore': { kind: 'speckle', base: [111, 54, 52], dot: [235, 230, 225], p: 0.2 },
  'block/nether_gold_ore': { kind: 'speckle', base: [111, 54, 52], dot: [250, 200, 60], p: 0.2 },
  'block/ancient_debris_top': { kind: 'rings', base: [95, 63, 50], dark: [70, 45, 35] },
  'block/ancient_debris_side': { kind: 'speckle', base: [95, 63, 50], dot: [160, 120, 90], p: 0.25 },
  'block/netherite_block': { kind: 'noise', base: [70, 66, 68], amp: 12 },
  'block/nether_bricks': { kind: 'bricks', base: [44, 22, 26], mortar: [28, 12, 14] },
  'block/end_stone': { kind: 'noise', base: [219, 222, 158], amp: 14 },
  'block/obsidian': { kind: 'noise', base: [20, 14, 30], amp: 14 },
  'block/end_portal_frame_top': { kind: 'bricks', base: [210, 215, 160], mortar: [150, 150, 110] },
  'block/end_portal_frame_side': { kind: 'bricks', base: [200, 205, 150], mortar: [140, 140, 100] },
  'block/stone_bricks': { kind: 'bricks', base: [125, 125, 125], mortar: [88, 88, 88] },
  'block/bricks': { kind: 'bricks', base: [150, 97, 83], mortar: [190, 185, 175] },
  'block/spawner': { kind: 'cage', base: [50, 60, 70] },
  'block/cobweb': { kind: 'web' },

  // Metallblöcke
  'block/coal_block': { kind: 'noise', base: [25, 25, 25], amp: 8 },
  'block/iron_block': { kind: 'block', base: [219, 219, 219] },
  'block/copper_block': { kind: 'block', base: [192, 107, 79] },
  'block/gold_block': { kind: 'block', base: [246, 208, 61] },
  'block/redstone_block': { kind: 'block', base: [170, 30, 20] },
  'block/lapis_block': { kind: 'block', base: [31, 67, 140] },
  'block/diamond_block': { kind: 'block', base: [98, 237, 228] },
  'block/emerald_block': { kind: 'block', base: [42, 203, 87] },
  'block/white_wool': { kind: 'noise', base: [234, 236, 236], amp: 12 },
  'block/red_wool': { kind: 'noise', base: [160, 39, 34], amp: 14 },

  // Funktionsblöcke
  'block/crafting_table_top': { kind: 'planks', base: [162, 130, 78], dark: [88, 60, 36] },
  'block/crafting_table_side': { kind: 'planks', base: [162, 130, 78], dark: [120, 90, 56] },
  'block/crafting_table_front': { kind: 'planks', base: [162, 130, 78], dark: [88, 60, 36] },
  'block/furnace_top': { kind: 'noise', base: [118, 118, 118], amp: 20 },
  'block/furnace_side': { kind: 'speckle', base: [118, 118, 118], dot: [96, 96, 96], p: 0.3 },
  'block/furnace_front': { kind: 'furnace', base: [118, 118, 118], mouth: [40, 40, 40] },
  'block/furnace_front_on': { kind: 'furnace', base: [118, 118, 118], mouth: [240, 120, 30] },
  'block/enchanting_table_top': { kind: 'noise', base: [150, 40, 50], amp: 14 },
  'block/enchanting_table_side': { kind: 'noise', base: [70, 38, 42], amp: 14 },
  'block/anvil_top': { kind: 'noise', base: [70, 70, 74], amp: 14 },
  'block/anvil': { kind: 'noise', base: [58, 58, 62], amp: 14 },
  'block/brewing_stand': { kind: 'speckle', base: [120, 120, 120], dot: [180, 150, 60], p: 0.2 },
  'block/torch': { kind: 'stick', color: [240, 190, 90], width: 2 },
  'block/redstone_torch': { kind: 'stick', color: [220, 40, 40], width: 2 },
  'block/lever': { kind: 'stick', color: [150, 120, 90], width: 2 },
  'block/ladder': { kind: 'ladder', color: [140, 100, 60] },
  'block/rail': { kind: 'rail', color: [160, 140, 100] },
  'block/redstone_dust_dot': { kind: 'dust', color: [200, 30, 30] },
  'block/glass': { kind: 'glass', base: [200, 230, 255], border: [215, 240, 255], alpha: 0 },
  'block/cactus_top': { kind: 'speckle', base: [60, 110, 40], dot: [40, 80, 30], p: 0.2 },
  'block/cactus_side': { kind: 'cactus' },
  'block/cactus_bottom': { kind: 'speckle', base: [60, 110, 40], dot: [40, 80, 30], p: 0.2 },
  'block/farmland': { kind: 'furrows', base: [126, 91, 60], dark: [96, 66, 42] },
  'block/farmland_moist': { kind: 'furrows', base: [84, 58, 36], dark: [62, 42, 26] },
  'block/short_grass': { kind: 'plant', color: [110, 160, 70], shape: 'blades' },
  'block/fern': { kind: 'plant', color: [80, 140, 60], shape: 'fern' },
  'block/dead_bush': { kind: 'plant', color: [140, 100, 50], shape: 'bush' },
  'block/dandelion': { kind: 'plant', color: [80, 150, 60], flower: [250, 230, 60] },
  'block/poppy': { kind: 'plant', color: [80, 150, 60], flower: [220, 40, 40] },
  'block/blue_orchid': { kind: 'plant', color: [80, 150, 60], flower: [50, 170, 220] },
  'block/allium': { kind: 'plant', color: [80, 150, 60], flower: [190, 110, 230] },
  'block/azure_bluet': { kind: 'plant', color: [80, 150, 60], flower: [235, 240, 240] },
  'block/oxeye_daisy': { kind: 'plant', color: [80, 150, 60], flower: [245, 245, 235] },
  'block/cornflower': { kind: 'plant', color: [80, 150, 60], flower: [70, 100, 230] },
  'block/red_mushroom': { kind: 'mushroom', cap: [210, 40, 40] },
  'block/brown_mushroom': { kind: 'mushroom', cap: [140, 100, 60] },
  'block/red_mushroom_block': { kind: 'spots', base: [200, 40, 40], dot: [240, 230, 220] },
  'block/brown_mushroom_block': { kind: 'spots', base: [150, 110, 70], dot: [200, 190, 170] },
  'block/mushroom_stem': { kind: 'noise', base: [220, 214, 200], amp: 10 },
  'block/sugar_cane': { kind: 'plant', color: [120, 190, 90], shape: 'cane' },
  'block/wheat_stage0': { kind: 'plant', color: [100, 160, 60], shape: 'crop', height: 0.25 },
  'block/wheat_stage1': { kind: 'plant', color: [100, 160, 60], shape: 'crop', height: 0.35 },
  'block/wheat_stage2': { kind: 'plant', color: [100, 160, 60], shape: 'crop', height: 0.45 },
  'block/wheat_stage3': { kind: 'plant', color: [110, 165, 60], shape: 'crop', height: 0.55 },
  'block/wheat_stage4': { kind: 'plant', color: [120, 170, 60], shape: 'crop', height: 0.65 },
  'block/wheat_stage5': { kind: 'plant', color: [150, 170, 60], shape: 'crop', height: 0.75 },
  'block/wheat_stage6': { kind: 'plant', color: [180, 170, 70], shape: 'crop', height: 0.85 },
  'block/wheat_stage7': { kind: 'plant', color: [205, 180, 80], shape: 'crop', height: 0.95 },
  'block/carrots_stage0': { kind: 'plant', color: [90, 150, 60], shape: 'crop', height: 0.3 },
  'block/carrots_stage1': { kind: 'plant', color: [90, 150, 60], shape: 'crop', height: 0.5 },
  'block/carrots_stage2': { kind: 'plant', color: [100, 160, 60], shape: 'crop', height: 0.7 },
  'block/carrots_stage3': { kind: 'plant', color: [110, 170, 60], shape: 'crop', height: 0.9 },
  'block/potatoes_stage0': { kind: 'plant', color: [90, 150, 60], shape: 'crop', height: 0.3 },
  'block/potatoes_stage1': { kind: 'plant', color: [90, 150, 60], shape: 'crop', height: 0.5 },
  'block/potatoes_stage2': { kind: 'plant', color: [100, 160, 60], shape: 'crop', height: 0.7 },
  'block/potatoes_stage3': { kind: 'plant', color: [110, 170, 60], shape: 'crop', height: 0.9 },
  'block/nether_wart_stage0': { kind: 'plant', color: [120, 30, 40], shape: 'crop', height: 0.3 },
  'block/nether_wart_stage1': { kind: 'plant', color: [130, 30, 40], shape: 'crop', height: 0.55 },
  'block/nether_wart_stage2': { kind: 'plant', color: [150, 30, 40], shape: 'crop', height: 0.85 },
  'block/oak_door_bottom': { kind: 'door', base: [162, 130, 78] },
  'block/oak_door_top': { kind: 'door', base: [162, 130, 78] },
  'block/redstone_dust_line0': { kind: 'dust', color: [200, 30, 30] },

  // Blätter, Setzlinge
  ...Object.fromEntries(
    Object.keys(WOOD).flatMap((wood) => [
      [`block/${wood}_leaves`, { ...GRAY_LEAVES, kind: 'leaves' }],
      [`block/${wood}_sapling`, { kind: 'plant', color: [90, 150, 60], shape: 'sapling' }],
      [`block/${wood}_log`, { kind: 'bark', base: WOOD[wood].log, dark: darker(WOOD[wood].log) }],
      [`block/${wood}_log_top`, { kind: 'rings', base: WOOD[wood].log, dark: darker(WOOD[wood].log) }],
      [`block/${wood}_planks`, { kind: 'planks', base: WOOD[wood].plank, dark: darker(WOOD[wood].plank) }],
    ])
  ),
  ...Object.fromEntries(
    Object.entries(ORES).flatMap(([ore, color]) => [
      [`block/${ore}_ore`, { kind: 'speckle', base: [125, 125, 125], dot: color, p: 0.22 }],
      [`block/deepslate_${ore}_ore`, { kind: 'speckle', base: [76, 76, 82], dot: color, p: 0.22 }],
    ])
  ),
};

function darker(rgb) {
  return rgb.map((v) => Math.round(v * 0.6));
}

const DEFAULT_BLOCK = { kind: 'noise', amp: 26 };

/** Animationsdaten je Name (Anzahl Frames, Dauer je Frame in Ticks). */
const ANIMATED_FRAMES = new Set(['water', 'lava', 'fire', 'portal']);

function defaultDef(name) {
  const h = hashString(name);
  return {
    ...DEFAULT_BLOCK,
    base: [60 + (h & 0x7f), 60 + ((h >>> 8) & 0x7f), 60 + ((h >>> 16) & 0x7f)],
  };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function setPx(data, offset, r, g, b, a = 255) {
  data[offset] = clampByte(r);
  data[offset + 1] = clampByte(g);
  data[offset + 2] = clampByte(b);
  data[offset + 3] = clampByte(a);
}

function jitter(rnd, base, amp) {
  const j = (rnd() - 0.5) * amp;
  return [base[0] + j, base[1] + j * 0.9, base[2] + j * 0.8];
}

/** Zeichnet ein Muster. Gibt die RGBA-Pixel einer Kachel zurück. */
function paintTile(def, frame, seed) {
  const data = new Uint8ClampedArray(TILE * TILE * 4);
  const rnd = mulberry32(seed);
  const at = (x, y) => (y * TILE + x) * 4;
  const each = (fn) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) fn(x, y, at(x, y));
    }
  };
  const base = def.base || [128, 128, 128];

  switch (def.kind) {
    case 'noise':
      each((x, y, i) => {
        const [r, g, b] = jitter(rnd, base, def.amp ?? 26);
        setPx(data, i, r, g, b);
      });
      break;

    case 'block':
      each((x, y, i) => {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        const [r, g, b] = jitter(rnd, base, 8);
        const f = edge ? 0.82 : 1;
        setPx(data, i, r * f, g * f, b * f);
      });
      break;

    case 'speckle': {
      const dot = def.dot;
      each((x, y, i) => {
        if (rnd() < (def.p ?? 0.25)) setPx(data, i, dot[0] + (rnd() - 0.5) * 10, dot[1] + (rnd() - 0.5) * 10, dot[2] + (rnd() - 0.5) * 10);
        else {
          const [r, g, b] = jitter(rnd, base, 18);
          setPx(data, i, r, g, b);
        }
      });
      break;
    }

    case 'dots': {
      each((x, y, i) => {
        const dot = (x * 3 + y * 5) % 7 === 0 || rnd() < 0.08;
        const c = dot ? def.dot : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'cobble': {
      const cellW = 6;
      const cellH = 4;
      const tone = Array.from({ length: 64 }, () => (rnd() - 0.5) * (def.amp ?? 30));
      each((x, y, i) => {
        const row = Math.floor(y / cellH);
        const shift = (row % 2) * 3;
        const col = Math.floor((x + shift) / cellW);
        const edge = (x + shift) % cellW === 0 || y % cellH === 0;
        const t = tone[(row * 7 + col * 3) % tone.length];
        const v = edge ? base[0] - 45 : base[0] + t + (rnd() - 0.5) * 12;
        setPx(data, i, v, v, v);
      });
      break;
    }

    case 'grassSide': {
      each((x, y, i) => {
        const depth = 3 + ((x * 5) % 3 === 0 ? 1 : 0);
        const [r, g, b] = y < depth ? jitter(rnd, [96, 150, 58], 40) : jitter(rnd, [134, 96, 67], 34);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'rings': {
      const dark = def.dark;
      each((x, y, i) => {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const ring = Math.floor(d) % 3 === 0;
        const c = ring ? dark : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'bark': {
      const dark = def.dark;
      each((x, y, i) => {
        const stripe = x % 4 === 0 || (x % 7 === 3 && y % 5 < 3);
        const c = stripe ? dark : base;
        const [r, g, b] = jitter(rnd, c, 14);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'planks': {
      const dark = def.dark ?? darker(base);
      each((x, y, i) => {
        const board = Math.floor(y / 4);
        const seam = y % 4 === 3 || (x + board * 5) % 16 === 0;
        const tone = ((board * 37) % 9) - 4;
        const c = seam ? dark : [base[0] + tone, base[1] + tone, base[2] + tone];
        const [r, g, b] = jitter(rnd, c, 10);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'bands': {
      each((x, y, i) => {
        const c = Math.floor(y / 3) % 2 === 0 ? base : def.band;
        const [r, g, b] = jitter(rnd, c, 10);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'bricks': {
      const mortar = def.mortar;
      each((x, y, i) => {
        const row = Math.floor(y / 4);
        const offset = (row % 2) * 4;
        const mortarPx = y % 4 === 3 || (x + offset) % 8 === 7;
        const c = mortarPx ? mortar : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'glass': {
      each((x, y, i) => {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        if (edge) setPx(data, i, def.border[0], def.border[1], def.border[2], 255);
        else setPx(data, i, base[0], base[1], base[2], def.alpha ?? 0);
      });
      break;
    }

    case 'leaves':
      each((x, y, i) => {
        const hole = rnd() < 0.22;
        const [r, g, b] = jitter(rnd, base, 60);
        setPx(data, i, r, g, b, hole ? 0 : 255);
      });
      break;

    case 'plant': {
      const c = def.color;
      const stem = def.shape === 'blades' || def.shape === 'fern' || def.shape === 'cane' || def.shape === 'crop' || def.shape === 'sapling';
      each((x, y, i) => {
        let on = false;
        if (def.shape === 'crop') {
          const top = TILE - Math.round((def.height ?? 0.5) * TILE);
          on = y >= top && (x === 7 || x === 8 || (y % 4 === 0 && x > 4 && x < 11));
        } else if (def.shape === 'sapling') {
          on = (x >= 6 && x <= 9 && y >= 6 && y <= 10) || (x >= 4 && x <= 11 && y >= 3 && y <= 6 && (x + y) % 2 === 0);
        } else if (def.shape === 'cane') {
          on = x >= 6 && x <= 9 && (y % 5 !== 0);
        } else if (def.shape === 'bush') {
          on = (x - 7.5) ** 2 / 20 + (y - 10) ** 2 / 8 < 1 && rnd() < 0.8;
        } else if (stem) {
          on = Math.abs(x - 7.5 - Math.sin(y * 0.8) * 1.5) < 1 + (rnd() < 0.3 ? 0.5 : 0) && y > 4;
          if (def.shape === 'fern') on = on || (Math.abs(x - 7.5) < 3 && y > 6 && y < 14 && rnd() < 0.5);
        } else {
          on = (x - 7.5) ** 2 + (y - 7.5) ** 2 < 25;
        }
        if (def.flower && (x - 7.5) ** 2 + (y - 4) ** 2 < 6) {
          const [r, g, b] = jitter(rnd, def.flower, 14);
          setPx(data, i, r, g, b);
          return;
        }
        if (!on) return;
        const [r, g, b] = jitter(rnd, c, 22);
        setPx(data, i, r, g, b);
      });
      break;
    }

    case 'mushroom':
      each((x, y, i) => {
        const cap = (x - 7.5) ** 2 / 36 + (y - 6) ** 2 / 16 < 1;
        const stemPx = x >= 6 && x <= 9 && y >= 8 && y <= 14;
        if (cap) {
          const spot = (x + y) % 5 === 0;
          const [r, g, b] = spot ? [240, 240, 230] : jitter(rnd, def.cap, 16);
          setPx(data, i, r, g, b);
        } else if (stemPx) {
          const [r, g, b] = jitter(rnd, [220, 214, 200], 12);
          setPx(data, i, r, g, b);
        }
      });
      break;

    case 'spots':
      each((x, y, i) => {
        const spot = (x + y * 2) % 6 === 0 || (x % 5 === 2 && y % 4 === 1);
        const c = spot ? def.dot : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;

    case 'stick': {
      const w = def.width ?? 2;
      each((x, y, i) => {
        const on = Math.abs(x - 7.5) < w / 2 + 0.5 && y > 3;
        if (on) {
          const [r, g, b] = jitter(rnd, def.color, 10);
          setPx(data, i, r, g, b);
        }
      });
      break;
    }

    case 'ladder':
      each((x, y, i) => {
        const rail = x === 2 || x === 13;
        const rung = y % 4 === 1 && x > 2 && x < 13;
        if (rail || rung) {
          const [r, g, b] = jitter(rnd, def.color, 12);
          setPx(data, i, r, g, b);
        }
      });
      break;

    case 'rail':
      each((x, y, i) => {
        const rail = x === 1 || x === 14;
        const tie = y % 5 === 2 && x > 1 && x < 14;
        if (rail || tie) {
          const [r, g, b] = jitter(rnd, def.color, 14);
          setPx(data, i, r, g, b);
        }
      });
      break;

    case 'dust':
      each((x, y, i) => {
        if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 14 || (Math.abs(x - 7.5) < 0.6 && Math.abs(y - 7.5) < 5)) {
          const [r, g, b] = jitter(rnd, def.color, 16);
          setPx(data, i, r, g, b);
        }
      });
      break;

    case 'web':
      each((x, y, i) => {
        const line = x === y || x + y === 15 || x === 8 || y === 8;
        if (line) setPx(data, i, 240, 240, 240);
      });
      break;

    case 'cage':
      each((x, y, i) => {
        const bar = x % 4 === 0 || y % 4 === 0;
        const [r, g, b] = bar ? jitter(rnd, [30, 30, 36], 10) : [0, 0, 0];
        setPx(data, i, r, g, b, bar ? 255 : 0);
      });
      break;

    case 'furnace':
      each((x, y, i) => {
        const mouth = x >= 4 && x <= 11 && y >= 6 && y <= 12;
        const c = mouth ? def.mouth : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;

    case 'cactus':
      each((x, y, i) => {
        const rib = x % 4 === 1;
        const spike = (x + y) % 9 === 0 && rnd() < 0.5;
        const c = spike ? [230, 230, 200] : rib ? [40, 90, 30] : [70, 130, 50];
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;

    case 'furrows':
      each((x, y, i) => {
        const furrow = y % 4 === 1;
        const c = furrow ? def.dark : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;

    case 'door':
      each((x, y, i) => {
        const panel = (x > 2 && x < 13 && y > 2 && y < 13) && !(x > 4 && x < 11 && y > 4 && y < 11);
        const c = panel ? [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8] : base;
        const [r, g, b] = jitter(rnd, c, 12);
        setPx(data, i, r, g, b);
      });
      break;

    case 'stars':
      each((x, y, i) => {
        const star = rnd() < 0.04;
        const [r, g, b] = star ? [230, 230, 255] : jitter(rnd, base, 8);
        setPx(data, i, r, g, b);
      });
      break;

    case 'water':
      each((x, y, i) => {
        const wave = Math.sin((x + frame * 3) * 0.9) * 0.5 + Math.sin((y - frame * 2) * 1.3) * 0.5;
        const v = 205 + wave * 35 + (rnd() - 0.5) * 18;
        setPx(data, i, v, v, v);
      });
      break;

    case 'lava':
      each((x, y, i) => {
        const swirl = Math.sin(x + y * 0.6 + frame * 2.2) * 0.9;
        const hot = swirl > 0.2 ? 1 : 0;
        setPx(data, i, 220 + hot * 35 + (rnd() - 0.5) * 20, 90 + swirl * 60 + (rnd() - 0.5) * 20, 20 + hot * 40);
      });
      break;

    case 'fire':
      each((x, y, i) => {
        const flicker = Math.sin(x * 1.7 + frame * 1.9 + y * 0.5) * 0.5 + 0.5;
        const height = (TILE - y) / TILE;
        const alpha = height > 0.15 + flicker * 0.25 ? 255 : 0;
        setPx(data, i, 255, 170 + height * 70, 40 + flicker * 60, alpha);
      });
      break;

    case 'portal':
      each((x, y, i) => {
        const v = Math.sin(x * 0.8 + y * 0.6 + frame * 1.5) * 0.5 + 0.5;
        setPx(data, i, 90 + v * 110, 30 + v * 40, 160 + v * 90, 230);
      });
      break;

    default:
      each((x, y, i) => {
        const [r, g, b] = jitter(rnd, base, def.amp ?? 30);
        setPx(data, i, r, g, b);
      });
  }
  return data;
}

/**
 * Liefert ein Canvas (Strip, falls animiert) plus Animationsinfos.
 * @returns {{ canvas: HTMLCanvasElement, frames: number, frametime: number }}
 */
export function createFallbackTexture(name) {
  const def = CATALOG[name] || defaultDef(name);
  const animated = def.kind && ANIMATED_FRAMES.has(def.kind);
  const frames = animated ? def.frames : 1;
  const frametime = animated ? def.frametime : 1;
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE * frames;
  const ctx = canvas.getContext('2d');
  const seed = hashString(name);
  for (let f = 0; f < frames; f++) {
    const pixels = paintTile(def, f, seed);
    ctx.putImageData(new ImageData(pixels, TILE, TILE), 0, f * TILE);
  }
  return { canvas, frames, frametime };
}

/** Magenta-Schwarz-Karo für fehlende Einträge. */
export function createMissingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = ((x >> 3) + (y >> 3)) % 2 === 0 ? '#f0f' : '#000';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { canvas, frames: 1, frametime: 1 };
}

export function hasFallback(name) {
  return Object.prototype.hasOwnProperty.call(CATALOG, name);
}
