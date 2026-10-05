#!/usr/bin/env node
/**
 * scripts/fetch_live_wind.mjs — build the live wind artifact (Phase E).
 *
 * Decision point E.1, resolved: the GRIB plumbing runs here, on a GitHub
 * Actions runner with real tooling (wgrib2), not in a Vercel function. The
 * function budget stays untouched, and the client serves a small committed
 * artifact — GEV's bundled-artifact idea applied to derived data.
 *
 * Ladder, exactly as planned:
 *   1. GFS 0.25 degree on NOAA's public AWS bucket — newest cycle, f006/f003/
 *      f000, UGRD/VGRD at 10 m via .idx byte ranges.
 *   2. ECMWF open data 0.25 degree — newest run, step 6h else 0h, 10u/10v via
 *      the per-file JSONL index (whole-file fetch as a second resort).
 *   3. Neither answers: exit non-zero. The last good artifact stays committed;
 *      the client labels it STALE, then UNAVAILABLE. Nothing is invented.
 *
 * Output: hazardnet-wind/v1 JSON, 1-degree grid over Bangladesh + the Bay of
 * Bengal (84-95 E, 17-29 N), row-major lat-ascending, u/v in m/s.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const WIND_SCHEMA = 'hazardnet-wind/v1';
export const WIND_BBOX = { lonMin: 84, lonMax: 95, latMin: 17, latMax: 29, step: 1 };
export const FETCH_TIMEOUT_MS = 30_000;

/** Newest-first six-hour cycle candidates `hoursBehind` the wall clock. */
export function sixHourCycles(now = new Date(), hoursBehind = 3.5, count = 4) {
  const base = new Date(now.getTime() - hoursBehind * 3_600_000);
  base.setUTCMinutes(0, 0, 0);
  base.setUTCHours(Math.floor(base.getUTCHours() / 6) * 6);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const c = new Date(base.getTime() - i * 6 * 3_600_000);
    out.push({
      iso: c.toISOString(),
      date: c.toISOString().slice(0, 10).replaceAll('-', ''),
      hour: c.toISOString().slice(11, 13),
    });
  }
  return out;
}

/**
 * Parse a GFS `.idx` listing into ordered messages. Each line is
 * `offset:msgNo:d=...:FIELD:level:forecast:`; a message ends one byte before
 * the next offset (the last message runs to end of file: end === null).
 */
export function parseGfsIdx(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const offset = Number(trimmed.split(':')[0]);
    if (!Number.isFinite(offset)) continue;
    entries.push({ offset, line: trimmed });
  }
  entries.sort((a, b) => a.offset - b.offset);
  return entries.map((entry, i) => ({
    ...entry,
    end: i + 1 < entries.length ? entries[i + 1].offset - 1 : null,
  }));
}

/** Pick the UGRD/VGRD 10 m messages out of parsed idx entries. */
export function pickWindMessages(entries) {
  const u = entries.find((e) => e.line.includes(':UGRD:10 m above ground:'));
  const v = entries.find((e) => e.line.includes(':VGRD:10 m above ground:'));
  return u && v ? { u, v } : null;
}

/** ECMWF open-data per-file JSONL index lines into byte-range picks. */
export function pickEcmwfMessages(indexText) {
  let u = null;
  let v = null;
  for (const line of indexText.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.param === '10u' && typeof rec.offset === 'number') u = rec;
    if (rec.param === '10v' && typeof rec.offset === 'number') v = rec;
  }
  return u && v ? { u, v } : null;
}

/** Parse `wgrib2 -spread -no_header` output (`lon lat value` per line). */
export function parseSpread(text) {
  const points = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    const value = Number(parts[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(value)) continue;
    if (value > 1e10) continue; // wgrib2's missing-data sentinel
    points.push({ lon: lon > 180 ? lon - 360 : lon, lat, value });
  }
  return points;
}

/**
 * Resample scattered native-grid points onto the target degree grid by
 * averaging every native point within `radius` degrees of each node. Missing
 * nodes (should not happen over the box) fall back to the nearest point.
 */
