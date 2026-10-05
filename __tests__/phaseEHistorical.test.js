/**
 * __tests__/phaseEHistorical.test.js — Phase E (Historical Hazards & Multilateral GLIDE Integration) Integration Test Suite
 *
 * Validates:
 * - TASK-015: Static JSON Bundling Pipeline & Analytical Datasets Integrity (TRD §2.4.1, §5.1)
 * - TASK-016: GLIDE Link Resolver Utility & Historical REST API Endpoints (TRD §2.5, §5.2, §6.4)
 * - TASK-017: Vulnerability Color Ramp & Geospatial Utilities (TRD §5.1, §7.10)
 * - TASK-018: District Vulnerability Ranking & Historical Catalog Data Engine (TRD §2.4.1, §7.8)
 * - TASK-019: Temporal Trends & Milestone Annotations (TRD §5.1)
 * - TASK-020: Multilateral GLIDE Resource Resolver & Security Attributes (TRD §5.2, §9.2)
 */

import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;

import { generateGlideLinks, GLIDE_REGEX } from '../backend/utils/glideResolver.js';

describe('TASK-015: Analytical Datasets & Bundling Pipeline Integrity', () => {
  const dataDir = path.resolve(process.cwd(), 'frontend', 'public', 'data', 'historical');

  test('All 5 historical JSON artifacts exist in frontend/public/data/historical', () => {
    assert.ok(fs.existsSync(dataDir), 'historical directory must exist');

    const expectedFiles = [
      'districts-vulnerability.json',
      'temporal-trends.json',
      'hazard-distribution.json',
      'events-master.json',
      'hazard-catalog-index.json',
    ];

    for (const file of expectedFiles) {
      const p = path.join(dataDir, file);
      assert.ok(fs.existsSync(p), `${file} must exist`);
      const stat = fs.statSync(p);
      assert.ok(stat.size > 100, `${file} must not be empty`);
    }
  });

  test('districts-vulnerability.json contains exactly 64 districts with valid scores', () => {
    const p = path.join(dataDir, 'districts-vulnerability.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    assert.equal(data.length, 64, 'Must contain exactly 64 districts');
    for (const d of data) {
      assert.ok(d.district && typeof d.district === 'string', 'District name must be non-empty');
      assert.ok(typeof d.vulnerability_score === 'number', 'Vulnerability score must be numeric');
      assert.ok(d.vulnerability_score >= 0 && d.vulnerability_score <= 1, 'Score must be between 0 and 1');
      assert.ok(d.rank >= 1 && d.rank <= 64, 'Rank must be between 1 and 64');
      assert.ok(d.total_events >= 0, 'Total events must be non-negative');
    }
  });

  test('temporal-trends.json covers 2000 through 2026 without invalid dates', () => {
    const p = path.join(dataDir, 'temporal-trends.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    assert.ok(data.length >= 20, 'Should have comprehensive yearly coverage');
    const years = data.map((d) => d.year);
    assert.ok(years.includes(2000), 'Must include year 2000');
    assert.ok(years.includes(2026), 'Must include year 2026');
    assert.ok(years.includes(2007), 'Must include milestone year 2007 (Sidr)');
    assert.ok(years.includes(2017), 'Must include milestone year 2017 (Floods)');
    assert.ok(years.includes(2024), 'Must include milestone year 2024 (Remal)');

    for (const d of data) {
      assert.ok(d.event_frequency >= 0, 'Event frequency must be non-negative');
    }
  });

  test('hazard-distribution.json contains 10 hazard classes summing to ~100%', () => {
    const p = path.join(dataDir, 'hazard-distribution.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    assert.equal(data.length, 10, 'Must contain exactly 10 hazard classes');
    const totalPercentage = data.reduce((sum, h) => sum + h.percentage, 0);
    assert.ok(
      totalPercentage >= 99 && totalPercentage <= 101,
      `Percentage sum should be ~100%, got ${totalPercentage}`
    );

    const hazards = data.map((h) => h.hazard_type);
    assert.ok(hazards.includes('Flood'), 'Must include Flood');
    assert.ok(hazards.includes('Tropical Cyclone'), 'Must include Tropical Cyclone');
    assert.ok(hazards.includes('Flash Flood'), 'Must include Flash Flood');
  });

  test('events-master.json contains exactly 70 master disaster events with full narratives', () => {
    const p = path.join(dataDir, 'events-master.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    assert.equal(data.length, 70, 'Must contain exactly 70 master disaster events');
    for (const evt of data) {
      assert.ok(evt.full_description && evt.full_description.length > 20, 'Event narrative must be populated');
      if (evt.glide && evt.glide !== 'N/A') {
        assert.ok(evt.links && evt.links.reliefweb, 'GLIDE events must include ReliefWeb link');
        assert.ok(evt.links.fao_giews, 'GLIDE events must include FAO link');
        assert.ok(evt.links.who_emergencies, 'GLIDE events must include WHO link');
        assert.ok(evt.links.adrc_registry, 'GLIDE events must include ADRC link');
        assert.ok(evt.links.ifrc_go, 'GLIDE events must include IFRC GO link');
      }
    }
  });

  test('hazard-catalog-index.json contains exactly 3,062 clean records', () => {
    const p = path.join(dataDir, 'hazard-catalog-index.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));

    assert.equal(data.length, 3062, 'Must contain exactly 3,062 cleaned historical hazard records');
    const first = data[0];
    assert.ok(first.id, 'Record must have id');
    assert.ok(first.district, 'Record must have district');
    assert.ok(first.hazard_type, 'Record must have hazard_type');
    assert.ok(first.date, 'Record must have date');
  });

  test('national-summary.json carries the headline stats with numeric twins', () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'national-summary.json'), 'utf8'));
    assert.ok(data.metrics.length >= 4, 'Must carry the headline metrics');
    const names = data.metrics.map((m) => m.metric);
    assert.ok(names.includes('Total Unique Events'), 'headline event count present');
    assert.ok(names.includes('Unique Districts'), 'district count present');
    const events = data.metrics.find((m) => m.metric === 'Total Unique Events');
    assert.equal(events.numeric, 3324, 'raw occurrence count is 3,324');
  });

  test('correlations.json is a square matrix over its declared variables', () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'correlations.json'), 'utf8'));
    assert.ok(data.variables.length >= 2, 'Must declare its variables');
    assert.equal(data.matrix.length, data.variables.length, 'matrix rows equal variables');
    for (const row of data.matrix) {
      assert.equal(row.length, data.variables.length, 'matrix is square');
    }
    const lat = data.variables.indexOf('Latitude');
    const lng = data.variables.indexOf('Longitude');
    if (lat >= 0 && lng >= 0) {
      assert.ok(Math.abs(data.matrix[lat][lng] - data.matrix[lng][lat]) < 1e-9, 'symmetric pair');
    }
  });

  test('gee-validation.json accounts for every GEE hand-off row', () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'gee-validation.json'), 'utf8'));
    assert.equal(data.matched + data.mismatched, data.gee_rows, 'matched plus mismatched equals GEE rows');
    assert.ok(data.gee_rows >= data.catalog_rows, 'GEE export is the raw twin of the clean archive');
  });
});

