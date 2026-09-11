// One-shot migration: Firestore (AI-Studio applet db) -> Supabase `forecasts`.
// ADR 0002. SAFETY: dry-run by default — add is counts only. To execute for
// real, set FIRESTORE_TO_SUPABASE_MIGRATION=RUN plus DATABASE_URL.
//
//   node scripts/migrate-firestore-to-supabase.mjs            # dry-run
//   FIRESTORE_TO_SUPABASE_MIGRATION=RUN node scripts/...      # upsert rows
//
// Requires: DATABASE_URL (Supabase Postgres connection string). Firestore
// credentials come from firebase-applet-config.json (existing backend path).
//
// Horizon note (ADR 0005): the Supabase CHECK constraint accepts
// 10/20/30-day horizons only. Legacy 7/15-era Firestore rows — if any exist —
// are SKIPPED and reported, not migrated (they belong to the retired era and
// the pipeline has never successfully written; the store is expected empty).
// Schema verification: run scripts/verify-supabase-cutover.mjs first.
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

const VALID_HORIZONS = ['10_days', '20_days', '30_days']; // ADR 0005
const LEGACY_HORIZONS = ['7_days', '15_days'];           // retired era

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
      // Dual-track severity + admin context (weekly Kaggle CSV shape).
      model_severity: Number.isFinite(Number(v.model_severity)) ? Number(v.model_severity) : null,
      physics_severity: Number.isFinite(Number(v.physics_severity)) ? Number(v.physics_severity) : null,
      division: v.division ? String(v.division) : null,
      pcode: v.pcode ? String(v.pcode) : null,
      // ADM3 identity (ADR 0005) — passthrough when present.
      admin_level: Number.isInteger(Number(v.admin_level)) ? Number(v.admin_level) : null,
      adm2_name: v.adm2_name ? String(v.adm2_name) : null,
      adm2_pcode: v.adm2_pcode ? String(v.adm2_pcode) : null,
    });
  });

  const valid = [];
  const skipped = { legacyHorizon: 0, invalid: 0 };
  for (const r of rows) {
    if (LEGACY_HORIZONS.includes(r.horizon)) {
      skipped.legacyHorizon++;
    } else if (
      r.district_id &&
      VALID_HORIZONS.includes(r.horizon) &&
      Number.isFinite(r.confidence) &&
      Number.isFinite(r.severity_score) &&
      !Number.isNaN(Date.parse(r.target_date)) &&
      !Number.isNaN(Date.parse(r.prediction_date))
    ) {
      valid.push(r);
    } else {
      skipped.invalid++;
    }
  }
  return { valid, skipped, total: rows.length };
}

const { valid: rows, skipped, total } = await fetchFirestoreRows();
console.log(`[migrate] fetched ${total} forecast rows from Firestore: ${rows.length} valid, ${skipped.legacyHorizon} legacy-horizon (7/15-era, skipped — ADR 0005), ${skipped.invalid} invalid.`);

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
  if (skipped.legacyHorizon > 0) {
    console.log(`[migrate] NOTE: ${skipped.legacyHorizon} legacy 7/15-era rows exist in Firestore and will NOT be migrated (retired horizons, ADR 0005).`);
  }
  await client.end();
  process.exit(0);
}

const upsert = `
  insert into public.forecasts
    (district_id, district_name, horizon, hazard_type, confidence, severity_score,
     target_date, prediction_date, model_version, model_severity, physics_severity, division, pcode,
     admin_level, adm2_name, adm2_pcode)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
  on conflict (district_id, horizon, hazard_type, target_date, prediction_date)
  do update set
    district_name = excluded.district_name,
    confidence = excluded.confidence,
    severity_score = excluded.severity_score,
    model_version = excluded.model_version,
    model_severity = excluded.model_severity,
    physics_severity = excluded.physics_severity,
    division = excluded.division,
    pcode = excluded.pcode,
    admin_level = excluded.admin_level,
    adm2_name = excluded.adm2_name,
    adm2_pcode = excluded.adm2_pcode
`;
let written = 0;
try {
  await client.query('begin');
  for (const r of rows) {
    await client.query(upsert, [
      r.district_id, r.district_name, r.horizon, r.hazard_type,
      r.confidence, r.severity_score, r.target_date, r.prediction_date, r.model_version,
      r.model_severity, r.physics_severity, r.division, r.pcode,
      r.admin_level, r.adm2_name, r.adm2_pcode,
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
