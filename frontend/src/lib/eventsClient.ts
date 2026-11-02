/**
 * Events and Forecasts Client Library
 * Connects frontend components to real historical hazard records (2000-2026)
 * and latest model forecasts from BGD_climatic_hazards_dataset_2000_2026.csv
 * and hazardnet_forecasts_latest.csv.
 */

import { ALL_64_DISTRICTS, type DistrictData } from '../data/bangladeshDistricts';

export interface ClimaticEvent {
  id: string;
  glide: string;
  date: string;
  year: number;
  month: number;
  district: string;
  division: string;
  lat: number;
  lng: number;
  hazard: string;
  severity: number;
  desc: string;
  affected?: number;
}

export interface ForecastRecord {
  districtId: number;
  districtName: string;
  division: string;
  pcode: string;
  horizon: '7_days' | '15_days' | string;
  hazardType: string;
  rawHazardType?: string;
  modelSeverity: number;
  physicsSeverity: number;
  severityScore: number;
  confidence: number;
  targetDate: string;
  predictionDate: string;
  dataSource: string;
  temperatureMean: number;
  precipitationMm: number;
  temperatureMax: number;
  temperatureMin: number;
  dewpointMean: number;
  solarRadiationMjM2: number;
  windMaxKmh: number;
  evapotranspirationMm: number;
}

/**
 * Where a summary came from. When neither the API nor the committed artifact answers, the client
 * returns an explicit zero/empty sentinel; `'fallback'` means show the empty state, never treat the
 * sentinel as measured data.
 */
export type EventsSummarySource = 'api' | 'artifact' | 'fallback';

export interface EventsSummary {
  /** Which of the three paths in `fetchEventsSummary` produced this object. */
  source?: EventsSummarySource;
  totalEvents: number;
  yearRange: [number, number];
  totalDistricts: number;
  totalDivisions: number;
  totalHazards: number;
  topDistricts: Array<{ district: string; count: number; division: string }>;
  hazardBreakdown: Array<{ hazard: string; count: number; percentage: number }>;
  divisionBreakdown: Array<{ division: string; count: number; percentage: number }>;
  yearlyTrend: Array<{ year: number; count: number }>;
  monthlyDistribution: Array<{ month: number; monthName: string; count: number }>;
  activeForecastsCount: number;
  forecastDistrictsCount: number;
  byDivision?: Record<string, number>;
  byHazard?: Record<string, number>;
}

export interface DistrictEventsResponse {
  district: string;
  division: string;
  totalEvents: number;
  primaryHazard: string;
  hazardBreakdown: Array<{ hazard: string; count: number; percentage: number }>;
  yearlyTrend: Array<{ year: number; total: number; [hazard: string]: number }>;
  seasonalPattern: Array<{
    month: number;
    monthName: string;
    count: number;
    flood: number;
    cyclone: number;
    storm: number;
    coldWave: number;
    drought: number;
  }>;
  recentEvents: ClimaticEvent[];
  allEvents: ClimaticEvent[];
  forecasts: ForecastRecord[];
  forecast7D: ForecastRecord | null;
  forecast15D: ForecastRecord | null;
}

export interface DivisionEventsResponse {
  division: string;
  meta: {
    id: string;
    name: string;
    capital: string;
    districtCount: number;
    primaryHazard: string;
  };
  totalEvents: number;
  totalDistricts: number;
  primaryHazard: string;
  districtRankings: Array<{
    district: string;
    eventCount: number;
    forecast7DSeverity: number | null;
    forecast7DHazard: string | null;
    forecast15DSeverity: number | null;
    forecast15DHazard: string | null;
  }>;
  hazardBreakdown: Array<{ hazard: string; count: number; percentage: number }>;
  yearlyTrend: Array<{ year: number; total: number; [hazard: string]: number }>;
  seasonalPattern: Array<{ month: number; monthName: string; count: number }>;
  allEvents: ClimaticEvent[];
  recentEvents: ClimaticEvent[];
  forecasts: ForecastRecord[];
}

