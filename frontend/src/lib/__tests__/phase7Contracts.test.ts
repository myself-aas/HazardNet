/**
 * @jest-environment node
 *
 * Phase 7 source contracts. These pin the files that actually ship — not the
 * TypeScript twin of the service worker — so a restyle cannot silently restore
 * HTML caching, lock zoom, or drop the zoom/forecast e2e specs from Playwright.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Phase 7 source contracts', () => {
  it('does not lock pinch-zoom in the viewport meta', () => {
    const html = read('frontend/index.html');
    expect(html).toMatch(/name="viewport"/);
    expect(html).toMatch(/width=device-width/);
    expect(html).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(html).not.toMatch(/maximum-scale\s*=\s*1/i);
  });

  it('skips HTML and navigations in the shipped service worker', () => {
    const sw = read('frontend/public/serviceWorker.js');
    expect(sw).toContain("CACHE_NAME = 'hazardnet-offline-v3'");
    expect(sw).toMatch(/request\.mode === 'navigate'/);
    expect(sw).toMatch(/destination === 'document'/);
    expect(sw).toMatch(/text\/html/);
    expect(sw).toMatch(/if \(isDocument\) \{[\s\S]{0,120}event\.respondWith\(fetch\(request\)\)/);
  });

  it('keeps Playwright discovering forecast-ux and navigation-a11y', () => {
    const config = read('playwright.config.ts');
    expect(config).toMatch(/forecast-ux/);
    expect(config).toMatch(/navigation-a11y/);
  });

  it('collapses motion and blur in low-bandwidth mode', () => {
    const css = read('frontend/src/index.css');
    expect(css).toContain("html[data-low-bandwidth='true']");
    expect(css).toMatch(/backdrop-filter:\s*none/);
  });
});
