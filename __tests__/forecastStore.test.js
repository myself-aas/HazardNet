/**
 * @jest-environment node
 *
 * Forecast store (backend/forecastStore.js) tests.
 */
import { getForecastStore, getForecastStoreMode, resetForecastStore } from '../backend/forecastStore.js';
import { getDoc as _getDoc, getDocs as _getDocs, writeBatch as _writeBatch, orderBy as _orderBy, limit as _limit } from '../backend/db.js';

jest.mock('../backend/db.js', () => ({
  db: {},
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDocs: jest.fn(),
  getDoc: jest.fn().mockResolvedValue({ data: () => undefined }),
  doc: jest.fn(() => ({})),
  writeBatch: jest.fn(() => ({ delete: jest.fn(), set: jest.fn(), commit: jest.fn().mockResolvedValue(true) })),
}));

const mockGetDocs = jest.mocked(_getDocs);
const mockWriteBatch = jest.mocked(_writeBatch);
const mockOrderBy = jest.mocked(_orderBy);
const mockLimit = jest.mocked(_limit);

const row = (over = {}) => ({
  district_id: 19,
  district_name: 'Dhaka',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.55,
  confidence: 0.91,
  target_date: '2026-09-19',
  prediction_date: '2026-09-12',
  admin_level: 3,
  adm2_name: 'Dhaka',
  adm2_pcode: '3037',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetForecastStore();
});

describe('mode selection', () => {
  it('returns firestore mode', () => {
    expect(getForecastStoreMode()).toBe('firestore');
    expect(getForecastStore().mode).toBe('firestore');
  });
});

describe('firestore store', () => {
  it('getLatestForecastByDistrict returns the newest prediction_date row', async () => {
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        cb({ data: () => row({ prediction_date: '2026-09-05' }) });
        cb({ data: () => row({ prediction_date: '2026-09-12' }) });
      },
    });
    const store = getForecastStore();
    const latest = await store.getLatestForecastByDistrict(19, '7_days');
    expect(latest.prediction_date).toBe('2026-09-12');
  });

  it('getLatestForecastByDistrict returns null when nothing matches', async () => {
    mockGetDocs.mockResolvedValue({ forEach: () => {} });
    const store = getForecastStore();
    expect(await store.getLatestForecastByDistrict(19, '7_days')).toBeNull();
  });

  it('getLatestForecastsByHorizon groups by district keeping the latest row', async () => {
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        cb({ data: () => row({ district_id: 19, prediction_date: '2026-09-05' }) });
        cb({ data: () => row({ district_id: 19, prediction_date: '2026-09-12' }) });
        cb({ data: () => row({ district_id: 30, district_name: 'Jashore', prediction_date: '2026-09-12' }) });
      },
    });
    const store = getForecastStore();
    const rows = await store.getLatestForecastsByHorizon('7_days');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.district_id === 19).prediction_date).toBe('2026-09-12');
  });

  it('getLatestPredictionDate returns the newest prediction_date via an indexed desc/limit-1 probe', async () => {
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => cb({ data: () => row({ prediction_date: '2026-09-12' }) }),
    });
    const store = getForecastStore();
    await expect(store.getLatestPredictionDate()).resolves.toBe('2026-09-12');
    expect(mockOrderBy).toHaveBeenCalledWith('prediction_date', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('getLatestPredictionDate returns null when the collection is empty', async () => {
    mockGetDocs.mockResolvedValue({ forEach: () => {} });
    const store = getForecastStore();
    await expect(store.getLatestPredictionDate()).resolves.toBeNull();
  });

  it('getForecastHistory filters by date range and sorts asc by prediction_date then district_id', async () => {
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        cb({ data: () => row({ district_id: 30, prediction_date: '2026-09-12' }) });
        cb({ data: () => row({ district_id: 19, prediction_date: '2026-09-05' }) });
        cb({ data: () => row({ district_id: 19, prediction_date: '2026-09-12' }) });
      },
    });
    const store = getForecastStore();
    const rows = await store.getForecastHistory({ from: '2026-09-01', to: '2026-09-30' });
    expect(rows.map((r) => `${r.prediction_date}:${r.district_id}`)).toEqual([
      '2026-09-05:19', '2026-09-12:19', '2026-09-12:30',
    ]);
  });

  it('replaceForecastsForPredictionDate writes replacements before deleting obsolete rows', async () => {
    const batch = { delete: jest.fn(), set: jest.fn(), commit: jest.fn().mockResolvedValue(true) };
    mockWriteBatch.mockReturnValue(batch);
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => cb({ ref: 'old-doc-ref', data: () => row() }),
    });
    const store = getForecastStore();
    const { written } = await store.replaceForecastsForPredictionDate('2026-09-12', [row(), row({ district_id: 30 })]);
    expect(written).toBe(2);
    expect(batch.delete).toHaveBeenCalledWith('old-doc-ref');
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(2);
  });
});

