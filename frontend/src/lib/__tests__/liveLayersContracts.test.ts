/**
 * Phase A contracts for the live-map layer table (2026-10-05).
 *
 * The layers panel, the attribution lightbox and the contract test all read one
 * table. These pins keep that table honest: every row declares an icon and
 * resolvable credits, the ground section is exactly two basemaps with distinct
 * credit sets, and the registry never renders a blank licence.
 */
import { LIVE_LAYERS, LIVE_SECTIONS } from '../liveLayers';
import { DATA_CREDITS, activeCredits } from '../dataCredits';

describe('live-map layer table', () => {
  it('keeps the section order ground, overlays, hazards', () => {
    expect(LIVE_SECTIONS.map((s) => s.id)).toEqual(['ground', 'overlays', 'hazards']);
  });

  it('gives every row an icon and a section that exists', () => {
    const sectionIds = LIVE_SECTIONS.map((s) => s.id);
    for (const layer of LIVE_LAYERS) {
      expect(layer.icon.length).toBeGreaterThan(0);
      expect(sectionIds).toContain(layer.section);
    }
  });

  it('resolves every credit id a row names', () => {
    for (const layer of LIVE_LAYERS) {
      for (const id of layer.creditIds) {
        expect(DATA_CREDITS[id]).toBeDefined();
      }
    }
  });

  it('ships exactly two basemaps with distinct credit sets', () => {
    const basemaps = LIVE_LAYERS.filter((l) => l.kind === 'basemap');
    expect(basemaps).toHaveLength(2);
    expect(basemaps[0].mapLayerKey).toBe('topoMap');
    expect(basemaps[1].mapLayerKey).toBe('esriSatellite');
    expect(basemaps[0].creditIds).not.toEqual(basemaps[1].creditIds);
  });

  it('names the licences a basemap switch must display', () => {
    const topo = activeCredits(['osm', 'opentopomap']);
    expect(topo.map((c) => c.label).join(' ')).toContain('OpenStreetMap');
    expect(topo.map((c) => c.label).join(' ')).toContain('OpenTopoMap');
    const esri = activeCredits(['esri']);
    expect(esri[0].label).toContain('Esri');
    expect(esri[0].label).toContain('Maxar');
  });

  it('never renders a credit without licence terms', () => {
    for (const credit of Object.values(DATA_CREDITS)) {
      expect(credit.href.length).toBeGreaterThan(0);
      expect(credit.licence.length).toBeGreaterThan(0);
    }
    // Unknown ids drop out instead of rendering blank rows.
    expect(activeCredits(['osm', 'no-such-source'])).toHaveLength(1);
  });

  it('declares the true-colour satellite row with NRT freshness and GIBS credit', () => {
    const row = LIVE_LAYERS.find((l) => l.id === 'overlay-truecolor');
    expect(row).toBeDefined();
    expect(row?.section).toBe('overlays');
    expect(row?.kind).toBe('toggle');
    expect(row?.freshness?.cadence).toMatch(/4 h/);
    expect(row?.creditIds).toEqual(['gibs']);
    expect(row?.lowBandwidthDefaultOff).toBe(true);
    expect(row?.caption?.length ?? 0).toBeGreaterThan(0);
  });

  it('registers the NASA GIBS acknowledgement as the imagery credit', () => {
    const gibs = DATA_CREDITS.gibs;
    expect(gibs).toBeDefined();
    expect(gibs.label).toContain('Global Imagery Browse Services');
    expect(gibs.label).toContain('ESDIS');
    expect(gibs.href).toContain('gibs.earthdata.nasa.gov');
    expect(activeCredits(['gibs'])).toHaveLength(1);
  });

  it('declares the wind row with both ladder credits and a forecast caption', () => {
    const row = LIVE_LAYERS.find((l) => l.id === 'overlay-wind');
    expect(row).toBeDefined();
    expect(row?.section).toBe('overlays');
    expect(row?.kind).toBe('toggle');
    expect(row?.icon).toBe('air');
    expect(row?.freshness?.cadence).toMatch(/6 h/);
    // Credits follow the ladder: whichever model answers registers its credit.
    expect(row?.creditIds).toEqual(['windGfs', 'windEcmwf']);
    expect(row?.lowBandwidthDefaultOff).toBe(true);
    // A forecast is labelled a forecast.
    expect(row?.caption).toMatch(/forecast/i);
  });

  it('registers both wind ladder credits with their licences', () => {
    const gfs = DATA_CREDITS.windGfs;
    const ecmwf = DATA_CREDITS.windEcmwf;
    expect(gfs).toBeDefined();
    expect(gfs.label).toContain('NOAA');
    expect(gfs.label).toContain('Global Forecast System');
    expect(ecmwf).toBeDefined();
    expect(ecmwf.label).toContain('ECMWF');
    expect(ecmwf.licence).toContain('CC BY 4.0');
    expect(activeCredits(['windGfs', 'windEcmwf'])).toHaveLength(2);
  });

  it('declares the IMERG rain-rate row with the NRT chip and an honest caption', () => {
    const row = LIVE_LAYERS.find((l) => l.id === 'overlay-rain');
    expect(row).toBeDefined();
    expect(row?.section).toBe('overlays');
    expect(row?.kind).toBe('toggle');
    expect(row?.icon).toBe('water_drop');
    expect(row?.freshness?.cadence).toMatch(/30 min/);
    expect(row?.creditIds).toEqual(['gibs']);
    expect(row?.lowBandwidthDefaultOff).toBe(true);
    // Meaning-discipline: the caption states what the product is not.
    expect(row?.caption).toMatch(/not gauge data/);
  });
});
