/**
 * @jest-environment node
 *
 * RFC 9728 acceptance check — the scanner's verdict, not our own opinion.
 *
 * The payload shapes below are the DOCUMENTED contract path from the requirement
 * (`checks.discovery.oauthProtectedResource.status`), not a captured scan: this suite
 * pins how the script reads and reports that path. The first real response is recorded
 * by the `agent-readiness` job's uploaded artifact in .github/workflows/site-health.yml.
 *
 * The script is spawned as a real child process against a real local HTTP server, so the
 * method, Content-Type and request body are asserted on the wire — a mocked `fetch` would
 * not catch a GET-with-query-string regression, which the scanner answers with
 * {"error":"Method not allowed. Use POST."}.
 */
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'scan_agent_readiness.mjs');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/site-health.yml'), 'utf8');

const CHECK = { status: 'pass', resource: 'https://www.hazardnet.live' };
const payload = (status) => ({ checks: { discovery: { oauthProtectedResource: { ...CHECK, status } } } });

let server;
let received;
let handler;
let baseUrl;
let tmpDir;

beforeAll((done) => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hazardnet-agent-scan-'));
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}/api/scan`;
    done();
  });
});

afterAll((done) => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  server.close(done);
});

beforeEach(() => {
  received = [];
  handler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload('pass')));
  };
});

/**
 * Spawn asynchronously: the mock server lives in THIS process, so a synchronous
 * spawn would block the very event loop that has to accept the request and the
 * "request" would time out. Every verdict below is a real round trip.
 */
function run(extraArgs = []) {
  // Merge, never append: the script reads the FIRST occurrence of a flag, so
  // appending `--url` twice would silently test the default instead of the override.
  const options = {
    '--endpoint': baseUrl,
    '--url': 'https://hazardnet.live',
    '--attempts': '1',
    '--timeout': '5000',
  };
  for (let i = 0; i < extraArgs.length; i += 2) options[extraArgs[i]] = extraArgs[i + 1];
  return exec(Object.entries(options).flat());
}

function exec(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('the request the scanner actually receives', () => {
  test('is a POST with a JSON content type and the exact {"url":…} body', async () => {
    const result = await run();
    expect(result.status).toBe(0);
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('POST');
    expect(received[0].url).toBe('/api/scan');
    expect(received[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(received[0].body)).toEqual({ url: 'https://hazardnet.live' });
    expect(result.stdout).toContain('`checks.discovery.oauthProtectedResource.status`: pass');
  });

  test('scans the URL it was given, not a hardcoded host', async () => {
    const result = await run(['--url', 'https://www.hazardnet.live']);
    expect(result.status).toBe(0);
    expect(JSON.parse(received[0].body)).toEqual({ url: 'https://www.hazardnet.live' });
  });
});

describe('exit status is the scanner verdict, never an assumed pass', () => {
  test('pass exits 0 and writes the raw response and the summary', async () => {
    const out = path.join(tmpDir, 'scan.json');
    const summary = path.join(tmpDir, 'summary.md');
    const result = await run(['--out', out, '--summary', summary]);
    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).checks.discovery.oauthProtectedResource.status).toBe('pass');
    const markdown = fs.readFileSync(summary, 'utf8');
    expect(markdown).toContain('outcome: **pass**');
    expect(markdown).toContain('https://hazardnet.live');
  });

  test('a non-pass status exits 1 and names the value it saw', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload('fail')));
    };
    const result = await run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is "fail", required "pass"');
  });

  test('a missing check field is inconclusive (exit 2), not a pass', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ checks: { discovery: {} } }));
    };
    const result = await run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('INCONCLUSIVE');
  });

  test('an HTTP error is inconclusive and is retried up to --attempts', async () => {
    handler = (_req, res) => { res.writeHead(503); res.end('unavailable'); };
    const result = await run(['--attempts', '2']);
    expect(result.status).toBe(2);
    expect(received).toHaveLength(2);
    expect(result.stderr).toContain('HTTP 503');
  });

  test('a non-JSON body is inconclusive rather than a crash', async () => {
    handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>blocked</html>'); };
    const result = await run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('INCONCLUSIVE');
  });

  test('--from-file re-reads a saved response without touching the network', async () => {
    const saved = path.join(tmpDir, 'saved.json');
    fs.writeFileSync(saved, JSON.stringify(payload('fail')), 'utf8');
    const result = await exec(['--from-file', saved]);
    expect(result.status).toBe(1);
    expect(received).toHaveLength(0);
  });
});

describe('site-health workflow wiring', () => {
  test('the scan runs as a dispatch-only job in the existing workflow', () => {
    expect(workflow).toContain('node scripts/scan_agent_readiness.mjs');
    expect(workflow).toMatch(/agent-readiness:[\s\S]*?if: github\.event_name == 'workflow_dispatch'/);
    expect(workflow).toContain('scan_only:');
    // A scan-only dispatch must not also publish a probe record commit.
    expect(workflow).toMatch(/probe:[\s\S]*?if: inputs\.scan_only != true/);
  });

  test('the job uploads the raw scanner response and prints the summary', () => {
    const job = workflow.slice(workflow.indexOf('\n  agent-readiness:'));
    expect(job).toContain('--out /tmp/agent-readiness.json');
    expect(job).toContain('--summary /tmp/agent-readiness-summary.md');
    expect(job).toContain('cat /tmp/agent-readiness-summary.md >> "$GITHUB_STEP_SUMMARY"');
    expect(job).toContain('actions/upload-artifact@v7');
    expect(job).toContain('contents: read');
    expect(job).not.toContain('contents: write');
  });

  test('the probe job stays first and keeps its job-scoped write permission', () => {
    expect(workflow.indexOf('\n  probe:')).toBeLessThan(workflow.indexOf('\n  agent-readiness:'));
    expect(workflow.indexOf('\npermissions:')).toBe(-1);
  });
});
