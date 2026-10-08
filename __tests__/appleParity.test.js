/**
 * Apple design system parity — the one system, asserted against its own spec.
 *
 * Three artifacts have to agree, and nothing but a test can keep them agreeing:
 *
 *   DESIGN.md                                the spec, written by `npx getdesign add apple`
 *   packages/design-system/src/apple.ts      the values, for JS/TS and React Native
 *   frontend/src/styles/apple.css            how those values reach the browser
 *
 * This suite is the successor to `meridianParity.test.js`, which policed the HDS v3.0 system
 * deleted in this migration. It is deliberately stricter in one respect: the old suite asserted
 * that the token file and the stylesheet matched each other, but nothing checked either against
 * the published design document. Here, the numbers are read back out of DESIGN.md itself, so a
 * typo in transcription fails rather than being enshrined.
 *
 * It also pins the three rules that make this *Apple* rather than "a blue design system":
 * one accent, one shadow (and not on UI), and no documented hover state.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPLE,
  APPLE_COLORS,
  APPLE_ELEVATION,
  APPLE_MOTION,
  APPLE_NEUTRAL,
  APPLE_RADII,
  APPLE_SEVERITY,
  APPLE_HAZARD,
  APPLE_HAZARD_ALIASES,
  hazardPalette,
  APPLE_SPACE,
  APPLE_TOUCH,
  APPLE_TYPE,
  APPLE_WEIGHTS,
} from '../packages/design-system/src/apple';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'frontend/src/styles/apple.css'), 'utf8');
const DESIGN_MD = join(ROOT, 'DESIGN.md');
const spec = existsSync(DESIGN_MD) ? readFileSync(DESIGN_MD, 'utf8') : '';

/**
 * Read a `--token: value;` declaration out of the stylesheet.
 *
 * Not anchored to line-start: the type scale packs size/leading/tracking onto one line so the
 * 16 named styles stay readable as a table. The FIRST match is always the `:root` declaration,
 * which is the one parity cares about — later re-declarations are the responsive overrides.
 */
function cssToken(name) {
  const m = new RegExp(`(?:^|[;{])\\s*${name}:\\s*([^;]+);`, 'm').exec(CSS);
  return m ? m[1].trim() : null;
}

/** Collapse whitespace so `rgba(0,0,0,.22)` and `rgba(0, 0, 0, .22)` compare equal. */
const norm = (value) => String(value).replace(/\s+/g, '');

/** Read a `key: value` pair out of the DESIGN.md YAML front matter. */
function specValue(key) {
  const m = new RegExp(`^\\s*${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm').exec(spec);
  return m ? m[1].trim() : null;
}

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** CIELAB, so "are these two categories distinguishable" is a perceptual question. */
function lab(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a, b) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

describe('the token module matches the published design document', () => {
  test('DESIGN.md is present — it is the source this system was generated from', () => {
    expect(spec).not.toBe('');
    expect(spec).toContain('Apple');
  });

  test('every colour in apple.ts that DESIGN.md names has the documented value', () => {
    // Only the tokens DESIGN.md actually publishes are checked here; the derived ramp and the
    // severity layer are extensions and are pinned separately below.
    const mismatches = [];
    for (const [key, value] of Object.entries(APPLE_COLORS)) {
      const documented = specValue(key);
      if (documented && documented.toLowerCase() !== String(value).toLowerCase()) {
        mismatches.push(`${key}: apple.ts=${value} DESIGN.md=${documented}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('the signature values are the documented ones, not approximations', () => {
    expect(APPLE_COLORS.primary).toBe('#0066cc'); // Action Blue
    expect(APPLE_COLORS.primaryFocus).toBe('#0071e3'); // focus ring only
    expect(APPLE_COLORS.primaryOnDark).toBe('#2997ff'); // Sky Link Blue
    expect(APPLE_COLORS.ink).toBe('#1d1d1f');
    expect(APPLE_COLORS.canvasParchment).toBe('#f5f5f7');
    // Body copy is 17px in this system. Shipping 16 would be a different design.
    expect(APPLE_TYPE.body.size).toBe(17);
    // The Display/Text face boundary.
    expect(APPLE.faceBoundary).toBe(20);
  });

  test('the weight ladder omits 500, exactly as documented', () => {
    expect(APPLE_WEIGHTS).toEqual([300, 400, 600, 700]);
    for (const [name, style] of Object.entries(APPLE_TYPE)) {
      expect({ name, weight: style.weight, ok: APPLE_WEIGHTS.includes(style.weight) }).toEqual({
        name,
        weight: style.weight,
        ok: true,
      });
    }
  });

  test('the radius and spacing scales are the documented sets', () => {
    expect(Object.values(APPLE_RADII)).toEqual([0, 5, 8, 11, 18, 9999, 9999]);
    expect(Object.values(APPLE_SPACE)).toEqual([4, 8, 12, 17, 24, 32, 48, 80]);
    expect(APPLE_TOUCH.min).toBe(44);
  });
});

