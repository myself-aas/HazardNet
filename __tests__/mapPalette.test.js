/**
 * The live map's colours live in one keyed palette (V-P1-1 in
 * docs/audits/2026-10-03-landing-live-hero-audit.md).
 *
 * The map stage used to hold 79 hex literals inline in a 2,400-line component: dark mode,
 * high-contrast mode, the low-bandwidth collapse and the native theme all had to be re-derived
 * inside that file, while the components around it followed a token change for free.
 *
 * This suite keeps that from coming back:
 *   - chrome and text must resolve to the Apple design system's own tokens (not to a retyped
 *     value), so the map obeys a token change like every other surface;
 *   - the data encodings are pinned by value, so changing one is a conscious edit to this list;
 *   - the component may not contain a single hex literal.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPLE_COLORS, APPLE_NEUTRAL, APPLE_SEVERITY } from '@hazardnet/design-system';
import {
  MAP_CHROME,
  MAP_HEAT_RAMP,
  MAP_INTERACTIVE,
  MAP_RAIN_RAMP,
  MAP_RISK_RAMP,
} from '@hazardnet/design-system';
import * as designSystem from '@hazardnet/design-system';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const liveMap = readFileSync(join(ROOT, 'frontend/src/components/LiveMapView.tsx'), 'utf8');



describe('live-map palette', () => {
  test('chrome and text are the Apple tokens, not copies of them', () => {
    expect(MAP_CHROME.surface).toBe(APPLE_COLORS.canvas);
    expect(MAP_CHROME.muted).toBe(APPLE_NEUTRAL['50']);
    expect(MAP_CHROME.inkSoft).toBe(APPLE_NEUTRAL['60']);
    expect(MAP_CHROME.ink).toBe(APPLE_NEUTRAL['70']);
    expect(MAP_CHROME.inkStrong).toBe(APPLE_NEUTRAL['90']);
    // A popup over the map is the same dark surface as a dark tile anywhere else.
    expect(MAP_CHROME.panelInk).toBe(APPLE_COLORS.surfaceTile1);
  });

  test('the map uses the one accent, on both of its grounds', () => {
    // Action Blue on the light basemap; Sky Link Blue on dark popups and satellite
    // imagery, where Action Blue measures 2.68:1 and is unreadable.
    expect(MAP_INTERACTIVE.blue).toBe(APPLE_COLORS.primary);
    expect(MAP_INTERACTIVE.blueBright).toBe(APPLE_COLORS.primaryOnDark);
  });

  test('the risk ramp reads from the severity layer, so a district agrees with its badge', () => {
    expect(MAP_RISK_RAMP.severe).toBe(APPLE_SEVERITY.veryHigh.solid);
    expect(MAP_RISK_RAMP).toEqual({ severe: '#c01f1f' });
  });

  test('the data encodings are pinned by value', () => {
    // The heat gradient is the severity scale, so the map legend and the alert list
    // cannot drift apart.
    expect(MAP_HEAT_RAMP).toEqual({
      calm: MAP_INTERACTIVE.blue,
      moderate: APPLE_SEVERITY.moderate.solid,
      heavy: APPLE_SEVERITY.veryHigh.solid,
    });
    // The IMERG rain ramp documents GIBS' own colouring (greens to reds for rain, cyan to
    // purple for snow as liquid equivalent). These are the only values in the palette that
    // are NOT Apple tokens, and deliberately so: the tiles are pre-rendered by NASA GIBS, so
    // re-tinting the legend would make it lie about the imagery underneath it.
    expect(MAP_RAIN_RAMP).toEqual({
      trace: '#2f9e44',
      light: '#82c91e',
      moderate: '#ffd43b',
      heavy: '#ff922b',
      intense: '#f03e3e',
      extreme: '#8f1616',
      snowLight: '#22b8cf',
      snowModerate: '#3b5bdb',
      snowHeavy: '#7048e8',
    });
  });

  test('the fake-radar palette groups are gone', () => {
    // MAP_SENSOR_SITES existed only for the invented "Doppler" storm cells and
    // must not come back: a data palette must not grow colours nothing draws.
    expect(designSystem.MAP_SENSOR_SITES).toBeUndefined();
    expect(designSystem.MAP_RADAR_BANDS).toBeUndefined();
  });

  test('the map component carries no hex literal of its own', () => {
    // Every colour the map paints is a palette key. If a new one is needed, add it above.
    const literals = liveMap.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals).toEqual([]);
  });

  test('and every palette entry is actually used by the map', () => {
    // No two roles inside a group may share a value by accident (across groups a shared value is
    // meaningful: the calm radar band really is the map's interactive blue).
    for (const group of [MAP_CHROME, MAP_INTERACTIVE, MAP_RISK_RAMP, MAP_HEAT_RAMP]) {
      const values = Object.values(group);
      expect(new Set(values).size).toBe(values.length);
    }
    // Every key is referenced by name, so a renamed or dropped role fails here rather than
    // silently leaving a colour painted straight from the palette object.
    for (const [group, keys] of Object.entries({
      MAP_CHROME,
      MAP_INTERACTIVE,
      MAP_RISK_RAMP,
      MAP_HEAT_RAMP,
    })) {
      for (const key of Object.keys(keys)) {
        expect(liveMap).toContain(`${group}.${key}`);
      }
    }
  });
});
