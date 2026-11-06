#!/usr/bin/env node
/**
 * RFC 9728 acceptance check — ask the external scanner what it actually saw.
 *
 * The published requirement is not "we serve metadata" but "the scanner passes it":
 *
 *   POST https://isitagentready.com/api/scan
 *   Content-Type: application/json
 *   {"url": "https://hazardnet.live"}
 *
 *   → checks.discovery.oauthProtectedResource.status === "pass"
 *
 * This script runs that POST and reports the value it received. It never synthesises a
 * pass: a transport failure, a non-JSON body or a missing field is INCONCLUSIVE (exit 2),
 * and a status other than `pass` is a FAIL (exit 1). Only a literal `pass` exits 0.
 *
 *   node scripts/scan_agent_readiness.mjs                       # production URL
 *   node scripts/scan_agent_readiness.mjs --url https://www.hazardnet.live
 *   node scripts/scan_agent_readiness.mjs --out /tmp/agent-readiness.json \
 *     --summary /tmp/agent-readiness-summary.md
 *   node scripts/scan_agent_readiness.mjs --from-file saved-response.json
 *
 * `--endpoint` exists so the test suite can point the real request path at a local mock
 * and assert the method, content type and body byte-for-byte. No dependencies, no
 * credentials: the scanner is a public endpoint and the payload is a public URL.
 *
 * Run from `.github/workflows/site-health.yml`'s agent-readiness job (manual dispatch),
 * because the sandbox that builds this repo cannot reach the scanner directly.
 */
import { writeFileSync } from 'node:fs';

const DEFAULT_ENDPOINT = 'https://isitagentready.com/api/scan';
const DEFAULT_URL = 'https://hazardnet.live';
const CHECK_PATH = 'checks.discovery.oauthProtectedResource.status';
const EXIT = { pass: 0, fail: 1, inconclusive: 2 };

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const endpoint = argValue('--endpoint', process.env.AGENT_SCAN_ENDPOINT || DEFAULT_ENDPOINT);
const siteUrl = argValue('--url', process.env.SITE_URL || DEFAULT_URL);
const outFile = argValue('--out', '');
const summaryFile = argValue('--summary', '');
const fromFile = argValue('--from-file', '');
const timeoutMs = Number(argValue('--timeout', '120000'));
const attempts = Math.max(1, Number(argValue('--attempts', '2')));

/** Read the one field the requirement names. Anything absent stays absent. */
function checkStatus(payload) {
  const node = payload?.checks?.discovery?.oauthProtectedResource;
  return typeof node?.status === 'string' ? node.status : null;
}

async function readPayload() {
  if (fromFile) {
    const { readFileSync } = await import('node:fs');
    return { raw: readFileSync(fromFile, 'utf8'), httpStatus: null };
  }
  const body = JSON.stringify({ url: siteUrl });
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${endpoint}`);
      return { raw, httpStatus: response.status };
    } catch (error) {
      lastError = error;
      console.error(`[agent-readiness] attempt ${attempt}/${attempts} failed: ${error.message}`);
    }
  }
  throw lastError ?? new Error('scan failed');
}

function writeSummary(lines) {
  if (!summaryFile) return;
  writeFileSync(summaryFile, `${lines.join('\n')}\n`, 'utf8');
}

let raw = '';
let payload = null;
let transportError = null;
try {
  const result = await readPayload();
  raw = result.raw;
  payload = JSON.parse(raw);
} catch (error) {
  transportError = error.message;
}

if (outFile && raw) writeFileSync(outFile, raw, 'utf8');

const status = checkStatus(payload);
const detail = payload?.checks?.discovery?.oauthProtectedResource;
const outcome = transportError || status === null ? 'inconclusive' : status === 'pass' ? 'pass' : 'fail';

const lines = [
  '### Agent readiness — OAuth Protected Resource Metadata (RFC 9728)',
  '',
  `- scanned URL: ${siteUrl}`,
  `- scanner: ${fromFile ? `saved response (${fromFile})` : `POST ${endpoint}`}`,
  `- \`${CHECK_PATH}\`: ${status === null ? 'absent' : status}`,
  `- outcome: **${outcome}**`,
];
if (transportError) lines.push(`- error: ${transportError}`);
if (detail) lines.push('', '```json', JSON.stringify(detail, null, 2), '```');

for (const line of lines) console.log(`[agent-readiness] ${line}`);
writeSummary(lines);

if (outcome === 'inconclusive') {
  console.error(
    `[agent-readiness] INCONCLUSIVE — the scanner did not return ${CHECK_PATH}. ` +
      'This is not a pass; re-run once the scanner is reachable.',
  );
} else if (outcome === 'fail') {
  console.error(`[agent-readiness] FAIL — ${CHECK_PATH} is "${status}", required "pass".`);
} else {
  console.log(`[agent-readiness] PASS — ${CHECK_PATH} is "pass".`);
}
process.exit(EXIT[outcome]);
