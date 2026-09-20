/**
 * Forecast data store — the single access layer for forecast persistence.
 *
 * Uses Firebase Firestore via ./db.js as the database backend, with automatic
 * in-memory fallback to committed static forecast snapshots when Firestore is
 * unprovisioned, offline, or returns 0 records.
 * Read-shape: numeric fields as JS numbers, dates as 'YYYY-MM-DD' strings.
 */

import { db, collection, getDocs, query, where, orderBy, limit, doc, writeBatch } from './db.js';
import fs from 'fs';
import path from 'path';

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
                rows.push({
                  ...item,
                  horizon: item.horizon || horizon,
                  prediction_date: item.prediction_date || parsed.prediction_date || '2026-09-16',
                  created_at: item.created_at || parsed.generated_at || new Date().toISOString(),
                });
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
          const snap = await getDocs(q);
          const rows = [];
          snap.forEach((d) => rows.push(d.data()));
          if (rows.length > 0) {
            firestoreAvailable = true;
            rows.sort((a, b) => new Date(b.prediction_date) - new Date(a.prediction_date));
            return rows[0];
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      return getMemoryLatestByDistrict(districtId, horizon);
    },

    async getLatestForecastsByHorizon(horizon) {
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(collection(db, 'forecasts'), where('horizon', '==', horizon));
          const snap = await getDocs(q);
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
            if (results.length > 0) return results;
          }
        } catch (err) {
          handleFirestoreFailure(err);
        }
      }
      return getMemoryLatestByHorizon(horizon);
    },

    /** Newest prediction_date across all horizons ('YYYY-MM-DD' | null). */
    async getLatestPredictionDate() {
      if (!isFirestoreInCooldown()) {
        try {
          const q = query(collection(db, 'forecasts'), orderBy('prediction_date', 'desc'), limit(1));
          const snap = await getDocs(q);
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
          const snap = await getDocs(q);
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
          const snap = await getDocs(query(collection(db, 'forecasts'), ...constraints));
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
      // Update memory store immediately
      memoryRows = memoryRows.filter((r) => r.prediction_date !== predictionDate);
      const timestamp = new Date().toISOString();
      const enrichedRows = rows.map((r) => ({ ...r, created_at: timestamp }));
      memoryRows.push(...enrichedRows);
      memoryPredictionDate = predictionDate;
      memoryIngestionTimestamp = timestamp;

      // Attempt Firestore persistence if accessible
      try {
        const forecastsRef = collection(db, 'forecasts');
        const qOld = query(forecastsRef, where('prediction_date', '==', predictionDate));
        const oldSnap = await getDocs(qOld);
        const batch = writeBatch(db);
        oldSnap.forEach((d) => batch.delete(d.ref));
        for (const row of enrichedRows) {
          batch.set(doc(collection(db, 'forecasts')), row);
        }
        await batch.commit();
        firestoreAvailable = true;
      } catch (err) {
        handleFirestoreFailure(err);
      }

      return { written: rows.length };
    },

    async appendForecasts(rows) {
      const timestamp = new Date().toISOString();
      const enrichedRows = rows.map((r) => ({ ...r, created_at: timestamp }));
      memoryRows.push(...enrichedRows);
      if (rows.length > 0 && rows[0].prediction_date) {
        memoryPredictionDate = rows[0].prediction_date;
      }
      memoryIngestionTimestamp = timestamp;

      try {
        const batch = writeBatch(db);
        for (const row of enrichedRows) {
          batch.set(doc(collection(db, 'forecasts')), row);
        }
        await batch.commit();
        firestoreAvailable = true;
      } catch (err) {
        handleFirestoreFailure(err);
      }

      return { written: rows.length };
    },
  };
}
