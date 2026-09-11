/**
 * @jest-environment node
 *
 * Forecast store (backend/forecastStore.js) — the ADR 0002 access layer.
 *
 * Covers: mode selection + fail-loud config, Firestore implementation
 * semantics (latest-per-district, replace-for-prediction-date), and the
 * Supabase implementation's SQL/row coercion (pg returns numeric as strings
 * and date as raw strings via the 1082 type parser — the API shape must stay
 * identical to the Firestore store's).
 */
import { getForecastStore, getForecastStoreMode, resetForecastStore } from '../backend/forecastStore.js';
import { getDocs as _getDocs, writeBatch as _writeBatch, orderBy as _orderBy, limit as _limit } from '../backend/db.js';
import pgDefault, { __mockPoolQuery, __mockPoolConnect } from 'pg';

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

jest.mock('pg', () => {
  const real = jest.requireActual('pg');
  // Shared fns so tests can program/inspect the "pool".
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const connect = jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  });
  class FakePool {
    constructor() {
      this.query = query;
      this.connect = connect;
      this.on = jest.fn();
    }
  }
  return {
    ...real,
    __mockPoolQuery: query,
    __mockPoolConnect: connect,
    default: FakePool,
    Pool: FakePool,
  };
});

const mockGetDocs = jest.mocked(_getDocs);
const mockWriteBatch = jest.mocked(_writeBatch);
const mockOrderBy = jest.mocked(_orderBy);
const mockLimit = jest.mocked(_limit);
const mockPoolQuery = __mockPoolQuery;
const mockPoolConnect = __mockPoolConnect;
void pgDefault;

const row = (over = {}) => ({
  district_id: 19,
  district_name: 'Dhaka',
  horizon: '10_days',
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
  mockPoolQuery.mockResolvedValue({ rows: [] });
  resetForecastStore();
  delete process.env.FORECAST_STORE;
  delete process.env.DATABASE_URL;
});

