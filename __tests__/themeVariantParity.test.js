/**
 * @jest-environment node
 *
 * Two independent layers decide whether this site is in dark mode, and they have to agree:
 *
 *   1. `frontend/src/styles/apple.css` flips every `--ap-*` token. It takes its dark arm
 *      from either an explicit choice (`[data-theme='dark']`, `.dark`) or the OS
 *      (`@media (prefers-color-scheme: dark)` scoped to `:root:not([data-theme='light'])`,
 *      so a visitor who chose light is not overruled by their system).
 *   2. `frontend/src/index.css` defines Tailwind's `dark:` variant, which decides whether a
 *      `dark:` utility applies at all.
 *
 * When those two disagree, a component reads one theme's foreground token off the other
 * theme's surface. That is not a subtle styling drift — see the cross-pairing measurement
 * below, which is the point of this suite.
 *
 * They disagreed in production. The comment above `@custom-variant dark` documented a media
 * arm that had never been written, so for a first-time system-dark visitor (no stored theme,
 * therefore no `data-theme` attribute and no `.dark` class — the theme-boot script in
 * index.html returns early in exactly that case) every token went dark while every `dark:`
 * utility stayed off. Lighthouse reported six contrast failures on the hazard cards from a
 * build of that site on 2026-10-10.
 *
 * Nothing else catches this. `check:contrast` and `__tests__/appleParity.test.js` both
 * measure each colour against the ground it was solved for; neither measures an arm against
 * the opposite theme's ground, which is the only pairing a divergence produces.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APPLE_HAZARD } from '../packages/design-system/src/apple';

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const indexCss = read('frontend/src/index.css');
const appleCss = read('frontend/src/styles/apple.css');

/** WCAG 2.x relative luminance and contrast ratio. */
const channel = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** WCAG 1.4.3 for text below 18pt / 14pt bold — the hazard kicker is `text-xs`. */
const AA = 4.5;

/** Pull the whole `@custom-variant dark { ... }` block out of index.css. */
function variantBlock(css) {
  const start = css.indexOf('@custom-variant dark');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced @custom-variant dark block');
}

const variant = variantBlock(indexCss);

describe("Tailwind's dark: variant covers both of apple.css's dark arms", () => {
  it('keeps the explicit-choice arm', () => {
    expect(variant).toMatch(/\[data-theme="?dark"?\]/);
    expect(variant).toMatch(/\.dark/);
  });

  it("keeps the OS arm, guarded by the same :not([data-theme='light']) apple.css uses", () => {
    expect(variant).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(variant).toMatch(/:root:not\(\[data-theme="?light"?\]\)/);
  });

  it("mirrors apple.css's own OS-arm selector, so the two cannot drift apart", () => {
    // apple.css paints the OS dark arm with exactly this guard. If either side changes its
    // condition, the layers disagree again and this fails.
    const appleHasGuard = /@media \(prefers-color-scheme: dark\)\s*\{[\s\S]{0,120}:root:not\(\[data-theme='light'\]\)/.test(
      appleCss
    );
    expect(appleHasGuard).toBe(true);

    const guardIn = (css) => /:root:not\(\[data-theme=['"]?light['"]?\]\)/.test(css);
    expect({ appleCss: guardIn(appleCss), indexCss: guardIn(indexCss) }).toEqual({
      appleCss: true,
      indexCss: true,
    });
  });

  it('is written in the block form, because Tailwind silently drops an at-rule in an argument list', () => {
    // `@custom-variant dark (&:where(...), @media (...) { ... });` parses without error and
    // emits only the first branch — a variant that looks present and does nothing. The
    // `{ @slot; }` block form is what emits both arms.
    expect(variant).toMatch(/@custom-variant dark\s*\{/);
    expect(variant).toContain('@slot');
    expect(variant.match(/@slot/g).length).toBe(2);
  });

  // The built stylesheet is the only proof that both arms really emit; it is gitignored and
  // absent on a clean checkout, so this reports rather than fails in that case.
  const distAssets = join(root, 'dist/assets');
  const builtCss = existsSync(distAssets)
    ? readdirSync(distAssets)
        .filter((f) => /^index-.*\.css$/.test(f))
        .map((f) => join(distAssets, f))
    : [];

  it.each(builtCss)('the built stylesheet %s carries a dark: utility in both arms',
    (file) => {
      const css = readFileSync(file, 'utf8');
      // Any dark: utility that resolves a hazard accent — the pairing Lighthouse flagged.
      const classArm = /\.dark\\:[^{]*:where\(\[data-theme=dark\]/.test(css);
      const mediaArm =
        /@media \(prefers-color-scheme:dark\)\{\.dark\\:[^{]*:where\(:root:not\(\[data-theme=light\]\)/.test(
          css
        );
      expect({ classArm, mediaArm }).toEqual({ classArm: true, mediaArm: true });
    }
  );
});

describe('the two hazard arms are not interchangeable, which is why the parity above matters', () => {
  const LIGHT_GROUNDS = { white: '#ffffff', parchment: '#f5f5f7' };
  const DARK_GROUNDS = { 'tile-1': '#161617', 'tile-3': '#242426', 'carbon-black': '#000000' };

  const keys = Object.keys(APPLE_HAZARD);

  it('each arm clears AA on the grounds it was solved for', () => {
    for (const key of keys) {
      const { text, onDark } = APPLE_HAZARD[key];
      for (const [name, bg] of Object.entries(LIGHT_GROUNDS)) {
        // apple.ts documents >= 5.0:1 on white and >= 4.6:1 on parchment.
        expect({ key, name, ratio: contrast(text, bg) >= 4.6 }).toEqual({
          key,
          name,
          ratio: true,
        });
      }
      for (const [name, bg] of Object.entries(DARK_GROUNDS)) {
        expect({ key, name, ratio: contrast(onDark, bg) >= AA }).toEqual({
          key,
          name,
          ratio: true,
        });
      }
    }
  });

  /**
   * The mirror image, and the assertion that gives this suite its purpose: every arm FAILS on
   * the opposite theme's grounds, by a wide margin. So a theme divergence is never a near-miss
   * that a reviewer could wave through — it is a 1.6-3.6:1 foreground on a 4.5:1 requirement,
   * and it is invisible to any check that only measures the intended pairing.
   */
  it('each arm fails on the opposite theme\'s grounds, so a divergence is always a violation', () => {
    for (const key of keys) {
      const { text, onDark } = APPLE_HAZARD[key];
      for (const [name, bg] of Object.entries(DARK_GROUNDS)) {
        expect({ key, arm: 'text', name, fails: contrast(text, bg) < AA }).toEqual({
          key,
          arm: 'text',
          name,
          fails: true,
        });
      }
      for (const [name, bg] of Object.entries(LIGHT_GROUNDS)) {
        expect({ key, arm: 'onDark', name, fails: contrast(onDark, bg) < AA }).toEqual({
          key,
          arm: 'onDark',
          name,
          fails: true,
        });
      }
    }
  });

  it('names the six onDark values Lighthouse reported, so the report stays traceable', () => {
    const reported = ['#30b9cf', '#b582ce', '#cf9a30', '#9bc1d4', '#c68580', '#d199be'];
    const onDarkValues = keys.map((key) => APPLE_HAZARD[key].onDark);
    for (const hex of reported) expect(onDarkValues).toContain(hex);
    // Each of them is far below AA on parchment, i.e. a light ground under a dark-arm colour.
    for (const hex of reported) {
      expect({ hex, onParchment: contrast(hex, '#f5f5f7') < 3 }).toEqual({
        hex,
        onParchment: true,
      });
    }
  });
});
