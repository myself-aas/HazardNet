#!/usr/bin/env node
/**
 * rehearse_alert_engine.mjs — the offline alert-engine rehearsal (Phase 5).
 *
 * Runs the REAL engine (`backend/alerts/service.js#runAlertEngine`) over a forecast
 * snapshot (committed or rebuilt) against an in-memory DOCUMENT store implementing the
 * contract the engine actually calls (see `memoryStore`). Nothing touches Firestore, no
 * notification fan-out runs, and the store is discarded — but the lifecycle, §1.6
 * publication gate, and run report are the production code path.
 *
 * The point of the rehearsal is honesty under failure: if the snapshot's rows lack the
 * provenance §1.6 requires (a model version), the engine must not invent one — every
 * row comes back `publication_blocked` with the reason on the record, and the report
 * says so. When provenance is present, the same run publishes what the policy level
 * allows (auto-publish ceiling: WATCH). __tests__/alertReplay.test.js pins both arms.
 *
 * CLI:  node scripts/rehearse_alert_engine.mjs [--snapshot path] [--out path] [--quiet]
 * Default snapshot: frontend/public/data/forecasts-latest.json → /tmp/alert-run.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAlertEngine } from '../backend/alerts/service.js';

const DEFAULT_SNAPSHOT = 'frontend/public/data/forecasts-latest.json';

/** Flatten a snapshot's horizons block into row records, keeping the horizon label. */
export function rowsFromSnapshot(snapshot) {
  const rows = [];
  if (!snapshot || typeof snapshot !== 'object') return rows;
  for (const [horizon, horizonRows] of Object.entries(snapshot.horizons || {})) {
    if (Array.isArray(horizonRows)) {
      for (const row of horizonRows) rows.push({ ...row, horizon: row.horizon || horizon });
    }
  }
  return rows;
}

/**
 * In-memory document store with the interface `runAlertEngine` (and
 * getAlertRunState/setAlertRunState) requires: the four document methods plus the
 * `_meta` behaviour implicitly (run state is just another document). Newer
 * `prediction_date` wins `getLatestDocumentForAlertKey`, SUPERSEDED is never "latest".
 */
export function memoryStore() {
  const docs = new Map();
  return {
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
    async listDocuments({ state, level, horizon, districtId, max = 200 } = {}) {
      return [...docs.values()]
        .filter((doc) => doc.id !== '_meta')
        .filter((doc) => (state ? doc.state === state : true))
        .filter((doc) => (level ? doc.level === level : true))
        .filter((doc) => (horizon ? doc.horizon === horizon : true))
        .filter((doc) => (districtId !== undefined && districtId !== null
          ? Number(doc.district_id) === Number(districtId) : true))
        .slice(0, max);
    },
  };
}

/**
 * Run the engine over `snapshot` (or --snapshot's JSON) against a fresh memory store.
 *
 * Returns the engine report extended with the rehearsal-specific fields the test pin
 * reads: `rows_total`/`assessed` (the engine skips nothing in a rehearsal),
 * `alerts` (the post-persistence documents, so `publication_blocked_reason` and the
 * final states are inspectable), `snapshot_schema`/`prediction_date`/provenance, and a
 * human sentence about what the honesty gate did (`provenance_note`).
 */
export async function rehearseAlertEngine({ snapshot, snapshotPath, now = new Date(), out, env } = {}) {
  const root = process.cwd();
  let snap = snapshot;
  if (!snap && snapshotPath) {
    const fullPath = path.resolve(root, snapshotPath);
    if (fs.existsSync(fullPath)) {
      snap = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
  }
  const rows = rowsFromSnapshot(snap);
  const store = memoryStore();

  const report = await runAlertEngine({
    rows,
    store,
    now,
    env: env || { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' },
  });

  // Post-persistence documents, in insertion order. Assessment objects (batch.alerts)
  // are pre-persistence and always DRAFT-shaped; the truth the rehearsal exists to
  // expose is on the documents.
  const alerts = [...store.docs.values()].filter((doc) => doc.id !== '_meta');

  const blockedCount = report.persisted.blocked || 0;
  const provenanceNote = report.persisted.published > 0
    ? 'Rows carried the provenance §1.6 requires, so the rehearsal published at or below the '
      + `auto-publish ceiling (${report.max_auto_publish_level}).`
    : 'The rows did not carry the provenance §1.6 requires, so the rehearsal must not invent a '
      + `model version: ${blockedCount} row(s) came back publication_blocked instead.`;

  const enriched = {
    ...report,
    generated_at: now.toISOString(),
    rows_total: rows.length,
    assessed: report.rows,
    skipped: report.batch.skipped || [],
    counts: report.batch.counts,
    saturation: report.batch.saturation,
    alerts,
    snapshot_schema: snap?.schema ?? null,
    prediction_date: snap?.prediction_date ?? null,
    provenance: snap?.provenance ?? null,
    provenance_note: provenanceNote,
  };

  if (out) {
    const outPath = path.resolve(root, out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2), 'utf8');
  }
  return enriched;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  const snapshotPath = getArg('--snapshot') || DEFAULT_SNAPSHOT;
  const outPath = getArg('--out') || '/tmp/alert-run.json';
  const quiet = args.includes('--quiet');

  rehearseAlertEngine({ snapshotPath, out: outPath })
    .then((report) => {
      if (!quiet) {
        console.log(
          `[rehearse_alert_engine] assessed ${report.assessed} rows → ` +
          `${report.persisted.published} published, ${report.persisted.blocked} blocked, ` +
          `${report.persisted.pending_review} pending review → ${outPath}`,
        );
      }
    })
    .catch((error) => {
      console.error('[rehearse_alert_engine] Error:', error);
      process.exit(1);
    });
}
