/**
 * @jest-environment node
 *
 * Shape contract for the ONE normaliser both runtimes import.
 *
 * `backend/utils/openMeteo.js` is used by the Express/Node routes and by Pages Functions.
 * It must therefore turn the two real upstream response shapes into one internal contract:
 *
 *   object — `latitude=x&longitude=y`                    (single coordinate)
 *   array  — `latitude=a,b&longitude=c,d` / `%2C`        (multi coordinate)
 *
 * Fixtures are real upstream responses captured on 2026-10-27 (see their provenance
 * headers), not stubs written to match what the code wishes upstream sent. The 2026-10-27
 * batch outage was caused by exactly that: a comment described a third, imaginary
 * "nested" shape and `_extractPoint` indexed into it.
 */

const OBJECT_FIXTURE = require('./fixtures/openMeteoSingleObject.js');
const ARRAY_FIXTURE = require('./fixtures/openMeteoMultiArray.js');

const {
  _normalisePoint,
  _extractPoint,
  fetchWeather,
  fetchCurrentWeather,
  fetchCurrentWeatherBatch,
  clearCache,
} = require('../openMeteo.js');

const SCALAR_META = [
  'latitude', 'longitude', 'generationtime_ms', 'utc_offset_seconds',
  'timezone', 'timezone_abbreviation', 'elevation', 'location_id',
];
const BLOCKS = ['current_units', 'hourly_units', 'daily_units', 'current', 'hourly', 'daily'];

function upstreamStub(fetchImpl) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
}

const jsonResponse = (payload) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

beforeEach(() => clearCache());
afterEach(() => {
  jest.restoreAllMocks();
  clearCache();
});

describe('internal contract — one array of per-location records, whatever the query', () => {
  test('an object response normalises to one record, an array response to one per location', () => {
    const single = _normalisePoint(OBJECT_FIXTURE);
    const multi = _normalisePoint(ARRAY_FIXTURE);

    expect(Array.isArray(single)).toBe(true);
    expect(single).toHaveLength(1);
    expect(multi).toHaveLength(2);
    expect(multi[1].latitude).toBe(22.390158);   // leaf, from the captured second location
    expect(multi[1].location_id).toBe(1);         // only the multi form carries this
  });

  test('object and array shapes produce the identical internal contract', () => {
    const single = _normalisePoint(OBJECT_FIXTURE);
    const multi = _normalisePoint(ARRAY_FIXTURE);
    const twin = _normalisePoint([OBJECT_FIXTURE]);   // same location, wrapped as upstream's array form

    // Key sets and block key sets are the contract. Values may legitimately differ
    // (generationtime_ms, location_id), keys may not.
    expect(Object.keys(single[0]).sort()).toEqual([...SCALAR_META, ...BLOCKS].sort());
    expect(Object.keys(multi[0]).sort()).toEqual([...SCALAR_META, ...BLOCKS].sort());
    expect(Object.keys(single[0].current).sort()).toEqual(Object.keys(multi[0].current).sort());
    expect(Object.keys(single[0].current_units).sort())
      .toEqual(Object.keys(multi[0].current_units).sort());

    for (const key of SCALAR_META) {
      expect(typeof single[0][key]).toBe(typeof multi[0][key]);
    }
    // The strongest form: wrapping the captured object in an array changes nothing at all.
    expect(twin).toEqual(single);
  });

  test('_extractPoint is pure mapping — blocks stay blocks, metadata stays scalar', () => {
    const record = _normalisePoint(OBJECT_FIXTURE)[0];
    // Derived from the captured object: a real single-point query also asks for series.
    const withSeries = {
      ...OBJECT_FIXTURE,
      hourly: { time: ['2026-10-27T00:00', '2026-10-27T01:00'], temperature_2m: [28.4, 29.1] },
      daily: { time: ['2026-10-27'], temperature_2m_max: [31.2] },
      hourly_units: { temperature_2m: '°C' },
      daily_units: { temperature_2m_max: '°C' },
    };
    const point = _extractPoint(_normalisePoint(withSeries)[0]);

    expect(point).toBeInstanceOf(Object);
    expect(point.latitude).toBe(record.latitude);
    expect(point.generationtime_ms).toBe(0.2620220184326172);   // leaf from the fixture
    expect(point.current.temperature_2m).toBe(31.1);             // leaf from the fixture
    expect(point.current.wind_direction_10m).toBe(173);          // leaf from the fixture
    expect(point.current_units.wind_speed_10m).toBe('m/s');      // leaf from the fixture
    // An array inside a record is a time series. It must never be indexed into a scalar.
    expect(point.hourly.temperature_2m).toEqual([28.4, 29.1]);
    expect(point.daily.temperature_2m_max).toEqual([31.2]);
    expect(point.timezone).toBe('Asia/Dhaka');
    expect(point.location_id).toBeUndefined();
  });

  test('a malformed element cannot be silently turned into a hollow point', () => {
    expect(_normalisePoint(null)).toEqual([]);
    expect(_normalisePoint(42)).toEqual([]);
    expect(_normalisePoint([null, { current: { temperature_2m: 1 } }])[0]).toEqual({});
  });
});

