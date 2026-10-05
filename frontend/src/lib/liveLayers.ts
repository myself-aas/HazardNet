/**
 * Declarative live-map layer table (Phase A, 2026-10-05).
 *
 * Every row the layers panel renders is declared here so the panel, the
 * attribution registry and the contract test all read one table. Later
 * real-time phases (C, D, F, G) add rows to this file; the UI, freshness
 * chips and credits come for free. Rendering state itself stays in
 * LiveMapView — this file is the vocabulary, not the store.
 */

import type { MapLayerKey } from '../hooks/useLeafletMap';

export type LiveSectionId = 'ground' | 'overlays' | 'hazards';

export interface LiveLayerDef {
  id: string;
  section: LiveSectionId;
  name: string;
  /** MaterialIcon glyph for the row. */
  icon: string;
  kind: 'basemap' | 'toggle' | 'filter';
  /** Which map layer key this row selects (basemaps only). */
  mapLayerKey?: MapLayerKey;
  /** Credits that appear in the attribution lightbox while the row is active. */
  creditIds: string[];
  /**
   * Freshness vocabulary slot. Layers without a live source stay undefined and
   * render a plain On/Off chip; the amber NRT chip is reserved for rows whose
   * data is observed, not modelled, and arrives with a timestamp (Phases C+).
   */
  freshness?: { cadence: string };
  lowBandwidthDefaultOff?: boolean;
  /** Optional one-line qualifier under the row name (kept honest, kept short). */
  caption?: string;
}

export const LIVE_SECTIONS: { id: LiveSectionId; label: string }[] = [
  { id: 'ground', label: 'Ground' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'hazards', label: 'Hazards' },
];

export const LIVE_LAYERS: LiveLayerDef[] = [
  {
    id: 'basemap-topo',
    section: 'ground',
    name: 'Street & topo',
    icon: 'map',
    kind: 'basemap',
    mapLayerKey: 'topoMap',
    creditIds: ['osm', 'opentopomap'],
  },
  {
    id: 'basemap-satellite',
    section: 'ground',
    name: 'Satellite',
    icon: 'satellite_alt',
    kind: 'basemap',
    mapLayerKey: 'esriSatellite',
    creditIds: ['esri'],
  },
  {
    id: 'overlay-rivers',
    section: 'overlays',
    name: 'River basins',
    icon: 'water',
    kind: 'toggle',
    creditIds: ['forecasts'],
  },
  {
    id: 'overlay-heatmap',
    section: 'overlays',
    name: 'Hazard heatmap',
    icon: 'local_fire_department',
    kind: 'toggle',
    creditIds: ['forecasts'],
  },
  {
    id: 'overlay-cluster',
    section: 'overlays',
    name: 'Cluster district markers',
    icon: 'hub',
    kind: 'toggle',
    creditIds: ['forecasts'],
  },
  {
    id: 'overlay-contrast',
    section: 'overlays',
    name: 'High-contrast basemap',
    icon: 'contrast',
    kind: 'toggle',
    creditIds: [],
  },
  {
    id: 'overlay-truecolor',
    section: 'overlays',
    name: 'True-colour satellite',
    icon: 'public',
    kind: 'toggle',
    creditIds: ['gibs'],
    freshness: { cadence: '~4 h' },
    lowBandwidthDefaultOff: true,
    caption: 'Heavy imagery · newest available, never live',
  },
];

/** Hazard filter chips reuse the HAZARD_LAYERS palette via the panel. */
export const HAZARDS_SECTION_ID: LiveSectionId = 'hazards';
