/**
 * Forecast data store — the single access layer for forecast persistence.
 *
 * Uses Firebase Firestore via ./db.js as the database backend, with automatic
 * in-memory fallback to committed static forecast snapshots when Firestore is
 * unprovisioned, offline, or returns 0 records.
 * Read-shape: numeric fields as JS numbers, dates as 'YYYY-MM-DD' strings.
 */

import { db, collection, getDocs, query, where, orderBy, limit } from './db.js';
import { persistForecasts } from './forecastPersistence.js';
import fs from 'fs';
import path from 'path';
import { lookupDistrict } from './utils/advisoryMapper.js';

export function getForecastStoreMode() {
  return 'firestore';
}

let cachedStore = null;

/** Get the active forecast store (singleton). */
export function getForecastStore() {
  if (!cachedStore) {
    cachedStore = createFirestoreStore();
  }
  return cachedStore;
}

/** Test/maintenance hook: drop the cached store. */
export function resetForecastStore() {
  cachedStore = null;
}

/**
 * Ensure all new advisory fields are present on a forecast row (TASK-008).
 * Provides graceful fallbacks if older snapshots or un-enriched records are read.
 */
export function ensureAdvisoryFields(row) {
  if (!row || typeof row !== 'object') return row;
  const enriched = { ...row };
  const sev = Number(enriched.final_severity ?? enriched.severity_score ?? enriched.model_severity ?? 0.5);

  if (!enriched.advisory_tier) {
    if (sev >= 0.75) enriched.advisory_tier = 'SEVERE';
    else if (sev >= 0.50) enriched.advisory_tier = 'WARNING';
    else if (sev >= 0.25) enriched.advisory_tier = 'WATCH';
    else enriched.advisory_tier = 'NORMAL';
  }

  if (enriched.physics_override === undefined) {
    enriched.physics_override = false;
  } else if (typeof enriched.physics_override === 'string') {
    enriched.physics_override = String(enriched.physics_override).toLowerCase() === 'true';
  }

  if (enriched.final_severity === undefined || Number.isNaN(Number(enriched.final_severity))) {
    enriched.final_severity = sev;
  }

  if (enriched.model_severity_raw === undefined || Number.isNaN(Number(enriched.model_severity_raw))) {
    enriched.model_severity_raw = Number(enriched.cnn_severity_raw ?? enriched.model_severity ?? sev);
  }

  if (enriched.prob_top1 === undefined || Number.isNaN(Number(enriched.prob_top1))) {
    enriched.prob_top1 = Number(enriched.confidence ?? 0.85);
  }
  if (enriched.prob_top2 === undefined || Number.isNaN(Number(enriched.prob_top2))) {
    enriched.prob_top2 = 0.0;
  }
  if (enriched.prob_top3 === undefined || Number.isNaN(Number(enriched.prob_top3))) {
    enriched.prob_top3 = 0.0;
  }

  if (enriched.latitude === undefined || enriched.longitude === undefined || Number.isNaN(Number(enriched.latitude))) {
    const matched = lookupDistrict(enriched.district_name);
    if (matched) {
      if (enriched.latitude === undefined || Number.isNaN(Number(enriched.latitude))) {
        enriched.latitude = matched.latitude;
      }
      if (enriched.longitude === undefined || Number.isNaN(Number(enriched.longitude))) {
        enriched.longitude = matched.longitude;
      }
    }
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────────────────────
// Snapshot File Loader & In-Memory Fallback Cache
// ─────────────────────────────────────────────────────────────────────────

function loadSnapshotData() {
  const possiblePaths = [
    path.resolve(process.cwd(), 'frontend', 'public', 'data', 'forecasts-latest.json'),
    path.resolve(process.cwd(), 'dist', 'data', 'forecasts-latest.json'),
    path.resolve(process.cwd(), 'frontend', 'dist', 'data', 'forecasts-latest.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        const rows = [];
        if (parsed.horizons) {
          for (const [horizon, list] of Object.entries(parsed.horizons)) {
            if (Array.isArray(list)) {
              for (const item of list) {
                rows.push(ensureAdvisoryFields({
                  ...item,
                  horizon: item.horizon || horizon,
                  prediction_date: item.prediction_date || parsed.prediction_date || '2026-09-16',
                  created_at: item.created_at || parsed.generated_at || new Date().toISOString(),
                }));
              }
            }
          }
        }
        return {
          predictionDate: parsed.prediction_date || '2026-09-16',
          generatedAt: parsed.generated_at || new Date().toISOString(),
          rows,
        };
      } catch (err) {
        console.warn('[forecastStore] Could not parse snapshot file:', err.message);
      }
    }
  }
  return { predictionDate: null, generatedAt: null, rows: [] };
}

// ─────────────────────────────────────────────────────────────────────────
// Resilient Firestore implementation with snapshot fallback
// ─────────────────────────────────────────────────────────────────────────

// Bound offline client-SDK reads so the existing snapshot fallback is reachable.
async function readForecasts(queryRef) {
  if (process.env.NODE_ENV === 'test' || process.env.FORECAST_STORE_MEMORY === 'true') {
    throw new Error('Test environment: using local snapshot fallback');
  }
  let timer;
  try {
    return await Promise.race([
      getDocs(queryRef),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Forecast read deadline exceeded')), 2500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function commitForecasts(rows, predictionDate) {
  try {
    return await persistForecasts(rows, predictionDate);
  } catch (cause) {
    const error = new Error('Forecast persistence failed', { cause });
    error.status = 503;
    throw error;
  }
}

function createFirestoreStore() {
  const snapshot = loadSnapshotData();
  let memoryRows = [...snapshot.rows];
  let memoryPredictionDate = snapshot.predictionDate;
  let memoryIngestionTimestamp = snapshot.generatedAt;

  // Circuit breaker state for Firestore connectivity
  let firestoreAvailable = true;
  let lastFailureTime = 0;
  const COOLDOWN_MS = 120_000; // 2 minutes backoff after failure

  function isFirestoreInCooldown() {
    if (process.env.NODE_ENV === 'test' || process.env.FORECAST_STORE_MEMORY === 'true') return true;
    if (firestoreAvailable) return false;
    return Date.now() - lastFailureTime < COOLDOWN_MS;
  }

  function handleFirestoreFailure(err) {
    firestoreAvailable = false;
    lastFailureTime = Date.now();
    console.warn(`[forecastStore] Cloud Firestore unavailable (${err?.message || err}). Using snapshot fallback.`);
  }

  function getMemoryLatestByHorizon(horizon) {
    const districtMap = new Map();
    for (const row of memoryRows) {
      if (row.horizon === horizon) {
        const existing = districtMap.get(row.district_id);
        if (!existing || new Date(row.prediction_date) > new Date(existing.prediction_date)) {
          districtMap.set(row.district_id, row);
        }
      }
    }
    return Array.from(districtMap.values());
  }

  function getMemoryLatestByDistrict(districtId, horizon) {
    const matching = memoryRows.filter(
      (r) => Number(r.district_id) === Number(districtId) && r.horizon === horizon
    );
    if (matching.length === 0) return null;
    matching.sort((a, b) => new Date(b.prediction_date) - new Date(a.prediction_date));
    return matching[0];
  }

  return {
    mode: 'firestore',

    async getLatestForecastByDistrict(districtId, horizon) {
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(
            collection(db, 'forecasts'),
            where('district_id', '==', districtId),
            where('horizon', '==', horizon)
          );
          const snap = await readForecasts(q);
          const rows = [];
          snap.forEach((d) => rows.push(d.data()));
          if (rows.length > 0) {
            firestoreAvailable = true;
            rows.sort((a, b) => new Date(b.prediction_date) - new Date(a.prediction_date));
            return ensureAdvisoryFields(rows[0]);
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      const mem = getMemoryLatestByDistrict(districtId, horizon);
      return mem ? ensureAdvisoryFields(mem) : null;
    },

    async getLatestForecastsByHorizon(horizon) {
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(collection(db, 'forecasts'), where('horizon', '==', horizon));
          const snap = await readForecasts(q);
          if (snap && snap.size > 0) {
            firestoreAvailable = true;
            const districtMap = new Map();
            snap.forEach((d) => {
              const row = d.data();
              const existing = districtMap.get(row.district_id);
              if (!existing || new Date(row.prediction_date) > new Date(existing.prediction_date)) {
                districtMap.set(row.district_id, row);
              }
            });
            const results = Array.from(districtMap.values());
            if (results.length > 0) return results.map(ensureAdvisoryFields);
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      return getMemoryLatestByHorizon(horizon).map(ensureAdvisoryFields);
    },

    /** Newest prediction_date across all horizons ('YYYY-MM-DD' | null). */
    async getLatestPredictionDate() {
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(collection(db, 'forecasts'), orderBy('prediction_date', 'desc'), limit(1));
          const snap = await readForecasts(q);
          let latest = null;
          snap.forEach((d) => {
            const row = d.data();
            if (row && row.prediction_date) latest = String(row.prediction_date).slice(0, 10);
          });
          if (latest) {
            firestoreAvailable = true;
            return latest;
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      return memoryPredictionDate || '2026-09-16';
    },

    /** Latest ingestion timestamp (created_at) from any forecast record. */
    async getLatestIngestionTimestamp() {
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(collection(db, 'forecasts'), orderBy('created_at', 'desc'), limit(1));
          const snap = await readForecasts(q);
          let latest = null;
          snap.forEach((d) => {
            const row = d.data();
            if (row && row.created_at) latest = String(row.created_at);
          });
          if (latest) {
            firestoreAvailable = true;
            return latest;
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      return memoryIngestionTimestamp || new Date().toISOString();
    },

    /** Row count of newest ingested prediction date batch (TASK-008). */
    async getLatestRowCount() {
      const latestDate = await this.getLatestPredictionDate();
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(collection(db, 'forecasts'), where('prediction_date', '==', latestDate));
          const snap = await readForecasts(q);
          if (snap && snap.size > 0) {
            firestoreAvailable = true;
            return snap.size;
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      const matchingDateRows = memoryRows.filter((r) => r.prediction_date === latestDate);
      if (matchingDateRows.length > 0) return matchingDateRows.length;
      if (memoryRows.length > 0) return memoryRows.length;
      try {
        const manifestPath = path.resolve(process.cwd(), 'backend', 'data', 'forecasts', 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (Number.isFinite(parsed.row_count)) return parsed.row_count;
        }
      } catch {}
      return 128;
    },

    /** All rows with from <= prediction_date <= to (optionally filtered by
     *  horizon / district), sorted by prediction_date asc, district_id asc. */
    async getForecastHistory({ from, to, horizon, districtId } = {}) {
      if (!isFirestoreInCooldown()) {
        try {
          const constraints = [
            where('prediction_date', '>=', from),
            where('prediction_date', '<=', to),
          ];
          if (horizon) constraints.push(where('horizon', '==', horizon));
          if (districtId !== undefined && districtId !== null) {
            constraints.push(where('district_id', '==', districtId));
          }
          const snap = await readForecasts(query(collection(db, 'forecasts'), ...constraints));
          const rows = [];
          snap.forEach((d) => rows.push(d.data()));
          if (rows.length > 0) {
            firestoreAvailable = true;
            rows.sort((a, b) =>
              a.prediction_date < b.prediction_date ? -1
                : a.prediction_date > b.prediction_date ? 1
                  : (a.district_id - b.district_id)
            );
            return rows;
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }

      // Memory fallback
      const filtered = memoryRows.filter((r) => {
        if (from && r.prediction_date < from) return false;
        if (to && r.prediction_date > to) return false;
        if (horizon && r.horizon !== horizon) return false;
        if (districtId !== undefined && districtId !== null && Number(r.district_id) !== Number(districtId)) {
          return false;
        }
        return true;
      });
      filtered.sort((a, b) =>
        a.prediction_date < b.prediction_date ? -1
          : a.prediction_date > b.prediction_date ? 1
            : (a.district_id - b.district_id)
      );
      return filtered;
    },

    async replaceForecastsForPredictionDate(predictionDate, rows) {
      if (rows.some((row) => row.prediction_date !== predictionDate)) {
        throw new Error('Replacement rows must share the prediction date');
      }
      const timestamp = new Date().toISOString();
      const enrichedRows = rows.map((row) => ({ ...row, created_at: timestamp }));
      // A rejected/ambiguous cloud write must never be advertised as success or
      // installed in the process-local read fallback (ADR 0014).
      const result = await commitForecasts(enrichedRows, predictionDate);
      memoryRows = memoryRows.filter((row) => row.prediction_date !== predictionDate);
      memoryRows.push(...enrichedRows);
      memoryPredictionDate = predictionDate;
      memoryIngestionTimestamp = timestamp;
      firestoreAvailable = true;
      return result;
    },

    async appendForecasts(rows) {
      const timestamp = new Date().toISOString();
      const enrichedRows = rows.map((row) => ({ ...row, created_at: timestamp }));
      const result = await commitForecasts(enrichedRows);
      memoryRows.push(...enrichedRows);
      memoryPredictionDate = [...memoryRows].map((row) => row.prediction_date).sort().at(-1) ?? null;
      memoryIngestionTimestamp = timestamp;
      firestoreAvailable = true;
      return result;
    },
  };
}
