/**
 * Live wind field client (Phase E, 2026-10-05).
 *
 * The wind field arrives as a small committed artifact, `frontend/public/data/
 * live/wind.json`, produced every six hours by the Live Wind Update workflow
 * (decision point E.1: the GFS/ECMWF GRIB decode runs on GitHub's runners with
 * real tooling, not in a serverless function — the plan's sanctioned
 * "pre-decode in a scheduled Action" path, GEV's bundled-artifact idea applied
 * to derived data). The ladder the workflow climbs — GFS → ECMWF → keep the
 * previous artifact — shows up here as fresh / stale / unavailable, and the
 * chip grammar says which: a forecast is labelled a forecast, with its issue
 * and valid times advertised, never implied to be an observation.
 *
 * Honesty rules inherited from `lib/freshness.ts` (the Phase 7 artifact
 * client): an unrecognised schema is not rendered, and a missing artifact is
 * UNAVAILABLE, never an invented breeze.
 */

export const WIND_ARTIFACT_URL = '/data/live/wind.json';
export const WIND_SCHEMA = 'hazardnet-wind/v1';

/** The workflow runs every 6 h; one missed run stays fresh, two do not. */
export const WIND_FRESH_SLO_HOURS = 9;

export type WindModel = 'gfs' | 'ecmwf';

export interface WindGrid {
  lon_min: number;
  lon_max: number;
  lat_min: number;
  lat_max: number;
  step: number;
}

export interface WindArtifact {
  schema: string;
  generated_at: string;
  model: WindModel;
  model_name: string;
  /** Model cycle (issue) time, UTC ISO. */
  issue_time: string;
  /** Forecast valid time, UTC ISO (equals issue time for an analysis). */
  valid_time: string;
  step_hours: number;
  kind: 'forecast' | 'analysis';
  grid: WindGrid;
  /** Row-major: row = (lat - lat_min)/step ascending, col = (lon - lon_min)/step. m/s. */
  u: number[];
  v: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Parse a wind artifact. Returns `null` for anything that is not this exact
 * contract: wrong schema, mismatched arrays, non-finite values, or a grid that
 * does not hold the arrays it claims. The caller renders UNAVAILABLE instead.
 */
export function parseWindArtifact(raw: unknown): WindArtifact | null {
  if (!isRecord(raw)) return null;
  if (raw.schema !== WIND_SCHEMA) return null;

  const generatedAt = stringOrNull(raw.generated_at);
  const model = raw.model === 'gfs' || raw.model === 'ecmwf' ? raw.model : null;
  const modelName = stringOrNull(raw.model_name);
  const issueTime = stringOrNull(raw.issue_time);
  const validTime = stringOrNull(raw.valid_time);
  const stepHours = numberOrNull(raw.step_hours);
  const kind = raw.kind === 'forecast' || raw.kind === 'analysis' ? raw.kind : null;
  if (!generatedAt || !model || !modelName || !issueTime || !validTime || stepHours === null || !kind) {
    return null;
  }

  const gridRaw = raw.grid;
  if (!isRecord(gridRaw)) return null;
  const lonMin = numberOrNull(gridRaw.lon_min);
  const lonMax = numberOrNull(gridRaw.lon_max);
  const latMin = numberOrNull(gridRaw.lat_min);
  const latMax = numberOrNull(gridRaw.lat_max);
  const step = numberOrNull(gridRaw.step);
  if (lonMin === null || lonMax === null || latMin === null || latMax === null || step === null) return null;
  if (!(step > 0) || !(lonMax > lonMin) || !(latMax > latMin)) return null;

  const u = raw.u;
  const v = raw.v;
  if (!Array.isArray(u) || !Array.isArray(v)) return null;

  const cols = Math.round((lonMax - lonMin) / step) + 1;
  const rows = Math.round((latMax - latMin) / step) + 1;
  if (cols < 2 || rows < 2) return null;
  if (u.length !== rows * cols || v.length !== rows * cols) return null;
  for (let i = 0; i < u.length; i += 1) {
    if (!Number.isFinite(u[i]) || !Number.isFinite(v[i])) return null;
  }

  return {
    schema: WIND_SCHEMA,
    generated_at: generatedAt,
    model,
    model_name: modelName,
    issue_time: issueTime,
    valid_time: validTime,
    step_hours: stepHours,
    kind,
    grid: { lon_min: lonMin, lon_max: lonMax, lat_min: latMin, lat_max: latMax, step },
    u,
    v,
  };
}

export function windAgeHours(artifact: WindArtifact, now: Date = new Date()): number {
  const generated = Date.parse(artifact.generated_at);
  if (!Number.isFinite(generated)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - generated) / 3_600_000;
}

export type WindFeed =
  | { kind: 'live'; artifact: WindArtifact }
  | { kind: 'stale'; artifact: WindArtifact }
  | { kind: 'unavailable' };

/**
 * Feed state from a parsed artifact. Live inside the SLO window, stale with a
 * visible "as of" beyond it (the workflow keeps the last good artifact), and
 * unavailable when there is nothing honest to draw.
 */
export function windFeedState(artifact: WindArtifact | null, now: Date = new Date()): WindFeed {
  if (!artifact) return { kind: 'unavailable' };
  return windAgeHours(artifact, now) <= WIND_FRESH_SLO_HOURS
    ? { kind: 'live', artifact }
    : { kind: 'stale', artifact };
}

/**
 * Chip text for the layer row. A fresh model field keeps its own neutral label
 * (amber stays reserved for observed data); stale and unavailable use the
 * shared freshness vocabulary.
 */
export function windChipLabel(feed: WindFeed): string {
  if (feed.kind === 'unavailable') return 'UNAVAILABLE';
  if (feed.kind === 'stale') {
    const stamp = feed.artifact.generated_at.slice(11, 16);
    return `STALE as of ${stamp}Z`;
  }
  const cycle = feed.artifact.issue_time.slice(11, 16);
  return `${feed.artifact.model.toUpperCase()} ${cycle}Z`;
}

/** Bilinear sample of the field at a lon/lat. Null outside the grid. */
export function sampleWind(artifact: WindArtifact, lon: number, lat: number): { u: number; v: number } | null {
  const { grid, u, v } = artifact;
  if (lon < grid.lon_min || lon > grid.lon_max || lat < grid.lat_min || lat > grid.lat_max) return null;

  const cols = Math.round((grid.lon_max - grid.lon_min) / grid.step) + 1;
  const rows = Math.round((grid.lat_max - grid.lat_min) / grid.step) + 1;
  const fx = (lon - grid.lon_min) / grid.step;
  const fy = (lat - grid.lat_min) / grid.step;
  const x0 = Math.min(cols - 1, Math.floor(fx));
  const y0 = Math.min(rows - 1, Math.floor(fy));
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0));
  const ty = Math.min(1, Math.max(0, fy - y0));

  const at = (x: number, y: number): number => y * cols + x;
  const mix = (arr: number[]): number => {
    const top = arr[at(x0, y0)] * (1 - tx) + arr[at(x1, y0)] * tx;
    const bottom = arr[at(x0, y1)] * (1 - tx) + arr[at(x1, y1)] * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return { u: mix(u), v: mix(v) };
}
