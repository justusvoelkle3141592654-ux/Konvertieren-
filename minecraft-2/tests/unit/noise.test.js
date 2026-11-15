import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoise } from '../../src/world/noise.js';

test('Simplex-Rauschen ist deterministisch und bleibt im erwarteten Bereich', () => {
  const a = createNoise(99);
  const b = createNoise(99);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (let x = -60; x < 60; x += 1.7) {
    for (let z = -60; z < 60; z += 1.3) {
      const v = a.noise2(x, z);
      assert.equal(v, b.noise2(x, z));
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
      n++;
    }
  }
  assert.ok(min > -1.3 && max < 1.3, `Wertebereich ${min.toFixed(2)}..${max.toFixed(2)}`);
  assert.ok(Math.abs(sum / n) < 0.2, `Mittelwert ${(sum / n).toFixed(3)}`);
  assert.ok(max - min > 1, 'Rauschen ist nicht konstant');
});

test('3D-Rauschen unterscheidet sich zwischen Seeds', () => {
  const a = createNoise(1);
  const b = createNoise(2);
  let differs = 0;
  for (let i = 0; i < 100; i++) {
    if (a.noise3(i * 0.37, i * 0.21, i * 0.11) !== b.noise3(i * 0.37, i * 0.21, i * 0.11)) differs++;
  }
  assert.ok(differs > 90);
});
