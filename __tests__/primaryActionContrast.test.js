/**
 * Contrast gate for the primary action and the text-grey floor.
 *
 * Why this exists: the primary action on a crimson ground shipped with a
 * near-black label (`text-carbon-black` on `bg-nasa-red`) at 2.14:1 — the single
 * worst contrast failure in the product, on the one control users are meant to
 * press. The token layer already had the right answer one level up
 * (`--primary-foreground` = white, 9.06:1), so the fix is mechanical, but nothing
 * stopped it coming back.
 *
 * The second half pins the token *semantics* rather than a specific class:
 * `--hn-hds-ink-muted` (carbon-50) is documented in index.css as "borders/icons
 * only, just under AA for text" and `--hn-hds-ink-soft` (carbon-60) as "smallest
 * text gray that clears AA". Those two comments are only true if the numbers
 * below hold, so the test computes them from the vendored HDS tokens instead of
 * trusting the prose.
 *
 * Session 1 of docs/plans/2026-09-30-frontend-refactor.md. See also
 * __tests__/staticShellContrast.test.js, which covers the prerendered shell.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const HDS = join(ROOT, 'frontend/src/styles/nasa-hds.css');

/** Every .tsx/.ts source file under frontend/src, recursively. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.tsx', '.ts'].includes(extname(full))) out.push(full);
  }
  return out;
}

/**
 * Every class list in the file, at the granularity a browser would apply them.
 *
 * Matching whole string literals is not enough: a template literal such as
 * `className={cond ? 'bg-nasa-red text-white' : 'bg-nasa-red text-carbon-black'}`
 * is one literal containing two *different* class lists, and pairing tokens
 * across it reports a violation that does not exist. So the attribute value is
 * split on interpolation and quoting boundaries first, and each branch is
 * checked on its own.
 */
function classLists(source) {
  const lists = [];
  const attr = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/g;
  let m;
  while ((m = attr.exec(source)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    // `${`, `}`, quotes and backticks separate one class list from the next;
    // whitespace stays inside a branch so co-occurrence survives.
    for (const branch of raw.split(/[${}'"`]+/)) {
      if (branch.trim() && /\b(?:text|bg|border)-/.test(branch)) lists.push(branch.trim());
    }
  }
  return lists;
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseHex(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function ratio(fg, bg) {
  const a = luminance(parseHex(fg));
  const b = luminance(parseHex(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const files = walk(SRC);
const sources = files.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

/** Grounds that make a near-black label unreadable. */
const RED_GROUND = /bg-nasa-red|bg-nasa-red-shade|bg-nasa-red-tint|bg-rose-600|bg-rose-700/;

describe('primary action contrast (Session 1)', () => {
  it('never pairs a near-black label with a crimson ground', () => {
    // The shipped failure: `bg-nasa-red ... text-carbon-black` at 2.14:1. The
    // token layer's `--primary-foreground` (white) is 9.06:1 on the same ground.
    const offenders = [];
    for (const { file, text } of sources) {
      for (const literal of classLists(text)) {
        if (/text-carbon-black/.test(literal) && RED_GROUND.test(literal)) {
          offenders.push(`${file.replace(`${ROOT}/`, '')}: ${literal.trim().slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the primary action on the token-defined foreground', () => {
    // Whatever the ground, `--primary-foreground` must clear AA on crimson — this
    // is the pairing the fix falls back to, so it has to stay true.
    const indexCss = readFileSync(join(ROOT, 'frontend/src/index.css'), 'utf8');
    const hdsCss = readFileSync(HDS, 'utf8');
    const decl = /--primary-foreground:\s*([^;]+);/.exec(indexCss);
    expect(decl).not.toBeNull();

    // Follow `var(--x)` indirection across both stylesheets until a hex appears.
    const resolveToken = (value, depth = 0) => {
      const direct = parseHex(value);
      if (direct) return value.trim();
      const ref = /var\((--[\w-]+)\)/.exec(value);
      if (!ref || depth > 4) return null;
      const name = ref[1];
      const found =
        new RegExp(`${name}:\\s*([^;]+);`).exec(indexCss) || new RegExp(`${name}:\\s*([^;]+);`).exec(hdsCss);
      return found ? resolveToken(found[1].trim(), depth + 1) : null;
    };

    const hex = resolveToken(decl[1]);
    expect(hex).not.toBeNull();
    const crimson = /--hn-brand-red:\s*(#[0-9a-f]{6})/.exec(indexCss);
    expect(crimson).not.toBeNull();
    expect(ratio(hex, crimson[1])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('text grey floor (Session 1)', () => {
  const hds = readFileSync(HDS, 'utf8');
  const token = (name) => {
    const m = new RegExp(`--hds-color-${name}:\\s*(#[0-9a-f]{6})`).exec(hds);
    if (!m) throw new Error(`HDS token --hds-color-${name} not found`);
    return m[1];
  };

  it('treats carbon-60 as the smallest text grey, per index.css', () => {
    // index.css documents carbon-50 as "borders/icons only, just under AA for
    // text" and carbon-60 as "smallest text gray that clears AA". Both claims
    // are arithmetic, so assert them rather than trusting the comment.
    expect(ratio(token('carbon-60'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('carbon-50'), '#ffffff')).toBeLessThan(4.5);
    expect(ratio(token('carbon-40'), '#ffffff')).toBeLessThan(4.5);
  });

  it('keeps the light greys correct on the dark surfaces they are used on', () => {
    // The reason Session 1 did NOT darken every `text-carbon-40`: on a dark
    // ground those greys are the right choice and darkening them is a
    // regression. carbon-60 on carbon-90 is 2.52:1; carbon-40 on carbon-80 is
    // 4.53:1. Pin both so a future blanket find-and-replace fails loudly.
    expect(ratio(token('carbon-60'), token('carbon-90'))).toBeLessThan(4.5);
    expect(ratio(token('carbon-40'), token('carbon-80'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('carbon-30'), token('carbon-90'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('off-system colour (Session 1)', () => {
  it('uses no retired hardcoded hex in a colour utility', () => {
    // `#ad6d04` (brown on crimson), `#ff0000` (stale pre-v2 brand red) and the
    // raw `#ea6f24` text/border uses were replaced by tokens in Session 1.
    const retired = ['#ad6d04', '#ff0000'];
    const offenders = [];
    for (const { file, text } of sources) {
      for (const literal of classLists(text)) {
        for (const hex of retired) {
          if (literal.includes(`[${hex}]`)) {
            offenders.push(`${file.replace(`${ROOT}/`, '')}: ${hex}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('routes the international-orange text and border uses through the amber ramp', () => {
    // `--color-amber-500` is aliased to `--hds-color-international-orange`
    // (#ea6f24), so `text-amber-500` is the same colour with a token behind it.
    const offenders = [];
    for (const { file, text } of sources) {
      for (const literal of classLists(text)) {
        if (/(?:text|border-l)-\[#ea6f24\]/.test(literal)) {
          offenders.push(`${file.replace(`${ROOT}/`, '')}: raw #ea6f24 in a colour utility`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
