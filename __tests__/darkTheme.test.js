/**
 * The dark theme's contract, on the Apple design system.
 *
 * DESIGN.md lists dark mode under "Known Gaps" — Apple's published spec is the daytime variant.
 * Rather than bolt on a second colour language, HazardNet's dark theme is built ENTIRELY from
 * surfaces Apple does document: tile-3 (#252527) becomes the canvas, tile-1 (#272729) the grouped
 * surface, tile-2 (#2a2a2c) the raised surface, and links switch to Sky Link Blue (#2997ff),
 * which is exactly what DESIGN.md instructs for dark tiles. So this is one Apple language at two
 * luminances, not two design systems.
 *
 * The theme works by re-pointing semantic roles (see `frontend/src/styles/apple.css` §5), which
 * means the failure modes are not visual regressions in one component — they are *gaps*: a role
 * nobody re-mapped, a pairing that drops under AA, or a utility family that resolves to a literal
 * and therefore ignores the theme entirely.
 *
 * This suite fails on all of them:
 *   1. completeness — every semantic role is re-pointed, in BOTH dark scopes;
 *   2. the pre-hydration arm — a `prefers-color-scheme` block exists, which is what stops a
 *      system-dark visitor getting a white flash on the 108 prerendered routes (audit F-01);
 *   3. contrast — each text role computed against each surface role (WCAG 2.x maths);
 *   4. the single-accent rule on dark — Action Blue (2.68:1 on tile-1) must never be the
 *      dark-surface accent;
 *   5. coverage — every colour utility family used anywhere in `frontend/src` is theme-aware
 *      or explicitly allow-listed as a data encoding.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPLE_HAZARD } from '../packages/design-system/src/apple';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8');
const appleCss = readFileSync(join(SRC, 'styles/apple.css'), 'utf8');

/* ── colour maths ─────────────────────────────────────────────────────────── */
const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The two dark scopes apple.css §5 declares, read separately so neither can rot. */
function darkBlocks() {
  // `\n {2}\}` rather than two literal spaces before the closing brace: the two
  // spaces are the indentation of apple.css's closing brace, and writing them
  // literally trips ESLint's `no-regex-spaces` in the 0-error lint gate.
  const media = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{([\s\S]*?)\n {2}\}/.exec(appleCss);
  const explicit = /\[data-theme='dark'\],\n\.dark \{([\s\S]*?)\n\}/.exec(appleCss);
  return { media: media?.[1] ?? '', explicit: explicit?.[1] ?? '' };
}

/** Every `--name: value` pair declared inside a dark scope. */
function declarations(block) {
  const out = new Map();
  for (const m of block.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) out.set(m[1], m[2].trim());
  return out;
}

const blocks = darkBlocks();
const explicitDecls = declarations(blocks.explicit);
const mediaDecls = declarations(blocks.media);

/* The resolved Apple dark palette. These are the literals apple.css §5 declares; the
   completeness test below proves the stylesheet actually contains them. */
const canvas = '#252527'; // tile-3
const grouped = '#272729'; // tile-1
const raised = '#2a2a2c'; // tile-2
const black = '#000000'; // nav bar, scrims
const SURFACES = [canvas, grouped, raised, black];

const AA = 4.5;

