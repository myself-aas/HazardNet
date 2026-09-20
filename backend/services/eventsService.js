import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

// Canonical District to Division Mapping for Bangladesh (all 64 districts)
export const DISTRICT_DIVISION_MAP = {
  // Rangpur (8)
  'kurigram': 'Rangpur',
  'rangpur': 'Rangpur',
  'gaibandha': 'Rangpur',
  'nilphamari': 'Rangpur',
  'dinajpur': 'Rangpur',
  'panchagarh': 'Rangpur',
  'thakurgaon': 'Rangpur',
  'lalmonirhat': 'Rangpur',

  // Rajshahi (8)
  'rajshahi': 'Rajshahi',
  'bogra': 'Rajshahi',
  'bogura': 'Rajshahi',
  'sirajganj': 'Rajshahi',
  'pabna': 'Rajshahi',
  'naogaon': 'Rajshahi',
  'natore': 'Rajshahi',
  'chapainawabganj': 'Rajshahi',
  'chapai nawabganj': 'Rajshahi',
  'joypurhat': 'Rajshahi',

  // Mymensingh (4)
  'mymensingh': 'Mymensingh',
  'netrokona': 'Mymensingh',
  'netrakona': 'Mymensingh',
  'jamalpur': 'Mymensingh',
  'sherpur': 'Mymensingh',

  // Sylhet (4)
  'sylhet': 'Sylhet',
  'sunamganj': 'Sylhet',
  'habiganj': 'Sylhet',
  'moulvibazar': 'Sylhet',
  'maulvibazar': 'Sylhet',

  // Dhaka (13)
  'dhaka': 'Dhaka',
  'gazipur': 'Dhaka',
  'narayanganj': 'Dhaka',
  'tangail': 'Dhaka',
  'kishoreganj': 'Dhaka',
  'manikganj': 'Dhaka',
  'munshiganj': 'Dhaka',
  'narsingdi': 'Dhaka',
  'faridpur': 'Dhaka',
  'gopalganj': 'Dhaka',
  'madaripur': 'Dhaka',
  'rajbari': 'Dhaka',
  'shariatpur': 'Dhaka',

  // Khulna (10)
  'khulna': 'Khulna',
  'satkhira': 'Khulna',
  'bagerhat': 'Khulna',
  'jessore': 'Khulna',
  'jashore': 'Khulna',
  'jhenaidah': 'Khulna',
  'magura': 'Khulna',
  'narail': 'Khulna',
  'chuadanga': 'Khulna',
  'kushtia': 'Khulna',
  'meherpur': 'Khulna',

  // Barisal (6)
  'barisal': 'Barisal',
  'barishal': 'Barisal',
  'bhola': 'Barisal',
  'jhalokati': 'Barisal',
  'jhalakathi': 'Barisal',
  'patuakhali': 'Barisal',
  'pirojpur': 'Barisal',
  'barguna': 'Barisal',

  // Chattogram (11)
  'chattogram': 'Chattogram',
  'chittagong': 'Chattogram',
  "cox's bazar": 'Chattogram',
  'coxs bazar': 'Chattogram',
  'cumilla': 'Chattogram',
  'comilla': 'Chattogram',
  'feni': 'Chattogram',
  'noakhali': 'Chattogram',
  'lakshmipur': 'Chattogram',
  'chandpur': 'Chattogram',
  'brahmanbaria': 'Chattogram',
  'khagrachhari': 'Chattogram',
  'khagrachari': 'Chattogram',
  'rangamati': 'Chattogram',
  'bandarban': 'Chattogram'
};

