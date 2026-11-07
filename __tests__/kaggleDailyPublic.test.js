/** @jest-environment node */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DISTRICT_REGISTRY } from '../backend/utils/advisoryMapper.js';
import { buildPublicDailySnapshot } from '../backend/utils/dailyAdvisoryPublic.js';
import { projectDailyInput } from '../scripts/build_public_daily_advisories.mjs';
import { checkPublicDailyAsset } from '../scripts/check_public_daily_asset.mjs';
import {
  AUDIT_NAME,
  CSV_NAME, DATASET, RUN_NAME, fetchReadyDailyDataset, pinnedDownloadUrl,
  readyDatasetVersion,
} from '../scripts/fetch_kaggle_daily_public.mjs';
import {
  refreshAlertSnapshotFromForecasts,
  syncDailyToForecastArtifacts,
} from '../scripts/sync_daily_to_forecasts.mjs';

const NOW = new Date('2026-11-01T12:00:00Z');
const INPUT = Buffer.from('district,private_input\nKurigram,research-private\n');
const SHA = createHash('sha256').update(INPUT).digest('hex');
const MANIFEST = {
  schema_version: '4.3-pb', run_id: 'synthetic-kaggle-run-42',
  generated_at: '2026-11-01T10:00:00.000Z',
  data_cutoff: '2026-11-01T08:00:00.000Z',
  model_version: 'synthetic-model-1', csv_sha256: SHA,
};
const view = (version = 42, status = 'Ready') => ({
  ref: DATASET, isPrivate: false, currentVersionNumber: version,
  versions: [{ versionNumber: version, status }],
  lastUpdated: '2026-11-01T11:59:00.000Z',
});

const fakeKaggle = ({ dataset = view(), csv = INPUT, run = MANIFEST, changedView, zipCsv = false } = {}) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, query: parsed.searchParams, headers: options.headers });
    if (parsed.pathname === `/api/v1/datasets/view/${DATASET}`) {
      const current = changedView && calls.filter((call) => call.path === parsed.pathname).length > 1
        ? changedView : dataset;
      return new Response(JSON.stringify(current), { status: 200 });
    }
    if (parsed.searchParams.get('datasetVersionNumber') !== '42') {
      return new Response('wrong version', { status: 404 });
    }
    if (parsed.pathname.endsWith(`/${CSV_NAME}`)) {
      return new Response(zipCsv ? zipFile(CSV_NAME, csv) : csv, { status: 200 });
    }
    if (parsed.pathname.endsWith(`/${RUN_NAME}`)) {
      return new Response(run === null ? 'missing' : JSON.stringify(run), { status: run === null ? 404 : 200 });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, calls };
};

