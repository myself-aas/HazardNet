/**
 * advisoryPipeline.test.js
 *
 * Unit and integration tests for Phase A:
 * - TASK-002: backend/utils/advisoryMapper.js
 * - TASK-003: scripts/validate_advisory_csv.mjs
 *
 * Runs via both `node --test` and Jest.
 */

import assert from 'node:assert';
import * as nodeTest from 'node:test';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;
import {
  ADVISORY_CSV_COLUMNS,
  DISTRICT_REGISTRY,
  lookupDistrict,
  mapAdvisoryRow,
  mapAdvisoryRows,
  forecastRowsToCsv,
} from '../backend/utils/advisoryMapper.js';
import { validateAdvisoryCsv } from '../scripts/validate_advisory_csv.mjs';
import { resolveCanonicalModelVersion } from '../scripts/process_advisory_ingest.mjs';
import { buildFreshnessArtifact } from '../scripts/build_freshness_artifact.mjs';
import { rehearseAlertEngine } from '../scripts/rehearse_alert_engine.mjs';

/**
 * Generate a synthetic 128-row valid CSV for testing.
 */
function makeValidSampleAdvisoryCsv(overrides = {}) {
  const generatedAt = overrides.generated_at || new Date().toISOString();
  const targetDate = overrides.target_date || '2026-10-05';
  const lines = [ADVISORY_CSV_COLUMNS.join(',')];

  for (const district of DISTRICT_REGISTRY) {
    for (const horizon of ['7_days', '15_days']) {
      const row = [
        overrides.district || district.district_name,
        district.division,
        district.latitude,
        district.longitude,
        overrides.horizon || horizon,
        overrides.hazard || 'Flood',
        overrides.confidence ?? 0.88,
        overrides.cnn_severity_raw ?? 0.72,
        overrides.cnn_severity ?? 0.75,
        overrides.physics_severity ?? 0.70,
        overrides.final_severity ?? 0.74,
        overrides.physics_override ?? 'false',
        overrides.advisory_tier || 'WARNING',
        targetDate,
        generatedAt,
        overrides.om_max_temp_c ?? 32.5,
        overrides.om_min_temp_c ?? 24.1,
        overrides.om_precip_mm ?? 45.2,
        overrides.om_wind_kmh ?? 18.5,
        overrides.prob_top1 ?? 0.88,
        overrides.prob_top2 ?? 0.08,
        overrides.prob_top3 ?? 0.04,
      ];
      lines.push(row.join(','));
    }
  }

  return lines.join('\n');
}

