// CI dependency gate: `npm audit --omit=dev` minus accepted-risk exceptions.
//
// Fails closed on high/critical advisories, invalid audit output, or expired
// exceptions. Native TFJS install-tooling exceptions were retired with the
// dependency; new exceptions require explicit review.
// Exit 0 = pass, 1 = fail. Moderate/low are reported, never gated
// (same semantics as the old --audit-level=high flag).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const today = new Date().toISOString().slice(0, 10);

let audit;
try {
  const out = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  });
  audit = JSON.parse(out);
} catch (err) {
  // npm audit exits non-zero when vulns exist — the JSON is still on stdout.
  const out = err.stdout || '';
  try {
    audit = JSON.parse(out);
  } catch {
    console.error('[npm-audit-ci] could not parse `npm audit --json` output');
    console.error(String(err.message || err).slice(0, 500));
    process.exit(1);
  }
}

if (audit.error || !audit.metadata?.vulnerabilities || !audit.vulnerabilities) {
  console.error('[npm-audit-ci] Invalid/error audit response; refusing to certify dependencies');
  process.exit(1);
}

const exceptions = JSON.parse(fs.readFileSync(path.join(root, 'audit-exceptions.json'), 'utf8')).exceptions || [];
const allowed = new Map(exceptions.map((e) => [e.ghsa, e]));

// Collect every high/critical advisory instance in the tree.
const found = new Map(); // ghsa -> { severity, packages:Set }
for (const [pkg, info] of Object.entries(audit.vulnerabilities || {})) {
  if (!['high', 'critical'].includes(info.severity)) continue;
  for (const via of info.via || []) {
    if (typeof via !== 'object' || !via.url) continue; // string vias are parent package names
    const ghsa = via.url.split('/').pop();
    if (!found.has(ghsa)) found.set(ghsa, { severity: info.severity, packages: new Set() });
    found.get(ghsa).packages.add(pkg);
  }
}

let failed = false;

// 1. Expired exceptions fail (forces re-review of accepted risk).
for (const e of exceptions) {
  if (e.expires && e.expires < today) {
    console.error(`[npm-audit-ci] EXPIRED exception ${e.ghsa} (expired ${e.expires}) — re-review required`);
    failed = true;
  }
}

// 2. Unlisted high/critical advisories fail.
for (const [ghsa, info] of [...found.entries()].sort()) {
  const pkgs = [...info.packages].join(',');
  if (allowed.has(ghsa)) {
    console.log(`[npm-audit-ci] excepted  ${info.severity.padEnd(8)} ${ghsa} (${pkgs}) expires ${allowed.get(ghsa).expires}`);
  } else {
    console.error(`[npm-audit-ci] BLOCKING  ${info.severity.padEnd(8)} ${ghsa} (${pkgs}) — no entry in audit-exceptions.json`);
    failed = true;
  }
}

// 3. Stale exceptions (no longer reported) are warnings, not failures.
for (const e of exceptions) {
  if (!found.has(e.ghsa)) {
    console.log(`[npm-audit-ci] stale     ${e.ghsa} no longer reported — consider removing the entry`);
  }
}

const meta = audit.metadata?.vulnerabilities || {};
console.log(
  `[npm-audit-ci] tree total: critical=${meta.critical || 0} high=${meta.high || 0} ` +
  `moderate=${meta.moderate || 0} low=${meta.low || 0} info=${meta.info || 0}`
);

if (failed) {
  console.error('[npm-audit-ci] FAIL: unlisted high/critical advisories or expired exceptions');
  process.exit(1);
}
console.log('[npm-audit-ci] PASS: no unlisted high/critical advisories');
