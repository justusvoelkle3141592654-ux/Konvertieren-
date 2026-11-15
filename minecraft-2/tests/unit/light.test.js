import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/world.js';
import { Chunk } from '../../src/world/chunk.js';
import { B } from '../../src/world/blocks.js';
import { computeChunkLight } from '../../src/world/light.js';
import { chunkIndex } from '../../src/world/chunk.js';

/** Welt mit einem Chunk, Boden aus Stein auf y = 0 und freiem Himmel darüber. */
function flatWorld() {
  const world = new World({ dimension: 'overworld', seed: 1 });
  const chunk = new Chunk(0, 0, {});
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) chunk.blocks[chunkIndex(x, 0, z)] = B.stone;
  computeChunkLight(chunk);
  world.addChunk(chunk);
  return world;
}

test('Himmelslicht erreicht offene Luft mit voller Stärke', () => {
  const world = flatWorld();
  assert.equal(world.getLightLevel(5, 50, 5, true), 15);
  assert.equal(world.getLightLevel(5, 1, 5, true), 15);
});

test('Ein Dach wirft Schatten: unter der Mitte sinkt das Himmelslicht', () => {
  const world = flatWorld();
  // 9×9-Dach aus Stein auf y = 30
  for (let z = 4; z <= 12; z++) for (let x = 4; x <= 12; x++) world.setBlock(x, 30, z, B.stone);
  assert.equal(world.getLightLevel(8, 31, 8, true), 15, 'über dem Dach bleibt Licht');
  const edge = world.getLightLevel(3, 29, 8, true);
  const center = world.getLightLevel(8, 29, 8, true);
  assert.equal(edge, 15, 'außerhalb des Daches volle Helligkeit');
  assert.ok(center < edge && center >= 5, `Mitte ${center} muss dunkler als der Rand sein`);
  // Dach entfernen: Licht kehrt vollständig zurück
  for (let z = 4; z <= 12; z++) for (let x = 4; x <= 12; x++) world.setBlock(x, 30, z, B.air);
  assert.equal(world.getLightLevel(8, 29, 8, true), 15);
});

test('Fackel: Blocklicht nimmt pro Schritt um eine Stufe ab', () => {
  const world = flatWorld();
  world.setBlock(8, 20, 8, B.torch);
  assert.equal(world.getLightLevel(8, 20, 8), 14);
  assert.equal(world.getLightLevel(9, 20, 8), 13);
  assert.equal(world.getLightLevel(12, 20, 8), 10);
  assert.equal(world.getLightLevel(8, 26, 8), 8);
  assert.equal(world.getLightLevel(8, 40, 8), 0);
});

test('Entfernte Fackel: ihr Licht verschwindet vollständig', () => {
  const world = flatWorld();
  world.setBlock(8, 20, 8, B.torch);
  world.setBlock(8, 20, 8, B.air);
  for (let dx = -14; dx <= 14; dx++) {
    assert.equal(world.getLightLevel(8 + dx, 20, 8), 0, `Restlicht bei dx=${dx}`);
  }
});

test('Zwei Fackeln: nach dem Entfernen einer bleibt das Licht der anderen', () => {
  const world = flatWorld();
  world.setBlock(4, 20, 8, B.torch);
  world.setBlock(12, 20, 8, B.torch);
  world.setBlock(12, 20, 8, B.air);
  assert.equal(world.getLightLevel(4, 20, 8), 14);
  // Die verbliebene Fackel bei x=4 leuchtet bei Abstand 8 mit Stufe 6, bei Abstand 11 mit Stufe 3
  assert.equal(world.getLightLevel(12, 20, 8), 6);
  assert.equal(world.getLightLevel(15, 20, 8), 3);
});
