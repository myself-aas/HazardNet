/**
 * One design system means one source of colour.
 *
 * A component may not invent a hex. Every colour it paints has to come from
 * `apple.css` (as a token or a literal the system publishes) or from the two
 * declared data-encoding layers inside `apple.ts`. This test walks the whole
 * frontend source tree and fails on anything else.
 *
 * The migration this guards finished at 435 off-system literals down to the
 * allowlist below. The interesting thing it caught on the way: six components
 * each kept a private hazard palette built from Tailwind defaults, and they
 * disagreed with one another — "Tropical Cyclone" was purple, red and rose
 * depending on which file you were reading.
 *
 * EXEMPTIONS are narrow and each has a reason:
 *   · third-party brand marks — a Google "G" is the wrong shade of wrong if it
 *     is not Google's blue, and the same goes for Slack, Discord and GitHub
 *   · cinematic media — hero video, the Remotion compositions and the WebGL
 *     globe are *content*, the same category as a photograph. Apple's system
 *     governs the chrome around media, not the pixels inside it.
 *   · the generated brand asset, which is produced by a script, not authored
 *
 * To add a file here you need a reason of that kind. "It was easier" is not
 * one: add the colour to the system instead.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'frontend/src/styles/apple.css'), 'utf8');

/** Files allowed to carry colour the design system does not publish. */
const EXEMPT = [
  // Third-party brand identity.
  'frontend/src/components/ProviderGlyph.tsx',
  'frontend/src/lib/oauthProviders.ts',
  'frontend/src/lib/connectors.ts',
  // Cinematic media — content, not chrome. The hero background left this list on 2026-10-06:
  // its colour is the grade in `lib/heroGrade.ts`, a token it reads like any other component.
  'frontend/src/lib/heroMedia.ts',
  'frontend/src/lib/remotionTheme.ts',
  'frontend/src/components/ui/3d-globe.tsx',
  'frontend/src/remotion/compositions/HeroComposition.tsx',
  'frontend/src/remotion/compositions/HazardAlertStory.tsx',
  'frontend/src/remotion/compositions/HazardNetBrandComposition.tsx',
  // Generated, not authored.
  'frontend/src/design-system/brand/infinity.generated.ts',
];

/** Every colour the system publishes, as lowercase hex. */
function publishedColours() {
  const out = new Set();
  for (const m of CSS.matchAll(/#[0-9a-f]{3,8}\b/gi)) out.add(m[0].toLowerCase());
  // Expand 3-digit shorthand so `#fff` and `#ffffff` both count.
  for (const h of [...out]) {
    if (h.length === 4) out.add(`#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`);
  }
  return out;
}

function sourceFiles() {
  return execSync(
    "find frontend/src \\( -name '*.ts' -o -name '*.tsx' \\) ! -path '*__tests__*'",
    { cwd: ROOT, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
}

describe('colour comes from the design system', () => {
  const known = publishedColours();
  const files = sourceFiles();

  it('finds a source tree to check', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(known.size).toBeGreaterThan(60);
  });

  it('has no component inventing a colour of its own', () => {
    const offenders = [];
    for (const file of files) {
      if (EXEMPT.includes(file)) continue;
      const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/#[0-9a-f]{6}\b/gi)) {
          if (!known.has(m[0].toLowerCase())) {
            offenders.push(`${file}:${i + 1} ${m[0]} — ${line.trim().slice(0, 60)}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the exemption list honest — every entry still exists and still needs it', () => {
    for (const file of EXEMPT) {
      expect(`${file}:${existsSync(join(ROOT, file))}`).toBe(`${file}:true`);
      const src = readFileSync(join(ROOT, file), 'utf8');
      const offSystem = [...src.matchAll(/#[0-9a-f]{6}\b/gi)].some(
        (m) => !known.has(m[0].toLowerCase()),
      );
      // If a file no longer carries off-system colour, it should leave the list
      // rather than sit here granting itself permission it does not use.
      expect(`${file}:${offSystem}`).toBe(`${file}:true`);
    }
  });

  it('no longer ships the palettes of the four superseded systems', () => {
    // A spot-check of the most distinctive values from each dead system: the
    // NASA carbon ramp, and the Tailwind defaults that stood in for severity.
    const dead = [
      '#17171b', '#77777a', '#d1d1d1', '#e3e3e3', '#444447', '#959599', '#b9b9bb',
      '#f59e0b', '#dc2626', '#16a34a', '#ef4444', '#10b981', '#d97706', '#f43f5e',
      '#3b82f6', '#2563eb', '#38bdf8', '#8b5cf6', '#7c3aed',
    ];
    const found = [];
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), 'utf8').toLowerCase();
      for (const hex of dead) if (src.includes(hex)) found.push(`${file} ${hex}`);
    }
    expect(found).toEqual([]);
  });

  it('routes every hazard colour through the one palette', () => {
    // No file may declare its own hazard→colour map again.
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      if (/'(?:Tropical Cyclone|Monsoon Flood|Flash Flood)':\s*'#/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
