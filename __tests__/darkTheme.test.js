/**
 * Phase 9 · the dark theme's contract.
 *
 * The theme works by re-pointing palette variables (see the header of
 * `frontend/src/styles/dark.css`), so the failure modes are not visual regressions in one
 * component — they are *gaps*: a colour step nobody re-mapped, a text utility whose light-mode
 * meaning ("near-white ink on a dark panel") is destroyed by the ramp, or a colour utility that
 * resolves to a literal and therefore ignores the theme entirely.
 *
 * This suite fails on all three:
 *   1. the ramp — every carbon step is re-pointed, in the dark scope, in the theme layer;
 *   2. the contrasts — each text role is computed against each surface role (WCAG 2.x maths);
 *   3. the coverage gate — every colour utility family used anywhere in `frontend/src` is either
 *      theme-aware or explicitly allow-listed below with a reason. That is the "machine gate"
 *      §5.2 of the audit asked for, expressed as "can this colour change with the theme?"
 *      rather than "does this file have a `dark:` twin?".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8');
const darkCss = readFileSync(join(SRC, 'styles/dark.css'), 'utf8');
const meridianCss = readFileSync(join(SRC, 'styles/meridian.css'), 'utf8');

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

/** Every `--name: value` pair declared inside the dark scope blocks of dark.css. */
const darkDeclarations = () => {
  const out = new Map();
  const blocks = [...darkCss.matchAll(/\[data-mrd-theme='dark'\][^{]*\{([\s\S]*?)\n\}/g)];
  for (const block of blocks) {
    for (const [, name, value] of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out.set(name, value.trim());
    }
  }
  return out;
};

/* ── 1 · the ramp ─────────────────────────────────────────────────────────── */
describe('dark theme — the carbon ramp', () => {
  const declared = darkDeclarations();

  test.each(['05', '10', '20', '30', '40', '50', '60', '70', '80', '90'])(
    'carbon-%s is re-pointed for dark',
    (step) => {
      expect(declared.has(`--hds-color-carbon-${step}`)).toBe(true);
    },
  );

  test('the ramp is a re-pointing, not a second palette: two values per step at most', () => {
    // Light values live at :root through nasa-hds.css; this asserts the dark layer does not
    // also *declare* them (which would mean the layer had become the palette).
    for (const [, value] of declared) {
      if (value.startsWith('var(')) continue;
      expect(value).not.toMatch(/^#f6f6f6$|^#e3e3e3$|^#d1d1d1$|^#b9b9bb$/i);
    }
  });

  test('the ink end of the ramp is genuinely light and the surface end genuinely dark', () => {
    expect(contrast('#f2f5f7', '#0b0e11')).toBeGreaterThan(15);
    expect(contrast('#a8b4bf', '#0b0e11')).toBeGreaterThan(7);
  });

  test('dark.css is imported by the theme layer, after the token layers it overrides', () => {
    const darkAt = indexCss.indexOf('./styles/dark.css');
    expect(darkAt).toBeGreaterThan(-1);
    for (const layer of ['./styles/nasa-hds.css', './styles/brand.css', './styles/meridian.css']) {
      expect(indexCss.indexOf(layer)).toBeLessThan(darkAt);
    }
  });

  test('the raised surface the ink fills use exists as a Meridian primitive', () => {
    expect(meridianCss).toContain('--mrd-dark-surface-raised:');
  });
});

/* ── 2 · contrast of every role pair that carries text ─────────────────────── */
describe('dark theme — contrast', () => {
  const canvas = '#0b0e11';
  const grouped = '#14191e';
  const elevated = '#1b2128';
  const raised = '#232b33';

  const AA = 4.5;

  test.each([
    ['primary label', '#f2f5f7'],
    ['strong ink', '#e2e8ee'],
    ['body ink', '#cfd6dd'],
    ['secondary ink', '#a8b4bf'],
    ['muted label', '#8b98a4'],
    ['destructive ink', '#ff6b60'],
    ['success ink', '#47da84'],
    ['warning ink', '#f5af0c'],
    ['info ink', '#6fa8ff'],
  ])('%s clears AA on all four surfaces', (_role, ink) => {
    for (const surface of [canvas, grouped, elevated, raised]) {
      expect({ ink, surface, ratio: Number(contrast(ink, surface).toFixed(2)) }).toEqual({
        ink,
        surface,
        ratio: expect.any(Number),
      });
      expect(contrast(ink, surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  test('white on the solid status fills stays above the large-text floor (the reason fills stay deep)', () => {
    // 3:1 is WCAG AA for large/bold text, which is what these fills carry (status chips and
    // buttons at >=14px bold). The brand pair clears 4.5 outright; the greens and oranges are
    // byte-identical to their light-mode values, so dark mode is not a regression here - and
    // darkening them in dark mode would be a change to the light-mode palette too.
    for (const fill of ['#970002', '#7b1d21', '#1c67e3']) {
      expect(contrast('#ffffff', fill)).toBeGreaterThanOrEqual(4.5);
    }
    for (const fill of ['#16a34a', '#b25600']) {
      expect(contrast('#ffffff', fill)).toBeGreaterThanOrEqual(3);
    }
  });

  test('the pale status grounds are re-mixed over the dark surface, not over white', () => {
    // A `color-mix(..., var(--hn-hds-white))` in the dark scope would be a white panel:
    // the mix must name the elevated surface instead.
    for (const role of ['destructive-surface', 'success-surface', 'warning-surface', 'info-surface']) {
      const line = new RegExp(`--${role}:\\s*([^;]+);`).exec(darkCss)?.[1] ?? '';
      expect(line).toContain('--mrd-bg-elevated');
      expect(line).not.toContain('--hn-hds-white');
    }
  });
});

/* ── 3 · the coverage gate ────────────────────────────────────────────────── */
describe('dark theme — coverage gate', () => {
  /**
   * Families whose utilities this layer re-points or overrides. Anything not listed here fails
   * the gate below, so adding a new hue to the app is a deliberate act with a dark value behind
   * it rather than a page that quietly stays light.
   */
  const THEME_AWARE = new Set([
    // The carbon ramp and every neutral alias of it (all re-pointed in dark.css §1).
    'carbon', 'gray', 'zinc', 'neutral', 'stone', 'slate',
    // Families `@theme inline` aliases *by role* rather than by hue: their steps resolve to
    // --destructive* / --success* / --warning* / --info / --accent* / the carbon ramp, all of
    // which dark.css §1-§2 re-points. This is why they do not need per-shade dark rules.
    'rose', 'red', 'emerald', 'green', 'blue', 'sky', 'teal', 'yellow', 'orange',
    // Pinned explicitly in dark.css §3-§5 (they are not role-aliased: amber points straight at
    // HDS yellow/orange primitives, and the brand inks are the mark's own crimson).
    'white', 'black', 'nasa', 'amber', 'primary', 'primary-strong', 'primary-foreground',
    'destructive', 'success', 'warning', 'info', 'accent', 'accent-border', 'secondary',
    'muted', 'muted-foreground', 'card', 'border', 'input', 'background', 'foreground', 'ring',
    'popover', 'popover-foreground', 'card-foreground', 'accent-foreground', 'spacesuit',
  ]);

  /**
   * Data encodings stay off-system on purpose (see DESIGN_SYSTEM.md and the note in index.css):
   * no HDS hue ramp exists for them, and their job is to be distinguishable from each other,
   * not to describe a surface or an ink. They are rendered as saturated fills and remain legible
   * on either ground. Everything else must be theme-aware.
   */
  const DATA_ENCODINGS = new Set(['indigo', 'purple', 'chart', 'violet', 'fuchsia', 'cyan', 'lime', 'pink', 'teal']);

  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
    }
    return out;
  };

  test('every colour utility used anywhere resolves through a token the theme can change', () => {
    /** Tailwind's palette families — the only tokens in a colour utility worth auditing. */
  const PALETTE_FAMILIES = new Set([
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime',
    'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia',
    'pink', 'rose',
  ]);
  const UTILITY = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|decoration|placeholder|outline|divide|caret|selection|accent)-([a-z]+)(?:-[a-z0-9.]+)?\b/g;
    const unknown = new Map();
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        for (const match of line.matchAll(UTILITY)) {
          const family = match[1];
          // `text-xs`, `bg-center`, `border-b`, `shadow-lg` … are not colours.
          if (!PALETTE_FAMILIES.has(family) && !THEME_AWARE.has(family) && !DATA_ENCODINGS.has(family)) continue;
          if (THEME_AWARE.has(family) || DATA_ENCODINGS.has(family)) continue;
          const where = relative(ROOT, file);
          if (!unknown.has(family)) unknown.set(family, new Set());
          unknown.get(family).add(where);
        }
      }
    }
    const report = [...unknown.entries()].map(
      ([family, files]) => `${family}: ${[...files].slice(0, 3).join(', ')}`,
    );
    expect(report).toEqual([]);
  });

  test('the ink-filled chrome and white surfaces are pinned, not left to the ramp', () => {
    // These three are the ones the run-time audit found broken without them: `bg-carbon-90
    // text-white` buttons (light fill + white text) and the 447 `bg-white` panels.
    for (const selector of ['.bg-carbon-90', '.bg-carbon-80', '.bg-white']) {
      expect(darkCss).toContain(`[data-mrd-theme='dark'] ${selector}`);
    }
  });

  test('every translucent white surface that sits over the app is re-pointed for dark', () => {
    // The 2026-10-04 report ("while I'm scrolling I can't see the hamburger… it's white and the
    // background is also white") was one step of this family: `bg-white/95` — the scrolled
    // header — was the only /95 in the codebase and the only step dark.css had not been told
    // about, so the bar stayed white while `text-carbon-90` inside it became near-white ink.
    // The gate walks the steps actually used in the source, so the next one cannot slip through.
    const OVER_IMAGERY = new Set(['10', '15', '20']); // chips on imagery / saturated fills, pinned by intent
    const selector = (token) => `.${token.replace(/:/g, '\\:').replace(/\//g, '\\/')}`;
    const used = new Map();
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const [, hover, step] of source.matchAll(/\b(hover:)?bg-white\/(\d+)\b/g)) {
        const token = `${hover ?? ''}bg-white/${step}`;
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(relative(ROOT, file));
      }
    }
    expect(used.size).toBeGreaterThan(0);
    const unmapped = [...used.entries()]
      .filter(([token]) => {
        const step = token.slice(token.indexOf('/') + 1);
        if (OVER_IMAGERY.has(step)) return false;
        // Each token is checked as written, hover included: `/60` was mapped and
        // `hover:bg-white/60` was not, which is the same bug at one remove.
        return !darkCss.includes(`[data-mrd-theme='dark'] ${selector(token)}`);
      })
      .map(([token, files]) => `${token} (${[...files].slice(0, 2).join(', ')})`);
    expect(unmapped).toEqual([]);
    // And the list is complete: the three imagery steps are the only exemptions.
    for (const step of OVER_IMAGERY) {
      expect([...used.keys()].some((token) => token.endsWith(`/${step}`))).toBe(true);
    }
  });

  test('Leaflet gets its dark treatment, including a per-layer tile class', () => {
    expect(darkCss).toContain('.leaflet-popup-content-wrapper');
    expect(darkCss).toContain('.hn-tile-osmStandard');
    const leafletHook = readFileSync(join(SRC, 'hooks/useLeafletMap.ts'), 'utf8');
    expect(leafletHook).toContain('className: `hn-tile-${baseLayerKey}`');
  });
});

