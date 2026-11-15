// Lichtberechnung: Himmelslicht und Blocklicht, Stufen 0–15.
//  - Ausbreitung per Breitensuche; Licht nimmt pro Schritt um 1 plus die Opazität der Zelle ab
//  - Himmelslicht fällt ungedämpft senkrecht durch Luft (Stufe 15 bleibt 15)
//  - Beim Ändern eines Blocks wird das abhängige Licht entfernt und danach neu verteilt
// Der Code ist rein; der Zugriff erfolgt über ein "Accessor"-Objekt, damit er im
// Worker (ein Chunk) und im Hauptthread (alle geladenen Chunks) gleich funktioniert.
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../config.js';
import { BLOCKS } from './blocks.js';
import { chunkIndex } from './chunk.js';

export const CH_BLOCK = 0;
export const CH_SKY = 1;

// Nachbarrichtungen: 0 +x, 1 −x, 2 +y, 3 −y (unten), 4 +z, 5 −z
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;
const OPPOSITE = [1, 0, 3, 2, 5, 4];

const OPACITY = new Uint8Array(256);
const EMIT = new Uint8Array(256);
const LIT_EMIT = new Uint8Array(256);
for (const def of BLOCKS) {
  OPACITY[def.id] = def.lightOpacity;
  EMIT[def.id] = def.lightEmit;
  LIT_EMIT[def.id] = def.litEmit ?? 0;
}

/** Leuchtstärke eines Blocks; Öfen leuchten nur im angeschalteten Zustand (Meta-Bit 4). */
export function emissionOf(id, meta) {
  if (LIT_EMIT[id] && (meta & 4)) return LIT_EMIT[id];
  return EMIT[id];
}

export function opacityOf(id) {
  return OPACITY[id];
}

/**
 * Licht, das aus einer Zelle mit Stufe `level` in eine Nachbarzelle mit Opazität `op` gelangt.
 * Himmelslicht, das senkrecht nach unten durch freie Luft fällt, behält seine Stufe.
 */
function decay(channel, dir, level, op) {
  if (channel === CH_SKY && dir === DOWN && level === 15 && op === 0) return 15;
  return level - 1 - op;
}

/**
 * Breitensuche zur Ausbreitung von Licht. queue: flaches Array [x, y, z, level, …]
 * Die Startzellen müssen bereits ihren Wert haben.
 */
export function propagateLight(acc, channel, queue) {
  let head = 0;
  while (head < queue.length) {
    const x = queue[head];
    const y = queue[head + 1];
    const z = queue[head + 2];
    const level = queue[head + 3];
    head += 4;
    if (level <= 1) continue;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];
      if (ny > WORLD_MAX_Y || ny < WORLD_MIN_Y) continue;
      const op = acc.opacity(nx, ny, nz);
      if (op >= 15) continue;
      const next = decay(channel, d, level, op);
      if (next <= 0) continue;
      if (next > acc.getLevel(channel, nx, ny, nz) && acc.setLevel(channel, nx, ny, nz, next)) {
        queue.push(nx, ny, nz, next);
      }
    }
  }
}

/**
 * Entfernt das Licht einer Zelle und alles, was ausschließlich von ihr stammte.
 * Unabhängige Nachbarn werden in `seeds` gesammelt, damit sie danach neu verteilt werden.
 */
export function removeLight(acc, channel, x, y, z, seeds) {
  const old = acc.getLevel(channel, x, y, z);
  if (old === 0) return;
  acc.setLevel(channel, x, y, z, 0);
  const queue = [x, y, z, old];
  let head = 0;
  while (head < queue.length) {
    const cx = queue[head];
    const cy = queue[head + 1];
    const cz = queue[head + 2];
    const cl = queue[head + 3];
    head += 4;
    for (let d = 0; d < 6; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      const nz = cz + DZ[d];
      if (ny > WORLD_MAX_Y || ny < WORLD_MIN_Y) continue;
      const nl = acc.getLevel(channel, nx, ny, nz);
      if (nl === 0) continue;
      const expected = decay(channel, d, cl, acc.opacity(nx, ny, nz));
      if (expected > 0 && nl <= expected) {
        acc.setLevel(channel, nx, ny, nz, 0);
        queue.push(nx, ny, nz, nl);
      } else {
        seeds.push(nx, ny, nz, nl);
      }
    }
  }
}