export interface HazardEventsResponse {
  hazard: string;
  meta: {
    id: string;
    name: string;
    color: string;
    icon: string;
    season: string;
  };
  totalEvents: number;
  topDistricts: Array<{ district: string; division: string; count: number; percentage: number }>;
  divisionBreakdown: Array<{ division: string; count: number; percentage: number }>;
  yearlyTrend: Array<{ year: number; count: number }>;
  seasonalPattern: Array<{ month: number; monthName: string; count: number }>;
  allEvents: ClimaticEvent[];
  recentEvents: ClimaticEvent[];
  forecasts: ForecastRecord[];
  forecastDistrictsCount: number;
}

// Canonical division & district lookup helpers so historical archive spellings
// ('Chittagong' vs 'Chattogram', 'Comilla' vs 'Cumilla', 'Bogura' vs 'Bogra',
// 'Jashore' vs 'Jessore', 'Barishal' vs 'Barisal', "Cox's Bazar" vs 'coxsbazar')
// resolve 1-to-1 across events, forecasts, and ALL_64_DISTRICTS.
function normalizeKey(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const DIVISION_CANONICAL_BY_NORM: Record<string, string> = {
  dhaka: 'Dhaka',
  chattogram: 'Chattogram',
  chittagong: 'Chattogram',
  rajshahi: 'Rajshahi',
  khulna: 'Khulna',
  barisal: 'Barisal',
  barishal: 'Barisal',
  sylhet: 'Sylhet',
  rangpur: 'Rangpur',
  mymensingh: 'Mymensingh',
};

const DISTRICT_ALIAS_TO_ID: Record<string, string> = {
  chittagong: 'chattogram',
  comilla: 'cumilla',
  bogura: 'bogra',
  jashore: 'jessore',
  barishal: 'barisal',
  nawabganj: 'chapainawabganj',
  chapainawabganj: 'chapainawabganj',
  maulvibazar: 'moulvibazar',
  netrakona: 'netrokona',
  jhalkathi: 'jhalokati',
  jhalokathi: 'jhalokati',
  khagrachari: 'khagrachhari',
  coxsbazar: 'coxsbazar',
};

const DISTRICT_BY_NORM_KEY: Map<string, DistrictData> = (() => {
  const map = new Map<string, DistrictData>();
  for (const d of ALL_64_DISTRICTS) {
    map.set(normalizeKey(d.id), d);
    map.set(normalizeKey(d.name), d);
  }
  for (const [alias, canonicalId] of Object.entries(DISTRICT_ALIAS_TO_ID)) {
    const target = map.get(normalizeKey(canonicalId));
    if (target) map.set(normalizeKey(alias), target);
  }
  return map;
})();

export function canonicalDivisionName(raw: string): string {
  const cleaned = normalizeKey((raw || '').replace(/\bdivision\b/gi, ''));
  return DIVISION_CANONICAL_BY_NORM[cleaned] || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Dhaka');
}

export function resolveCanonicalDistrict(raw: string): DistrictData | undefined {
  const norm = normalizeKey(raw);
  if (!norm) return undefined;
  return DISTRICT_BY_NORM_KEY.get(norm);
}

interface RawCatalogIndexItem {
  id?: string;
  glide?: string;
  date?: string;
  year?: number | string;
  district?: string;
  division?: string;
  latitude?: number | string;
  longitude?: number | string;
  hazard_type?: string;
  severity_score?: number | string;
  summary?: string;
}

interface RawEventsMasterItem {
  glide?: string;
  full_description?: string;
}

// In-memory cache for fast client navigation
let cachedAllEvents: ClimaticEvent[] | null = null;
let cachedForecasts: ForecastRecord[] | null = null;
let cachedSummary: EventsSummary | null = null;

export function resetEventsClientCacheForTests(): void {
  cachedAllEvents = null;
  cachedForecasts = null;
  cachedSummary = null;
}

export async function fetchAllCompactEvents(): Promise<ClimaticEvent[]> {
  if (cachedAllEvents) return cachedAllEvents;

  // 1. Optional pre-built compact events JSON if present in deployment
  try {
    const res = await fetch('/data/climatic_hazards_events.json');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      const parsed = await res.json();
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedAllEvents = parsed;
        return cachedAllEvents;
      }
    }
  } catch {
    // Fall through to shipped /data/historical/hazard-catalog-index.json
  }

  // 2. Canonical shipped 3,062-record historical catalog (+ optional GLIDE master narratives)
  try {
    const [catalogRes, masterRes] = await Promise.all([
      fetch('/data/historical/hazard-catalog-index.json'),
      fetch('/data/historical/events-master.json').catch(() => null),
    ]);
    const catalogCt = catalogRes.headers.get('content-type') || '';
    if (catalogRes.ok && !catalogCt.includes('text/html')) {
      const rawCatalog: RawCatalogIndexItem[] = await catalogRes.json();
      const masterDescByGlide = new Map<string, string>();
      if (masterRes && masterRes.ok && !(masterRes.headers.get('content-type') || '').includes('text/html')) {
        try {
          const rawMaster: RawEventsMasterItem[] = await masterRes.json();
          if (Array.isArray(rawMaster)) {
            for (const m of rawMaster) {
              if (m.glide && m.full_description) {
                masterDescByGlide.set(m.glide, m.full_description);
              }
            }
          }
        } catch {
          // Optional enrichment only
        }
      }

      if (Array.isArray(rawCatalog)) {
        cachedAllEvents = rawCatalog.map((item, idx) => {
          const canonical = resolveCanonicalDistrict(item.district || '');
          const dateStr = item.date || '';
          const parsedYear = Number(item.year) || Number(dateStr.slice(0, 4)) || 2000;
          const parsedMonth = Number(dateStr.split('-')[1]) || 1;
          const rawSummary = item.summary && item.summary !== 'No detailed description available.' ? item.summary : '';
          const glide = item.glide || '';
          return {
            id: item.id || `Event_${String(idx).padStart(4, '0')}`,
            glide,
            date: dateStr,
            year: parsedYear,
            month: parsedMonth,
            district: canonical?.name || item.district || 'Unknown',
            division: canonical ? canonicalDivisionName(canonical.division) : canonicalDivisionName(item.division || 'Dhaka'),
            lat: Number(item.latitude) || canonical?.lat || 23.8103,
            lng: Number(item.longitude) || canonical?.lng || 90.4125,
            hazard: item.hazard_type || 'Unknown',
            severity: Number(item.severity_score) || 1,
            desc: rawSummary || (glide ? masterDescByGlide.get(glide) || '' : ''),
          };
        });
        return cachedAllEvents;
      }
    }
  } catch (err) {
    console.warn('Failed to load historical hazard catalog JSON', err);
  }
  return [];
}

