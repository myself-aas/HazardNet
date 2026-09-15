/**
 * Forecast data store — the single access layer for forecast persistence.
 *
 * Uses Firebase Firestore via ./db.js as the exclusive database backend.
 * Read-shape: numeric fields as JS numbers, dates as 'YYYY-MM-DD' strings.
 */

import { db, collection, getDocs, query, where, orderBy, limit, doc, writeBatch } from './db.js';

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
// Firestore implementation
// ─────────────────────────────────────────────────────────────────────────

function createFirestoreStore() {
  return {
    mode: 'firestore',

    async getLatestForecastByDistrict(districtId, horizon) {
      const q = query(
        collection(db, 'forecasts'),
        where('district_id', '==', districtId),
        where('horizon', '==', horizon)
      );
      const snap = await getDocs(q);
      const rows = [];
      snap.forEach((d) => rows.push(d.data()));
      if (rows.length === 0) return null;
      rows.sort((a, b) => new Date(b.prediction_date) - new Date(a.prediction_date));
      return rows[0];
    },

    async getLatestForecastsByHorizon(horizon) {
      const q = query(collection(db, 'forecasts'), where('horizon', '==', horizon));
      const snap = await getDocs(q);
      const districtMap = new Map();
      snap.forEach((d) => {
        const row = d.data();
        const existing = districtMap.get(row.district_id);
        if (!existing || new Date(row.prediction_date) > new Date(existing.prediction_date)) {
          districtMap.set(row.district_id, row);
        }
      });
      return Array.from(districtMap.values());
    },

    /** Newest prediction_date across all horizons ('YYYY-MM-DD' | null).
     *  Cheap freshness probe for the /metrics gauge: one indexed doc read. */
    async getLatestPredictionDate() {
      const q = query(collection(db, 'forecasts'), orderBy('prediction_date', 'desc'), limit(1));
      const snap = await getDocs(q);
      let latest = null;
      snap.forEach((d) => {
        const row = d.data();
        if (row && row.prediction_date) latest = String(row.prediction_date).slice(0, 10);
      });
      return latest;
    },

    /** Latest ingestion timestamp (created_at) from any forecast record. */
    async getLatestIngestionTimestamp() {
      const q = query(collection(db, 'forecasts'), orderBy('created_at', 'desc'), limit(1));
      const snap = await getDocs(q);
      let latest = null;
      snap.forEach((d) => {
        const row = d.data();
        if (row && row.created_at) latest = String(row.created_at);
      });
      return latest;
    },

    /** All rows with from <= prediction_date <= to (optionally filtered by
     *  horizon / district), sorted by prediction_date asc, district_id asc. */
    async getForecastHistory({ from, to, horizon, districtId } = {}) {
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
      rows.sort((a, b) =>
        a.prediction_date < b.prediction_date ? -1
          : a.prediction_date > b.prediction_date ? 1
            : (a.district_id - b.district_id)
      );
      return rows;
    },

    async replaceForecastsForPredictionDate(predictionDate, rows) {
      const forecastsRef = collection(db, 'forecasts');
      const qOld = query(forecastsRef, where('prediction_date', '==', predictionDate));
      const oldSnap = await getDocs(qOld);
      const batch = writeBatch(db);
      oldSnap.forEach((d) => batch.delete(d.ref));
      for (const row of rows) {
        batch.set(doc(collection(db, 'forecasts')), {
          ...row,
          created_at: new Date().toISOString(),
        });
      }
      await batch.commit();
      return { written: rows.length };
    },

    async appendForecasts(rows) {
      const batch = writeBatch(db);
      for (const row of rows) {
        batch.set(doc(collection(db, 'forecasts')), {
          ...row,
          created_at: new Date().toISOString(),
        });
      }
      await batch.commit();
      return { written: rows.length };
    },
  };
}