export const ALL_DIVISIONS_LIST = [
  { id: 'dhaka', name: 'Dhaka', capital: 'Dhaka', districtCount: 13, primaryHazard: 'Monsoon Flood & River Erosion' },
  { id: 'chattogram', name: 'Chattogram', capital: 'Chattogram', districtCount: 11, primaryHazard: 'Coastal Cyclone & Hill Flash Flood' },
  { id: 'rajshahi', name: 'Rajshahi', capital: 'Rajshahi', districtCount: 8, primaryHazard: 'Severe Drought & Heat Wave' },
  { id: 'khulna', name: 'Khulna', capital: 'Khulna', districtCount: 10, primaryHazard: 'Tropical Cyclone & Saline Intrusion' },
  { id: 'barisal', name: 'Barisal', capital: 'Barisal', districtCount: 6, primaryHazard: 'Coastal Storm Surge & Inundation' },
  { id: 'sylhet', name: 'Sylhet', capital: 'Sylhet', districtCount: 4, primaryHazard: 'Pre-Monsoon Haor Flash Flood' },
  { id: 'rangpur', name: 'Rangpur', capital: 'Rangpur', districtCount: 8, primaryHazard: 'River Inundation & Severe Cold Wave' },
  { id: 'mymensingh', name: 'Mymensingh', capital: 'Mymensingh', districtCount: 4, primaryHazard: 'Flash Flood & River Swell' },
];

export const ALL_HAZARDS_LIST = [
  { id: 'tropical-cyclone', name: 'Tropical Cyclone', color: '#EF4444', icon: 'Wind', season: 'May, Oct - Nov' },
  { id: 'flood', name: 'Flood', color: '#3B82F6', icon: 'Droplets', season: 'Jun - Sep' },
  { id: 'flash-flood', name: 'Flash Flood', color: '#06B6D4', icon: 'Waves', season: 'Apr - Jun' },
  { id: 'severe-local-storm', name: 'Severe Local Storm', color: '#F59E0B', icon: 'CloudLightning', season: 'Mar - May (Norwesters / Kalbaishakhi)' },
  { id: 'cold-wave', name: 'Cold Wave', color: '#6366F1', icon: 'Snowflake', season: 'Dec - Jan' },
  { id: 'drought', name: 'Drought', color: '#D97706', icon: 'Sun', season: 'Feb - May' },
  { id: 'heat-wave', name: 'Heat Wave', color: '#EA580C', icon: 'Sun', season: 'Apr - Jun' },
  { id: 'earthquake', name: 'Earthquake', color: '#8B5CF6', icon: 'Activity', season: 'Seismic faults (Dauki, Chittagong-Tripura)' },
  { id: 'fire', name: 'Fire', color: '#DC2626', icon: 'AlertTriangle', season: 'Mar - May (Dry season)' },
];

export function normalizeKey(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeHazard(str) {
  if (!str) return '';
  const s = str.toLowerCase().trim();
  if (s.includes('cyclone')) return 'Tropical Cyclone';
  if (s.includes('flash')) return 'Flash Flood';
  if (s.includes('monsoon flood') || s.includes('river flood') || s === 'flood') return 'Flood';
  if (s.includes('storm') || s.includes('norwester') || s.includes('thunder')) return 'Severe Local Storm';
  if (s.includes('cold')) return 'Cold Wave';
  if (s.includes('heat')) return 'Heat Wave';
  if (s.includes('drought')) return 'Drought';
  if (s.includes('earthquake')) return 'Earthquake';
  if (s.includes('fire')) return 'Fire';
  return str.trim();
}

export function hazardToSlug(hazardName) {
  const norm = normalizeHazard(hazardName);
  return norm.toLowerCase().replace(/\s+/g, '-');
}

export function slugToHazard(slug) {
  if (!slug) return '';
  const s = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('cyclone')) return 'Tropical Cyclone';
  if (s.includes('flash')) return 'Flash Flood';
  if (s === 'flood' || s.includes('monsoon') || s.includes('river')) return 'Flood';
  if (s.includes('storm')) return 'Severe Local Storm';
  if (s.includes('cold')) return 'Cold Wave';
  if (s.includes('heat')) return 'Heat Wave';
  if (s.includes('drought')) return 'Drought';
  if (s.includes('earthquake') || s.includes('quake')) return 'Earthquake';
  if (s.includes('fire')) return 'Fire';
  return slug;
}