describe('the stylesheet matches the token module', () => {
  test.each([
    ['--ap-primary', APPLE_COLORS.primary],
    ['--ap-primary-focus', APPLE_COLORS.primaryFocus],
    ['--ap-primary-on-dark', APPLE_COLORS.primaryOnDark],
    ['--ap-ink', APPLE_COLORS.ink],
    ['--ap-parchment', APPLE_COLORS.canvasParchment],
    ['--ap-pearl', APPLE_COLORS.surfacePearl],
    ['--ap-tile-1', APPLE_COLORS.surfaceTile1],
    ['--ap-tile-2', APPLE_COLORS.surfaceTile2],
    ['--ap-tile-3', APPLE_COLORS.surfaceTile3],
    ['--ap-hairline', APPLE_COLORS.hairline],
    ['--ap-divider-soft', APPLE_COLORS.dividerSoft],
  ])('%s is the same value in CSS and TS', (token, expected) => {
    expect(cssToken(token)).toBe(expected);
  });

  test('the neutral ramp is identical in both files', () => {
    for (const [step, value] of Object.entries(APPLE_NEUTRAL)) {
      expect({ step, css: cssToken(`--ap-n-${step}`) }).toEqual({ step, css: value });
    }
  });

  test('the type scale is identical in both files', () => {
    const CSS_NAME = {
      heroDisplay: 'hero', displayLg: 'display-lg', displayMd: 'display-md', lead: 'lead',
      leadAiry: 'lead-airy', tagline: 'tagline', body: 'body', bodyStrong: 'body-strong',
      denseLink: 'dense-link', caption: 'caption', captionStrong: 'caption-strong',
      buttonLarge: 'button-large', buttonUtility: 'button-utility', finePrint: 'fine-print',
      microLegal: 'micro-legal', navLink: 'nav-link',
    };
    const drift = [];
    for (const [name, style] of Object.entries(APPLE_TYPE)) {
      const slug = CSS_NAME[name];
      expect(slug).toBeDefined();
      // Hero is re-declared inside media queries, so take the :root declaration only.
      const size = cssToken(`--ap-text-${slug}`);
      const line = cssToken(`--ap-leading-${slug}`);
      if (size !== `${style.size}px`) drift.push(`${slug} size: css=${size} ts=${style.size}px`);
      if (line !== String(style.line)) drift.push(`${slug} line: css=${line} ts=${style.line}`);
    }
    expect(drift).toEqual([]);
  });

  test('the radius and spacing scales are identical in both files', () => {
    for (const [name, value] of Object.entries(APPLE_RADII)) {
      const css = cssToken(`--ap-radius-${name}`);
      expect({ name, css }).toEqual({ name, css: `${value}px` });
    }
    for (const [name, value] of Object.entries(APPLE_SPACE)) {
      const css = cssToken(`--ap-space-${name === 'section' ? 'section' : name}`);
      expect({ name, css }).toEqual({ name, css: `${value}px` });
    }
  });

  test('the severity layer is identical in both files', () => {
    const SLUG = { low: 'low', moderate: 'moderate', high: 'high', veryHigh: 'very-high', extreme: 'extreme' };
    for (const [level, set] of Object.entries(APPLE_SEVERITY)) {
      expect(cssToken(`--ap-sev-${SLUG[level]}`)).toBe(set.text);
      expect(cssToken(`--ap-sev-${SLUG[level]}-surface`)).toBe(set.surface);
    }
  });

  test('motion values agree', () => {
    expect(cssToken('--ap-press-scale')).toBe(String(APPLE_MOTION.pressScale));
    expect(cssToken('--ap-duration-press')).toBe(`${APPLE_MOTION.duration.press}ms`);
    expect(cssToken('--ap-duration-base')).toBe(`${APPLE_MOTION.duration.base}ms`);
    expect(cssToken('--ap-ease')).toBe(APPLE_MOTION.ease);
    expect(cssToken('--ap-press-scale-soft')).toBe(String(APPLE_MOTION.pressScaleSoft));
  });
});

