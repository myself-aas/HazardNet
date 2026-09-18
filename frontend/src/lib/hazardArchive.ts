/**
 * Hazard-archive client — the browser side of the historical event archive.
 *
 * Reads one committed artifact, `/data/hazard-archive.json`, produced by
 * `scripts/build_hazard_archive.mjs` from the **validated** ETL export. Nothing here
 * computes a statistic: every number on `/archive` comes from that file, and the page
 * prints the provenance block the artifact carries so a reader can see which archive
 * run produced the figures (the same rule the front door follows).
 *
 * Three properties are enforced here rather than trusted downstream, matching
 * `lib/freshness.ts`:
 *
 *   · **An unrecognised schema is not rendered.** `parseHazardArchive` returns `null`
 *     for anything whose `schema` is not `hazardnet-hazard-archive/v1`, so a future
 *     format cannot be drawn as this one.
 *   · **An absent field is not drawn as zero.** `affected`/`deaths` are absent from
 *     the archive by design (the source's `Validated_Affected` was `0.0` on every row,
 *     which means "not recorded"). They are typed `null` and rendered as "not
 *     recorded" — never as `0`.
 *   · **The embargo block is part of the contract.** `embargoWithheld` is read from the
 *     artifact and surfaced by the page, so if a derived index is ever un-embargoed the
 *     page says so, and while it is embargoed the page states the omission instead of
 *     leaving a silently empty chart.
 *
 * See `docs/ops/HAZARD_ARCHIVE_QUALITY.md` for the measured quality of the source.
 */

export const HAZARD_ARCHIVE_URL = '/data/hazard-archive.json';
export const HAZARD_ARCHIVE_SCHEMA = 'hazardnet-hazard-archive/v1';

export interface ArchiveSeverityStats {
  n: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  mean: number | null;
}

export interface ArchiveEpisode {
  id: string;
  /** GLIDE registry id, or null for a row the archive did not tag (single-district). */
  glide: string | null;
  hazard_type: string;
  start_date: string;
  division: string | null;
  district_count: number;
  severity: ArchiveSeverityStats;
  data_sources: string[];
  flagged_for_review: number;
  /** Satellite retrieval window — not the physical event window. */
  gee_window: string | null;
  /** True when the episode recorded all 64 districts. */
  national: boolean;
}

export interface ArchiveQuality {
  full_years: string[];
  missing_years: number[];
  review_flagged_rows: number;
  glide_checked_rows: number;
  glide_disagreement_rows: number;
  glide_disagreement_rate: number | null;
  glide_disagreements: Record<string, number>;
  excluded_constant_columns: Record<string, string>;
  casualties_present: boolean;
  casualties_note: string;
  division_vintage: string;
}

export interface ArchiveEmbargo {
  active: boolean;
  withheld: string[];
  reason: string;
  disclosed_field: string;
  enforcement: string;
}

export interface ArchiveProvenance {
  source: string;
  loader: string;
  export_schema: string | null;
  ingested: number;
  claimed_total: number | null;
  drift: number | null;
  note: string;
}

export interface HazardArchive {
  schema: string;
  generated_at: string;
  provenance: ArchiveProvenance;
  totals: {
    rows: number;
    episodes: number;
    national_episodes: number;
    partial_episodes: number;
    episodes_without_glide: number;
    districts: number;
    divisions: number;
    hazards: number;
    year_range: [string, string] | null;
  };
  by_year: Record<string, number>;
  by_month: Record<string, number>;
  by_hazard: Record<string, number>;
  by_division: Record<string, number>;
  by_district: Record<string, number>;
  severity_by_hazard: Record<string, ArchiveSeverityStats>;
  quality: ArchiveQuality;
  embargo: ArchiveEmbargo;
  episodes: ArchiveEpisode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the payload's shape before it reaches a chart.
 *
 * Returns `null` — rather than a partially-filled object — when the schema tag does
 * not match or a required section is missing, because a page that renders half an
 * artifact is worse than one that says it could not read it.
 */
export function parseHazardArchive(payload: unknown): HazardArchive | null {
  if (!isRecord(payload)) return null;
  if (payload.schema !== HAZARD_ARCHIVE_SCHEMA) return null;
  if (!isRecord(payload.totals) || !isRecord(payload.by_hazard)) return null;
  if (!isRecord(payload.provenance) || !isRecord(payload.quality) || !isRecord(payload.embargo)) return null;
  if (!Array.isArray(payload.episodes)) return null;
  return payload as unknown as HazardArchive;
}

export async function fetchHazardArchive(): Promise<HazardArchive | null> {
  try {
    const res = await fetch(HAZARD_ARCHIVE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseHazardArchive(await res.json());
  } catch {
    return null;
  }
}

/**
 * `1 event` / `2 events` — these strings are read by people.
 * Mirrors `plural()` in scripts/build_content_engine.mjs.
 */
export function plural(count: number, noun: string, suffix = 's'): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : suffix}`;
}

/** An em dash for an absent value: never `0`, never `—%`. */
export const ABSENT = '—';

export function formatMaybe(value: number | null | undefined, digits = 2): string {
  return Number.isFinite(value as number) ? (value as number).toFixed(digits) : ABSENT;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return Number.isFinite(value as number) ? `${((value as number) * 100).toFixed(digits)}%` : ABSENT;
}

/** Sorted `[label, count]` pairs, descending. Charts and tables share this. */
export function ranked(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The archive's own severity field, stated as reported rather than computed. */
export const SEVERITY_FIELD_LABEL = 'archive-reported Severity_Index (0–1)';

/**
 * A stable colour per hazard class, so the same class is the same colour on every
 * chart on every page. Keyed by the model's canonical class names.
 */
export const HAZARD_COLORS: Record<string, string> = {
  'Flood': '#0369a1',
  'Flash Flood': '#0891b2',
  'Tropical Cyclone': '#7c3aed',
  'Severe Local Storm': '#b45309',
  'Cold Wave': '#2563eb',
  'Heat Wave': '#dc2626',
  'Drought': '#a16207',
  'Fire': '#ea580c',
};

export function hazardColor(hazard: string, index = 0): string {
  const fallback = ['#0369a1', '#0891b2', '#7c3aed', '#b45309', '#2563eb', '#dc2626', '#a16207', '#ea580c'];
  return HAZARD_COLORS[hazard] ?? fallback[index % fallback.length];
}
