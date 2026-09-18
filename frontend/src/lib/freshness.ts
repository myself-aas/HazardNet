/**
 * Freshness artifact client (Phase 7) — the browser side of the observability work.
 *
 * The status page states what the deployment's own committed artifacts say, and it does it
 * from one file: `/data/freshness.json`, produced by `scripts/build_freshness_artifact.mjs`
 * and committed with the data it describes. Nothing here probes anything — a page that
 * quietly invented a timestamp would be worse than no page at all.
 *
 * Two properties are enforced in this module rather than trusted downstream, in the same
 * spirit as `lib/alerts.ts`:
 *
 *   * **An unrecognised schema is not rendered.** `parseFreshness` returns `null` for a
 *     payload whose `schema` is not `hazardnet-freshness/v1`, so a future format cannot be
 *     silently mis-drawn as this one.
 *   * **An unknown age is not drawn as zero.** `describeAge(null)` is an em dash, never
 *     `0 h`, and a state string that is not one of the five known states becomes `unknown`.
 */

export const FRESHNESS_URL = '/data/freshness.json';
export const FRESHNESS_SCHEMA = 'hazardnet-freshness/v1';

export type FreshnessState = 'fresh' | 'stale' | 'failing' | 'missing' | 'unknown';

const STATES: FreshnessState[] = ['fresh', 'stale', 'failing', 'missing', 'unknown'];

export interface FreshnessSource {
  id: string;
  label: string;
  artifact: string;
  state: FreshnessState;
  reason: string | null;
  generated_at: string | null;
  prediction_date?: string | null;
  age_hours: number | null;
  slo_hours: number | null;
  outcome?: string;
  detail: Record<string, unknown> | null;
}

export interface FreshnessCoverage {
  status: string | null;
  produced_units: number | null;
  districts_covered: number | null;
  districts_expected: number | null;
  missing_district_ids: string[] | null;
  horizons: string[] | null;
  units_per_horizon: Record<string, number> | null;
}

export interface FreshnessModel {
  model_version: string | null;
  stamped: boolean;
  tensor_build_id: string | null;
  pipeline_version: string | null;
  run_id: string | null;
  dataset_version: string | null;
  soil_channels_fabricated: boolean | null;
}

export interface FreshnessArtifact {
  schema: string;
  built_at: string | null;
  generated_by: string | null;
  what_this_is: string | null;
  overall: { state: FreshnessState; counts: Record<string, number>; not_fresh: string[] };
  sources: FreshnessSource[];
  coverage: FreshnessCoverage | null;
  model: FreshnessModel | null;
  honesty: string[];
}

export const isFreshnessState = (value: unknown): value is FreshnessState =>
  typeof value === 'string' && (STATES as string[]).includes(value);

/** Human label for a state. `unknown` is a label, not an absence of one. */
export function stateLabel(state: FreshnessState): string {
  switch (state) {
    case 'fresh':
      return 'Within SLO';
    case 'stale':
      return 'Past SLO';
    case 'failing':
      return 'Checks failing';
    case 'missing':
      return 'No data';
    default:
      return 'Unknown';
  }
}

/** Badge classes per state (Tailwind, matching the alert-level palette's tone). */
export function stateTone(state: FreshnessState): string {
  switch (state) {
    case 'fresh':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    case 'stale':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'failing':
      return 'border-rose-300 bg-rose-50 text-rose-900';
    case 'missing':
      return 'border-slate-400 bg-slate-100 text-slate-800';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700';
  }
}

/** `3.4 h` / `2.4 d` / `—` — never `0 h` for an unknown age. */
export function describeAge(ageHours: number | null | undefined): string {
  if (typeof ageHours !== 'number' || !Number.isFinite(ageHours)) return '—';
  if (ageHours < 0) return '—';
  if (ageHours < 48) return `${Math.round(ageHours * 10) / 10} h`;
  return `${Math.round((ageHours / 24) * 10) / 10} d`;
}

/** `192 h` in the SLO column; `—` when the artifact does not state one. */
export function describeSlo(sloHours: number | null | undefined): string {
  if (typeof sloHours !== 'number' || !Number.isFinite(sloHours)) return '—';
  return `${sloHours} h`;
}

