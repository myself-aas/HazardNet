/**
 * @jest-environment node
 */
/**
 * Unit tests — shared forecast-serving helpers (backend/utils/forecastServe.js).
 *
 * This module is the single implementation behind BOTH the Express routes and
 * the Vercel serverless handlers, so these tests pin the query contract and
 * CSV export both runtimes inherit. Runtime wiring is covered by
 * __tests__/api/forecasts.test.js (Express) and
 * __tests__/vercelForecasts.test.js (Vercel).
 */
const {
  HISTORY_MAX_WINDOW_DAYS,
  HISTORY_DEFAULT_WINDOW_DAYS,
  CSV_COLUMNS,
  metadataDatasets,
  metadataDataSource,
  parseBulkQuery,
  parseHistoryQuery,
  historyRowsToCsv,
} = require('../backend/utils/forecastServe.js');

describe('parseBulkQuery', () => {
  test('accepts both valid horizons', () => {
    expect(parseBulkQuery({ horizon: '7_days' })).toEqual({ horizon: '7_days' });
    expect(parseBulkQuery({ horizon: '15_days' })).toEqual({ horizon: '15_days' });
  });

  test('rejects missing, empty, and unknown horizons', () => {
    for (const query of [{}, { horizon: '' }, { horizon: '10_days' }, { horizon: '7-days' }, null]) {
      const parsed = parseBulkQuery(query);
      expect(parsed.error).toMatch(/invalid horizon/i);
    }
  });
});

describe('parseHistoryQuery', () => {
  test('defaults to the trailing 30-day window ending today', () => {
    const parsed = parseHistoryQuery({});
    expect(parsed.error).toBeUndefined();
    const today = new Date().toISOString().slice(0, 10);
    expect(parsed.to).toBe(today);
    const spanDays = (Date.parse(`${parsed.to}T00:00:00Z`) - Date.parse(`${parsed.from}T00:00:00Z`)) / 86_400_000;
    expect(spanDays).toBe(HISTORY_DEFAULT_WINDOW_DAYS);
    expect(parsed.horizon).toBeNull();
    expect(parsed.districtId).toBeNull();
  });

  test('accepts an explicit window with filters', () => {
    const parsed = parseHistoryQuery({
      from: '2026-09-01',
      to: '2026-09-13',
      horizon: '7_days',
      district_id: '19',
      format: 'csv',
    });
    expect(parsed).toEqual({
      from: '2026-09-01',
      to: '2026-09-13',
      horizon: '7_days',
      districtId: 19,
      format: 'csv',
    });
  });

  test('rejects invalid horizon, district, dates, ordering, and oversized windows', () => {
    expect(parseHistoryQuery({ horizon: '10_days' }).error).toMatch(/invalid horizon/i);
    expect(parseHistoryQuery({ district_id: 'nope' }).error).toMatch(/district_id/i);
    expect(parseHistoryQuery({ district_id: '-3' }).error).toMatch(/district_id/i);
    expect(parseHistoryQuery({ from: 'not-a-date' }).error).toMatch(/YYYY-MM-DD/);
    expect(parseHistoryQuery({ from: '2026-13-45' }).error).toMatch(/YYYY-MM-DD/);
    expect(parseHistoryQuery({ from: '2026-09-13', to: '2026-09-01' }).error).toMatch(/from must be <= to/);
    expect(parseHistoryQuery({ from: '2026-01-01', to: '2026-09-13' }).error).toMatch(
      new RegExp(`max ${HISTORY_MAX_WINDOW_DAYS} days`)
    );
  });

  test('accepts exactly the 90-day maximum window', () => {
    const parsed = parseHistoryQuery({ from: '2026-06-15', to: '2026-09-13' });
    expect(parsed.error).toBeUndefined();
    expect(parsed.from).toBe('2026-06-15');
  });
});

describe('historyRowsToCsv', () => {
  const row = {
    district_id: 19,
    district_name: 'Dhaka',
    horizon: '7_days',
    hazard_type: 'Flood',
    severity_score: 0.55,
    confidence: 0.91,
    target_date: '2026-09-19',
    prediction_date: '2026-09-12',
    model_severity: 0.55,
    physics_severity: 0.48,
    division: 'Dhaka',
    pcode: '3019',
    admin_level: 2,
    adm2_name: '',
    adm2_pcode: '',
  };

  test('emits the ingest-compatible header plus one line per row', () => {
    const csv = historyRowsToCsv([row]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1]).toContain('19,Dhaka,7_days,Flood,0.55,0.91,2026-09-19,2026-09-12');
  });

  test('escapes commas, quotes, and newlines; blanks missing cells', () => {
    const csv = historyRowsToCsv([{ ...row, district_name: 'Cox\'s "Bazar", North\nArea', division: undefined }]);
    const body = csv.split('\n').slice(1).join('\n');
    expect(body).toContain('"Cox\'s ""Bazar"", North\nArea"');
    expect(csv).toContain(',,'); // blanked optional cell
  });

  test('exports a header-only document for an empty row set', () => {
    expect(historyRowsToCsv([])).toBe(`${CSV_COLUMNS.join(',')}\n`);
  });
});

describe('metadata helpers', () => {
  test('metadataDatasets points at the runner pipeline + GitHub release archive', () => {
    const datasets = metadataDatasets();
    expect(datasets).toHaveLength(2);
    expect(datasets[0].url).toContain('github.com/myself-aas/HazardNet/actions/workflows/daily_forecast.yml');
    expect(datasets[0].update_frequency).toBe('daily');
    expect(datasets[1].url).toContain('github.com/myself-aas/HazardNet/releases');
  });

  test('metadataDataSource honors FORECAST_DATA_SOURCE with a documented default', () => {
    const saved = process.env.FORECAST_DATA_SOURCE;
    process.env.FORECAST_DATA_SOURCE = 'custom/source';
    expect(metadataDataSource()).toBe('custom/source');
    delete process.env.FORECAST_DATA_SOURCE;
    expect(metadataDataSource()).toBe('github-actions: scripts/auto_forecast.py (GEE + Open-Meteo + TFLite)');
    if (saved !== undefined) process.env.FORECAST_DATA_SOURCE = saved;
  });
});
