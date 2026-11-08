import assert from 'node:assert/strict';
import test from 'node:test';
import { contrast, propOf, resolve, resolvePaintColor } from './class-resolver.mjs';

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

test('arbitrary var() utilities resolve, and invert only when the token they name does', () => {
  // The semantic roles invert…
  assert.equal(resolve('text-[var(--ap-label)]', 'light'), '#1d1d1f');
  assert.equal(resolve('text-[var(--ap-label)]', 'dark'), '#f5f5f7');
  assert.equal(resolve('bg-[var(--ap-bg-elevated)]', 'light'), '#ffffff');
  assert.equal(resolve('bg-[var(--ap-bg-elevated)]', 'dark'), '#1c1c1e');

  // …and the primitive does not. `--ap-canvas` is #ffffff in both appearances, so
  // inverting ink on it is 1.09:1 in dark — the exact pairing the /forecast/district
  // route shipped in 15 places before it was rewritten onto the semantic roles.
  assert.equal(resolve('bg-[var(--ap-canvas)]', 'light'), '#ffffff');
  assert.equal(resolve('bg-[var(--ap-canvas)]', 'dark'), '#ffffff');
  const brokenDark = contrast(resolve('text-[var(--ap-label)]', 'dark'), resolve('bg-[var(--ap-canvas)]', 'dark'));
  assert.ok(brokenDark < 4.5, `primitive surface should fail AA in dark, measured ${brokenDark}`);
  const fixedDark = contrast(resolve('text-[var(--ap-label)]', 'dark'), resolve('bg-[var(--ap-bg-elevated)]', 'dark'));
  assert.ok(fixedDark >= 4.5, `semantic surface should clear AA in dark, measured ${fixedDark}`);
});

test('arbitrary values keep their alpha so the tree scanner can composite them', () => {
  for (const mode of ['light', 'dark']) {
    const paint = resolvePaintColor('bg-[var(--ap-bg-elevated)]/70', mode);
    assert.ok(paint, `bg-[var(--ap-bg-elevated)]/70 should resolve in ${mode} mode`);
    assert.ok(Math.abs(paint[3] - 0.7) < 1e-9, `${mode} alpha should stay at 70%`);
  }
});

test('arbitrary payloads that are not colours stay unresolvable, never guessed', () => {
  for (const cls of [
    'text-[length:var(--ap-type-body-md-size)]', // a data-type hint that is not `color:`
    'text-[14px]',
    'bg-[url(/assets/hero.png)]',
    'bg-[linear-gradient(180deg,#fff,#000)]',
    'bg-[image:var(--ap-hero)]',
  ]) {
    for (const mode of ['light', 'dark']) {
      assert.equal(resolve(cls, mode), null, `${cls} should stay unresolvable in ${mode}`);
      assert.equal(resolvePaintColor(cls, mode), null, `${cls} should stay unpaintable in ${mode}`);
    }
  }
});

test('arbitrary hex and rgb() payloads resolve in both modes', () => {
  assert.equal(resolve('text-[#8a5a00]', 'dark'), '#8a5a00');
  assert.equal(resolve('bg-[rgb(0_0_0/0.4)]', 'light'), '#999999'); // 40% black over the white canvas
  assert.equal(resolve('bg-[rgb(0_0_0/0.4)]', 'dark'), '#000000'); // 40% black over the black canvas
});
