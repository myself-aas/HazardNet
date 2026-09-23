/**
 * Unit tests for query/mutation key constants.
 */

import { QUERY_KEYS, MUTATION_KEYS } from '../src/queryKeys';

describe('QUERY_KEYS', () => {
  it('contains all keys referenced by the mobile shell', () => {
    const expected = ['forecasts', 'alerts', 'savedPlaces', 'appConfig', 'freshness', 'districts', 'notificationPrefs', 'authState', 'weather'];
    for (const k of expected) {
      expect(k in QUERY_KEYS).toBe(true);
    }
  });

  it('exposes readonly string arrays for static entries and functions for parameterized entries', () => {
    expect(Array.isArray(QUERY_KEYS.forecasts)).toBe(true);
    expect(QUERY_KEYS.forecasts).toEqual(['forecasts']);
    // Parameterized entries are functions returning tuples.
    expect(QUERY_KEYS.forecastByDistrict('kurigram')).toEqual(['forecasts', 'district', 'kurigram']);
    expect(QUERY_KEYS.alertById('abc')).toEqual(['alerts', 'abc']);
    expect(QUERY_KEYS.weather(1)).toEqual(['weather', '1']);
    expect(QUERY_KEYS.forecastBulk('24h')).toEqual(['forecasts', 'bulk', '24h']);
  });
});

describe('MUTATION_KEYS', () => {
  it('declares canonical mutation keys', () => {
    expect(MUTATION_KEYS.savePlace).toEqual(['savePlace']);
    expect(MUTATION_KEYS.deletePlace).toEqual(['deletePlace']);
    expect(MUTATION_KEYS.markAlertRead).toEqual(['markAlertRead']);
  });
});
