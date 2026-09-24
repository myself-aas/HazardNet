/**
 * Unit tests for saved place schemas and quiet-hours logic.
 */

import {
  SavedPlaceSchema,
  QuietHoursSchema,
  PlaceNotificationPrefsSchema,
  isHazardEnabled,
  isInQuietHours,
  DEFAULT_QUIET_HOURS,
  DEFAULT_PLACE_NOTIFICATION_PREFS,
  MAX_SAVED_PLACES_ANONYMOUS,
} from '../src/savedPlaces';

describe('QuietHoursSchema', () => {
  it('applies defaults', () => {
    const parsed = QuietHoursSchema.parse({});
    expect(parsed.enabled).toBe(false);
    expect(parsed.start).toBe('22:00');
    expect(parsed.end).toBe('07:00');
    expect(parsed.criticalBypasses).toBe(true);
  });

  it('rejects invalid times', () => {
    expect(() => QuietHoursSchema.parse({ start: '25:00' })).toThrow();
    expect(() => QuietHoursSchema.parse({ end: '7:0' })).toThrow();
  });
});

describe('isInQuietHours', () => {
  it('is false when quiet hours disabled', () => {
    expect(isInQuietHours(DEFAULT_QUIET_HOURS, '23:00')).toBe(false);
  });

  it('handles overnight windows (22:00-07:00)', () => {
    const qh = { ...DEFAULT_QUIET_HOURS, enabled: true };
    expect(isInQuietHours(qh, '23:00')).toBe(true);
    expect(isInQuietHours(qh, '03:00')).toBe(true);
    expect(isInQuietHours(qh, '06:59')).toBe(true);
    expect(isInQuietHours(qh, '07:00')).toBe(false);
    expect(isInQuietHours(qh, '12:00')).toBe(false);
    expect(isInQuietHours(qh, '21:59')).toBe(false);
    expect(isInQuietHours(qh, '22:00')).toBe(true);
  });

  it('handles same-day windows (e.g., 13:00-15:00)', () => {
    const qh = { ...DEFAULT_QUIET_HOURS, enabled: true, start: '13:00', end: '15:00' };
    expect(isInQuietHours(qh, '12:00')).toBe(false);
    expect(isInQuietHours(qh, '13:00')).toBe(true);
    expect(isInQuietHours(qh, '14:59')).toBe(true);
    expect(isInQuietHours(qh, '15:00')).toBe(false);
    expect(isInQuietHours(qh, '23:00')).toBe(false);
  });

  it('returns false when start == end (invalid zero window)', () => {
    const qh = { ...DEFAULT_QUIET_HOURS, enabled: true, start: '22:00', end: '22:00' };
    expect(isInQuietHours(qh, '22:00')).toBe(false);
  });
});

describe('PlaceNotificationPrefsSchema defaults', () => {
  it('defaults to WARNING-min, enabled', () => {
    const parsed = PlaceNotificationPrefsSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.minLevel).toBe('WARNING');
  });
});

describe('isHazardEnabled', () => {
  it('defaults to true when a hazard is not listed', () => {
    expect(isHazardEnabled(DEFAULT_PLACE_NOTIFICATION_PREFS, 'flood')).toBe(true);
  });
  it('reads explicit toggles', () => {
    const prefs = PlaceNotificationPrefsSchema.parse({
      hazards: { flood: false, drought: true },
    });
    expect(isHazardEnabled(prefs, 'flood')).toBe(false);
    expect(isHazardEnabled(prefs, 'drought')).toBe(true);
    expect(isHazardEnabled(prefs, 'heat_wave')).toBe(true); // unspecified = on
  });
});

describe('SavedPlaceSchema', () => {
  it('requires id, label, districtId, timestamps', () => {
    const valid = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'Home',
      districtId: 'kurigram',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const parsed = SavedPlaceSchema.parse(valid);
    expect(parsed.label).toBe('Home');
    expect(parsed.kind).toBe('other'); // default
    expect(parsed.location).toBeNull(); // default
    expect(parsed.notifications.minLevel).toBe('WARNING');
  });

  it('rejects labels over 60 chars', () => {
    expect(() =>
      SavedPlaceSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        label: 'a'.repeat(61),
        districtId: 'kurigram',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ).toThrow();
  });
});

describe('constants', () => {
  it('publishes a sane anonymous place limit', () => {
    expect(MAX_SAVED_PLACES_ANONYMOUS).toBeGreaterThanOrEqual(5);
    expect(MAX_SAVED_PLACES_ANONYMOUS).toBeLessThanOrEqual(20);
  });
});
