/**
 * Alert API client (Phase 5) — the browser side of the Phase 4 alert engine.
 *
 * Data path, in order of freshness:
 *
 *   1. `GET /api/v1/alerts` — the live list, published alerts only for an anonymous
 *      caller (the server enforces that; this client never sends credentials).
 *   2. `/data/alerts-latest.json` — the snapshot committed with the deployment by
 *      `scripts/build_alert_snapshot.mjs`. This is what makes the alert surface work
 *      on a 2G connection or with the device in flight mode, which is the whole
 *      point of a hazard dashboard in a monsoon.
 *
 * Two safety properties are enforced here rather than trusted downstream:
 *
 *   * **Only `PUBLISHED` alerts are rendered.** The API filters for anonymous
 *     callers and the snapshot builder refuses to write anything else, but a UI that
 *     renders whatever it is handed is one backend regression away from publishing an
 *     unreviewed warning. `parseAlertsPayload` drops every other state, always.
 *   * **A missing disclaimer is not silently tolerated.** §1.7 requires it on every
 *     public surface; if a payload arrives without it the UI falls back to the
 *     canonical text in `lib/legal.ts` and the snapshot is flagged as degraded in the
 *     returned `warnings`, so the page can say the data is not fully conforming.
 *
 * The same contract is used for the policy endpoint, so the "how these levels are
 * decided" panel cannot describe thresholds the engine is not using.
 */

export const ALERTS_API_URL = '/api/v1/alerts';
export const ALERTS_POLICY_URL = '/api/v1/alerts/policy';
export const ALERTS_SNAPSHOT_URL = '/data/alerts-latest.json';

/** Snapshot schema this client understands. */
export const ALERTS_SNAPSHOT_SCHEMA = 'hazardnet-alerts/v1';

export type AlertLevel = 'NO_ALERT' | 'WATCH' | 'WARNING' | 'SEVERE';

export const ALERT_LEVELS: AlertLevel[] = ['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE'];

/** Ordering aid: higher level first in every list the UI renders. */
export const alertLevelRank = (level: string | null | undefined): number =>
  ALERT_LEVELS.indexOf((level || '') as AlertLevel);

export const isAlertLevel = (value: unknown): value is AlertLevel =>
  typeof value === 'string' && (ALERT_LEVELS as string[]).includes(value);

export interface AlertReason {
  rule?: string;
  detail?: string;
  track?: string;
}

export interface AlertEvidence {
  model?: {
    hazard_type?: string | null;
    severity?: number | null;
    model_severity?: number | null;
    confidence?: number | null;
    confidence_kind?: string | null;
    /** `calibrated_probability` | `uncalibrated_model_softmax` */
    confidence_published?: string | null;
    band?: string | null;
  };
  physics?: {
    physics_severity?: number | null;
    physics_agreement?: string | null;
    divergence?: number | null;
    divergence_source?: string | null;
    note?: string | null;
  };
  official?: { bulletin_score?: number | null; source?: string | null } | null;
  line?: string[];
}

export interface AlertFreshness {
  prediction_date?: string | null;
  data_cutoff?: string | null;
  data_cutoff_source?: string | null;
  age_hours?: number | null;
  slo_hours?: number | null;
  within_slo?: boolean | null;
  stale_soon?: boolean;
}

export interface AlertProvenance {
  model_version?: string | null;
  dataset_version?: string | null;
  pipeline_version?: string | null;
  run_id?: string | null;
}

/** One published alert as the public API serves it. */
export interface AlertRecord {
  id: string;
  state: 'PUBLISHED' | string;
  level: AlertLevel | string;
  district_id?: number | string | null;
  district_name?: string | null;
  division?: string | null;
  pcode?: string | null;
  horizon?: string | null;
  hazard_type?: string | null;
  target_date?: string | null;
  prediction_date?: string | null;
  lead_time_days?: number | null;
  severity_score?: number | null;
  confidence?: number | null;
  confidence_kind?: string | null;
  policy_version?: string | null;
  reasons?: AlertReason[];
  blockers?: AlertReason[];
  evidence?: AlertEvidence | null;
  freshness?: AlertFreshness | null;
  provenance?: AlertProvenance | null;
  requires_human_review?: boolean;
  auto_publishable?: boolean;
  review?: { decision?: string; reviewer?: string | null; at?: string | null; reason?: string | null } | null;
  published?: {
    at?: string | null;
    level?: string;
    mode?: 'auto' | 'human' | string;
    reviewer?: string | null;
    model_version?: string | null;
    dataset_version?: string | null;
    data_cutoff?: string | null;
  } | null;
  disclaimer?: string | null;
}

