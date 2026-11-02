/** @jest-environment node */
import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DISTRICT_REGISTRY } from '../backend/utils/advisoryMapper.js';
import {
  DAILY_ADVISORY_SCHEMA, buildPublicDailySnapshot, deriveDailyManifestFromCsv,
  parsePublicDailySnapshot, publicDailyStatus, rollupDailySnapshotToHorizons,
  validateDailyManifest, validatePublishableDailyManifest,
} from '../backend/utils/dailyAdvisoryPublic.js';
import {
  assertNewerPublicDaily, buildPublicDailyFile, optionsFromArgs, projectDailyInput, readDailyCsv,
} from '../scripts/build_public_daily_advisories.mjs';
import { checkPublicDailyAsset } from '../scripts/check_public_daily_asset.mjs';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;
const NOW = new Date('2026-11-01T12:00:00.000Z');
const SHA = 'a'.repeat(64);
const manifest = (sha = SHA) => ({
  schema_version: '4.3-pb', run_id: 'synthetic-test-1',
  generated_at: '2026-11-01T10:00:00.000Z',
  data_cutoff: '2026-11-01T08:00:00.000Z',
  model_version: 'test-version', csv_sha256: sha,
});

const releaseFacts = (sha = SHA) => ({
  sha256: sha, copySha256: 'c'.repeat(64), filename: 'input.csv', sizeBytes: 100, rows: 960,
  columns: 12, districts: 64, firstDate: '2026-11-02', lastDate: '2026-11-16', now: NOW,
});
const issuedManifest = (sha = SHA) => ({
  manifest_version: '1.0', status: 'issued',
  artifact: {
    type: 'hazardnet_advisory_csv', filename: 'input.csv', sha256: sha,
    size_bytes: 100, rows: 960, columns: 12, district_count: 64,
    forecast_window_start: '2026-11-02', forecast_window_end: '2026-11-16',
  },
  run: {
    run_id: 'synthetic-test-1', pipeline_version: 'synthetic-v1',
    schema_version: '4.3-pb', model_version: 'test-version',
    started_at_utc: '2026-11-01T09:00:00.000Z',
    completed_at_utc: '2026-11-01T10:00:00.000Z',
    data_cutoff_utc: '2026-11-01T08:00:00.000Z', time_zone: 'UTC',
  },
  issuer: {
    issued_by: 'Synthetic project owner', role: 'project_owner',
    issued_at_utc: '2026-11-01T11:30:00.000Z',
  },
  approvals: {
    release_approval: {
      status: 'approved', approved_by: 'Synthetic reviewer',
      approved_at_utc: '2026-11-01T11:00:00.000Z', scope: 'public advisory publication',
      artifact_sha256: sha,
    },
    bangla_copy_approval: {
      status: 'approved', approved_by: 'Synthetic copy reviewer',
      approved_at_utc: '2026-10-31T10:00:00.000Z', scope: 'Bangla farmer-facing copy',
      copy_sha256: 'c'.repeat(64),
    },
  },
  publication: { status: 'approved' },
});

function sampleRows(count = 3, { score = (day) => day === 5 ? 0.7 : 0.3, peakDay = 5 } = {}) {
  const start = Date.parse('2026-11-02T00:00:00Z');
  return DISTRICT_REGISTRY.slice(0, count).flatMap((district) =>
    Array.from({ length: 15 }, (_, index) => {
      const day = index + 1;
      return {
        district: district.district_name,
        forecast_day: String(day),
        target_date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
        hazard: 'Flood', advisory_tier: 'WATCH', severity_score: String(score(day)),
        is_peak_day: String(day === peakDay), bmd_stale: 'True', physics_degraded: 'False',
        om_precip_mm: '2.4', unapproved_input_metric: '0.99', unapproved_input_note: 'private reason',
      };
    }));
}

