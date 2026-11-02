import React, { useId, useMemo, useState } from 'react';
import { AlertLevelBadge, ADVISORY_TIER_COLOURS } from '../alerts/AlertLevelBadge';
import { HazardGlyph } from '../apple/HazardGlyph';
import { useI18n } from '../../hooks/useI18n';
import { hazardLabel } from '../../hooks/useHazardLabel';
import {
  severityIndexOf,
  summarizeContinuous15Days,
  type DailyAdvisory,
} from '../../lib/dailyAdvisories';

export interface Continuous15DayTrajectoryProps {
  advisories: DailyAdvisory[];
  /** When true, day cells and peak pills anchor-scroll to `#day-YYYY-MM-DD` on the page. */
  interactiveAnchors?: boolean;
}

/**
 * Cupertino Precision 15-day continuous district output strip:
 * - Highlights peak severe date(s) (unique peak or tied maximum-severity dates)
 * - Displays every continuous day (Days 1–15) with its 0–100 Severity Index,
 *   proportional severity bar, hazard class, and published 5-tier level.
 */
export const Continuous15DayTrajectory: React.FC<Continuous15DayTrajectoryProps> = ({
  advisories,
  interactiveAnchors = false,
}) => {
  const { language, t, formatDate, formatNumber } = useI18n();
  const filterSelectId = useId();
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const summary = useMemo(() => summarizeContinuous15Days(advisories), [advisories]);

  if (summary.days.length === 0) return null;

  const fmt2 = (val: number) => formatNumber(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { days, peakRows, peakDateSet, primaryPeak } = summary;
  const filteredDays =
    selectedDayFilter === 'all'
      ? days
      : selectedDayFilter === 'peak'
        ? peakRows
        : days.filter((row) => String(row.forecastDay) === selectedDayFilter);

  const jumpToDate = (targetDate: string) => {
    if (!interactiveAnchors || typeof document === 'undefined') return;
    const el = document.getElementById(`day-${targetDate}`);
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section
      aria-label={t('daily.continuous15Heading')}
      data-testid="continuous-15day-trajectory"
      className="space-y-4 rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] p-4 sm:p-5 text-[var(--ap-label)]"
    >
      {/* Peak Severe Date(s) Highlight Callout */}
      {peakRows.length > 0 && primaryPeak && (
        <div
          data-testid="peak-severe-banner"
          className="rounded-xl border-2 bg-[var(--ap-canvas)] p-3.5 sm:p-4 space-y-2.5"
          style={{ borderColor: ADVISORY_TIER_COLOURS[primaryPeak.tier] ?? ADVISORY_TIER_COLOURS.WATCH }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--ap-label-secondary)]">
                {peakRows.length === 1 ? t('daily.peakBannerSingle') : t('daily.peakBannerMultiple')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {peakRows.map((pRow) =>
                  interactiveAnchors ? (
                    <button
                      key={pRow.targetDate}
                      type="button"
                      onClick={() => jumpToDate(pRow.targetDate)}
                      className="ap-focusable inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] px-3 py-1.5 text-sm font-bold tabular-nums text-[var(--ap-label)] underline underline-offset-4 cursor-pointer"
                    >
                      <time dateTime={pRow.targetDate}>{formatDate(pRow.targetDate)}</time>
                      <span className="text-xs font-medium text-[var(--ap-label-secondary)]">
                        (D{formatNumber(pRow.forecastDay)})
                      </span>
                    </button>
                  ) : (
                    <span
                      key={pRow.targetDate}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] px-2.5 py-1 text-sm font-bold tabular-nums text-[var(--ap-label)]"
                    >
                      <time dateTime={pRow.targetDate}>{formatDate(pRow.targetDate)}</time>
                      <span className="text-xs font-medium text-[var(--ap-label-secondary)]">
                        (D{formatNumber(pRow.forecastDay)})
                      </span>
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ap-label)]">
                <HazardGlyph hazard={primaryPeak.hazard} size={18} />
                <span>{hazardLabel(primaryPeak.hazard, language)}</span>
              </div>
              <AlertLevelBadge
                level={primaryPeak.tier}
                label={t(`alerts.tier.${primaryPeak.tier}`)}
                size="md"
              />
              <div className="text-right tabular-nums">
                <div className="text-xs text-[var(--ap-label-secondary)]">{t('daily.severityIndex')}</div>
                <div className="text-base font-bold text-[var(--ap-label)]">
                  {formatNumber(severityIndexOf(primaryPeak.severityScore))}/100{' '}
                  <span className="text-xs font-medium text-[var(--ap-label-secondary)]">
                    ({fmt2(primaryPeak.severityScore)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header + Optional Day 1–15 Picker for 15-Day Continuous Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ap-label)]">
            {t('daily.continuous15Heading')} ({formatNumber(days.length)})
          </h3>
          <p className="text-xs text-[var(--ap-label-secondary)]">{t('daily.continuous15Sub')}</p>
        </div>
        <label
          htmlFor={filterSelectId}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ap-label-secondary)]"
        >
          <span>{t('daily.filterLabel')}</span>
          <select
            id={filterSelectId}
            data-testid="trajectory-day-picker"
            value={selectedDayFilter}
            onChange={(e) => setSelectedDayFilter(e.target.value)}
            className="ap-focusable min-h-[44px] rounded-lg border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] px-3 py-1.5 text-xs font-semibold text-[var(--ap-label)]"
          >
            <option value="all">{t('daily.filterAll')}</option>
            {peakRows.length > 0 && <option value="peak">{t('daily.filterPeak')}</option>}
            {days.map((row) => (
              <option key={row.advisoryId} value={String(row.forecastDay)}>
                {t('daily.filterDay', {
                  day: formatNumber(row.forecastDay),
                  date: formatDate(row.targetDate),
                })}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 15-Day Continuous Grid: 2 cols on narrow phones, 5 cols × 3 rows on >=640px */}
      <ol
        aria-label={t('daily.continuous15Heading')}
        className="grid grid-cols-2 sm:grid-cols-5 gap-2"
      >
        {filteredDays.map((row) => {
          const isPeak = peakDateSet.has(row.targetDate);
          const sevIndex = severityIndexOf(row.severityScore);
          const tierColour = ADVISORY_TIER_COLOURS[row.tier] ?? ADVISORY_TIER_COLOURS.NORMAL;
          const cellInner = (
            <>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold tabular-nums text-[var(--ap-label-secondary)]">
                  D{formatNumber(row.forecastDay)}
                </span>
                {isPeak && (
                  <span className="rounded border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] px-1.5 py-0.5 text-xs font-bold text-[var(--ap-label)]">
                    {t('daily.peakBadge')}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs font-semibold tabular-nums text-[var(--ap-label)] truncate">
                <time dateTime={row.targetDate}>{formatDate(row.targetDate)}</time>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-1 tabular-nums">
                <span className="text-sm font-bold text-[var(--ap-label)]">
                  {formatNumber(sevIndex)}
                  <span className="text-xs font-normal text-[var(--ap-label-secondary)]">/100</span>
                </span>
                <span className="text-xs font-medium text-[var(--ap-label-secondary)] truncate">
                  {t(`alerts.tier.${row.tier}`)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ap-separator-opaque)]"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, sevIndex)}%`,
                    backgroundColor: tierColour,
                  }}
                />
              </div>
              <div className="mt-1 text-xs text-[var(--ap-label-secondary)] truncate">
                {hazardLabel(row.hazard, language)}
              </div>
            </>
          );

          return (
            <li
              key={row.advisoryId}
              data-forecast-day={row.forecastDay}
              data-peak={isPeak ? 'true' : undefined}
              className={`rounded-lg p-2.5 transition-colors ${
                isPeak
                  ? 'border-2 bg-[var(--ap-canvas)] shadow-2xs'
                  : 'border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)]/70'
              }`}
              style={isPeak ? { borderColor: tierColour } : undefined}
            >
              {interactiveAnchors ? (
                <button
                  type="button"
                  onClick={() => jumpToDate(row.targetDate)}
                  aria-label={`Day ${row.forecastDay}, ${formatDate(row.targetDate)}, ${hazardLabel(row.hazard, language)}, ${t('daily.severityIndex')} ${sevIndex} of 100${isPeak ? `, ${t('daily.peakBannerSingle')}` : ''}`}
                  className="ap-focusable block w-full min-h-[44px] text-left cursor-pointer"
                >
                  {cellInner}
                </button>
              ) : (
                <div>{cellInner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default Continuous15DayTrajectory;
