import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2, hashString, mulberry32 } from '../../src/engine/random.js';

test('hashString ist deterministisch und trennt Eingaben', () => {
  assert.equal(hashString('seed'), hashString('seed'));
  assert.notEqual(hashString('seed'), hashString('Seed'));
  assert.ok(hashString('') >= 0);
});

test('hash2 liefert vorzeichenlose 32-Bit-Werte', () => {
  for (let i = -20; i < 20; i++) {
    const h = hash2(i, i * 7);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  }
});

test('mulberry32 erzeugt eine reproduzierbare Folge in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
