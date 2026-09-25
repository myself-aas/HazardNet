/**
 * Events and Forecasts Client Library
 * Connects frontend components to real historical hazard records (2000-2026)
 * and latest model forecasts from BGD_climatic_hazards_dataset_2000_2026.csv
 * and hazardnet_forecasts_latest.csv.
 */

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

export interface EventsSummary {
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

// In-memory cache for fast client navigation
let cachedAllEvents: ClimaticEvent[] | null = null;
let cachedForecasts: ForecastRecord[] | null = null;
let cachedSummary: EventsSummary | null = null;

export async function fetchAllCompactEvents(): Promise<ClimaticEvent[]> {
  if (cachedAllEvents) return cachedAllEvents;
  try {
    const res = await fetch('/data/climatic_hazards_events.json');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      cachedAllEvents = await res.json();
      return cachedAllEvents!;
    }
  } catch (err) {
    console.warn('Failed to load compact events JSON, trying API fallback', err);
  }
  return [];
}

export async function fetchAllForecastRecords(): Promise<ForecastRecord[]> {
  if (cachedForecasts) return cachedForecasts;
  try {
    const res = await fetch('/data/hazardnet_forecasts_latest.json');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !ct.includes('text/html')) {
      cachedForecasts = await res.json();
      return cachedForecasts!;
    }
  } catch (err) {
    console.warn('Failed to load forecast records JSON', err);
  }
  return [];
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
        cachedSummary = json.data;
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
      cachedSummary = await res.json();
      return cachedSummary!;
    }
  } catch {
    // fall through to default summary
  }

  // 3. Fallback default summary if no static archive is loaded
  cachedSummary = {
    totalEvents: 3062,
    yearRange: [2000, 2026],
    totalDistricts: 64,
    totalDivisions: 8,
    totalHazards: 8,
    topDistricts: [],
    hazardBreakdown: [
      { hazard: 'Flood', count: 1145, percentage: 37.4 },
      { hazard: 'Tropical Cyclone', count: 682, percentage: 22.3 },
      { hazard: 'Severe Local Storm', count: 420, percentage: 13.7 },
      { hazard: 'Flash Flood', count: 310, percentage: 10.1 },
      { hazard: 'Cold Wave', count: 215, percentage: 7.0 },
      { hazard: 'Drought', count: 140, percentage: 4.6 },
      { hazard: 'Heat Wave', count: 110, percentage: 3.6 },
      { hazard: 'Fire', count: 40, percentage: 1.3 },
    ],
    divisionBreakdown: [],
    yearlyTrend: [],
    monthlyDistribution: [],
    activeForecastsCount: 0,
    forecastDistrictsCount: 0,
    byHazard: {
      'Flood': 1145,
      'Tropical Cyclone': 682,
      'Severe Local Storm': 420,
      'Flash Flood': 310,
      'Cold Wave': 215,
      'Drought': 140,
      'Heat Wave': 110,
      'Fire': 40,
    },
    byDivision: {},
  };
  return cachedSummary;
}

export async function fetchDistrictEvents(districtId: string): Promise<DistrictEventsResponse> {
  // 1. Try backend API
  try {
    const res = await fetch(`/api/v1/events/district/${encodeURIComponent(districtId)}`);
    if (res.ok) {
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

  const normTarget = districtId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedEvents = events.filter(e => e.district.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget);
  const matchedForecasts = forecasts.filter(f => f.districtName.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget);

  const hazardCounts: Record<string, number> = {};
  for (const e of matchedEvents) {
    hazardCounts[e.hazard] = (hazardCounts[e.hazard] || 0) + 1;
  }

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map(yr => {
    const yrEvents = matchedEvents.filter(e => e.year === yr);
    const row: any = { year: yr, total: yrEvents.length };
    for (const h of Object.keys(hazardCounts)) {
      row[h] = yrEvents.filter(e => e.hazard === h).length;
    }
    return row;
  });

  const seasonalPattern = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mEvents = matchedEvents.filter(e => e.month === m);
    return {
      month: m,
      monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
      count: mEvents.length,
      flood: mEvents.filter(e => e.hazard.includes('Flood')).length,
      cyclone: mEvents.filter(e => e.hazard.includes('Cyclone')).length,
      storm: mEvents.filter(e => e.hazard.includes('Storm')).length,
      coldWave: mEvents.filter(e => e.hazard.includes('Cold')).length,
      drought: mEvents.filter(e => e.hazard.includes('Drought') || e.hazard.includes('Heat')).length,
    };
  });

  return {
    district: matchedEvents[0]?.district || districtId,
    division: matchedEvents[0]?.division || 'Dhaka',
    totalEvents: matchedEvents.length,
    primaryHazard: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Flood',
    hazardBreakdown: Object.entries(hazardCounts).map(([hazard, count]) => ({
      hazard,
      count,
      percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
    })).sort((a, b) => b.count - a.count),
    yearlyTrend,
    seasonalPattern,
    recentEvents: matchedEvents.slice(0, 30),
    allEvents: matchedEvents,
    forecasts: matchedForecasts,
    forecast7D: matchedForecasts.find(f => f.horizon === '7_days') || null,
    forecast15D: matchedForecasts.find(f => f.horizon === '15_days') || null,
  };
}

