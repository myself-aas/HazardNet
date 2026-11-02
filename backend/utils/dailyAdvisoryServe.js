/** Public read contract, shared by the Node and Pages runtimes. No private ledger reads. */
import { lookupDistrict, DISTRICT_REGISTRY } from './districtRegistry.js';
import { DAILY_ADVISORY_SCHEMA, parsePublicDailySnapshot, publicDailyStatus } from './dailyAdvisoryPublic.js';

export const DAILY_PUBLIC_PATH = '/data/daily-advisories-v1.json';
const SCOPES = ['latest', 'timeline', 'peak', 'summary'];
const WINDOWS = [1, 3, 7, 15];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date labels and rolling windows are calculated for Bangladesh, never UTC midnight. */
export function dhakaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function queryValue(query, key) {
  const value = query[key];
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : null;
}

/** Select only already-approved public rows. A requested `role` never grants access. */
export function queryPublicDaily(snapshotValue, query = {}, now = new Date()) {
  const snapshot = parsePublicDailySnapshot(snapshotValue);
  if (!snapshot) return { code: 503, body: { error: 'Published district advisories are unavailable' } };
  const fields = ['scope', 'district_id', 'district', 'division', 'date', 'days'];
  const values = Object.fromEntries(fields.map((field) => [field, queryValue(query, field)]));
  const { division: rawDivision, date: rawDate } = values;
  const scope = values.scope || 'latest';
  const rawDistrict = values.district_id || values.district || '';
  const rawDays = values.days || '15';
  const parsedDate = rawDate && Date.parse(`${rawDate}T00:00:00Z`);
  if (Object.values(values).some((value) => value === null)
    || (values.district_id && values.district)
    || !SCOPES.includes(scope)
    || (rawDate && (!DATE.test(rawDate) || !Number.isFinite(parsedDate)
      || new Date(parsedDate).toISOString().slice(0, 10) !== rawDate))
    || !WINDOWS.includes(Number(rawDays)) || !/^\d+$/.test(rawDays)) {
    return { code: 400, body: { error: 'Invalid advisory scope, date or window' } };
  }
  let district = null;
  if (rawDistrict) {
    district = /^\d+$/.test(rawDistrict)
      ? DISTRICT_REGISTRY.find((item) => item.district_id === Number(rawDistrict))
      : lookupDistrict(rawDistrict);
    if (!district) return { code: 400, body: { error: 'Unknown district' } };
  }
  if (rawDivision && !DISTRICT_REGISTRY.some((item) => item.division.toLowerCase() === rawDivision.toLowerCase())) {
    return { code: 400, body: { error: 'Unknown division' } };
  }

  const status = publicDailyStatus(snapshot, now);
  const today = dhakaDate(now);
  const availableDates = [...new Set(snapshot.advisories.map((row) => row.targetDate))].sort();
  const selectedDate = rawDate || availableDates.find((date) => date >= today) || null;
  let advisories = snapshot.advisories.filter((row) =>
    (!district || row.districtId === district.district_id)
    && (!rawDivision || row.division.toLowerCase() === rawDivision.toLowerCase()));

  if (scope === 'latest' || scope === 'summary') {
    advisories = selectedDate ? advisories.filter((row) => row.targetDate === selectedDate) : [];
  } else if (scope === 'peak') {
    const tiedCounts = new Map();
    for (const row of advisories) {
      if (row.peak === 'tied') tiedCounts.set(row.districtId, (tiedCounts.get(row.districtId) || 0) + 1);
    }
    const minPeakDate = status === 'fresh' && availableDates.length === 15 ? availableDates[0] : today;
    advisories = advisories.filter((row) =>
      row.targetDate >= minPeakDate
      && (row.peak === 'unique'
        || (row.peak === 'tied' && row.severityScore > 0 && (tiedCounts.get(row.districtId) || 0) < 15)));
  } else {
    const start = rawDate || (status === 'fresh' && Number(rawDays) === 15 && availableDates.length === 15
      ? availableDates[0]
      : today);
    const last = new Date(Date.parse(`${start}T00:00:00Z`) + (Number(rawDays) - 1) * 86_400_000)
      .toISOString().slice(0, 10);
    advisories = advisories.filter((row) => row.targetDate >= start && row.targetDate <= last);
  }
  const summary = scope === 'summary' ? {
    districts: new Set(advisories.map((row) => row.districtId)).size,
    byTier: tally(advisories, 'tier'),
    byHazard: tally(advisories, 'hazard'),
    byDivision: tally(advisories, 'division'),
  } : null;
  return {
    code: 200,
    body: {
      schema: DAILY_ADVISORY_SCHEMA,
      status,
      asOf: now.toISOString(),
      run: snapshot.run,
      coverage: snapshot.coverage,
      scope,
      selectedDate: scope === 'latest' || scope === 'summary' ? selectedDate : null,
      count: advisories.length,
      advisories,
      ...(summary ? { summary } : {}),
    },
  };
}

function tally(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] || 0) + 1;
  return counts;
}

/** Read only the static, sanitized asset from Pages; never call a private CSV URL. */
export async function loadPublicDailyAsset(env, request) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  try {
    const response = await env.ASSETS.fetch(new Request(new URL(DAILY_PUBLIC_PATH, request.url), {
      headers: { accept: 'application/json' },
    }));
    if (!response.ok) return null;
    return parsePublicDailySnapshot(await response.json());
  } catch {
    return null;
  }
}
