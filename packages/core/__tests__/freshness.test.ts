/**
 * Unit tests for freshness and data-state derivation.
 */

import {
  ageMs,
  toHours,
  describeAge,
  evaluateFreshness,
  deriveDataState,
  renderBody,
  SLO_HOURS,
} from '../src/freshness';
import { DATA_STATE_DEFINITIONS } from '../src/dataStates';

const H = 60 * 60 * 1000;

describe('ageMs', () => {
  it('returns null for invalid inputs', () => {
    expect(ageMs(null)).toBeNull();
    expect(ageMs(undefined)).toBeNull();
    expect(ageMs('not-a-date')).toBeNull();
    expect(ageMs('')).toBeNull();
  });

  it('computes age relative to a provided reference time', () => {
    const now = new Date('2026-09-23T12:00:00Z').getTime();
    expect(ageMs('2026-09-23T11:00:00Z', now)).toBe(1 * H);
    expect(ageMs('2026-09-23T12:00:00Z', now)).toBe(0);
    // Future dates clamp to 0.
    expect(ageMs('2026-09-23T13:00:00Z', now)).toBe(0);
  });
});

describe('describeAge', () => {
  it('returns an em dash for null', () => {
    expect(describeAge(null)).toBe('—');
  });
  it('uses appropriate units', () => {
    expect(describeAge(30 * 1000)).toBe('30s');
    expect(describeAge(5 * 60 * 1000)).toBe('5m');
    expect(describeAge(2 * H)).toBe('2h');
    expect(describeAge(3 * 24 * H)).toBe('3d');
  });
});

describe('evaluateFreshness', () => {
  it('returns unknown when age is null', () => {
    expect(evaluateFreshness(null, SLO_HOURS.ALERT_SNAPSHOT)).toBe('unknown');
  });
  it('returns fresh within SLO', () => {
    expect(evaluateFreshness(1 * H, SLO_HOURS.ALERT_SNAPSHOT)).toBe('fresh');
    expect(evaluateFreshness(48 * H, SLO_HOURS.ALERT_SNAPSHOT)).toBe('fresh');
  });
  it('returns stale between 1x and 2x SLO', () => {
    expect(evaluateFreshness(50 * H, SLO_HOURS.ALERT_SNAPSHOT)).toBe('stale');
    expect(evaluateFreshness(95 * H, SLO_HOURS.ALERT_SNAPSHOT)).toBe('stale');
  });
  it('returns failing beyond 2x SLO', () => {
    expect(evaluateFreshness(97 * H, SLO_HOURS.ALERT_SNAPSHOT)).toBe('failing');
    expect(evaluateFreshness(200 * H, SLO_HOURS.ALERT_SNAPSHOT)).toBe('failing');
  });
});

describe('deriveDataState', () => {
  const onlineFresh = {
    isOnline: true,
    hasCachedDataForScreen: true,
    cachedAgeMs: 1 * H,
    sloHours: SLO_HOURS.ALERT_SNAPSHOT,
    lastFetchFailed: false,
    partialSourcesMissing: false,
    hasActiveEvents: false,
    appError: false,
    permissionDenied: false,
  };

  it('returns loading when online with no cached data yet', () => {
    expect(deriveDataState({ ...onlineFresh, hasCachedDataForScreen: false })).toBe('loading');
  });

  it('returns loaded when fresh and no active events', () => {
    expect(deriveDataState(onlineFresh)).toBe('loaded');
  });

  it('returns loadedActive when fresh and has active events', () => {
    expect(deriveDataState({ ...onlineFresh, hasActiveEvents: true })).toBe('loadedActive');
  });

  it('returns stale when age exceeds SLO', () => {
    expect(deriveDataState({ ...onlineFresh, cachedAgeMs: 60 * H })).toBe('stale');
  });

  it('returns delayed when age exceeds 2x SLO', () => {
    expect(deriveDataState({ ...onlineFresh, cachedAgeMs: 110 * H })).toBe('delayed');
  });

  it('returns partial when fresh but missing some sources', () => {
    expect(deriveDataState({ ...onlineFresh, partialSourcesMissing: true })).toBe('partial');
  });

  it('returns sourceFailure when stale and missing sources', () => {
    expect(
      deriveDataState({ ...onlineFresh, cachedAgeMs: 110 * H, partialSourcesMissing: true }),
    ).toBe('sourceFailure');
  });

  it('returns offlineCached/OfflineNoCache per data availability', () => {
    expect(deriveDataState({ ...onlineFresh, isOnline: false })).toBe('offlineCached');
    expect(
      deriveDataState({ ...onlineFresh, isOnline: false, hasCachedDataForScreen: false }),
    ).toBe('offlineNoCache');
  });

  it('returns serviceUnavailable when fetch fails', () => {
    expect(deriveDataState({ ...onlineFresh, lastFetchFailed: true })).toBe('serviceUnavailable');
  });

  it('returns permissionDenied when permission is missing', () => {
    expect(deriveDataState({ ...onlineFresh, permissionDenied: true })).toBe('permissionDenied');
  });

  it('returns appError when error boundary is active, regardless of everything else', () => {
    expect(
      deriveDataState({
        ...onlineFresh,
        appError: true,
        isOnline: true,
        hasActiveEvents: true,
      }),
    ).toBe('appError');
  });
});

describe('renderBody', () => {
  it('substitutes {age} placeholder', () => {
    const out = renderBody('stale', { age: '5h' });
    expect(out).toContain('5h');
    expect(out).not.toContain('{age}');
  });
  it('returns a non-empty string for every state', () => {
    for (const def of Object.values(DATA_STATE_DEFINITIONS)) {
      expect(renderBody(def.state, { age: '1h', permission: 'Location', source: 'BMD' }).length).toBeGreaterThan(5);
    }
  });
});

describe('toHours', () => {
  it('converts ms to whole hours', () => {
    expect(toHours(2 * H)).toBe(2);
    expect(toHours(2 * H + 30 * 60 * 1000)).toBe(2);
    expect(toHours(null)).toBeNull();
  });
});
