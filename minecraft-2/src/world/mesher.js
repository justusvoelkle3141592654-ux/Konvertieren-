// Chunk-Meshing: erzeugt aus den Blockdaten eines Chunks Vertex- und Index-Arrays.
//  - Face Culling: Flächen zu vollen, undurchsichtigen Nachbarn entfallen
//  - Ambient Occlusion pro Vertex (drei Nachbarzellen je Ecke)
//  - Weiche Beleuchtung: Licht wird über die vier angrenzenden Zellen gemittelt
//  - Transparente Blöcke landen in einer eigenen Geometrie (separater Pass)
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { BLOCKS } from './blocks.js';
import { chunkIndex } from './chunk.js';

export const PAD = CHUNK_SIZE + 2; // Chunk plus eine Blockreihe Rand in x und z
const PAD_VOLUME = PAD * PAD * WORLD_HEIGHT;

/** Index in den gepufferten Arrays (px, pz ∈ [0, PAD), y = Welthöhe). */
export function padIndex(px, y, pz) {
  return ((y - WORLD_MIN_Y) * PAD + pz) * PAD + px;
}

// Flächen: 0 +x (Ost), 1 −x (West), 2 +y (Oben), 3 −y (Unten), 4 +z (Süd), 5 −z (Nord)
const FACE_NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

// Eckpunkte je Fläche, gegen den Uhrzeigersinn von außen gesehen.
const FACE_CORNERS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];

// Seitenschattierung: Oben 100 %, Nord/Süd 80 %, Ost/West 60 %, Unten 50 %
export const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
// Schlüssel der Textur-Zuordnung je Fläche (siehe faces() in blocks.js)
const FACE_TEX_KEY = ['east', 'west', 'top', 'bottom', 'south', 'north'];
// Ambient-Occlusion-Faktor je Anzahl verdeckender Nachbarn (0–3)
const AO_FACTOR = [1.0, 0.8, 0.6, 0.45];

const OCCLUDES = new Uint8Array(256); // voller, undurchsichtiger Würfel
const SAME_CULL = new Uint8Array(256); // Blöcke, deren Flächen untereinander entfallen
for (const def of BLOCKS) {
  OCCLUDES[def.id] = def.shape === 'cube' && def.opaque ? 1 : 0;
  SAME_CULL[def.id] = def.transparent || def.cutout ? 1 : 0;
}

/** Gepufferte Kopie eines Chunks mit einem Rand aus den Nachbarn (wird wiederverwendet). */
export class PaddedBuffers {
  constructor() {
    this.blocks = new Uint8Array(PAD_VOLUME);
    this.meta = new Uint8Array(PAD_VOLUME);
    this.light = new Uint8Array(PAD_VOLUME);
  }

  /**
   * @param {import('./chunk.js').Chunk} chunk Mittelpunkt
   * @param {(cx:number, cz:number) => import('./chunk.js').Chunk|null} getChunk liefert geladene Nachbarn
   */
  fill(chunk, getChunk) {
    const { blocks, meta, light } = this;
    for (let pz = 0; pz < PAD; pz++) {
      for (let px = 0; px < PAD; px++) {
        const lx = px - 1;
        const lz = pz - 1;
        const cxOff = lx < 0 ? -1 : lx >= CHUNK_SIZE ? 1 : 0;
        const czOff = lz < 0 ? -1 : lz >= CHUNK_SIZE ? 1 : 0;
        const src = cxOff === 0 && czOff === 0 ? chunk : getChunk(chunk.cx + cxOff, chunk.cz + czOff);
        const sx = (lx + CHUNK_SIZE) % CHUNK_SIZE;
        const sz = (lz + CHUNK_SIZE) % CHUNK_SIZE;
        // Fehlender Nachbar: keine Blöcke (Außenflächen bleiben sichtbar), Licht vom eigenen Rand
        const edgeX = Math.min(CHUNK_SIZE - 1, Math.max(0, lx));
        const edgeZ = Math.min(CHUNK_SIZE - 1, Math.max(0, lz));
        for (let yi = 0; yi < WORLD_HEIGHT; yi++) {
          const y = WORLD_MIN_Y + yi;
          const dst = (yi * PAD + pz) * PAD + px;
          if (src) {
            const si = chunkIndex(sx, y, sz);
            blocks[dst] = src.blocks[si];
            meta[dst] = src.meta[si];
            light[dst] = src.light[si];
          } else {
            blocks[dst] = 0;
            meta[dst] = 0;
            light[dst] = chunk.light[chunkIndex(edgeX, y, edgeZ)];
          }
        }
      }
    }
  }
}

class GeometryBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.light = [];
    this.tint = [];
    this.index = [];
    this.count = 0;
  }

  /**
   * Fügt ein Viereck hinzu.
   * corners: 4 × [x,y,z]; uvs: 8 Zahlen; lights: 8 Zahlen (Himmel, Block je Ecke);
   * ao: 4 Faktoren; tint: [r,g,b]
   */
  quad(corners, uvs, lights, ao, shade, tint) {
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      this.pos.push(c[0], c[1], c[2]);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.light.push(lights[i * 2], lights[i * 2 + 1], ao[i], shade);
      this.tint.push(tint[0], tint[1], tint[2], 1);
    }
    // Die Diagonale mit der größeren Eckensumme wählen (vermeidet dunkle Streifen)
    if (ao[0] + ao[2] >= ao[1] + ao[3]) {
      this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.index.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
    }
    this.count += 4;
  }

  toData() {
    if (this.count === 0) return null;
    return {
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      lights: new Float32Array(this.light),
      tints: new Float32Array(this.tint),
      indices: this.count > 65535 ? new Uint32Array(this.index) : new Uint16Array(this.index),
    };
  }
}

/** Entscheidet, ob eine Fläche eines Blocks gezeichnet werden muss. */
function drawsFace(def, neighborId) {
  if (OCCLUDES[neighborId]) return false;
  if (SAME_CULL[def.id] && neighborId === def.id) return false;
  return true;
}

/** Blockkennung an einer gepufferten Position (außerhalb der Welt: Luft). */
function blockAt(buf, px, y, pz) {
  if (y > WORLD_MAX_Y || y < WORLD_MIN_Y) return 0;
  return buf.blocks[padIndex(px, y, pz)];
}

/** Licht-Byte (Himmel << 4 | Block). Über der Welt ist der Himmel offen. */
function lightAt(buf, px, y, pz) {
  if (y > WORLD_MAX_Y) return 0xf0;
  if (y < WORLD_MIN_Y) return 0;
  return buf.light[padIndex(px, y, pz)];
}

const DEFAULT_TINTS = {
  grass: [0.57, 0.74, 0.35],
  foliage: [0.47, 0.71, 0.27],
  water: [0.25, 0.46, 0.89],
};

function defaultTint(def) {
  return DEFAULT_TINTS[def.tint] || [1, 1, 1];
}

// Wiederverwendete Puffer für die Vertex-Schleife (keine Allokation pro Fläche)
const acc = { sky: 0, block: 0, n: 0 };

function addLightSample(buf, px, y, pz) {
  const b = blockAt(buf, px, y, pz);
  if (OCCLUDES[b]) return;
  const li = lightAt(buf, px, y, pz);
  acc.sky += li >> 4;
  acc.block += li & 15;
  acc.n++;
}

/**
 * Baut die Geometrie eines Chunks.
 * @param {PaddedBuffers} buf gefüllte Pufferarrays (Chunk + Rand)
 * @param {import('./chunk.js').Chunk} chunk
 * @param {{ uv: (name:string) => number[] }} atlas Texture-Atlas (liefert UV-Rechtecke)
 * @param {{ smoothLighting?: boolean, tintFor?: (def:object) => number[] }} options
 * @returns {{ opaque: object|null, transparent: object|null }}
 */
