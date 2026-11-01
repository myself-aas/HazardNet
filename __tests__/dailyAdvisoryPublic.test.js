/** @jest-environment node */
import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DISTRICT_REGISTRY } from '../backend/utils/advisoryMapper.js';
import {
  DAILY_ADVISORY_SCHEMA, buildPublicDailySnapshot, parsePublicDailySnapshot,
  publicDailyStatus, validateDailyManifest, validatePublishableDailyManifest,
} from '../backend/utils/dailyAdvisoryPublic.js';
import { buildPublicDailyFile, readDailyCsv } from '../scripts/build_public_daily_advisories.mjs';
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
  producer: {
    organization: 'Synthetic producer', issued_by: 'Synthetic issuer',
    role: 'Release owner', issued_at_utc: '2026-11-01T11:30:00.000Z',
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

  test('unreviewed higher tiers never enter the public projection or its peak claim', () => {
    const rows = sampleRows(1);
    rows[4].advisory_tier = 'EXTREME';
    const snapshot = buildPublicDailySnapshot(rows, manifest(), { expectedDistricts: 1 });
    assert.equal(snapshot.coverage.publishedRows, 14);
    assert(snapshot.advisories.every((row) => row.tier === 'WATCH' && row.peak === 'unknown'));
    assert.equal(JSON.stringify(snapshot).includes('EXTREME'), false);
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

  test('rejects a public artifact with leaked fields, invented actions or a high tier', () => {
    const snapshot = buildPublicDailySnapshot(sampleRows(1), manifest(), { expectedDistricts: 1 });
    assert.equal(parsePublicDailySnapshot({ ...snapshot, rawRow: { secret: true } }), null);
    assert.equal(parsePublicDailySnapshot({ ...snapshot, advisories: [
      { ...snapshot.advisories[0], tier: 'EXTREME' }, ...snapshot.advisories.slice(1),
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
  });

  test('an issued receipt binds objective CSV facts and both scoped approvals without exposing them', () => {
    const run = validatePublishableDailyManifest(issuedManifest(), releaseFacts());
    assert.deepEqual(run, manifest());
    const snapshot = buildPublicDailySnapshot(sampleRows(1), run, { expectedDistricts: 1 });
    const publicText = JSON.stringify(snapshot);
    assert(!publicText.includes('Synthetic issuer'));
    assert(!publicText.includes('Synthetic reviewer'));
    assert(!publicText.includes('publication'));
  });

  test('an incomplete receipt, mismatched artifact, or unbound approval cannot authorize publication', () => {
    const mutations = [
      (value) => { value.status = 'partial_pending_producer_issue'; },
      (value) => { value.run.run_id = 'TBD_BY_PRODUCER'; },
      (value) => { value.run.time_zone = 'TBD_BY_PRODUCER'; },
      (value) => { value.run.completed_at_utc = '2026-11-01 10:00:00'; },
      (value) => { value.run.started_at_utc = '2026-11-01T11:00:00.000Z'; },
      (value) => { value.producer.issued_by = 'TBD_BY_PRODUCER'; },
      (value) => { value.producer.issued_at_utc = '2026-11-01T10:30:00.000Z'; },
      (value) => { value.approvals.release_approval.status = 'noted_by_operator'; },
      (value) => { value.approvals.release_approval.approved_by = 'TBD_BY_PRODUCER'; },
      (value) => { value.approvals.release_approval.approved_at_utc = '2026-11-01T09:00:00.000Z'; },
      (value) => { value.approvals.release_approval.artifact_sha256 = 'd'.repeat(64); },
      (value) => { value.approvals.bangla_copy_approval.status = 'pending_manifest_binding'; },
      (value) => { value.approvals.bangla_copy_approval.copy_sha256 = 'd'.repeat(64); },
      (value) => { value.approvals.bangla_copy_approval.scope = 'some other copy'; },
      (value) => { value.publication.status = 'blocked_pending_producer_manifest'; },
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
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: new Date('2026-11-04T08:00:00Z') }), /not a current/);
      const alias = join(temp, 'symlink.json');
      symlinkSync(assetPath, alias);
      assert.throws(() => checkPublicDailyAsset({ assetPath: alias, now: NOW }), /regular JSON file/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });

  test('preview coverage and a wholly withheld run are not releasable files', () => {
    const temp = mkdtempSync(join(tmpdir(), 'hazardnet-public-boundary-'));
    try {
      const assetPath = join(temp, 'public.json');
      writeFileSync(assetPath, JSON.stringify(buildPublicDailySnapshot(sampleRows(1), manifest(), { expectedDistricts: 1 })));
      assert.throws(() => checkPublicDailyAsset({ assetPath, now: NOW }), /incomplete/);
      const rows = sampleRows(64).map((row) => ({ ...row, advisory_tier: 'WARNING' }));
      writeFileSync(assetPath, JSON.stringify(buildPublicDailySnapshot(rows, manifest())));
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
        { ...issuedManifest(sha), status: 'partial_pending_producer_issue' },
      ]) {
        writeFileSync(manifestPath, JSON.stringify(candidate));
        await assert.rejects(() => buildPublicDailyFile({
          input, manifest: manifestPath, output, publish: true, now: NOW,
        }), /producer-issued publication manifest/);
      }
      assert.deepEqual(existsSync(output) ? readFileSync(output) : null, previous);
    } finally { rmSync(temp, { recursive: true, force: true }); }
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
