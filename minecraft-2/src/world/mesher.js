// Chunk-Meshing: erzeugt aus den Blockdaten eines Chunks Vertex- und Index-Arrays.
//  - Würfel mit Face Culling, Ambient Occlusion pro Vertex und weicher Beleuchtung
//  - Pflanzen als gekreuzte, beidseitige Flächen; Feldfrüchte nach Wachstumsstufe
//  - Formen (Stufen, Zäune, Türen, Fackeln …) aus Boxen (shapes.js)
//  - Flüssigkeiten mit Oberfläche je Füllstand
//  - Transparente Blöcke in einer eigenen Geometrie (separater Pass)
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { BLOCKS } from './blocks.js';
import { biomeDef } from './biomes.js';
import { chunkIndex } from './chunk.js';
import { connectionsFor, shapeBoxes } from './shapes.js';

export const PAD = CHUNK_SIZE + 2; // Chunk plus eine Blockreihe Rand in x und z
const PAD_VOLUME = PAD * PAD * WORLD_HEIGHT;

/** Index in den gepufferten Arrays (px, pz ∈ [0, PAD), y = Welthöhe). */
export function padIndex(px, y, pz) {
  return ((y - WORLD_MIN_Y) * PAD + pz) * PAD + px;
}

// Flächen: 0 +x (Ost), 1 −x (West), 2 +y (Oben), 3 −y (Unten), 4 +z (Süd), 5 −z (Nord)
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

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
const IS_FLUID = new Uint8Array(256);
for (const def of BLOCKS) {
  OCCLUDES[def.id] = def.shape === 'cube' && def.opaque ? 1 : 0;
  SAME_CULL[def.id] = def.transparent || def.cutout ? 1 : 0;
  IS_FLUID[def.id] = def.shape === 'fluid' ? 1 : 0;
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
   * ao: 4 Faktoren; shade: Seitenschattierung; tint: [r,g,b]
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

/** Entscheidet, ob eine Würfelfläche eines Blocks gezeichnet werden muss. */
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

/** Biomfarbe für eine Spalte (Fallback: Standardfarben). */
export function biomeTint(def, chunk, x, z) {
  const biome = biomeDef(chunk.biomes ? chunk.biomes[z * CHUNK_SIZE + x] : 1);
  if (def.tint === 'grass') return biome.grassRgb;
  if (def.tint === 'foliage') return biome.foliageRgb;
  if (def.tint === 'water') return biome.waterRgb;
  return DEFAULT_TINTS[def.tint] || [1, 1, 1];
}

/**
 * Textur einer Fläche unter Berücksichtigung von Ausrichtung, Zustand und Stufe.
 * @param {object} def Blockdefinition
 * @param {string} key Flächenschlüssel (top, bottom, north, south, east, west)
 * @param {number} meta Metadaten
 */
export function faceTextureName(def, key, meta) {
  if (def.shape === 'door' && (meta & 8) && def.texUpper) return def.texUpper;
  if (def.axis) {
    const axis = meta & 3;
    const isEnd = (axis === 0 && (key === 'top' || key === 'bottom')) || (axis === 1 && (key === 'east' || key === 'west')) || (axis === 2 && (key === 'north' || key === 'south'));
    return isEnd ? def.tex.top : def.tex.side;
  }
  if (def.name === 'farmland' && key === 'top') return meta > 0 ? 'block/farmland_moist' : 'block/farmland';
  if (def.frontTex && def.facing) {
    const facingKey = ['north', 'east', 'south', 'west'][meta & 3];
    if (key === facingKey) return (meta & 4) && def.frontLitTex ? def.frontLitTex : def.frontTex;
  }
  return def.tex[key];
}

// Wiederverwendete Puffer für die Vertex-Schleife (keine Allokation pro Fläche)
const acc = { sky: 0, block: 0, n: 0 };
const corners = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
const uvs = new Float32Array(8);
const lights = new Float32Array(8);
const aoOne = [1, 1, 1, 1];
const aoBuf = [1, 1, 1, 1];
const tintOne = [1, 1, 1];

function addLightSample(buf, px, y, pz) {
  const b = blockAt(buf, px, y, pz);
  if (OCCLUDES[b]) return;
  const li = lightAt(buf, px, y, pz);
  acc.sky += li >> 4;
  acc.block += li & 15;
  acc.n++;
}

/** Gleichmäßige Beleuchtung für Formen (Licht der eigenen Zelle). */
function setUniformLight(buf, px, y, pz) {
  const li = lightAt(buf, px, y, pz);
  const sky = (li >> 4) / 15;
  const blk = (li & 15) / 15;
  for (let i = 0; i < 4; i++) {
    lights[i * 2] = sky;
    lights[i * 2 + 1] = blk;
  }
}

/** UV-Eckpunkte für eine ganze Kachel: A=(u0,v1) B=(u0,v0) C=(u1,v0) D=(u1,v1). */
function fullTileUv(uv) {
  uvs[0] = uv[0]; uvs[1] = uv[3];
  uvs[2] = uv[0]; uvs[3] = uv[1];
  uvs[4] = uv[2]; uvs[5] = uv[1];
  uvs[6] = uv[2]; uvs[7] = uv[3];
}

/**
 * Baut die Geometrie eines Chunks.
 * @param {PaddedBuffers} buf gefüllte Pufferarrays (Chunk + Rand)
 * @param {import('./chunk.js').Chunk} chunk
 * @param {{ uv: (name:string) => number[] }} atlas Texture-Atlas (liefert UV-Rechtecke)
 * @param {{ smoothLighting?: boolean, tintFor?: (def:object, chunk:object, x:number, z:number) => number[] }} options
 * @returns {{ opaque: object|null, transparent: object|null }}
 */
export function buildChunkGeometry(buf, chunk, atlas, options = {}) {
  const smooth = options.smoothLighting !== false;
  const tintFor = options.tintFor || biomeTint;
  const opaque = new GeometryBuilder();
  const transparent = new GeometryBuilder();

  for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
    const yi = y - WORLD_MIN_Y;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const px = x + 1;
        const pz = z + 1;
        const cell = (yi * PAD + pz) * PAD + px;
        const id = buf.blocks[cell];
        if (id === 0) continue;
        const def = BLOCKS[id];
        const builder = def.transparent ? transparent : opaque;
        const meta = buf.meta[cell];

        if (def.shape === 'cube') {
          meshCube(buf, chunk, atlas, def, meta, x, y, z, px, pz, builder, smooth, tintFor);
        } else if (IS_FLUID[id]) {
          meshFluid(buf, chunk, atlas, def, meta, x, y, z, px, pz, def.transparent ? transparent : opaque, tintFor);
        } else if (def.shape === 'cross' || def.shape === 'crop' || def.shape === 'dust') {
          meshPlant(buf, chunk, atlas, def, meta, x, y, z, px, pz, builder, tintFor);
        } else {
          meshBoxes(buf, atlas, def, meta, x, y, z, px, pz, builder);
        }
      }
    }
  }

  return { opaque: opaque.toData(), transparent: transparent.toData() };
}

