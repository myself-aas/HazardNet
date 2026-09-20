/**
 * @jest-environment node
 *
 * UX Phase 8 source contracts. Controlled rollout must not recover an old
 * visual by restoring raster upload, collapsing `/` into `/live`, putting
 * stock photos on the front door, or rewriting BrandPanel's pinned stats.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Phase 8 rollout contracts', () => {
  it('keeps the public front door separate from the live console', () => {
    const app = read('frontend/src/App.tsx');
    expect(app).toMatch(/path=\"\/\"\s+element=\{<FrontDoor/);
    expect(app).toMatch(/path=\"\/live\"\s+element=\{<Dashboard/);
  });

  it('keeps RunVisual as the front-door hero and refuses stock photo URLs', () => {
    const frontDoor = read('frontend/src/pages/FrontDoor.tsx');
    expect(frontDoor).toContain('RunVisual');
    expect(frontDoor).not.toMatch(/unsplash|pexels/i);
  });

  it('does not restore raster upload on the lookup page', () => {
    const upload = read('frontend/src/pages/UploadPage.tsx');
    expect(upload).toContain('StoredForecastPanel');
    expect(upload).not.toMatch(/type=["']file["']/);
    expect(upload).toMatch(/Load stored forecast|lookup\.submit/);
  });

  it('keeps the stored-forecast fetch helper', () => {
    const stored = read('frontend/src/lib/storedPrediction.ts');
    expect(stored).toContain('fetchStoredPrediction');
    expect(stored).not.toMatch(/simulateRaster|fake probabil/i);
  });

  it('keeps BrandPanel 64-district and <100ms stats', () => {
    const brand = read('frontend/src/components/auth/BrandPanel.tsx');
    expect(brand).toMatch(/\bvalue:\s*64\b/);
    expect(
      /'<100ms'/.test(brand) || (/prefix:\s*'<'/.test(brand) && /suffix:\s*'ms'/.test(brand)),
    ).toBe(true);
  });
});
