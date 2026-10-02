#!/usr/bin/env node
/**
 * Secret-rotation gate (owner Action 1, `docs/ops/secret-rotation.md`).
 *
 * `data/security/secret-rotation.json` records, per credential, how often it must be
 * rotated and when it last was. Nothing else in the repository had a cadence, and the
 * secrets-audit workflow is dispatch-only, so a credential could sit untouched for years
 * without anything noticing. This script turns the register into a check that can run on a
 * schedule: it prints the state of every credential and exits non-zero when one is past
 * due.
 *
 * Deliberately strict about one thing: an entry with no `last_rotated` date is *unknown*,
 * not "fine". Unknown is a warning by default (otherwise the gate would fail on a register
 * that has never been filled in) and an error under `--strict`, which is the mode to switch
 * the workflow to once the real dates are recorded.
 *
 * Usage:
 *   node scripts/check-secret-rotation.mjs [--manifest <path>] [--strict] [--json]
 *
 * Exit codes: 0 = nothing overdue · 1 = overdue (or, with --strict, unknown) · 2 = the
 * register itself is unreadable or malformed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = join(HERE, '..', 'data', 'security', 'secret-rotation.json');
const DAY_MS = 86_400_000;

function argv(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] ?? true;
}

const hasFlag = (flag) => process.argv.includes(flag);

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(stamp) ? null : stamp;
}

/** One credential's standing: `ok` | `due-soon` | `overdue` | `unknown` | `not-scheduled`. */
export function evaluate(entry, { now, graceDays, warnDays }) {
  if (!entry || typeof entry.id !== 'string' || !entry.id) {
    return { status: 'malformed', id: entry?.id ?? '<missing id>' };
  }
  if (entry.cadence_days === null || entry.cadence_days === undefined) {
    return { status: 'not-scheduled', id: entry.id, cadenceDays: null };
  }
  if (typeof entry.cadence_days !== 'number' || entry.cadence_days <= 0) {
    return { status: 'malformed', id: entry.id, reason: 'cadence_days must be a positive number or null' };
  }
  const rotated = parseDate(entry.last_rotated);
  if (rotated === null) {
    return { status: 'unknown', id: entry.id, cadenceDays: entry.cadence_days };
  }
  const dueAt = rotated + entry.cadence_days * DAY_MS;
  const daysUntilDue = Math.ceil((dueAt - now) / DAY_MS);
  if (daysUntilDue < 0 && -daysUntilDue > graceDays) {
    return { status: 'overdue', id: entry.id, cadenceDays: entry.cadence_days, dueAt, daysOverdue: -daysUntilDue };
  }
  if (daysUntilDue <= warnDays) {
    return { status: 'due-soon', id: entry.id, cadenceDays: entry.cadence_days, dueAt, daysUntilDue };
  }
  return { status: 'ok', id: entry.id, cadenceDays: entry.cadence_days, dueAt, daysUntilDue };
}

export function loadManifest(path = DEFAULT_MANIFEST) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read the rotation register at ${path}: ${error.message}`);
  }
  if (!parsed || !Array.isArray(parsed.secrets)) {
    throw new Error(`${path} must be an object with a "secrets" array`);
  }
  return parsed;
}

/** Evaluate the whole register. Pure: the caller supplies `now`, so the tests are stable. */
export function audit(manifest, { now = Date.now(), strict = false } = {}) {
  const graceDays = manifest.defaults?.grace_days ?? 14;
  const warnDays = manifest.defaults?.warn_days ?? 30;
  const results = manifest.secrets.map((entry) => evaluate(entry, { now, graceDays, warnDays }));
  const overdue = results.filter((r) => r.status === 'overdue' || r.status === 'malformed');
  const unknown = results.filter((r) => r.status === 'unknown');
  return {
    results,
    overdue,
    unknown,
    ok: overdue.length === 0 && !(strict && unknown.length > 0),
    strict,
  };
}

function main() {
  const manifestPath = argv('--manifest', DEFAULT_MANIFEST);
  const strict = hasFlag('--strict');
  const asJson = hasFlag('--json');

  let report;
  try {
    report = audit(loadManifest(manifestPath), { strict });
  } catch (error) {
    process.stderr.write(`❌ ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const icon = { ok: '✅', 'due-soon': '⏳', overdue: '❌', unknown: '❔', 'not-scheduled': '➖', malformed: '💥' };
    process.stdout.write(`Secret-rotation register: ${manifestPath}\n\n`);
    for (const result of report.results) {
      const detail = result.status === 'ok' || result.status === 'due-soon'
        ? `due in ${result.daysUntilDue}d`
        : result.status === 'overdue'
          ? `${result.daysOverdue}d overdue`
          : result.status === 'not-scheduled'
            ? 'no cadence (rotate on compromise)'
            : result.status === 'unknown'
              ? 'last rotation never recorded'
              : result.reason ?? 'malformed entry';
      process.stdout.write(`  ${icon[result.status] ?? '·'} ${result.id.padEnd(30)} ${detail}\n`);
    }
    process.stdout.write(`\n${report.results.length} credentials · ${report.overdue.length} overdue · ${report.unknown.length} unrecorded\n`);
    if (report.unknown.length > 0 && !strict) {
      process.stdout.write('   Unrecorded dates are a warning, not a failure. Record them as you rotate,\n');
      process.stdout.write('   then switch the workflow to --strict so a missing date is caught too.\n');
    }
  }

  process.exitCode = report.ok ? 0 : 1;
  if (!report.ok) {
    const label = report.overdue.length > 0 ? `${report.overdue.length} credential(s) past due` : 'unrecorded rotation dates';
    process.stderr.write(`❌ Secret-rotation check failed: ${label} (docs/ops/secret-rotation.md)\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
