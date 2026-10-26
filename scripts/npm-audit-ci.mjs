#!/usr/bin/env node
/**
 * Production dependency audit gate — restored 2026-10-25 (deleted in the history squash;
 * `ci.yml`'s `security-audit` job invokes this exact path, and `audit-exceptions.json`'s
 * `_comment` names it as the gate it feeds).
 *
 * Replaces bare `npm audit --audit-level=high`, which can never pass while accepted
 * transitive advisories exist. Contract (from audit-exceptions.json):
 *
 *   - every exception entry MUST carry an expiry; the gate FAILS on an expired entry
 *     (accepted risk decays; re-review or drop the package);
 *   - the gate FAILS CLOSED on any unlisted high/critical GHSA advisory;
 *   - advisories are matched by GHSA id (stable across versions).
 *
 * Local run: `node scripts/npm-audit-ci.mjs` (needs the npm registry).
 * Exit codes: 0 pass · 1 unlisted or expired advisories · 2 audit itself failed to run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXCEPTIONS_PATH = join(ROOT, 'audit-exceptions.json');
const BLOCKING = new Set(['high', 'critical']);

let report;
try {
  // `npm audit` exits non-zero when vulnerabilities exist; the JSON is still the payload.
  const out = execFileSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8' });
  report = JSON.parse(out);
} catch (error) {
  if (error.stdout) {
    try {
      report = JSON.parse(error.stdout);
    } catch {
      console.error('[audit] npm audit produced unparseable output:', String(error.message).slice(0, 400));
      process.exit(2);
    }
  } else {
    console.error('[audit] npm audit failed to run:', error.message);
    process.exit(2);
  }
}

/** Flatten the audit report to unique {ghsa, pkg, severity, title} advisories. */
function advisories(r) {
  const byId = new Map();
  for (const vuln of Object.values(r.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object') continue; // string entries name dependent packages
      const ghsa = (via.url ?? '').match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i)?.[0];
      if (!ghsa) continue;
      if (!byId.has(ghsa)) {
        byId.set(ghsa, {
          ghsa,
          pkg: `${via.name ?? vuln.name}`,
          severity: (via.severity ?? vuln.severity ?? '').toLowerCase(),
          title: via.title ?? '',
        });
      }
    }
  }
  return [...byId.values()];
}

const exceptions = new Map(
  (JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8')).exceptions ?? []).map((e) => [e.ghsa, e]),
);

const today = new Date().toISOString().slice(0, 10);
const findings = advisories(report);
const blocking = findings.filter((f) => BLOCKING.has(f.severity));

const failures = [];
const accepted = [];
for (const f of blocking) {
  const exception = exceptions.get(f.ghsa);
  if (!exception) {
    failures.push(`UNLISTED ${f.severity} ${f.ghsa} in ${f.pkg} — ${f.title}`);
    continue;
  }
  if (!exception.expires) {
    failures.push(`${f.ghsa} exception carries no expiry — accepted-risk entries must expire`);
    continue;
  }
  if (exception.expires < today) {
    failures.push(`EXPIRED ${f.ghsa} exception (expired ${exception.expires}) in ${f.pkg} — re-review or fix`);
    continue;
  }
  accepted.push(`accepted (until ${exception.expires}): ${f.ghsa} in ${f.pkg} — ${exception.reason}`);
}

for (const line of accepted) console.log(`[audit] ${line}`);
if (findings.length) {
  const lowMod = findings.filter((f) => !BLOCKING.has(f.severity));
  if (lowMod.length) console.log(`[audit] informational only: ${lowMod.length} moderate/low advisories (not gating)`);
}

if (failures.length) {
  console.error(`\n[audit] FAIL — ${failures.length} blocking advisories:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('\n  Fix the dependency, or record an accepted-risk entry in audit-exceptions.json with an expiry.');
  process.exit(1);
}
console.log(`[audit] OK: ${blocking.length ? `${accepted.length} high/critical advisories, all within accepted-risk expiries` : 'no high/critical advisories'}`);
