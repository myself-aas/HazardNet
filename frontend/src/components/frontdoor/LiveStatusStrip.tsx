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
 * Rules it holds, all of them from `scripts/lib/public-text.mjs`:
 *   · every number is read from an artifact; a figure with no artifact behind it does
 *     not appear;
 *   · a missing value is never rendered as a zero — an unreadable artifact produces the
 *     sentence that says it could not be read;
 *   · colour is never the only carrier: each level renders its word next to the badge
 *     (`AlertLevelBadge`, the single place a level becomes colour and words);
 *   · the region is announced (`role="status"` + `aria-live="polite"`), so a reader who
 *     leaves the page open hears the strip change when the artifact does;
 *   · the strip is present at first paint rather than fading in from transparent, and it
 *     never prints a loader diagnostic: a reader gets the localised state and a recovery
 *     control, never a stack-shaped string.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Interactive } from '../interactive/Interactive';

import { AlertLevelBadge } from '../alerts/AlertLevelBadge';
import { StatusVerdict } from './StatusVerdict';
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
  /**
   * The loader's diagnostic. It is accepted for call-site compatibility and debugging, but
   * never rendered: it can be non-null after a successful snapshot fallback, so printing it
   * would alarm a reader over data the strip has in fact read. The readable states below
   * (`readFailed`, `counts === null`) decide what the reader is told.
   */
  error: string | null;
  coverage: FreshnessCoverage | null;
  /**
   * True only when *nothing* could be read — the loader's `source === 'none'`, i.e. both the
   * live API and the committed snapshot failed.
   *
   * Not `counts === null`, which is what this component used to test. A readable answer can
   * legitimately carry no level ledger (an empty live API, a snapshot written by an older
   * builder), and calling that "the alerts artifact could not be read" told a reader the file
   * was missing when the truth was that the publisher had nothing to report. The two are
   * different sentences and only one of them is alarming.
   */
  readFailed: boolean;
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
  coverage,
  readFailed,
  onRetry,
}) => {
  const { t, formatNumber, isBengali } = useI18n();
  const hazardLabel = useHazardLabel();

  /* The verdict's count answers "how many district advisories are published at WATCH or
     above" — which the artifact's `counts` object states for the whole run. The `alerts`
     prop alone cannot answer it: it is the strip's top-N slice (the page slices to 4
     before this component sees it), and counting it would understate the run — exactly
     the error the honesty rules are written against. The max of the two is safe in both
     directions: the counts state the ledger, and an alert the list actually carries must
     never be rendered as unpublished. */
  const publishableInCounts =
    counts !== null && counts !== undefined ? (counts.WATCH ?? 0) + (counts.WARNING ?? 0) + (counts.SEVERE ?? 0) : 0;
  const published = Math.max(publishableInCounts, alerts.length);
  const ageHours = ageHoursFrom(generatedAt);
  const coverageText =
    coverage?.districts_covered != null && coverage?.districts_expected != null
      ? `${formatNumber(coverage.districts_covered)} / ${formatNumber(coverage.districts_expected)}`
      : null;

  return (
    <Interactive.Section
      name="Live status strip — published now"
      role="status"
      aria-live="polite"
      aria-label={t('frontdoor.strip.label')}
      className="overflow-hidden rounded-2xl border border-carbon-20 bg-carbon-05"
      data-testid="front-door-status-strip"
    >
      {/* The answer first: one sentence, before the counts that support it. The counts are not
          removed — they are the evidence a reader can check — but nothing has to be assembled
          from them to learn whether the day is quiet. */}
      <StatusVerdict
        published={published}
        worstLevel={LEVEL_ORDER.filter((level) => (counts?.[level] ?? 0) > 0)[0] ?? null}
        assessed={assessed}
        withheld={withheld}
        loading={loading}
        unread={!loading && readFailed}
        generatedAt={generatedAt}
      />

      <div className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 lg:p-6">
        {/* ── level counts ─────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">
            {t('frontdoor.strip.publishedNow')}
          </p>
          {loading && (
            <p className="text-sm leading-[1.55] text-carbon-60 sm:text-xs sm:leading-[1.5]">
              {t('frontdoor.strip.reading')}
            </p>
          )}

          {!loading && readFailed && (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 break-words text-sm leading-[1.55] text-carbon-70 sm:text-xs sm:leading-relaxed">
                {t('frontdoor.strip.unreadable')}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-carbon-20 bg-white px-3 py-1 text-sm font-semibold text-carbon-80 hover:bg-carbon-05 sm:text-xs"
                >
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}

          {/* Read successfully, but the answer carried no level ledger: say that, rather than
              borrowing the alarm of an unreadable file. */}
          {!loading && !readFailed && counts === null && (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 break-words text-sm leading-[1.55] text-carbon-70 sm:text-xs sm:leading-relaxed">
                {t('frontdoor.strip.noLedger')}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-carbon-20 bg-white px-3 py-1 text-sm font-semibold text-carbon-80 hover:bg-carbon-05 sm:text-xs"
                >
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}

          {!loading && counts !== null && (
            <ul data-testid="strip-counts" className="flex flex-wrap items-center gap-2">
              {LEVEL_ORDER.filter((level) => counts[level] != null).map((level) => (
                <li key={level} className="flex items-center gap-1.5">
                  <AlertLevelBadge
                    level={level}
                    label={t(`alerts.level.${level}`)}
                    description={t(`alerts.level.${level}.desc`)}
                    size="sm"
                    srPrefix={t('alerts.levelLabel')}
                    role=""
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
        <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-xs text-carbon-70 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <dt className="min-w-0 font-mono text-xs uppercase tracking-wide text-carbon-60 [overflow-wrap:anywhere]">
              {t('frontdoor.strip.districts')}
            </dt>
            <dd className="min-w-0 font-mono font-bold leading-relaxed text-carbon-90 [overflow-wrap:anywhere]">
              {coverageText ?? '—'}
              {coverage?.status ? ` (${coverage.status})` : ''}
            </dd>
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <dt className="min-w-0 font-mono text-xs uppercase tracking-wide text-carbon-60 [overflow-wrap:anywhere]">
              {t('frontdoor.strip.assessed')}
            </dt>
            <dd className="min-w-0 font-mono font-bold leading-relaxed text-carbon-90 [overflow-wrap:anywhere]">
              {assessed != null ? formatNumber(assessed) : '—'}
            </dd>
          </div>
          <div className="col-span-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 sm:col-auto">
            <dt className="min-w-0 font-mono text-xs uppercase tracking-wide text-carbon-60 [overflow-wrap:anywhere]">{t('frontdoor.strip.updated')}</dt>
            <dd className="min-w-0 font-mono leading-relaxed text-carbon-80 [overflow-wrap:anywhere]">
              {ageHours != null ? describeAge(ageHours) : '—'}
              {generatedAt ? ` · ${generatedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}
            </dd>
          </div>
        </dl>

        {/* A labelled list, not a navigation landmark - the front door keeps exactly one
            `<nav>` (its table of contents). See the same decision in `pages/FrontDoor.tsx`. */}
        <ul
          aria-label={t('frontdoor.strip.navLabel')}
          className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap"
        >
          <li className="min-w-0">
            <Link
              to="/alerts"
              className="inline-flex min-h-[44px] min-w-0 items-center break-words text-base font-bold leading-snug text-ap-link underline underline-offset-4"
            >
              {t('frontdoor.strip.allAlerts')}
            </Link>
          </li>
          <li className="min-w-0">
            <Link
              to="/live"
              className="inline-flex min-h-[44px] min-w-0 items-center break-words text-base font-bold leading-snug text-ap-link underline underline-offset-4"
            >
              {t('frontdoor.strip.liveMap')}
            </Link>
          </li>
        </ul>
      </div>

      {/* ── the top published alert, or the honest zero ─────────────────────── */}
      {!loading && published > 0 && (
        <div className="border-t border-carbon-20 bg-white px-4 py-2 sm:py-3 md:px-5">
          <ul className="space-y-2">
            {alerts.slice(0, 2).map((alert) => (
              <li
                key={alert.id}
                className="flex min-h-[44px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm"
              >
                <AlertLevelBadge
                  level={alert.level}
                  label={t(`alerts.level.${alert.level}`)}
                  description={t(`alerts.level.${alert.level}.desc`)}
                  size="sm"
                  srPrefix={t('alerts.levelLabel')}
                />
                <Link
                  to={`/alerts/${encodeURIComponent(alert.id)}`}
                  className="inline-flex min-h-[44px] min-w-0 items-center break-words font-bold leading-snug text-ap-link underline underline-offset-2"
                >
                  {alert.district_name ?? t('frontdoor.strip.districtUnnamed')}
                </Link>
                {alert.hazard_type && (
                  <span className="break-words text-sm leading-snug text-carbon-70 sm:text-xs">
                    {hazardLabel(alert.hazard_type)}
                  </span>
                )}
                {alert.target_date && (
                  <span className="break-words font-mono text-xs leading-relaxed text-carbon-60">
                    {t('common.targetDate')}: {alert.target_date}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && counts !== null && published === 0 && (
        <p className="min-w-0 break-words border-t border-carbon-20 bg-white px-4 py-3 text-base leading-[1.62] text-carbon-70 lg:px-6">
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
          <Link to="/status" className="font-bold text-ap-link underline underline-offset-2">
            {t('frontdoor.strip.whyHeld')}
          </Link>
        </p>
      )}

    </Interactive.Section>
  );
};

export default LiveStatusStrip;