describe('both public paths use that contract', () => {
  test('single: fetchWeather and mini map the object response to real readings', async () => {
    const spy = upstreamStub(async (url) => {
      // `%2C` also appears in the current/hourly/daily variable lists, so the shape tell
      // must be read from the *latitude parameter*, not from the URL as a whole.
      expect(new URL(String(url)).searchParams.get('latitude')).toBe('23.8103');
      return jsonResponse(OBJECT_FIXTURE);
    });

    const full = await fetchWeather(23.8103, 90.4125, { forecast_days: 1, skipCache: true });
    expect(full.current.temperature_2m).toBe(31.1);
    expect(full.timezone).toBe('Asia/Dhaka');
    expect(full._meta.current_vars).toBe(11);        // 10 variables + interval

    const mini = await fetchCurrentWeather(23.8103, 90.4125, { skipCache: true });
    expect(mini.current.relative_humidity_2m).toBe(62);
    expect(mini.current.wind_speed_10m).toBe(0.81);
    expect(mini._meta.current_vars).toBe(11);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('batch: the `%2C` query answers an array, and every point keeps its own leaves', async () => {
    const spy = upstreamStub(async (url) => {
      expect(String(url)).toContain('latitude=23.8103%2C22.3569');
      return jsonResponse(ARRAY_FIXTURE);
    });

    const points = await fetchCurrentWeatherBatch([
      { id: 'dhaka', lat: 23.8103, lng: 90.4125 },
      { id: 'chattogram', lat: 22.3569, lng: 91.7832 },
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(points.map((p) => p.id)).toEqual(['dhaka', 'chattogram']);
    expect(points[0].current.temperature_2m).toBe(31.1);
    expect(points[0].current.wind_direction_10m).toBe(173);
    expect(points[1].current.temperature_2m).toBe(27.8);
    expect(points[1].current.cloud_cover).toBe(6);
    expect(points[1].location_id).toBe(1);
    for (const point of points) {
      expect(point._meta.current_vars).toBeGreaterThan(0);
      expect(point.current).toBeDefined();
    }
  });

  test('a multi query answered with the wrong (object) shape cannot emit _meta-only points', async () => {
    upstreamStub(async () => jsonResponse(OBJECT_FIXTURE));
    const points = await fetchCurrentWeatherBatch([
      { id: 'dhaka', lat: 23.8103, lng: 90.4125 },
      { id: 'chattogram', lat: 22.3569, lng: 91.7832 },
    ]);
    // One location was answered. The second is dropped, not returned as `{id, _meta}`.
    expect(points).toHaveLength(1);
    expect(points[0].current.temperature_2m).toBe(31.1);
  });
});