/**
 * Berechnet Licht neu, nachdem sich ein Block an (x, y, z) geändert hat.
 * Aufruf nach dem Setzen des neuen Blocks im Accessor.
 */
export function refreshLightAt(acc, x, y, z) {
  const id = acc.blockAt(x, y, z);
  const meta = acc.metaAt(x, y, z);
  const op = OPACITY[id];
  const emit = emissionOf(id, meta);
  for (const channel of [CH_BLOCK, CH_SKY]) {
    const seeds = [];
    removeLight(acc, channel, x, y, z, seeds);
    let level = channel === CH_BLOCK ? emit : 0;
    if (op < 15) {
      for (let d = 0; d < 6; d++) {
        const nl = acc.getLevel(channel, x + DX[d], y + DY[d], z + DZ[d]);
        if (nl === 0) continue;
        const candidate = decay(channel, OPPOSITE[d], nl, op);
        if (candidate > level) level = candidate;
      }
    }
    if (level > 0 && acc.setLevel(channel, x, y, z, level)) {
      seeds.push(x, y, z, level);
    }
    propagateLight(acc, channel, seeds);
  }
}

/**
 * Verbindet einen neu geladenen Chunk mit bereits geladenen Nachbarn:
 * Licht darf über die Grenze in beide Richtungen fließen.
 * @param {object} acc Accessor (Hauptthread)
 * @param {import('./chunk.js').Chunk} chunk neu geladener Chunk
 * @param {(cx:number, cz:number) => import('./chunk.js').Chunk|null} getChunk
 */
export function stitchChunkLight(acc, chunk, getChunk) {
  const sides = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [sx, sz] of sides) {
    const other = getChunk(chunk.cx + sx, chunk.cz + sz);
    if (!other) continue;
    for (const channel of [CH_BLOCK, CH_SKY]) {
      const queue = [];
      for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
        for (let t = 0; t < CHUNK_SIZE; t++) {
          // Randzellen beider Chunks entlang der gemeinsamen Grenze
          let ax;
          let az;
          let bx;
          let bz;
          if (sx !== 0) {
            ax = sx > 0 ? CHUNK_SIZE - 1 : 0;
            bx = sx > 0 ? 0 : CHUNK_SIZE - 1;
            ax = ax; az = t; bx = bx; bz = t;
          } else {
            az = sz > 0 ? CHUNK_SIZE - 1 : 0;
            bz = sz > 0 ? 0 : CHUNK_SIZE - 1;
            ax = t; bx = t;
            az = az; bz = bz;
          }
          const aLevel = levelInChunk(chunk, channel, ax, y, az);
          const bLevel = levelInChunk(other, channel, bx, y, bz);
          if (aLevel > 1) queue.push(chunk.originX + ax, y, chunk.originZ + az, aLevel);
          if (bLevel > 1) queue.push(other.originX + bx, y, other.originZ + bz, bLevel);
        }
      }
      propagateLight(acc, channel, queue);
    }
  }
}

function levelInChunk(chunk, channel, lx, y, lz) {
  const b = chunk.light[chunkIndex(lx, y, lz)];
  return channel === CH_SKY ? b >> 4 : b & 15;
}

/**
 * Vollständige Lichtberechnung für einen einzelnen Chunk (Worker).
 * Nachbarn sind nicht bekannt; die Ränder werden später durch stitchChunkLight ergänzt.
 * @param {{ blocks: Uint8Array, meta: Uint8Array, light: Uint8Array, cx: number, cz: number }} data
 */
export function computeChunkLight(data) {
  const acc = new ChunkAccess(data.blocks, data.meta, data.light, data.cx, data.cz);
  const { light, blocks, meta } = data;
  const seedsSky = [];
  const seedsBlock = [];
  const originX = data.cx * CHUNK_SIZE;
  const originZ = data.cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      // Himmelslicht: von oben senkrecht hinab, bis eine Zelle es vollständig blockiert
      let cur = 15;
      for (let y = WORLD_MAX_Y; y >= WORLD_MIN_Y; y--) {
        const i = chunkIndex(lx, y, lz);
        const id = blocks[i];
        const op = OPACITY[id];
        if (op >= 15) {
          cur = 0;
        } else {
          cur = decay(CH_SKY, DOWN, cur, op);
          if (cur < 0) cur = 0;
        }
        light[i] = (light[i] & 0x0f) | (cur << 4);
        if (cur === 0) break;
      }
      // Blocklicht: Leuchtquellen als Startpunkte
      for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
        const i = chunkIndex(lx, y, lz);
        const emit = emissionOf(blocks[i], meta[i]);
        if (emit > 0) {
          light[i] = (light[i] & 0xf0) | emit;
          seedsBlock.push(originX + lx, y, originZ + lz, emit);
        }
      }
    }
  }
  // Himmelslicht-Startpunkte: alle Zellen mit Stufe > 1 können seitlich weitergeben
  for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const sky = light[chunkIndex(lx, y, lz)] >> 4;
        if (sky > 1) seedsSky.push(originX + lx, y, originZ + lz, sky);
      }
    }
  }
  propagateLight(acc, CH_SKY, seedsSky);
  propagateLight(acc, CH_BLOCK, seedsBlock);
  return light;
}

