/**
 * The pipeline stamps the tier — integration, through the real builder.
 *
 * The unit tests for the bands live in `advisoryTierBands.test.js`. This file runs
 * `scripts/build_forecast_snapshot.mjs` the way the daily job does, over small CSVs, and checks
 * what lands in the artifact: a stamped tier on every row that has a score, its provenance, the
 * review flag above the ceiling, and the descriptor block that records the bands in force.
 *
 * The last test runs the builder over the *committed* CSV and compares with the *committed*
 * artifact, because the thing that actually ships is the file in `frontend/public/data`: a
 * builder that stamps correctly while the artifact on disk was hand-edited would pass every
 * other test here and still show a reader a tier nobody cut.
 */

import assert from 'node:assert';
import * as nodeTest from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;

const ROOT = process.cwd();
const ARTIFACT = join(ROOT, 'frontend/public/data/forecasts-latest.json');
const SOURCE_CSV = join(ROOT, 'backend/data/forecasts/hazardnet_forecasts_latest.csv');

const HEADER =
  'district_id,district_name,division,pcode,horizon,hazard_type,model_severity,physics_severity,'
  + 'confidence,final_severity,advisory_tier,target_date,prediction_date,data_source';

/** One CSV row with the columns the builder reads. Empty cells are `''`, as a real CSV writes them. */
function row({
  district_id = 1,
  district_name = 'Bagerhat',
  horizon = '7_days',
  hazard_type = 'Flash Flood',
  model_severity = '',
  physics_severity = '0.2',
  confidence = '0.9',
  final_severity = '',
  advisory_tier = '',
  target_date = '2026-10-10',
  prediction_date = '2026-10-03',
} = {}) {
  return [
    district_id, district_name, 'Khulna', '5795', horizon, hazard_type, model_severity,
    physics_severity, confidence, final_severity, advisory_tier, target_date, prediction_date,
    'Hybrid_Cognitive_Forecast',
  ].join(',');
}

