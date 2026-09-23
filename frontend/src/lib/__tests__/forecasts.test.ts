/**
 * Forecast client library (frontend/src/lib/forecasts.ts).
 *
 * Covers: defensive parsing of the /api/v1/forecasts/bulk payload, backend-
 * parity binning thresholds, district-name matching (incl. post-2015 renames
 * and GAUL spellings), the static-baseline merge, and display helpers.
 */
import {
  applyForecastsToDistricts,
  buildForecastIndex,
  confidenceBin,
  effectiveDistrictRows,
  fetchForecastMetadata,
  fetchSnapshotMetadata,
  forecastAgeHours,
  formatHorizonLabel,
  isForecastHorizon,
  parseBulkResponse,
  parseForecastRow,
  parseSnapshotResponse,
  rollupAdm3ToDistricts,
  severityBin,
  type ForecastRow,
} from '../forecasts';
import { ALL_64_DISTRICTS } from '../../data/bangladeshDistricts';

const row = (overrides: Partial<ForecastRow> = {}): ForecastRow => ({
  district_id: 19,
  district_name: 'Dhaka',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.5,
  confidence: 0.9,
  target_date: '2026-09-19',
  prediction_date: '2026-09-12',
  ...overrides,
});

describe('parseForecastRow / parseBulkResponse', () => {
  it('accepts a well-formed row and keeps optional dual-track fields', () => {
    const parsed = parseForecastRow(
      row({ model_severity: 0.72, physics_severity: 0.64, division: 'Dhaka', pcode: '3019' })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.model_severity).toBe(0.72);
    expect(parsed?.physics_severity).toBe(0.64);
    expect(parsed?.pcode).toBe('3019');
  });

  it('keeps a well-formed dataset_version and drops a malformed one', () => {
    // Lineage is passed through verbatim when it is shaped like a version
    // (`ds1.<16 hex>` stamps are recognised, and dropped otherwise:
    // a value that identifies nothing must not reach the UI as if it did.
    const good = parseForecastRow(row({ dataset_version: 'ds1.0123456789abcdef' }));
    expect(good?.dataset_version).toBe('ds1.0123456789abcdef');
    expect(parseForecastRow(row({ dataset_version: 'ds1.NOT-A-HASH' }))?.dataset_version)
      .toBeUndefined();
    expect(parseForecastRow(row({ dataset_version: 'v2' }))?.dataset_version).toBeUndefined();
    expect(parseForecastRow(row())?.dataset_version).toBeUndefined();
  });

  it('keeps forecasted meteorological fields for individual views', () => {
    const parsed = parseForecastRow(row({
      temperature_mean: 299.4,
      temperature_max: 304.2,
      temperature_min: 294.1,
      precipitation_mm: 42.5,
      wind_max_kmh: 31.8,
      dewpoint_mean: 292.7,
      solar_radiation_mj_m2: 18.6,
      evapotranspiration_mm: 4.2,
    }));

    expect(parsed).toMatchObject({
      temperature_mean: 299.4,
      temperature_max: 304.2,
      temperature_min: 294.1,
      precipitation_mm: 42.5,
      wind_max_kmh: 31.8,
      dewpoint_mean: 292.7,
      solar_radiation_mj_m2: 18.6,
      evapotranspiration_mm: 4.2,
    });
  });

  it.each([
    ['severity out of range', { severity_score: 1.4 }],
    ['confidence out of range', { confidence: -0.1 }],
    ['missing district name', { district_name: '' }],
    ['missing dates', { target_date: undefined }],
    ['non-object', null],
  ])('rejects %s', (_label, bad) => {
    expect(parseForecastRow(bad)).toBeNull();
  });

  it('drops malformed rows but keeps valid ones in a bulk payload', () => {
    const rows = parseBulkResponse({
      horizon: '7_days',
      count: 3,
      generated_at: '2026-09-12T00:00:00Z',
      forecasts: [row(), { district_name: 'No numbers' }, row({ district_name: 'Gazipur' })],
    });
    expect(rows).toHaveLength(2);
  });

  it('returns [] for non-object or forecast-less payloads', () => {
    expect(parseBulkResponse(null)).toEqual([]);
    expect(parseBulkResponse({ horizon: '10_days' })).toEqual([]);
  });
});