test('large ADM3 append is bounded and preserves weather values', async () => {
  const batches = [];
  mockWriteBatch.mockImplementation(() => {
    const batch = { set: jest.fn(), delete: jest.fn(), commit: jest.fn().mockResolvedValue() };
    batches.push(batch); return batch;
  });
  const weather = { temperature_mean: 30, temperature_max: 38, temperature_min: 23,
    precipitation_mm: 55, wind_max_kmh: 20, dewpoint_mean: 22, solar_radiation_mj_m2: 18, evapotranspiration_mm: 4 };
  await getForecastStore().appendForecasts(Array.from({ length: 1014 }, (_, district_id) => row({ district_id, ...weather })));
  expect(batches.map((batch) => batch.set.mock.calls.length)).toEqual([400, 400, 214]);
  expect(batches[0].set.mock.calls[0][1]).toMatchObject(weather);
});
test('failed publication never starts deleting previous forecasts', async () => {
  const batch = { set: jest.fn(), delete: jest.fn(), commit: jest.fn().mockRejectedValue(new Error('offline')) };
  mockWriteBatch.mockReturnValue(batch);
  mockGetDocs.mockResolvedValue({ forEach: (cb) => cb({ id: 'old', ref: 'old-ref' }) });
  await expect(getForecastStore().replaceForecastsForPredictionDate('2026-09-12', [row()])).rejects.toThrow('offline');
  expect(batch.delete).not.toHaveBeenCalled();
});

describe('verified serving snapshot', () => {
  afterEach(() => _getDoc.mockResolvedValue({ data: () => undefined }));
  it('serves the entire latest horizon from one snapshot, not legacy writes', async () => {
    _getDoc.mockResolvedValue({ data: () => ({ rows: [row({ forecast_run_id: 'new-run' }), row({ horizon: '15_days' })],
      manifest: { prediction_date: '2026-09-14', kernel: 'configured/notebook', run_id: 'new-run' }, published_at: '2026-09-14T09:31:00Z' }) });
    const store = getForecastStore();
    expect((await store.getLatestForecastsByHorizon('7_days'))[0].forecast_run_id).toBe('new-run');
    expect(await store.getLatestForecastByDistrict(99, '7_days')).toBeNull();
    expect(await store.getLatestPredictionDate()).toBe('2026-09-14');
    expect(await store.getLatestIngestionTimestamp()).toBe('2026-09-14T09:31:00Z');
    expect(await store.getLatestPublicationMetadata()).toMatchObject({ notebook_source: 'configured/notebook', forecast_run_id: 'new-run' });
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
  it('does not silently fall back when the verified snapshot read fails', async () => {
    _getDoc.mockRejectedValue(new Error('Firestore unavailable'));
    await expect(getForecastStore().getLatestForecastsByHorizon('7_days')).rejects.toThrow('unavailable');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