describe('mode selection', () => {
  it('defaults to firestore (pre-cutover behavior)', () => {
    expect(getForecastStoreMode()).toBe('firestore');
    expect(getForecastStore().mode).toBe('firestore');
  });

  it('selects supabase when FORECAST_STORE=supabase', () => {
    process.env.FORECAST_STORE = 'supabase';
    process.env.DATABASE_URL = 'postgresql://user:pass@db.example.supabase.co:5432/postgres';
    expect(getForecastStore().mode).toBe('supabase');
  });

  it('fails loud when supabase is selected without DATABASE_URL', async () => {
    process.env.FORECAST_STORE = 'supabase';
    await expect(getForecastStore().getLatestForecastsByHorizon('10_days')).rejects.toThrow(/DATABASE_URL/);
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
    const latest = await store.getLatestForecastByDistrict(19, '10_days');
    expect(latest.prediction_date).toBe('2026-09-12');
  });

  it('getLatestForecastByDistrict returns null when nothing matches', async () => {
    mockGetDocs.mockResolvedValue({ forEach: () => {} });
    const store = getForecastStore();
    expect(await store.getLatestForecastByDistrict(19, '10_days')).toBeNull();
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
    const rows = await store.getLatestForecastsByHorizon('10_days');
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
    const { where: whereFn } = jest.requireMock('../backend/db.js');
    expect(whereFn).toHaveBeenCalledWith('prediction_date', '>=', '2026-09-01');
    expect(whereFn).toHaveBeenCalledWith('prediction_date', '<=', '2026-09-30');
  });

  it('getForecastHistory passes horizon and district filters as equality constraints', async () => {
    mockGetDocs.mockResolvedValue({ forEach: () => {} });
    const store = getForecastStore();
    await store.getForecastHistory({ from: '2026-09-01', to: '2026-09-30', horizon: '10_days', districtId: 19 });
    const { where: whereFn } = jest.requireMock('../backend/db.js');
    expect(whereFn).toHaveBeenCalledWith('horizon', '==', '10_days');
    expect(whereFn).toHaveBeenCalledWith('district_id', '==', 19);
    expect(whereFn).toHaveBeenCalledWith('prediction_date', '>=', '2026-09-01');
    expect(whereFn).toHaveBeenCalledWith('prediction_date', '<=', '2026-09-30');
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

describe('supabase store', () => {
  const connect = () => {
    process.env.FORECAST_STORE = 'supabase';
    process.env.DATABASE_URL = 'postgresql://user:pass@db.example.supabase.co:5432/postgres';
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockPoolConnect.mockResolvedValue(client);
    return { store: getForecastStore(), client };
  };

  it('getLatestForecastByDistrict queries with district as text and coerces the row shape', async () => {
    const { store } = connect();
    // pg shape: numeric → string, date → raw string (1082 parser), district_id text.
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          district_id: '19',
          district_name: 'Dhaka',
          horizon: '10_days',
          hazard_type: 'Flood',
          severity_score: '0.55',
          confidence: '0.91',
          target_date: '2026-09-19',
          prediction_date: '2026-09-12',
          model_severity: '0.55',
          physics_severity: '0.48',
          division: 'Dhaka',
          pcode: '3019',
          admin_level: 3,
          adm2_name: 'Dhaka',
          adm2_pcode: '3037',
          created_at: new Date('2026-09-12T08:00:00Z'),
        },
      ],
    });

    const forecast = await store.getLatestForecastByDistrict(19, '10_days');

    expect(forecast.district_id).toBe(19); // text → number
    expect(forecast.severity_score).toBe(0.55); // numeric string → number
    expect(forecast.confidence).toBe(0.91);
    expect(forecast.model_severity).toBe(0.55);
    expect(forecast.physics_severity).toBe(0.48);
    expect(forecast.target_date).toBe('2026-09-19'); // stays YYYY-MM-DD
    expect(forecast.created_at).toBe('2026-09-12T08:00:00.000Z'); // Date → ISO string
    expect(forecast.admin_level).toBe(3); // ADM3 identity passthrough (ADR 0005)
    expect(forecast.adm2_name).toBe('Dhaka');
    expect(forecast.adm2_pcode).toBe('3037');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('order by prediction_date desc'),
      ['19', '10_days']
    );
  });

  it('getLatestForecastsByHorizon uses DISTINCT ON and maps all rows', async () => {
    const { store } = connect();
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { ...row(), district_id: '19', severity_score: '0.55', confidence: '0.91' },
        { ...row({ district_id: 30, district_name: 'Jashore' }), severity_score: '0.35', confidence: '0.78' },
      ],
    });
    const rows = await store.getLatestForecastsByHorizon('10_days');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('distinct on (district_id)'),
      ['10_days']
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => typeof r.severity_score === 'number')).toBe(true);
    expect(rows.every((r) => typeof r.confidence === 'number')).toBe(true);
  });

  it('replaceForecastsForPredictionDate runs delete+insert in a transaction', async () => {
    const { store, client } = connect();
    const { written } = await store.replaceForecastsForPredictionDate('2026-09-12', [
      row({ model_severity: 0.55, physics_severity: 0.48, division: 'Dhaka', pcode: '3019' }),
    ]);

    expect(written).toBe(1);
    const calls = client.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe('begin');
    expect(calls[1]).toContain('delete from public.forecasts where prediction_date = $1');
    expect(calls[2]).toContain('insert into public.forecasts');
    expect(calls[2]).toContain('on conflict (district_id, horizon, hazard_type, target_date, prediction_date)');
    expect(calls[3]).toBe('commit');

    const insertParams = client.query.mock.calls[2][1];
    expect(insertParams).toEqual([
      '19', 'Dhaka', '10_days', 'Flood', 0.91, 0.55, '2026-09-19', '2026-09-12',
      0.55, 0.48, 'Dhaka', '3019', 3, 'Dhaka', '3037',
    ]);
  });

  it('rolls back and rethrows on insert failure', async () => {
    const { store, client } = connect();
    client.query.mockImplementation(async (sql) => {
      if (typeof sql === 'string' && sql.startsWith('insert')) throw new Error('constraint violation');
      return { rows: [] };
    });
    await expect(
      store.replaceForecastsForPredictionDate('2026-09-12', [row()])
    ).rejects.toThrow('constraint violation');
    const calls = client.query.mock.calls.map((c) => c[0]);
    expect(calls).toContain('rollback');
    expect(client.release).toHaveBeenCalled();
  });

  it('getLatestPredictionDate uses max() and parses the date string', async () => {
    const { store } = connect();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ latest: '2026-09-12' }] });
    await expect(store.getLatestPredictionDate()).resolves.toBe('2026-09-12');
    expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('max(prediction_date)'));
  });

  it('getLatestPredictionDate returns null when the table is empty', async () => {
    const { store } = connect();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ latest: null }] });
    await expect(store.getLatestPredictionDate()).resolves.toBeNull();
  });

  it('getForecastHistory builds a ranged query with optional filters and maps rows', async () => {
    const { store } = connect();
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { ...row(), district_id: '19', severity_score: '0.55', confidence: '0.91' },
        { ...row({ district_id: 30, district_name: 'Jashore', prediction_date: '2026-09-12' }), severity_score: '0.35', confidence: '0.78' },
      ],
    });
    const rows = await store.getForecastHistory({ from: '2026-09-01', to: '2026-09-30', horizon: '10_days', districtId: 19 });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('where prediction_date >= $1 and prediction_date <= $2 and horizon = $3 and district_id = $4 order by prediction_date asc, district_id asc'),
      ['2026-09-01', '2026-09-30', '10_days', '19']
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => typeof r.severity_score === 'number' && typeof r.confidence === 'number')).toBe(true);
    expect(rows.every((r) => typeof r.district_id === 'number')).toBe(true);
  });

  it('getForecastHistory omits optional filters when not provided', async () => {
    const { store } = connect();
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    await store.getForecastHistory({ from: '2026-09-01', to: '2026-09-30' });
    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).not.toContain('horizon =');
    expect(sql).not.toContain('district_id =');
    expect(params).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('appendForecasts upserts without deleting', async () => {
    const { store } = connect();
    await store.appendForecasts([row()]);
    const sqls = mockPoolQuery.mock.calls.map((c) => c[0]);
    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toContain('insert into public.forecasts');
    expect(sqls.join(' ')).not.toContain('delete from');
  });
});
