/** Atomic, monotonic publication of one complete, verified Kaggle execution.
 * Latest APIs read a single snapshot, never a mixture of two three-hour runs.
 * Legacy/manual ingestion cannot overwrite this serving snapshot.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const approved = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../Models/VERSION.json', import.meta.url), 'utf8'))
  .artifacts.map((item) => [item.name, item.sha256]));

export function assertPublication({ manifest: m, rows } = {}, now = Date.now()) {
  if (!m || m.contract_version !== 'hazardnet-si-v1' || !/^[\w-]{1,160}$/.test(m.run_id)
      || !Number.isInteger(m.kaggle_version) || m.kaggle_version < 1
      || !Array.isArray(rows) || rows.length !== 128 || m.row_count !== 128) {
    throw new Error('Invalid verified publication');
  }
  for (const field of ['csv_sha256', 'source_sha256', 'model_sha256', 'normalization_sha256']) {
    if (!/^[a-f0-9]{64}$/.test(m[field])) throw new Error(`Invalid ${field}`);
  }
  if (m.model_sha256 !== approved['hazardnet_fp32.tflite'] || m.normalization_sha256 !== approved['normalization_stats.json']) {
    throw new Error('Publication does not use authoritative model and normalization artifacts');
  }
  const start = Date.parse(m.requested_at), end = Date.parse(m.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start - 300000
      || end > now + 300000 || start > now + 300000 || now - start > 7200000) {
    throw new Error('Publication timestamp outside execution window');
  }
  const pairs = new Set();
  for (const row of rows) {
    if (row.prediction_date !== m.prediction_date || !['7_days', '15_days'].includes(row.horizon)
        || !Number.isInteger(row.district_id) || !row.district_name
        || !['severity_score', 'model_severity', 'physics_severity', 'confidence'].every(
          (key) => Number.isFinite(row[key]) && row[key] >= 0 && row[key] <= 1)) {
      throw new Error('Invalid publication row');
    }
    pairs.add(`${row.district_id}:${row.horizon}`);
  }
  if (pairs.size !== 128) throw new Error('Duplicate district/horizon');
  if (Buffer.byteLength(JSON.stringify({ manifest: m, rows })) > 700000) throw new Error('Snapshot exceeds safe document size');
}

export async function publishForecasts(db, publication) {
  assertPublication(publication);
  const { manifest } = publication;
  const published_at = new Date().toISOString();
  const rows = publication.rows.map((row) => ({ ...row, created_at: published_at,
    generated_at: manifest.completed_at, forecast_run_id: manifest.run_id,
    contract_version: manifest.contract_version, kaggle_version: manifest.kaggle_version,
    csv_sha256: manifest.csv_sha256, model_sha256: manifest.model_sha256,
  }));
  const currentRef = db.collection('forecast_publications').doc('current');
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(currentRef)).data();
    if (current?.manifest.run_id === manifest.run_id) {
      if (current.manifest.csv_sha256 !== manifest.csv_sha256) throw new Error('Run identity reused with different CSV');
      return { status: 'unchanged', run_id: manifest.run_id };
    }
    if (current && (Date.parse(current.manifest.requested_at) >= Date.parse(manifest.requested_at)
        || current.manifest.prediction_date > manifest.prediction_date)) {
      throw new Error('Refusing to replace a newer publication');
    }
    const history = db.collection('forecasts');
    const old = await tx.get(history.where('prediction_date', '==', manifest.prediction_date));
    const historyId = (row) => createHash('sha256').update(JSON.stringify([
      row.district_id, row.horizon, row.prediction_date,
    ])).digest('hex');
    const ids = new Set(rows.map(historyId));
    const stale = old.docs.filter((entry) => !ids.has(entry.id));
    if (stale.length + rows.length + 2 > 450) {
      throw new Error('Too many legacy rows for atomic replacement; migrate historical data first');
    }
    stale.forEach((entry) => tx.delete(entry.ref));
    // One transaction: 128 history upserts + the serving snapshot + run receipt.
    // Stable history keys replace previous same-day hazard predictions, not duplicate them.
    for (const row of rows) {
      tx.set(history.doc(historyId(row)), row);
    }
    tx.set(currentRef, { manifest, rows, published_at });
    tx.set(db.collection('forecast_runs').doc(manifest.run_id), { ...manifest, published_at });
    return { status: 'published', run_id: manifest.run_id, rows: rows.length, published_at };
  });
}
