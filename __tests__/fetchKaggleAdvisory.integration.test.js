/**
 * Integration coverage for scripts/fetch_kaggle_advisory.mjs.
 *
 * The unit suite (__tests__/fetchKaggleAdvisory.test.js) proves the parsing and the
 * freshness decision. This one proves the thing that actually breaks in production: **the
 * fetch itself, and the exit code the workflow branches on.** A download that succeeds and
 * yields yesterday's CSV used to be indistinguishable from a healthy run, and that is the
 * bug this script exists to prevent — so it is asserted here end to end.
 *
 * No network: a local HTTP server stands in for Kaggle via KAGGLE_API_BASE and serves a
 * real (stored, uncompressed) zip, so the download → unzip → inspect → decide path runs
 * exactly as it does on the runner.
 */

const { execFileSync } = require('node:child_process');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SCRIPT = join(__dirname, '..', 'scripts', 'fetch_kaggle_advisory.mjs');
const CSV_NAME = 'hazardnet_advisories_latest.csv';

/* ------------------------------------------------------------------ test fixtures */

/** CRC-32 as required by the zip local header — the one field zip readers verify. */
function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/**
 * A single-entry, *stored* (method 0) zip. Written by hand because the repo has no zip
 * dependency and the alternative (shelling out to `zip`/`python3`) makes the test depend on
 * a binary that may not exist on a contributor's machine. Kaggle's real archive is
 * deflated, which is irrelevant here: both `unzip -p` and Python's `zipfile` inflate and
 * store identically, and what this test exercises is our code, not the codec.
 */
function storedZip(fileName, content) {
  const name = Buffer.from(fileName, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0, 6);             // flags
  local.writeUInt16LE(0, 8);             // method: stored
  local.writeUInt16LE(0, 10);            // mod time
  local.writeUInt16LE(0x21, 12);         // mod date (1980-01-01)
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);  // compressed size
  local.writeUInt32LE(data.length, 22);  // uncompressed size
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);          // version made by
  central.writeUInt16LE(20, 6);          // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);          // extra
  central.writeUInt16LE(0, 32);          // comment
  central.writeUInt16LE(0, 34);          // disk
  central.writeUInt16LE(0, 36);          // internal attrs
  central.writeUInt32LE(0, 38);          // external attrs
  central.writeUInt32LE(0, 42);          // local header offset
  const centralDir = Buffer.concat([central, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);               // entries on this disk
  end.writeUInt16LE(1, 10);              // total entries
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, name, data, centralDir, end]);
}

/** A CSV shaped like the notebook's output, including the `generated_at` column. */
function advisoryCsv({ generatedAt, rows = 3 }) {
  const header = 'district,hazard_type,risk_score,generated_at';
  const body = Array.from({ length: rows }, (_, i) =>
    `District ${i},Flood,0.${60 + i},${generatedAt}`).join('\n');
  return `${header}\n${body}\n`;
}

/**
 * A Kaggle-shaped stamp (`YYYY-MM-DD HH:MM:SS`, naive UTC) `hoursAgo` hours behind now.
 *
 * Relative, not fixed: the fetcher decides staleness against the clock, so a hard-coded
 * 2026-10-03 fixture is inside the 36 h gate on the day it is written and outside it two days
 * later — the suite would pass in review and fail the next morning.
 */
function kaggleStamp(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
}

const RECENT_RUN = () => kaggleStamp(5);   // comfortably inside the 36 h ingest gate
const STALE_RUN = () => kaggleStamp(60);   // newer than a September manifest, but past the gate

/* ------------------------------------------------------------------ harness */

let server;
let port;
let dir;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'advisory-fetch-'));
  server = createServer((req, res) => {
    server.lastAuth = req.headers.authorization;
    server.lastUrl = req.url;
    if (server.nextHandler) return server.nextHandler(req, res);
    res.writeHead(404).end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
});

beforeEach(() => { server.nextHandler = null; });

/**
 * Run the fetcher as a subprocess — the only honest way to assert an exit code.
 *
 * **It must be async.** The stub Kaggle lives in *this* process, and `spawnSync` blocks the
 * event loop that would serve the request the child is waiting on: parent and child
 * deadlock, and Jest's timeout cannot interrupt a synchronous block. `spawn` + `close`
 * keeps the loop free.
 *
 * `JEST_WORKER_ID` is deleted: the script uses it to avoid auto-running `main()` when Jest
 * imports it for the unit suite. Here we *want* main to run, in a fresh process where the
 * variable would otherwise be inherited from the Jest worker.
 */
