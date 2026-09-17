/**
 * @jest-environment node
 *
 * The content engine's pure logic (`scripts/build_content_engine.mjs`).
 *
 * The published pages are checked end-to-end elsewhere — `scripts/tests/test_content_engine.py`
 * executes the pages' formulas against the physics module and runs the engine with and without an
 * archive, and `__tests__/seoFoundations.test.js` inspects the built HTML. This suite covers the
 * parts those cannot reach cheaply:
 *
 *   - the district table is parsed out of the app's TypeScript, including the escaped apostrophe
 *     in `Cox\'s Bazar` (a naive parser truncates that name, and the district then silently loses
 *     its outlook);
 *   - the alias map that reconciles the snapshot's spellings (`Chittagong`, `Jessore`, `Comilla`,
 *     `Nawabganj`, …) with the app's ids, which is what keeps `districts_with_outlook` equal to the
 *     coverage the snapshot itself reports;
 *   - `readArchive` refuses a malformed archive instead of dropping rows;
 *   - `stableView` is clock-independent, so the `--check` gate cannot rot as time passes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAIMED_EVENT_TOTAL,
  DISTRICT_ALIASES,
  GENERATED_SCHEMA,
  buildRoutes,
  confidenceBin,
  divergence,
  indexForecastRows,
  matchKey,
  parseDistrictTable,
  readArchive,
  stableView,
} from '../scripts/build_content_engine.mjs';

const repoRoot = join(__dirname, '..');
const districtsSource = readFileSync(join(repoRoot, 'frontend/src/data/bangladeshDistricts.ts'), 'utf8');
const methodology = JSON.parse(
  readFileSync(join(repoRoot, 'frontend/src/content/hazard-methodology.json'), 'utf8')
);
const snapshot = JSON.parse(
  readFileSync(join(repoRoot, 'frontend/public/data/forecasts-latest.json'), 'utf8')
);
const committed = JSON.parse(
  readFileSync(join(repoRoot, 'frontend/src/content/generated-routes.json'), 'utf8')
);

const districts = parseDistrictTable(districtsSource);

describe('the district table parser', () => {
  it('reads all 64 districts from the app module', () => {
    expect(districts).toHaveLength(64);
    expect(new Set(districts.map((district) => district.id)).size).toBe(64);
  });

  it('keeps a district whose name contains an escaped apostrophe', () => {
    const coxsBazar = districts.find((district) => district.id === 'coxsbazar');
    expect(coxsBazar.name).toBe("Cox's Bazar");
    expect(coxsBazar.division).toBe('Chattogram');
  });

  it('carries the baseline fields the pages publish', () => {
    const bhola = districts.find((district) => district.id === 'bhola');
    expect(bhola).toEqual(
      expect.objectContaining({ name: 'Bhola', division: 'Barisal', risk: 'High', baselineHazard: 'Tropical Cyclone' })
    );
    expect(typeof bhola.baselineSeverity).toBe('number');
    expect(typeof bhola.elevationMeters).toBe('number');
  });

  it('fails loudly rather than returning a partial table', () => {
    expect(() => parseDistrictTable('const NOTHING = [];')).toThrow(/ALL_64_DISTRICTS/);
    const truncated = districtsSource.replace(/\{ id: 'kurigram'[\s\S]*?\},/, '');
    expect(() => parseDistrictTable(truncated)).toThrow(/expected 64/);
  });
});

describe('the snapshot-to-app district join', () => {
  it('maps every spelling the snapshot uses onto an app district id', () => {
    expect(matchKey("Cox's Bazar")).toBe('coxsbazar');
    expect(matchKey('Chittagong')).toBe('chattogram');
    expect(matchKey('Comilla')).toBe('cumilla');
    // The app keeps the legacy URL segment `jessore` for Jashore, so its snapshot spelling
    // already matches an id and needs no alias.
    expect(matchKey('Jessore')).toBe('jessore');
    expect(matchKey('Maulvibazar')).toBe('moulvibazar');
    expect(matchKey('Netrakona')).toBe('netrokona');
    expect(matchKey('Nawabganj')).toBe('chapainawabganj');
    expect(matchKey('Brahamanbaria')).toBe('brahmanbaria');
  });

  it('keeps the alias table small and explicit', () => {
    // A fuzzy match could attach a forecast row to the wrong district; the map is deliberate.
    expect(Object.keys(DISTRICT_ALIASES).length).toBeLessThan(12);
    for (const [from, to] of Object.entries(DISTRICT_ALIASES)) {
      expect(districts.some((district) => district.id === to)).toBe(true);
      expect(matchKey(from)).toBe(to);
    }
  });

  it('resolves every snapshot district to a page that the engine can build', () => {
    const rows = indexForecastRows(snapshot);
    const appIds = new Set(districts.map((district) => district.id));
    const unmatched = [...rows.keys()].filter((key) => !appIds.has(key));
    expect(unmatched).toEqual([]);
    expect(rows.size).toBe(snapshot.coverage.districts_covered);
  });
});

describe('reading a loaded archive', () => {
  const event = (overrides = {}) => ({
    hazard_type: 'Flood',
    start_date: '2022-06-15',
    end_date: '2022-06-22',
    adm2_name: 'Sylhet',
    severity: 0.8,
    source: 'ffwc-archive',
    ...overrides,
  });

  it('summarises counts and the drift against the claim', () => {
    const archive = readArchive({ claimed_total: 2931, events: [event(), event({ adm2_name: 'Sunamganj' })] }, 'x.json');
    expect(archive.total).toBe(2);
    expect(archive.drift).toBe(2 - 2931);
    expect(archive.claimed_total).toBe(2931);
    expect(archive.by_hazard).toEqual({ Flood: 2 });
    expect(archive.by_district).toEqual({ Sylhet: 1, Sunamganj: 1 });
    expect(archive.date_range).toEqual(['2022-06-15', '2022-06-22']);
  });

  it('defaults the claim to the model card figure when the export omits it', () => {
    expect(readArchive([event()]).claimed_total).toBe(CLAIMED_EVENT_TOTAL);
  });

  it('sorts events by start date so a page shows a chronological tail', () => {
    const archive = readArchive([event({ start_date: '2020-01-01' }), event({ start_date: '2019-01-01' })]);
    expect(archive.events.map((e) => e.start_date)).toEqual(['2019-01-01', '2020-01-01']);
  });

  it('refuses a malformed archive instead of silently dropping rows', () => {
    expect(() => readArchive({ events: [{ hazard_type: 'Flood' }] })).toThrow(/missing start_date/);
    expect(() => readArchive({ events: ['nope'] })).toThrow(/is not an object/);
    expect(() => readArchive({ nope: 1 })).toThrow(/expected an array/);
  });

  it('treats an absent archive as absent, not as empty history', () => {
    expect(readArchive(null)).toBeNull();
    expect(readArchive(undefined)).toBeNull();
  });
});

describe('the generated document', () => {
  const built = buildRoutes({ districts, snapshot, archive: null, methodology, now: new Date('2026-01-01T00:00:00Z') });

  it('declares the schema, the origin and the inputs it used', () => {
    expect(built.summary.schema).toBe(GENERATED_SCHEMA);
    expect(built.summary.origin).toBe('https://www.hazardnet.live');
    expect(built.summary.generated_by).toBe('scripts/build_content_engine.mjs');
    expect(built.summary.inputs.forecast_snapshot.prediction_date).toBe(snapshot.prediction_date);
    expect(built.summary.inputs.event_archive).toBeNull();
  });

  it('is clock-independent once built, so --check cannot rot', () => {
    const earlier = buildRoutes({ districts, snapshot, archive: null, methodology, now: new Date('2026-01-01T00:00:00Z') });
    const later = buildRoutes({ districts, snapshot, archive: null, methodology, now: new Date('2027-06-30T12:00:00Z') });
    expect(stableView({ ...later.summary, routes: later.routes })).toEqual(
      stableView({ ...earlier.summary, routes: earlier.routes })
    );
    // …and the unstable projection does differ, which is why the gate uses stableView.
    expect(later.summary.generated_at).not.toBe(earlier.summary.generated_at);
  });

  it('agrees with the committed file the build renders', () => {
    expect(stableView(committed)).toEqual(stableView({ ...built.summary, routes: built.routes }));
  });

  it('builds one page per hazard class and per district', () => {
    const paths = built.routes.map((route) => route.path);
    expect(paths).toContain('/hazards');
    expect(paths).toContain('/districts');
    expect(paths.filter((path) => path.startsWith('/hazards/'))).toHaveLength(methodology.hazards.length);
    expect(paths.filter((path) => path.startsWith('/districts/'))).toHaveLength(64);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('the small formatting helpers', () => {
  it('labels confidence with the product spec bands', () => {
    expect(confidenceBin(0.9)).toMatch(/Certain/);
    expect(confidenceBin(0.85)).toMatch(/Certain/);
    expect(confidenceBin(0.7)).toMatch(/Probable/);
    expect(confidenceBin(0.69)).toMatch(/Uncertain/);
    expect(confidenceBin(null)).toBe('unknown');
  });

  it('reports divergence only when both tracks produced a number', () => {
    expect(divergence(0.9, 0.4)).toBeCloseTo(0.5);
    expect(divergence(0.9, null)).toBeNull();
    expect(divergence(undefined, undefined)).toBeNull();
  });
});