function csvFromRows(rows) {
  const columns = Object.keys(rows[0]);
  return [columns.join(','), ...rows.map((row) => columns.map((key) => {
    const value = String(row[key] ?? '');
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(','))].join('\n');
}

describe('public 15-day projection', () => {
  test('accepts continuous, uniquely dated synthetic coverage; only publishes approved fields', () => {
    const snapshot = buildPublicDailySnapshot(sampleRows(), manifest(), { expectedDistricts: 3 });
    assert.equal(snapshot.schema, DAILY_ADVISORY_SCHEMA);
    assert.equal(snapshot.coverage.publishedRows, 45);
    assert.equal(snapshot.advisories.filter((row) => row.peak === 'unique').length, 3);
    assert.equal(snapshot.advisories.find((row) => row.forecastDay === 1).peak, 'none');
    assert.deepEqual(snapshot.advisories[0].qualityNotes, ['official_update_unverified']);
    assert.deepEqual(snapshot.advisories[0].weather, { precipitationMm: 2.4 });
    const publicText = JSON.stringify(snapshot);
    assert.equal(publicText.includes('unapproved_input_metric'), false);
    assert.equal(publicText.includes('private reason'), false);
    assert.equal(publicText.includes('another_unapproved_field'), false);
    assert.equal(parsePublicDailySnapshot(snapshot)?.advisories.length, 45);
  });

  test('tie flag can pick earliest day but public copy never claims a unique peak', () => {
    const rows = sampleRows(1, { score: () => 0.3, peakDay: 1 });
    const snapshot = buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 });
    assert.equal(snapshot.advisories.filter((row) => row.peak === 'unique').length, 0);
    assert(snapshot.advisories.every((row) => row.peak === 'tied'));
  });

  test('publishes all 5 tiers (including EXTREME) with severityScore, requiresReview, weather and metrics', () => {
    const rows = sampleRows(1);
    rows[0].advisory_tier = 'NORMAL';
    rows[1].advisory_tier = 'WARNING';
    rows[2].advisory_tier = 'SEVERE';
    rows[4].advisory_tier = 'EXTREME';
    rows[4].confidence_calibrated = '0.94';
    rows[4].model_severity = '0.88';
    rows[4].physics_severity = '0.72';
    rows[4].final_severity = '0.91';
    rows[4].prob_top1 = '0.94';
    rows[4].prob_top2 = '0.04';
    rows[4].top2_hazard = 'Flash Flood';
    rows[4].om_temp_max_c = '33.5';
    rows[4].om_temp_min_c = '24.1';
    rows[4].om_wind_kmh = '48.2';
    const snapshot = buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 });
    assert.equal(snapshot.coverage.publishedRows, 15);
    assert.equal(snapshot.advisories[0].tier, 'NORMAL');
    assert.equal(snapshot.advisories[0].requiresReview, false);
    assert.equal(snapshot.advisories[1].tier, 'WARNING');
    assert.equal(snapshot.advisories[1].requiresReview, true);
    assert.equal(snapshot.advisories[2].tier, 'SEVERE');
    assert.equal(snapshot.advisories[2].requiresReview, true);
    assert.equal(snapshot.advisories[4].tier, 'EXTREME');
    assert.equal(snapshot.advisories[4].requiresReview, true);
    assert.equal(snapshot.advisories[4].severityScore, 0.7);
    assert.equal(snapshot.advisories[4].peak, 'unique');
    assert.deepEqual(snapshot.advisories[4].weather, {
      precipitationMm: 2.4, temperatureMaxC: 33.5, temperatureMinC: 24.1, windKmh: 48.2,
    });
    assert.equal(snapshot.advisories[4].metrics.confidence, 0.94);
    assert.equal(snapshot.advisories[4].metrics.top2Hazard, 'Flash Flood');
    assert.equal(parsePublicDailySnapshot(snapshot)?.advisories.length, 15);

    const rolled = rollupDailySnapshotToHorizons(snapshot);
    assert.equal(rolled.horizons['7_days'][0].advisory_tier, 'EXTREME');
    assert.equal(rolled.horizons['7_days'][0].severity_score, 0.7);
    assert.equal(rolled.horizons['15_days'][0].advisory_tier, 'EXTREME');
  });

  test('derives a valid run manifest directly from CSV rows when .run.json is absent', () => {
    const rows = sampleRows(1).map((r) => ({ ...r, generated_at: '2026-11-01T10:00:00Z' }));
    const derived = deriveDailyManifestFromCsv(rows, {
      sha256: SHA, datasetVersion: 42, defaultModelVersion: '2.1.9', now: NOW,
    });
    assert.equal(derived.run_id, 'kaggle-v42-aaaaaaaaaaaa');
    assert.equal(derived.csv_sha256, SHA);
    assert.equal(validateDailyManifest(derived, { sha256: SHA, now: NOW }).model_version, '2.1.9');
  });

  test('rejects malformed dates, duplicate district/day keys and inconsistent peak flags', () => {
    const rows = sampleRows(1);
    rows[1].target_date = '2026-11-02';
    assert.throws(() => buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 }), /not consecutive/);
    rows[1].forecast_day = '1';
    assert.throws(() => buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 }), /duplicate/);
    rows[1].forecast_day = '2';
    rows[1].target_date = '2026-11-03';
    rows[4].is_peak_day = 'False';
    assert.throws(() => buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 }), /peak marker/);
  });

  test('invalid boolean and unknown hazard are refused instead of being coerced', () => {
    const rows = sampleRows(1);
    rows[0].bmd_stale = 'not-false';
    assert.throws(() => buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 }), /invalid required/);
    rows[0].bmd_stale = 'False';
    rows[0].hazard = 'Other';
    assert.throws(() => buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 }), /invalid required/);
  });

  test('rejects a public artifact with leaked fields, invented actions or an unknown tier', () => {
    const snapshot = buildPublicDailySnapshot(sampleRows(1), manifest(), { expectedDistricts: 1 });
    assert.equal(parsePublicDailySnapshot({ ...snapshot, rawRow: { secret: true } }), null);
    assert.equal(parsePublicDailySnapshot({ ...snapshot, advisories: [
      { ...snapshot.advisories[0], tier: 'CATASTROPHIC' }, ...snapshot.advisories.slice(1),
    ] }), null);
    assert.equal(parsePublicDailySnapshot({ ...snapshot, advisories: [
      { ...snapshot.advisories[0], tier: 'EXTREME', requiresReview: false }, ...snapshot.advisories.slice(1),
    ] }), null);
    assert.equal(parsePublicDailySnapshot({ ...snapshot, advisories: [
      { ...snapshot.advisories[0], actionIds: ['invented', 'invented'] }, ...snapshot.advisories.slice(1),
    ] }), null);
  });

  test('manifest requires checksum, authoritative UTC timestamps and a fresh data cutoff', () => {
    assert.equal(validateDailyManifest(manifest(), { sha256: SHA, now: NOW }).run_id, 'synthetic-test-1');
    assert.throws(() => validateDailyManifest(manifest(), { sha256: 'b'.repeat(64), now: NOW }), /checksum/);
    assert.throws(() => validateDailyManifest({ ...manifest(), generated_at: '2026-11-01 10:00:00' }, { sha256: SHA, now: NOW }), /UTC/);
    assert.throws(() => validateDailyManifest({ ...manifest(), data_cutoff: '2026-10-29T08:00:00Z' }, { sha256: SHA, now: NOW }), /stale/);
    assert.throws(() => validateDailyManifest({ ...manifest(), data_cutoff: '2026-11-02T08:00:00Z' }, { sha256: SHA, now: NOW }), /inconsistent/);
    for (const candidate of [
      { ...manifest(), run_id: 'TBD_BY_OWNER' },
      { ...manifest(), model_version: 'unknown' },
      { ...manifest(), generated_at: '2026-02-30T10:00:00Z' },
    ]) {
      assert.throws(() => validateDailyManifest(candidate, { sha256: SHA, now: NOW }), /UTC run manifest/);
    }
  });

  test('an issued receipt binds objective CSV facts and both scoped approvals without exposing them', () => {
    const run = validatePublishableDailyManifest(issuedManifest(), releaseFacts());
    assert.deepEqual(run, manifest());
    const snapshot = buildPublicDailySnapshot(sampleRows(1), run, { expectedDistricts: 1 });
    const publicText = JSON.stringify(snapshot);
    assert(!publicText.includes('Synthetic project owner'));
    assert(!publicText.includes('Synthetic reviewer'));
    assert(!publicText.includes('publication'));
  });

  test('an authorized release operator may issue the receipt without a separate producer', () => {
    const receipt = issuedManifest();
    receipt.issuer = {
      issued_by: 'Synthetic release operator', role: 'authorized_operator',
      issued_at_utc: '2026-11-01T11:30:00.000Z',
    };
    assert.equal('producer' in receipt, false);
    assert.equal(validatePublishableDailyManifest(receipt, releaseFacts()).run_id, 'synthetic-test-1');
  });

  test('an incomplete receipt, mismatched artifact, or unbound approval cannot authorize publication', () => {
    const mutations = [
      (value) => { value.status = 'partial_pending_owner_issue'; },
      (value) => { value.run.run_id = 'TBD_BY_OWNER'; },
      (value) => { value.run.time_zone = 'TBD_BY_OWNER'; },
      (value) => { value.run.completed_at_utc = '2026-11-01 10:00:00'; },
      (value) => { value.run.started_at_utc = '2026-11-01T11:00:00.000Z'; },
      (value) => { value.issuer.issued_by = 'TBD_BY_OWNER'; },
      (value) => { value.issuer.role = 'producer'; },
      (value) => { value.issuer.issued_at_utc = '2026-11-01T10:30:00.000Z'; },
      (value) => { value.producer = { organization: 'Not needed' }; },
      (value) => { value.approvals.release_approval.status = 'noted_by_operator'; },
      (value) => { value.approvals.release_approval.approved_by = 'TBD_BY_OWNER'; },
      (value) => { value.approvals.release_approval.approved_at_utc = '2026-11-01T09:00:00.000Z'; },
      (value) => { value.approvals.release_approval.artifact_sha256 = 'd'.repeat(64); },
      (value) => { value.approvals.bangla_copy_approval.status = 'pending_manifest_binding'; },
      (value) => { value.approvals.bangla_copy_approval.copy_sha256 = 'd'.repeat(64); },
      (value) => { value.approvals.bangla_copy_approval.scope = 'some other copy'; },
      (value) => { value.publication.status = 'blocked_pending_owner_receipt'; },
      (value) => { value.artifact.sha256 = 'b'.repeat(64); },
      (value) => { value.artifact.size_bytes = 101; },
      (value) => { value.artifact.forecast_window_start = '2026-11-01'; },
      (value) => { value.unapprovedTechnicalLedger = true; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(issuedManifest());
      mutate(candidate);
      assert.throws(() => validatePublishableDailyManifest(candidate, releaseFacts()),
        /publication refused|checksum|manifest/);
    }
    assert.throws(() => validatePublishableDailyManifest(issuedManifest(), {
      ...releaseFacts(), copySha256: undefined,
    }), /approved copy revision/);
    assert.throws(() => validatePublishableDailyManifest(issuedManifest(), {
      ...releaseFacts(), now: new Date('2026-11-04T12:00:00.000Z'),
    }), /stale/);
  });

  test('runtime age is computed from cutoff, not target date or time of file download', () => {
    const snapshot = buildPublicDailySnapshot(sampleRows(1), manifest(), { expectedDistricts: 1 });
    assert.equal(publicDailyStatus(snapshot, NOW), 'fresh');
    assert.equal(publicDailyStatus(snapshot, new Date('2026-11-03T12:00:00Z')), 'stale');
  });
});