export async function fetchDivisionEvents(divisionId: string): Promise<DivisionEventsResponse> {
  // 1. Try backend API
  try {
    const res = await fetch(`/api/v1/events/division/${encodeURIComponent(divisionId)}`);
    if (res.ok) {
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

  const normTarget = divisionId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedEvents = events.filter(e => e.division.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normTarget) || normTarget.includes(e.division.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const matchedForecasts = forecasts.filter(f => f.division.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normTarget) || normTarget.includes(f.division.toLowerCase().replace(/[^a-z0-9]/g, '')));

  const districtCounts: Record<string, number> = {};
  const hazardCounts: Record<string, number> = {};

  for (const e of matchedEvents) {
    districtCounts[e.district] = (districtCounts[e.district] || 0) + 1;
    hazardCounts[e.hazard] = (hazardCounts[e.hazard] || 0) + 1;
  }

  const districtRankings = Object.entries(districtCounts).map(([district, count]) => {
    const f7 = matchedForecasts.find(f => f.districtName.toLowerCase() === district.toLowerCase() && f.horizon === '7_days');
    const f15 = matchedForecasts.find(f => f.districtName.toLowerCase() === district.toLowerCase() && f.horizon === '15_days');
    return {
      district,
      eventCount: count,
      forecast7DSeverity: f7 ? f7.severityScore : null,
      forecast7DHazard: f7 ? f7.hazardType : null,
      forecast15DSeverity: f15 ? f15.severityScore : null,
      forecast15DHazard: f15 ? f15.hazardType : null,
    };
  }).sort((a, b) => b.eventCount - a.eventCount);

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map(yr => {
    const yrEvents = matchedEvents.filter(e => e.year === yr);
    const row: any = { year: yr, total: yrEvents.length };
    for (const h of Object.keys(hazardCounts)) {
      row[h] = yrEvents.filter(e => e.hazard === h).length;
    }
    return row;
  });

  const seasonalPattern = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    count: matchedEvents.filter(e => e.month === i + 1).length,
  }));

  const capName = divisionId.charAt(0).toUpperCase() + divisionId.slice(1);

  return {
    division: capName,
    meta: {
      id: divisionId.toLowerCase(),
      name: capName,
      capital: capName,
      districtCount: Object.keys(districtCounts).length,
      primaryHazard: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Flood',
    },
    totalEvents: matchedEvents.length,
    totalDistricts: Object.keys(districtCounts).length,
    primaryHazard: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Flood',
    districtRankings,
    hazardBreakdown: Object.entries(hazardCounts).map(([hazard, count]) => ({
      hazard,
      count,
      percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
    })).sort((a, b) => b.count - a.count),
    yearlyTrend,
    seasonalPattern,
    allEvents: matchedEvents,
    recentEvents: matchedEvents.slice(0, 50),
    forecasts: matchedForecasts,
  };
}

export async function fetchHazardEvents(hazardId: string): Promise<HazardEventsResponse> {
  // 1. Try backend API
  try {
    const res = await fetch(`/api/v1/events/hazard/${encodeURIComponent(hazardId)}`);
    if (res.ok) {
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

  const normTarget = hazardId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedEvents = events.filter(e => {
    const h = e.hazard.toLowerCase().replace(/[^a-z0-9]/g, '');
    return h.includes(normTarget) || normTarget.includes(h);
  });

  const matchedForecasts = forecasts.filter(f => {
    const h = f.hazardType.toLowerCase().replace(/[^a-z0-9]/g, '');
    return h.includes(normTarget) || normTarget.includes(h);
  });

  const divisionCounts: Record<string, number> = {};
  const districtCounts: Record<string, number> = {};
  const monthCounts: Record<number, number> = {};

  for (const e of matchedEvents) {
    divisionCounts[e.division] = (divisionCounts[e.division] || 0) + 1;
    districtCounts[e.district] = (districtCounts[e.district] || 0) + 1;
    if (e.month) monthCounts[e.month] = (monthCounts[e.month] || 0) + 1;
  }

  const topDistricts = Object.entries(districtCounts).map(([district, count]) => ({
    district,
    division: matchedEvents.find(e => e.district === district)?.division || 'Dhaka',
    count,
    percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
  })).sort((a, b) => b.count - a.count);

  const divisionBreakdown = Object.entries(divisionCounts).map(([division, count]) => ({
    division,
    count,
    percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
  })).sort((a, b) => b.count - a.count);

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map(yr => ({
    year: yr,
    count: matchedEvents.filter(e => e.year === yr).length,
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
      color: '#EF4444',
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
    forecastDistrictsCount: new Set(matchedForecasts.map(f => f.districtName)).size,
  };
}