export interface AlertPolicyView {
  version?: string;
  source?: string;
  overridden?: Array<{ key: string; env: string; value: unknown }>;
  warnings?: string[];
  thresholds?: {
    watch_probability?: number;
    warning_probability?: number;
    watch_severity?: number;
    divergence_watch?: number;
    agreement_epsilon?: number;
  };
  human_in_the_loop?: {
    max_auto_publish_level?: string;
    requires_named_reviewer_above?: string;
    note?: string;
  };
  calibration?: {
    calibrated_probability_required_for_warning?: boolean;
    note?: string;
  };
  levels?: string[];
  states?: string[];
  disclaimer?: string;
}

export interface AlertsSnapshot {
  schema?: string;
  generated_at?: string;
  source?: string;
  policy?: AlertPolicyView | null;
  counts?: Record<string, number> | null;
  assessed?: number | null;
  alerts?: unknown[];
}

/** Where a rendered list came from, so the page can label it honestly. */
/**
 * Where a rendered list came from, so the page can label it honestly.
 *
 * `cache` is the service-worker's labelled offline copy of a live API response: the
 * data *was* live when this device fetched it, and the browser is now offline. It is
 * deliberately distinct from `snapshot` (the payload committed with the deployment),
 * because the two have completely different ages and the page must say which one the
 * reader is looking at.
 */
export type AlertsSource = 'api' | 'cache' | 'snapshot' | 'none';

export interface AlertsResult {
  alerts: AlertRecord[];
  policy: AlertPolicyView | null;
  source: AlertsSource;
  generated_at: string | null;
  /** How many district forecasts the run assessed — the denominator for coverage. */
  assessed: number | null;
  /** Level → number of rows, as reported by the payload. */
  counts: Record<string, number> | null;
  /** Rows the payload carried that were not PUBLISHED and were therefore dropped. */
  dropped_unpublished: number;
  /**
   * Rows the run assessed but could not publish (blocked, pending review or held), as
   * the run report counted them. `null` when the payload is not a run report — a plain
   * alert list cannot know this, and the page must not invent it.
   */
  not_published?: number | null;
  /** §1.7 / contract problems found while parsing; non-empty means degraded data. */
  warnings: string[];
  error: string | null;
  fetched_at: string;
}