export function buildChunkGeometry(buf, chunk, atlas, options = {}) {
  const smooth = options.smoothLighting !== false;
  const tintFor = options.tintFor || defaultTint;
  const opaque = new GeometryBuilder();
  const transparent = new GeometryBuilder();

  const corners = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const uvs = new Float32Array(8);
  const lights = new Float32Array(8);
  const ao = [1, 1, 1, 1];
  const tintOne = [1, 1, 1];

  for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
    const yi = y - WORLD_MIN_Y;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const px = x + 1;
        const pz = z + 1;
        const id = buf.blocks[(yi * PAD + pz) * PAD + px];
        if (id === 0) continue;
        const def = BLOCKS[id];
        const builder = def.transparent ? transparent : opaque;

        for (let f = 0; f < 6; f++) {
          const nx = FACE_NORMALS[f][0];
          const ny = FACE_NORMALS[f][1];
          const nz = FACE_NORMALS[f][2];
          const neighborY = y + ny;
          if (neighborY < WORLD_MIN_Y) continue; // Boden der Welt (Bedrock) wird nicht gezeichnet
          const neighborId = neighborY > WORLD_MAX_Y ? 0 : buf.blocks[((neighborY - WORLD_MIN_Y) * PAD + (pz + nz)) * PAD + (px + nx)];
          if (!drawsFace(def, neighborId)) continue;

          const uv = atlas.uv(def.tex[FACE_TEX_KEY[f]]);
          const faceCorners = FACE_CORNERS[f];
          const axis = f >> 1; // 0: x, 1: y, 2: z
          const t1 = (axis + 1) % 3;
          const t2 = (axis + 2) % 3;

          // Vertex-Positionen, chunk-lokal (x/z: 0–16, y: Welthöhe)
          for (let i = 0; i < 4; i++) {
            const c = faceCorners[i];
            corners[i][0] = x + c[0];
            corners[i][1] = y + c[1];
            corners[i][2] = z + c[2];
          }

          // UV: A=(u0,v1) B=(u0,v0) C=(u1,v0) D=(u1,v1)
          uvs[0] = uv[0]; uvs[1] = uv[3];
          uvs[2] = uv[0]; uvs[3] = uv[1];
          uvs[4] = uv[2]; uvs[5] = uv[1];
          uvs[6] = uv[2]; uvs[7] = uv[3];

          // Zelle vor der Fläche; daraus werden AO und Licht je Ecke abgeleitet
          const fx = px + nx;
          const fy = neighborY;
          const fz = pz + nz;
          for (let i = 0; i < 4; i++) {
            const c = faceCorners[i];
            const s1 = c[t1] * 2 - 1;
            const s2 = c[t2] * 2 - 1;
            // Versatz entlang der beiden Tangentialachsen
            const o1x = t1 === 0 ? s1 : 0;
            const o1y = t1 === 1 ? s1 : 0;
            const o1z = t1 === 2 ? s1 : 0;
            const o2x = t2 === 0 ? s2 : 0;
            const o2y = t2 === 1 ? s2 : 0;
            const o2z = t2 === 2 ? s2 : 0;

            const side1 = OCCLUDES[blockAt(buf, fx + o1x, fy + o1y, fz + o1z)];
            const side2 = OCCLUDES[blockAt(buf, fx + o2x, fy + o2y, fz + o2z)];
            const corner = OCCLUDES[blockAt(buf, fx + o1x + o2x, fy + o1y + o2y, fz + o1z + o2z)];
            const occluded = side1 && side2 ? 3 : side1 + side2 + corner;
            ao[i] = AO_FACTOR[occluded];

            if (smooth) {
              acc.sky = 0;
              acc.block = 0;
              acc.n = 0;
              addLightSample(buf, fx, fy, fz);
              addLightSample(buf, fx + o1x, fy + o1y, fz + o1z);
              addLightSample(buf, fx + o2x, fy + o2y, fz + o2z);
              addLightSample(buf, fx + o1x + o2x, fy + o1y + o2y, fz + o1z + o2z);
              if (acc.n === 0) {
                const li = lightAt(buf, fx, fy, fz);
                acc.sky = li >> 4;
                acc.block = li & 15;
                acc.n = 1;
              }
              lights[i * 2] = acc.sky / acc.n / 15;
              lights[i * 2 + 1] = acc.block / acc.n / 15;
            } else {
              const li = lightAt(buf, fx, fy, fz);
              lights[i * 2] = (li >> 4) / 15;
              lights[i * 2 + 1] = (li & 15) / 15;
            }
          }

          let tint = tintOne;
          if (def.tint && (!def.tintFaces || def.tintFaces.includes(FACE_TEX_KEY[f]))) {
            tint = tintFor(def, chunk, x, z);
          }
          builder.quad(corners, uvs, lights, ao, FACE_SHADE[f], tint);
        }
      }
    }
  }

  return { opaque: opaque.toData(), transparent: transparent.toData() };
}

export const __testing = { FACE_NORMALS, FACE_CORNERS, FACE_TEX_KEY, defaultTint };