function zipFile(name, bytes) {
  const code = `import io,sys,zipfile
b=io.BytesIO()
with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z: z.writestr(sys.argv[1],sys.stdin.buffer.read())
sys.stdout.buffer.write(b.getvalue())`;
  const result = spawnSync('python3', ['-c', code, name], { input: bytes, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error('Synthetic archive could not be created');
  return result.stdout;
}

function syntheticDailyRows() {
  return DISTRICT_REGISTRY.flatMap((district) => Array.from({ length: 15 }, (_, i) => ({
    district: district.district_name, forecast_day: String(i + 1),
    target_date: new Date(Date.parse('2026-11-02T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10),
    hazard: 'Flood', advisory_tier: 'WATCH', severity_score: String(i === 4 ? .9 : .1),
    is_peak_day: String(i === 4), bmd_stale: 'False', physics_degraded: 'False',
  })));
}

function previousAsset(version = 42) {
  return buildPublicDailySnapshot(syntheticDailyRows(), MANIFEST, { sourceDatasetVersion: version });
}

describe('version-pinned Kaggle daily public fetch (synthetic HTTP only)', () => {
  test('the latest dataset must be public, identifiable and Ready', () => {
    assert.equal(readyDatasetVersion(view()), 42);
    assert.equal(readyDatasetVersion(view(42, 'Pending')), null);
    assert.throws(() => readyDatasetVersion({ ...view(), ref: 'wrong/dataset' }), /identity/);
    assert.throws(() => readyDatasetVersion({ ...view(), isPrivate: true }), /identity/);
    assert.throws(() => readyDatasetVersion({ ...view(), versions: [] }), /status/);
    assert.equal(pinnedDownloadUrl(CSV_NAME, 42).split('?')[1], 'datasetVersionNumber=42');
    assert.throws(() => pinnedDownloadUrl('audit_summary_metrics.csv', 42), /Invalid/);
  });

  test('downloads both exact filenames from one version, verifies hash and UTC, and keeps bytes out of the checkout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hazardnet-kaggle-fetch-'));
    try {
      const { fetchImpl, calls } = fakeKaggle({ zipCsv: true });
      const result = await fetchReadyDailyDataset({ outDir: dir, assetPath: join(dir, 'absent.json'),
        base: 'http://kaggle.test', fetchImpl, now: NOW, username: 'user', key: 'test-secret' });
      assert.deepEqual(result, { status: 'fetched', version: 42, runId: MANIFEST.run_id });
      assert.deepEqual(readFileSync(join(dir, CSV_NAME)), INPUT);
      assert.deepEqual(JSON.parse(readFileSync(join(dir, RUN_NAME), 'utf8')), MANIFEST);
      assert.equal(readFileSync(join(dir, 'dataset-version.txt'), 'utf8'), '42\n');
      assert.deepEqual(calls.map(({ path }) => path), [
        `/api/v1/datasets/view/${DATASET}`,
        `/api/v1/datasets/download/${DATASET}/${CSV_NAME}`,
        `/api/v1/datasets/download/${DATASET}/${RUN_NAME}`,
        `/api/v1/datasets/download/${DATASET}/${AUDIT_NAME}`,
        `/api/v1/datasets/view/${DATASET}`,
      ]);
      assert(calls.every(({ headers }) => headers.authorization === `Basic ${Buffer.from('user:test-secret').toString('base64')}`));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('an unchanged or incomplete dataset never downloads a CSV or writes any files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hazardnet-kaggle-skip-'));
    try {
      const assetPath = join(dir, 'previous.json');
      writeFileSync(assetPath, JSON.stringify(previousAsset()));
      const same = fakeKaggle();
      assert.deepEqual(await fetchReadyDailyDataset({ outDir: join(dir, 'private'), assetPath,
        base: 'http://kaggle.test', fetchImpl: same.fetchImpl, now: NOW }),
      { status: 'unchanged', version: 42 });
      assert.equal(same.calls.length, 1);
      assert.equal(existsSync(join(dir, 'private')), false);
      const pending = fakeKaggle({ dataset: view(43, 'Pending') });
      assert.deepEqual(await fetchReadyDailyDataset({ outDir: join(dir, 'private'), assetPath,
        base: 'http://kaggle.test', fetchImpl: pending.fetchImpl, now: NOW }),
      { status: 'not-ready' });
      assert.equal(pending.calls.length, 1);
      const rolledBack = fakeKaggle({ dataset: view(41) });
      await assert.rejects(() => fetchReadyDailyDataset({ outDir: join(dir, 'private'), assetPath,
        base: 'http://kaggle.test', fetchImpl: rolledBack.fetchImpl, now: NOW }), /older/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('derives a run manifest directly from CSV + dataset timestamp when .run.json returns HTTP 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hazardnet-kaggle-derived-'));
    try {
      const rows = syntheticDailyRows();
      const columns = Object.keys(rows[0]);
      const csv = Buffer.from([columns.join(','), ...rows.map((row) =>
        columns.map((key) => row[key]).join(','))].join('\n') + '\n');
      const { fetchImpl } = fakeKaggle({ csv, run: null });
      const result = await fetchReadyDailyDataset({ outDir: join(dir, 'private'),
        assetPath: join(dir, 'absent.json'), base: 'http://kaggle.test', fetchImpl, now: NOW,
      });
      assert.equal(result.status, 'fetched');
      assert.equal(result.version, 42);
      assert.match(result.runId, /^kaggle-v42-/);
      const snapshot = await projectDailyInput({
        input: join(dir, 'private', CSV_NAME), manifest: join(dir, 'private', RUN_NAME),
        publish: true, automated: true, datasetVersion: result.version, now: NOW,
      });
      assert.equal(snapshot.coverage.publishedRows, 960);
      assert.equal(snapshot.run.sourceDatasetVersion, 42);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('mismatched notebook metadata, stale cutoff and version race fail before writing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hazardnet-kaggle-reject-'));
    try {
      for (const source of [
        fakeKaggle({ run: { ...MANIFEST, csv_sha256: 'b'.repeat(64) } }),
        fakeKaggle({ run: { ...MANIFEST, data_cutoff: '2026-10-28T08:00:00.000Z' } }),
        fakeKaggle({ run: { ...MANIFEST, generated_at: '2026-11-01 10:00:00' } }),
        fakeKaggle({ changedView: view(43) }),
      ]) {
        await assert.rejects(() => fetchReadyDailyDataset({ outDir: join(dir, 'private'),
          assetPath: join(dir, 'absent.json'), base: 'http://kaggle.test', fetchImpl: source.fetchImpl,
          now: NOW,
        }), /checksum|stale|UTC run manifest|version changed/);
        assert.equal(existsSync(join(dir, 'private')), false);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a complete synthetic version reaches only the whitelisted current public result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hazardnet-kaggle-public-'));
    try {
      const rows = syntheticDailyRows().map((row) => ({ ...row, private_reason: 'do-not-serve' }));
      const columns = Object.keys(rows[0]);
      const csv = Buffer.from([columns.join(','), ...rows.map((row) =>
        columns.map((key) => row[key]).join(','))].join('\n') + '\n');
      const run = { ...MANIFEST, csv_sha256: createHash('sha256').update(csv).digest('hex') };
      const { fetchImpl } = fakeKaggle({ csv, run });
      const result = await fetchReadyDailyDataset({ outDir: join(dir, 'private'),
        assetPath: join(dir, 'absent.json'), base: 'http://kaggle.test', fetchImpl, now: NOW,
      });
      const snapshot = await projectDailyInput({
        input: join(dir, 'private', CSV_NAME), manifest: join(dir, 'private', RUN_NAME),
        publish: true, automated: true, datasetVersion: result.version, now: NOW,
      });
      const assetPath = join(dir, 'public.json');
      writeFileSync(assetPath, JSON.stringify(snapshot));
      assert.equal(checkPublicDailyAsset({ assetPath, now: NOW, requirePublished: true }).status, 'validated');
      assert.equal(snapshot.coverage.publishedRows, 960);
      assert.equal(snapshot.run.sourceDatasetVersion, 42);
      assert.equal(JSON.stringify(snapshot).includes('do-not-serve'), false);
      assert.equal(JSON.stringify(snapshot).includes('private_reason'), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('fails closed if someone points the private download at the Git checkout', async () => {
    const { fetchImpl } = fakeKaggle();
    await assert.rejects(() => fetchReadyDailyDataset({ outDir: 'frontend/public/data',
      assetPath: join(tmpdir(), 'absent-kaggle-asset.json'), base: 'http://kaggle.test',
      fetchImpl, now: NOW,
    }), /outside the public repository/);
  });

  test('Actions schedules the automated route and synchronizes all forecast snapshots', () => {
    const automated = readFileSync(join(process.cwd(), '.github/workflows/public_daily_advisories.yml'), 'utf8');
    const legacy = readFileSync(join(process.cwd(), '.github/workflows/daily_advisory_ingest.yml'), 'utf8');
    assert.match(automated, /schedule:\s*\n\s*- cron:/);
    assert.match(automated, /frontend\/public\/data\/daily-advisories-v1\.json/);
    assert.match(automated, /frontend\/public\/data\/alerts-latest\.json/);
    assert.match(automated, /sync_daily_to_forecasts\.mjs[\s\\]+--from-daily-json/);
    assert.match(automated, /frontend\/dist\/data\/daily-advisories-v1\.json/);
    assert.match(automated, /frontend\/dist\/data\/alerts-latest\.json/);
    assert.match(automated, /SNAPSHOT_SOURCE=/);
    assert.match(automated, /--automated-publish --dataset-version/);
    assert.doesNotMatch(automated, /process_advisory_ingest|mirror_public_daily_to_firestore/);
    assert.doesNotMatch(legacy, /^\s*schedule:/m);
    assert.match(legacy, /128-row legacy two-horizon CSV/);
  });

  test('syncDailyToForecastArtifacts refreshes alerts-latest.json and preserves WATCH auto-publish ceiling', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'hazardnet-sync-alerts-'));
    try {
      const rows = DISTRICT_REGISTRY.flatMap((district, dIdx) =>
        Array.from({ length: 15 }, (_, i) => ({
          district: district.district_name,
          forecast_day: String(i + 1),
          target_date: new Date(Date.parse('2026-11-02T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10),
          hazard: 'Flood',
          advisory_tier: dIdx === 0 && i === 2 ? 'EXTREME' : dIdx === 1 && i === 2 ? 'WATCH' : 'NORMAL',
          severity_score: dIdx === 0 && i === 2 ? '0.93' : dIdx === 1 && i === 2 ? '0.42' : i === 2 ? '0.22' : '0.12',
          is_peak_day: String(i === 2),
          bmd_stale: 'False',
          physics_degraded: 'False',
        })),
      );
      const dailySnap = buildPublicDailySnapshot(rows, MANIFEST, { sourceDatasetVersion: 42 });
      const dailyPath = join(tmpRoot, 'frontend/public/data/daily-advisories-v1.json');
      writeFileSync(join(tmpRoot, '.placeholder'), '');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(tmpRoot, 'frontend/public/data'), { recursive: true });
      writeFileSync(dailyPath, JSON.stringify(dailySnap, null, 2));

      const res = await syncDailyToForecastArtifacts({
        root: tmpRoot,
        dailyJsonPath: dailyPath,
        runDerivedBuilders: false,
        syncAlerts: true,
        now: NOW,
      });

      assert.equal(res.alertsOutPath, join(tmpRoot, 'frontend/public/data/alerts-latest.json'));
      const alertsSnap = JSON.parse(readFileSync(res.alertsOutPath, 'utf8'));
      assert.equal(alertsSnap.schema, 'hazardnet-alerts/v1');
      assert.equal(alertsSnap.assessed, 64);
      assert.match(alertsSnap.disclaimer, /not an official warning service/i);
      assert(
        alertsSnap.alerts.every(
          (a) => a.state === 'PUBLISHED' && (a.level === 'WATCH' || a.level === 'NO_ALERT'),
        ),
      );
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test('refreshAlertSnapshotFromForecasts refuses to overwrite existing alerts-latest.json when rehearsal assesses 0 rows', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'hazardnet-sync-guard-'));
    try {
      const { mkdirSync } = await import('node:fs');
      const alertsPath = join(tmpRoot, 'frontend/public/data/alerts-latest.json');
      const sentinel = JSON.stringify({
        schema: 'hazardnet-alerts/v1',
        generated_at: '2026-11-01T00:00:00Z',
        alerts: [{ id: 'keep-me' }],
      });
      mkdirSync(join(tmpRoot, 'frontend/public/data'), { recursive: true });
      writeFileSync(alertsPath, sentinel);

      await assert.rejects(
        () =>
          refreshAlertSnapshotFromForecasts({
            snapshotPath: join(tmpRoot, 'frontend/public/data/forecasts-latest.json'),
            alertsOutPath: alertsPath,
            rehearseFn: async () => ({ rows_total: 0, assessed: 0, alerts: [] }),
          }),
        /assessed 0 rows/i,
      );
      assert.equal(readFileSync(alertsPath, 'utf8'), sentinel);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
