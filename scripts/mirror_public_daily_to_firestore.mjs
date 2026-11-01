#!/usr/bin/env node
/**
 * Manual, Admin-only mirror of an already approved PUBLIC daily asset. This is
 * never called by the Kaggle ingest workflow, the frontend build or Pages.
 * --confirm-run is an operator safety check, not a reviewer attestation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePublicDailySnapshot } from '../backend/utils/dailyAdvisoryPublic.js';
import { mirrorApprovedDailySnapshot, readMirroredDailySnapshot } from '../backend/utils/publicDailyFirestore.js';
import { checkPublicDailyAsset, validateReleasableDailySnapshot } from './check_public_daily_asset.mjs';
import { projectDailyInput } from './build_public_daily_advisories.mjs';

const PUBLIC_ASSET = fileURLToPath(new URL('../frontend/public/data/daily-advisories-v1.json', import.meta.url));

export async function main(argv = process.argv.slice(2)) {
  let commit = false;
  let expectedRunId = null;
  let input = null;
  let manifest = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--commit' && !commit) commit = true;
    else if (argv[index] === '--confirm-run' && !expectedRunId && argv[index + 1]) {
      expectedRunId = argv[++index];
    } else if (argv[index] === '--input' && !input && argv[index + 1]) {
      input = argv[++index];
    } else if (argv[index] === '--manifest' && !manifest && argv[index + 1]) {
      manifest = argv[++index];
    } else throw new Error('Usage: mirror_public_daily_to_firestore.mjs --input PRIVATE_CSV --manifest ISSUED_RECEIPT [--confirm-run RUN_ID] [--commit]');
  }
  checkPublicDailyAsset({ requirePublished: true });
  const snapshot = parsePublicDailySnapshot(JSON.parse(readFileSync(PUBLIC_ASSET, 'utf8')));
  validateReleasableDailySnapshot(snapshot);
  if (!snapshot) throw new Error('No valid public daily result to mirror');
  if (expectedRunId && expectedRunId !== snapshot.run.id) throw new Error('Public run ID does not match confirmation');
  if (!input || !manifest) throw new Error('An issued manifest and matching private CSV are required to mirror');
  const authorizedSnapshot = await projectDailyInput({ input, manifest, publish: true });
  validateReleasableDailySnapshot(authorizedSnapshot);
  if (JSON.stringify(authorizedSnapshot) !== JSON.stringify(snapshot)) {
    throw new Error('Public daily result does not match the approval-bound CSV projection');
  }
  if (!commit) {
    console.log(`[daily-public] Dry run only: ${snapshot.run.id}, ${snapshot.coverage.publishedRows} public rows; no Firestore access.`);
    return { status: 'dry-run' };
  }
  if (!expectedRunId) throw new Error('--commit requires --confirm-run RUN_ID (not a publication approval)');

  // Only the explicit operator command loads Firebase Admin credentials. Neither
  // the public site nor CI has this writer import or access to private inputs.
  const { getForecastWriter } = await import('../backend/forecastPersistence.js');
  const db = getForecastWriter();
  const result = await mirrorApprovedDailySnapshot(snapshot, { db, expectedRunId });
  const restored = await readMirroredDailySnapshot(db);
  if (!restored || JSON.stringify(restored) !== JSON.stringify(snapshot)) {
    throw new Error('Firestore public-result read-back did not match the approved public asset');
  }
  console.log(`[daily-public] Firestore public mirror ${result.status}: ${result.runId}, ${result.rows} rows. Read-back verified.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never print an arbitrary Firebase error, credential path or input content.
    console.error('[daily-public] Mirror refused: check the public asset, operator confirmation and Admin writer.');
    process.exitCode = 1;
  });
}
