/**
 * Motion contract gate — the fifth documented extension of the Apple system.
 *
 * `docs/design-system/APPLE.md` → Extension 5 states the rules; this file is what makes them
 * enforceable, in the same spirit as `colourDiscipline.test.js` (a colour the system does not
 * publish) and `appleParity.test.js` (a token that drifted).
 *
 * The premise being protected is that most moments should NOT animate. So this suite asserts the
 * prohibitions as hard as the permissions: no layout-property animation, no invented durations or
 * curves, no motion on the keyboard-first surface, and no transition without a reduced-motion arm.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLE_CSS = readFileSync(join(ROOT, 'frontend/src/styles/apple.css'), 'utf8');

const SRC = join(ROOT, 'frontend/src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const isTest = (rel) => rel.includes('__tests__') || rel.includes('.test.');
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Files whose animation is content rather than interface, or a whole canvas engine. */
const EXEMPT = [
  'frontend/src/remotion/', // Remotion compositions ARE motion; they render frames, not UI.
  'frontend/src/components/ui/motion-navigation-menu.tsx', // a vendored nav-menu primitive
];

describe('motion contract — roles exist and keep their values', () => {
  it('publishes the press, state, entrance, stagger and meter roles', () => {
    for (const cls of [
      '.ap-chip',
      '.ap-pressable',
      '.ap-press-row',
      '.ap-state-transition',
      '.ap-enter',
      '.ap-enter-drop',
      '.ap-stagger',
      '.ap-meter-fill',
    ]) {
      expect(APPLE_CSS).toContain(cls);
    }
  });

  it('defines each role from the published tokens, never a literal duration or curve', () => {
    const rules = [
      /\.ap-chip\s*\{[^}]*transition:\s*transform var\(--ap-duration-press\) var\(--ap-ease\)/,
      /\.ap-chip:active\s*\{[^}]*transform:\s*scale\(var\(--ap-press-scale\)\)/,
      /\.ap-pressable:active\s*\{[^}]*scale\(var\(--ap-press-scale-soft\)\)/,
      /\.ap-press-row:active\s*\{[^}]*background-color/,
      /\.ap-state-transition\s*\{[^}]*var\(--ap-duration-base\) var\(--ap-ease\)/,
      /\.ap-meter-fill\s*\{[^}]*scaleX\(var\(--ap-meter-value/,
    ];
    for (const rule of rules) expect(APPLE_CSS).toMatch(rule);
  });

  it('keeps the selected chip on a box that cannot reflow when selection changes', () => {
    // The selected state must not change the border WIDTH: a 1px -> 2px swap shifts the label on
    // the frame the reader is looking at, which is why selection deepens the ring instead.
    const selected = APPLE_CSS.match(/\.ap-chip\[aria-selected='true'\][\s\S]*?\}/)?.[0] ?? '';
    expect(selected).toContain('box-shadow');
    expect(selected).not.toMatch(/border:\s*2px/);
  });
});

describe('motion contract — nothing animates layout', () => {
  const files = walk(SRC).filter((f) => !isTest(relative(SRC, f)));

  it('has no transition or keyframe on width / height / top / left / margin / padding', () => {
    const violations = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue;
      const body = stripComments(readFileSync(file, 'utf8'));
      for (const rule of body.matchAll(/transition[^;{}]*;[^}]*/g)) {
        const decl = rule[0];
        if (!/\b(width|height|top|left|right|bottom|margin|padding)\b/.test(decl)) continue;
        // `transition: all` plus one of those properties is the shape being blocked.
        violations.push(`${rel}: ${decl.trim().slice(0, 80)}`);
      }
      // A keyframe block that animates a layout property is the other shape.
      for (const rule of body.matchAll(/@keyframes[\s\S]*?\n\}/g)) {
        const block = rule[0];
        if (/\b(width|height|top|left)\s*:/.test(block)) {
          violations.push(`${rel}: @keyframes animating a layout property`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not reintroduce a width-based meter', () => {
    const meter = readFileSync(join(SRC, 'components/user/dashboard/ui.tsx'), 'utf8');
    expect(meter).toContain('ap-meter-fill');
    expect(meter).not.toMatch(/style=\{\{\s*width:/);
  });
});

describe('motion contract — no invented vocabulary in the shared kit or the design-system layer', () => {
  const shared = [
    'frontend/src/components/user/dashboard/ui.tsx',
    'frontend/src/components/ui/DataState.tsx',
    'frontend/src/components/apple/primitives.tsx',
  ];

  it('animates only through the published web roles', () => {
    for (const rel of shared) {
      const body = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      const transitions = body.match(/transition[^;'"]*/g) ?? [];
      for (const decl of transitions) {
        // Either a token duration, or a Tailwind duration utility that resolves to one.
        const tokenised =
          /var\(--ap-duration-(press|base)\)/.test(decl) ||
          /duration-\[var\(--ap-duration/.test(decl);
        expect(`${rel}: ${decl}${tokenised ? ' OK' : ''}`).toBe(`${rel}: ${decl} OK`);
      }
    }
  });

  it('keeps the command palette off the motion path', () => {
    // The one surface where an animation is a latency, not a polish, and the most tempting place
    // to add one. `ap-enter*` on it would read as the palette taking time to think.
    const palette = readFileSync(join(SRC, 'components/CommandPalette.tsx'), 'utf8');
    expect(palette).not.toMatch(/ap-enter/);
  });

  it('leaves the live console views as an instant swap', () => {
    // Data the reader is operating on: a cross-fade would delay the map's first paint.
    const console_ = readFileSync(join(SRC, 'pages/Dashboard.tsx'), 'utf8');
    const viewBlocks = console_.match(/\{activeView === '[a-z]+' && \(/g) ?? [];
    expect(viewBlocks.length).toBeGreaterThan(3);
    for (const block of viewBlocks) expect(block).not.toMatch(/ap-enter|motion\./);
  });
});

describe('motion contract — reduced motion is a floor, not a switch-off', () => {
  it('zeroes the stagger delay, which the blanket duration floor cannot reach', () => {
    const floor = APPLE_CSS.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
    const block = floor.find((b) => b.includes('.ap-stagger')) ?? '';
    expect(block).toContain('animation-delay: 0ms');
    expect(block).toContain('animation-duration: 0.01ms !important');
  });

  it('answers reduced transparency and increased contrast, at the token level', () => {
    // Two accessibility signals the motion floor does not cover: translucency and contrast.
    // Both arms retune the frosted tokens rather than re-declaring each surface, so every
    // consumer follows — including the `.glass-*` utilities in index.css.
    const transparency = APPLE_CSS.match(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(transparency).toContain('--ap-frosted-blur: 0px');
    expect(transparency).toContain('--ap-frosted-bg: var(--ap-bg-canvas)');
    expect(transparency).toContain(":root:not([data-theme='light'])");

    const contrast = APPLE_CSS.match(/@media \(prefers-contrast: more\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(contrast).toContain('--ap-separator-opaque: var(--ap-label-secondary)');
    expect(contrast).toContain('--ap-elev-hairline: 0 0 0 1px var(--ap-label-secondary)');
  });

  it('eases the theme flip on the static shells only', () => {
    // A whole-canvas change in one frame reads as a flash; a transition on an interactive role
    // would make its own state change lag its press. So the rule exists, and the press roles
    // are absent from it.
    const rule = APPLE_CSS.match(/html, body, \.ap-nav[^{]*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(rule).toContain('transition: background-color var(--ap-duration-base) var(--ap-ease)');
    for (const interactive of ['.ap-btn', '.ap-chip', '.ap-press-row', '.ap-state-transition']) {
      expect(rule).not.toContain(interactive);
    }
  });

  it('never resets the meter transform, which carries the value rather than the transit', () => {
    const floor = APPLE_CSS.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
    const block = floor.find((b) => b.includes('.ap-meter-fill')) ?? '';
    expect(block).toContain('.ap-meter-fill { transition-duration: 0.01ms; }');
    expect(block).not.toMatch(/\.ap-meter-fill[^{]*\{[^}]*transform:\s*none/);
  });
});

describe('motion contract — every spring is critically damped', () => {
  /** Remotion compositions are content (the animation IS the product); the vendored nav-menu
   *  primitive has no consumers in this app, so its bounce reaches no user. */
  const SPRING_EXEMPT = ['frontend/src/remotion/', 'frontend/src/components/ui/motion-navigation-menu.tsx'];

  it('has no under-damped spring left outside those two places', () => {
    const violations = [];
    for (const file of walk(SRC)) {
      const rel = relative(ROOT, file);
      if (isTest(relative(SRC, file)) || SPRING_EXEMPT.some((p) => rel.startsWith(p))) continue;
      const body = stripComments(readFileSync(file, 'utf8'));
      for (const block of body.matchAll(/\{[^{}]*stiffness[^{}]*\}/g)) {
        const stiffness = block[0].match(/stiffness:\s*([\d.]+)/);
        const damping = block[0].match(/damping:\s*([\d.]+)/);
        if (!stiffness || !damping) continue;
        const mass = Number(block[0].match(/mass:\s*([\d.]+)/)?.[1] ?? 1);
        const zeta = Number(damping[1]) / (2 * Math.sqrt(Number(stiffness[1]) * mass));
        // Overshoot is reserved for a gesture that carried momentum; only the drag sheet may
        // release into one, and it uses the token, which is already critical.
        if (zeta < 1) violations.push(`${rel}: ζ=${zeta.toFixed(2)} (${block[0].replace(/\s+/g, ' ').trim()})`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('routes the app through the one published spring instead of a literal', () => {
    // The value is the design system's, not each call site's.
    expect(stripComments(readFileSync(join(SRC, 'components/apple/motion.ts'), 'utf8')))
      .toContain('export const AP_SPRING = { type: \'spring\', ...APPLE_MOTION.springStandard }');
    for (const rel of [
      'frontend/src/components/MenuDrawer.tsx',
      'frontend/src/components/ui/BentoGrid.tsx',
      'frontend/src/components/ui/FloatingControlBar.tsx',
      'frontend/src/components/ui/expand-map.tsx',
      'frontend/src/pages/Dashboard.tsx',
    ]) {
      expect(readFileSync(join(ROOT, rel), 'utf8')).toContain('AP_SPRING');
    }
  });

  it('gives the menu drawer an exit, mirrored on the path it entered by', () => {
    // Slide in over 220ms, vanish in one frame: the asymmetry a hand notices.
    const drawer = readFileSync(join(SRC, 'components/MenuDrawer.tsx'), 'utf8');
    expect(drawer).toContain('<AnimatePresence>');
    expect(drawer).toMatch(/exit=\{reduceMotion \? undefined : \{ x: '100%' \}\}/);
    expect(drawer).not.toContain('</>');
  });
});
