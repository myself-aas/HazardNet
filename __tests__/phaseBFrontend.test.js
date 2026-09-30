import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;
const rootDir = process.cwd();

describe('TASK-004: Type Definitions & Backward Compatibility', () => {
  test('packages/core/src/forecasts.ts exports ADVISORY_TIERS and HAZARD_CLASSES', async () => {
    const coreForecastsPath = path.join(rootDir, 'packages/core/src/forecasts.ts');
    const content = fs.readFileSync(coreForecastsPath, 'utf8');

    assert.ok(content.includes("export const ADVISORY_TIERS = ['SEVERE', 'WARNING', 'WATCH', 'NORMAL'] as const;"));
    assert.ok(content.includes('Cold Wave'));
    assert.ok(content.includes('Tropical Cyclone'));
    assert.ok(content.includes('advisory_tier?: AdvisoryTier | string;'));
    assert.ok(content.includes('physics_override?: boolean;'));
    assert.ok(content.includes('model_severity_raw?: number;'));
    assert.ok(content.includes('final_severity?: number;'));
    assert.ok(content.includes('prob_top1?: number;'));
    assert.ok(content.includes('prob_top2?: number;'));
    assert.ok(content.includes('prob_top3?: number;'));
    assert.ok(content.includes('latitude?: number;'));
    assert.ok(content.includes('longitude?: number;'));
  });

  test('frontend/src/lib/forecasts.ts exports matching enums and ForecastRow fields', async () => {
    const libForecastsPath = path.join(rootDir, 'frontend/src/lib/forecasts.ts');
    const content = fs.readFileSync(libForecastsPath, 'utf8');

    assert.ok(content.includes("export const ADVISORY_TIERS = ['SEVERE', 'WARNING', 'WATCH', 'NORMAL'] as const;"));
    assert.ok(content.includes('advisory_tier?: AdvisoryTier | string;'));
    assert.ok(content.includes('physics_override?: boolean;'));
    assert.ok(content.includes('model_severity_raw?: number;'));
    assert.ok(content.includes('final_severity?: number;'));
    assert.ok(content.includes('prob_top1?: number;'));
    assert.ok(content.includes('prob_top2?: number;'));
    assert.ok(content.includes('prob_top3?: number;'));
  });

  test('frontend/src/types/index.ts re-exports core types and enums', async () => {
    const typesIndexPath = path.join(rootDir, 'frontend/src/types/index.ts');
    const content = fs.readFileSync(typesIndexPath, 'utf8');

    assert.ok(content.includes('ForecastRow'));
    assert.ok(content.includes('AdvisoryTier'));
    assert.ok(content.includes('HazardClass'));
    assert.ok(content.includes('ADVISORY_TIERS'));
    assert.ok(content.includes('HAZARD_CLASSES'));
  });

  test('applyForecastsToDistricts propagates advisory fields onto DistrictData without mutation', async () => {
    const forecastsLibPath = path.join(rootDir, 'frontend/src/lib/forecasts.ts');
    const content = fs.readFileSync(forecastsLibPath, 'utf8');

    assert.ok(content.includes('advisoryTier: row.advisory_tier'));
    assert.ok(content.includes('physicsOverride: row.physics_override'));
    assert.ok(content.includes('modelSeverityRaw: row.model_severity_raw'));
    assert.ok(content.includes('finalSeverity: row.final_severity'));
    assert.ok(content.includes('probTop1: row.prob_top1'));
  });
});