describe('TASK-016: Multilateral GLIDE Link Resolver & REST API', () => {
  test('generateGlideLinks resolves 5 verified multilateral endpoints for valid GLIDE format', () => {
    const testGlide = 'FL-2026-000109-BGD';
    const links = generateGlideLinks(testGlide);

    assert.equal(
      links.reliefweb,
      'https://reliefweb.int/disaster/FL-2026-000109-BGD'
    );
    assert.equal(
      links.fao_giews,
      'https://www.fao.org/giews/countrybrief/country.jsp?code=BGD'
    );
    assert.equal(
      links.who_emergencies,
      'https://extranet.who.int/public-emergencies'
    );
    assert.equal(
      links.adrc_registry,
      'https://www.glidenumber.net/glide/public/search/search.jsp?glide=FL-2026-000109-BGD'
    );
    assert.equal(
      links.ifrc_go,
      'https://go.ifrc.org/emergencies?search=FL-2026-000109-BGD'
    );
  });

  test('GLIDE_REGEX enforces strict standard format and rejects invalid inputs', () => {
    assert.ok(GLIDE_REGEX.test('TC-2007-000208-BGD'), 'Must accept standard BGD cyclone GLIDE');
    assert.ok(GLIDE_REGEX.test('FL-2024-000088-BGD'), 'Must accept flood GLIDE');
    assert.ok(GLIDE_REGEX.test('EQ-2023-000012-IND'), 'Must accept transboundary regional GLIDE');

    assert.ok(!GLIDE_REGEX.test('invalid-glide'), 'Must reject plain text');
    assert.ok(!GLIDE_REGEX.test('FL-2026-109-BGD'), 'Must reject short number segment');
    assert.ok(!GLIDE_REGEX.test('FL-26-000109-BGD'), 'Must reject 2-digit year');
    assert.throws(() => generateGlideLinks('bad-glide'), /Invalid GLIDE format/);
    assert.throws(() => generateGlideLinks(''), /GLIDE identifier must be a non-empty string/);
  });

  test('backend/server.js registers /api/v1/historical router', () => {
    const serverCode = fs.readFileSync(path.resolve(process.cwd(), 'backend', 'server.js'), 'utf8');
    assert.ok(serverCode.includes("from './routes/historical.js'"), 'server.js must import historical routes');
    assert.ok(serverCode.includes('/api/v1/historical'), 'server.js must mount at /api/v1/historical');
  });

  test('The Vercel entry point for /api/v1/historical exists and serves it with security headers', async () => {
    // The handler lives in serverless/ — a directory Vercel does not scan for functions —
    // and is deployed by the URL-family entry point (docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget).
    const handlerPath = path.resolve(process.cwd(), 'serverless', 'v1', 'historical.js');
    assert.ok(fs.existsSync(handlerPath), 'serverless/v1/historical.js must exist');
    const entryPath = path.resolve(process.cwd(), 'api', 'v1', '[resource].js');
    assert.ok(fs.existsSync(entryPath), 'api/v1/[resource].js must exist');

    // Drive the entry point, not the handler: this is the file Vercel deploys, and the
    // assertion below fails if it stops routing `historical` to this handler.
    const module = await import('../api/v1/[resource].js');
    const handler = typeof module.default === 'function' ? module.default : module.default?.default;
    assert.equal(typeof handler, 'function', 'Serverless handler must be default export');
    assert.ok(
      [...(handler.routes || [])].includes('historical'),
      'api/v1/[resource].js must route historical',
    );

    // Simulate mock request to /summary
    let statusCode = 0;
    const headers = {};
    let responseBody = null;

    const req = {
      method: 'GET',
      url: '/api/v1/historical?action=summary',
      headers: { host: 'localhost' },
    };

    const res = {
      setHeader(k, v) {
        headers[k] = v;
        return this;
      },
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
      end() {
        return this;
      },
    };

    await handler(req, res);
    assert.equal(statusCode, 200, 'Handler must return 200');
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.total_events, 3062);
    assert.equal(responseBody.total_districts, 64);
    assert.equal(responseBody.total_master_events, 70);
  });
});

