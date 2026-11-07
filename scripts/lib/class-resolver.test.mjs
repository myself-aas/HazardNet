import assert from 'node:assert/strict';
import test from 'node:test';
import { propOf, resolve, resolvePaintColor } from './class-resolver.mjs';

const PAINTS = [
  ['text-white/25', 'text'],
  ['bg-white/25', 'bg'],
  ['border-white/25', 'border'],
  ['fill-white/25', 'fill'],
  ['stroke-white/25', 'stroke'],
  ['divide-white/25', 'divide'],
  ['ring-white/25', 'ring'],
];

test('alpha-aware resolver supports every color utility checked by the flat scanner', () => {
  for (const [utility, expectedProperty] of PAINTS) {
    assert.equal(propOf(utility), expectedProperty, `${utility} property`);

    for (const mode of ['light', 'dark']) {
      const paint = resolvePaintColor(utility, mode);
      assert.ok(paint, `${utility} should resolve in ${mode} mode`);
      assert.equal(paint.length, 4, `${utility} should keep RGBA channels`);
      assert.ok(Math.abs(paint[3] - 0.25) < 1e-9, `${utility} should keep 25% alpha`);

      const flatColor = resolve(utility, mode);
      assert.match(flatColor, /^#[\da-f]{6}$/i, `${utility} should remain scoreable by the flat scanner`);
    }
  }
});

test('dark white-panel overrides preserve the dark canvas and utility alpha', () => {
  assert.deepEqual(resolvePaintColor('bg-white/40', 'dark'), [0, 0, 0, 0.4]);
  assert.equal(resolve('bg-white/40', 'dark'), '#000000');
});

test('transparent remains a non-surface in the flat scanner but an alpha-zero paint in the tree scanner', () => {
  assert.equal(resolve('bg-transparent', 'light'), null);
  assert.deepEqual(resolvePaintColor('bg-transparent', 'light'), [0, 0, 0, 0]);
});
