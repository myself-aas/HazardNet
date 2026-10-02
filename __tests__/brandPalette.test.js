/**
 * Page-level color conformance ratchet.
 *
 * The authored pages should not invent Tailwind families or embed raw colors. The approved
 * values live in the global CSS/custom properties; semantic hazard groups use
 * frontend/src/lib/hazardPalette.ts. The scanner can be widened to all components with
 * `node scripts/check-brand-palette.mjs --scope all --report`, but this CI assertion is
 * intentionally scoped to route pages — the requested surface.
 */

import { scanTree } from '../scripts/check-brand-palette.mjs';

describe('brand palette — page route source', () => {
  it('contains no off-palette utilities or raw color literals', () => {
    expect(scanTree({ scope: 'pages' })).toEqual([]);
  });
});
