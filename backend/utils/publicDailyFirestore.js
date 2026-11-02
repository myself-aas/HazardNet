/**
 * Admin-only Firestore mirror of the *already approved public result*. This
 * module never opens a Kaggle export, a research ledger or an officer record.
 * Browser clients cannot read or write these collections (Firestore rules are
 * default-deny); the public API continues to serve the deployed public asset.
 */
import { createHash } from 'node:crypto';
import { DISTRICT_REGISTRY } from './districtRegistry.js';
import { parsePublicDailySnapshot } from './dailyAdvisoryPublic.js';
import { validateReleasableDailySnapshot } from '../../scripts/check_public_daily_asset.mjs';

export const DAILY_RUN_COLLECTION = 'publicDailyRuns';
export const DAILY_HEAD_COLLECTION = 'publicDailyPublication';
const HEAD_ID = 'current';
const DISTRICTS = 'districts';
const MAX_FIRESTORE_WRITES = 500;

function digestOf(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function onlyKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

/**
 * The expected run ID is an explicit operator confirmation, NOT proof of
 * provenance or permission to publish. Those approvals happen outside this
 * repository before the public asset exists. A whole run is 66 writes (64
 * district documents, metadata, pointer), below Firestore's 500-write limit.
 */
export async function mirrorApprovedDailySnapshot(raw, { db, expectedRunId, now = new Date() } = {}) {
  if (!db || typeof db.runTransaction !== 'function') throw new Error('An Admin Firestore writer is required');
  const snapshot = parsePublicDailySnapshot(raw);
  if (!snapshot || !expectedRunId || snapshot.run.id !== expectedRunId) {
    throw new Error('Approved public run ID does not match the operator confirmation');
  }
  validateReleasableDailySnapshot(snapshot, { now });

  const digest = digestOf(snapshot);
  const runRef = db.collection(DAILY_RUN_COLLECTION).doc(snapshot.run.id);
  const headRef = db.collection(DAILY_HEAD_COLLECTION).doc(HEAD_ID);
  const byDistrict = new Map(DISTRICT_REGISTRY.map((district) => [district.district_id, []]));
  for (const row of snapshot.advisories) byDistrict.get(row.districtId).push(row);
  const districtDocs = DISTRICT_REGISTRY.map(({ district_id: id }) => ({
    ref: runRef.collection(DISTRICTS).doc(String(id)),
    data: { schema: snapshot.schema, districtId: id, advisories: byDistrict.get(id) },
  }));
  if (districtDocs.length + 2 > MAX_FIRESTORE_WRITES) throw new Error('Public daily run exceeds the atomic write limit');

  return db.runTransaction(async (transaction) => {
    // Firestore requires all reads before any writes in a transaction.
    const head = await transaction.get(headRef);
    const existing = await transaction.get(runRef);
    if (existing.exists) {
      const previousDigest = existing.data()?.digest;
      if (previousDigest !== digest) throw new Error('A different result already uses this public run ID');
      if (head.exists && head.data()?.runId === snapshot.run.id && head.data()?.digest === digest) {
        return { status: 'unchanged', runId: snapshot.run.id, districts: 64, rows: snapshot.advisories.length };
      }
      throw new Error('Public run exists but is not the active complete publication');
    }
    if (head.exists) {
      const cutoff = head.data()?.dataCutoff;
      if (typeof cutoff !== 'string' || !Number.isFinite(Date.parse(cutoff))
        || Date.parse(cutoff) >= Date.parse(snapshot.run.dataCutoff)) {
        throw new Error('A newer or equal-cutoff public daily run is already active');
      }
    }

    transaction.set(runRef, {
      schema: snapshot.schema, run: snapshot.run, coverage: snapshot.coverage, digest,
    });
    for (const { ref, data } of districtDocs) transaction.set(ref, data);
    // Readers see either the previous completed run or the new one, never a
    // partial district set. No source CSV or private column reaches Firestore.
    transaction.set(headRef, {
      schema: snapshot.schema, runId: snapshot.run.id,
      dataCutoff: snapshot.run.dataCutoff, digest,
    });
    return { status: 'persisted', runId: snapshot.run.id, districts: 64, rows: snapshot.advisories.length };
  });
}

/** Read back only the active public fields and reject missing/corrupt partitions. */
export async function readMirroredDailySnapshot(db) {
  if (!db || typeof db.collection !== 'function') return null;
  try {
    const head = await db.collection(DAILY_HEAD_COLLECTION).doc(HEAD_ID).get();
    if (!head.exists) return null;
    const pointer = head.data();
    if (!onlyKeys(pointer, ['schema', 'runId', 'dataCutoff', 'digest'])
      || typeof pointer.runId !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(pointer.runId)) return null;
    const runRef = db.collection(DAILY_RUN_COLLECTION).doc(pointer.runId);
    const runDoc = await runRef.get();
    if (!runDoc.exists) return null;
    const record = runDoc.data();
    if (!onlyKeys(record, ['schema', 'run', 'coverage', 'digest'])
      || record.digest !== pointer.digest || record.run?.id !== pointer.runId
      || record.run?.dataCutoff !== pointer.dataCutoff || record.schema !== pointer.schema) return null;
    const docs = await Promise.all(DISTRICT_REGISTRY.map(({ district_id: id }) =>
      runRef.collection(DISTRICTS).doc(String(id)).get()));
    if (docs.some((doc, index) => !doc.exists
      || !onlyKeys(doc.data(), ['schema', 'districtId', 'advisories'])
      || doc.data().schema !== record.schema
      || doc.data().districtId !== DISTRICT_REGISTRY[index].district_id
      || !Array.isArray(doc.data().advisories)
      || doc.data().advisories.some((row) => row.districtId !== DISTRICT_REGISTRY[index].district_id))) return null;
    const snapshot = parsePublicDailySnapshot({
      schema: record.schema,
      run: record.run,
      coverage: record.coverage,
      advisories: docs.flatMap((doc) => doc.data().advisories),
    });
    return snapshot && digestOf(snapshot) === pointer.digest ? snapshot : null;
  } catch {
    // Never turn an incomplete or inaccessible database into a public forecast.
    return null;
  }
}
