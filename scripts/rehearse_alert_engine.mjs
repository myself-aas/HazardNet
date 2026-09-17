#!/usr/bin/env node
/**
 * Replay the alert engine locally, offline, over a committed forecast snapshot.
 *
 *   node scripts/rehearse_alert_engine.mjs [--snapshot frontend/public/data/forecasts-latest.json]
 *                                          [--out /tmp/alert-run.json] [--now 2026-09-18T06:00:00Z]
 *
 * Why this exists
 * ---------------
 * The production path is `/api/v1/alerts/run` (GitHub workflow → hosted backend →
 * Firestore). Neither the deployed backend nor a Firestore project is reachable from a
 * developer machine or from CI, but the *engine itself* is pure: it is a function of
 * (rows, policy, now) plus a document store. This script supplies the rows from the
 * committed forecast snapshot and an in-memory store, then runs the **real**
 * `runAlertEngine`, `assessBatch` and policy code from `backend/alerts/`. Nothing is
 * re-implemented and nothing about the assessment differs from production except where
 * the rows come from.
 *
 * What it deliberately does NOT do
 * --------------------------------
 * It never invents provenance. The committed snapshot's rows carry
 * `provenance.model_version: null`, and §1.6 requires a model version before an alert
 * may be published, so every row comes out of the run as DRAFT with
 * `publication_blocked_reason` set. That is the correct outcome and the script reports
 * it loudly instead of stamping a plausible-looking version to make the demo nicer —
 * stamping one would be fabricating lineage, which is exactly what Phases 2–4 removed.
 *
 * Use it to: exercise the whole alert path offline (CI smoke test), regenerate the
 * committed `frontend/public/data/alerts-latest.json` fallback, and rehearse the
 * Phase 9 tabletop before the pipeline runs live.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAlertEngine } from '../backend/alerts/service.js';
import { describePolicy, getPolicy } from '../backend/alerts/policy.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const REPLAY_KIND = 'alert-engine-replay';

/** In-memory store with the same method semantics as backend/alerts/store.js. */
export function memoryStore(seed = []) {
  const docs = new Map(seed.map((doc) => [doc.id, doc]));
  return {
    mode: 'memory-replay',
    docs,
    async putDocument(doc) {
      docs.set(doc.id, doc);
      return doc;
    },
    async getDocument(id) {
      return docs.get(id) || null;
    },
    async getLatestDocumentForAlertKey(key) {
      const live = [...docs.values()]
        .filter((doc) => doc.alert_key === key && doc.state !== 'SUPERSEDED')
        .sort((a, b) => String(b.prediction_date || '').localeCompare(String(a.prediction_date || '')));
      return live[0] || null;
    },
    async listDocuments({ state, level } = {}) {
      return [...docs.values()]
        .filter((doc) => doc.id !== '_meta')
        .filter((doc) => (state ? doc.state === state : true))
        .filter((doc) => (level ? doc.level === level : true));
    },
  };
}

/** Flatten a forecast snapshot's `horizons` block into engine rows. */
export function rowsFromSnapshot(snapshot) {
  const horizons = snapshot?.horizons && typeof snapshot.horizons === 'object' ? snapshot.horizons : {};
  const rows = [];
  for (const [horizon, list] of Object.entries(horizons)) {
    for (const row of Array.isArray(list) ? list : []) {
      rows.push({ ...row, horizon: row.horizon || horizon });
    }
  }
  return rows;
}

export async function rehearseAlertEngine({ snapshot, now = new Date(), env = {} } = {}) {
  const rows = rowsFromSnapshot(snapshot);
  const store = memoryStore();
  const policy = getPolicy({ ...env, ...(env.policy_overrides || {}) });
  const run = await runAlertEngine({
    rows,
    store,
    policy,
    now,
    env: { ALERT_AUTO_PUBLISH: 'true', ...env },
  });
  const documents = [...store.docs.values()].filter((doc) => doc.id !== '_meta');

  return {
    kind: REPLAY_KIND,
    generated_at: run.ran_at,
    source: `alert engine replay over ${snapshot?.schema || 'forecast snapshot'} ` +
      `(prediction_date ${snapshot?.prediction_date || 'unknown'})`,
    snapshot_schema: snapshot?.schema || null,
    prediction_date: snapshot?.prediction_date || null,
    forecast_provenance: snapshot?.provenance || null,
    coverage: snapshot?.coverage || null,
    policy_version: run.policy_version,
    max_auto_publish_level: run.max_auto_publish_level,
    assessed: run.batch.assessed,
    rows_total: run.rows,
    skipped: run.batch.skipped,
    counts: run.batch.counts,
    saturation: run.batch.saturation,
    persisted: run.persisted,
    policy: describePolicy(policy),
    alerts: documents,
    provenance_note:
      'Replayed offline from the committed forecast snapshot with an in-memory alert store. '
      + 'Rows whose snapshot carries no model version cannot be published (§1.6), so they are '
      + 'reported as blocked rather than stamped with an invented version.',
  };
}

function parseArgs(argv) {
  const args = {
    snapshot: resolve(ROOT, 'frontend/public/data/forecasts-latest.json'),
    out: resolve(ROOT, 'frontend/public/data/alerts-latest.json'),
    now: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--snapshot') args.snapshot = resolve(process.cwd(), argv[++i]);
    else if (arg === '--out') args.out = resolve(process.cwd(), argv[++i]);
    else if (arg === '--now') args.now = new Date(argv[++i]);
    else if (arg === '--quiet') args.quiet = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node scripts/rehearse_alert_engine.mjs [--snapshot in.json] [--out run.json] [--now ISO] [--quiet]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(args.snapshot, 'utf8'));
  const result = await rehearseAlertEngine({ snapshot, now: args.now || new Date() });

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);

  if (!args.quiet) {
    const blocked = Object.entries(result.persisted.blocked_reasons || {})
      .map(([reason, count]) => `${count}× ${reason}`)
      .join('; ') || 'none';
    console.log(`[alert-replay] rows=${result.rows_total} assessed=${result.assessed} `
      + `published=${result.persisted.published} pending_review=${result.persisted.pending_review} `
      + `blocked=${result.persisted.blocked} skipped=${result.skipped.length}`);
    console.log(`[alert-replay] levels=${JSON.stringify(result.counts)}`);
    console.log(`[alert-replay] blocked because: ${blocked}`);
    if (result.persisted.published === 0 && result.assessed > 0) {
      console.log('[alert-replay] NOTE: nothing could be published — the rows carry no model '
        + 'version, so §1.6 blocks publication. That is the expected result for the current '
        + 'committed snapshot and must not be papered over with a stamped version.');
    }
    console.log(`[alert-replay] wrote ${args.out}`);
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[alert-replay] ${error.stack || error.message}`);
    process.exit(1);
  });
}
