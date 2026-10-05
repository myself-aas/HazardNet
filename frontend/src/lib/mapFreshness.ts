/**
 * Freshness chip grammar for live-map layers (plan §6, 2026-10-05).
 *
 * Distinct from `lib/freshness.ts`, which parses the deployment's committed
 * freshness artifact for the status page: this module is the one vocabulary for
 * the chips on live-map layer rows. Every row advertises how fresh its data is
 * with exactly one of these states. Amber is reserved for data that is observed
 * and current (LIVE / NRT); everything else reads neutral so a glance separates
 * "happening now" from "as of". Chips always carry text, never colour only.
 */

export type MapFreshness =
  | { kind: 'live'; utcTime: string }
  | { kind: 'nrt'; lag: string }
  | { kind: 'stale'; asOf: string }
  | { kind: 'snapshot'; date: string }
  | { kind: 'unavailable' };

/** The exact text a chip renders: `LIVE 12:40Z` / `NRT ~4 h` / `STALE as of
 *  09:10Z` / `SNAPSHOT 2026-09-16` / `UNAVAILABLE`. */
export function mapFreshnessLabel(f: MapFreshness): string {
  switch (f.kind) {
    case 'live':
      return `LIVE ${f.utcTime}`;
    case 'nrt':
      return `NRT ${f.lag.startsWith('~') ? f.lag : `~${f.lag}`}`;
    case 'stale':
      return `STALE as of ${f.asOf}`;
    case 'snapshot':
      return `SNAPSHOT ${f.date}`;
    case 'unavailable':
      return 'UNAVAILABLE';
  }
}

/** Amber = observed and current; neutral = older, stored, or missing. */
export function mapFreshnessTone(f: MapFreshness): 'amber' | 'neutral' {
  return f.kind === 'live' || f.kind === 'nrt' ? 'amber' : 'neutral';
}