export interface ForecastFeed {
  records: ForecastRecord[];
  /** `'none'` means the artifact did not answer - not that the run published no records. */
  source: 'artifact' | 'none';
}

export async function fetchForecastFeed(): Promise<ForecastFeed> {
  if (cachedForecasts) return { records: cachedForecasts, source: 'artifact' };
  try {
    const res = await fetch('/data/hazardnet_forecasts_latest.json');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      const raw: ForecastRecord[] = await res.json();
      cachedForecasts = raw.some((r) => r.horizon === '15_days')
        ? raw.filter((r) => r.horizon === '15_days')
        : raw;
      return { records: cachedForecasts, source: 'artifact' };
    }
  } catch (err) {
    console.warn('Failed to load forecast records JSON', err);
  }
  return { records: [], source: 'none' };
}

export async function fetchAllForecastRecords(): Promise<ForecastRecord[]> {
  return (await fetchForecastFeed()).records;
}

export async function fetchEventsSummary(): Promise<EventsSummary> {
  if (cachedSummary) return cachedSummary;

  // 1. Try backend API
  try {
    const res = await fetch('/api/v1/events/summary');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      const json = await res.json();
      if (json.data) {
        cachedSummary = { ...json.data, source: 'api' };
        return cachedSummary!;
      }
    }
  } catch {
    // fall through to static artifact
  }

  // 2. Static JSON artifact fallback
  try {
    const res = await fetch('/data/climatic_hazards_summary.json');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      cachedSummary = { ...(await res.json()), source: 'artifact' };
      return cachedSummary!;
    }
  } catch {
    // fall through to the unavailable sentinel
  }

  // 3. An unavailable archive is empty; never invent plausible-looking headline statistics.
  cachedSummary = {
    source: 'fallback',
    totalEvents: 0,
    yearRange: [0, 0],
    totalDistricts: 0,
    totalDivisions: 0,
    totalHazards: 0,
    topDistricts: [],
    hazardBreakdown: [],
    divisionBreakdown: [],
    yearlyTrend: [],
    monthlyDistribution: [],
    activeForecastsCount: 0,
    forecastDistrictsCount: 0,
    byHazard: {},
    byDivision: {},
  };
  return cachedSummary;
}