describe('deployment boundary for the public daily asset', () => {
  test('an unpublished asset is expected, but an explicit release check requires it', () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-public-boundary-'));
    try {
      const assetPath = join(temp, 'missing.json');
      assert.deepEqual(checkPublicDailyAsset({ assetPath, now: NOW }), { status: 'unpublished' });
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: NOW, requirePublished: true }), /No approved/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  test('only a fresh, nonempty, full-coverage public result passes, without leaking source text', () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-public-boundary-'));
    try {
      const assetPath = join(temp, 'public.json');
      const snapshot = buildPublicDailySnapshot(sampleRows(64), manifest());
      writeFileSync(assetPath, JSON.stringify(snapshot));
      assert.deepEqual(checkPublicDailyAsset({ assetPath, now: NOW, requirePublished: true }), {
        status: 'validated', districts: 64, publishedRows: 960,
        dataCutoff: manifest().data_cutoff,
      });

      // Replacing the file bypasses the builder; the deployment check must catch it.
      const tampered = { ...snapshot, advisories: [
        { ...snapshot.advisories[0], privateReason: 'private research detail' },
        ...snapshot.advisories.slice(1),
      ] };
      writeFileSync(assetPath, JSON.stringify(tampered));
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: NOW }), (error) =>
        /outside the public schema/.test(error.message) && !error.message.includes('private research detail'));

      const warned = { ...snapshot, advisories: [
        { ...snapshot.advisories[0], tier: 'WARNING' }, ...snapshot.advisories.slice(1),
      ] };
      writeFileSync(assetPath, JSON.stringify(warned));
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: NOW }), /public schema/);
      writeFileSync(assetPath, JSON.stringify(snapshot));
      const later = new Date('2026-11-04T08:00:00Z');
      assert.equal(checkPublicDailyAsset({ assetPath, now: later }).status, 'stale');
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: later, requirePublished: true }), /not a current/);
      const alias = join(temp, 'symlink.json');
      symlinkSync(assetPath, alias);
      assert.throws(() => checkPublicDailyAsset({ assetPath: alias, now: NOW }), /regular JSON file/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  test('preview coverage and an empty advisories array are not releasable files', () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-public-boundary-'));
    try {
      const assetPath = join(temp, 'public.json');
      writeFileSync(assetPath, JSON.stringify(buildPublicDailySnapshot(sampleRows(1), manifest(), { expectedDistricts: 1 })));
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: NOW }), /incomplete/);
      const fullSnapshot = buildPublicDailySnapshot(sampleRows(64), manifest());
      writeFileSync(assetPath, JSON.stringify({
        ...fullSnapshot,
        coverage: { ...fullSnapshot.coverage, publishedRows: 0 },
        advisories: [],
      }));
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: NOW }), /empty/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});