/* ── 4 · the switch ───────────────────────────────────────────────────────── */
describe('dark theme — the switch', () => {
  test('the app follows the OS again, now that the theme layer exists', () => {
    const motion = readFileSync(join(SRC, 'components/meridian/motion.ts'), 'utf8');
    // The stopgap (P0-1) defaulted to 'light' because dark was 3.7% applied. Phase 9 replaced
    // that with a theme layer, so the default goes back to following the system.
    expect(motion).toMatch(/window\.localStorage\.getItem\(STORAGE_KEY\);\s*\n\s*return stored === 'light' \|\| stored === 'dark' \|\| stored === 'system' \? stored : 'system';/);
  });

  test('both the attribute and the class are honoured, because the dark: variant uses both', () => {
    expect(indexCss).toMatch(/@custom-variant dark \(&:is\(\.dark \*, \[data-mrd-theme="dark"\] \*\)\)/);
    expect(darkCss).toMatch(/\[data-mrd-theme='dark'\],\n\.dark \{/);
  });

  test('the switch reaches the UI — the hook returned it, App used to drop it', () => {
    // Reported 2026-10-04: "why is everything black?" — the answer was that the hook follows
    // `prefers-color-scheme` and the only call site (`App.tsx`) discarded `setTheme`, so a
    // dark-mode OS was a one-way door. These assertions are the plumbing, end to end.
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).toContain('const { theme, setTheme } = useMeridianTheme();');
    expect(app).toContain('<Navbar theme={theme} onThemeChange={setTheme} />');

    const navbar = readFileSync(join(SRC, 'components/Navbar.tsx'), 'utf8');
    expect(navbar).toContain('onThemeChange?: (theme: MeridianThemeName) => void;');
    expect(navbar).toContain('theme={theme}');
    expect(navbar).toContain('onThemeChange={onThemeChange}');

    // It belongs in the drawer, with the other preference: the bar's contract is ONE button.
    const drawer = readFileSync(join(SRC, 'components/MenuDrawer.tsx'), 'utf8');
    expect(drawer).toContain("import { ThemeToggle } from './ThemeToggle';");
    expect(drawer).toContain('<ThemeToggle theme={theme} onChange={onThemeChange}');

    // Three states, not two: dropping 'system' would strand the visitors who want the OS to
    // keep switching for them, which is the behaviour Phase 9 shipped.
    const toggle = readFileSync(join(SRC, 'components/ThemeToggle.tsx'), 'utf8');
    for (const value of ["{ value: 'system'", "{ value: 'light'", "{ value: 'dark'"]) {
      expect(toggle).toContain(value);
    }
    expect(toggle).toContain('aria-pressed');
    expect(toggle).toContain("t('common.appearance')");
  });

  test('the artwork — which CSS cannot re-point — follows the resolved theme', () => {
    // A colour can be re-mapped for dark; an <img src> cannot. The lockup is the one asset with
    // two artworks, and the two reported dark-on-dark spots (footer, drawer) both pinned the
    // light one by default.
    const logo = readFileSync(join(SRC, 'components/HazardNetLogo.tsx'), 'utf8');
    expect(logo).toContain("const LOCKUP_SRC = { light: '/hazardnet-logo.svg', dark: '/hazardnet-logo-light.svg' } as const;");
    expect(logo).toContain('const resolved = useResolvedTheme();');
    expect(logo).toContain("const artwork = variant === 'auto' ? resolved : variant;");
    expect(logo).toContain("variant = 'auto'");

    for (const file of ['components/Footer.tsx', 'components/MenuDrawer.tsx', 'components/auth/AuthLayout.tsx']) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source).toMatch(/<HazardNetBrand/);
      expect(source).not.toMatch(/<HazardNetBrand[^>]*variant="light"/);
    }
    // The one deliberately dark surface keeps its explicit white-wordmark artwork: the auth brand
    // panel is `bg-carbon-black` in both themes.
    const panel = readFileSync(join(SRC, 'components/auth/BrandPanel.tsx'), 'utf8');
    expect(panel).toContain('bg-carbon-black');
    expect(panel).toContain('<HazardNetBrand size="md" variant="dark" />');
    // Over the front-door hero the bar is a black scrim at all times, so the artwork stays white.
    const navbar = readFileSync(join(SRC, 'components/Navbar.tsx'), 'utf8');
    expect(navbar).toContain("variant={overHero ? 'dark' : 'auto'}");
  });

  test('the resolved theme is observable, so an OS flip reaches the artwork', () => {
    const motion = readFileSync(join(SRC, 'components/meridian/motion.ts'), 'utf8');
    expect(motion).toContain('export function readAppliedTheme(): ResolvedTheme');
    expect(motion).toContain('const themeListeners = new Set<(theme: ResolvedTheme) => void>();');
    expect(motion).toContain('export function useResolvedTheme(): ResolvedTheme');
    // `apply()` is still the single place that writes the DOM *and* the one place that announces.
    expect(motion).toMatch(/announceTheme\(resolvedTheme\);/);
  });
});