describe('TASK-017 & TASK-018: Frontend Components, Color Ramp & Export Logics', () => {
  test('geo.ts getVulnerabilityColor applies continuous ramp across thresholds', async () => {
    const geoModule = await import('../frontend/src/lib/geo.ts');
    const resolvedGeo = geoModule.getVulnerabilityColor ? geoModule : (geoModule.default?.getVulnerabilityColor ? geoModule.default : geoModule.default?.default);
    const { getVulnerabilityColor, getVulnerabilityTier, formatVulnerabilityScore } = resolvedGeo;

    // Green for low
    assert.equal(getVulnerabilityColor(0.1), '#16a34a');
    assert.equal(getVulnerabilityTier(0.1), 'LOW');

    // Yellow / Amber for moderate
    assert.equal(getVulnerabilityColor(0.55), '#ea580c');
    assert.equal(getVulnerabilityTier(0.55), 'MODERATE');

    // Vivid red for high
    assert.equal(getVulnerabilityColor(0.75), '#dc2626');
    assert.equal(getVulnerabilityTier(0.75), 'HIGH');

    // Crimson dark for critical
    assert.equal(getVulnerabilityColor(0.95), '#7f1d1d');
    assert.equal(getVulnerabilityTier(0.95), 'CRITICAL');

    // Format score 3 decimals
    assert.equal(formatVulnerabilityScore(0.9921875), '0.992');
    assert.equal(formatVulnerabilityScore(0.5), '0.500');
  });

  test('HistoricalCatalogPage, DistrictRiskMap, DistrictVulnerabilityTable and HistoricalHazardCatalog source files exist', () => {
    const comps = [
      'frontend/src/components/DistrictRiskMap.tsx',
      'frontend/src/components/DistrictVulnerabilityTable.tsx',
      'frontend/src/components/HistoricalHazardCatalog.tsx',
      'frontend/src/components/TemporalTrendChart.tsx',
      'frontend/src/components/MultiHazardDistributionChart.tsx',
      'frontend/src/components/GlideResourcePopover.tsx',
      'frontend/src/components/EventReportModal.tsx',
      'frontend/src/pages/HistoricalCatalogPage.tsx',
    ];

    for (const c of comps) {
      assert.ok(fs.existsSync(path.resolve(process.cwd(), c)), `${c} must exist`);
    }
  });

  test('HistoricalHazardCatalog includes client-side CSV & JSON export algorithms', () => {
    const code = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'HistoricalHazardCatalog.tsx'), 'utf8');
    assert.ok(code.includes('exportAsCsv'), 'Must define exportAsCsv');
    assert.ok(code.includes('exportAsJson'), 'Must define exportAsJson');
    assert.ok(code.includes('text/csv;charset=utf-8;'), 'Must specify text/csv mime type');
    assert.ok(code.includes('application/json'), 'Must specify application/json mime type');
    assert.ok(code.includes('URL.createObjectURL(blob)'), 'Must create Blob URL');
    assert.ok(code.includes('URL.revokeObjectURL(url)'), 'Must revoke Blob URL to prevent leaks');
  });
});