describe('binning — backend parity (backend/routes/forecasts.js GET /)', () => {
  it('severity bins use the 0.34 / 0.67 thresholds', () => {
    expect(severityBin(0.67)).toBe('High');
    expect(severityBin(0.669)).toBe('Moderate');
    expect(severityBin(0.34)).toBe('Moderate');
    expect(severityBin(0.339)).toBe('Low');
    expect(severityBin(0)).toBe('Low');
  });

  it('confidence bins use the 0.70 / 0.85 thresholds', () => {
    expect(confidenceBin(0.85)).toBe('Certain');
    expect(confidenceBin(0.849)).toBe('Probable');
    expect(confidenceBin(0.7)).toBe('Probable');
    expect(confidenceBin(0.69)).toBe('Uncertain');
  });
});

describe('district matching', () => {
  it('matches GAUL/legacy spellings to the static table via aliases', () => {
    const idx = buildForecastIndex([
      row({ district_name: 'Chittagong' }),
      row({ district_name: "Cox's Bazar" }),
      row({ district_name: 'Bogra' }),
    ]);
    expect(idx.has('chattogram')).toBe(true);
    expect(idx.has('coxsbazar')).toBe(true);
    expect(idx.has('bogra')).toBe(true);
  });

  it('keeps the latest prediction_date when a district appears twice', () => {
    const idx = buildForecastIndex([
      row({ district_name: 'Dhaka', prediction_date: '2026-09-05' }),
      row({ district_name: 'Dhaka', prediction_date: '2026-09-12' }),
    ]);
    expect(idx.get('dhaka')?.prediction_date).toBe('2026-09-12');
  });
});

describe('applyForecastsToDistricts — live overlay on the static baseline', () => {
  it('overrides severity/risk/hazardType for matched districts only', () => {
    const { districts, matched } = applyForecastsToDistricts(ALL_64_DISTRICTS, [
      row({ district_name: 'Dhaka', hazard_type: 'Heat Wave', severity_score: 0.9 }),
      row({ district_name: 'Chittagong', hazard_type: 'Tropical Cyclone', severity_score: 0.2 }),
    ]);

    expect(matched).toBe(2);

    const dhaka = districts.find((d) => d.id === 'dhaka');
    expect(dhaka?.severity).toBe(0.9);
    expect(dhaka?.risk).toBe('High');
    expect(dhaka?.hazardType).toBe('Heat Wave');

    const chattogram = districts.find((d) => d.id === 'chattogram');
    expect(chattogram?.hazardType).toBe('Tropical Cyclone');
    expect(chattogram?.risk).toBe('Low');

    // Unmatched district keeps its static baseline values untouched.
    const gazipur = districts.find((d) => d.id === 'gazipur');
    const staticGazipur = ALL_64_DISTRICTS.find((d) => d.id === 'gazipur');
    expect(gazipur?.severity).toBe(staticGazipur?.severity);
    expect(gazipur?.hazardType).toBe(staticGazipur?.hazardType);
  });

  it('never mutates the static module data', () => {
    const before = JSON.stringify(ALL_64_DISTRICTS.find((d) => d.id === 'dhaka'));
    applyForecastsToDistricts(ALL_64_DISTRICTS, [row({ district_name: 'Dhaka', severity_score: 1 })]);
    expect(JSON.stringify(ALL_64_DISTRICTS.find((d) => d.id === 'dhaka'))).toBe(before);
  });

  it('with zero rows returns the baseline intact', () => {
    const { districts, matched, predictionDate } = applyForecastsToDistricts(ALL_64_DISTRICTS, []);
    expect(matched).toBe(0);
    expect(predictionDate).toBeUndefined();
    expect(districts).toHaveLength(64);
    expect(districts.every((d, i) => d.severity === ALL_64_DISTRICTS[i].severity)).toBe(true);
  });

  it('reports the newest prediction_date across matched rows', () => {
    const { predictionDate } = applyForecastsToDistricts(ALL_64_DISTRICTS, [
      row({ district_name: 'Dhaka', prediction_date: '2026-09-05' }),
      row({ district_name: 'Khulna', prediction_date: '2026-09-12' }),
    ]);
    expect(predictionDate).toBe('2026-09-12');
  });
});

