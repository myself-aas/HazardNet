/**
 * The basemap attribution, decoded once.
 *
 * `MAP_LAYERS.attribution` is written in HTML entities because Leaflet injects it as HTML into its
 * own corner control. The map's footer prints the same credit as text, and until 2026-10-06 it did
 * the decoding in JSX with two RegExp literals — allocated and run on every render of the map, for
 * two strings that cannot change. The decode now lives beside the data and runs at module load.
 *
 * Two things are pinned here: the decoding is correct (the ODbL credit must survive, characters and
 * all), and the render path no longer rebuilds it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ATTRIBUTION_TEXT,
  DEFAULT_ATTRIBUTION_TEXT,
  MAP_LAYERS,
  attributionFor,
  effectiveMapLayer,
} from '../useLeafletMap';

describe('basemap attribution', () => {
  it('decodes the entities for every layer in the table', () => {
    for (const key of Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>) {
      const text = attributionFor(key);
      // No entity survives into the text surface — the footer would print it literally.
      expect(text).not.toMatch(/&(copy|mdash|amp|quot|#\d+);/);
      // …and what was an entity is now the character it stands for.
      const raw = MAP_LAYERS[key].attribution ?? '';
      expect(text.includes('\u00A9')).toBe(raw.includes('&copy;'));
      expect(text.includes('\u2014')).toBe(raw.includes('&mdash;'));
      expect(text).toBe(ATTRIBUTION_TEXT[key]);
    }
  });

  it('keeps the OpenStreetMap and OpenTopoMap credits the licences require', () => {
    const topo = attributionFor('topoMap');
    expect(topo).toContain('OpenStreetMap contributors');
    expect(topo).toContain('OpenTopoMap');
    // The disclaimer is part of the credit on this map; dropping it silently would be the failure.
    expect(topo).toContain('do not necessarily depict accepted national boundaries');
    expect(attributionFor('esriSatellite')).toContain('Esri');
  });

  it('falls back to the OSM credit for a layer with no attribution of its own', () => {
    // The table is keyed by the layer union, so the fallback is only reachable through a value the
    // type system does not predict — which is exactly when a fallback matters.
    const rogue = 'noSuchLayer' as keyof typeof MAP_LAYERS;
    expect(attributionFor(rogue)).toBe(DEFAULT_ATTRIBUTION_TEXT);
    expect(DEFAULT_ATTRIBUTION_TEXT).toContain('OpenStreetMap contributors');
    expect(DEFAULT_ATTRIBUTION_TEXT).not.toMatch(/&/);
  });

  it('builds the text table once, not per call', () => {
    // The table is a module-level object, so every call returns the same stored value rather than
    // re-running the two `replace` passes. `Object.is` on the strings cannot tell those apart, so
    // this asserts the shape that can: one table, one entry per layer, and no extra keys.
    expect(Object.keys(ATTRIBUTION_TEXT).sort()).toEqual(Object.keys(MAP_LAYERS).sort());
    for (const key of Object.keys(MAP_LAYERS)) {
      expect(String(ATTRIBUTION_TEXT[key as keyof typeof ATTRIBUTION_TEXT]).length).toBeGreaterThan(
        20,
      );
    }
  });

  it('is the layer actually requested, not a second lookup', () => {
    // `effectiveMapLayer` is the one place a requested layer is decided, so the credit follows it.
    for (const key of Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>) {
      expect(attributionFor(effectiveMapLayer(key, false))).toBe(attributionFor(key));
    }
  });

  it('is not decoded in the map’s render path', () => {
    // The guard for the hoist: `LiveMapView` renders thousands of markers and must not allocate
    // RegExp literals or decode entities while doing it. Comments may name the old code.
    const source = readFileSync(
      join(process.cwd(), 'frontend/src/components/LiveMapView.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).toContain('attributionFor(activeLayer)');
    expect(source).not.toMatch(/attribution\?\.replace/);
    expect(source).not.toMatch(/\/(&copy|&mdash);\//);
  });
});
