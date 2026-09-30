import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');

describe('Phase 6 surface contracts (§14.3 / §14.7 / §14.8)', () => {
  describe('front door', () => {
    const front = read('pages', 'FrontDoor.tsx');
    const strip = read('components', 'frontdoor', 'LiveStatusStrip.tsx');
    const run = read('components', 'frontdoor', 'RunVisual.tsx');

    it('does not use sub-12px type', () => {
      for (const source of [front, strip, run]) {
        expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/);
      }
    });

    it('uses the crimson shade on the primary /live CTA and 44px targets', () => {
      // --color-primary-strong and --color-nasa-red-shade are the same value
      // (#7B1D21). Session 3 renamed the class to the semantic token, so accept
      // either — what matters is that the CTA uses the shade, not the base red.
      expect(front).toMatch(/bg-(?:primary-strong|nasa-red-shade)/);
      expect(front).toMatch(/min-h-\[44px\]/);
    });

    it('keeps body copy at 16px', () => {
      expect(front).toMatch(/text-base leading-\[1\.62\]/);
    });
  });

  describe('auth', () => {
    const layout = read('components', 'auth', 'AuthLayout.tsx');
    const login = read('pages', 'LoginPage.tsx');
    const signup = read('pages', 'SignUpPage.tsx');

    it('drops looping accent shimmer and large radii on the card', () => {
      expect(layout).not.toMatch(/bg-gradient-to-r from-nasa-red/);
      expect(layout).not.toMatch(/rounded-3xl/);
      expect(layout).not.toMatch(/shadow-xl/);
      expect(layout).toMatch(/text-\[28px\]/);
    });

    it('uses the crimson shade + white on submit, not carbon-black on nasa-red', () => {
      // Same rename as above: --color-primary-strong === --color-nasa-red-shade.
      // The contrast contract (shade + white, never carbon-black on red) is what
      // is being pinned, not the class spelling.
      expect(login).toMatch(/bg-(?:primary-strong|nasa-red-shade)/);
      expect(login).not.toMatch(/text-carbon-black/);
      expect(signup).toMatch(/bg-(?:primary-strong|nasa-red-shade)/);
    });

    it('skips autoFocus unless the pointer is fine', () => {
      expect(login).toMatch(/autoFocus=\{finePointer\}/);
    });
  });

  describe('404', () => {
    const notFound = read('pages', 'NotFoundPage.tsx');

    it('offers 44px home and live links on 404', () => {
      expect(notFound).toMatch(/to="\/"/);
      expect(notFound).toMatch(/to="\/live"/);
      expect(notFound).toMatch(/min-h-\[44px\]/);
      expect(notFound).toMatch(/text-\[28px\]/);
    });
  });
});
