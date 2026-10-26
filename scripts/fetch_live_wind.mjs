#!/usr/bin/env node
/**
 * fetch_live_wind.mjs — build frontend/public/data/live/wind.json from Open-Meteo.
 *
 * Rewired 2026-10-26 (decision: replace the GFS/ECMWF GRIB pipeline with a free,
 * keyless real-time API — Open-Meteo, already this repo's weather source in
 * backend/utils/openMeteo.js). The retired pipeline decoded GRIB2 with wgrib2 on the
 * runner; the replacement asks one HTTP endpoint for the 10 m wind field on the
 * artifact's own 1° lattice and decomposes speed/direction into u/v east/north
 * components, so `frontend/src/lib/wind.ts` keeps parsing the unchanged
 * `hazardnet-wind/v1` artifact shape and the map layer (components/map/windOverlay.ts)
 * needs no sampling changes.
 *
 * What this script is NOT: it does not claim GFS cycle fidelity. The artifact says
 * `model: "open-meteo"`, its model_name is honest about the blended forecast, the
 * issue time is the fetch hour (Open-Meteo serves its latest blend), and the valid
 * time is the forecast hour actually selected. The client renders exactly that.
 */

import fs from 'node:fs';
import path from 'node:path';

export const WIND_SCHEMA = 'hazardnet-wind/v1';

/**
 * The Bangladesh hazard window plus a one-degree margin, on a 1° lattice:
 * 12 columns × 13 rows = 156 nodes — the same grid the retired GFS path sampled,
 * so the client's bilinear sampler is untouched. Row-major, latitude ascending.
 */
export const WIND_BBOX = { lonMin: 88, lonMax: 99, latMin: 20.5, latMax: 32.5, step: 1 };

export const WIND_MODEL = 'open-meteo';
export const WIND_MODEL_NAME = 'Open-Meteo 10 m wind (blended NWP forecast)';
export const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/** The artifact lattice, row-major: row = (lat - lat_min)/step ascending. */
export function gridNodes(bbox = WIND_BBOX) {
  const cols = Math.round((bbox.lonMax - bbox.lonMin) / bbox.step) + 1;
  const rows = Math.round((bbox.latMax - bbox.latMin) / bbox.step) + 1;
  const nodes = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      nodes.push({
        lon: bbox.lonMin + c * bbox.step,
        lat: bbox.latMin + r * bbox.step,
      });
    }
  }
  return nodes;
}

/**
 * One request for the whole lattice: Open-Meteo accepts coordinate lists and answers
 * one hourly block per node in request order. `forecast_hours` bounds the payload to
 * what we may consult — the now-ish hour we draw and nothing speculative beyond it.
 */
export function openMeteoWindUrl(nodes, { forecastHours = 6, base = OPEN_METEO_BASE } = {}) {
  const lats = nodes.map((n) => n.lat.toFixed(2)).join(',');
  const lons = nodes.map((n) => n.lon.toFixed(2)).join(',');
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timeformat: 'iso8601',
    timezone: 'GMT',
    forecast_hours: String(forecastHours),
  });
  return `${base}?${params.toString()}`;
}

/**
 * The forecast hour to draw: the first timestamp at or after `now` (never an hour
 * that has already started decaying), falling back to the last available hour when
 * the window is entirely in the past (clock skew on a just-rotated forecast).
 */
export function pickValidHourIndex(times, now = new Date()) {
  if (!Array.isArray(times) || times.length === 0) return -1;
  const nowMs = now.getTime();
  for (let i = 0; i < times.length; i += 1) {
    const t = Date.parse(times[i]);
    if (Number.isFinite(t) && t >= nowMs) return i;
  }
  return times.length - 1;
}

/**
 * Meteorological wind: direction is where the wind blows FROM (degrees clockwise
 * from north), speed in m/s. Decompose into the u/v (eastward/northward positive)
 * components the artifact stores — drawing needs the TO-vector.
 */
export function componentsFromWind(speedMs, directionDeg) {
  const rad = (directionDeg * Math.PI) / 180;
  return {
    u: -speedMs * Math.sin(rad),
    v: -speedMs * Math.cos(rad),
  };
}

/**
 * Map an Open-Meteo multi-location response onto the artifact's u/v arrays.
 *
 * @param {object|object[]} payload - parsed JSON: array per location (multi-coordinate
 *   request) or a single-location object.
 * @param {Array<{lon:number,lat:number}>} nodes - the lattice the request was built for.
 * @returns {{ validIso: string, u: number[], v: number[] }}
 * @throws when node count, node order or per-node hours don't line up — better to fail
 *   loudly and keep yesterday's artifact than publish a field that is not this grid.
 */