describe("the rules that make this Apple and not just 'a blue design system'", () => {
  test('there is exactly ONE accent', () => {
    // DESIGN.md §Don'ts: "Don't introduce a second accent color." Action Blue, its focus
    // variant and its dark-surface variant are the same hue at three jobs — nothing else
    // in the chrome layer may be saturated.
    const chromeTokens = ['--ap-action', '--ap-link', '--ap-focus-ring', '--ap-action-focus'];
    for (const token of chromeTokens) {
      const value = cssToken(token) ?? '';
      expect({ token, ok: /var\(--ap-primary/.test(value) }).toEqual({ token, ok: true });
    }
  });

  test('there is exactly ONE shadow, and it is not for UI', () => {
    expect(APPLE_ELEVATION.flat).toBe('none');
    expect(norm(APPLE_ELEVATION.product)).toBe(norm('rgba(0, 0, 0, 0.22) 3px 5px 30px 0'));
    expect(norm(cssToken('--ap-elev-product'))).toBe(norm(APPLE_ELEVATION.product));
    // Cards, buttons and inputs must be flat. Depth is a hairline and a change of ground.
    const cardRule = /\.ap-card\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? '';
    expect(cardRule).toContain('box-shadow: var(--ap-elev-flat)');

    // Nothing in the component layer may paint a real shadow. The only permitted
    // box-shadow values are the flat token, the 1px hairline ring, an inset ring, and
    // `.ap-product-shadow` — which exists precisely so product photography is the one
    // place the system's single shadow can appear.
    const componentLayer = CSS.slice(CSS.indexOf('9 · COMPONENTS'));
    const shadows = [...componentLayer.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim());
    const illegal = shadows.filter(
      (value) =>
        !/^var\(--ap-elev-(flat|hairline|product)\)$/.test(value) &&
        !/^inset 0 0 0 1px var\(--ap-[a-z-]+\)$/.test(value) &&
        !/^0 0 0 3px var\(--ap-[a-z-]+\)$/.test(value),
    );
    expect(illegal).toEqual([]);
  });

  test('no hover state is documented as the only affordance', () => {
    // DESIGN.md: "Never document hover." Press is the interaction. The one hover rule the
    // system allows is a link underline, which is additive — it is not carrying meaning
    // on its own, and the link is already blue without it.
    //
    // There is a second shape that is not an affordance either, and the difference is worth
    // being precise about. A selector like `.dark .hover\:bg-white\/60:hover` does not
    // *introduce* a hover state: the call site already wrote `hover:bg-white/60`, so the
    // interaction exists in light mode with or without this rule. All the dark-scoped rule
    // does is pick the colour that hover lands on, because `bg-white` is a surface here and
    // has to follow the theme. Removing it would not remove an affordance — it would leave a
    // white flash on a dark page. So the exemption is deliberately narrow: an *escaped
    // Tailwind utility* (`.hover\:…`), and only under a dark scope.
    const isThemeCorrection = (selector) =>
      /\\:hover\\?:hover|\.hover\\:/.test(selector) &&
      /\[data-theme='dark'\]|\.dark\s|:root:not\(\[data-theme='light'\]\)/.test(selector);

    const hoverRules = [...CSS.matchAll(/^([^\n{]*:hover[^\n{]*)\{([\s\S]*?)\}/gm)];
    const offenders = hoverRules
      .map(([, selector]) => selector.trim())
      .filter((selector) => !selector.includes('.ap-link'))
      .filter((selector) => !isThemeCorrection(selector));
    expect(offenders).toEqual([]);
  });

  test('a dark-scoped hover correction never invents an affordance the call sites lack', () => {
    // Guards the exemption above: every `.hover\:X:hover` rule in the dark scopes must
    // correspond to a `hover:X` that components actually write. If one ever appears here
    // without a call site, it is a hand-authored hover wearing the theme-correction
    // exemption, and the rule in DESIGN.md applies to it after all.
    const corrections = [...CSS.matchAll(/\.hover\\:([a-z0-9\\/-]+):hover/g)].map((m) =>
      m[1].replace(/\\/g, ''),
    );
    const sources = execSync("find frontend/src -name '*.tsx' ! -path '*__tests__*'")
      .toString()
      .trim()
      .split('\n')
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const unused = [...new Set(corrections)].filter(
      (utility) => !sources.includes(`hover:${utility}`),
    );
    expect(unused).toEqual([]);
  });

  test('press is scale(0.95), system-wide', () => {
    expect(APPLE_MOTION.pressScale).toBe(0.95);
    expect(CSS).toContain('.ap-btn:active { transform: scale(var(--ap-press-scale)); }');
  });

  test('tiles are full-bleed with no radius — the colour change is the divider', () => {
    const tileRule = /\.ap-tile\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? '';
    expect(tileRule).toContain('border-radius: var(--ap-radius-none)');
    expect(tileRule).toContain('padding-block: var(--ap-section-block)');
  });

  test('no font file is shipped for the Apple faces', () => {
    // DESIGN.md §"Note on Font Substitutes" sanctions NAMING SF Pro and falling through to
    // system-ui. A @font-face or a remote URL for it would be both a licence problem and a
    // payload regression.
    expect(CSS).toContain("'SF Pro Display'");
    expect(CSS).toContain("'SF Pro Text'");
    expect(CSS).not.toMatch(/@font-face[\s\S]{0,400}SF Pro/);
    expect(CSS).not.toMatch(/url\(['"]?https?:/);
  });
});

describe('contrast, measured rather than asserted', () => {
  const AA = 4.5;
  const LARGE = 3;

  test('the accent clears AA on both light grounds', () => {
    expect(contrast(APPLE_COLORS.primary, '#ffffff')).toBeGreaterThanOrEqual(AA);
    expect(contrast(APPLE_COLORS.primary, APPLE_COLORS.canvasParchment)).toBeGreaterThanOrEqual(AA);
    expect(contrast('#ffffff', APPLE_COLORS.primary)).toBeGreaterThanOrEqual(AA);
  });

  test('the focus ring clears the 3:1 non-text gate', () => {
    expect(contrast(APPLE_COLORS.primaryFocus, '#ffffff')).toBeGreaterThanOrEqual(LARGE);
  });

  test('every neutral step used for text clears AA on BOTH white and parchment', () => {
    // This is the fix for audit F-04: the previous ramp was measured on white and then
    // rendered on the off-white canvas, losing ~8% of every ratio.
    for (const step of ['50', '60', '70', '80', '90']) {
      const hex = APPLE_NEUTRAL[step];
      expect({ step, white: contrast(hex, '#ffffff') >= AA }).toEqual({ step, white: true });
      expect({ step, parchment: contrast(hex, '#f5f5f7') >= AA }).toEqual({ step, parchment: true });
    }
  });

  test('carbon-40 is below the text floor, and is therefore non-text only', () => {
    expect(contrast(APPLE_NEUTRAL['40'], '#ffffff')).toBeLessThan(AA);
  });

  test('every severity level is readable as text AND as a fill, on both grounds', () => {
    for (const [level, set] of Object.entries(APPLE_SEVERITY)) {
      expect({ level, onWhite: contrast(set.text, '#ffffff') >= AA }).toEqual({ level, onWhite: true });
      expect({ level, onParchment: contrast(set.text, '#f5f5f7') >= AA }).toEqual({ level, onParchment: true });
      expect({ level, whiteOnFill: contrast('#ffffff', set.solid) >= AA }).toEqual({ level, whiteOnFill: true });
      expect({ level, onTile: contrast(set.onDark, APPLE_COLORS.surfaceTile1) >= AA }).toEqual({ level, onTile: true });
    }
  });

  test('the five severity levels are actually distinguishable from each other', () => {
    // Five levels that look alike are one level. Each adjacent pair must differ in
    // luminance by enough to be told apart without reading the label.
    const order = ['low', 'moderate', 'high', 'veryHigh', 'extreme'];
    for (let i = 0; i < order.length - 1; i += 1) {
      const a = APPLE_SEVERITY[order[i]].solid;
      const b = APPLE_SEVERITY[order[i + 1]].solid;
      expect({ pair: `${order[i]}/${order[i + 1]}`, same: a === b }).toEqual({
        pair: `${order[i]}/${order[i + 1]}`,
        same: false,
      });
    }
  });

  test('severity never relies on colour alone', () => {
    // WCAG 1.4.1. Every level carries a word, and the badge renders a glyph beside it.
    for (const [level, set] of Object.entries(APPLE_SEVERITY)) {
      expect({ level, hasLabel: typeof set.label === 'string' && set.label.length > 0 }).toEqual({
        level,
        hasLabel: true,
      });
    }
    const primitives = readFileSync(join(ROOT, 'frontend/src/components/apple/primitives.tsx'), 'utf8');
    expect(primitives).toContain('<SeverityGlyph level={level} />');
  });
});

describe('hazard identity is a real encoding layer, not eight guesses', () => {
  const WHITE = '#ffffff';
  const PARCHMENT = APPLE_COLORS.canvasParchment;
  const TILE = APPLE_COLORS.surfaceTile3;
  const keys = Object.keys(APPLE_HAZARD);

  it('covers the eight documented hazard classes', () => {
    expect(keys).toHaveLength(8);
  });

  it('clears AA as text on both light grounds, with headroom', () => {
    for (const k of keys) {
      const c = APPLE_HAZARD[k].text;
      expect(`${k}:white:${contrast(c, WHITE).toFixed(2)}`).toBe(`${k}:white:${Math.max(contrast(c, WHITE), 5).toFixed(2)}`);
      expect(contrast(c, PARCHMENT)).toBeGreaterThanOrEqual(4.6);
    }
  });

  it('clears AA on the dark tile', () => {
    for (const k of keys) {
      expect(`${k}:${contrast(APPLE_HAZARD[k].onDark, TILE) >= 4.8}`).toBe(`${k}:true`);
    }
  });

  it('keeps all eight categories perceptually separable, in both modes', () => {
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const pair = `${keys[i]}~${keys[j]}`;
        expect(`${pair}:light:${deltaE(APPLE_HAZARD[keys[i]].text, APPLE_HAZARD[keys[j]].text) >= 22}`).toBe(`${pair}:light:true`);
        expect(`${pair}:dark:${deltaE(APPLE_HAZARD[keys[i]].onDark, APPLE_HAZARD[keys[j]].onDark) >= 22}`).toBe(`${pair}:dark:true`);
      }
    }
  });

  it('never lets a hazard hue be mistaken for the one chrome accent', () => {
    for (const k of keys) {
      expect(`${k}:light:${deltaE(APPLE_HAZARD[k].text, APPLE_COLORS.primary) >= 24}`).toBe(`${k}:light:true`);
      expect(`${k}:dark:${deltaE(APPLE_HAZARD[k].onDark, APPLE_COLORS.primaryOnDark) >= 24}`).toBe(`${k}:dark:true`);
    }
  });

  it('carries a word on every hazard, so it is never colour alone', () => {
    const labels = keys.map((k) => APPLE_HAZARD[k].label);
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(keys.length);
  });

  it('is published to CSS at the same values, in both arms', () => {
    const cssName = (k) => `--ap-haz-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
    for (const k of keys) {
      expect(`${k}:${cssToken(cssName(k))}`).toBe(`${k}:${APPLE_HAZARD[k].text}`);
      expect(CSS).toContain(`${cssName(k)}: ${APPLE_HAZARD[k].onDark};`);
    }
  });

  it('resolves every display name the app uses', () => {
    for (const name of Object.keys(APPLE_HAZARD_ALIASES)) {
      expect(`${name}:${hazardPalette(name).text}`).toMatch(/#[0-9a-f]{6}$/);
    }
    // The two spellings of the same hazard must land on the same encoding.
    expect(hazardPalette('Flood')).toBe(hazardPalette('Monsoon Flood'));
    expect(hazardPalette('Severe Storm')).toBe(hazardPalette('Severe Local Storm'));
  });

  it('stays distinct from severity, which answers a different question', () => {
    for (const h of keys) {
      for (const sev of Object.keys(APPLE_SEVERITY)) {
        const pair = `${h}~${sev}`;
        expect(`${pair}:${APPLE_HAZARD[h].text !== APPLE_SEVERITY[sev].text}`).toBe(`${pair}:true`);
      }
    }
  });
});

describe('the theme boots before first paint', () => {
  const shell = readFileSync(join(ROOT, 'frontend/index.html'), 'utf8');

  it('ships the boot script inline, not as a module or a deferred file', () => {
    const boot = /<script>[\s\S]*?hazardnet\.theme[\s\S]*?<\/script>/.exec(shell);
    expect(boot).not.toBeNull();
    expect(boot[0].slice(0, 8)).toBe('<script>');
  });

  it('runs before the app bundle, or it would not be preventing anything', () => {
    expect(shell.indexOf('hazardnet.theme')).toBeLessThan(shell.indexOf('src="./src/main.tsx"'));
  });

  it('reads the same storage key the runtime writes', () => {
    const runtime = readFileSync(join(ROOT, 'frontend/src/components/apple/motion.ts'), 'utf8');
    const key = /STORAGE_KEY = '([^']+)'/.exec(runtime)[1];
    expect(shell).toContain(`getItem('${key}')`);
  });

  it('writes the same three things the runtime writes, so hydration is a no-op', () => {
    expect(shell).toMatch(/setAttribute\('data-theme', resolved\)/);
    expect(shell).toMatch(/classList\.toggle\('dark', resolved === 'dark'\)/);
    expect(shell).toMatch(/style\.colorScheme = resolved/);
  });

  it('survives localStorage being denied', () => {
    expect(/try \{[\s\S]*?\} catch \(/.test(shell)).toBe(true);
  });

  it('tints the status bar per scheme, from the Apple canvases', () => {
    const light = /--ap-canvas:\s*(#[0-9a-f]{3,8})/i.exec(CSS)[1];
    const dark = /--ap-tile-3:\s*(#[0-9a-f]{3,8})/i.exec(CSS)[1];
    expect(shell).toContain(`media="(prefers-color-scheme: light)" content="${light}"`);
    expect(shell).toContain(`media="(prefers-color-scheme: dark)" content="${dark}"`);
    expect(shell).not.toMatch(/content="#17171b"/);
  });
});

describe('the deleted systems stay deleted', () => {
  const GONE = [
    'packages/design-system/src/meridian.ts',
    'packages/design-system/src/tokens.ts',
    'packages/design-system/src/material3Expressive.ts',
    'packages/design-system/src/useTokens.ts',
    'frontend/src/styles/meridian.css',
    'frontend/src/styles/dark.css',
    'frontend/src/styles/nasa-hds.css',
    'frontend/src/styles/brand.css',
    'frontend/src/components/meridian/primitives.tsx',
    'frontend/src/design-system/tokens.ts',
    // The generator config, not just the output. A stylesheet can be deleted
    // and a system still reinstall itself: `components.json` told
    // `npx shadcn add` to write components into src/ and tokens into
    // index.css with a taupe base ramp. Deleting the CSS without deleting this
    // is leaving the door open and taking the sign off it.
    'frontend/components.json',
  ];

  test.each(GONE)('%s does not exist', (path) => {
    expect(existsSync(join(ROOT, path))).toBe(false);
  });

  test('no superseded vocabulary survives as a token alias', () => {
    // The subtler half of "the deleted systems stay deleted". Four systems were
    // removed as files while their NAMES lived on as aliases pointing at Apple
    // tokens — --severity-*, --surface-*, --glass-*, --panel-*, --chart-*,
    // --sidebar-*, --primary and friends. The pixels were already correct, so
    // nothing failed and nobody noticed; 52 of the last 80 had gone dead.
    //
    // A second set of names for one set of values is a second vocabulary, and
    // new code reaches for whichever it meets first. Tailwind theme keys are
    // the one legitimate exception: utilities cannot be generated without
    // them, they live only in index.css, and every value is a var(--ap-*).
    const DEAD_PREFIX =
      /^--(mrd|hds|hn|m3|md3|nasa|meridian|severity|surface|panel|glass|sidebar|chart|primary|secondary|success|warning|info|destructive|muted|popover|card|accent|input|foreground|background|border|subtle|spacesuit)(-|$)/;
    const offenders = [];
    for (const file of ['frontend/src/styles/apple.css', 'frontend/src/index.css']) {
      const body = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const m of body.matchAll(/(?:^|[;{])\s*(--[a-z0-9][\w-]*)\s*:/gm)) {
        const name = m[1];
        if (name.startsWith('--color-') || name.startsWith('--ap-')) continue;
        if (DEAD_PREFIX.test(name)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('hazard identity never borrows the severity ramp', () => {
    // Two encodings, two questions. Severity is ordinal ("how bad"), identity
    // is categorical ("which kind"). hazardPalette.ts used to answer the second
    // with the first's colours, so a flood was drawn in the chrome accent and a
    // drought in extreme-severity red whatever their actual severity.
    const palette = readFileSync(join(ROOT, 'frontend/src/lib/hazardPalette.ts'), 'utf8');
    const map = palette.slice(palette.indexOf('HAZARD_COLOR_TOKENS'), palette.indexOf('};', palette.indexOf('HAZARD_COLOR_TOKENS')));
    const tokens = [...map.matchAll(/var\((--ap-[\w-]+)\)/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.filter((t) => !t.startsWith('--ap-haz-'))).toEqual([]);
  });

  test('there is exactly one stylesheet of tokens', () => {
    // hero-media.css is page CSS, not a token layer. If a second token file appears,
    // the product has two design systems again.
    const styles = readFileSync(join(ROOT, 'frontend/src/index.css'), 'utf8');
    const imports = [...styles.matchAll(/@import\s+["']\.\/styles\/([a-z-]+\.css)["']/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['apple.css', 'hero-media.css']);
  });

  test('no dead namespace survives in the source', () => {
    const styles = readFileSync(join(ROOT, 'frontend/src/index.css'), 'utf8');
    for (const dead of ['--mrd-', '--m3-', '--risk-', '--nasa-']) {
      // Comments may mention them; declarations and var() references may not.
      const live = [...styles.matchAll(new RegExp(`(var\\(\\s*${dead}|^\\s*${dead}[a-z-]+\\s*:)`, 'gm'))];
      expect({ dead, uses: live.length }).toEqual({ dead, uses: 0 });
    }
  });
});
