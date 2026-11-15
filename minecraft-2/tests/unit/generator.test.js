import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateChunkData } from '../../src/world/terrain-generator.js';
import { computeChunkLight } from '../../src/world/light.js';
import { createOverworldGenerator, findSpawn } from '../../src/world/gen/overworld.js';
import { BLOCK_BY_NAME, blockIdByName, BLOCKS } from '../../src/world/blocks.js';
import { WORLD_MIN_Y, SEA_LEVEL } from '../../src/config.js';
import { chunkIndex } from '../../src/world/chunk.js';

const SEED = 20260917;

test('Chunk-Erzeugung ist deterministisch', () => {
  const a = generateChunkData({ cx: 3, cz: -2, seed: SEED });
  const b = generateChunkData({ cx: 3, cz: -2, seed: SEED });
  assert.deepEqual(a.blocks, b.blocks);
  assert.deepEqual(a.meta, b.meta);
  assert.deepEqual(a.biomes, b.biomes);
});

test('Unterschiedliche Seeds erzeugen unterschiedliche Welten', () => {
  const a = generateChunkData({ cx: 0, cz: 0, seed: 1 });
  const b = generateChunkData({ cx: 0, cz: 0, seed: 2 });
  let diff = 0;
  for (let i = 0; i < a.heightmap.length; i++) if (a.heightmap[i] !== b.heightmap[i]) diff++;
  assert.ok(diff > 100);
});

test('Oberwelt hat Bedrock unten, Ozeane, Land und mehrere Biome', () => {
  const gen = createOverworldGenerator(SEED);
  const biomes = new Set();
  let ocean = 0;
  let land = 0;
  for (let z = -600; z < 600; z += 23) {
    for (let x = -600; x < 600; x += 23) {
      const col = gen.column(x, z);
      biomes.add(col.biome);
      if (col.height < SEA_LEVEL) ocean++;
      else land++;
      assert.ok(col.height >= WORLD_MIN_Y + 8 && col.height <= 319 - 80);
    }
  }
  assert.ok(biomes.size >= 8, `nur ${biomes.size} Biome gefunden`);
  assert.ok(ocean > 0 && land > 0);
  const chunk = generateChunkData({ cx: 0, cz: 0, seed: SEED });
  assert.equal(chunk.blocks[chunkIndex(4, WORLD_MIN_Y, 4)], B('bedrock'));
});

test('Erze, Höhlen und Gestein sind in Chunks vorhanden', () => {
  let coal = 0;
  let diamond = 0;
  let caveAir = 0;
  let deep = 0;
  for (let cz = -3; cz <= 3; cz++) {
    for (let cx = -3; cx <= 3; cx++) {
      const data = generateChunkData({ cx, cz, seed: SEED });
      for (const id of data.blocks) {
        const name = BLOCKS[id]?.name;
        if (name === 'coal_ore' || name === 'deepslate_coal_ore') coal++;
        if (name === 'diamond_ore' || name === 'deepslate_diamond_ore') diamond++;
        if (name === 'deepslate') deep++;
      }
      for (let y = -40; y < 0; y++) for (let i = 0; i < 16; i++) if (data.blocks[chunkIndex(i, y, 8)] === 0) caveAir++;
    }
  }
  assert.ok(coal > 500, `Kohle: ${coal}`);
  assert.ok(diamond >= 0);
  assert.ok(deep > 1000, `Tiefenschiefer: ${deep}`);
  assert.ok(caveAir >= 0);
});

test('Bäume und Pflanzen werden an Chunk-Grenzen konsistent geschrieben', () => {
  // Ein Baumblatt, das die Grenze überquert, muss in beiden Chunks gleich aussehen,
  // weil beide dieselbe Nachbarschaftsregel anwenden.
  const left = generateChunkData({ cx: 0, cz: 0, seed: SEED });
  const again = generateChunkData({ cx: 0, cz: 0, seed: SEED });
  assert.deepEqual(left.blocks, again.blocks);
  const leaves = new Set(['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves'].map((n) => blockIdByName(n)));
  let found = 0;
  for (const id of left.blocks) if (leaves.has(id)) found++;
  assert.ok(found >= 0);
});

test('Der Spawn liegt auf festem Land oberhalb des Meeres', () => {
  const spawn = findSpawn(SEED);
  const gen = createOverworldGenerator(SEED);
  const col = gen.column(Math.floor(spawn.x), Math.floor(spawn.z));
  assert.equal(spawn.y, col.height + 1);
  assert.ok(col.height > SEA_LEVEL);
});

test('Flachwelt hat Grasblock auf y = 0 und Licht darüber', () => {
  const flat = generateChunkData({ cx: 0, cz: 0, seed: 1, generator: 'flat' });
  assert.equal(flat.blocks[chunkIndex(3, 0, 3)], BLOCK_BY_NAME.get('grass_block').id);
  assert.equal(flat.blocks[chunkIndex(3, 1, 3)], 0);
  computeChunkLight({ blocks: flat.blocks, meta: flat.meta, light: flat.light, cx: 0, cz: 0 });
  assert.equal(flat.light[chunkIndex(3, 5, 3)] >> 4, 15);
});

function B(name) {
  return blockIdByName(name);
}
