/**
 * The live status strip — the first thing the front door says about *right now*.
 *
 * The 2026-09-19 landing-page review asked for a strip in the shape of
 * "⚠ 2 active alerts · 🟡 1 watch · ✓ 61 districts normal". That shape is right and
 * those numbers would have been invented: at the time of writing the committed alert
 * artifact holds **zero** published alerts, 74 assessed rows and 74 withheld by the
 * review gate (`frontend/public/data/alerts-latest.json`, and
 * `/data/freshness.json` says why in its own `honesty` notes). So this component
 * renders the artifact's counts and nothing else, including the zero case — which is
 * the case that most needs careful wording, because silence on a hazard platform is
 * read as safety.
 *
 * Rules it holds, all of them from `docs/PUBLIC_SURFACE.md` §3:
 *   · every number is read from an artifact; a figure with no artifact behind it does
 *     not appear;
 *   · a missing value is never rendered as a zero — an unreadable artifact produces the
 *     sentence that says it could not be read;
 *   · colour is never the only carrier: each level renders its word next to the badge
 *     (`AlertLevelBadge`, the single place a level becomes colour and words);
 *   · the region is announced (`role="status"` + `aria-live="polite"`), so a reader who
 *     leaves the page open hears the strip change when the artifact does.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { Interactive } from '../interactive/Interactive';
import { useWebFrame, interpolate, Easing } from '../../lib/motion-interpolate';

import { AlertLevelBadge } from '../alerts/AlertLevelBadge';
import { useI18n } from '../../hooks/useI18n';
import { useHazardLabel } from '../../hooks/useHazardLabel';
import { describeAge, type FreshnessCoverage } from '../../lib/freshness';

/**
 * The three alert levels, in the order a reader scans them.
 *
 * `NO_ALERT` is deliberately absent. The artifact's counts are counts of *published rows*
 * per level, so a `NO_ALERT: 0` chip would read as "no district is normal" — the opposite of
 * its meaning, and exactly the kind of number the review's worked example ("61 districts
 * normal") wanted on the page. The artifact carries no per-district normal count, so the
 * strip shows the coverage it does carry and nothing it does not.
 */
const LEVEL_ORDER = ['SEVERE', 'WARNING', 'WATCH'] as const;

export interface StatusCounts {
  NO_ALERT?: number | null;
  WATCH?: number | null;
  WARNING?: number | null;
  SEVERE?: number | null;
  dropped_unpublished?: number | null;
  not_published?: number | null;
}

export interface StripAlert {
  id: string;
  level: string;
  district_name?: string | null;
  hazard_type?: string | null;
  target_date?: string | null;
}

export interface LiveStatusStripProps {
  /** `counts` from the alerts artifact; null when it could not be read. */
  counts: StatusCounts | null;
  /** District/horizon rows the run assessed. */
  assessed: number | null;
  /** Rows the run withheld from publication (`counts.not_published`). */
  withheld: number | null;
  /** Published alerts, already ordered by the hook. */
  alerts: StripAlert[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  coverage: FreshnessCoverage | null;
  /** Retry handler wired to alerts refresh (audit #2: error recovery). */
  onRetry?: () => void;
}

/** Hours between an artifact timestamp and now, or null when it cannot be computed. */
function ageHoursFrom(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, (now - then) / 3_600_000);
}

