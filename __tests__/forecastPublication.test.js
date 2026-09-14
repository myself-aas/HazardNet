/** @jest-environment node */
import version from '../Models/VERSION.json';
const artifacts = Object.fromEntries(version.artifacts.map((a) => [a.name, a.sha256]));
import { assertPublication, publishForecasts } from '../backend/forecastPublication.js';

function fixture() {
  const now = new Date().toISOString();
  return { manifest: { run_id: 'test-123', contract_version: 'hazardnet-si-v1', kaggle_version: 5,
    row_count: 128, prediction_date: now.slice(0, 10), requested_at: now, completed_at: now,
    csv_sha256: 'a'.repeat(64), source_sha256: 'b'.repeat(64), model_sha256: artifacts['hazardnet_fp32.tflite'], normalization_sha256: artifacts['normalization_stats.json'],
  }, rows: Array.from({ length: 128 }, (_, i) => ({ district_id: Math.floor(i / 2) + 1,
    district_name: `District ${Math.floor(i / 2) + 1}`, horizon: i % 2 ? '15_days' : '7_days',
    prediction_date: now.slice(0, 10), severity_score: .5, model_severity: .5, physics_severity: .6, confidence: .8,
  })) };
}
function database(current) {
  const tx = { get: jest.fn(async (ref) => ref === 'history-query' ? { docs: [] } : { data: () => current }), set: jest.fn(), delete: jest.fn() };
  const db = { collection: (name) => ({ doc: (id) => `${name}/${id}`, where: () => 'history-query' }), runTransaction: (fn) => fn(tx) };
  return { db, tx };
}
it('publishes history, serving snapshot and receipt in one transaction', async () => {
  const { db, tx } = database();
  const result = await publishForecasts(db, fixture());
  expect(result.status).toBe('published');
  expect(tx.set).toHaveBeenCalledTimes(130);
  const snapshot = tx.set.mock.calls.find(([ref]) => ref === 'forecast_publications/current')[1];
  expect(snapshot.rows).toHaveLength(128);
  expect(snapshot.rows[0].forecast_run_id).toBe('test-123');
});
it('replay is idempotent', async () => {
  const pub = fixture();
  const { db, tx } = database(pub);
  expect((await publishForecasts(db, pub)).status).toBe('unchanged');
  expect(tx.set).not.toHaveBeenCalled();
});
it('rejects out-of-order publications without writes', async () => {
  const pub = fixture();
  const current = fixture();
  current.manifest.run_id = 'newer';
  current.manifest.requested_at = new Date(Date.now() + 1000).toISOString();
  const { db, tx } = database(current);
  await expect(publishForecasts(db, pub)).rejects.toThrow('newer');
  expect(tx.set).not.toHaveBeenCalled();
});
it('rejects conflicting run identity', async () => {
  const pub = fixture(), current = fixture();
  current.manifest.csv_sha256 = 'e'.repeat(64);
  await expect(publishForecasts(database(current).db, pub)).rejects.toThrow('identity');
});
it.each(['partial', 'duplicate', 'nan', 'stale'])('rejects %s before any database writes', (defect) => {
  const pub = fixture();
  if (defect === 'partial') pub.rows.pop();
  if (defect === 'duplicate') pub.rows[1] = pub.rows[0];
  if (defect === 'nan') pub.rows[0].confidence = NaN;
  if (defect === 'stale') pub.manifest.requested_at = '2020-01-01T00:00:00Z';
  expect(() => assertPublication(pub)).toThrow();
});
it('propagates transaction failure (no success receipt)', async () => {
  await expect(publishForecasts({ runTransaction: async () => { throw new Error('unavailable'); },
    collection: () => ({ doc: () => ({}) }) }, fixture())).rejects.toThrow('unavailable');
});

it('cleans obsolete legacy history rows within the same transaction', async () => {
  const { db, tx } = database();
  tx.get.mockResolvedValueOnce({ data: () => undefined }).mockResolvedValueOnce({ docs: [{ id: 'old-key', ref: 'forecasts/old-key' }] });
  await publishForecasts(db, fixture());
  expect(tx.delete).toHaveBeenCalledWith('forecasts/old-key');
});
it('refuses oversized legacy cleanup before writing anything', async () => {
  const { db, tx } = database();
  tx.get.mockResolvedValueOnce({ data: () => undefined }).mockResolvedValueOnce({ docs: Array.from({ length: 400 }, (_, i) => ({ id: `old-${i}` })) });
  await expect(publishForecasts(db, fixture())).rejects.toThrow('migrate');
  expect(tx.set).not.toHaveBeenCalled();
  expect(tx.delete).not.toHaveBeenCalled();
});