describe('strict CSV-to-public-file builder', () => {
  test('parses a quoted extra field without copying it to the artifact', async () => {
    const rows = sampleRows(1);
    rows[0].unapproved_input_note = 'text, with a comma and "quotes"';
    const parsed = await readDailyCsv(Buffer.from(csvFromRows(rows)));
    assert.equal(parsed[0].unapproved_input_note, rows[0].unapproved_input_note);
    const snapshot = buildPublicDailySnapshot(parsed, manifest(), { expectedDistricts: 1 });
    assert(!JSON.stringify(snapshot).includes('unapproved_input_note'));
  });

  test('fails closed on missing headers and ragged CSV rows', async () => {
    await assert.rejects(() => readDailyCsv(Buffer.from('district,forecast_day\nA,1\n')), /headers/);
    await assert.rejects(() => readDailyCsv(Buffer.from('district,forecast_day\nA\n')), /column|strict|row/i);
  });

  test('the publisher rejects an ordinary run manifest and a partial skeleton before any public write', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-public-gate-'));
    const output = resolve('frontend/public/data/daily-advisories-v1.json');
    const previous = existsSync(output) ? readFileSync(output) : null;
    try {
      const content = csvFromRows(sampleRows(64));
      const input = join(temp, 'input.csv');
      const manifestPath = join(temp, 'manifest.json');
      const sha = createHash('sha256').update(content).digest('hex');
      writeFileSync(input, content);
      for (const candidate of [
        manifest(sha),
        { ...issuedManifest(sha), status: 'partial_pending_owner_issue' }
      ]) {
        writeFileSync(manifestPath, JSON.stringify(candidate));
        await assert.rejects(() => buildPublicDailyFile({
          input, manifest: manifestPath, output, publish: true, now: NOW,
        }), /owner-issued publication receipt/);
      }
      assert.deepEqual(existsSync(output) ? readFileSync(output) : null, previous);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  test('projects a synthetic owner-issued receipt without a separate producer, in memory only', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-owner-receipt-'));
    try {
      const rows = sampleRows(64);
      const content = csvFromRows(rows);
      const sha = createHash('sha256').update(content).digest('hex');
      const receipt = issuedManifest(sha);
      receipt.artifact.size_bytes = Buffer.byteLength(content);
      receipt.artifact.columns = Object.keys(rows[0]).length;
      receipt.approvals.bangla_copy_approval.copy_sha256 = createHash('sha256')
        .update(readFileSync(resolve('frontend/src/lib/i18n.ts'))).digest('hex');
      assert.equal('producer' in receipt, false);
      const input = join(temp, 'input.csv');
      const manifestPath = join(temp, 'issued.json');
      writeFileSync(input, content);
      writeFileSync(manifestPath, JSON.stringify(receipt));
      const snapshot = await projectDailyInput({ input, manifest: manifestPath, publish: true, now: NOW });
      assert.equal(snapshot.coverage.publishedRows, 960);
      assert.equal(snapshot.run.id, 'synthetic-test-1');
      assert(!JSON.stringify(snapshot).includes('Synthetic project owner'));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  test('the automated route projects a synthetic notebook run without human sign-off or a private-field leak', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-machine-run-'));
    try {
      const rows = sampleRows(64);
      const content = csvFromRows(rows);
      const sha = createHash('sha256').update(content).digest('hex');
      const input = join(temp, 'input.csv');
      const run = join(temp, 'run.json');
      writeFileSync(input, content);
      writeFileSync(run, JSON.stringify(manifest(sha)));
      const snapshot = await projectDailyInput({
        input, manifest: run, publish: true, automated: true, datasetVersion: 42, now: NOW,
      });
      assert.equal(snapshot.run.sourceDatasetVersion, 42);
      assert.equal(snapshot.coverage.publishedRows, 960);
      assert.equal(snapshot.run.inputSha256, sha);
      assert(!JSON.stringify(snapshot).includes('unapproved_input_note'));
      assert(!JSON.stringify(snapshot).includes('private reason'));
      const assetPath = join(temp, 'public.json');
      writeFileSync(assetPath, JSON.stringify(snapshot));
      assert.equal(checkPublicDailyAsset({ assetPath, now: NOW, requirePublished: true }).status, 'validated');

      rows[0].advisory_tier = 'EXTREME';
      const withExtreme = buildPublicDailySnapshot(rows, manifest(sha), {
        sourceDatasetVersion: 42,
      });
      assert.equal(withExtreme.coverage.publishedRows, 960);
      assert.equal(withExtreme.advisories[0].tier, 'EXTREME');
      assert.equal(withExtreme.advisories[0].requiresReview, true);

      // Automated mode also succeeds without a manifest file by deriving metadata from CSV + version
      const derivedSnapshot = await projectDailyInput({
        input, publish: true, automated: true, datasetVersion: 42,
        datasetTimestamp: '2026-11-01T10:00:00.000Z', now: NOW,
      });
      assert.equal(derivedSnapshot.coverage.publishedRows, 960);
      assert.equal(derivedSnapshot.run.sourceDatasetVersion, 42);

      await assert.rejects(() => projectDailyInput({
        input, manifest: run, publish: true, automated: true, now: NOW,
      }), /pinned Ready/);
      await assert.rejects(() => projectDailyInput({
        input: 'frontend/public/data/technical.csv', manifest: run,
        publish: true, automated: true, datasetVersion: 42, now: NOW,
      }), /outside the public repository/);
      writeFileSync(run, JSON.stringify(manifest('b'.repeat(64))));
      await assert.rejects(() => projectDailyInput({
        input, manifest: run, publish: true, automated: true, datasetVersion: 42, now: NOW,
      }), /checksum/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  test('automated mode is explicit, pinned and cannot roll back an existing public result', () => {
    const args = [
      '--input', '/tmp/input.csv', '--manifest', '/tmp/run.json',
      '--output', 'frontend/public/data/daily-advisories-v1.json',
    ];
    assert.throws(() => optionsFromArgs([...args, '--automated-publish']), /Usage/);
    assert.throws(() => optionsFromArgs([...args, '--automated-publish', '--dataset-version', '42', '--publish']), /Usage/);
    assert.equal(optionsFromArgs([...args, '--automated-publish', '--dataset-version', '42'])['dataset-version'], '42');
    const previous = buildPublicDailySnapshot(sampleRows(64), manifest(), { sourceDatasetVersion: 42 });
    const repeated = buildPublicDailySnapshot(sampleRows(64), manifest(), { sourceDatasetVersion: 43 });
    assert.throws(() => assertNewerPublicDaily(previous, repeated), /repeated/);
    const older = buildPublicDailySnapshot(sampleRows(64), {
      ...manifest(), run_id: 'synthetic-old', generated_at: '2026-11-01T09:00:00.000Z',
    }, { sourceDatasetVersion: 43 });
    assert.throws(() => assertNewerPublicDaily(previous, older), /older data cutoff/);
    const next = buildPublicDailySnapshot(sampleRows(64), {
      ...manifest(), run_id: 'synthetic-next', generated_at: '2026-11-02T10:00:00.000Z',
      data_cutoff: '2026-11-02T08:00:00.000Z',
    }, { sourceDatasetVersion: 41 });
    assert.throws(() => assertNewerPublicDaily(previous, next), /rolled-back/);
    const newer = { ...next, run: { ...next.run, sourceDatasetVersion: 43 } };
    assert.doesNotThrow(() => assertNewerPublicDaily(previous, newer));
  });

  test('writes a preview outside public assets only when the run manifest matches', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-public-preview-'));
    try {
      const rows = sampleRows(1);
      const content = csvFromRows(rows);
      const sha = createHash('sha256').update(content).digest('hex');
      const input = join(temp, 'input.csv');
      const manifestPath = join(temp, 'run.json');
      const output = join(temp, 'public.json');
      writeFileSync(input, content);
      writeFileSync(manifestPath, JSON.stringify(manifest(sha)));
      const result = await buildPublicDailyFile({
        input, manifest: manifestPath, output, preview: true, expectedDistricts: 1, now: NOW,
      });
      assert.equal(result.count, 15);
      assert.equal(JSON.parse(readFileSync(output, 'utf8')).advisories.length, 15);
      await assert.rejects(() => buildPublicDailyFile({
        input, manifest: manifestPath, output: 'frontend/public/data/daily-advisories-v1.json',
        preview: true, expectedDistricts: 1,
      }), /preview|public/i);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
