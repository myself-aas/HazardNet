// One-shot migration: Firestore (AI-Studio applet db) -> Supabase `forecasts`.
// ADR 0002. SAFETY: dry-run by default — add is counts only. To execute for
// real, set FIRESTORE_TO_SUPABASE_MIGRATION=RUN plus DATABASE_URL.
//
//   node scripts/migrate-firestore-to-supabase.mjs            # dry-run
//   FIRESTORE_TO_SUPABASE_MIGRATION=RUN node scripts/...      # upsert rows
//
// Requires: DATABASE_URL (Supabase Postgres connection string). Firestore
// credentials come from firebase-applet-config.json (existing backend path).
import { db, collection, getDocs } from '../backend/db.js';
import pg from 'pg';

const RUN = process.env.FIRESTORE_TO_SUPABASE_MIGRATION === 'RUN';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is required (Supabase Postgres connection string).');
  process.exit(1);
}
if (!process.env.SUPABASE_SSL && !DATABASE_URL.includes('sslmode=')) {
  process.env.SUPABASE_SSL = 'true'; // Supabase requires TLS
}

const { Client } = pg;

async function fetchFirestoreRows() {
  const snap = await getDocs(collection(db, 'forecasts'));
  const rows = [];
  snap.forEach((d) => {
    const v = d.data() || {};
    rows.push({
      district_id: String(v.district_id ?? v.districtId ?? ''),
      district_name: String(v.district_name ?? v.districtName ?? ''),
      horizon: String(v.horizon ?? ''),
      hazard_type: String(v.hazard_type ?? v.hazardType ?? ''),
      confidence: Number(v.confidence ?? NaN),
      severity_score: Number(v.severity_score ?? v.severityScore ?? NaN),
      target_date: String(v.target_date ?? v.targetDate ?? '').slice(0, 10),
      prediction_date: String(v.prediction_date ?? v.predictionDate ?? '').slice(0, 10),
      model_version: v.model_version ? String(v.model_version) : null,
    });
  });
  return rows.filter(
    (r) =>
      r.district_id &&
      ['7_days', '15_days'].includes(r.horizon) &&
      Number.isFinite(r.confidence) &&
      Number.isFinite(r.severity_score) &&
      !Number.isNaN(Date.parse(r.target_date)) &&
      !Number.isNaN(Date.parse(r.prediction_date))
  );
}

const rows = await fetchFirestoreRows();
console.log(`[migrate] fetched ${rows.length} valid forecast rows from Firestore.`);

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: process.env.SUPABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
const { rows: existing } = await client.query('select count(*)::int as n from public.forecasts');
console.log(`[migrate] Supabase public.forecasts currently has ${existing[0].n} rows.`);

if (!RUN) {
  console.log('[migrate] DRY RUN — no rows written. Set FIRESTORE_TO_SUPABASE_MIGRATION=RUN to execute.');
  console.log('[migrate] sample row:', rows[0] ?? '(none)');
  await client.end();
  process.exit(0);
}

const upsert = `
  insert into public.forecasts
    (district_id, district_name, horizon, hazard_type, confidence, severity_score, target_date, prediction_date, model_version)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  on conflict (district_id, horizon, hazard_type, target_date, prediction_date)
  do update set
    district_name = excluded.district_name,
    confidence = excluded.confidence,
    severity_score = excluded.severity_score,
    model_version = excluded.model_version
`;
let written = 0;
try {
  await client.query('begin');
  for (const r of rows) {
    await client.query(upsert, [
      r.district_id, r.district_name, r.horizon, r.hazard_type,
      r.confidence, r.severity_score, r.target_date, r.prediction_date, r.model_version,
    ]);
    written++;
  }
  await client.query('commit');
  console.log(`[migrate] upserted ${written} rows into Supabase.`);
} catch (err) {
  await client.query('rollback');
  console.error('[migrate] failed, rolled back:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
