import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../../src/world/blocks.js';
import { Chunk, chunkIndex } from '../../src/world/chunk.js';
import { buildChunkGeometry, PaddedBuffers } from '../../src/world/mesher.js';
import { WORLD_MIN_Y } from '../../src/config.js';

const atlas = { uv: () => [0, 0, 1, 1] };

function chunkWith(blocks) {
  const chunk = new Chunk(0, 0, {});
  chunk.light.fill(0xf0);
  for (const [x, y, z, id] of blocks) chunk.blocks[chunkIndex(x, y, z)] = id;
  return chunk;
}

function build(chunk, neighbours = {}) {
  const buf = new PaddedBuffers();
  buf.fill(chunk, (cx, cz) => neighbours[`${cx},${cz}`] ?? null);
  return buildChunkGeometry(buf, chunk, atlas, { smoothLighting: false });
}

test('ein einzelner Stein ergibt sechs Flächen (24 Vertices, 36 Indizes)', () => {
  const geo = build(chunkWith([[5, 10, 5, B.stone]]));
  assert.equal(geo.opaque.positions.length / 3, 24);
  assert.equal(geo.opaque.indices.length, 36);
  assert.equal(geo.transparent, null);
});

test('Dreiecke zeigen von außen aus dem Block heraus (Uhrzeigersinn)', () => {
  const geo = build(chunkWith([[5, 10, 5, B.stone]]));
  const p = geo.opaque.positions;
  const center = [5.5, 10.5, 5.5];
  for (let t = 0; t < geo.opaque.indices.length; t += 3) {
    const [a, b, c] = [geo.opaque.indices[t], geo.opaque.indices[t + 1], geo.opaque.indices[t + 2]].map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = [centroid[0] - center[0], centroid[1] - center[1], centroid[2] - center[2]];
    const dot = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2];
    assert.ok(dot > 0, `Dreieck ${t / 3} zeigt nach innen`);
  }
});

test('zwei benachbarte Steine teilen sich keine Flächen (10 statt 12 Flächen)', () => {
  const geo = build(chunkWith([[5, 10, 5, B.stone], [6, 10, 5, B.stone]]));
  assert.equal(geo.opaque.positions.length / 3, 40);
});

test('Flächen zu einem Nachbarchunk entfallen, wenn dieser den Block verdeckt', () => {
  const chunk = chunkWith([[15, 10, 5, B.stone]]);
  const neighbour = chunkWith([[0, 10, 5, B.stone]]);
  neighbour.cx = 1;
  const without = build(chunk);
  const withNeighbour = build(chunk, { '1,0': neighbour });
  assert.equal(without.opaque.positions.length / 3, 24);
  assert.equal(withNeighbour.opaque.positions.length / 3, 20);
});

test('Bedrock-Boden wird nicht unter der Welt gezeichnet, Oberseite schon', () => {
  const geo = build(chunkWith([[3, WORLD_MIN_Y, 3, B.bedrock]]));
  // Unterseite entfällt (unter der Welt), die übrigen fünf Flächen bleiben
  assert.equal(geo.opaque.positions.length / 3, 20);
});