describe('ADM3 → ADM2 rollup (ADR 0006 phase 8d)', () => {
  const unit = (adm2: string, over: Partial<ForecastRow> = {}): ForecastRow => ({
    district_id: 101,
    district_name: 'Savar',
    horizon: '7_days',
    hazard_type: 'Flood',
    severity_score: 0.5,
    confidence: 0.8,
    target_date: '2026-09-22',
    prediction_date: '2026-09-12',
    admin_level: 3,
    adm2_name: adm2,
    adm2_pcode: '3037',
    ...over,
  });

  it('parses the ADM3 identity fields off API rows', () => {
    const r = parseForecastRow({
      ...row(), admin_level: 3, adm2_name: 'Dhaka', adm2_pcode: '30',
    });
    expect(r?.admin_level).toBe(3);
    expect(r?.adm2_name).toBe('Dhaka');
    expect(r?.adm2_pcode).toBe('30');
  });

  it('rolls units up to their parent district with the dominant hazard and mean confidence', () => {
    const rolled = rollupAdm3ToDistricts([
      unit('Dhaka', { severity_score: 0.2, hazard_type: 'Flood', confidence: 0.6 }),
      unit('Dhaka', { severity_score: 0.9, hazard_type: 'Drought', confidence: 0.8 }),
      unit('Dhaka', { severity_score: 0.5, hazard_type: 'Flood', confidence: 1.0 }),
    ]);
    expect(rolled).toHaveLength(1);
    expect(rolled[0]).toMatchObject({
      district_name: 'Dhaka',
      hazard_type: 'Drought', // dominant = max severity
      severity_score: 0.9,
    });
    expect(rolled[0].confidence).toBeCloseTo(0.8, 10); // mean of 0.6/0.8/1.0
  });

  it('passes legacy ADM2-shaped rows through untouched', () => {
    const legacy = row({ district_name: 'Sylhet', severity_score: 0.7 });
    expect(rollupAdm3ToDistricts([legacy])).toEqual([legacy]);
    expect(effectiveDistrictRows([legacy])).toEqual([legacy]);
  });

  it('restores full district-overlay coverage: rolled rows match the baseline incl. rename aliases', () => {
    // 507-unit era: every unit belongs to a parent district; the rollup makes
    // the live overlay cover the districts again (incl. Chattogram → alias).
    const rows = [
      unit('Dhaka', { severity_score: 0.9, hazard_type: 'Drought' }),
      unit('Chattogram', { severity_score: 0.4, hazard_type: 'Flood' }),
      unit('Jashore', { severity_score: 0.1, hazard_type: 'Drought' }),
    ];
    const { districts, matched } = applyForecastsToDistricts(ALL_64_DISTRICTS, rows);
    expect(matched).toBe(3);
    const dhaka = districts.find((d) => d.name === 'Dhaka');
    const chattogram = districts.find((d) => d.name === 'Chattogram'); // baseline spelling
    expect(dhaka?.severity).toBe(0.9);
    expect(dhaka?.hazardType).toBe('Drought');
    expect(chattogram?.severity).toBe(0.4); // rollup key 'Chattogram' matches the baseline spelling
    // Nothing matched the upazila names themselves:
    expect(districts.find((d) => d.name === 'Savar')).toBeUndefined();
  });
});

describe('parseSnapshotResponse (hourly static snapshot fallback)', () => {
  const snapshot = {
    schema: 'hazardnet-forecast-snapshot/v1',
    generated_at: '2026-09-13T05:05:00.000Z',
    source: 'production run',
    prediction_date: '2026-09-13',
    horizons: {
      '7_days': [
        row({ horizon: '7_days', model_severity: 0.61, physics_severity: 0.55,
              dataset_version: 'ds1.fedcba9876543210' }),
        row({ horizon: '7_days', district_id: 30, district_name: 'Jashore', hazard_type: 'Drought' }),
      ],
      '15_days': [row({ horizon: '15_days', severity_score: 0.33 })],
    },
  };

  it('extracts only the requested horizon and validates rows', () => {
    expect(parseSnapshotResponse(snapshot, '7_days')).toHaveLength(2);
    expect(parseSnapshotResponse(snapshot, '15_days')).toHaveLength(1);
    expect(parseSnapshotResponse(snapshot, '7_days')[0]?.model_severity).toBe(0.61);
    // The snapshot carries the per-row content hash through to the UI layer.
    expect(parseSnapshotResponse(snapshot, '7_days')[0]?.dataset_version).toBe('ds1.fedcba9876543210');
    expect(parseSnapshotResponse(snapshot, '7_days')[1]?.dataset_version).toBeUndefined();
  });

  it('drops malformed rows inside the snapshot', () => {
    const noisy = {
      horizons: {
        '7_days': [row(), { severity_score: 'not-a-number', confidence: 0.9 }, null],
      },
    };
    expect(parseSnapshotResponse(noisy, '7_days')).toHaveLength(1);
  });

  it('returns [] for missing or malformed payloads (never throws)', () => {
    expect(parseSnapshotResponse(null, '7_days')).toEqual([]);
    expect(parseSnapshotResponse({}, '7_days')).toEqual([]);
    expect(parseSnapshotResponse({ horizons: { '7_days': 'oops' } }, '7_days')).toEqual([]);
  });
});

