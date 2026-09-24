/**
 * Unit tests for notification/request dedupe helpers.
 */

import { alertDedupeKey, shouldSuppressNotification, requestDedupeKey } from '../src/dedupe';

describe('alertDedupeKey', () => {
  it('buckets same district/hazard/target window into the same key', () => {
    const base = {
      district_id: 'kurigram',
      hazard_type: 'Flash Flood',
      target_date: '2026-09-24T00:00:00Z',
      level: 'WATCH' as const,
    };
    // Same hazard same day → same bucket.
    const a = alertDedupeKey({ ...base, id: 'a' });
    const b = alertDedupeKey({ ...base, id: 'b', target_date: '2026-09-24T03:00:00Z' });
    expect(a).toBe(b);
  });

  it('separates different districts or hazards', () => {
    const base = {
      district_id: 'kurigram',
      hazard_type: 'Flash Flood',
      target_date: '2026-09-24T00:00:00Z',
      level: 'WATCH' as const,
    };
    const otherDistrict = alertDedupeKey({ ...base, district_id: 'dhaka' });
    const otherHazard = alertDedupeKey({ ...base, hazard_type: 'Flood' });
    expect(alertDedupeKey(base)).not.toBe(otherDistrict);
    expect(alertDedupeKey(base)).not.toBe(otherHazard);
  });

  it('uses district_name when district_id is absent', () => {
    const withId = alertDedupeKey({
      district_id: 'kurigram',
      hazard_type: 'Flash Flood',
      target_date: '2026-09-24T00:00:00Z',
      level: 'WATCH' as const,
    });
    const withName = alertDedupeKey({
      district_name: 'Kurigram',
      hazard_type: 'flash-flood',
      target_date: '2026-09-24T00:00:00Z',
      level: 'WATCH' as const,
    });
    expect(withId).toBe(withName);
  });
});

describe('shouldSuppressNotification', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const base = { level: 'WATCH' as const, receivedAt: now, dedupeKey: 'x' };

  it('never suppresses when there is no prior notification', () => {
    expect(shouldSuppressNotification(base, null)).toBe(false);
  });

  it('suppresses when the prior level is higher (de-escalation)', () => {
    expect(
      shouldSuppressNotification(base, { level: 'SEVERE', at: now - 60_000 }),
    ).toBe(true);
    expect(
      shouldSuppressNotification(base, { level: 'WARNING', at: now - 60_000 }),
    ).toBe(true);
  });

  it('suppresses duplicate same-level notifications within 30 minutes', () => {
    expect(
      shouldSuppressNotification(base, { level: 'WATCH', at: now - 10 * 60_000 }),
    ).toBe(true);
  });

  it('allows same-level notification after 30 minutes', () => {
    expect(
      shouldSuppressNotification(base, { level: 'WATCH', at: now - 35 * 60_000 }),
    ).toBe(false);
  });

  it('always allows escalation (lower prior, higher new)', () => {
    expect(
      shouldSuppressNotification(
        { ...base, level: 'SEVERE' },
        { level: 'WATCH', at: now - 5 * 60_000 },
      ),
    ).toBe(false);
  });
});

describe('requestDedupeKey', () => {
  it('canonicalises method and URL', () => {
    expect(requestDedupeKey('get', '/v1/alerts')).toBe('GET:/v1/alerts');
  });
  it('sorts params alphabetically to avoid order-dependent keys', () => {
    const a = requestDedupeKey('GET', '/v1/alerts', { level: 'WARNING', district: 'kurigram' });
    const b = requestDedupeKey('GET', '/v1/alerts', { district: 'kurigram', level: 'WARNING' });
    expect(a).toBe(b);
  });
  it('omits null/undefined params', () => {
    const key = requestDedupeKey('GET', '/v1/alerts', { level: null, district: 'kurigram' });
    expect(key).not.toContain('level');
    expect(key).toContain('district=kurigram');
  });
});
