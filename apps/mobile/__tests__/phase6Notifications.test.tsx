/**
 * Phase 6 notification unit + smoke tests.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '../src/test/test-utils';
import { parseDeepLink } from '../src/lib/notifications/useDeepLinking';
import { inQuietHours, matchAlertToPlace } from '@hazardnet/core';
import type { AlertItemType } from '@hazardnet/core';
import { DEFAULT_PLACE_NOTIFICATION_PREFS } from '@hazardnet/core';
import { NotificationPreferencesScreen } from '../src/screens/settings/NotificationPreferencesScreen';

describe('Phase 6 deep link parser', () => {
  it('parses hazardnet://alert/:id', () => {
    expect(parseDeepLink('hazardnet://alert/abc123')).toMatchObject({ type: 'alert', id: 'abc123' });
  });
  it('parses https://hazardnet.live/a/:id', () => {
    expect(parseDeepLink('https://hazardnet.live/a/cyclone-42')).toMatchObject({ type: 'alert', id: 'cyclone-42' });
  });
  it('parses place detail links', () => {
    expect(parseDeepLink('hazardnet://place/uuid-1')).toMatchObject({ type: 'place', id: 'uuid-1' });
  });
  it('parses settings notifications links', () => {
    expect(parseDeepLink('hazardnet://settings/notifications')).toMatchObject({ type: 'settings', section: 'notifications' });
  });
  it('returns unknown for garbage', () => {
    expect(parseDeepLink(null)).toMatchObject({ type: 'unknown' });
    expect(parseDeepLink('foo://bar')).toMatchObject({ type: 'unknown' });
  });
});

describe('Phase 6 matcher (core)', () => {
  const basePlace = (over: any = {}) => ({
    id: 'p1',
    label: 'Home',
    notes: '',
    kind: 'home' as const,
    location: null,
    districtId: 'Kurigram',
    notifications: { ...DEFAULT_PLACE_NOTIFICATION_PREFS },
    upazilas: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  });

  const baseAlert = (over: any = {}): AlertItemType => ({
    id: 'a1',
    district_name: 'Kurigram',
    hazard_type: 'cold_wave',
    level: 'WARNING',
    severity_score: 0.7,
    confidence: 0.9,
    prediction_date: '2026-01-01',
    target_date: '2026-01-02',
    horizon: '24h',
    ...over,
  });

  it('matches alert to place by district name', () => {
    const now = new Date('2026-01-01T12:00:00Z').getTime();
    const m = matchAlertToPlace(baseAlert(), basePlace(), now);
    expect(m).not.toBeNull();
    expect(m?.channel).toBe('warning');
  });

  it('respects minLevel threshold', () => {
    const place = basePlace({ notifications: { ...DEFAULT_PLACE_NOTIFICATION_PREFS, minLevel: 'SEVERE' } });
    const now = Date.now();
    expect(matchAlertToPlace(baseAlert({ level: 'WARNING' }), place, now)).toBeNull();
    expect(matchAlertToPlace(baseAlert({ level: 'SEVERE' }), place, now)).not.toBeNull();
  });

  it('suppresses non-critical during quiet hours', () => {
    // 23:00 Asia/Dhaka = UTC+6 = 17:00 UTC
    const quietPlace = basePlace({
      notifications: {
        ...DEFAULT_PLACE_NOTIFICATION_PREFS,
        enabled: true,
        minLevel: 'WATCH',
        quietHours: { enabled: true, start: '22:00', end: '07:00', timeZone: 'Asia/Dhaka', criticalBypasses: true },
        hazards: {},
      },
    });
    const now = new Date('2026-01-01T17:00:00Z').getTime(); // 23:00 Dhaka
    expect(matchAlertToPlace(baseAlert({ level: 'WARNING' }), quietPlace, now)).toBeNull();
    // SEVERE with globalCriticalEnabled=false should ALSO be suppressed (no DND bypass granted).
    expect(matchAlertToPlace(baseAlert({ level: 'SEVERE' }), quietPlace, now, { globalCriticalEnabled: false })).toBeNull();
    // With globalCriticalEnabled=true SEVERE bypasses.
    expect(matchAlertToPlace(baseAlert({ level: 'SEVERE' }), quietPlace, now, { globalCriticalEnabled: true })).not.toBeNull();
  });

  it('inQuietHours handles overnight windows', () => {
    // 23:00 Asia/Dhaka is in [22:00,07:00)
    expect(inQuietHours(new Date('2026-01-01T17:00:00Z').getTime(), { enabled: true, start: '22:00', end: '07:00', criticalBypasses: true }, 'Asia/Dhaka')).toBe(true);
    // 06:59 Asia/Dhaka (00:59 UTC) IS in quiet hours
    expect(inQuietHours(new Date('2026-01-01T00:59:00Z').getTime(), { enabled: true, start: '22:00', end: '07:00', criticalBypasses: true }, 'Asia/Dhaka')).toBe(true);
    // 10:00 Asia/Dhaka (04:00 UTC) is NOT in quiet hours
    expect(inQuietHours(new Date('2026-01-01T04:00:00Z').getTime(), { enabled: true, start: '22:00', end: '07:00', criticalBypasses: true }, 'Asia/Dhaka')).toBe(false);
  });
});

describe('Phase 6 NotificationPreferencesScreen smoke', () => {
  it('renders without crashing', async () => {
    render(<NotificationPreferencesScreen />);
    await waitFor(() => expect(screen.getByText('Notifications')).toBeTruthy());
    expect(screen.getByText(/Send test notification/)).toBeTruthy();
  });
});