/** Accessor für einen einzelnen Chunk (Worker). Außerhalb des Chunks gilt Dunkelheit. */
export class ChunkAccess {
  constructor(blocks, meta, light, cx, cz) {
    this.blocks = blocks;
    this.meta = meta;
    this.light = light;
    this.ox = cx * CHUNK_SIZE;
    this.oz = cz * CHUNK_SIZE;
  }

  inside(x, z) {
    return x >= this.ox && x < this.ox + CHUNK_SIZE && z >= this.oz && z < this.oz + CHUNK_SIZE;
  }

  index(x, y, z) {
    return chunkIndex(x - this.ox, y, z - this.oz);
  }

  blockAt(x, y, z) {
    if (!this.inside(x, z) || y < WORLD_MIN_Y || y > WORLD_MAX_Y) return 0;
    return this.blocks[this.index(x, y, z)];
  }

  metaAt(x, y, z) {
    if (!this.inside(x, z) || y < WORLD_MIN_Y || y > WORLD_MAX_Y) return 0;
    return this.meta[this.index(x, y, z)];
  }

  opacity(x, y, z) {
    if (y > WORLD_MAX_Y) return 0;
    if (y < WORLD_MIN_Y) return 15;
    return OPACITY[this.blockAt(x, y, z)];
  }

  getLevel(channel, x, y, z) {
    if (y > WORLD_MAX_Y) return channel === CH_SKY ? 15 : 0;
    if (y < WORLD_MIN_Y || !this.inside(x, z)) return 0;
    const b = this.light[this.index(x, y, z)];
    return channel === CH_SKY ? b >> 4 : b & 15;
  }

  setLevel(channel, x, y, z, value) {
    if (y > WORLD_MAX_Y || y < WORLD_MIN_Y || !this.inside(x, z)) return false;
    const i = this.index(x, y, z);
    const b = this.light[i];
    this.light[i] = channel === CH_SKY ? (b & 0x0f) | (value << 4) : (b & 0xf0) | value;
    return true;
  }
}

/**
 * Accessor über alle geladenen Chunks der Welt (Hauptthread).
 * Änderungen markieren den betroffenen Chunk für ein neues Mesh.
 */
export class WorldAccess {
  constructor(world) {
    this.world = world;
  }

  chunkFor(x, y, z) {
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return null;
    return this.world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  }

  localIndex(x, y, z) {
    return chunkIndex(((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, y, ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
  }

  blockAt(x, y, z) {
    return this.world.getBlock(x, y, z);
  }

  metaAt(x, y, z) {
    return this.world.getMeta(x, y, z);
  }

  opacity(x, y, z) {
    if (y > WORLD_MAX_Y) return 0;
    if (y < WORLD_MIN_Y) return 15;
    return OPACITY[this.world.getBlock(x, y, z)];
  }

  getLevel(channel, x, y, z) {
    if (y > WORLD_MAX_Y) return channel === CH_SKY ? 15 : 0;
    const chunk = this.chunkFor(x, y, z);
    if (!chunk) return 0;
    const b = chunk.light[this.localIndex(x, y, z)];
    return channel === CH_SKY ? b >> 4 : b & 15;
  }

  setLevel(channel, x, y, z, value) {
    const chunk = this.chunkFor(x, y, z);
    if (!chunk) return false;
    const i = this.localIndex(x, y, z);
    const b = chunk.light[i];
    const next = channel === CH_SKY ? (b & 0x0f) | (value << 4) : (b & 0xf0) | value;
    if (next !== b) {
      chunk.light[i] = next;
      this.world.touchLight(chunk);
    }
    return true;
  }
}
