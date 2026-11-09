/**
 * Data access for the daily reports & archive pages.
 *
 * Artifacts are committed by `public_daily_advisories.yml`:
 *   /reports/archive.json      index of every published daily report
 *   /reports/<YYYY-MM-DD>.md   the report itself, in the site's MDX-style template
 *   /data/daily-advisories-v1.json  the live snapshot the interactive charts read
 */

export interface ArchiveEntry {
  date: string;
  file: string;
  runId: string;
  generatedAt: string;
  datasetVersion: number | null;
  modelVersion: string;
  rows: number;
  districts: number;
  forecastDays: number;
  tiers: Record<string, number>;
  topAdvisory: { district: string; hazard: string; targetDate?: string; tier: string; severityScore: number } | null;
}

export interface ArchiveIndex {
  schema: number;
  entries: ArchiveEntry[];
}

export interface DailyAdvisory {
  district: string;
  division: string;
  hazard: string;
  targetDate: string;
  tier: string;
  severityScore: number;
}

import { ARTIFACT_TIMEOUT_MS, readArtifact } from './artifacts';

export interface DailySnapshot {
  run: { id: string; generatedAt: string; modelVersion: string; sourceDatasetVersion?: number };
  coverage: { districts: number; forecastDays: number; publishedRows: number };
  advisories: DailyAdvisory[];
}

/**
 * The report files are deployed artifacts, so they are read through `lib/artifacts`: one
 * deadline, one cache rule, and — the reason this module needed it — one place that knows a
 * 404 ("this deployment has no report for that date") is not a network failure ("we could not
 * reach the server"). Both used to collapse into `null` here.
 *
 * A report body is markdown, not JSON, so the text read keeps its own small helper; it shares
 * the deadline and the 404 distinction through the same module.
 */
async function fetchJson<T>(url: string): Promise<T | null> {
  const result = await readArtifact<T>(url);
  return result.ok ? result.data : null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(ARTIFACT_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export const fetchArchiveIndex = (): Promise<ArchiveIndex | null> => fetchJson<ArchiveIndex>('/reports/archive.json');

export const fetchReportMarkdown = (date: string): Promise<string | null> =>
  fetchText(`/reports/${encodeURIComponent(date)}.md`);

export const fetchDailySnapshot = (): Promise<DailySnapshot | null> =>
  fetchJson<DailySnapshot>('/data/daily-advisories-v1.json');

/** Report dates are strictly YYYY-MM-DD so the fetch path can never escape /reports. */
export function isValidReportDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