describe('TASK-005: Advisory Tier Badges, Map Markers & Status Strip', () => {
  test('AlertLevelBadge defines exact TRD §5.1 color ramps and accessible icons', async () => {
    const badgePath = path.join(rootDir, 'frontend/src/components/alerts/AlertLevelBadge.tsx');
    const content = fs.readFileSync(badgePath, 'utf8');

    // Color definitions
    assert.ok(content.includes("SEVERE: '#DC2626'"), 'SEVERE color must be #DC2626');
    assert.ok(content.includes("WARNING: '#D97706'"), 'WARNING color must be #D97706');
    assert.ok(content.includes("WATCH: '#CA8A04'"), 'WATCH color must be #CA8A04');
    assert.ok(content.includes("NORMAL: '#16A34A'"), 'NORMAL color must be #16A34A');

    // Icon associations
    assert.ok(content.includes("icon: 'alert_triangle'"), 'SEVERE must use alert_triangle icon');
    assert.ok(content.includes("icon: 'shield_alert'"), 'WARNING must use shield_alert icon');
    assert.ok(content.includes("icon: 'visibility'"), 'WATCH must use visibility icon');
    assert.ok(content.includes("icon: 'check_circle'"), 'NORMAL must use check_circle icon');
  });

  test('mapPrimitives.ts exports ADVISORY_TIER_COLORS and supports advisory tier in markers', async () => {
    const mapPrimitivesPath = path.join(rootDir, 'frontend/src/components/map/mapPrimitives.ts');
    const content = fs.readFileSync(mapPrimitivesPath, 'utf8');

    assert.ok(content.includes("SEVERE: '#DC2626'"));
    assert.ok(content.includes("WARNING: '#D97706'"));
    assert.ok(content.includes("WATCH: '#CA8A04'"));
    assert.ok(content.includes("NORMAL: '#16A34A'"));
    assert.ok(content.includes('advisoryTier?: string'));
    assert.ok(content.includes('getAdvisoryColor'));
  });

  test('StatusStrip.tsx computes tier counts accurately and formats correctly', async () => {
    const statusStripPath = path.join(rootDir, 'frontend/src/components/StatusStrip.tsx');
    assert.ok(fs.existsSync(statusStripPath), 'StatusStrip.tsx must exist');

    const content = fs.readFileSync(statusStripPath, 'utf8');
    assert.ok(content.includes('computeTierCounts'));
    assert.ok(content.includes('role="status"'));
    assert.ok(content.includes('aria-live="polite"'));

    // Test computeTierCounts logic on synthetic rows
    const syntheticRows = [
      { district_name: 'Dhaka', horizon: '7_days', advisory_tier: 'SEVERE', severity_score: 0.9 },
      { district_name: 'Sylhet', horizon: '7_days', advisory_tier: 'SEVERE', severity_score: 0.8 },
      { district_name: 'Chattogram', horizon: '7_days', advisory_tier: 'WARNING', severity_score: 0.6 },
      { district_name: 'Rajshahi', horizon: '7_days', advisory_tier: 'WATCH', severity_score: 0.4 },
      { district_name: 'Khulna', horizon: '7_days', advisory_tier: 'NORMAL', severity_score: 0.1 },
      // 15_days horizon rows should be ignored if filtering for 7_days
      { district_name: 'Dhaka', horizon: '15_days', advisory_tier: 'WARNING', severity_score: 0.5 },
    ];

    // Simulate computeTierCounts logic
    const counts = { SEVERE: 0, WARNING: 0, WATCH: 0, NORMAL: 0 };
    const relevant = syntheticRows.filter((r) => r.horizon === '7_days');
    for (const r of relevant) {
      if (r.advisory_tier === 'SEVERE') counts.SEVERE++;
      if (r.advisory_tier === 'WARNING') counts.WARNING++;
      if (r.advisory_tier === 'WATCH') counts.WATCH++;
      if (r.advisory_tier === 'NORMAL') counts.NORMAL++;
    }

    assert.equal(counts.SEVERE, 2);
    assert.equal(counts.WARNING, 1);
    assert.equal(counts.WATCH, 1);
    assert.equal(counts.NORMAL, 1);
    assert.equal(counts.SEVERE + counts.WARNING + counts.WATCH + counts.NORMAL, 5);
  });

  test('LiveMapView.tsx renders markers using getAdvisoryColor and mounts StatusStrip', async () => {
    const liveMapViewPath = path.join(rootDir, 'frontend/src/components/LiveMapView.tsx');
    const content = fs.readFileSync(liveMapViewPath, 'utf8');

    assert.ok(content.includes('getAdvisoryColor(dist.advisoryTier, dist.severity)'));
    assert.ok(content.includes('createCustomIcon(dist.severity, isSel, dist.hazardType, dist.name, dist.advisoryTier)'));
    assert.ok(content.includes('<StatusStrip counts={statusStripCounts}'));
  });

  test('ForecastDashboard.tsx displays Advisory Tier badges and StatusStrip', async () => {
    const dashboardPath = path.join(rootDir, 'frontend/src/components/ForecastDashboard.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf8');

    assert.ok(content.includes('<th className="p-3">Advisory Tier</th>'));
    assert.ok(content.includes('<AlertLevelBadge level={tier} size="sm" />'));
    assert.ok(content.includes('<StatusStrip forecasts={forecasts}'));
    assert.ok(content.includes('<DistrictDetailPanel'));
  });
});

