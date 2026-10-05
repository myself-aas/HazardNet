import fs from 'node:fs';
import path from 'node:path';
import { buildClimaticHazardsSummary } from '../scripts/build_climatic_hazards_summary.mjs';

const ROOT = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

const event = (district, hazard_type, date, year = Number(date.slice(0, 4))) => ({
  district,
  hazard_type,
  date,
  year,
});

describe('climatic hazards summary artifact', () => {
  it('derives complete, internally consistent breakdowns from the cleaned catalog', () => {
    const summary = buildClimaticHazardsSummary([
      event('Kurigram', 'Flood', '2000-06-01'),
      event('Dhaka', 'Flood', '2000-06-02'),
      event('Kurigram', 'Tropical Cyclone', '2002-11-01'),
    ], [
      { districtId: 1 },
      { districtId: 1 },
      { districtId: 2 },
    ]);

    expect(summary.totalEvents).toBe(3);
    expect(summary.yearRange).toEqual([2000, 2002]);
    expect(summary.totalDistricts).toBe(2);
    expect(summary.totalDivisions).toBe(2);
    expect(summary.totalHazards).toBe(2);
    expect(summary.hazardBreakdown).toEqual([
      { hazard: 'Flood', count: 2, percentage: 66.7 },
      { hazard: 'Tropical Cyclone', count: 1, percentage: 33.3 },
    ]);
    expect(summary.divisionBreakdown.reduce((sum, item) => sum + item.count, 0)).toBe(3);
    expect(summary.yearlyTrend).toEqual([
      { year: 2000, count: 2 },
      { year: 2001, count: 0 },
      { year: 2002, count: 1 },
    ]);
    expect(summary.monthlyDistribution).toHaveLength(12);
    expect(summary.monthlyDistribution[5]).toEqual({ month: 6, monthName: 'June', count: 2 });
    expect(summary.topDistricts.slice(0, 2)).toEqual([
      { district: 'Kurigram', count: 2, division: 'Rangpur' },
      { district: 'Dhaka', count: 1, division: 'Dhaka' },
    ]);
    expect(summary.activeForecastsCount).toBe(3);
    expect(summary.forecastDistrictsCount).toBe(2);
  });

  it('normalizes district aliases and rejects missing or unmapped source data', () => {
    const summary = buildClimaticHazardsSummary([event('Jessore', 'Flood', '2024-05-01')]);
    expect(summary.topDistricts.find((district) => district.count > 0)).toEqual({
      district: 'Jashore',
      count: 1,
      division: 'Khulna',
    });
    expect(() => buildClimaticHazardsSummary([])).toThrow(/at least one event/);
    expect(() => buildClimaticHazardsSummary([event('Atlantis', 'Flood', '2024-05-01')])).toThrow(/unmapped district/);
  });

  it('keeps the committed static artifact in lockstep with the 3,062-row archive', () => {
    const events = readJson('frontend/public/data/historical/hazard-catalog-index.json');
    const forecasts = readJson('frontend/public/data/hazardnet_forecasts_latest.json');
    const committed = readJson('frontend/public/data/climatic_hazards_summary.json');
    const expected = buildClimaticHazardsSummary(events, forecasts);

    expect(events).toHaveLength(3062);
    expect(committed).toEqual(expected);
    expect(committed.totalEvents).toBe(3062);
    expect(committed.totalDistricts).toBe(64);
    expect(committed.totalDivisions).toBe(8);
    expect(committed.totalHazards).toBe(9);
    expect(committed.yearRange).toEqual([2000, 2026]);
    expect(Object.values(committed.byHazard).reduce((sum, count) => sum + count, 0)).toBe(3062);
    expect(Object.values(committed.byDivision).reduce((sum, count) => sum + count, 0)).toBe(3062);
  });
});
