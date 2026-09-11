/**
 * Forecast data store — the single access layer for forecast persistence
 * (ADR 0002 "expand" step, 2026-09-12).
 *
 * Two interchangeable implementations, selected by FORECAST_STORE:
 *
 *   - 'firestore' (default, legacy): the AI-Studio applet Firestore database
 *     via ./db.js — the pre-cutover store. Kept until the ADR 0002
 *     verification checklist passes.
 *   - 'supabase': Supabase Postgres via pg (DATABASE_URL + SUPABASE_SSL) —
 *     the ADR 0002 target. Schema: scripts/db/002_forecasts_supabase.sql
 *     (RLS: public read; writes via service-role connection string).
 *
 * Cutover runbook (ops, in order):
 *   1. Apply scripts/db/002_forecasts_supabase.sql in Supabase.
 *   2. node scripts/migrate-firestore-to-supabase.mjs          (dry-run)
 *      FIRESTORE_TO_SUPABASE_MIGRATION=RUN node scripts/...    (execute)
 *   3. Set DATABASE_URL (Supabase Postgres connection string) and
 *      FORECAST_STORE=supabase in every runtime (backend server, Vercel
 *      project env, weekly workflow).
 *   4. Verify with scripts/verify-supabase-cutover.mjs (the ADR 0002
 *      checklist as code) + the live smoke in the ADR runbook.
 *   5. Contract step: delete the firestore branch here, ./db.js and
 *      firebase-applet-config.json (per ADR 0002).
 *
 * Read-shape parity: both implementations return identical row shapes
 * (numeric fields as JS numbers, dates as 'YYYY-MM-DD' strings) so the API
 * responses stay byte-for-byte compatible across the flip.
 */

import { db, collection, getDocs, query, where, orderBy, limit, doc, writeBatch } from './db.js';
import pg from 'pg';

// pg returns `date` columns as JS Date objects (timezone-sensitive). The
// Firestore store keeps them as plain 'YYYY-MM-DD' strings — parse the OID
// 1082 (date) type as the raw string for shape parity.
pg.types.setTypeParser(1082, (val) => val);

const SUPABASE_COLUMNS = 15; // columns written per row (see INSERT below)

export function getForecastStoreMode() {
  return process.env.FORECAST_STORE === 'supabase' ? 'supabase' : 'firestore';
}

let cachedStore = null;

/** Get the active forecast store (singleton; mode fixed at first call). */
export function getForecastStore() {
  if (!cachedStore) {
    cachedStore = getForecastStoreMode() === 'supabase' ? createSupabaseStore() : createFirestoreStore();
  }
  return cachedStore;
}

/** Test/maintenance hook: drop the cached store so env changes take effect. */
export function resetForecastStore() {
  cachedStore = null;
}

// ─────────────────────────────────────────────────────────────────────────
// Firestore implementation (legacy, pre-cutover)
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

    /** All rows with from <= prediction_date <= to (optionally filtered by
     *  horizon / district), sorted by prediction_date asc, district_id asc —
     *  the history API's backing query (backlog #6). 'YYYY-MM-DD' strings
     *  compare lexicographically == chronologically. */
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

// ─────────────────────────────────────────────────────────────────────────
// Supabase (Postgres) implementation — ADR 0002 target
// ─────────────────────────────────────────────────────────────────────────

let cachedPool = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('[forecastStore] FORECAST_STORE=supabase but DATABASE_URL is not set (Supabase Postgres connection string).');
  }
  if (!cachedPool) {
    cachedPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.SUPABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
    cachedPool.on('error', (err) => console.error('[forecastStore] idle pg client error:', err.message));
  }
  return cachedPool;
}

/** Coerce a pg row into the Firestore-compatible API shape. */
function toApiRow(r) {
  if (!r) return r;
  const row = {
    district_id: Number.isFinite(Number(r.district_id)) ? Number(r.district_id) : r.district_id,
    district_name: r.district_name,
    horizon: r.horizon,
    hazard_type: r.hazard_type,
    severity_score: Number(r.severity_score),
    confidence: Number(r.confidence),
    target_date: String(r.target_date).slice(0, 10),
    prediction_date: String(r.prediction_date).slice(0, 10),
  };
  if (r.model_severity !== null && r.model_severity !== undefined) row.model_severity = Number(r.model_severity);
  if (r.physics_severity !== null && r.physics_severity !== undefined) row.physics_severity = Number(r.physics_severity);
  if (r.division) row.division = r.division;
  if (r.pcode) row.pcode = r.pcode;
  if (r.admin_level !== null && r.admin_level !== undefined) row.admin_level = Number(r.admin_level);
  if (r.adm2_name) row.adm2_name = r.adm2_name;
  if (r.adm2_pcode) row.adm2_pcode = r.adm2_pcode;
  if (r.model_version) row.model_version = r.model_version;
  if (r.created_at) row.created_at = new Date(r.created_at).toISOString();
  return row;
}