export function resampleToGrid(points, bbox = WIND_BBOX, radius = 0.36) {
  const cols = Math.round((bbox.lonMax - bbox.lonMin) / bbox.step) + 1;
  const rows = Math.round((bbox.latMax - bbox.latMin) / bbox.step) + 1;
  const out = new Array(rows * cols).fill(null);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lon = bbox.lonMin + c * bbox.step;
      const lat = bbox.latMin + r * bbox.step;
      let sum = 0;
      let n = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      let bestValue = null;
      for (const p of points) {
        const d = Math.hypot(p.lon - lon, p.lat - lat);
        if (d <= radius) {
          sum += p.value;
          n += 1;
        }
        if (d < bestDist) {
          bestDist = d;
          bestValue = p.value;
        }
      }
      out[r * cols + c] = n > 0 ? sum / n : bestValue;
    }
  }
  if (out.some((v) => v === null)) throw new Error('resample left holes in the wind grid');
  return out;
}

/** Assemble the artifact exactly as the client parses it. */
export function buildArtifact({ model, modelName, issueIso, validIso, stepHours, kind, u, v }, now = new Date()) {
  const round = (arr) => arr.map((x) => Math.round(x * 10) / 10);
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
    u: round(u),
    v: round(v),
  };
}

/* ── plumbing (network + wgrib2), kept out of the pure helpers ─────────── */

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

function runWgrib2(args) {
  return execFileSync('wgrib2', args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
}

function subsetAndSpread(gribBuffer, match) {
  const work = join(tmpdir(), `hazardnet-wind-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(work, { recursive: true });
  const inFile = join(work, 'in.grib');
  const subFile = join(work, 'sub.grib');
  writeFileSync(inFile, gribBuffer);
  const { lonMin, lonMax, latMin, latMax } = WIND_BBOX;
  runWgrib2([inFile, '-match', match, '-small_grib', subFile, String(lonMin), String(lonMax), String(latMin), String(latMax)]);
  const spread = runWgrib2([subFile, '-spread', '-no_header']);
  return parseSpread(spread);
}

/** GFS rung: newest cycle/step that answers, byte-range UGRD/VGRD. */
async function fetchFromGfs(now, log) {
  for (const cycle of sixHourCycles(now)) {
    for (const step of [6, 3, 0]) {
      const fff = String(step).padStart(3, '0');
      const base = `https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.${cycle.date}/${cycle.hour}/atmos/gfs.t${cycle.hour}z.pgrb2.0p25.f${fff}`;
      try {
        const idxRes = await fetchWithTimeout(`${base}.idx`);
        if (!idxRes.ok) continue;
        const entries = parseGfsIdx(await idxRes.text());
        const picks = pickWindMessages(entries);
        if (!picks) continue;
        log(`[gfs] ${cycle.date}/${cycle.hour} f${fff}: fetching UGRD/VGRD byte ranges`);
        const grab = async (entry) => {
          const range = entry.end === null ? `bytes=${entry.offset}-` : `bytes=${entry.offset}-${entry.end}`;
          const res = await fetchWithTimeout(base, { headers: { Range: range } });
          if (!res.ok && res.status !== 206) throw new Error(`range fetch failed: ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        };
        const [uBuf, vBuf] = await Promise.all([grab(picks.u), grab(picks.v)]);
        const uPoints = subsetAndSpread(uBuf, ':UGRD:10 m above ground:');
        const vPoints = subsetAndSpread(vBuf, ':VGRD:10 m above ground:');
        const issueIso = cycle.iso;
        const validIso = new Date(Date.parse(cycle.iso) + step * 3_600_000).toISOString();
        return buildArtifact({
          model: 'gfs',
          modelName: 'NOAA GFS 0.25 degree',
          issueIso,
          validIso,
          stepHours: step,
          kind: step > 0 ? 'forecast' : 'analysis',
          u: resampleToGrid(uPoints),
          v: resampleToGrid(vPoints),
        });
      } catch (err) {
        log(`[gfs] ${cycle.date}/${cycle.hour} f${fff}: ${err && err.message ? err.message : err}`);
      }
    }
  }
  return null;
}