/** ISO instant → `2026-09-18 06:04 UTC` (short, unambiguous, no locale guessing). */
export function describeStamp(iso: string | null | undefined): string {
  if (typeof iso !== 'string' || iso.trim() === '') return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return `${new Date(parsed).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function parseSource(raw: unknown): FreshnessSource | null {
  if (!isRecord(raw)) return null;
  const id = stringOrNull(raw.id);
  if (!id) return null;
  return {
    id,
    label: stringOrNull(raw.label) ?? id,
    artifact: stringOrNull(raw.artifact) ?? '',
    state: isFreshnessState(raw.state) ? raw.state : 'unknown',
    reason: stringOrNull(raw.reason),
    generated_at: stringOrNull(raw.generated_at),
    prediction_date: stringOrNull(raw.prediction_date),
    age_hours: numberOrNull(raw.age_hours),
    slo_hours: numberOrNull(raw.slo_hours),
    outcome: stringOrNull(raw.outcome) ?? undefined,
    detail: isRecord(raw.detail) ? raw.detail : null,
  };
}

function parseCoverage(raw: unknown): FreshnessCoverage | null {
  if (!isRecord(raw)) return null;
  return {
    status: stringOrNull(raw.status),
    produced_units: numberOrNull(raw.produced_units),
    districts_covered: numberOrNull(raw.districts_covered),
    districts_expected: numberOrNull(raw.districts_expected),
    missing_district_ids: Array.isArray(raw.missing_district_ids)
      ? raw.missing_district_ids.filter((value): value is string => typeof value === 'string')
      : null,
    horizons: Array.isArray(raw.horizons)
      ? raw.horizons.filter((value): value is string => typeof value === 'string')
      : null,
    units_per_horizon: isRecord(raw.units_per_horizon)
      ? Object.fromEntries(
          Object.entries(raw.units_per_horizon).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        )
      : null,
  };
}

function parseModel(raw: unknown): FreshnessModel | null {
  if (!isRecord(raw)) return null;
  const version = stringOrNull(raw.model_version);
  return {
    model_version: version,
    stamped: raw.stamped === true || version !== null,
    tensor_build_id: stringOrNull(raw.tensor_build_id),
    pipeline_version: stringOrNull(raw.pipeline_version),
    run_id: stringOrNull(raw.run_id),
    dataset_version: stringOrNull(raw.dataset_version),
    soil_channels_fabricated:
      typeof raw.soil_channels_fabricated === 'boolean' ? raw.soil_channels_fabricated : null,
  };
}

/**
 * Parse a freshness payload. Returns `null` when the payload is not this contract — the
 * caller renders "unavailable" rather than guessing at an unknown shape.
 */
export function parseFreshness(payload: unknown): FreshnessArtifact | null {
  if (!isRecord(payload)) return null;
  if (payload.schema !== FRESHNESS_SCHEMA) return null;
  const sources = Array.isArray(payload.sources)
    ? payload.sources.map(parseSource).filter((source): source is FreshnessSource => source !== null)
    : [];
  if (sources.length === 0) return null;
  const overall = isRecord(payload.overall) ? payload.overall : {};
  const counts = isRecord(overall.counts) ? overall.counts : {};
  return {
    schema: FRESHNESS_SCHEMA,
    built_at: stringOrNull(payload.built_at),
    generated_by: stringOrNull(payload.generated_by),
    what_this_is: stringOrNull(payload.what_this_is),
    overall: {
      state: isFreshnessState(overall.state) ? overall.state : 'unknown',
      counts: Object.fromEntries(
        Object.entries(counts).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      ),
      not_fresh: Array.isArray(overall.not_fresh)
        ? overall.not_fresh.filter((value): value is string => typeof value === 'string')
        : [],
    },
    sources,
    coverage: parseCoverage(payload.coverage),
    model: parseModel(payload.model),
    honesty: Array.isArray(payload.honesty)
      ? payload.honesty.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

export interface FreshnessLoad {
  artifact: FreshnessArtifact | null;
  error: string | null;
  fetchedAt: string;
}

/**
 * Fetch the artifact. Never throws: the page renders `artifact === null` as "unavailable"
 * and still shows the explanatory copy, because a status page that goes blank when it
 * cannot load its own status file is the worst possible failure mode for it.
 */
export async function loadFreshness(
  {
    fetcher = typeof fetch === 'function' ? fetch : (undefined as unknown as typeof fetch),
    url = FRESHNESS_URL,
    timeoutMs = 6000,
  }: { fetcher?: typeof fetch; url?: string; timeoutMs?: number } = {},
): Promise<FreshnessLoad> {
  const fetchedAt = new Date().toISOString();
  if (typeof fetcher !== 'function') {
    return { artifact: null, error: 'no fetch implementation available', fetchedAt };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${url}${url.includes('?') ? '&' : '?'}fresh=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return { artifact: null, error: `HTTP ${response.status}`, fetchedAt };
    const artifact = parseFreshness(await response.json());
    if (!artifact) return { artifact: null, error: `unrecognised payload at ${url}`, fetchedAt };
    return { artifact, error: null, fetchedAt };
  } catch (error) {
    return { artifact: null, error: (error as Error).message || 'fetch failed', fetchedAt };
  } finally {
    clearTimeout(timer);
  }
}