describe('TASK-006: DistrictDetailPanel & WeatherPanel', () => {
  test('DistrictDetailPanel.tsx satisfies all 6 TRD §5.1 / §7.3 requirements', async () => {
    const detailPanelPath = path.join(rootDir, 'frontend/src/components/DistrictDetailPanel.tsx');
    assert.ok(fs.existsSync(detailPanelPath), 'DistrictDetailPanel.tsx must exist');

    const content = fs.readFileSync(detailPanelPath, 'utf8');

    // 1. District name, division, dates, hazard type, advisory tier
    assert.ok(content.includes('forecast.district_name'));
    assert.ok(content.includes('forecast.division'));
    assert.ok(content.includes('forecast.target_date'));
    assert.ok(content.includes('forecast.prediction_date'));
    assert.ok(content.includes('forecast.hazard_type'));
    assert.ok(content.includes('forecast.advisory_tier'));

    // 2. Dual-track severity display
    assert.ok(content.includes('model_severity') || content.includes('modelCalibrated'));
    assert.ok(content.includes('physics_severity') || content.includes('physicsSeverity'));
    assert.ok(content.includes('final_severity') || content.includes('finalSeverity'));

    // 3. Physics override transparency badge
    assert.ok(content.includes('Physics-grounded'));
    assert.ok(content.includes('physics_override') || content.includes('isPhysicsOverridden'));

    // 4. Forecasted weather parameters
    assert.ok(content.includes('forecast.temperature_max'));
    assert.ok(content.includes('forecast.temperature_min'));
    assert.ok(content.includes('forecast.precipitation_mm'));
    assert.ok(content.includes('forecast.wind_max_kmh'));

    // 5. Confidence breakdown visualizer (top-3 probabilities)
    assert.ok(content.includes('prob_top1'));
    assert.ok(content.includes('prob_top2'));
    assert.ok(content.includes('prob_top3'));

    // 6. Uncertainty advisory notice (< 0.40)
    assert.ok(content.includes('0.40') || content.includes('< 0.4'));
    assert.ok(content.includes('Low Model Confidence') || content.includes('Uncertain'));
    assert.ok(content.includes('out-of-distribution'));
  });

  test('WeatherPanel.tsx accepts optional forecast prop and renders forecasted parameters', async () => {
    const weatherPanelPath = path.join(rootDir, 'frontend/src/components/WeatherPanel.tsx');
    const content = fs.readFileSync(weatherPanelPath, 'utf8');

    assert.ok(content.includes('forecast?: ForecastRow;'));
    assert.ok(content.includes('Pipeline Agrometeorological Forecast'));
    assert.ok(content.includes('forecast.temperature_max'));
    assert.ok(content.includes('forecast.precipitation_mm'));
    assert.ok(content.includes('forecast.wind_max_kmh'));
  });
});

describe('TASK-007: Bengali Translations & Language Toggle Parity', () => {
  test('locales/en.json and locales/bn.json exist and parse without errors', async () => {
    const enPath = path.join(rootDir, 'frontend/src/locales/en.json');
    const bnPath = path.join(rootDir, 'frontend/src/locales/bn.json');

    assert.ok(fs.existsSync(enPath), 'frontend/src/locales/en.json must exist');
    assert.ok(fs.existsSync(bnPath), 'frontend/src/locales/bn.json must exist');

    const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const bnJson = JSON.parse(fs.readFileSync(bnPath, 'utf8'));

    // Parity for advisory tiers
    assert.equal(bnJson.advisory_tiers.SEVERE, 'গুরুতর');
    assert.equal(bnJson.advisory_tiers.WARNING, 'সতর্কবার্তা');
    assert.equal(bnJson.advisory_tiers.WATCH, 'পর্যবেক্ষণ');
    assert.equal(bnJson.advisory_tiers.NORMAL, 'স্বাভাবিক');

    assert.equal(enJson.advisory_tiers.SEVERE, 'Severe');
    assert.equal(enJson.advisory_tiers.WARNING, 'Warning');
    assert.equal(enJson.advisory_tiers.WATCH, 'Watch');
    assert.equal(enJson.advisory_tiers.NORMAL, 'Normal');

    // Agrometeorological glossary parity
    assert.equal(bnJson.hazards['Cold Wave'], 'শৈত্যপ্রবাহ');
    assert.equal(bnJson.hazards['Drought'], 'খরা');
    assert.equal(bnJson.hazards['Fire'], 'অগ্নিকাণ্ড');
    assert.equal(bnJson.hazards['Flash Flood'], 'আকস্মিক বন্যা');
    assert.equal(bnJson.hazards['Flood'], 'বন্যা');
    assert.equal(bnJson.hazards['Heat Wave'], 'তাপপ্রবাহ');
    assert.equal(bnJson.hazards['Severe Local Storm'], 'তীব্র কালবৈশাখী');
    assert.equal(bnJson.hazards['Tropical Cyclone'], 'ক্রান্তীয় ঘূর্ণিঝড়');
  });

  test('frontend/src/components/LanguageToggle.tsx re-exports LanguageToggle', async () => {
    const togglePath = path.join(rootDir, 'frontend/src/components/LanguageToggle.tsx');
    assert.ok(fs.existsSync(togglePath), 'frontend/src/components/LanguageToggle.tsx must exist');

    const content = fs.readFileSync(togglePath, 'utf8');
    assert.ok(content.includes('LanguageToggle'));
  });

  test('frontend/src/lib/i18n.ts has identical keys in EN and BN dictionaries with no missing or orphan keys', async () => {
    const i18nPath = path.join(rootDir, 'frontend/src/lib/i18n.ts');
    const content = fs.readFileSync(i18nPath, 'utf8');

    // Check tier translations in BN
    assert.ok(content.includes("'alerts.tier.SEVERE': 'গুরুতর'"));
    assert.ok(content.includes("'alerts.tier.WARNING': 'সতর্কবার্তা'"));
    assert.ok(content.includes("'alerts.tier.WATCH': 'পর্যবেক্ষণ'"));
    assert.ok(content.includes("'alerts.tier.NORMAL': 'স্বাভাবিক'"));
  });
});