describe('TASK-002: advisoryMapper.js', () => {
  test('lookupDistrict resolves all 64 districts correctly', () => {
    assert.strictEqual(DISTRICT_REGISTRY.length, 64, 'Registry must contain 64 districts');

    for (const district of DISTRICT_REGISTRY) {
      const found = lookupDistrict(district.district_name);
      assert.ok(found, `District ${district.district_name} must be found`);
      assert.strictEqual(found.district_id, district.district_id);
      assert.strictEqual(found.pcode, district.pcode);
      assert.strictEqual(found.division, district.division);
    }
  });

  test('lookupDistrict handles legacy and alternate aliases', () => {
    // Jessore -> Jashore
    const jessore = lookupDistrict('Jessore');
    assert.ok(jessore);
    assert.strictEqual(jessore.district_name, 'Jashore');
    assert.strictEqual(jessore.pcode, '5797');

    // Comilla -> Cumilla
    const comilla = lookupDistrict('Comilla');
    assert.ok(comilla);
    assert.strictEqual(comilla.district_name, 'Cumilla');
    assert.strictEqual(comilla.pcode, '5771');

    // Barisal -> Barishal
    const barisal = lookupDistrict('Barisal');
    assert.ok(barisal);
    assert.strictEqual(barisal.district_name, 'Barishal');

    // Chittagong -> Chattogram
    const chittagong = lookupDistrict('Chittagong');
    assert.ok(chittagong);
    assert.strictEqual(chittagong.district_name, 'Chattogram');

    // Cox's Bazar aliases
    const coxsbazar = lookupDistrict('coxsbazar');
    assert.ok(coxsbazar);
    assert.strictEqual(coxsbazar.district_name, "Cox's Bazar");
  });

  test('mapAdvisoryRow maps all 22 columns per TRD §2.2', () => {
    const rawRow = {
      district: 'Jessore',
      division: 'Khulna',
      latitude: '23.1664',
      longitude: '89.2081',
      horizon: '7_days',
      hazard: 'Drought',
      confidence: '0.85',
      cnn_severity_raw: '0.62',
      cnn_severity: '0.65',
      physics_severity: '0.70',
      final_severity: '0.68',
      physics_override: 'true',
      advisory_tier: 'WARNING',
      target_date: '2026-10-02',
      generated_at: '2026-09-30T04:00:00Z',
      om_max_temp_c: '35.2',
      om_min_temp_c: '26.0',
      om_precip_mm: '2.5',
      om_wind_kmh: '12.0',
      prob_top1: '0.85',
      prob_top2: '0.10',
      prob_top3: '0.05',
    };

    const mapped = mapAdvisoryRow(rawRow);

    assert.strictEqual(mapped.district_name, 'Jashore');
    assert.strictEqual(mapped.pcode, '5797');
    assert.strictEqual(mapped.district_id, 41);
    assert.strictEqual(mapped.division, 'Khulna');
    assert.strictEqual(mapped.horizon, '7_days');
    assert.strictEqual(mapped.hazard_type, 'Drought');
    assert.strictEqual(mapped.advisory_tier, 'WARNING'); // Preserved verbatim
    assert.strictEqual(mapped.severity_score, 0.68); // Assigned from final_severity
    assert.strictEqual(mapped.final_severity, 0.68);
    assert.strictEqual(mapped.model_severity, 0.65);
    assert.strictEqual(mapped.model_severity_raw, 0.62);
    assert.strictEqual(mapped.physics_severity, 0.70);
    assert.strictEqual(mapped.physics_override, true);
    assert.strictEqual(mapped.confidence, 0.85);
    assert.strictEqual(mapped.target_date, '2026-10-02');
    assert.strictEqual(mapped.prediction_date, '2026-09-30');
    assert.strictEqual(mapped.temperature_max, 35.2);
    assert.strictEqual(mapped.temperature_min, 26.0);
    assert.strictEqual(mapped.precipitation_mm, 2.5);
    assert.strictEqual(mapped.wind_max_kmh, 12.0);
    assert.strictEqual(mapped.prob_top1, 0.85);
    assert.strictEqual(mapped.prob_top2, 0.10);
    assert.strictEqual(mapped.prob_top3, 0.05);
    assert.strictEqual(mapped.data_source, 'Kaggle_Daily_Advisory');
  });

  test('mapAdvisoryRows maps 128 rows correctly and produces valid CSV', () => {
    const csvContent = makeValidSampleAdvisoryCsv();
    const rows = csvContent.split('\n').slice(1).map((line) => {
      const parts = line.split(',');
      return Object.fromEntries(ADVISORY_CSV_COLUMNS.map((col, idx) => [col, parts[idx]]));
    });

    assert.strictEqual(rows.length, 128);
    const mapped = mapAdvisoryRows(rows);
    assert.strictEqual(mapped.length, 128);

    const outCsv = forecastRowsToCsv(mapped);
    assert.ok(outCsv.includes('district_id,district_name,division,pcode'));
    assert.strictEqual(outCsv.trim().split('\n').length, 129); // Header + 128 rows
  });
});

describe('TASK-003: validate_advisory_csv.mjs', () => {
  test('validates a correct 128-row CSV successfully', () => {
    const csvContent = makeValidSampleAdvisoryCsv();
    const result = validateAdvisoryCsv(csvContent);

    assert.strictEqual(result.valid, true, `Validation failed: ${result.errors.join('; ')}`);
    assert.strictEqual(result.summary.totalRows, 128);
    assert.strictEqual(result.summary.columnsCount, 22);
    assert.strictEqual(result.summary.districtCount, 64);
  });

  test('fails when column count or headers are incorrect', () => {
    const wrongHeaders = 'district,division,latitude,longitude,horizon\nBogura,Rajshahi,24.8,89.3,7_days';
    const result = validateAdvisoryCsv(wrongHeaders);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid column count')));
    assert.ok(result.errors.some((e) => e.includes('Missing required column')));
  });

  test('fails when row count is not 128', () => {
    const csvContent = makeValidSampleAdvisoryCsv();
    const truncated = csvContent.split('\n').slice(0, 100).join('\n');
    const result = validateAdvisoryCsv(truncated);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid row count')));
  });

  test('fails when district horizon coverage is incomplete', () => {
    // Generate CSV where all rows have horizon=7_days
    const csvContent = makeValidSampleAdvisoryCsv({ horizon: '7_days' });
    const result = validateAdvisoryCsv(csvContent);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('missing complete horizon coverage')));
  });

  test('fails when advisory_tier is invalid', () => {
    const csvContent = makeValidSampleAdvisoryCsv({ advisory_tier: 'CRITICAL_ALERT' });
    const result = validateAdvisoryCsv(csvContent);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid advisory_tier "CRITICAL_ALERT"')));
  });

  test('fails when hazard is not one of 8 classes', () => {
    const csvContent = makeValidSampleAdvisoryCsv({ hazard: 'Tsunami' });
    const result = validateAdvisoryCsv(csvContent);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid hazard "Tsunami"')));
  });

  test('staleness guard rejects timestamps older than 36 hours', () => {
    const oldDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const csvContent = makeValidSampleAdvisoryCsv({ generated_at: oldDate });

    // With allowStale=false (default)
    const result = validateAdvisoryCsv(csvContent, { maxAgeHours: 36, allowStale: false });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('STALE_DATA')));

    // With allowStale=true
    const resultAllowed = validateAdvisoryCsv(csvContent, { maxAgeHours: 36, allowStale: true });
    assert.strictEqual(resultAllowed.valid, true);
    assert.strictEqual(resultAllowed.summary.isStale, true);
  });
});