/** Run the real builder over a CSV file and return the parsed artifact. */
function buildFromFile(csvPath) {
  const dir = mkdtempSync(join(tmpdir(), 'tier-stamp-'));
  try {
    const out = join(dir, 'out.json');
    execFileSync('node', ['scripts/build_forecast_snapshot.mjs', csvPath, out], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Synthetic rows, written under the same header the builder reads.
 *
 * Every row must carry a severity the builder accepts (`severity_score` or `model_severity`) or
 * it is dropped before the stamp — which is the builder's own rule, asserted separately below.
 */
function build(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'tier-stamp-'));
  try {
    const csv = join(dir, 'in.csv');
    writeFileSync(csv, [HEADER, ...rows].join('\n') + '\n', 'utf8');
    return buildFromFile(csv);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const allRows = (snapshot) => Object.values(snapshot.horizons).flat();

describe('the snapshot builder stamps advisory_tier', () => {
  test('cuts the tier from final_severity when the merge produced one', () => {
    const snapshot = build([
      // model_severity is deliberately on the wrong side of the band in every row: if the stamp
      // read the model's own score instead of the blend, all four tiers would be wrong.
      row({ final_severity: '0.91', model_severity: '0.40' }),
      row({ district_id: 2, district_name: 'Khulna', final_severity: '0.72', model_severity: '0.95' }),
      row({ district_id: 3, district_name: 'Satkhira', final_severity: '0.41', model_severity: '0.10' }),
      row({ district_id: 4, district_name: 'Bagerhat', final_severity: '0.12', model_severity: '0.99' }),
    ]);
    assert.deepStrictEqual(
      allRows(snapshot).map((r) => r.advisory_tier),
      ['SEVERE', 'WARNING', 'WATCH', 'NORMAL'],
    );
    // The blend wins over the model's own score, and the row says so.
    assert.strictEqual(allRows(snapshot)[1].advisory_tier_source, 'derived_final_severity');
  });

  test('falls back to severity_score when there is no blend', () => {
    const snapshot = build([row({ model_severity: '0.88' })]);
    const [first] = allRows(snapshot);
    assert.strictEqual(first.advisory_tier, 'SEVERE');
    assert.strictEqual(first.advisory_tier_source, 'derived_severity_score');
  });

  test('an upstream tier wins over any derivation', () => {
    // The Kaggle advisory CSV publishes its own tier; the mapper validates it, so it is the
    // pipeline's decision and not ours to recompute — even when the severity disagrees.
    const snapshot = build([row({ advisory_tier: 'WATCH', final_severity: '0.99', model_severity: '0.99' })]);
    const [first] = allRows(snapshot);
    assert.strictEqual(first.advisory_tier, 'WATCH');
    assert.strictEqual(first.advisory_tier_source, 'published');
  });

  test('marks the tiers that need a duty officer, and only those', () => {
    const snapshot = build([
      row({ final_severity: '0.9', model_severity: '0.9' }),
      row({ district_id: 2, district_name: 'Khulna', final_severity: '0.75', model_severity: '0.75' }),
      row({ district_id: 3, district_name: 'Satkhira', final_severity: '0.5', model_severity: '0.5' }),
      row({ district_id: 4, district_name: 'Bagerhat', final_severity: '0.2', model_severity: '0.2' }),
    ]);
    assert.deepStrictEqual(allRows(snapshot).map((r) => r.requires_review), [true, true, false, false]);
  });

  test('a row with no score at all is dropped rather than stamped NORMAL', () => {
    // The builder already refuses a row with neither `severity_score` nor `model_severity`
    // ("No valid forecast rows could be parsed"), so nothing can invent a NORMAL tier for a
    // district that was never scored. Asserted because the temptation is to default it.
    assert.throws(() => build([row({ model_severity: '', final_severity: '' })]), /Command failed/);
  });

  test('writes the bands into the artifact, so the rule travels with the data', () => {
    const snapshot = build([row({ final_severity: '0.5', model_severity: '0.5' })]);
    assert.deepStrictEqual(snapshot.advisory_policy.bands, { SEVERE: 0.85, WARNING: 0.7, WATCH: 0.4 });
    assert.strictEqual(snapshot.advisory_policy.auto_publish_ceiling, 'WATCH');
    assert.deepStrictEqual(snapshot.advisory_policy.source_fields, ['final_severity', 'severity_score']);
  });
});

describe('the committed artifact carries the stamp', () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));

  test('every row has a tier, a source and a review flag', () => {
    const rows = allRows(artifact);
    assert.ok(rows.length > 0, 'committed snapshot has no rows');
    for (const r of rows) {
      assert.match(r.advisory_tier, /^(SEVERE|WARNING|WATCH|NORMAL)$/, `${r.district_name}: ${r.advisory_tier}`);
      assert.match(r.advisory_tier_source, /^(published|derived_final_severity|derived_severity_score)$/);
      assert.strictEqual(typeof r.requires_review, 'boolean');
      // The flag must agree with the tier it describes.
      assert.strictEqual(r.requires_review, r.advisory_tier === 'SEVERE' || r.advisory_tier === 'WARNING');
    }
    assert.deepStrictEqual(artifact.advisory_policy.bands, { SEVERE: 0.85, WARNING: 0.7, WATCH: 0.4 });
  });

  test('rebuilding from the committed CSV reproduces the committed rows, tier included', () => {
    // The file itself, not a re-assembled copy: the builder reads by header name, so a CSV
    // rewritten under a different column order would prove nothing.
    const rebuilt = buildFromFile(SOURCE_CSV);
    const strip = (r) => {
      const { advisory_tier, advisory_tier_source, requires_review, ...rest } = r;
      return rest;
    };
    assert.strictEqual(allRows(rebuilt).length, allRows(artifact).length);
    // Row-for-row identical apart from the stamp, which is what this change added.
    assert.deepStrictEqual(allRows(rebuilt).map(strip), allRows(artifact).map(strip));
    assert.deepStrictEqual(
      allRows(rebuilt).map((r) => [r.advisory_tier, r.requires_review]),
      allRows(artifact).map((r) => [r.advisory_tier, r.requires_review]),
    );
  });
});
