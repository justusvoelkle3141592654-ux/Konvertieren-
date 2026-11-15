// Selbst erzeugte Platzhalter-Texturen (16×16 Pixel, Canvas).
// Sie werden verwendet, wenn keine lokalen Originaltexturen vorhanden sind,
// und decken alle Namen ab, die das Register benötigt.
//
// Farbige Oberflächen, die biomabhängig eingefärbt werden (Gras, Laub, Wasser),
// sind bewusst graustufig gehalten – genau wie die Originaltexturen.
import { hashString, mulberry32 } from '../engine/random.js';

export const TILE = 16;

const WATER_FRAMES = 2;
const LAVA_FRAMES = 3;
const FIRE_FRAMES = 4;
const PORTAL_FRAMES = 4;

/**
 * Katalog: Name → Erzeugungsart. Art und Parameter bestimmen das Muster.
 * Farben sind RGB-Arrays. Weitere Einträge werden in den Phasen ergänzt.
 */
const CATALOG = {
  'block/bedrock': { kind: 'noise', base: [76, 76, 76], amp: 70 },
  'block/stone': { kind: 'noise', base: [125, 125, 125], amp: 30 },
  'block/cobblestone': { kind: 'cobble', base: [120, 120, 120], amp: 34 },
  'block/dirt': { kind: 'noise', base: [134, 96, 67], amp: 34 },
  'block/grass_block_top': { kind: 'noise', base: [196, 196, 196], amp: 26 }, // graustufig, wird eingefärbt
  'block/grass_block_side': { kind: 'grassSide' },
  'block/water_still': { kind: 'water', frames: WATER_FRAMES, frametime: 2 }, // graustufig, wird eingefärbt
  'block/water_flow': { kind: 'water', frames: WATER_FRAMES, frametime: 2 },
  'block/lava_still': { kind: 'lava', frames: LAVA_FRAMES, frametime: 3 },
  'block/lava_flow': { kind: 'lava', frames: LAVA_FRAMES, frametime: 3 },
  'block/fire_0': { kind: 'fire', frames: FIRE_FRAMES, frametime: 2 },
  'block/nether_portal': { kind: 'portal', frames: PORTAL_FRAMES, frametime: 2 },
};

/** Wird für alle nicht gelisteten Namen verwendet: Farbe aus dem Namens-Hash. */
function defaultDef(name) {
  const h = hashString(name);
  return {
    kind: 'noise',
    base: [60 + (h & 0x7f), 60 + ((h >>> 8) & 0x7f), 60 + ((h >>> 16) & 0x7f)],
    amp: 26,
  };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** Schreibt einen Pixel in den RGBA-Puffer. */
function setPx(data, offset, r, g, b, a = 255) {
  data[offset] = clampByte(r);
  data[offset + 1] = clampByte(g);
  data[offset + 2] = clampByte(b);
  data[offset + 3] = clampByte(a);
}

function noisyColor(rnd, base, amp) {
  const j = (rnd() - 0.5) * amp;
  return [base[0] + j, base[1] + j * 0.9, base[2] + j * 0.8];
}

/** Erzeugt die Pixel eines Frames (RGBA-Array der Größe TILE×TILE). */
function paintTile(def, frame, seed) {
  const data = new Uint8ClampedArray(TILE * TILE * 4);
  const rnd = mulberry32(seed);
  const at = (x, y) => (y * TILE + x) * 4;

  switch (def.kind) {
    case 'noise':
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const [r, g, b] = noisyColor(rnd, def.base, def.amp);
          setPx(data, at(x, y), r, g, b);
        }
      }
      break;

    case 'cobble': {
      // Unregelmäßige Steine: jede Zelle hat einen leicht anderen Grauton, Fugen sind dunkler.
      const cellW = 6;
      const cellH = 4;
      const tone = [];
      for (let i = 0; i < 64; i++) tone.push((rnd() - 0.5) * def.amp);
      for (let y = 0; y < TILE; y++) {
        const row = Math.floor(y / cellH);
        const shift = (row % 2) * 3;
        for (let x = 0; x < TILE; x++) {
          const col = Math.floor((x + shift) / cellW);
          const fx = (x + shift) % cellW;
          const fy = y % cellH;
          const edge = fx === 0 || fy === 0;
          const t = tone[(row * 7 + col * 3) % tone.length];
          const v = edge ? def.base[0] - 45 : def.base[0] + t + (rnd() - 0.5) * 12;
          setPx(data, at(x, y), v, v, v);
        }
      }
      break;
    }

    case 'grassSide':
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          // Unregelmäßig ausgefranster Grasrand (3 oder 4 Pixel tief)
          const grassDepth = 3 + ((x * 5) % 3 === 0 ? 1 : 0);
          if (y < grassDepth) {
            const [r, g, b] = noisyColor(rnd, [96, 150, 58], 40);
            setPx(data, at(x, y), r, g, b);
          } else {
            const [r, g, b] = noisyColor(rnd, [134, 96, 67], 34);
            setPx(data, at(x, y), r, g, b);
          }
        }
      }
      break;

    case 'water':
      // Graustufige Wellen; die Färbung kommt aus dem Biom.
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const wave = Math.sin((x + frame * 3) * 0.9) * 0.5 + Math.sin((y - frame * 2) * 1.3) * 0.5;
          const v = 205 + wave * 35 + (rnd() - 0.5) * 18;
          setPx(data, at(x, y), v, v, v);
        }
      }
      break;

    case 'lava':
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const swirl = Math.sin((x + y * 0.6 + frame * 2.2) * 0.9);
          const hot = swirl > 0.2 ? 1 : 0;
          const r = 220 + hot * 35 + (rnd() - 0.5) * 20;
          const g = 90 + swirl * 60 + (rnd() - 0.5) * 20;
          setPx(data, at(x, y), r, g, 20 + hot * 40);
        }
      }
      break;

    case 'fire':
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const flicker = Math.sin((x * 1.7 + frame * 1.9) + y * 0.5) * 0.5 + 0.5;
          const height = (TILE - y) / TILE;
          const alpha = height > 0.15 + flicker * 0.25 ? 255 : 0;
          setPx(data, at(x, y), 255, 170 + height * 70, 40 + flicker * 60, alpha);
        }
      }
      break;

    case 'portal':
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const v = Math.sin((x * 0.8 + y * 0.6) + frame * 1.5) * 0.5 + 0.5;
          setPx(data, at(x, y), 90 + v * 110, 30 + v * 40, 160 + v * 90);
        }
      }
      break;

    default:
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const [r, g, b] = noisyColor(rnd, def.base || [128, 128, 128], def.amp || 30);
          setPx(data, at(x, y), r, g, b);
        }
      }
  }
  return data;
}

/**
 * Liefert ein Canvas (Strip, falls animiert) plus Animationsinfos.
 * @returns {{ canvas: HTMLCanvasElement, frames: number, frametime: number }}
 */
export function createFallbackTexture(name) {
  const def = CATALOG[name] || defaultDef(name);
  const frames = def.frames || 1;
  const frametime = def.frametime || 1;
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE * frames;
  const ctx = canvas.getContext('2d');
  const seed = hashString(name);
  for (let f = 0; f < frames; f++) {
    const pixels = paintTile(def, f, seed);
    // Für animierte Frames identische Zufallsfolge, damit nur das Muster wandert.
    const image = new ImageData(pixels, TILE, TILE);
    ctx.putImageData(image, 0, f * TILE);
  }
  return { canvas, frames, frametime };
}

/** Magenta-Schwarz-Karo für unbekannte Texturen (sichtbar, aber harmlos). */
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