describe('Phase A End-to-End Pipeline & Snapshot Integration (TRD §4.4, §4.5)', () => {
  test('mapped CSV builds snapshot carrying advisory_tier and physics_override', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const crypto = await import('node:crypto');
    const { execSync } = await import('node:child_process');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hazardnet-test-'));
    const advisoryCsvPath = path.join(tempDir, 'advisory.csv');
    const mappedCsvPath = path.join(tempDir, 'mapped_forecasts.csv');
    const snapshotJsonPath = path.join(tempDir, 'forecasts-latest.json');
    const manifestJsonPath = path.join(tempDir, 'manifest.json');

    try {
      const generatedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      // 1. Generate & Validate sample advisory CSV
      const rawCsv = makeValidSampleAdvisoryCsv({ generated_at: generatedAt, physics_override: 'true', advisory_tier: 'SEVERE' });
      fs.writeFileSync(advisoryCsvPath, rawCsv, 'utf8');

      const validation = validateAdvisoryCsv(rawCsv);
      assert.strictEqual(validation.valid, true);

      // 2. Map advisory CSV -> ForecastRow CSV
      const parsedRows = rawCsv.split('\n').slice(1).map((line) => {
        const parts = line.split(',');
        return Object.fromEntries(ADVISORY_CSV_COLUMNS.map((col, idx) => [col, parts[idx]]));
      });
      const mapped = mapAdvisoryRows(parsedRows);
      const mappedCsv = forecastRowsToCsv(mapped);
      fs.writeFileSync(mappedCsvPath, mappedCsv, 'utf8');

      // 3. Create Manifest (TRD §4.4)
      const csvSha256 = crypto.createHash('sha256').update(mappedCsv).digest('hex');
      const manifest = {
        prediction_date: mapped[0].prediction_date,
        row_count: mapped.length,
        csv_sha256: csvSha256,
        data_source: 'Kaggle_Daily_Advisory',
        generated_at: new Date().toISOString(),
      };
      fs.writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 2), 'utf8');

      assert.strictEqual(manifest.row_count, 128);
      assert.strictEqual(manifest.prediction_date, mapped[0].prediction_date);
      assert.strictEqual(manifest.prediction_date, generatedAt.slice(0, 10));
      assert.ok(manifest.csv_sha256.length === 64);

      // 4. Build Static Snapshot (TRD §4.5)
      execSync(`node scripts/build_forecast_snapshot.mjs "${mappedCsvPath}" "${snapshotJsonPath}"`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      assert.ok(fs.existsSync(snapshotJsonPath), 'Snapshot JSON must exist');
      const snapshot = JSON.parse(fs.readFileSync(snapshotJsonPath, 'utf8'));

      assert.ok(snapshot.horizons['7_days'], 'Must contain 7_days horizon');
      assert.ok(snapshot.horizons['15_days'], 'Must contain 15_days horizon');
      assert.strictEqual(snapshot.horizons['7_days'].length, 64);
      assert.strictEqual(snapshot.horizons['15_days'].length, 64);

      // Assert all rows have advisory_tier and physics_override
      for (const horizon of ['7_days', '15_days']) {
        for (const row of snapshot.horizons[horizon]) {
          assert.strictEqual(row.advisory_tier, 'SEVERE', 'advisory_tier must be preserved in snapshot');
          assert.strictEqual(row.physics_override, true, 'physics_override must be preserved in snapshot');
          assert.ok(row.final_severity !== undefined, 'final_severity must be present in snapshot');
        }
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Phase 2: stamps Models/VERSION.json provenance across CSV -> Snapshot -> Alert Rehearsal -> Freshness Artifact', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const crypto = await import('node:crypto');
    const { execSync } = await import('node:child_process');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hazardnet-phase2-provenance-'));
    try {
      const versionDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'Models', 'VERSION.json'), 'utf8'));
      const expectedVersion = resolveCanonicalModelVersion(process.cwd());
      assert.strictEqual(expectedVersion, versionDoc.version);
      assert.strictEqual(expectedVersion, '2.1.9+model.0bb5bdaf1789');

      const generatedAt = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
      const inputCsvPath = path.join(tempDir, 'input_advisories.csv');
      const mappedCsvPath = path.join(tempDir, 'hazardnet_forecasts_latest.csv');
      const manifestJsonPath = path.join(tempDir, 'manifest.json');
      const snapshotJsonPath = path.join(tempDir, 'forecasts-latest.json');
      const alertRunJsonPath = path.join(tempDir, 'alert-run.json');
      const alertSnapshotJsonPath = path.join(tempDir, 'alerts-latest.json');

      const sampleCsv = makeValidSampleAdvisoryCsv({
        advisory_tier: 'SEVERE',
        physics_override: 'true',
        generated_at: generatedAt,
      });
      fs.writeFileSync(inputCsvPath, sampleCsv, 'utf8');

      const validation = validateAdvisoryCsv(sampleCsv);
      assert.strictEqual(validation.valid, true);

      const lines = sampleCsv.split('\n');
      const headers = lines[0].split(',');
      const rawRows = lines.slice(1).map((line) => {
        const parts = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, parts[i]]));
      });

      const mapped = mapAdvisoryRows(rawRows, { modelVersion: expectedVersion });
      assert.strictEqual(mapped[0].model_version, expectedVersion, 'mapAdvisoryRows must stamp model_version');

      const mappedCsv = forecastRowsToCsv(mapped);
      assert.ok(mappedCsv.split('\n')[0].includes('model_version'), 'forecastRowsToCsv header must include model_version');
      fs.writeFileSync(mappedCsvPath, mappedCsv, 'utf8');

      const csvSha256 = crypto.createHash('sha256').update(mappedCsv).digest('hex');
      const manifest = {
        prediction_date: mapped[0].prediction_date,
        row_count: mapped.length,
        csv_sha256: csvSha256,
        data_source: 'Kaggle_Daily_Advisory',
        model_version: expectedVersion,
        generated_at: generatedAt,
      };
      fs.writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 2), 'utf8');

      execSync(`node scripts/build_forecast_snapshot.mjs "${mappedCsvPath}" "${snapshotJsonPath}"`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      const snapshot = JSON.parse(fs.readFileSync(snapshotJsonPath, 'utf8'));
      assert.strictEqual(snapshot.provenance.model_version, expectedVersion, 'Snapshot provenance.model_version must match Models/VERSION.json');
      assert.strictEqual(snapshot.coverage.status, 'complete');
      assert.strictEqual(snapshot.coverage.produced_units, 128);
      assert.strictEqual(snapshot.coverage.districts_covered, 64);

      const rehearsal = await rehearseAlertEngine({
        snapshot,
        snapshotPath: snapshotJsonPath,
        now: new Date(generatedAt),
      });
      assert.strictEqual(rehearsal.rows_total, 128);
      assert.strictEqual(rehearsal.persisted.blocked, 0, 'Stamped rows must not be publication_blocked for missing model_version');
      assert.strictEqual(rehearsal.persisted.published, 128);
      fs.writeFileSync(alertRunJsonPath, JSON.stringify(rehearsal, null, 2), 'utf8');

      execSync(`node scripts/build_alert_snapshot.mjs --in "${alertRunJsonPath}" --out "${alertSnapshotJsonPath}" --allow-empty`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
      const alertSnapshot = JSON.parse(fs.readFileSync(alertSnapshotJsonPath, 'utf8'));
      assert.strictEqual(alertSnapshot.alerts.length, 128);
      assert.strictEqual(alertSnapshot.assessed, 128);
      assert.strictEqual(alertSnapshot.counts.dropped_unpublished, 0);

      const freshness = buildFreshnessArtifact({
        now: new Date(),
        snapshot,
        manifest,
        alerts: alertSnapshot,
      });
      assert.strictEqual(freshness.model.stamped, true);
      assert.strictEqual(freshness.model.model_version, expectedVersion);
      assert.strictEqual(freshness.coverage.status, 'complete');
      assert.strictEqual(freshness.coverage.produced_units, 128);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