export function getDivisionForDistrict(districtName) {
  if (!districtName) return 'Unknown';
  const key = districtName.toLowerCase().trim();
  if (DISTRICT_DIVISION_MAP[key]) return DISTRICT_DIVISION_MAP[key];
  const norm = normalizeKey(districtName);
  for (const [k, v] of Object.entries(DISTRICT_DIVISION_MAP)) {
    if (normalizeKey(k) === norm) return v;
  }
  return 'Dhaka';
}

// In-memory data store
let cachedEvents = null;
let cachedForecasts = null;
let loadPromise = null;

export async function ensureDataLoaded() {
  if (cachedEvents && cachedForecasts) {
    return { events: cachedEvents, forecasts: cachedForecasts };
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const eventsPath = path.resolve(process.cwd(), 'data/events/BGD_climatic_hazards_dataset_2000_2026.csv');
    const forecastsPath = path.resolve(process.cwd(), 'data/hazardnet_forecasts_latest.csv');

    // 1. Load Events CSV
    const events = [];
    if (fs.existsSync(eventsPath)) {
      await new Promise((resolve, reject) => {
        fs.createReadStream(eventsPath)
          .pipe(csv())
          .on('data', (row) => {
            const rawDistrict = (row.District || '').trim();
            const rawHazard = (row.Hazard_Type || '').trim();
            const hazard = normalizeHazard(rawHazard);
            const date = (row.Date || '').trim();
            const year = date ? parseInt(date.slice(0, 4), 10) : null;
            const month = date ? parseInt(date.slice(5, 7), 10) : null;
            const division = getDivisionForDistrict(rawDistrict);
            const severityScore = parseFloat(row.Severity_Score || 0) || 1.0;
            const validatedAffected = parseFloat(row.Validated_Affected || 0) || 0;

            let desc = (row.Full_Description || '').trim();
            if (desc === 'No detailed description available.') {
              desc = '';
            }

            events.push({
              id: row.Event_ID_Internal || `Event_${events.length}`,
              glide: (row.GLIDE || '').trim(),
              date,
              year,
              month,
              district: rawDistrict,
              division,
              latitude: parseFloat(row.Latitude || 0) || 0,
              longitude: parseFloat(row.Longitude || 0) || 0,
              hazardType: hazard,
              rawHazardType: rawHazard,
              geeStart: (row.GEE_Start || '').trim(),
              geeEnd: (row.GEE_End || '').trim(),
              severityIndex: (row.Severity_Index_Name || 'MODERATE_RISK').trim(),
              severityScore,
              validatedAffected,
              description: desc,
            });
          })
          .on('end', resolve)
          .on('error', reject);
      });
      // Sort events by date descending
      events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    // 2. Load Forecasts CSV
    const forecasts = [];
    if (fs.existsSync(forecastsPath)) {
      await new Promise((resolve, reject) => {
        fs.createReadStream(forecastsPath)
          .pipe(csv())
          .on('data', (row) => {
            const dist = (row.district_name || '').trim();
            const rawDiv = (row.division || '').trim();
            const div = rawDiv === 'Chittagong' ? 'Chattogram' : rawDiv || getDivisionForDistrict(dist);
            forecasts.push({
              districtId: parseInt(row.district_id || 0, 10),
              districtName: dist,
              division: div,
              pcode: (row.pcode || '').trim(),
              horizon: (row.horizon || '').trim(),
              hazardType: normalizeHazard(row.hazard_type || ''),
              rawHazardType: (row.hazard_type || '').trim(),
              modelSeverity: parseFloat(row.model_severity || 0) || 0,
              physicsSeverity: parseFloat(row.physics_severity || 0) || 0,
              severityScore: parseFloat(row.model_severity || row.physics_severity || 0) || 0,
              confidence: parseFloat(row.confidence || 0) || 0,
              targetDate: (row.target_date || '').trim(),
              predictionDate: (row.prediction_date || '').trim(),
              dataSource: (row.data_source || 'Hybrid_Cognitive_Forecast').trim(),
              temperatureMean: parseFloat(row.om_temp_2m_k || 0) || 0,
              precipitationMm: parseFloat(row.om_precip_m || 0) * 1000 || 0,
              precipitationM: parseFloat(row.om_precip_m || 0) || 0,
              temperatureMax: parseFloat(row.om_max_temp_k || 0) || 0,
              temperatureMin: parseFloat(row.om_min_temp_k || 0) || 0,
              dewpointMean: parseFloat(row.om_dewpoint_k || 0) || 0,
              solarRadiationMjM2: parseFloat(row.om_solar_rad_j || 0) / 10000 || 0,
              windMaxKmh: parseFloat(row.om_wind_max_ms || 0) * 3.6 || 0,
              evapotranspirationMm: parseFloat(row.om_et_sum_m || 0) * 1000 || 0,
            });
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }

    cachedEvents = events;
    cachedForecasts = forecasts;
    return { events, forecasts };
  })();

  return loadPromise;
}

export async function getEventsSummary() {
  const { events, forecasts } = await ensureDataLoaded();

  const byDistrict = {};
  const byDivision = {};
  const byHazard = {};
  const byYear = {};
  const byMonth = {};

  for (const e of events) {
    byDistrict[e.district] = (byDistrict[e.district] || 0) + 1;
    byDivision[e.division] = (byDivision[e.division] || 0) + 1;
    byHazard[e.hazardType] = (byHazard[e.hazardType] || 0) + 1;
    if (e.year) byYear[e.year] = (byYear[e.year] || 0) + 1;
    if (e.month) byMonth[e.month] = (byMonth[e.month] || 0) + 1;
  }

  const topDistricts = Object.entries(byDistrict)
    .map(([district, count]) => ({ district, count, division: getDivisionForDistrict(district) }))
    .sort((a, b) => b.count - a.count);

  const hazardBreakdown = Object.entries(byHazard)
    .map(([hazard, count]) => ({ hazard, count, percentage: Math.round((count / events.length) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);

  const divisionBreakdown = Object.entries(byDivision)
    .map(([division, count]) => ({ division, count, percentage: Math.round((count / events.length) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);

  const yearlyTrend = Object.entries(byYear)
    .map(([year, count]) => ({ year: parseInt(year, 10), count }))
    .sort((a, b) => a.year - b.year);

  const monthlyDistribution = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    count: byMonth[i + 1] || 0,
  }));

  return {
    totalEvents: events.length,
    yearRange: [2000, 2026],
    totalDistricts: Object.keys(byDistrict).length,
    totalDivisions: Object.keys(byDivision).length,
    totalHazards: Object.keys(byHazard).length,
    byDistrict,
    byDivision,
    byHazard,
    byYear,
    byMonth,
    topDistricts,
    hazardBreakdown,
    divisionBreakdown,
    yearlyTrend,
    monthlyDistribution,
    activeForecastsCount: forecasts.length,
    forecastDistrictsCount: new Set(forecasts.map(f => f.districtName)).size,
  };
}

export async function getDistrictEvents(districtQuery) {
  const { events, forecasts } = await ensureDataLoaded();
  const normQuery = normalizeKey(districtQuery);

  const matchedEvents = events.filter((e) => {
    return normalizeKey(e.district) === normQuery ||
      e.district.toLowerCase() === districtQuery.toLowerCase() ||
      (normQuery === 'bogra' && normalizeKey(e.district) === 'bogura') ||
      (normQuery === 'bogura' && normalizeKey(e.district) === 'bogra') ||
      (normQuery === 'chattogram' && normalizeKey(e.district) === 'chittagong') ||
      (normQuery === 'chittagong' && normalizeKey(e.district) === 'chattogram') ||
      (normQuery === 'jashore' && normalizeKey(e.district) === 'jessore') ||
      (normQuery === 'jessore' && normalizeKey(e.district) === 'jashore') ||
      (normQuery === 'cumilla' && normalizeKey(e.district) === 'comilla') ||
      (normQuery === 'comilla' && normalizeKey(e.district) === 'cumilla') ||
      (normQuery === 'barisal' && normalizeKey(e.district) === 'barishal') ||
      (normQuery === 'barishal' && normalizeKey(e.district) === 'barisal');
  });

  const matchedForecasts = forecasts.filter((f) => {
    return normalizeKey(f.districtName) === normQuery ||
      f.districtName.toLowerCase() === districtQuery.toLowerCase();
  });

  const resolvedName = matchedEvents[0]?.district || matchedForecasts[0]?.districtName || districtQuery;
  const division = getDivisionForDistrict(resolvedName);

  // Aggregations
  const hazardCounts = {};
  const yearCounts = {};
  const monthCounts = {};
  for (const e of matchedEvents) {
    hazardCounts[e.hazardType] = (hazardCounts[e.hazardType] || 0) + 1;
    if (e.year) yearCounts[e.year] = (yearCounts[e.year] || 0) + 1;
    if (e.month) monthCounts[e.month] = (monthCounts[e.month] || 0) + 1;
  }

  // Multi-year yearly trend with hazard breakdown
  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map((yr) => {
    const yrEvents = matchedEvents.filter(e => e.year === yr);
    const row = { year: yr, total: yrEvents.length };
    for (const h of Object.keys(hazardCounts)) {
      row[h] = yrEvents.filter(e => e.hazardType === h).length;
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
      flood: mEvents.filter(e => e.hazardType === 'Flood' || e.hazardType === 'Flash Flood').length,
      cyclone: mEvents.filter(e => e.hazardType === 'Tropical Cyclone').length,
      storm: mEvents.filter(e => e.hazardType === 'Severe Local Storm').length,
      coldWave: mEvents.filter(e => e.hazardType === 'Cold Wave').length,
      drought: mEvents.filter(e => e.hazardType === 'Drought' || e.hazardType === 'Heat Wave').length,
    };
  });

  return {
    district: resolvedName,
    division,
    totalEvents: matchedEvents.length,
    primaryHazard: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Monsoon Flood',
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

export async function getDivisionEvents(divisionQuery) {
  const { events, forecasts } = await ensureDataLoaded();
  const normQuery = normalizeKey(divisionQuery);

  // Check matching division name
  let targetDivision = 'Dhaka';
  for (const div of ALL_DIVISIONS_LIST) {
    if (normalizeKey(div.name) === normQuery || normalizeKey(div.id) === normQuery) {
      targetDivision = div.name;
      break;
    }
  }
  if (normQuery.includes('chittagong') || normQuery.includes('chattogram')) targetDivision = 'Chattogram';
  if (normQuery.includes('barisal') || normQuery.includes('barishal')) targetDivision = 'Barisal';

  // Filter events belonging to this division
  const matchedEvents = events.filter(e => {
    return e.division.toLowerCase() === targetDivision.toLowerCase() ||
      (targetDivision === 'Chattogram' && e.division.toLowerCase() === 'chittagong') ||
      (targetDivision === 'Barisal' && e.division.toLowerCase() === 'barishal');
  });

  // Filter forecasts for this division
  const matchedForecasts = forecasts.filter(f => {
    return f.division.toLowerCase() === targetDivision.toLowerCase() ||
      (targetDivision === 'Chattogram' && f.division.toLowerCase() === 'chittagong') ||
      (targetDivision === 'Barisal' && f.division.toLowerCase() === 'barishal');
  });

  // District breakdown within division
  const districtCounts = {};
  const hazardCounts = {};
  const yearCounts = {};
  const monthCounts = {};

  for (const e of matchedEvents) {
    districtCounts[e.district] = (districtCounts[e.district] || 0) + 1;
    hazardCounts[e.hazardType] = (hazardCounts[e.hazardType] || 0) + 1;
    if (e.year) yearCounts[e.year] = (yearCounts[e.year] || 0) + 1;
    if (e.month) monthCounts[e.month] = (monthCounts[e.month] || 0) + 1;
  }

  const districtRankings = Object.entries(districtCounts).map(([district, count]) => {
    const f7 = matchedForecasts.find(f => normalizeKey(f.districtName) === normalizeKey(district) && f.horizon === '7_days');
    const f15 = matchedForecasts.find(f => normalizeKey(f.districtName) === normalizeKey(district) && f.horizon === '15_days');
    return {
      district,
      eventCount: count,
      forecast7DSeverity: f7 ? f7.severityScore : null,
      forecast7DHazard: f7 ? f7.hazardType : null,
      forecast15DSeverity: f15 ? f15.severityScore : null,
      forecast15DHazard: f15 ? f15.hazardType : null,
    };
  }).sort((a, b) => b.eventCount - a.eventCount);

  // Yearly trend
  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map((yr) => {
    const yrEvents = matchedEvents.filter(e => e.year === yr);
    const row = { year: yr, total: yrEvents.length };
    for (const h of Object.keys(hazardCounts)) {
      row[h] = yrEvents.filter(e => e.hazardType === h).length;
    }
    return row;
  });

  // Monthly seasonality
  const seasonalPattern = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mEvents = matchedEvents.filter(e => e.month === m);
    return {
      month: m,
      monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
      count: mEvents.length,
    };
  });

  const divMeta = ALL_DIVISIONS_LIST.find(d => d.name.toLowerCase() === targetDivision.toLowerCase()) || {
    id: targetDivision.toLowerCase(),
    name: targetDivision,
    capital: targetDivision,
    districtCount: Object.keys(districtCounts).length,
    primaryHazard: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Flood',
  };

  return {
    division: targetDivision,
    meta: divMeta,
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

export async function getHazardEvents(hazardQuery) {
  const { events, forecasts } = await ensureDataLoaded();
  const targetHazard = slugToHazard(hazardQuery);
  const normTarget = normalizeHazard(targetHazard);

  const matchedEvents = events.filter((e) => {
    return normalizeHazard(e.hazardType).toLowerCase() === normTarget.toLowerCase();
  });

  const matchedForecasts = forecasts.filter((f) => {
    return normalizeHazard(f.hazardType).toLowerCase() === normTarget.toLowerCase();
  });

  // Division breakdown
  const divisionCounts = {};
  const districtCounts = {};
  const yearCounts = {};
  const monthCounts = {};

  for (const e of matchedEvents) {
    divisionCounts[e.division] = (divisionCounts[e.division] || 0) + 1;
    districtCounts[e.district] = (districtCounts[e.district] || 0) + 1;
    if (e.year) yearCounts[e.year] = (yearCounts[e.year] || 0) + 1;
    if (e.month) monthCounts[e.month] = (monthCounts[e.month] || 0) + 1;
  }

  const topDistricts = Object.entries(districtCounts).map(([district, count]) => ({
    district,
    division: getDivisionForDistrict(district),
    count,
    percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
  })).sort((a, b) => b.count - a.count);

  const divisionBreakdown = Object.entries(divisionCounts).map(([division, count]) => ({
    division,
    count,
    percentage: Math.round((count / (matchedEvents.length || 1)) * 100),
  })).sort((a, b) => b.count - a.count);

  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const yearlyTrend = years.map((yr) => ({
    year: yr,
    count: matchedEvents.filter(e => e.year === yr).length,
  }));

  const seasonalPattern = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
    count: monthCounts[i + 1] || 0,
  }));

  const hazardMeta = ALL_HAZARDS_LIST.find(h => h.name.toLowerCase() === normTarget.toLowerCase()) || {
    id: hazardToSlug(normTarget),
    name: normTarget,
    color: '#EF4444',
    icon: 'AlertTriangle',
    season: 'Variable',
  };

  return {
    hazard: normTarget,
    meta: hazardMeta,
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

export async function getLatestForecastsData() {
  const { forecasts } = await ensureDataLoaded();
  return forecasts;
}
