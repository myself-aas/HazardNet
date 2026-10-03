/**
 * The live map's colours live in one keyed palette (V-P1-1 in
 * docs/audits/2026-10-03-landing-live-hero-audit.md).
 *
 * The map stage used to hold 79 hex literals inline in a 2,400-line component: dark mode,
 * high-contrast mode, the low-bandwidth collapse and the native theme all had to be re-derived
 * inside that file, while the components around it followed a token change for free.
 *
 * This suite keeps that from coming back:
 *   - chrome and text must resolve to the design system's own tokens (not to a retyped value);
 *   - the data encodings are pinned by value, so changing one is a conscious edit to this list;
 *   - the component may not contain a single hex literal.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HDS_NASA_TOKENS } from '@hazardnet/design-system';
import {
  MAP_CHROME,
  MAP_INTERACTIVE,
  MAP_RADAR_BANDS,
  MAP_RISK_RAMP,
  MAP_SENSOR_SITES,
} from '@hazardnet/design-system';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const liveMap = readFileSync(join(ROOT, 'frontend/src/components/LiveMapView.tsx'), 'utf8');

const colors = HDS_NASA_TOKENS.colors;

describe('live-map palette', () => {
  test('chrome and text are the tokens, not copies of them', () => {
    expect(MAP_CHROME.surface).toBe(colors.spacesuitWhite);
    expect(MAP_CHROME.surfaceSunken).toBe(colors.carbon05);
    expect(MAP_CHROME.rail).toBe(colors.carbon10);
    expect(MAP_CHROME.hairline).toBe(colors.carbon20);
    expect(MAP_CHROME.neutral).toBe(colors.carbon30);
    expect(MAP_CHROME.muted).toBe(colors.carbon50);
    expect(MAP_CHROME.inkSoft).toBe(colors.carbon60);
    expect(MAP_CHROME.ink).toBe(colors.carbon70);
    expect(MAP_CHROME.inkStrong).toBe(colors.carbon90);
  });

  test('the risk ramp starts from NASA red and keeps its shipped steps', () => {
    expect(MAP_RISK_RAMP.severe).toBe(colors.nasaRed);
    expect(MAP_RISK_RAMP).toEqual({
      severe: '#f64137',
      high: '#e11d48',
      moderate: '#d97706',
      low: '#16a34a',
      crop: '#059669',
    });
  });

  test('the data encodings are pinned by value', () => {
    expect(MAP_INTERACTIVE).toEqual({ blue: '#0284c7', blueBright: '#38bdf8', blueTint: '#e0f2fe' });
    expect(MAP_SENSOR_SITES).toEqual({
      sylhet: '#dc2626',
      teesta: '#ea580c',
      bayOfBengal: '#7c3aed',
    });
    expect(MAP_RADAR_BANDS).toEqual({
      calm: MAP_INTERACTIVE.blue,
      moderate: '#f59e0b',
      heavy: '#ef4444',
    });
  });

  test('the map component carries no hex literal of its own', () => {
    // Every colour the map paints is a palette key. If a new one is needed, add it above.
    const literals = liveMap.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals).toEqual([]);
  });

  test('and every palette entry is actually used by the map', () => {
    // No two roles inside a group may share a value by accident (across groups a shared value is
    // meaningful: the calm radar band really is the map's interactive blue).
    for (const group of [MAP_CHROME, MAP_INTERACTIVE, MAP_RISK_RAMP, MAP_SENSOR_SITES, MAP_RADAR_BANDS]) {
      const values = Object.values(group);
      expect(new Set(values).size).toBe(values.length);
    }
    // Every key is referenced by name, so a renamed or dropped role fails here rather than
    // silently leaving a colour painted straight from the palette object.
    for (const [group, keys] of Object.entries({
      MAP_CHROME,
      MAP_INTERACTIVE,
      MAP_RISK_RAMP,
      MAP_SENSOR_SITES,
      MAP_RADAR_BANDS,
    })) {
      for (const key of Object.keys(keys)) {
        expect(liveMap).toContain(`${group}.${key}`);
      }
    }
  });
});
