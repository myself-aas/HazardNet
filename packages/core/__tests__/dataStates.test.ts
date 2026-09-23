/**
 * Unit tests for data-state definitions and priority reducer.
 */

import { highestPriorityState, isDataState, DATA_STATE_DEFINITIONS, ALL_DATA_STATES } from '../src/dataStates';

describe('isDataState', () => {
  it('accepts all 12 known states', () => {
    for (const s of ALL_DATA_STATES) {
      expect(isDataState(s)).toBe(true);
    }
  });
  it('rejects garbage', () => {
    expect(isDataState('banana')).toBe(false);
    expect(isDataState(null)).toBe(false);
    expect(isDataState(undefined)).toBe(false);
  });
});

describe('highestPriorityState', () => {
  it('picks the highest-priority member by numeric priority', () => {
    // Higher number = more severe (see DATA_STATE_DEFINITIONS).
    expect(highestPriorityState(['loaded', 'loadedActive', 'stale'])).toBe('stale');
    expect(highestPriorityState(['loaded', 'stale'])).toBe('stale');
    expect(highestPriorityState(['appError', 'offlineCached', 'loaded'])).toBe('appError');
    expect(highestPriorityState(['offlineNoCache', 'loadedActive'])).toBe('offlineNoCache');
    expect(highestPriorityState(['delayed', 'stale'])).toBe('delayed');
    expect(highestPriorityState(['serviceUnavailable', 'stale', 'loaded'])).toBe('serviceUnavailable');
  });

  it('returns null for an empty set', () => {
    expect(highestPriorityState([])).toBeNull();
  });

  it('breaks ties by first occurrence', () => {
    expect(highestPriorityState(['loading', 'loaded'])).toBe('loading');
  });
});

describe('DATA_STATE_DEFINITIONS', () => {
  it('defines a non-empty headline and body for every state', () => {
    const allowedTones = new Set(['neutral', 'green', 'red', 'amber', 'blue']);
    for (const [, def] of Object.entries(DATA_STATE_DEFINITIONS)) {
      expect(def.headline.length).toBeGreaterThan(0);
      expect(def.bodyTemplate.length).toBeGreaterThan(0);
      expect(allowedTones.has(def.tone)).toBe(true);
      expect(typeof def.priority).toBe('number');
    }
  });

  it('uses appError as the most severe and loading/loaded as least', () => {
    expect(DATA_STATE_DEFINITIONS.appError.priority).toBeGreaterThan(DATA_STATE_DEFINITIONS.loaded.priority);
    expect(DATA_STATE_DEFINITIONS.serviceUnavailable.priority).toBeGreaterThan(DATA_STATE_DEFINITIONS.stale.priority);
  });
});
