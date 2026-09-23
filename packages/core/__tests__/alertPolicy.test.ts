/**
 * Unit tests for alert-policy thresholds and cache TTL helpers.
 */

import {
  SEVERITY_THRESHOLDS,
  CACHE_TTL_MS,
  cacheTtlForHazard,
  ALERT_POLICY_VERSION,
  EMERGENCY_CONTACTS,
  OFFICIAL_DISCLAIMER,
  SLO_HOURS,
} from '../src/alertPolicy';

describe('alertPolicy constants', () => {
  it('exports the policy version and severity thresholds', () => {
    expect(ALERT_POLICY_VERSION).toBe('alert-policy/1.0.0');
    expect(SEVERITY_THRESHOLDS.WATCH).toBe(0.4);
    expect(SEVERITY_THRESHOLDS.WARNING).toBe(0.65);
    expect(SEVERITY_THRESHOLDS.SEVERE).toBe(0.8);
  });

  it('defines the three SLOs used by the status page', () => {
    expect(SLO_HOURS.FORECAST).toBe(192);
    expect(SLO_HOURS.ALERT_SNAPSHOT).toBe(48);
    expect(SLO_HOURS.HEALTH_PROBE).toBe(2);
  });

  it('publishes the three emergency contact numbers', () => {
    expect(EMERGENCY_CONTACTS).toHaveLength(3);
    expect(EMERGENCY_CONTACTS.map((c) => c.number)).toEqual(['999', '1090', '16123']);
  });

  it('has a non-empty disclaimer', () => {
    expect(OFFICIAL_DISCLAIMER.length).toBeGreaterThan(40);
    expect(OFFICIAL_DISCLAIMER).toMatch(/not an official warning service/);
  });
});

describe('cacheTtlForHazard', () => {
  it('defaults to 24h for unknown hazards', () => {
    expect(cacheTtlForHazard('alien_invasion')).toBe(CACHE_TTL_MS.DEFAULT);
  });

  it('returns shorter TTLs for fast-evolving hazards when active', () => {
    const normal = cacheTtlForHazard('flash_flood', { active: false });
    const active = cacheTtlForHazard('flash_flood', { active: true });
    expect(active).toBeLessThan(normal);
    expect(active).toBe(6 * 60 * 60 * 1000);
    expect(normal).toBe(24 * 60 * 60 * 1000);
  });

  it('is case-insensitive and accepts hyphen/space variants', () => {
    const canonical = cacheTtlForHazard('tropical_cyclone');
    expect(cacheTtlForHazard('TROPICAL CYCLONE')).toBe(canonical);
    expect(cacheTtlForHazard('Tropical-Cyclone')).toBe(canonical);
    expect(cacheTtlForHazard('cyclone')).toBe(canonical);
  });

  it('maps known hazard name aliases', () => {
    expect(cacheTtlForHazard('flood')).toBe(CACHE_TTL_MS.MONSOON_FLOOD);
    expect(cacheTtlForHazard('heat')).toBe(CACHE_TTL_MS.HEAT_WAVE);
    expect(cacheTtlForHazard('cold')).toBe(CACHE_TTL_MS.COLD_WAVE);
    expect(cacheTtlForHazard('wildfire')).toBe(CACHE_TTL_MS.FIRE);
    expect(cacheTtlForHazard('norwester')).toBe(CACHE_TTL_MS.SEVERE_LOCAL_STORM_DEFAULT);
  });
});