export interface LoadAlertsOptions {
  fetcher?: typeof fetch;
  now?: Date;
  /** Skip the network entirely (offline mode, or a user on a metered connection). */
  offlineFirst?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const EMPTY_RESULT: Omit<AlertsResult, 'fetched_at'> = {
  alerts: [],
  policy: null,
  source: 'none',
  generated_at: null,
  assessed: null,
  counts: null,
  dropped_unpublished: 0,
  warnings: [],
  error: null,
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const countsOrNull = (value: unknown): Record<string, number> | null => {
  if (!isRecord(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = numberOrNull(raw);
    if (parsed !== null) out[key] = parsed;
  }
  return Object.keys(out).length > 0 ? out : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Parse an alert payload (API response or snapshot) into renderable records.
 *
 * Returns the surviving alerts *and* how many were dropped, because "the API sent
 * four unreviewed warnings and we hid them" is information a monitoring surface
 * should be able to report rather than something to discard silently.
 */
export function parseAlertsPayload(payload: unknown): {
  alerts: AlertRecord[];
  dropped_unpublished: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const rawList = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.alerts)
      ? payload.alerts
      : null;
  if (rawList === null) {
    return { alerts: [], dropped_unpublished: 0, warnings: ['payload carried no alerts array'] };
  }

  const alerts: AlertRecord[] = [];
  let droppedUnpublished = 0;
  let missingDisclaimer = 0;
  let missingId = 0;

  for (const entry of rawList) {
    if (!isRecord(entry)) continue;
    const state = asString(entry.state) || 'DRAFT';
    if (state !== 'PUBLISHED') {
      droppedUnpublished += 1;
      continue;
    }
    const id = asString(entry.id);
    if (!id) {
      missingId += 1;
      continue;
    }
    const level = asString(entry.level) || '';
    if (!isAlertLevel(level)) {
      warnings.push(`alert ${id} has an unknown level "${entry.level}"`);
      continue;
    }
    const disclaimer = asString(entry.disclaimer);
    if (!disclaimer) missingDisclaimer += 1;

    alerts.push({
      ...(entry as unknown as AlertRecord),
      id,
      state: 'PUBLISHED',
      level,
      confidence: asNumber(entry.confidence),
      lead_time_days: asNumber(entry.lead_time_days),
      severity_score: asNumber(entry.severity_score),
      disclaimer,
    });
  }

  if (droppedUnpublished > 0) {
    warnings.push(
      `${droppedUnpublished} non-published alert(s) were present in the payload and were dropped ` +
      '(only PUBLISHED alerts may be shown publicly)',
    );
  }
  if (missingDisclaimer > 0) {
    warnings.push(
      `${missingDisclaimer} alert(s) arrived without the §1.7 disclaimer; the canonical text is ' +
      'rendered instead`,
    );
  }
  if (missingId > 0) warnings.push(`${missingId} alert(s) had no id and could not be linked`);

  return { alerts: sortAlerts(alerts), dropped_unpublished: droppedUnpublished, warnings };
}

export function parsePolicyPayload(payload: unknown): AlertPolicyView | null {
  if (!isRecord(payload)) return null;
  const view: AlertPolicyView = {
    version: asString(payload.version) || undefined,
    source: asString(payload.source) || undefined,
    warnings: Array.isArray(payload.warnings) ? (payload.warnings as string[]) : [],
    thresholds: isRecord(payload.thresholds) ? payload.thresholds : undefined,
    human_in_the_loop: isRecord(payload.human_in_the_loop) ? payload.human_in_the_loop : undefined,
    calibration: isRecord(payload.calibration) ? payload.calibration : undefined,
    levels: Array.isArray(payload.levels) ? (payload.levels as string[]) : undefined,
    disclaimer: asString(payload.disclaimer) || undefined,
  };
  return view;
}

/** Sort by level (severe first), then severity, then district name. */
export function sortAlerts(alerts: AlertRecord[]): AlertRecord[] {
  return [...alerts].sort((a, b) => {
    const byLevel = alertLevelRank(b.level) - alertLevelRank(a.level);
    if (byLevel !== 0) return byLevel;
    const bySeverity = (b.severity_score ?? 0) - (a.severity_score ?? 0);
    if (bySeverity !== 0) return bySeverity;
    return String(a.district_name || '').localeCompare(String(b.district_name || ''));
  });
}

/** Counts per level, for the page header and the map legend. */
export function summariseAlerts(alerts: AlertRecord[]): Record<AlertLevel, number> {
  const counts: Record<AlertLevel, number> = { NO_ALERT: 0, WATCH: 0, WARNING: 0, SEVERE: 0 };
  for (const alert of alerts) {
    if (isAlertLevel(alert.level)) counts[alert.level] += 1;
  }
  return counts;
}

/** Slug key used to join an alert to the static district table (`coxsbazar`). */
export function districtKey(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Highest-level alert per district, keyed by district slug. */
export function alertsByDistrict(alerts: AlertRecord[]): Map<string, AlertRecord> {
  const map = new Map<string, AlertRecord>();
  for (const alert of sortAlerts(alerts)) {
    for (const key of [districtKey(alert.district_name), districtKey(String(alert.district_id ?? ''))]) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, alert);
    }
  }
  return map;
}

export function alertsForDistrict(alerts: AlertRecord[], district: string | null | undefined): AlertRecord | null {
  const key = districtKey(district);
  if (!key) return null;
  return alertsByDistrict(alerts).get(key) || null;
}

/** Is a rendered list still inside the freshness SLO the engine publishes? */
export function freshnessOf(
  result: Pick<AlertsResult, 'generated_at' | 'alerts'>,
  { now = new Date(), maxAgeHours = 48 }: { now?: Date; maxAgeHours?: number } = {},
): { age_hours: number | null; within_slo: boolean | null } {
  const cutoff = result.alerts
    .map((alert) => alert.freshness?.data_cutoff || alert.published?.data_cutoff)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
  const stamp = cutoff || result.generated_at;
  if (!stamp) return { age_hours: null, within_slo: null };
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return { age_hours: null, within_slo: null };
  const age = Math.round(((now.getTime() - parsed.getTime()) / 3.6e6) * 100) / 100;
  return { age_hours: age, within_slo: age <= maxAgeHours };
}

interface FetchedPayload {
  payload: unknown;
  /** True when the service worker answered from its offline cache (header marker). */
  stale: boolean;
}

async function fetchJson(
  url: string,
  { fetcher, timeoutMs = 6000, signal }: { fetcher: typeof fetch; timeoutMs?: number; signal?: AbortSignal },
): Promise<FetchedPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetcher(`${url}${url.includes('?') ? '&' : '?'}fresh=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stale = response.headers?.get?.('X-HazardNet-Stale') === '1';
    return { payload: await response.json(), stale };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * Load alerts, preferring the live API and falling back to the committed snapshot.
 *
 * Never throws: a caller renders `result.source === 'none'` as "unavailable" and the
 * page still shows the map and the district pages.
 */
export async function loadAlerts(options: LoadAlertsOptions = {}): Promise<AlertsResult> {
  const {
    fetcher = typeof fetch === 'function' ? fetch : (undefined as unknown as typeof fetch),
    now = new Date(),
    offlineFirst = false,
    timeoutMs = 6000,
    signal,
  } = options;
  const fetched_at = now.toISOString();
  const errors: string[] = [];

  if (!fetcher) {
    return { ...EMPTY_RESULT, fetched_at, error: 'no fetch implementation available' };
  }

  if (!offlineFirst) {
    try {
      const { payload, stale } = await fetchJson(ALERTS_API_URL, { fetcher, timeoutMs, signal });
      const parsed = parseAlertsPayload(payload);
      const warnings = [...parsed.warnings];
      if (stale) {
        warnings.push(
          'the alert payload was served from this device\'s offline cache; it is the last copy ' +
          'that was fetched while online',
        );
      }
      return {
        ...parsed,
        warnings,
        policy: parsePolicyPayload(isRecord(payload) ? payload.policy : null),
        source: stale ? 'cache' : 'api',
        generated_at: asString(isRecord(payload) ? payload.generated_at : null) || fetched_at,
        assessed: isRecord(payload) ? numberOrNull(payload.assessed) : null,
        counts: isRecord(payload) ? countsOrNull(payload.counts) : null,
        not_published: isRecord(payload)
          ? numberOrNull((payload.counts as Record<string, unknown> | undefined)?.not_published)
          : null,
        error: null,
        fetched_at,
      };
    } catch (error) {
      errors.push(`live API: ${(error as Error).message}`);
    }
  }

  try {
    const { payload } = await fetchJson(ALERTS_SNAPSHOT_URL, { fetcher, timeoutMs, signal });
    const parsed = parseAlertsPayload(payload);
    const snapshot = isRecord(payload) ? (payload as AlertsSnapshot) : {};
    const warnings = [...parsed.warnings];
    if (snapshot.schema && snapshot.schema !== ALERTS_SNAPSHOT_SCHEMA) {
      warnings.push(
        `snapshot schema ${snapshot.schema} does not match ${ALERTS_SNAPSHOT_SCHEMA}; ` +
        'the page may be rendering an older contract',
      );
    }
    return {
      ...parsed,
      warnings,
      policy: parsePolicyPayload(snapshot.policy),
      source: 'snapshot',
      generated_at: asString(snapshot.generated_at) || fetched_at,
      assessed: numberOrNull(snapshot.assessed),
      counts: countsOrNull(snapshot.counts),
      not_published: numberOrNull(snapshot.counts?.not_published),
      error: errors.length > 0 ? errors.join('; ') : null,
      fetched_at,
    };
  } catch (error) {
    errors.push(`snapshot: ${(error as Error).message}`);
    return { ...EMPTY_RESULT, fetched_at, error: errors.join('; ') };
  }
}

/**
 * Load the policy in force on its own (the methodology panel uses this even when
 * there are no alerts to show). Falls back to the snapshot's embedded copy.
 */
export async function loadAlertPolicy(options: LoadAlertsOptions = {}): Promise<AlertPolicyView | null> {
  const { fetcher = typeof fetch === 'function' ? fetch : (undefined as unknown as typeof fetch),
    timeoutMs = 6000, signal } = options;
  if (typeof fetcher === 'function') {
    try {
      const { payload } = await fetchJson(ALERTS_POLICY_URL, { fetcher, timeoutMs, signal });
      return parsePolicyPayload(payload);
    } catch {
      /* fall through to the snapshot */
    }
  }
  try {
    const { payload } = await fetchJson(ALERTS_SNAPSHOT_URL, { fetcher, timeoutMs, signal });
    return parsePolicyPayload(isRecord(payload) ? payload.policy : null);
  } catch {
    return null;
  }
}
