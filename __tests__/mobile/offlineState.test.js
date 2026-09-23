/**
 * Phase 4 — offline / freshness state-machine unit tests.
 *
 * Verifies deriveDataState from @hazardnet/core correctly maps combinations
 * of (online?, cached?, error?, permission?, freshness) into the 12 explicit
 * states. These run under the root jsdom jest config.
 */

const { deriveDataState } = require('../../packages/core/src/freshness');

describe('deriveDataState offline/freshness state machine', () => {
  const BASE = {
    sloHours: 48,
    lastFetchFailed: false,
    partialSourcesMissing: false,
    hasActiveEvents: false,
    appError: false,
    permissionDenied: false,
  };

  it('returns appError whenever flag is set, regardless of other inputs', () => {
    expect(deriveDataState({ ...BASE, appError: true, isOnline: true, hasCachedDataForScreen: true, cachedAgeMs: 0 })).toBe('appError');
  });

  it('offline + cache → offlineCached', () => {
    expect(deriveDataState({ ...BASE, isOnline: false, hasCachedDataForScreen: true, cachedAgeMs: 1000 })).toBe('offlineCached');
  });

  it('offline + no cache → offlineNoCache (hard "you are offline and no data" red state)', () => {
    expect(deriveDataState({ ...BASE, isOnline: false, hasCachedDataForScreen: false, cachedAgeMs: null })).toBe('offlineNoCache');
  });

  it('online + fetch failed + no cache → serviceUnavailable', () => {
    expect(deriveDataState({ ...BASE, isOnline: true, lastFetchFailed: true, hasCachedDataForScreen: false, cachedAgeMs: null })).toBe('serviceUnavailable');
  });

  it('online + fetch failed + stale cache visible → serviceUnavailable banner (data still visible)', () => {
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    expect(deriveDataState({ ...BASE, isOnline: true, lastFetchFailed: true, hasCachedDataForScreen: true, cachedAgeMs: twoDaysMs })).toBe('serviceUnavailable');
  });

  it('fresh data (<=SLO) no events → loaded', () => {
    expect(deriveDataState({ ...BASE, isOnline: true, hasCachedDataForScreen: true, cachedAgeMs: 1000, hasActiveEvents: false })).toBe('loaded');
  });

  it('fresh data (<=SLO) with events → loadedActive', () => {
    expect(deriveDataState({ ...BASE, isOnline: true, hasCachedDataForScreen: true, cachedAgeMs: 1000, hasActiveEvents: true })).toBe('loadedActive');
  });

  it('SLO < age < 2×SLO → stale', () => {
    const age = 60 * 60 * 60 * 1000; // 60h, between 48 and 96
    expect(deriveDataState({ ...BASE, isOnline: true, hasCachedDataForScreen: true, cachedAgeMs: age })).toBe('stale');
  });

  it('age >= 2×SLO → delayed', () => {
    const age = 5 * 24 * 60 * 60 * 1000; // 5 days
    expect(deriveDataState({ ...BASE, isOnline: true, hasCachedDataForScreen: true, cachedAgeMs: age })).toBe('delayed');
  });

  it('online, no error, no cache → loading', () => {
    expect(deriveDataState({ ...BASE, isOnline: true, hasCachedDataForScreen: false, cachedAgeMs: null })).toBe('loading');
  });

  it('permissionDenied → permissionDenied even if online', () => {
    expect(deriveDataState({ ...BASE, isOnline: true, permissionDenied: true, hasCachedDataForScreen: false, cachedAgeMs: null })).toBe('permissionDenied');
  });

  it('fresh data + partial sources → partial', () => {
    expect(deriveDataState({ ...BASE, isOnline: true, hasCachedDataForScreen: true, cachedAgeMs: 1000, partialSourcesMissing: true })).toBe('partial');
  });
});