export function fieldsFromOpenMeteo(payload, nodes, now = new Date()) {
  const blocks = Array.isArray(payload) ? payload : [payload];
  if (blocks.length !== nodes.length) {
    throw new Error(`Open-Meteo answered ${blocks.length} location blocks for ${nodes.length} nodes`);
  }
  let validIso = null;
  const u = [];
  const v = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const hourly = blocks[i]?.hourly;
    if (!hourly || !Array.isArray(hourly.time)) {
      throw new Error(`node ${i} carries no hourly block`);
    }
    const idx = pickValidHourIndex(hourly.time, now);
    if (idx < 0) throw new Error(`node ${i} has no forecast hours`);
    const speed = hourly.wind_speed_10m?.[idx];
    const direction = hourly.wind_direction_10m?.[idx];
    if (!Number.isFinite(speed) || !Number.isFinite(direction)) {
      throw new Error(`node ${i} has no wind at ${hourly.time[idx]} (speed=${speed}, dir=${direction})`);
    }
    // Open-Meteo serves minute-resolution local-format stamps; normalise to full UTC ISO.
    const rawTime = String(hourly.time[idx]).replace(/Z$/, '');
    const padded = rawTime.length === 16 ? `${rawTime}:00` : rawTime;
    const validParsed = new Date(`${padded}Z`);
    if (!Number.isFinite(validParsed.getTime())) {
      throw new Error(`node ${i} has an unparseable hourly stamp "${hourly.time[idx]}"`);
    }
    const validHere = validParsed.toISOString();
    if (validIso === null) validIso = validHere;
    if (validHere !== validIso) {
      throw new Error(`node ${i} valid hour ${validHere} != grid valid hour ${validIso}`);
    }
    const { u: uc, v: vc } = componentsFromWind(speed, direction);
    u.push(uc);
    v.push(vc);
  }
  return { validIso, u, v };
}

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * The committed artifact — the exact contract `frontend/src/lib/wind.ts` parses.
 * Values are rounded to 0.1 m/s: the field is a coarse overlay, and eighth-decimal
 * m/s in a committed file is noise that costs diff size on every refresh.
 */
export function buildArtifact({
  model, modelName, issueIso, validIso, stepHours, kind, u, v,
}, now = new Date()) {
  return {
    schema: WIND_SCHEMA,
    generated_at: now.toISOString(),
    model,
    model_name: modelName,
    issue_time: issueIso,
    valid_time: validIso,
    step_hours: stepHours,
    kind,
    grid: {
      lon_min: WIND_BBOX.lonMin,
      lon_max: WIND_BBOX.lonMax,
      lat_min: WIND_BBOX.latMin,
      lat_max: WIND_BBOX.latMax,
      step: WIND_BBOX.step,
    },
    u: u.map(round1),
    v: v.map(round1),
  };
}

/** Full fetch → field → artifact. Exported so tests can drive it with a stub fetch. */
export async function fetchWindArtifact({
  fetchImpl = globalThis.fetch,
  now = new Date(),
  base = OPEN_METEO_BASE,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('no fetch implementation available (Node 18+ required)');
  }
  const nodes = gridNodes();
  const url = openMeteoWindUrl(nodes, { base });
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP ${response.status}`);
  }
  const payload = await response.json();
  const { validIso, u, v } = fieldsFromOpenMeteo(payload, nodes, now);
  const issueIso = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  const stepHours = Math.max(0, Math.round((Date.parse(validIso) - Date.parse(issueIso)) / 3_600_000));
  return buildArtifact({
    model: WIND_MODEL,
    modelName: WIND_MODEL_NAME,
    issueIso,
    validIso,
    stepHours,
    kind: 'forecast',
    u,
    v,
  }, now);
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex !== -1 && args[outIndex + 1]
    ? args[outIndex + 1]
    : 'frontend/public/data/live/wind.json';
  const now = new Date();
  const artifact = await fetchWindArtifact({ now });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(artifact, null, 1)}\n`, 'utf8');
  console.log(
    `[wind] wrote ${out}: ${artifact.u.length} nodes, model=${artifact.model}, ` +
    `issue=${artifact.issue_time}, valid=${artifact.valid_time}`,
  );
}

const invokedMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invokedMain) {
  main().catch((error) => {
    console.error(`[wind] ${error.message}`);
    process.exit(1);
  });
}
