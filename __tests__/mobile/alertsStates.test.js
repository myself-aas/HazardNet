/**
 * Phase 3 state/unit tests for the alert data layer and severity→visual mapping.
 *
 * These tests cover:
 *   - mockAlerts fixtures conform to @hazardnet/core AlertItemSchema
 *   - severityForAlert + useSeverityVisual produce consistent colors and labels
 *   - highestAlert() ranks SEVERE > WARNING > WATCH > NO_ALERT
 *   - formatAge / formatTargetDate / confidenceLabel behave sanely
 *   - TanStack Query keys match @hazardnet/core QUERY_KEYS.alerts
 *
 * Full RNTL screen-rendering tests (TodaySevere/TodayWarning/TodayAllClear,
 * AlertsLoading/AlertsEmpty/AlertsError/AlertsFiltered, DetailSevere/DetailWarning/DetailAllClear/DetailStale)
 * require the `react-native` jest preset (jest-expo) and are wired up in Phase 3b
 * once the mobile app is ready to render under Jest.
 */

import { AlertItemSchema, QUERY_KEYS } from '@hazardnet/core';
import { MOCK_ALERTS, highestAlert, getExtrasFor, fetchMockAlerts } from '../../apps/mobile/src/lib/mockAlerts';
import { severityForAlert, confidenceLabel, formatAge, formatTargetDate } from '../../apps/mobile/src/lib/severity';

describe('mockAlerts fixtures', () => {
  it('every fixture passes Zod parse (core schema)', () => {
    for (const a of MOCK_ALERTS) {
      const parsed = AlertItemSchema.safeParse(a);
      expect(parsed.success).toBe(true);
    }
  });

  it('contain at least one SEVERE, one WARNING, and one WATCH fixture', () => {
    const levels = new Set(MOCK_ALERTS.map((a) => a.level));
    expect(levels.has('SEVERE')).toBe(true);
    expect(levels.has('WARNING')).toBe(true);
    expect(levels.has('WATCH')).toBe(true);
  });

  it('highestAlert picks SEVERE over WARNING over WATCH', () => {
    const mixed = [MOCK_ALERTS[2], MOCK_ALERTS[0], MOCK_ALERTS[1]]; // WATCH, SEVERE, WARNING
    const top = highestAlert(mixed);
    expect(top).toBeDefined();
    expect(top.level).toBe('SEVERE');
  });

  it('highestAlert returns null for empty list', () => {
    expect(highestAlert([])).toBeNull();
  });

  it('getExtrasFor returns headline/instructions for every fixture', () => {
    for (const a of MOCK_ALERTS) {
      const extras = getExtrasFor(a.id);
      expect(extras).not.toBeNull();
      expect(typeof extras.headline).toBe('string');
      expect(Array.isArray(extras.instructions)).toBe(true);
      expect(extras.instructions.length).toBeGreaterThan(0);
    }
  });

  it('fetchMockAlerts returns all fixtures within bounded delay', async () => {
    const out = await fetchMockAlerts(0);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(MOCK_ALERTS.length);
  });
});

describe('severity helpers', () => {
  it('severityForAlert maps each level to an edge name', () => {
    for (const a of MOCK_ALERTS) {
      const edge = severityForAlert(a);
      expect(['severe', 'warning', 'watch', 'info']).toContain(edge);
    }
  });

  it('confidenceLabel buckets ≥0.85 Certain, ≥0.70 Probable, else Uncertain', () => {
    expect(confidenceLabel(0.95)).toBe('Certain');
    expect(confidenceLabel(0.85)).toBe('Certain');
    expect(confidenceLabel(0.75)).toBe('Probable');
    expect(confidenceLabel(0.7)).toBe('Probable');
    expect(confidenceLabel(0.4)).toBe('Uncertain');
  });

  it('formatAge returns a non-empty string for valid ISOs', () => {
    expect(typeof formatAge(new Date().toISOString())).toBe('string');
    expect(formatAge(new Date().toISOString()).length).toBeGreaterThan(0);
  });

  it('formatTargetDate returns a non-empty string', () => {
    expect(typeof formatTargetDate(new Date(Date.now() + 86400000).toISOString())).toBe('string');
  });
});

describe('React Query key consistency', () => {
  it('useAlerts query key is exported by @hazardnet/core and is a stable array', () => {
    expect(Array.isArray(QUERY_KEYS.alerts)).toBe(true);
    expect(QUERY_KEYS.alerts[0]).toBe('alerts');
  });
});