describe('TASK-019 & TASK-020: Milestones & External Link Security Attributes', () => {
  test('TemporalTrendChart includes 2007 Sidr, 2017 Floods, and 2024 Remal milestone annotations', () => {
    const code = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'TemporalTrendChart.tsx'), 'utf8');
    assert.ok(code.includes('2007'), 'Must reference 2007');
    assert.ok(code.includes('Cyclone Sidr'), 'Must reference Cyclone Sidr');
    assert.ok(code.includes('2017'), 'Must reference 2017');
    assert.ok(code.includes('Flash Floods'), 'Must reference Flash Floods');
    assert.ok(code.includes('2024'), 'Must reference 2024');
    assert.ok(code.includes('Cyclone Remal'), 'Must reference Cyclone Remal');
  });

  test('All external multilateral links enforce target="_blank" and rel="noopener noreferrer"', () => {
    const popoverCode = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'GlideResourcePopover.tsx'), 'utf8');
    assert.ok(popoverCode.includes('target="_blank"'), 'Must specify target="_blank"');
    assert.ok(popoverCode.includes('rel="noopener noreferrer"'), 'Must specify rel="noopener noreferrer"');

    const modalCode = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'EventReportModal.tsx'), 'utf8');
    assert.ok(modalCode.includes('target="_blank"'), 'Must specify target="_blank"');
    assert.ok(modalCode.includes('rel="noopener noreferrer"'), 'Must specify rel="noopener noreferrer"');
  });
});