/** Würfel mit Culling, AO und weicher Beleuchtung. */
function meshCube(buf, chunk, atlas, def, meta, x, y, z, px, pz, builder, smooth, tintFor) {
  for (let f = 0; f < 6; f++) {
    const nx = FACE_NORMALS[f][0];
    const ny = FACE_NORMALS[f][1];
    const nz = FACE_NORMALS[f][2];
    const neighborY = y + ny;
    if (neighborY < WORLD_MIN_Y) continue; // Boden der Welt (Bedrock) wird nicht gezeichnet
    const neighborId = neighborY > WORLD_MAX_Y ? 0 : buf.blocks[((neighborY - WORLD_MIN_Y) * PAD + (pz + nz)) * PAD + (px + nx)];
    if (!drawsFace(def, neighborId)) continue;

    const key = FACE_TEX_KEY[f];
    const uv = atlas.uv(faceTextureName(def, key, meta));
    const faceCorners = FACE_CORNERS[f];
    const axis = f >> 1; // 0: x, 1: y, 2: z
    const t1 = (axis + 1) % 3;
    const t2 = (axis + 2) % 3;

    for (let i = 0; i < 4; i++) {
      const c = faceCorners[i];
      corners[i][0] = x + c[0];
      corners[i][1] = y + c[1];
      corners[i][2] = z + c[2];
    }
    fullTileUv(uv);

    const fx = px + nx;
    const fy = neighborY;
    const fz = pz + nz;
    const ao = aoBuf;
    for (let i = 0; i < 4; i++) {
      const c = faceCorners[i];
      const s1 = c[t1] * 2 - 1;
      const s2 = c[t2] * 2 - 1;
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
    if (def.tint && (!def.tintFaces || def.tintFaces.includes(key))) {
      tint = tintFor(def, chunk, x, z);
    }
    builder.quad(corners, uvs, lights, ao, FACE_SHADE[f], tint);
  }
}

/** Gekreuzte Pflanzenflächen (beidseitig) und Feldfrüchte. */
function meshPlant(buf, chunk, atlas, def, meta, x, y, z, px, pz, builder, tintFor) {
  let name = def.tex.north;
  if (def.shape === 'crop') {
    const stage = Math.min(meta, def.stages - 1);
    name = `${def.cropPrefix}${stage}`;
  }
  if (def.shape === 'dust') {
    // Redstone-Staub: flache Fläche auf dem Boden
    const uv = atlas.uv(name);
    setUniformLight(buf, px, y, pz);
    corners[0][0] = x; corners[0][1] = y + 0.02; corners[0][2] = z;
    corners[1][0] = x; corners[1][1] = y + 0.02; corners[1][2] = z + 1;
    corners[2][0] = x + 1; corners[2][1] = y + 0.02; corners[2][2] = z + 1;
    corners[3][0] = x + 1; corners[3][1] = y + 0.02; corners[3][2] = z;
    fullTileUv(uv);
    builder.quad(corners, uvs, lights, aoOne, 1, tintOne);
    return;
  }
  const uv = atlas.uv(name);
  const tint = def.tint ? tintFor(def, chunk, x, z) : tintOne;
  setUniformLight(buf, px, y, pz);
  // Ebene 1: Diagonale von (0,0) nach (1,1); Ebene 2: Diagonale von (1,0) nach (0,1)
  const planes = [
    [[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
    [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]],
  ];
  for (const plane of planes) {
    // Vorder- und Rückseite, damit die Pflanze von beiden Seiten sichtbar ist
    for (const reversed of [false, true]) {
      const order = reversed ? [0, 3, 2, 1] : [0, 1, 2, 3];
      for (let i = 0; i < 4; i++) {
        const c = plane[order[i]];
        corners[i][0] = x + c[0];
        corners[i][1] = y + c[1];
        corners[i][2] = z + c[2];
      }
      // UV: unten (y = 0) → v1, oben → v0; links → u0, rechts → u1
      const lowerLeft = plane[0];
      for (let i = 0; i < 4; i++) {
        const c = plane[order[i]];
        const u = c[0] === lowerLeft[0] && c[2] === lowerLeft[2] ? uv[0] : uv[2];
        const v = c[1] === 0 ? uv[3] : uv[1];
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
      }
      builder.quad(corners, uvs, lights, aoOne, 1, tint);
    }
  }
}

/** Formen aus Boxen: Stufen, Zäune, Türen, Fackeln, Betten, Ambosse … */
function meshBoxes(buf, atlas, def, meta, x, y, z, px, pz, builder) {
  const connections = def.shape === 'fence' ? connectionsFor(def, (dx, dz) => blockAt(buf, px + dx, y, pz + dz)) : 0;
  const boxes = shapeBoxes(def, meta, connections);
  if (!boxes.length) return;
  setUniformLight(buf, px, y, pz);
  for (const box of boxes) {
    for (let f = 0; f < 6; f++) {
      const nx = FACE_NORMALS[f][0];
      const ny = FACE_NORMALS[f][1];
      const nz = FACE_NORMALS[f][2];
      // Fläche liegt nur dann am Blockrand, wenn die Box dort bis zum Rand reicht
      const edgeAt = nx > 0 ? box[3] : nx < 0 ? box[0] : ny > 0 ? box[4] : ny < 0 ? box[1] : nz > 0 ? box[5] : box[2];
      const onBoundary = nx > 0 ? edgeAt === 1 : nx < 0 ? edgeAt === 0 : ny > 0 ? edgeAt === 1 : ny < 0 ? edgeAt === 0 : nz > 0 ? edgeAt === 1 : edgeAt === 0;
      if (onBoundary) {
        const neighborY = y + ny;
        const neighborId = neighborY < WORLD_MIN_Y || neighborY > WORLD_MAX_Y ? 0 : buf.blocks[((neighborY - WORLD_MIN_Y) * PAD + (pz + nz)) * PAD + (px + nx)];
        if (OCCLUDES[neighborId]) continue;
      }
      const faceCorners = FACE_CORNERS[f];
      for (let i = 0; i < 4; i++) {
        const c = faceCorners[i];
        corners[i][0] = x + (c[0] ? box[3] : box[0]);
        corners[i][1] = y + (c[1] ? box[4] : box[1]);
        corners[i][2] = z + (c[2] ? box[5] : box[2]);
      }
      fullTileUv(atlas.uv(faceTextureName(def, FACE_TEX_KEY[f], meta)));
      builder.quad(corners, uvs, lights, aoOne, FACE_SHADE[f], tintOne);
    }
  }
}

/** Flüssigkeit: Oberfläche je Füllstand, Seiten gegen fremde Zellen. */
function meshFluid(buf, chunk, atlas, def, meta, x, y, z, px, pz, builder, tintFor) {
  const level = meta & 7;
  const falling = (meta & 8) !== 0;
  const top = level === 0 || falling ? 0.875 : Math.max(0.2, 0.875 - level * 0.1);
  const id = def.id;
  const tint = def.tint ? tintFor(def, chunk, x, z) : tintOne;
  setUniformLight(buf, px, y, pz);

  const aboveId = y + 1 > WORLD_MAX_Y ? 0 : buf.blocks[((y + 1 - WORLD_MIN_Y) * PAD + pz) * PAD + px];
  const belowId = y - 1 < WORLD_MIN_Y ? 0 : buf.blocks[((y - 1 - WORLD_MIN_Y) * PAD + pz) * PAD + px];

  // Oberseite (nur, wenn darüber keine gleiche Flüssigkeit steht)
  if (aboveId !== id) {
    const uv = atlas.uv(def.tex.top);
    corners[0][0] = x; corners[0][1] = y + top; corners[0][2] = z;
    corners[1][0] = x; corners[1][1] = y + top; corners[1][2] = z + 1;
    corners[2][0] = x + 1; corners[2][1] = y + top; corners[2][2] = z + 1;
    corners[3][0] = x + 1; corners[3][1] = y + top; corners[3][2] = z;
    fullTileUv(uv);
    builder.quad(corners, uvs, lights, aoOne, FACE_SHADE[2], tint);
  }
  // Unterseite (nur bei Luft oder fremdem Block darunter, die nicht verdeckt)
  if (belowId !== id && !OCCLUDES[belowId]) {
    const uv = atlas.uv(def.tex.bottom);
    corners[0][0] = x; corners[0][1] = y; corners[0][2] = z + 1;
    corners[1][0] = x; corners[1][1] = y; corners[1][2] = z;
    corners[2][0] = x + 1; corners[2][1] = y; corners[2][2] = z;
    corners[3][0] = x + 1; corners[3][1] = y; corners[3][2] = z + 1;
    fullTileUv(uv);
    builder.quad(corners, uvs, lights, aoOne, FACE_SHADE[3], tint);
  }
  // Seiten
  for (const f of [0, 1, 4, 5]) {
    const nx = FACE_NORMALS[f][0];
    const nz = FACE_NORMALS[f][2];
    const nId = buf.blocks[((y - WORLD_MIN_Y) * PAD + (pz + nz)) * PAD + (px + nx)];
    if (nId === id || OCCLUDES[nId]) continue;
    const uv = atlas.uv(def.tex.side);
    const faceCorners = FACE_CORNERS[f];
    for (let i = 0; i < 4; i++) {
      const c = faceCorners[i];
      corners[i][0] = x + c[0];
      corners[i][1] = y + (c[1] ? top : 0);
      corners[i][2] = z + c[2];
    }
    fullTileUv(uv);
    builder.quad(corners, uvs, lights, aoOne, FACE_SHADE[f], tint);
  }
}

export const __testing = { FACE_NORMALS, FACE_CORNERS, FACE_TEX_KEY, faceTextureName, biomeTint };
