import fs from 'node:fs';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISTRICT_REGISTRY, lookupDistrict } from '../backend/utils/advisoryMapper.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'frontend/public/data/climatic_hazards_summary.json');
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const countBy = (rows, keyOf) => {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const sortedCounts = (counts) =>
  [...counts.entries()].sort(([nameA, countA], [nameB, countB]) =>
    countB - countA || String(nameA).localeCompare(String(nameB), 'en'),
  );

const percentage = (count, total) => total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

/**
 * Build the public summary from the exact cleaned 3,062-row archive used by the archive page.
 * Division assignments come from the canonical 64-district registry, not a second hand-copied map.
 */
export function buildClimaticHazardsSummary(events, forecasts = [], resolveDistrict = lookupDistrict) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('The historical catalog must contain at least one event before a summary can be built.');
  }
  if (!Array.isArray(forecasts)) {
    throw new Error('Forecast input must be an array.');
  }

  const normalized = events.map((event, index) => {
    const district = typeof event?.district === 'string' ? event.district.trim() : '';
    const hazard = typeof event?.hazard_type === 'string' ? event.hazard_type.trim() : '';
    const date = typeof event?.date === 'string' ? event.date.trim() : '';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    const year = Number.isInteger(event?.year) ? event.year : parsedDate?.getUTCFullYear();
    const month = parsedDate?.getUTCMonth() + 1;
    const location = resolveDistrict(district);

    if (!district || !hazard || !parsedDate || Number.isNaN(parsedDate.getTime()) || !Number.isInteger(year) || !month) {
      throw new Error(`Historical catalog row ${index + 1} has an invalid district, hazard, date, or year.`);
    }
    if (!location?.division) {
      throw new Error(`Historical catalog row ${index + 1} uses an unmapped district: ${district}`);
    }

    return { district: location.district_name, hazard, year, month, division: location.division };
  });

  const totalEvents = normalized.length;
  const hazardCounts = countBy(normalized, (event) => event.hazard);
  const districtCounts = countBy(normalized, (event) => event.district);
  const divisionCounts = countBy(normalized, (event) => event.division);
  const yearlyCounts = countBy(normalized, (event) => event.year);
  const monthlyCounts = countBy(normalized, (event) => event.month);
  const years = [...yearlyCounts.keys()].sort((a, b) => a - b);
  const divisions = [...new Set(DISTRICT_REGISTRY.map((district) => district.division))].sort((a, b) => a.localeCompare(b, 'en'));
  const districts = [...new Set(DISTRICT_REGISTRY.map((district) => district.district_name))];

  const hazardBreakdown = sortedCounts(hazardCounts).map(([hazard, count]) => ({
    hazard,
    count,
    percentage: percentage(count, totalEvents),
  }));

  const divisionBreakdown = divisions.map((division) => {
    const count = divisionCounts.get(division) ?? 0;
    return { division, count, percentage: percentage(count, totalEvents) };
  });

  const topDistricts = districts
    .map((district) => ({
      district,
      count: districtCounts.get(district) ?? 0,
      division: resolveDistrict(district)?.division ?? '',
    }))
    .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district, 'en'));

  const yearlyTrend = Array.from({ length: years.at(-1) - years[0] + 1 }, (_, index) => {
    const year = years[0] + index;
    return { year, count: yearlyCounts.get(year) ?? 0 };
  });

  const monthlyDistribution = MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    count: monthlyCounts.get(index + 1) ?? 0,
  }));

  const forecastDistricts = new Set(
    forecasts
      .map((forecast) => forecast?.districtId ?? forecast?.districtName)
      .filter((district) => district !== null && district !== undefined && String(district).trim() !== '')
      .map(String),
  );

  const byHazard = Object.fromEntries(sortedCounts(hazardCounts));
  const byDivision = Object.fromEntries(divisions.map((division) => [division, divisionCounts.get(division) ?? 0]));

  return {
    totalEvents,
    yearRange: [years[0], years.at(-1)],
    totalDistricts: new Set(normalized.map((event) => event.district)).size,
    totalDivisions: divisions.filter((division) => (divisionCounts.get(division) ?? 0) > 0).length,
    totalHazards: hazardCounts.size,
    topDistricts,
    hazardBreakdown,
    divisionBreakdown,
    yearlyTrend,
    monthlyDistribution,
    activeForecastsCount: forecasts.length,
    forecastDistrictsCount: forecastDistricts.size,
    byDivision,
    byHazard,
  };
}

export function buildFromCommittedSources(root = ROOT) {
  const eventsPath = resolve(root, 'frontend/public/data/historical/hazard-catalog-index.json');
  const forecastsPath = resolve(root, 'frontend/public/data/hazardnet_forecasts_latest.json');
  const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const forecasts = fs.existsSync(forecastsPath) ? JSON.parse(fs.readFileSync(forecastsPath, 'utf8')) : [];
  return buildClimaticHazardsSummary(events, forecasts);
}

function run() {
  const summary = buildFromCommittedSources();
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const committed = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (committed !== serialized) {
      console.error('[climatic-hazards-summary] artifact is missing or stale; run `npm run build:events-summary`.');
      process.exitCode = 1;
      return;
    }
    console.log(`[climatic-hazards-summary] artifact matches ${summary.totalEvents} committed catalog rows.`);
    return;
  }

  fs.writeFileSync(OUTPUT, serialized, 'utf8');
  console.log(`[climatic-hazards-summary] wrote ${summary.totalEvents} events, ${summary.totalDistricts} districts, ${summary.totalHazards} hazards -> ${path.relative(ROOT, OUTPUT)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error('[climatic-hazards-summary] build failed:', error);
    process.exitCode = 1;
  }
}