/** ECMWF rung: newest run with step 6h, else analysis; JSONL index first. */
async function fetchFromEcmwf(now, log) {
  for (const cycle of sixHourCycles(now, 2, 4)) {
    const dirBase = `https://data.ecmwf.int/forecasts/${cycle.date}/${cycle.hour}/ifs/0.25%C2%B0/oper`;
    try {
      const indexRes = await fetchWithTimeout(`${dirBase}/index.json`);
      if (!indexRes.ok) continue;
      const index = await indexRes.json();
      const files = Array.isArray(index.files) ? index.files : [];
      for (const step of [6, 0]) {
        const file = files.find((f) => typeof f.name === 'string' && f.name.includes(`-${step}h-`));
        if (!file) continue;
        const gribUrl = `${dirBase}/${file.name}`;
        log(`[ecmwf] ${cycle.date}/${cycle.hour} step ${step}h: ${file.name}`);
        let uBuf = null;
        let vBuf = null;
        try {
          const jsonlRes = await fetchWithTimeout(`${gribUrl}.index`);
          if (jsonlRes.ok) {
            const picks = pickEcmwfMessages(await jsonlRes.text());
            if (picks) {
              const grab = async (rec) => {
                const end = typeof rec.length === 'number' ? rec.offset + rec.length - 1 : null;
                const range = end === null ? `bytes=${rec.offset}-` : `bytes=${rec.offset}-${end}`;
                const res = await fetchWithTimeout(gribUrl, { headers: { Range: range } });
                if (!res.ok && res.status !== 206) throw new Error(`range fetch failed: ${res.status}`);
                return Buffer.from(await res.arrayBuffer());
              };
              [uBuf, vBuf] = await Promise.all([grab(picks.u), grab(picks.v)]);
            }
          }
        } catch (err) {
          log(`[ecmwf] per-file index unusable (${err && err.message ? err.message : err}); fetching whole file`);
        }
        if (!uBuf || !vBuf) {
          const whole = await fetchWithTimeout(gribUrl);
          if (!whole.ok) continue;
          const buf = Buffer.from(await whole.arrayBuffer());
          uBuf = buf;
          vBuf = buf;
        }
        const matchU = ':(UGRD|10U):10 m above ground:';
        const matchV = ':(VGRD|10V):10 m above ground:';
        const uPoints = subsetAndSpread(uBuf, matchU);
        const vPoints = subsetAndSpread(vBuf, matchV);
        const issueIso = cycle.iso;
        const validIso = new Date(Date.parse(cycle.iso) + step * 3_600_000).toISOString();
        return buildArtifact({
          model: 'ecmwf',
          modelName: 'ECMWF IFS 0.25 degree open data',
          issueIso,
          validIso,
          stepHours: step,
          kind: step > 0 ? 'forecast' : 'analysis',
          u: resampleToGrid(uPoints),
          v: resampleToGrid(vPoints),
        });
      }
    } catch (err) {
      log(`[ecmwf] ${cycle.date}/${cycle.hour}: ${err && err.message ? err.message : err}`);
    }
  }
  return null;
}

export async function buildWindArtifact(now = new Date(), log = () => undefined) {
  const gfs = await fetchFromGfs(now, log);
  if (gfs) return gfs;
  log('[ladder] GFS unavailable; falling back to ECMWF open data');
  return fetchFromEcmwf(now, log);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const outArg = process.argv.indexOf('--out');
  const outPath = outArg > -1 ? process.argv[outArg + 1] : 'frontend/public/data/live/wind.json';
  buildWindArtifact(new Date(), (line) => console.log(line))
    .then((artifact) => {
      if (!artifact) {
        console.error('[wind] both GFS and ECMWF failed; keeping the last committed artifact (it will age to STALE, then UNAVAILABLE)');
        process.exit(1);
      }
      const dest = resolve(process.cwd(), outPath);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${JSON.stringify(artifact, null, 2)}\n`);
      console.log(`[wind] wrote ${dest} — ${artifact.model_name}, issued ${artifact.issue_time}, valid ${artifact.valid_time}`);
    })
    .catch((err) => {
      console.error('[wind] unexpected failure:', err);
      process.exit(1);
    });
}
