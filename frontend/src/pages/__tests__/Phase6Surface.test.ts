import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');

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
      // The legacy NASA alias for this role is gone; `ap-primary` is the only name.
      // (#7B1D21). Session 3 renamed the class to the semantic token, so accept
      // either — what matters is that the CTA uses the shade, not the base red.
      expect(front).toMatch(/bg-(?:primary-strong|ap-primary)/);
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
      expect(layout).not.toMatch(/bg-gradient-to-r from-ap-primary/);
      expect(layout).not.toMatch(/rounded-3xl/);
      expect(layout).not.toMatch(/shadow-xl/);
      // `text-ap-lead` is the named Apple style: the same 28px, sourced from the
      // system instead of an arbitrary value. See packages/design-system/src/apple.ts.
      expect(layout).toMatch(/text-ap-lead/);
    });

    it('uses the accent + white on submit, not carbon-black on the accent', () => {
      // Same rename as above: the role is `ap-primary` now.
      // The contrast contract (shade + white, never carbon-black on red) is what
      // is being pinned, not the class spelling.
      expect(login).toMatch(/bg-(?:primary-strong|ap-primary)/);
      expect(login).not.toMatch(/text-carbon-black/);
      expect(signup).toMatch(/bg-(?:primary-strong|ap-primary)/);
    });

    it('skips autoFocus unless the pointer is fine', () => {
      expect(login).toMatch(/autoFocus=\{finePointer\}/);
    });
  });

  describe('console tabs', () => {
    const dashboard = read('pages', 'Dashboard.tsx');

    // The 2026-10-26 critique found `role="tablist"` over five `role="tab"` buttons with no
    // panels to control and no arrow keys: an announced tab interface that switched nothing
    // for a screen reader and read as five plain buttons to a keyboard user. These pin the
    // WAI-ARIA tabs pattern the strip now implements, in source, because Dashboard needs a
    // Leaflet container to render.
    it('gives every tab a panel to control and a stable id', () => {
      expect(dashboard).toMatch(/role="tablist"/);
      expect(dashboard).toMatch(/role="tabpanel"/);
      expect(dashboard).toMatch(/id=\{`console-tab-\$\{tab\.id\}`\}/);
      expect(dashboard).toMatch(/aria-controls=\{`console-panel-\$\{tab\.id\}`\}/);
      expect(dashboard).toMatch(/id=\{`console-panel-\$\{activeView\}`\}/);
      expect(dashboard).toMatch(/aria-labelledby=\{`console-tab-\$\{activeView\}`\}/);
    });

    it('is a single tab stop with arrow, Home and End navigation', () => {
      expect(dashboard).toMatch(/tabIndex=\{activeView === tab\.id \? 0 : -1\}/);
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
        expect(dashboard).toContain(`event.key === '${key}'`);
      }
      // Moving focus must select the tab too (automatic activation), and the focused tab
      // has to be the one the reader can see in a strip that scrolls on a phone.
      expect(dashboard).toMatch(/setActiveView\(target\.id\);/);
      expect(dashboard).toMatch(/console-tab-\$\{target\.id\}`\)\?\.focus\(\)/);
    });

    it('does not make the panel a second tab stop', () => {
      // Every view owns focusable controls, so an APG-correct panel omits tabindex. A
      // `tabIndex={0}` here would put an empty stop between the strip and the view.
      const panel = dashboard.slice(dashboard.indexOf('role="tabpanel"'));
      expect(panel.slice(0, 400)).not.toMatch(/tabIndex=\{0\}/);
    });
  });

  describe('404', () => {
    const notFound = read('pages', 'NotFoundPage.tsx');

    it('offers home and live links on 404 through the system button', () => {
      expect(notFound).toMatch(/to="\/"/);
      expect(notFound).toMatch(/to="\/live"/);
      // `.ap-btn` carries the 44px touch minimum (`--ap-touch-min` under `pointer: coarse`),
      // the focus ring and the press scale; hand-rolled buttons had none of the three.
      expect(notFound).toMatch(/ap-btn ap-btn-secondary/);
      expect(notFound).toMatch(/text-ap-lead/);
    });
  });
});
