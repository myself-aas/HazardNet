/**
 * Freshness chip grammar (plan §6): one vocabulary, all layers.
 * Amber is reserved for observed-and-current data; chips always carry text.
 */
import { mapFreshnessLabel, mapFreshnessTone } from '../mapFreshness';

describe('freshness chip grammar', () => {
  it('renders the five states verbatim', () => {
    expect(mapFreshnessLabel({ kind: 'live', utcTime: '12:40Z' })).toBe('LIVE 12:40Z');
    expect(mapFreshnessLabel({ kind: 'nrt', lag: '~4 h' })).toBe('NRT ~4 h');
    expect(mapFreshnessLabel({ kind: 'nrt', lag: '4 h' })).toBe('NRT ~4 h');
    expect(mapFreshnessLabel({ kind: 'stale', asOf: '09:10Z' })).toBe('STALE as of 09:10Z');
    expect(mapFreshnessLabel({ kind: 'snapshot', date: '2026-09-16' })).toBe('SNAPSHOT 2026-09-16');
    expect(mapFreshnessLabel({ kind: 'unavailable' })).toBe('UNAVAILABLE');
  });

  it('reserves amber for observed, current data', () => {
    expect(mapFreshnessTone({ kind: 'live', utcTime: '12:40Z' })).toBe('amber');
    expect(mapFreshnessTone({ kind: 'nrt', lag: '4 h' })).toBe('amber');
    expect(mapFreshnessTone({ kind: 'stale', asOf: '09:10Z' })).toBe('neutral');
    expect(mapFreshnessTone({ kind: 'snapshot', date: '2026-09-16' })).toBe('neutral');
    expect(mapFreshnessTone({ kind: 'unavailable' })).toBe('neutral');
  });
});
