import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/world.js';
import { Chunk, chunkIndex } from '../../src/world/chunk.js';
import { B } from '../../src/world/blocks.js';
import { computeChunkLight } from '../../src/world/light.js';
import { handleScheduledUpdate } from '../../src/world/fluids.js';

function arena() {
  const world = new World({ dimension: 'overworld', seed: 1 });
  const chunk = new Chunk(0, 0, {});
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) chunk.blocks[chunkIndex(x, 0, z)] = B.stone;
  computeChunkLight(chunk);
  world.addChunk(chunk);
  return world;
}

function run(world, ticks) {
  for (let i = 0; i < ticks; i++) world.processScheduled(handleScheduledUpdate);
}

test('Wasserquelle fließt seitlich bis zu sieben Blöcke weit', () => {
  const world = arena();
  // Hohe Mauer verhindert Überlauf in den Rest der Arena
  world.setBlock(8, 1, 8, B.water, 0);
  run(world, 200);
  assert.equal(world.getBlock(8 + 7, 1, 8), B.water, 'sieben Blöcke weit');
  assert.equal(world.getBlock(8 + 8, 1, 8), B.air, 'acht Blöcke weit nicht mehr');
});

test('Lava fließt nur drei Blöcke weit', () => {
  const world = arena();
  world.setBlock(8, 1, 8, B.lava, 0);
  run(world, 400);
  assert.equal(world.getBlock(8 + 3, 1, 8), B.lava);
  assert.equal(world.getBlock(8 + 5, 1, 8), B.air);
});

test('Wasser fällt in ein Loch und füllt es', () => {
  const world = arena();
  world.setBlock(8, 1, 8, B.air);
  world.setBlock(8, 0, 8, B.air); // Loch
  world.setBlock(7, 1, 8, B.stone);
  world.setBlock(8, 1, 7, B.stone);
  world.setBlock(9, 1, 8, B.stone);
  world.setBlock(8, 1, 9, B.stone);
  world.setBlock(8, 2, 8, B.water, 0);
  run(world, 120);
  assert.equal(world.getBlock(8, 1, 8), B.water);
  assert.equal(world.getBlock(8, 0, 8), B.water);
});

test('Wasser und Lava ergeben Obsidian', () => {
  const world = arena();
  world.setBlock(8, 1, 8, B.lava, 0);
  world.setBlock(9, 1, 8, B.water, 0);
  run(world, 20);
  assert.equal(world.getBlock(8, 1, 8), B.obsidian);
});

test('Sand fällt, bis er auf festem Grund liegt', () => {
  const world = arena();
  world.setBlock(5, 12, 5, B.sand);
  run(world, 3);
  assert.equal(world.getBlock(5, 12, 5), B.air);
  assert.equal(world.getBlock(5, 1, 5), B.sand);
});