export const LiveStatusStrip: React.FC<LiveStatusStripProps> = ({
  counts,
  assessed,
  withheld,
  alerts,
  generatedAt,
  loading,
  error,
  coverage,
  onRetry,
}) => {
  const { t, formatNumber, isBengali } = useI18n();
  const hazardLabel = useHazardLabel();
  const reduceMotion = useReducedMotion();
  const frame = useWebFrame(30);

  const published = alerts.length;
  const ageHours = ageHoursFrom(generatedAt);
  const coverageText =
    coverage?.districts_covered != null && coverage?.districts_expected != null
      ? `${formatNumber(coverage.districts_covered)} / ${formatNumber(coverage.districts_expected)}`
      : null;

  return (
    <Interactive.Section
      name="Live status strip — published now"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#d1d1d1',
        backgroundColor: '#f6f6f6',
        opacity: reduceMotion
          ? 1
          : interpolate(frame, [0, 10], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
        translate: reduceMotion
          ? '0px 0px'
          : interpolate(frame, [0, 10], ['0px 8px', '0px 0px'], {
              easing: Easing.spring({ damping: 200 }),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
      }}
      role="status"
      aria-live="polite"
      aria-label={t('frontdoor.strip.label')}
      className="border border-carbon-20 bg-carbon-05"
      data-testid="front-door-status-strip"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4 lg:p-6">
        {/* ── level counts ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">
            {t('frontdoor.strip.publishedNow')}
          </p>
          {loading && <p className="text-xs text-carbon-60">{t('frontdoor.strip.reading')}</p>}

          {!loading && counts === null && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs leading-relaxed text-carbon-70">{t('frontdoor.strip.unreadable')}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[32px] items-center gap-1 border border-carbon-20 bg-white px-3 py-1 text-xs font-semibold text-carbon-80 hover:bg-carbon-05"
                >
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}

          {!loading && counts !== null && (
            <ul className="flex flex-wrap items-center gap-2">
              {LEVEL_ORDER.filter((level) => counts[level] != null).map((level) => (
                <li key={level} className="flex items-center gap-1.5">
                  <AlertLevelBadge
                    level={level}
                    label={t(`alerts.level.${level}`)}
                    description={t(`alerts.level.${level}.desc`)}
                    size="sm"
                    srPrefix={t('alerts.levelLabel')}
                  />
                  <span className="font-mono text-sm font-bold text-carbon-90">
                    {formatNumber(Number(counts[level]))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── coverage + the run's own timestamp ───────────────────────────── */}
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-carbon-70">
          <div className="flex items-center gap-1.5">
            <dt className="font-mono text-xs uppercase tracking-wide text-carbon-60">
              {t('frontdoor.strip.districts')}
            </dt>
            <dd className="font-mono font-bold text-carbon-90">
              {coverageText ?? '—'}
              {coverage?.status ? ` (${coverage.status})` : ''}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="font-mono text-xs uppercase tracking-wide text-carbon-60">
              {t('frontdoor.strip.assessed')}
            </dt>
            <dd className="font-mono font-bold text-carbon-90">{assessed != null ? formatNumber(assessed) : '—'}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="font-mono text-xs uppercase tracking-wide text-carbon-60">
              {t('frontdoor.strip.updated')}
            </dt>
            <dd className="font-mono text-carbon-80">
              {ageHours != null ? describeAge(ageHours) : '—'}
              {generatedAt ? ` · ${generatedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}
            </dd>
          </div>
        </dl>

        <nav aria-label={t('frontdoor.strip.navLabel')} className="ml-auto flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/alerts" className="inline-flex min-h-[44px] items-center text-base font-bold text-nasa-blue-shade underline underline-offset-4">
            {t('frontdoor.strip.allAlerts')}
          </Link>
          <Link to="/live" className="inline-flex min-h-[44px] items-center text-base font-bold text-nasa-blue-shade underline underline-offset-4">
            {t('frontdoor.strip.liveMap')}
          </Link>
        </nav>
      </div>

      {/* ── the top published alert, or the honest zero ─────────────────────── */}
      {!loading && published > 0 && (
        <div className="border-t border-carbon-20 bg-white px-4 py-3 md:px-5">
          <ul className="space-y-2">
            {alerts.slice(0, 2).map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center gap-2 text-sm">
                <AlertLevelBadge
                  level={alert.level}
                  label={t(`alerts.level.${alert.level}`)}
                  description={t(`alerts.level.${alert.level}.desc`)}
                  size="sm"
                  srPrefix={t('alerts.levelLabel')}
                />
                <Link
                  to={`/alerts/${encodeURIComponent(alert.id)}`}
                  className="font-bold text-nasa-blue-shade underline underline-offset-2"
                >
                  {alert.district_name ?? t('frontdoor.strip.districtUnnamed')}
                </Link>
                {alert.hazard_type && <span className="text-xs text-carbon-70">{hazardLabel(alert.hazard_type)}</span>}
                {alert.target_date && (
                  <span className="font-mono text-xs text-carbon-60">
                    {t('common.targetDate')}: {alert.target_date}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && counts !== null && published === 0 && (
        <p className="border-t border-carbon-20 bg-white px-4 py-3 text-base leading-[1.62] text-carbon-70 lg:px-6">
          <strong className="font-bold text-carbon-90">{t('frontdoor.strip.nonePublished')}</strong>{' '}
          {withheld != null || assessed != null ? (
            <span lang={isBengali ? 'bn' : undefined}>
              {t('frontdoor.strip.withheld', {
                withheld: withheld != null ? formatNumber(withheld) : '—',
                assessed: assessed != null ? formatNumber(assessed) : '—',
              })}
            </span>
          ) : (
            t('frontdoor.strip.withheldUnknown')
          )}{' '}
          <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
            {t('frontdoor.strip.whyHeld')}
          </Link>
        </p>
      )}

      {!loading && error && (
        <Interactive.Div
          name="Status error — retry"
          style={{
            borderTopWidth: 1,
            borderTopStyle: 'solid',
            borderTopColor: '#d1d1d1',
            backgroundColor: 'white',
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: 12,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            opacity: reduceMotion
              ? 1
              : interpolate(frame, [0, 8], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
          }}
          role="alert"
          className="border-t border-carbon-20 bg-white px-4 py-3 md:px-5 flex flex-wrap items-center gap-3"
        >
          <p className="text-sm leading-[1.62] text-nasa-red-shade flex-1 min-w-[12rem]">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[44px] items-center gap-1.5 bg-nasa-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nasa-blue-shade focus-visible:outline focus-visible:outline-2 focus-visible:outline-nasa-blue focus-visible:outline-offset-2"
            >
              {t('common.retry')}
            </button>
          )}
        </Interactive.Div>
      )}
    </Interactive.Section>
  );
};

export default LiveStatusStrip;
