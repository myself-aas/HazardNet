#!/usr/bin/env node
/**
 * Deployment boundary for the already-public district/day JSON. This checker
 * never opens a producer CSV, reviewer record, technical ledger or source audit.
 * An absent asset is expected until an authorized run has been published.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dhakaDate } from '../backend/utils/dailyAdvisoryServe.js';
import { parsePublicDailySnapshot, publicDailyStatus } from '../backend/utils/dailyAdvisoryPublic.js';

const PUBLIC_ASSET = fileURLToPath(new URL('../frontend/public/data/daily-advisories-v1.json', import.meta.url));
const MAX_PUBLIC_BYTES = 4 * 1024 * 1024;

/**
 * Validate only the deployed public result contract. `assetPath` and `now` are
 * test seams; the CLI has no option to point this check at confidential input.
 * This is not an attestation that a private run, its reviewer or its inputs exist.
 */
export function checkPublicDailyAsset({ assetPath = PUBLIC_ASSET, now = new Date(), requirePublished = false } = {}) {
  let info;
  try {
    info = lstatSync(assetPath);
  } catch (error) {
    if (error.code === 'ENOENT' && !requirePublished) return { status: 'unpublished' };
    if (error.code === 'ENOENT') throw new Error('No approved public daily asset was published');
    throw new Error('Public daily asset could not be inspected');
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > MAX_PUBLIC_BYTES) {
    throw new Error('Public daily asset is not a bounded, regular JSON file');
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(assetPath, 'utf8'));
  } catch {
    throw new Error('Public daily asset is not valid JSON');
  }
  return validateReleasableDailySnapshot(raw, { now });
}

/** Same public-only release check before writing the asset and before a deploy. */
export function validateReleasableDailySnapshot(raw, { now = new Date() } = {}) {
  const snapshot = parsePublicDailySnapshot(raw);
  if (!snapshot || snapshot.coverage.districts !== 64 || snapshot.advisories.length === 0) {
    throw new Error('Public daily asset is empty, incomplete, or outside the public schema');
  }
  if (!Number.isFinite(now.getTime())
    || Date.parse(snapshot.run.generatedAt) > now.getTime() + 5 * 60_000
    || publicDailyStatus(snapshot, now) !== 'fresh'
    || !snapshot.advisories.some((row) => row.targetDate >= dhakaDate(now))) {
    throw new Error('Public daily asset is not a current district outlook');
  }
  return {
    status: 'validated',
    districts: snapshot.coverage.districts,
    publishedRows: snapshot.coverage.publishedRows,
    dataCutoff: snapshot.run.dataCutoff,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--require')) {
      throw new Error('Usage: node scripts/check_public_daily_asset.mjs [--require]');
    }
    const result = checkPublicDailyAsset({ requirePublished: process.argv[2] === '--require' });
    if (result.status === 'unpublished') {
      console.log('[daily-public] No approved asset: public API remains unavailable (expected).');
    } else {
      console.log(`[daily-public] Public-only asset valid: ${result.districts} districts, ${result.publishedRows} published days.`);
    }
  } catch (error) {
    // Do not echo source content or an operator-controlled path into CI logs.
    console.error(`[daily-public] Publication check refused: ${error.message}`);
    process.exitCode = 1;
  }
}
