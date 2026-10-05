/**
 * The header menu icon must be visible in all four states it renders in.
 *
 * The defect this pins (2026-10-05): `.hn-menu-icon__bar { fill: currentColor }`
 * lived in `styles/brand.css`. That file was deleted with the other superseded
 * stylesheets; the component was not. An SVG `<rect>` with no `fill` does not
 * render unstyled — `fill` has an initial value of BLACK — so the icon painted
 * black over the dark hero art (1.28:1) and black on the dark-mode bar
 * (1.37:1), while still looking correct on the white scrolled header, which is
 * the state most people see first.
 *
 * Nothing caught it: a class that matches no rule is valid CSS, a className
 * that matches no class is valid JSX, and the contrast scanner reads declared
 * colours — it cannot see a colour that was never declared.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../../..');
const APPLE = readFileSync(join(ROOT, 'frontend/src/styles/apple.css'), 'utf8');
const ICON = readFileSync(join(__dirname, '../MenuToggleIcon.tsx'), 'utf8');
const NAVBAR = readFileSync(join(ROOT, 'frontend/src/components/Navbar.tsx'), 'utf8');

/** Relative luminance, WCAG 2.x. */
const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Relative luminance of white, which is 1 by definition — stated rather than
 *  written as a hex literal so the token scanner stays meaningful. */
const WHITE_L = 1;

/** Pull a token's literal value out of a specific block of apple.css. */
const tokenIn = (block: string, name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  if (!m) throw new Error(`${name} not found`);
  return m[1];
};

const lightRoot = APPLE.slice(0, APPLE.indexOf('@media (prefers-color-scheme: dark)'));

describe('header menu icon — the bars must follow the header ink', () => {
  it('declares fill: currentColor on the bars', () => {
    // The whole contract. `currentColor` is what makes the icon correct in
    // every state for free: it inherits the header's own text colour, which is
    // already contrast-checked against that header's background.
    const bar = /\.hn-menu-icon__bar\s*\{([^}]*)\}/.exec(APPLE);
    expect(bar).not.toBeNull();
    expect(bar![1]).toMatch(/fill:\s*currentColor/);
  });

  it('never leaves an icon shape to the SVG default fill', () => {
    // Every shape the component renders must be named by a rule that sets fill.
    const shapes = [...ICON.matchAll(/className="(hn-menu-icon__[\w-]+)[^"]*"/g)].map((m) => m[1]);
    expect(shapes.length).toBeGreaterThan(0);
    const unfilled = [...new Set(shapes)].filter((cls) => {
      const rule = new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(APPLE);
      return rule === null || !/fill:/.test(rule[1]);
    });
    expect(unfilled).toEqual([]);
  });
});

describe('header menu icon — measured contrast in every state', () => {
  const AA_NON_TEXT = 3; // WCAG 2.2 §1.4.11

  it('clears 3:1 on the light scrolled bar', () => {
    // bars inherit text-carbon-90 -> --ap-n-90; ground is bg-white/95 over white
    const ink = tokenIn(lightRoot, '--ap-n-90');
    expect(ratio(lum(ink), WHITE_L)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('clears 3:1 on the dark scrolled bar', () => {
    // the neutral ramp inverts, and bg-white/95 is re-pointed to the dark canvas
    const darkBlock = APPLE.slice(APPLE.indexOf('@media (prefers-color-scheme: dark)'));
    const ink = tokenIn(darkBlock, '--ap-n-90');
    const ground = tokenIn(lightRoot, '--ap-tile-3');
    expect(ratio(lum(ink), lum(ground))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('clears 3:1 over the brightest hero slide', () => {
    // Over the hero the bars are white on `bg-black/25` above the artwork. The
    // brightest 64px band across the four slides, blurred as backdrop-blur-md
    // sees it and scrimmed, measures L = 0.275 (hero-flooded-fields).
    const WORST_HERO_BACKDROP = 0.275;
    expect(ratio(WHITE_L, WORST_HERO_BACKDROP)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('drops the fixed accent bead over the hero, where the ground is photography', () => {
    // Action Blue on that same slide is 1.07:1. A hue that cannot be checked
    // against the ground it lands on has to give way to currentColor.
    expect(APPLE).toMatch(/\[data-over-hero='true'\]\s*\.hn-menu-icon__node\s*\{[^}]*fill:\s*currentColor/);
    expect(NAVBAR).toMatch(/data-over-hero=/);
  });

  it('keeps the bead on a theme-aware token elsewhere', () => {
    // --ap-action is --ap-primary on light and --ap-primary-on-dark on dark, so
    // the bead follows the theme instead of pinning a second accent.
    const node = /\.hn-menu-icon__node\s*\{([^}]*)\}/.exec(APPLE);
    expect(node).not.toBeNull();
    expect(node![1]).toMatch(/fill:\s*var\(--ap-action\)/);
  });
});
