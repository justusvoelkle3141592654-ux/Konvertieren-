import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, B, BLOCK_BY_NAME, blockIdByName } from '../../src/world/blocks.js';

test('Block-IDs sind fortlaufend, eindeutig und passen in u8', () => {
  assert.equal(BLOCKS[0].name, 'air');
  BLOCKS.forEach((def, i) => {
    assert.equal(def.id, i);
    assert.ok(i <= 255);
  });
  assert.equal(new Set(BLOCKS.map((b) => b.name)).size, BLOCKS.length);
});

test('Jeder Block besitzt Texturen für alle sechs Seiten (außer Luft)', () => {
  for (const def of BLOCKS.slice(1)) {
    for (const key of ['top', 'bottom', 'north', 'south', 'east', 'west']) {
      assert.ok(typeof def.tex[key] === 'string' && def.tex[key].startsWith('block/'), `${def.name}.${key}`);
    }
  }
});

test('Namenszugriff stimmt mit dem Register überein', () => {
  assert.equal(B.stone, blockIdByName('stone'));
  assert.equal(BLOCK_BY_NAME.get('grass_block').tint, 'grass');
  assert.equal(blockIdByName('gibt_es_nicht'), 0);
});