/** Build one multi-row INSERT with ON CONFLICT upsert semantics. */
async function insertRows(client, rows) {
  if (rows.length === 0) return;
  const values = [];
  const params = [];
  rows.forEach((row, i) => {
    const base = i * SUPABASE_COLUMNS;
    values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`);
    params.push(
      String(row.district_id),
      row.district_name,
      row.horizon,
      row.hazard_type,
      Number(row.confidence),
      Number(row.severity_score),
      String(row.target_date).slice(0, 10),
      String(row.prediction_date).slice(0, 10),
      row.model_severity !== undefined && row.model_severity !== null ? Number(row.model_severity) : null,
      row.physics_severity !== undefined && row.physics_severity !== null ? Number(row.physics_severity) : null,
      row.division || null,
      row.pcode || null,
      row.admin_level !== undefined && row.admin_level !== null ? Number(row.admin_level) : null,
      row.adm2_name || null,
      row.adm2_pcode || null
    );
  });
  await client.query(
    `insert into public.forecasts
       (district_id, district_name, horizon, hazard_type, confidence, severity_score,
        target_date, prediction_date, model_severity, physics_severity, division, pcode,
        admin_level, adm2_name, adm2_pcode)
     values ${values.join(',')}
     on conflict (district_id, horizon, hazard_type, target_date, prediction_date)
     do update set
       district_name    = excluded.district_name,
       confidence       = excluded.confidence,
       severity_score   = excluded.severity_score,
       model_severity   = excluded.model_severity,
       physics_severity = excluded.physics_severity,
       division         = excluded.division,
       pcode            = excluded.pcode,
       admin_level      = excluded.admin_level,
       adm2_name        = excluded.adm2_name,
       adm2_pcode       = excluded.adm2_pcode`,
    params
  );
}

function createSupabaseStore() {
  return {
    mode: 'supabase',

    async getLatestForecastByDistrict(districtId, horizon) {
      const { rows } = await getPool().query(
        `select * from public.forecasts
         where district_id = $1 and horizon = $2
         order by prediction_date desc
         limit 1`,
        [String(districtId), horizon]
      );
      return rows.length ? toApiRow(rows[0]) : null;
    },

    async getLatestForecastsByHorizon(horizon) {
      const { rows } = await getPool().query(
        `select distinct on (district_id) *
         from public.forecasts
         where horizon = $1
         order by district_id, prediction_date desc`,
        [horizon]
      );
      return rows.map(toApiRow);
    },

    /** Newest prediction_date across all horizons ('YYYY-MM-DD' | null). */
    async getLatestPredictionDate() {
      const { rows } = await getPool().query(
        'select max(prediction_date) as latest from public.forecasts'
      );
      const latest = rows[0] && rows[0].latest;
      return latest ? String(latest).slice(0, 10) : null;
    },

    /** All rows with from <= prediction_date <= to (optionally filtered by
     *  horizon / district), ascending — the history API's backing query
     *  (backlog #6). Same shape as the other readers (toApiRow). */
    async getForecastHistory({ from, to, horizon, districtId } = {}) {
      const params = [from, to];
      let sql = 'select * from public.forecasts where prediction_date >= $1 and prediction_date <= $2';
      if (horizon) {
        params.push(horizon);
        sql += ` and horizon = $${params.length}`;
      }
      if (districtId !== undefined && districtId !== null) {
        params.push(String(districtId));
        sql += ` and district_id = $${params.length}`;
      }
      sql += ' order by prediction_date asc, district_id asc';
      const { rows } = await getPool().query(sql, params);
      return rows.map(toApiRow);
    },

    async replaceForecastsForPredictionDate(predictionDate, rows) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('delete from public.forecasts where prediction_date = $1', [
          String(predictionDate).slice(0, 10),
        ]);
        await insertRows(client, rows);
        await client.query('commit');
        return { written: rows.length };
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },

    async appendForecasts(rows) {
      await insertRows(getPool(), rows);
      return { written: rows.length };
    },
  };
}
