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

    it('uses nasa-red-shade on the primary /live CTA and 44px targets', () => {
      expect(front).toMatch(/bg-nasa-red-shade/);
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

    it('uses nasa-red-shade + white on submit, not carbon-black on nasa-red', () => {
      expect(login).toMatch(/bg-nasa-red-shade/);
      expect(login).not.toMatch(/text-carbon-black/);
      expect(signup).toMatch(/bg-nasa-red-shade/);
    });

    it('skips autoFocus unless the pointer is fine', () => {
      expect(login).toMatch(/autoFocus=\{finePointer\}/);
    });
  });

  describe('archive and 404', () => {
    const archive = read('pages', 'HazardArchivePage.tsx');
    const notFound = read('pages', 'NotFoundPage.tsx');

    it('drops sky wells and 3xl cards on the archive', () => {
      expect(archive).not.toMatch(/bg-sky-50/);
      expect(archive).not.toMatch(/rounded-3xl/);
      expect(archive).not.toMatch(/text-\[10px\]/);
    });

    it('offers 44px home and live links on 404', () => {
      expect(notFound).toMatch(/to="\/"/);
      expect(notFound).toMatch(/to="\/live"/);
      expect(notFound).toMatch(/min-h-\[44px\]/);
      expect(notFound).toMatch(/text-\[28px\]/);
    });
  });
});