export async function fetchDistrictEvents(districtId: string): Promise<DistrictEventsResponse> {
  // 1. Try backend API
  try {
    const res = await fetch(`/api/v1/events/district/${encodeURIComponent(districtId)}`);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      const json = await res.json();
      if (json.data) return json.data;
    }
  } catch {
    // fallback
  }

  // 2. Client-side synthesis from static artifacts
  const [events, forecasts] = await Promise.all([
    fetchAllCompactEvents(),
    fetchAllForecastRecords(),
  ]);

  const canonicalTarget = resolveCanonicalDistrict(districtId);
  const normTarget = normalizeKey(canonicalTarget?.id || districtId);
  const matchesDistrict = (rawName: string): boolean => {
    const resolved = resolveCanonicalDistrict(rawName);
    if (canonicalTarget && resolved) return resolved.id === canonicalTarget.id;
    return normalizeKey(rawName) === normTarget;
  };

  const matchedEvents = events
    .filter((e) => matchesDistrict(e.district))
    .sort((a, b) => b.date.localeCompare(a.date));
  const matchedForecasts = forecasts.filter((f) => matchesDistrict(f.districtName));

  const hazardCounts: Record<string, number> = {};
  for (const e of matchedEvents) {
    hazardCounts[e.hazard] = (hazardCounts[e.hazard] || 0) + 1;
  }

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map((yr) => {
    const yrEvents = matchedEvents.filter((e) => e.year === yr);
    const row: { year: number; total: number; [hazard: string]: number } = { year: yr, total: yrEvents.length };
    for (const h of Object.keys(hazardCounts)) {
      row[h] = yrEvents.filter((e) => e.hazard === h).length;
    }
    return row;
  });

  const seasonalPattern = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mEvents = matchedEvents.filter((e) => e.month === m);
    return {
      month: m,
      monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
      count: mEvents.length,
      flood: mEvents.filter((e) => e.hazard.includes('Flood')).length,
      cyclone: mEvents.filter((e) => e.hazard.includes('Cyclone')).length,
      storm: mEvents.filter((e) => e.hazard.includes('Storm')).length,
      coldWave: mEvents.filter((e) => e.hazard.includes('Cold')).length,
      drought: mEvents.filter((e) => e.hazard.includes('Drought') || e.hazard.includes('Heat')).length,
    };
  });

  return {
    district: canonicalTarget?.name || matchedEvents[0]?.district || districtId,
    division: canonicalTarget ? canonicalDivisionName(canonicalTarget.division) : matchedEvents[0]?.division || 'Dhaka',
    totalEvents: matchedEvents.length,
    primaryHazard: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    hazardBreakdown: Object.entries(hazardCounts)
      .map(([hazard, count]) => ({
        hazard,
        count,
        percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count),
    yearlyTrend,
    seasonalPattern,
    recentEvents: matchedEvents.slice(0, 30),
    allEvents: matchedEvents,
    forecasts: matchedForecasts,
    forecast7D: matchedForecasts.find((f) => f.horizon === '7_days') || matchedForecasts[0] || null,
    forecast15D: matchedForecasts.find((f) => f.horizon === '15_days') || matchedForecasts[0] || null,
  };
}

export async function fetchDivisionEvents(divisionId: string): Promise<DivisionEventsResponse> {
  // 1. Try backend API
  try {
    const res = await fetch(`/api/v1/events/division/${encodeURIComponent(divisionId)}`);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      const json = await res.json();
      if (json.data) return json.data;
    }
  } catch {
    // fallback
  }

  // 2. Client-side synthesis
  const [events, forecasts] = await Promise.all([
    fetchAllCompactEvents(),
    fetchAllForecastRecords(),
  ]);

  const targetDivision = canonicalDivisionName(divisionId);
  const constituentDistricts = ALL_64_DISTRICTS.filter(
    (d) => canonicalDivisionName(d.division) === targetDivision,
  );
  const constituentIds = new Set(constituentDistricts.map((d) => d.id));

  const matchedEvents = events
    .filter((e) => {
      const resolved = resolveCanonicalDistrict(e.district);
      if (resolved) return constituentIds.has(resolved.id);
      return canonicalDivisionName(e.division) === targetDivision;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const matchedForecasts = forecasts.filter((f) => {
    const resolved = resolveCanonicalDistrict(f.districtName);
    if (resolved) return constituentIds.has(resolved.id);
    return canonicalDivisionName(f.division) === targetDivision;
  });

  // Seed every constituent district so forecast tables & charts always cover all districts
  // in the division (even when a district has 0 historical archive rows).
  const districtCounts: Record<string, number> = {};
  for (const d of constituentDistricts) {
    districtCounts[d.name] = 0;
  }
  for (const f of matchedForecasts) {
    const canonicalName = resolveCanonicalDistrict(f.districtName)?.name || f.districtName;
    if (!(canonicalName in districtCounts)) districtCounts[canonicalName] = 0;
  }

  const hazardCounts: Record<string, number> = {};
  for (const e of matchedEvents) {
    const canonicalName = resolveCanonicalDistrict(e.district)?.name || e.district;
    districtCounts[canonicalName] = (districtCounts[canonicalName] || 0) + 1;
    hazardCounts[e.hazard] = (hazardCounts[e.hazard] || 0) + 1;
  }

  const districtRankings = Object.entries(districtCounts)
    .map(([district, count]) => {
      const canonical = resolveCanonicalDistrict(district);
      const matchesRow = (f: ForecastRecord): boolean => {
        const resolved = resolveCanonicalDistrict(f.districtName);
        if (canonical && resolved) return resolved.id === canonical.id;
        return normalizeKey(f.districtName) === normalizeKey(district);
      };
      const f15 =
        matchedForecasts.find((f) => matchesRow(f) && f.horizon === '15_days') ||
        matchedForecasts.find((f) => matchesRow(f));
      return {
        district,
        eventCount: count,
        forecast7DSeverity: f15 ? f15.severityScore : null,
        forecast7DHazard: f15 ? f15.hazardType : null,
        forecast15DSeverity: f15 ? f15.severityScore : null,
        forecast15DHazard: f15 ? f15.hazardType : null,
      };
    })
    .sort((a, b) => b.eventCount - a.eventCount || (b.forecast15DSeverity ?? 0) - (a.forecast15DSeverity ?? 0));

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map((yr) => {
    const yrEvents = matchedEvents.filter((e) => e.year === yr);
    const row: { year: number; total: number; [hazard: string]: number } = { year: yr, total: yrEvents.length };
    for (const h of Object.keys(hazardCounts)) {
      row[h] = yrEvents.filter((e) => e.hazard === h).length;
    }
    return row;
  });

  const seasonalPattern = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    count: matchedEvents.filter((e) => e.month === i + 1).length,
  }));

  const dominantHistoricalHazard =
    Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    matchedForecasts[0]?.hazardType ||
    '';

  const totalDistrictsCount = constituentDistricts.length || Object.keys(districtCounts).length;

  return {
    division: targetDivision,
    meta: {
      id: targetDivision.toLowerCase(),
      name: targetDivision,
      capital: targetDivision,
      districtCount: totalDistrictsCount,
      primaryHazard: dominantHistoricalHazard,
    },
    totalEvents: matchedEvents.length,
    totalDistricts: totalDistrictsCount,
    primaryHazard: dominantHistoricalHazard,
    districtRankings,
    hazardBreakdown: Object.entries(hazardCounts)
      .map(([hazard, count]) => ({
        hazard,
        count,
        percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count),
    yearlyTrend,
    seasonalPattern,
    allEvents: matchedEvents,
    recentEvents: matchedEvents.slice(0, 50),
    forecasts: matchedForecasts,
  };
}

function matchesHazardSlug(hazardName: string, slug: string): boolean {
  const h = normalizeKey(hazardName);
  const target = normalizeKey(slug);
  if (!h || !target) return false;
  if (target === 'flood') return h === 'flood' || h === 'monsoonflood' || h === 'riverflood';
  if (target === 'cyclone' || target === 'tropicalcyclone') return h.includes('cyclone');
  if (target === 'storm' || target === 'severelocalstorm') return h.includes('storm');
  return h === target || h.includes(target);
}

export async function fetchHazardEvents(hazardId: string): Promise<HazardEventsResponse> {
  // 1. Try backend API
  try {
    const res = await fetch(`/api/v1/events/hazard/${encodeURIComponent(hazardId)}`);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      const json = await res.json();
      if (json.data) return json.data;
    }
  } catch {
    // fallback
  }

  // 2. Client-side synthesis
  const [events, forecasts] = await Promise.all([
    fetchAllCompactEvents(),
    fetchAllForecastRecords(),
  ]);

  const matchedEvents = events
    .filter((e) => matchesHazardSlug(e.hazard, hazardId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const matchedForecasts = forecasts.filter((f) => matchesHazardSlug(f.hazardType, hazardId));

  const divisionCounts: Record<string, number> = {};
  const districtCounts: Record<string, number> = {};
  const monthCounts: Record<number, number> = {};

  for (const e of matchedEvents) {
    divisionCounts[e.division] = (divisionCounts[e.division] || 0) + 1;
    districtCounts[e.district] = (districtCounts[e.district] || 0) + 1;
    if (e.month) monthCounts[e.month] = (monthCounts[e.month] || 0) + 1;
  }

  const topDistricts = Object.entries(districtCounts)
    .map(([district, count]) => ({
      district,
      division:
        resolveCanonicalDistrict(district)?.division ||
        matchedEvents.find((e) => e.district === district)?.division ||
        'Dhaka',
      count,
      percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const divisionBreakdown = Object.entries(divisionCounts)
    .map(([division, count]) => ({
      division,
      count,
      percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map((yr) => ({
    year: yr,
    count: matchedEvents.filter((e) => e.year === yr).length,
  }));

  const seasonalPattern = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    count: monthCounts[i + 1] || 0,
  }));

  const displayName = matchedEvents[0]?.hazard || hazardId.replace(/-/g, ' ');

  return {
    hazard: displayName,
    meta: {
      id: hazardId.toLowerCase(),
      name: displayName,
      color: 'var(--ap-danger)',
      icon: 'AlertTriangle',
      season: 'Variable',
    },
    totalEvents: matchedEvents.length,
    topDistricts,
    divisionBreakdown,
    yearlyTrend,
    seasonalPattern,
    allEvents: matchedEvents,
    recentEvents: matchedEvents.slice(0, 50),
    forecasts: matchedForecasts,
    forecastDistrictsCount: new Set(
      matchedForecasts.map((f) => resolveCanonicalDistrict(f.districtName)?.name || f.districtName),
    ).size,
  };
}
