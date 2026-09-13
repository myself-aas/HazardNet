// Supabase cutover verification (ADR 0002 checklist runner — ops step).
//
//   DATABASE_URL='postgresql://...' node scripts/verify-supabase-cutover.mjs
//
// Verifies, against the target Supabase Postgres:
//   1. connectivity (TLS per SUPABASE_SSL)
//   2. public.forecasts exists with the full 15-column schema (ADR 0005:
//      incl. admin_level / adm2_name / adm2_pcode)
//   3. horizon CHECK constraint = 7/15 days (ADR 0008 canonical set;
//      the aspirational 10/20/30 must be absent)
//   4. unique upsert key (district_id, horizon, hazard_type, target_date, prediction_date)
//   5. serving indexes (district, dates, horizon+prediction_date desc)
//   6. RLS enabled + public-read policy
//   7. informational: row count, per-horizon breakdown, latest prediction_date
//
// Exit 0 = all checks pass; 1 = any failure (with a report of what failed).
// Run AFTER applying scripts/db/002_forecasts_supabase.sql (idempotent).
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[verify] DATABASE_URL is required (Supabase Postgres connection string).');
  process.exit(1);
}

const EXPECTED_COLUMNS = [
  'id', 'district_id', 'district_name', 'horizon', 'hazard_type',
  'confidence', 'severity_score', 'target_date', 'prediction_date',
  'model_version', 'model_severity', 'physics_severity', 'division', 'pcode',
  'admin_level', 'adm2_name', 'adm2_pcode', 'created_at',
];
const EXPECTED_HORIZONS = ['7_days', '15_days']; // ADR 0008 canonical set

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: process.env.SUPABASE_SSL === 'true' || DATABASE_URL.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : undefined,
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  await client.connect();
  check('connectivity (TLS)', true);

  const { rows: colRows } = await client.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'forecasts'`
  );
  const cols = colRows.map((r) => r.column_name);
  check('table public.forecasts exists', cols.length > 0, cols.length ? `${cols.length} columns` : 'not found');
  const missing = EXPECTED_COLUMNS.filter((c) => !cols.includes(c));
  check('15-column ADR 0005 schema', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : 'admin_level/adm2_name/adm2_pcode present');

  const { rows: checkRows } = await client.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = 'public.forecasts'::regclass and contype = 'c' and conname = 'forecasts_horizon_check'`
  );
  const def = checkRows[0]?.def ?? '';
  const allPresent = EXPECTED_HORIZONS.every((h) => def.includes(h));
  const aspirationalAbsent = !def.includes('10_days') && !def.includes('20_days') && !def.includes('30_days');
  check('horizon CHECK = 7/15 (ADR 0008)', allPresent && aspirationalAbsent, def || 'constraint not found');

  const { rows: uniqRows } = await client.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = 'public.forecasts'::regclass and contype = 'u'`
  );
  check('unique upsert key (district, horizon, hazard, target, prediction)',
    uniqRows.some((r) => r.def.includes('district_id') && r.def.includes('horizon')
      && r.def.includes('hazard_type') && r.def.includes('target_date') && r.def.includes('prediction_date')),
    uniqRows[0]?.def ?? 'none');

  const { rows: idxRows } = await client.query(
    `select indexname from pg_indexes where schemaname = 'public' and tablename = 'forecasts'`
  );
  const idx = new Set(idxRows.map((r) => r.indexname));
  for (const name of ['forecasts_district_idx', 'forecasts_dates_idx', 'forecasts_horizon_idx']) {
    check(`index ${name}`, idx.has(name));
  }

  const { rows: rlsRows } = await client.query(
    `select relrowsecurity from pg_class where oid = 'public.forecasts'::regclass`
  );
  check('RLS enabled', rlsRows[0]?.relrowsecurity === true);

  const { rows: polRows } = await client.query(
    `select policyname from pg_policies where schemaname = 'public' and tablename = 'forecasts'`
  );
  check('public-read policy', polRows.some((r) => r.policyname === 'forecasts_public_read'),
    polRows.map((r) => r.policyname).join(', ') || 'no policies');

  // Informational (never fails the run): current contents.
  const { rows: countRows } = await client.query(
    'select horizon, count(*)::int as n from public.forecasts group by horizon order by horizon'
  );
  const total = countRows.reduce((s, r) => s + r.n, 0);
  const { rows: latestRows } = await client.query('select max(prediction_date) as latest from public.forecasts');
  console.log(`ℹ️  rows: ${total} ${countRows.map((r) => `(${r.horizon}: ${r.n})`).join(' ') || '(empty)'} | latest prediction_date: ${latestRows[0].latest ?? '—'}`);
} catch (err) {
  check('connection / query', false, err.message);
} finally {
  await client.end().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[verify] ${results.length - failed.length}/${results.length} checks passed${failed.length ? ' — see ❌ above' : ' — READY for the cutover flip'}`);
process.exit(failed.length ? 1 : 0);