describe('the dark theme is declared, and declared twice', () => {
  test('both dark scopes exist: the explicit choice and the OS default', () => {
    expect(blocks.explicit).not.toBe('');
    expect(blocks.media).not.toBe('');
  });

  test('the OS arm is what paints the prerendered routes before React boots (F-01)', () => {
    // Without this, a system-dark visitor gets a white flash on all 108 prerendered
    // documents. It is scoped `:root:not([data-theme='light'])` so an explicit "light"
    // choice still wins over the OS.
    expect(appleCss).toContain('@media (prefers-color-scheme: dark)');
    expect(appleCss).toContain(":root:not([data-theme='light'])");
  });

  test('the two scopes agree — neither can drift from the other', () => {
    const drift = [];
    for (const [name, value] of explicitDecls) {
      if (!mediaDecls.has(name)) drift.push(`${name} missing from the prefers-color-scheme arm`);
      else if (mediaDecls.get(name) !== value) {
        drift.push(`${name}: explicit=${value} media=${mediaDecls.get(name)}`);
      }
    }
    for (const name of mediaDecls.keys()) {
      if (!explicitDecls.has(name)) drift.push(`${name} missing from the [data-theme='dark'] arm`);
    }
    expect(drift).toEqual([]);
  });

  test('every semantic role the light theme defines is re-pointed in the dark one', () => {
    // A role defined at :root but never re-pointed is a light-mode colour surviving into
    // dark mode — the exact gap this suite exists to catch.
    const ROLES = [
      '--ap-bg-canvas', '--ap-bg-grouped', '--ap-bg-raised', '--ap-bg-inverse',
      '--ap-label', '--ap-label-secondary', '--ap-label-tertiary', '--ap-label-quaternary',
      '--ap-on-inverse', '--ap-separator', '--ap-separator-opaque',
      '--ap-action', '--ap-action-fg', '--ap-link', '--ap-focus-ring',
      '--ap-frosted-bg', '--ap-elev-hairline',
      '--ap-success', '--ap-warning', '--ap-danger', '--ap-info',
    ];
    expect(ROLES.filter((role) => !explicitDecls.has(role))).toEqual([]);
  });

  test('the whole neutral ramp inverts, so ~4,000 carbon utilities follow the theme', () => {
    const steps = ['05', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
    expect(steps.filter((s) => !explicitDecls.has(`--ap-n-${s}`))).toEqual([]);
  });

  test('every severity level has a dark-ground value', () => {
    const levels = ['low', 'moderate', 'high', 'very-high', 'extreme'];
    const missing = levels.flatMap((l) =>
      [`--ap-sev-${l}`, `--ap-sev-${l}-surface`].filter((t) => !explicitDecls.has(t)),
    );
    expect(missing).toEqual([]);
  });

  test('the dark surfaces are Apple tiles, not an invented grey', () => {
    // The whole point: dark mode is Apple's own documented dark palette.
    expect(explicitDecls.get('--ap-bg-canvas')).toBe('var(--ap-tile-3)');
    expect(explicitDecls.get('--ap-bg-grouped')).toBe('var(--ap-tile-1)');
    expect(explicitDecls.get('--ap-bg-raised')).toBe('var(--ap-tile-2)');
  });
});

describe('the single-accent rule survives the theme switch', () => {
  test('dark surfaces use Sky Link Blue, never Action Blue', () => {
    // Action Blue (#0066cc) measures 2.68:1 on tile-1 — unreadable. DESIGN.md's own
    // `primary-on-dark` token exists for exactly this, and this is what enforces it.
    expect(contrast('#0066cc', grouped)).toBeLessThan(3);
    expect(explicitDecls.get('--ap-action')).toBe('var(--ap-primary-on-dark)');
    expect(explicitDecls.get('--ap-link')).toBe('var(--ap-primary-on-dark)');
    expect(explicitDecls.get('--ap-focus-ring')).toBe('var(--ap-primary-on-dark)');
  });

  test('Sky Link Blue clears AA on every dark surface', () => {
    for (const surface of SURFACES) {
      expect(contrast('#2997ff', surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  test('the dark theme introduces no second accent', () => {
    // Every colour the dark scope sets is either a var() reference, a neutral/tile value,
    // a severity value, or a transparency. A new saturated hue here would be a second accent.
    const ALLOWED_LITERALS = new Set([
      '#ffffff', '#cccccc', '#9a9a9f', '#6e6e73', '#3a3a3c', '#48484a',
      '#252527', '#272729', '#2a2a2c', '#000000', '#e4e4e6', '#f2f2f4',
      // severity, on dark
      '#4ad66d', '#f5b73d', '#ff8a5b', '#ff6b60', '#ff7eb6',
      '#10301c', '#33260a', '#3a1d10', '#3a1512', '#351022',
      // hazard identity, on dark — the second data-encoding layer. Read from the
      // system rather than transcribed, so this list cannot drift from apple.ts.
      ...Object.values(APPLE_HAZARD).map((h) => h.onDark.toLowerCase()),
    ]);
    const stray = [];
    for (const [name, value] of explicitDecls) {
      for (const hex of value.match(/#[0-9a-f]{6}/gi) ?? []) {
        if (!ALLOWED_LITERALS.has(hex.toLowerCase())) stray.push(`${name}: ${hex}`);
      }
    }
    expect(stray).toEqual([]);
  });
});

describe('contrast on the dark surfaces', () => {
  test.each([
    ['primary label', '#ffffff'],
    ['secondary label', '#cccccc'],
    ['tertiary label', '#9a9a9f'],
    ['link / accent', '#2997ff'],
    ['severity low', '#4ad66d'],
    ['severity moderate', '#f5b73d'],
    ['severity high', '#ff8a5b'],
    ['severity very high', '#ff6b60'],
    ['severity extreme', '#ff7eb6'],
    ...Object.entries(APPLE_HAZARD).map(([name, h]) => [`hazard ${name}`, h.onDark]),
  ])('%s clears AA on all four dark surfaces', (_role, ink) => {
    for (const surface of SURFACES) {
      const ratio = contrast(ink, surface);
      expect({ ink, surface, pass: ratio >= AA }).toEqual({ ink, surface, pass: true });
    }
  });

  test('the tertiary label is the floor — anything dimmer would fail', () => {
    // Pinned so nobody "softens" it later: #9a9a9f on tile-1 is the tightest pairing
    // the theme ships, and it has ~0.3 of headroom over AA.
    const ratio = contrast('#9a9a9f', grouped);
    expect(ratio).toBeGreaterThanOrEqual(AA);
    expect(ratio).toBeLessThan(6);
  });

  test('the severity surfaces are mixed over the dark ground, not over white', () => {
    // A pale light-mode surface surviving into dark mode would be a white panel in a
    // dark page — and its dark text would then be invisible.
    for (const [level, surface] of [
      ['low', '#10301c'], ['moderate', '#33260a'], ['high', '#3a1d10'],
      ['very-high', '#3a1512'], ['extreme', '#351022'],
    ]) {
      expect(explicitDecls.get(`--ap-sev-${level}-surface`)).toBe(surface);
      expect(luminance(surface)).toBeLessThan(luminance(raised));
    }
  });

  test('each severity ink clears AA on its own surface', () => {
    for (const [ink, surface] of [
      ['#4ad66d', '#10301c'], ['#f5b73d', '#33260a'], ['#ff8a5b', '#3a1d10'],
      ['#ff6b60', '#3a1512'], ['#ff7eb6', '#351022'],
    ]) {
      expect({ ink, surface, pass: contrast(ink, surface) >= AA }).toEqual({ ink, surface, pass: true });
    }
  });
});

describe('the theme reaches every colour in the product', () => {
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!/node_modules|__tests__|dist/.test(full)) walk(full, out);
      } else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
    }
    return out;
  };

  /** Families re-pointed by the Tailwind bridge in index.css `@theme inline`. */
  const THEME_AWARE = new Set([
    'carbon', 'spacesuit', 'ap', 'background', 'foreground', 'body', 'subtle', 'card',
    'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'border', 'input',
    'ring', 'success', 'warning', 'info', 'surface', 'sidebar', 'nasa', 'severity', 'chart',
  ]);

  /** Data encodings: hazard/dataviz colour, allowed to be fixed. */
  const DATA_ENCODINGS = new Set(['severity', 'chart']);

  const PALETTE_FAMILIES = new Set([
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime',
    'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia',
    'pink', 'rose',
  ]);
  const UTILITY =
    /\b(?:bg|text|border|from|to|via|ring|fill|stroke|decoration|placeholder|outline|divide|caret|selection|accent)-([a-z]+)(?:-[a-z0-9.]+)?\b/g;

  test('every colour utility family used anywhere resolves through a theme-aware token', () => {
    // After the Apple migration every Tailwind palette family is declared in the bridge, so
    // this is now a completeness check on the bridge rather than a list of known gaps: a
    // family that appears in the source and is NOT declared would silently ship Tailwind's
    // stock palette, which cannot follow the theme.
    const themeBlock = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(indexCss)?.[1] ?? '';
    const declared = new Set(
      [...themeBlock.matchAll(/--color-([a-z]+)-/g)].map((m) => m[1]),
    );
    const unresolved = new Set();
    for (const file of walk(SRC)) {
      for (const match of readFileSync(file, 'utf8').matchAll(UTILITY)) {
        const family = match[1];
        if (!PALETTE_FAMILIES.has(family)) continue;
        if (declared.has(family) || THEME_AWARE.has(family) || DATA_ENCODINGS.has(family)) continue;
        unresolved.add(family);
      }
    }
    expect([...unresolved]).toEqual([]);
  });

  test('the `dark:` variant still resolves, for the components that need a real twin', () => {
    // Most of the product needs no `dark:` twin — the token layer does the work. But the
    // variant must still exist for the handful of cases where a *different element* has to
    // show, not a different colour.
    expect(indexCss).toMatch(/@custom-variant dark \(/);
    expect(indexCss).toContain('[data-theme="dark"]');
  });

  test('apple.css is imported by index.css, before anything that consumes its tokens', () => {
    const appleAt = indexCss.indexOf('@import "./styles/apple.css"');
    expect(appleAt).toBeGreaterThan(-1);
    const heroAt = indexCss.indexOf('@import "./styles/hero-media.css"');
    expect(appleAt).toBeLessThan(heroAt);
  });

  test('the deleted stylesheets are not imported again', () => {
    for (const dead of ['dark.css', 'meridian.css', 'nasa-hds.css', 'brand.css']) {
      expect(indexCss).not.toMatch(new RegExp(`@import\\s+["'][^"']*${dead.replace('.', '\\.')}`));
    }
  });
});
