/**
 * Phase E client contracts for the wind artifact (2026-10-05).
 *
 * The same honesty rules as the Phase 7 freshness client: an unrecognised
 * schema is not rendered, a missing artifact is UNAVAILABLE (never an invented
 * breeze), and stale data is labelled with its own timestamp. The sampler is
 * pinned exactly because the particle renderer trusts it blindly.
 */
import {
  WIND_SCHEMA,
  parseWindArtifact,
  sampleWind,
  windAgeHours,
  windChipLabel,
  windFeedState,
  type WindArtifact,
} from '../wind';

/** A valid 3x2 hand-built field: u grows east, v grows north. */
function fixture(overrides: Record<string, unknown> = {}): unknown {
  // grid: lon 89..91 step 1 (3 cols), lat 23..24 step 1 (2 rows)
  // u[col,row] = lon; v = lat
  const u = [89, 90, 91, 89, 90, 91]; // row lat23 then lat24
  const v = [23, 23, 23, 24, 24, 24];
  return {
    schema: WIND_SCHEMA,
    generated_at: '2026-10-05T06:10:00Z',
    model: 'gfs',
    model_name: 'NOAA GFS 0.25 degree',
    issue_time: '2026-10-05T00:00:00Z',
    valid_time: '2026-10-05T06:00:00Z',
    step_hours: 6,
    kind: 'forecast',
    grid: { lon_min: 89, lon_max: 91, lat_min: 23, lat_max: 24, step: 1 },
    u,
    v,
    ...overrides,
  };
}

const PARSED = parseWindArtifact(fixture()) as WindArtifact;
const AT = new Date('2026-10-05T08:00:00Z');

describe('wind artifact parsing', () => {
  it('accepts the contract and nothing else', () => {
    expect(PARSED).not.toBeNull();
    expect(PARSED.model).toBe('gfs');
    expect(PARSED.u).toHaveLength(6);
    expect(parseWindArtifact(null)).toBeNull();
    expect(parseWindArtifact('wind')).toBeNull();
    expect(parseWindArtifact([])).toBeNull();
  });

  it('rejects an unknown schema instead of guessing', () => {
    expect(parseWindArtifact(fixture({ schema: 'hazardnet-wind/v2' }))).toBeNull();
    expect(parseWindArtifact(fixture({ schema: undefined }))).toBeNull();
  });

  it('rejects missing or malformed members', () => {
    expect(parseWindArtifact(fixture({ model: 'nam' }))).toBeNull();
    expect(parseWindArtifact(fixture({ kind: 'guess' }))).toBeNull();
    expect(parseWindArtifact(fixture({ grid: undefined }))).toBeNull();
    expect(parseWindArtifact(fixture({ u: [1, 2, 3] }))).toBeNull();
    expect(parseWindArtifact(fixture({ v: [1, 2, 3, 4, 5, NaN] }))).toBeNull();
    expect(parseWindArtifact(fixture({ grid: { lon_min: 91, lon_max: 89, lat_min: 23, lat_max: 24, step: 1 } }))).toBeNull();
  });
});

describe('wind feed states and chip grammar', () => {
  it('ages artifacts against the six-hourly schedule', () => {
    expect(windAgeHours(PARSED, AT)).toBeCloseTo(1.8333, 3);
  });

  it('is live inside the SLO, stale beyond it, unavailable without one', () => {
    expect(windFeedState(PARSED, AT).kind).toBe('live');
    const late = new Date('2026-10-05T20:00:00Z'); // 13.8 h later
    expect(windFeedState(PARSED, late).kind).toBe('stale');
    expect(windFeedState(null, AT).kind).toBe('unavailable');
  });

  it('labels chips: model+cycle when live, as-of when stale, never amber words', () => {
    expect(windChipLabel(windFeedState(PARSED, AT))).toBe('GFS 00:00Z');
    const late = new Date('2026-10-05T20:00:00Z');
    expect(windChipLabel(windFeedState(PARSED, late))).toBe('STALE as of 06:10Z');
    expect(windChipLabel({ kind: 'unavailable' })).toBe('UNAVAILABLE');
    const ecmwf = parseWindArtifact(fixture({ model: 'ecmwf', issue_time: '2026-10-05T06:00:00Z' })) as WindArtifact;
    expect(windChipLabel(windFeedState(ecmwf, AT))).toBe('ECMWF 06:00Z');
  });
});

describe('wind field sampling', () => {
  it('returns exact node values at grid points', () => {
    expect(sampleWind(PARSED, 89, 23)).toEqual({ u: 89, v: 23 });
    expect(sampleWind(PARSED, 91, 24)).toEqual({ u: 91, v: 24 });
  });

  it('interpolates bilinearly between nodes', () => {
    expect(sampleWind(PARSED, 89.5, 23.5)).toEqual({ u: 89.5, v: 23.5 });
    expect(sampleWind(PARSED, 90.25, 23)).toEqual({ u: 90.25, v: 23 });
  });

  it('is null outside the grid: no breeze is invented beyond the box', () => {
    expect(sampleWind(PARSED, 88.9, 23)).toBeNull();
    expect(sampleWind(PARSED, 91.1, 23)).toBeNull();
    expect(sampleWind(PARSED, 90, 22.9)).toBeNull();
    expect(sampleWind(PARSED, 90, 24.1)).toBeNull();
  });
});
