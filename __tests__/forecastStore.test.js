/**
 * @jest-environment node
 *
 * Forecast store (backend/forecastStore.js) tests.
 */
import { getForecastStore, getForecastStoreMode, resetForecastStore } from '../backend/forecastStore.js';
import { getDocs as _getDocs, writeBatch as _writeBatch, orderBy as _orderBy, limit as _limit } from '../backend/db.js';

jest.mock('../backend/db.js', () => ({
  db: {},
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDocs: jest.fn(),
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
      size: 3,
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

  it('getLatestPredictionDate falls back to the committed snapshot when Firestore is empty', async () => {
    mockGetDocs.mockResolvedValue({ size: 0, forEach: () => {} });
    const store = getForecastStore();
    const date = await store.getLatestPredictionDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  it('replaceForecastsForPredictionDate deletes old rows then writes new ones', async () => {
    const batch = { delete: jest.fn(), set: jest.fn(), commit: jest.fn().mockResolvedValue(true) };
    mockWriteBatch.mockReturnValueOnce(batch);
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => cb({ ref: 'old-doc-ref', data: () => row() }),
    });
    const store = getForecastStore();
    const { written } = await store.replaceForecastsForPredictionDate('2026-09-12', [row(), row({ district_id: 30 })]);
    expect(written).toBe(2);
    expect(batch.delete).toHaveBeenCalledWith('old-doc-ref');
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});
