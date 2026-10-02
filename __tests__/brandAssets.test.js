/**
 * @jest-environment node
 *
 * The HazardNet brand assets: the infinity mark, its mono and lockup variants, the animated loader and the PWA icons.
 *
 * All of them are GENERATED (scripts/build-brand-assets.mjs ← scripts/lib/infinity-geometry.mjs), so the useful tests
 * are the ones that stop them drifting or breaking a promise the design makes:
 *   · the committed files match the generator (`--check`);
 *   · no brand file carries text of its own (the wordmark is outlined) — no <text>, <title>, font reference;
 *   · the gradient holds ≥ 3:1 on white AND on the dark ground, so ONE mark file serves every surface;
 *   · only the product's own blues (plus white and ink) are used — the retired crimson/near-black mark does not return;
 *   · the loader respects reduced motion; the files stay tiny; the app icons are the right size.
 * (infinity-geometry.mjs names this file as the place those claims are verified.)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GEOMETRY, GRADIENT, LOOP } from '../scripts/lib/infinity-geometry.mjs';

const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'frontend', 'public');
const read = (name) => readFileSync(join(PUBLIC, name), 'utf8');

const SVGS = [
  'hazardnet-mark.svg',
  'hazardnet-mark-mono.svg',
  'hazardnet-loader.svg',
  'hazardnet-logo.svg',
  'hazardnet-logo-primary.svg',
  'hazardnet-logo-light.svg',
];

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('brand assets are generated, and stay generated', () => {
  it('match the generator (the same check CI can run: `node scripts/build-brand-assets.mjs --check`)', () => {
    const out = execFileSync('node', ['scripts/build-brand-assets.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/all brand assets match the geometry/);
  });
});

describe('the files show no words of their own', () => {
  it.each(SVGS)('%s has no <text>, <title>, <desc>, foreignObject or font reference', (name) => {
    expect(read(name)).not.toMatch(/<(text|tspan|title|desc|foreignObject)\b|font-family|@font-face/i);
  });

  it('keeps every one decorative to assistive tech (the visible label next to it is the name)', () => {
    for (const name of SVGS) expect(read(name)).toContain('aria-hidden="true"');
  });
});

describe('colour', () => {
  it('one gradient serves every surface: each stop holds ≥ 3:1 on white and on the dark ground (ink-950)', () => {
    for (const [, hex] of GRADIENT) {
      expect(ratio(hex, '#FFFFFF')).toBeGreaterThanOrEqual(3);
      expect(ratio(hex, '#0A141C')).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses only the product blues, white and ink — the retired crimson mark does not come back', () => {
    const allowed = new Set([...GRADIENT.map(([, hex]) => hex), '#FFFFFF', '#0F1B26'].map((h) => h.toUpperCase()));
    for (const name of SVGS) {
      const colours = [...read(name).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase());
      const stray = colours.filter((c) => !allowed.has(c));
      expect(stray).toEqual([]);
    }
    for (const name of SVGS) expect(read(name)).not.toMatch(/#970002|#7B1D21|#0D0D0D|#414C48|#404A47/i);
  });

  it('the mono mark is currentColor, so print, emboss and one-colour uses follow the surrounding text', () => {
    expect(read('hazardnet-mark-mono.svg')).toContain('stroke="currentColor"');
    expect(read('hazardnet-mark-mono.svg')).not.toMatch(/linearGradient/);
  });
});

describe('weight and motion', () => {
  const size = (name) => statSync(join(PUBLIC, name)).size;

  it('keeps every file tiny (the traced mark it replaced was 38 KB, three times over)', () => {
    expect(size('hazardnet-mark.svg')).toBeLessThan(1500);
    expect(size('hazardnet-mark-mono.svg')).toBeLessThan(1200);
    expect(size('hazardnet-loader.svg')).toBeLessThan(6000);
    for (const name of ['hazardnet-logo.svg', 'hazardnet-logo-primary.svg', 'hazardnet-logo-light.svg']) {
      expect(size(name)).toBeLessThan(8000); // includes the outlined wordmark
    }
  });

  it('the loader honours prefers-reduced-motion with a still, lit composition', () => {
    const svg = read('hazardnet-loader.svg');
    expect(svg).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none/);
    // animates only dash offsets, transforms and opacity — nothing that triggers layout
    const keyframes = [...svg.matchAll(/@keyframes [\w-]+\{([\s\S]*?)\}\}?/g)].map((m) => m[1]).join(' ');
    for (const property of keyframes.matchAll(/([a-z-]+)\s*:/g)) {
      expect(['stroke-dashoffset', 'transform', 'opacity']).toContain(property[1]);
    }
  });

  it('keeps the loader to the documented stack: four dash layers a comet, two comets, a 2.6 s lap', () => {
    expect(LOOP.LAYERS).toHaveLength(4);
    expect(LOOP.LAP).toBe(2.6);
    expect((read('hazardnet-loader.svg').match(/class="c"/g) || []).length).toBe(2 * LOOP.LAYERS.length);
  });

  it('generates the same geometry for React that the SVG files are drawn from', () => {
    const ts = readFileSync(join(ROOT, 'frontend', 'src', 'design-system', 'brand', 'infinity.generated.ts'), 'utf8');
    expect(ts).toContain(`full: '${GEOMETRY.full}'`);
    expect(ts).toContain('layers:');
    expect(ts).toContain('fraction:');
  });
});

describe('app icons', () => {
  /** PNG IHDR: width and height are the two big-endian uint32 at bytes 16 and 20. */
  const dimensions = (name) => {
    const buf = readFileSync(join(PUBLIC, name));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  };

  it('ship at the sizes the manifest and iOS expect', () => {
    expect(dimensions('apple-touch-icon.png')).toEqual([180, 180]);
    expect(dimensions('pwa-192x192.png')).toEqual([192, 192]);
    expect(dimensions('pwa-512x512.png')).toEqual([512, 512]);
    expect(dimensions('pwa-maskable-512x512.png')).toEqual([512, 512]);
  });

  it('are declared by the web manifest, which points at the new mark', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const sources = manifest.icons.map((icon) => icon.src);
    expect(sources).toEqual(expect.arrayContaining(['/hazardnet-mark.svg', '/pwa-192x192.png', '/pwa-512x512.png', '/pwa-maskable-512x512.png']));
  });
});
