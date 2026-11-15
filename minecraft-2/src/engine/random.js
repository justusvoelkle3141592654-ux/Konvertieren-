// Deterministische Zufallsfunktionen (rein, ohne Browser-APIs).

/** FNV-1a-Hash eines Strings als vorzeichenloser 32-Bit-Wert. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mischt zwei Ganzzahlen zu einem gleichmäßig verteilten 32-Bit-Wert. */
export function hash2(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Mischt drei Ganzzahlen. */
export function hash3(a, b, c) {
  return hash2(hash2(a, b), c);
}

/** mulberry32 – kleiner, schneller Pseudozufallsgenerator mit Seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wandelt einen Hash in einen Wert in [0, 1). */
export function hashToUnit(h) {
  return (h >>> 0) / 4294967296;
}
