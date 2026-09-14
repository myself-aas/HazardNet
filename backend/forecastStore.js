import { createHash } from 'node:crypto';
/**
 * Forecast data store — the single access layer for forecast persistence.
 *
 * Uses Firebase Firestore via ./db.js as the exclusive database backend.
 * Read-shape: numeric fields as JS numbers, dates as 'YYYY-MM-DD' strings.
 */

import { db, collection, getDocs, getDoc, query, where, orderBy, limit, doc, writeBatch } from './db.js';

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

async function currentPublication() {
  const snapshot = await getDoc(doc(collection(db, 'forecast_publications'), 'current'));
  // Missing snapshot allows a coordinated rollout from the legacy store.
  // Read errors must propagate; never silently serve old data on Firebase failure.
  return snapshot.data() || null;
}

function createFirestoreStore() {
  return {
    mode: 'firestore',

    async getLatestPublicationMetadata() {
      const current = await currentPublication();
      if (!current) return null;
      return {
        prediction_date: current.manifest.prediction_date,
        ingestion_timestamp: current.published_at,
        data_source: current.manifest.kernel,
        notebook_source: current.manifest.kernel,
        forecast_run_id: current.manifest.run_id,
        completed_at: current.manifest.completed_at,
        kaggle_version: current.manifest.kaggle_version,
        csv_sha256: current.manifest.csv_sha256,
        model_sha256: current.manifest.model_sha256,
        contract_version: current.manifest.contract_version,
      };
    },

    async getLatestForecastByDistrict(districtId, horizon) {
      const current = await currentPublication();
      if (current) return current.rows.find((r) => r.district_id === districtId && r.horizon === horizon) || null;
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
      const current = await currentPublication();
      if (current) return current.rows.filter((r) => r.horizon === horizon);
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
      const current = await currentPublication();
      if (current) return current.manifest.prediction_date;
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
      const current = await currentPublication();
      if (current) return current.published_at;
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
      if (rows.some((row) => row.prediction_date !== predictionDate)) {
        throw new Error('Replacement rows must share prediction_date');
      }
      const old = await getDocs(query(collection(db, 'forecasts'), where('prediction_date', '==', predictionDate)));
      const ids = new Set(rows.map(rowId));
      // Publish all replacements before deleting obsolete rows. Partial failures
      // never erase the previous forecast set; replay is idempotent by row key.
      await writeRows(rows);
      const stale = [];
      old.forEach((entry) => { if (!ids.has(entry.id)) stale.push(entry.ref); });
      for (let i = 0; i < stale.length; i += 400) {
        const batch = writeBatch(db);
        stale.slice(i, i + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      return { written: rows.length };
    },

    async appendForecasts(rows) {
      await writeRows(rows);
      return { written: rows.length };
    },
  };
}

function rowId(row) {
  return createHash('sha256').update(JSON.stringify([
    row.district_id, row.horizon, row.hazard_type, row.target_date, row.prediction_date,
  ])).digest('hex');
}
async function writeRows(rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    rows.slice(i, i + 400).forEach((row) => batch.set(doc(collection(db, 'forecasts'), rowId(row)), {
      ...row, created_at: new Date().toISOString(),
    }));
    await batch.commit();
  }
}