function spawnFetcher(extraArgs, env) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT, ...extraArgs], {
      env, cwd: join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => done({ status, stdout, stderr }));
  });
}

function runFetcher(extraArgs = [], extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.JEST_WORKER_ID;
  env.KAGGLE_USERNAME = 'test-user';
  env.KAGGLE_KEY = 'test-key';
  env.KAGGLE_API_BASE = `http://127.0.0.1:${port}`;
  return spawnFetcher(extraArgs, env);
}

function serveZip(content, fileName = CSV_NAME) {
  server.nextHandler = (req, res) => {
    res.writeHead(200, { 'content-type': 'application/zip' });
    res.end(storedZip(fileName, content));
  };
}

function serveRawCsv(content) {
  server.nextHandler = (req, res) => {
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
    res.end(content);
  };
}

function tempOut() {
  const out = mkdtempSync(join(dir, 'out-'));
  return out;
}

/* ------------------------------------------------------------------ tests */

describe('fetch_kaggle_advisory · end to end', () => {
  it('exits 0 and writes a fetch report when the CSV is newer than the manifest', async () => {
    const out = tempOut();
    const manifest = join(out, 'manifest.json');
    // Committed state: an older run. Anything newer must be ingested.
    writeFileSync(manifest, JSON.stringify({
      generated_at: '2026-09-16T03:14:42Z',
      row_count: 74,
    }));
    const recent = RECENT_RUN();

    serveZip(advisoryCsv({ generatedAt: recent }));

    const run = await runFetcher([
      '--out', out,
      '--manifest', manifest,
      '--attempts', '1',
      '--dataset', 'myself-aas/hazardnet-weekly-forecasts',
    ]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('✅ Fetched 3 advisory rows');
    expect(server.lastAuth).toBe(`Basic ${Buffer.from('test-user:test-key').toString('base64')}`);
    expect(server.lastUrl).toContain('/api/v1/datasets/download/myself-aas/hazardnet-weekly-forecasts');
    expect(existsSync(join(out, CSV_NAME))).toBe(true);

    const report = JSON.parse(readFileSync(join(out, 'fetch-report.json'), 'utf8'));
    expect(report.rows).toBe(3);
    expect(report.generatedAt).toBe(recent);
    expect(report.newer).toBe(true);
    expect(report.stale).toBe(false);
    expect(report.age_hours).toBeGreaterThan(4);
    expect(report.age_hours).toBeLessThanOrEqual(36);
    expect(report.via).toMatch(/dataset download/);
    // The report is what the workflow attaches to its job summary on the unchanged path.
    expect(report.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts Kaggle’s raw CSV response as well as a zip archive', async () => {
    const out = tempOut();
    const manifest = join(out, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ generated_at: kaggleStamp(200), row_count: 1 }));
    const source = advisoryCsv({ generatedAt: RECENT_RUN() });
    serveRawCsv(source);

    const run = await runFetcher([
      '--out', out, '--manifest', manifest, '--attempts', '1',
      '--dataset', 'ashifahmedshuvo/hazardnet-weekly-forecasts',
    ]);

    expect(run.status).toBe(0);
    expect(readFileSync(join(out, CSV_NAME), 'utf8')).toBe(source);
    expect(server.lastUrl).toContain('/api/v1/datasets/download/ashifahmedshuvo/hazardnet-weekly-forecasts');
  });

  it('exits 2 — not 0 — when the fetch succeeds but the CSV has not changed', async () => {
    // The failure mode this script was written for: a healthy download of a stale file is a
    // missed Kaggle schedule, and must not be laundered into a fresh ingest.
    const out = tempOut();
    const manifest = join(out, 'manifest.json');
    const served = advisoryCsv({ generatedAt: kaggleStamp(30) });   // inside the gate
    writeFileSync(manifest, JSON.stringify({
      generated_at: kaggleStamp(10),   // newer than the CSV we are about to serve
      row_count: 3,
      source_csv_sha256: require('node:crypto').createHash('sha256').update(served).digest('hex'),
    }));

    serveZip(served);

    const run = await runFetcher([
      '--out', out, '--manifest', manifest, '--attempts', '1',
    ]);

    expect(run.status).toBe(2);
    expect(run.stdout).toContain('unchanged since');
    expect(run.stdout).toContain('Kaggle notebook is scheduled daily');
    // It still downloaded and inspected — the report proves the fetch half worked.
    const report = JSON.parse(readFileSync(join(out, 'fetch-report.json'), 'utf8'));
    expect(report.newer).toBe(false);
    // This is the "not newer" reason, not the staleness gate: 30 h is inside 36 h.
    expect(report.stale).toBe(false);
  });

  it('exits 2 and names the age when the CSV is new but past the ingest gate', async () => {
    // The 2026-10-04 production failure, reproduced: the published file *was* newer than the
    // committed manifest, so the fetch called it fresh, the ingest then rejected it as
    // STALE_DATA, and the artifact commit and deploy steps were skipped behind that error.
    const out = tempOut();
    const manifest = join(out, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({
      generated_at: '2026-09-16T03:14:42Z',   // the real committed manifest of that week
      row_count: 74,
    }));
    serveZip(advisoryCsv({ generatedAt: STALE_RUN() }));

    const run = await runFetcher(['--out', out, '--manifest', manifest, '--attempts', '1']);

    expect(run.status).toBe(2);
    expect(run.stdout).toContain('36 h ingest gate');
    expect(run.stdout).toContain('STALE_DATA');
    const report = JSON.parse(readFileSync(join(out, 'fetch-report.json'), 'utf8'));
    expect(report.newer).toBe(false);
    expect(report.stale).toBe(true);
    expect(report.age_hours).toBeGreaterThan(59);
    expect(report.age_hours).toBeLessThan(61);
  });

  it('honours --max-age-hours and --force over the gate', async () => {
    const served = advisoryCsv({ generatedAt: STALE_RUN() });
    const oldManifest = JSON.stringify({ generated_at: '2026-09-16T03:14:42Z', row_count: 74 });

    const out = tempOut();
    const manifest = join(out, 'manifest.json');
    writeFileSync(manifest, oldManifest);
    serveZip(served);
    const widened = await runFetcher([
      '--out', out, '--manifest', manifest, '--attempts', '1', '--max-age-hours', '100',
    ]);
    expect(widened.status).toBe(0);

    const forcedOut = tempOut();
    const forcedManifest = join(forcedOut, 'manifest.json');
    writeFileSync(forcedManifest, oldManifest);
    serveZip(served);
    const forced = await runFetcher([
      '--out', forcedOut, '--manifest', forcedManifest, '--attempts', '1', '--force',
    ]);
    expect(forced.status).toBe(0);
  });

  it('exits 1 and names the credential problem when Kaggle rejects the key', async () => {
    const out = tempOut();
    server.nextHandler = (req, res) => res.writeHead(401).end('Unauthorized');

    const run = await runFetcher(['--out', out, '--attempts', '1']);

    expect(run.status).toBe(1);
    // Fatal (401/403) must skip the retry loop's backoff rather than sleeping 40s.
    expect(run.stderr).toContain('rejected the configured credentials');
    expect(run.stderr).toContain('HTTP 401');
  });

  it('exits 1 when the archive unpacks to a CSV with no data rows', async () => {
    const out = tempOut();
    serveZip('district,hazard_type,generated_at\n');   // header only

    const run = await runFetcher(['--out', out, '--attempts', '1']);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('no data rows');
  });

  it('tries the public dataset without credentials and explains the optional CLI fallback', async () => {
    // The user supplied a public dataset, so credentials are not required for the primary
    // HTTP path. A network/slug failure still needs to be visible; it must not silently
    // fall back to the committed snapshot and pretend the daily fetch worked.
    const out = tempOut();
    const env = { ...process.env, KAGGLE_API_BASE: `http://127.0.0.1:${port}` };
    delete env.JEST_WORKER_ID;
    delete env.KAGGLE_USERNAME;
    delete env.KAGGLE_KEY;

    const result = await spawnFetcher(['--out', out, '--attempts', '1'], env);

    expect(result.status).toBe(1);
    expect(result.status).toBe(1);
    expect(server.lastAuth).toBeUndefined();
    expect(result.stderr).toContain('Kaggle CLI/kernel fallback requires KAGGLE_USERNAME and KAGGLE_KEY');
  });
});

describe('zip helper used by the fixtures', () => {
  it('produces an archive both extractors can read', () => {
    // Guards the fixture itself: if the hand-rolled zip is malformed, every test above
    // would fail for the wrong reason.
    const out = tempOut();
    const archive = join(out, 'a.zip');
    writeFileSync(archive, storedZip('inner.txt', 'hello zip'));
    const viaUnzip = execFileSync('unzip', ['-o', '-p', archive, 'inner.txt'], { encoding: 'utf8' });
    expect(viaUnzip).toBe('hello zip');
  });
});