describe('display helpers', () => {
  it('formats horizon labels', () => {
    expect(formatHorizonLabel('7_days')).toBe('Next 7 Days');
    expect(formatHorizonLabel('15_days')).toBe('Next 15 Days');
  });

  it('guards the horizon type', () => {
    expect(isForecastHorizon('7_days')).toBe(true);
    expect(isForecastHorizon('15_days')).toBe(true);
    expect(isForecastHorizon('10_days')).toBe(false);
  });

  it('computes non-negative prediction age in hours', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    expect(forecastAgeHours('2026-09-12T06:00:00Z', now)).toBe(6);
    expect(forecastAgeHours('2026-09-13T00:00:00Z', now)).toBe(0);
  });
});

describe('fetchForecastMetadata — three-stage fallback (API → bulk → snapshot)', () => {
  const snapshotPayload = {
    schema: 'hazardnet-forecast-snapshot/v1',
    generated_at: '2026-09-13T05:05:00.000Z',
    source: 'production run',
    prediction_date: '2026-09-13',
    horizons: { '7_days': [row({ prediction_date: '2026-09-13' })] },
  };

  const mockFetch = (impl: (url: string) => unknown) => {
    global.fetch = jest.fn((url: string) => Promise.resolve(impl(url))) as unknown as typeof fetch;
  };
  const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
  const fail = (status = 404) => ({ ok: false, status, json: () => Promise.resolve({}) });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers the live /metadata endpoint', async () => {
    mockFetch((url) =>
      url.includes('/metadata')
        ? ok({ prediction_date: '2026-09-14T00:00:00Z', ingestion_timestamp: '2026-09-14T01:00:00Z', data_source: 'live' })
        : fail(),
    );
    await expect(fetchForecastMetadata()).resolves.toEqual({
      predictionDate: '2026-09-14',
      ingestionTimestamp: '2026-09-14T01:00:00Z',
      source: 'live',
    });
  });

  it('falls back to /bulk rows when /metadata is down', async () => {
    mockFetch((url) => {
      if (url.includes('/metadata')) return fail(503);
      if (url.includes('/bulk')) {
        return ok({
          data_source: 'live-bulk',
          forecasts: [row({ prediction_date: '2026-09-12', created_at: '2026-09-12T02:00:00Z' })],
        });
      }
      return fail();
    });
    await expect(fetchForecastMetadata()).resolves.toEqual({
      predictionDate: '2026-09-12',
      ingestionTimestamp: '2026-09-12T02:00:00Z',
      source: 'live-bulk',
    });
  });

  it('falls back to the committed snapshot when the whole API is down', async () => {
    mockFetch((url) => (url.includes('/data/forecasts-latest.json') ? ok(snapshotPayload) : fail(503)));
    await expect(fetchForecastMetadata()).resolves.toEqual({
      predictionDate: '2026-09-13',
      ingestionTimestamp: '2026-09-13T05:05:00.000Z',
      source: 'production run',
    });
  });

  it('throws only when API and snapshot are all unreachable', async () => {
    mockFetch(() => fail(503));
    await expect(fetchForecastMetadata()).rejects.toThrow('both unreachable');
  });

  it('fetchSnapshotMetadata derives the newest row date when prediction_date is absent', async () => {
    const { prediction_date: _omit, ...rest } = snapshotPayload;
    mockFetch(() => ok({
      ...rest,
      horizons: {
        '7_days': [row({ prediction_date: '2026-09-10' }), row({ prediction_date: '2026-09-11' })],
        '15_days': [row({ horizon: '15_days', prediction_date: '2026-09-09' })],
      },
    }));
    await expect(fetchSnapshotMetadata()).resolves.toEqual({
      predictionDate: '2026-09-11',
      ingestionTimestamp: '2026-09-13T05:05:00.000Z',
      source: 'production run',
    });
  });

  it('fetchSnapshotMetadata never throws (all-null on missing/malformed)', async () => {
    mockFetch(() => fail());
    await expect(fetchSnapshotMetadata()).resolves.toEqual({
      predictionDate: null,
      ingestionTimestamp: null,
      source: null,
    });
    mockFetch(() => ok({ horizons: 'garbage' }));
    await expect(fetchSnapshotMetadata()).resolves.toEqual({
      predictionDate: null,
      ingestionTimestamp: null,
      source: null,
    });
  });
});
