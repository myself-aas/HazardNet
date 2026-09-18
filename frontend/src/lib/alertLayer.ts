/**
 * Mapping the alert engine's output onto the vector map (Phase 5).
 *
 * Two vocabularies meet here and must not be confused:
 *
 *   - the **model's** hazard classes (eight, from `Models/labels.json`) arrive on alert
 *     rows as `hazard_type`;
 *   - the **map's** district geometry is keyed by district slug (`dhaka`, `coxs-bazar`)
 *     and carries a *static baseline* hazard of its own.
 *
 * So the alert layer is keyed by district slug, contains only districts that actually
 * have a published alert, and the map renders those in the alert palette while leaving
 * every other district in the baseline palette. The map component does not merge the
 * two — a baseline colour must never be mistakable for a published alert — and the
 * table on the same page shows which is which.
 */

import type { AlertLevel, AlertRecord } from './alerts';
import { districtKey } from './alerts';

export const DISTRICT_ALERT_LAYER_ID = 'district-alert-layer';

/**
 * Build `{ districtSlug: level }` from published alerts.
 *
 * When a district has several alerts (several hazards or horizons) the **highest**
 * level wins, because the map answers "how bad is it here", not "how many alerts are
 * here". The list below the map is where the individual alerts live.
 */
export function buildAlertLevelLayer(alerts: AlertRecord[]): Record<string, AlertLevel> {
  const rank: Record<string, number> = { NO_ALERT: 0, WATCH: 1, WARNING: 2, SEVERE: 3 };
  const out: Record<string, AlertLevel> = {};
  for (const alert of alerts) {
    const slug = districtKey(alert.district_name || (alert.district_id !== null && alert.district_id !== undefined
      ? String(alert.district_id)
      : null));
    if (!slug) continue;
    const level = alert.level as AlertLevel;
    const current = out[slug];
    if (!current || (rank[level] ?? 0) > (rank[current] ?? 0)) out[slug] = level;
  }
  return out;
}

/**
 * Districts whose alert level is at or above `minimum` — used by the "severe only" view.
 *
 * Returns **district-name slugs** (`sunamganj`), not the id keys `alertsByDistrict` also
 * carries: a caller filtering the map needs something it can match against the geometry,
 * and an id-as-string would silently match nothing. Rows that carry only a district id
 * are therefore skipped here, and that is deliberate.
 */
export function districtsAtOrAbove(alerts: AlertRecord[], minimum: AlertLevel): string[] {
  const rank: Record<string, number> = { NO_ALERT: 0, WATCH: 1, WARNING: 2, SEVERE: 3 };
  const floor = rank[minimum] ?? 0;
  const out = new Set<string>();
  for (const alert of alerts) {
    const slug = districtKey(alert.district_name);
    if (!slug) continue;
    if ((rank[alert.level as string] ?? 0) >= floor) out.add(slug);
  }
  return [...out].sort();
}

/**
 * The district slug the map and the router both use.
 *
 * `districtKey` lowercases and strips punctuation for matching; this normalises further
 * for URL use, so `/district/coxs-bazar` resolves to the same district as
 * "Cox's Bazar" in the alert payload.
 */
export function districtSlugForUrl(name: string | null | undefined): string {
  return districtKey(name).replace(/\s+/g, '-');
}
