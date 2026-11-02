import React, { useId, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { AlertLevelBadge, ADVISORY_TIER_COLOURS } from '../alerts/AlertLevelBadge';
import { HazardGlyph } from '../apple/HazardGlyph';
import { CardStackRows, type CardStackRow } from '../ui/CardStackTable';
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

type ChartMode = 'severity' | 'weather' | 'confidence';
type TableSort = 'day' | 'severity' | 'rain' | 'temp';

/**
 * Cupertino Precision 15-day continuous district trajectory studio:
 * - Highlights Peak Severe Date(s) with 0–100 Severity Index and peak physical forcing
 * - Interactive 3-mode Recharts 15-day visualization (Severity & Rainfall, Temperature & Wind, Confidence & Thresholds)
 * - Optional Day 1–15 / Peak Severe Days timeline filter + 5×3 visual spark-bar grid
 * - Sortable responsive 15-day daily forecast & weather table (desktop table + mobile CardStackRows)
 */
export const Continuous15DayTrajectory: React.FC<Continuous15DayTrajectoryProps> = ({
  advisories,
  interactiveAnchors = false,
}) => {
  const { language, t, formatDate, formatNumber } = useI18n();
  const filterSelectId = useId();
  const sortSelectId = useId();
  const tableHeadingId = useId();
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('severity');
  const [tableSort, setTableSort] = useState<TableSort>('day');

  const summary = useMemo(() => summarizeContinuous15Days(advisories), [advisories]);

  const chartData = useMemo(
    () =>
      summary.days.map((row) => {
        const w = row.weather ?? {};
        const m = row.metrics ?? {};
        const probPct =
          typeof m.confidence === 'number'
            ? Math.round(m.confidence * 100)
            : typeof m.probTop1 === 'number'
              ? Math.round(m.probTop1 * 100)
              : Math.round(row.severityScore * 100);
        return {
          dayLabel: `D${row.forecastDay}`,
          forecastDay: row.forecastDay,
          targetDate: row.targetDate,
          formattedDate: formatDate(row.targetDate),
          severityIndex: severityIndexOf(row.severityScore),
          rainMm: typeof w.precipitationMm === 'number' ? Number(w.precipitationMm.toFixed(1)) : 0,
          tempMaxC: typeof w.temperatureMaxC === 'number' ? Number(w.temperatureMaxC.toFixed(1)) : null,
          tempMinC: typeof w.temperatureMinC === 'number' ? Number(w.temperatureMinC.toFixed(1)) : null,
          windKmh: typeof w.windKmh === 'number' ? Number(w.windKmh.toFixed(1)) : 0,
          probPct,
          tier: row.tier,
          hazard: hazardLabel(row.hazard, language),
          isPeak: summary.peakDateSet.has(row.targetDate),
        };
      }),
    [summary.days, summary.peakDateSet, formatDate, language],
  );

  if (summary.days.length === 0) return null;

  const fmt2 = (val: number) => formatNumber(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt1 = (val: number | undefined | null, suffix = '') =>
    typeof val === 'number' && Number.isFinite(val)
      ? `${formatNumber(val, { maximumFractionDigits: 1 })}${suffix}`
      : '—';

  const { days, peakRows, peakDateSet, primaryPeak } = summary;
  const filteredDays =
    selectedDayFilter === 'all'
      ? days
      : selectedDayFilter === 'peak'
        ? peakRows
        : days.filter((row) => String(row.forecastDay) === selectedDayFilter);

  const sortedTableRows = [...filteredDays].sort((a, b) => {
    if (tableSort === 'severity') {
      return b.severityScore - a.severityScore || a.forecastDay - b.forecastDay;
    }
    if (tableSort === 'rain') {
      return (b.weather?.precipitationMm ?? -1) - (a.weather?.precipitationMm ?? -1) || a.forecastDay - b.forecastDay;
    }
    if (tableSort === 'temp') {
      return (b.weather?.temperatureMaxC ?? -99) - (a.weather?.temperatureMaxC ?? -99) || a.forecastDay - b.forecastDay;
    }
    return a.forecastDay - b.forecastDay;
  });

  const mobileStackRows: CardStackRow[] = sortedTableRows.map((row) => {
    const isPeak = peakDateSet.has(row.targetDate);
    const sevIdx = severityIndexOf(row.severityScore);
    const w = row.weather ?? {};
    const m = row.metrics ?? {};
    const topProb =
      typeof m.confidence === 'number'
        ? `${formatNumber(Math.round(m.confidence * 100))}%`
        : typeof m.probTop1 === 'number'
          ? `${formatNumber(Math.round(m.probTop1 * 100))}%`
          : '—';
    return {
      key: row.advisoryId,
      heading: (
        <span className="inline-flex flex-wrap items-center gap-2 tabular-nums">
          <span>D{formatNumber(row.forecastDay)} · {formatDate(row.targetDate)}</span>
          {isPeak && (
            <span className="rounded border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] px-1.5 py-0.5 text-xs font-bold">
              {t('daily.peakBadge')}
            </span>
          )}
        </span>
      ),
      fields: [
        { label: t('daily.colTier'), value: t(`alerts.tier.${row.tier}`) },
        { label: t('daily.severityIndex'), value: `${formatNumber(sevIdx)}/100 (${fmt2(row.severityScore)})` },
        { label: t('daily.colHazard'), value: hazardLabel(row.hazard, language) },
        { label: t('daily.colRain'), value: fmt1(w.precipitationMm, ' mm') },
        {
          label: t('daily.colTemp'),
          value:
            typeof w.temperatureMaxC === 'number' || typeof w.temperatureMinC === 'number'
              ? `${fmt1(w.temperatureMaxC, '°')} / ${fmt1(w.temperatureMinC, '°')}`
              : '—',
        },
        { label: t('daily.colWind'), value: fmt1(w.windKmh, ' km/h') },
        { label: t('daily.colProb'), value: topProb },
      ],
    };
  });

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

  const peakChartLabel = primaryPeak ? `D${primaryPeak.forecastDay}` : null;

  return (
    <section
      aria-label={t('daily.continuous15Heading')}
      data-testid="continuous-15day-trajectory"
      className="space-y-5 rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] p-4 sm:p-5 text-[var(--ap-label)]"
    >
      {/* 1. Peak Severe Date(s) Highlight Callout */}
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

          {primaryPeak.weather && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--ap-separator-opaque)] pt-2 text-xs tabular-nums text-[var(--ap-label-secondary)]">
              <span>{t('daily.colRain')}: <strong className="text-[var(--ap-label)]">{fmt1(primaryPeak.weather.precipitationMm, ' mm')}</strong></span>
              <span>{t('daily.colTemp')}: <strong className="text-[var(--ap-label)]">{fmt1(primaryPeak.weather.temperatureMaxC, '°')} / {fmt1(primaryPeak.weather.temperatureMinC, '°')}</strong></span>
              <span>{t('daily.colWind')}: <strong className="text-[var(--ap-label)]">{fmt1(primaryPeak.weather.windKmh, ' km/h')}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* 2. Interactive 15-Day Trajectory Chart */}
      <div
        data-testid="trajectory-15day-chart"
        className="rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] p-3.5 sm:p-4 space-y-3 no-print"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ap-label)]">{t('daily.chartHeading')}</h3>
            <p className="text-xs text-[var(--ap-label-secondary)]">{t('daily.continuous15Sub')}</p>
          </div>
          <div role="group" aria-label={t('daily.chartHeading')} className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['severity', t('daily.chartModeSeverity')],
                ['weather', t('daily.chartModeWeather')],
                ['confidence', t('daily.chartModeConfidence')],
              ] as const
            ).map(([mode, label]) => {
              const active = chartMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setChartMode(mode)}
                  className={`ap-focusable min-h-[44px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--ap-primary)] bg-[var(--ap-bg-grouped)] text-[var(--ap-label)]'
                      : 'border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] text-[var(--ap-label-secondary)] hover:text-[var(--ap-label)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'severity' ? (
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="hnSevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--ap-tint-orange)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--ap-tint-orange)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator-opaque)" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 12 }} stroke="var(--ap-label-secondary)" />
                <YAxis
                  yAxisId="sev"
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  stroke="var(--ap-label-secondary)"
                />
                <YAxis
                  yAxisId="rain"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  unit="mm"
                  stroke="var(--ap-tint-blue)"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    backgroundColor: 'var(--ap-canvas)',
                    borderColor: 'var(--ap-separator-opaque)',
                    color: 'var(--ap-label)',
                  }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${item.dayLabel} · ${item.formattedDate} (${item.hazard})` : '';
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine yAxisId="sev" y={40} stroke="var(--ap-tint-orange)" strokeDasharray="4 4" />
                <ReferenceLine yAxisId="sev" y={70} stroke="var(--ap-tint-red)" strokeDasharray="4 4" />
                {peakChartLabel && (
                  <ReferenceLine x={peakChartLabel} yAxisId="sev" stroke="var(--ap-primary)" strokeWidth={2} />
                )}
                <Bar
                  yAxisId="rain"
                  dataKey="rainMm"
                  name={t('daily.colRain')}
                  fill="var(--ap-tint-blue)"
                  opacity={0.65}
                  radius={[3, 3, 0, 0]}
                />
                <Area
                  yAxisId="sev"
                  type="monotone"
                  dataKey="severityIndex"
                  name={t('daily.severityIndex')}
                  stroke="var(--ap-tint-orange)"
                  fill="url(#hnSevGrad)"
                  strokeWidth={2.5}
                />
              </ComposedChart>
            ) : chartMode === 'weather' ? (
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator-opaque)" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 12 }} stroke="var(--ap-label-secondary)" />
                <YAxis
                  yAxisId="temp"
                  tick={{ fontSize: 12 }}
                  unit="°"
                  stroke="var(--ap-tint-red)"
                />
                <YAxis
                  yAxisId="wind"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  unit="km/h"
                  stroke="var(--ap-tint-purple)"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    backgroundColor: 'var(--ap-canvas)',
                    borderColor: 'var(--ap-separator-opaque)',
                    color: 'var(--ap-label)',
                  }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${item.dayLabel} · ${item.formattedDate}` : '';
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {peakChartLabel && (
                  <ReferenceLine x={peakChartLabel} yAxisId="temp" stroke="var(--ap-primary)" strokeWidth={2} />
                )}
                <Bar
                  yAxisId="wind"
                  dataKey="windKmh"
                  name={t('daily.colWind')}
                  fill="var(--ap-tint-purple)"
                  opacity={0.5}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMaxC"
                  name="Max °C"
                  stroke="var(--ap-tint-red)"
                  strokeWidth={2.5}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMinC"
                  name="Min °C"
                  stroke="var(--ap-tint-blue)"
                  strokeDasharray="4 3"
                  strokeWidth={2}
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator-opaque)" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 12 }} stroke="var(--ap-label-secondary)" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" stroke="var(--ap-label-secondary)" />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    backgroundColor: 'var(--ap-canvas)',
                    borderColor: 'var(--ap-separator-opaque)',
                    color: 'var(--ap-label)',
                  }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${item.dayLabel} · ${item.formattedDate}` : '';
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={40} stroke="var(--ap-tint-orange)" strokeDasharray="4 4" />
                <ReferenceLine y={70} stroke="var(--ap-tint-red)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="probPct"
                  name={t('daily.colProb')}
                  stroke="var(--ap-tint-green)"
                  strokeWidth={2.5}
                />
                <Line
                  type="monotone"
                  dataKey="severityIndex"
                  name={t('daily.severityIndex')}
                  stroke="var(--ap-tint-orange)"
                  strokeWidth={2}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Header + Optional Day 1–15 Picker & Sort Control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ap-label)]">
            {t('daily.continuous15Heading')} ({formatNumber(days.length)})
          </h3>
          <p className="text-xs text-[var(--ap-label-secondary)]">{t('daily.continuous15Sub')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <label
            htmlFor={sortSelectId}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ap-label-secondary)]"
          >
            <span>{t('daily.sortLabel')}</span>
            <select
              id={sortSelectId}
              data-testid="trajectory-sort-picker"
              value={tableSort}
              onChange={(e) => setTableSort(e.target.value as TableSort)}
              className="ap-focusable min-h-[44px] rounded-lg border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] px-3 py-1.5 text-xs font-semibold text-[var(--ap-label)]"
            >
              <option value="day">{t('daily.sortDay')}</option>
              <option value="severity">{t('daily.sortSeverity')}</option>
              <option value="rain">{t('daily.sortRain')}</option>
              <option value="temp">{t('daily.sortTemp')}</option>
            </select>
          </label>
        </div>
      </div>

      {/* 4. 15-Day Continuous Grid: 2 cols on narrow phones, 5 cols × 3 rows on >=640px */}
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
                cellInner
              )}
            </li>
          );
        })}
      </ol>

      {/* 5. Responsive 15-Day Daily Forecast & Weather Table */}
      <div
        data-testid="trajectory-15day-table"
        className="rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] overflow-hidden"
      >
        <div className="border-b border-[var(--ap-separator-opaque)] px-4 py-3">
          <h3 id={tableHeadingId} className="text-sm font-semibold text-[var(--ap-label)]">
            {t('daily.tableHeading')}
          </h3>
        </div>

        <CardStackRows rows={mobileStackRows} labelledBy={tableHeadingId} />

        <div className="hidden md:block overflow-x-auto">
          <table aria-labelledby={tableHeadingId} className="w-full text-left text-xs tabular-nums">
            <thead className="border-b border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] text-[var(--ap-label-secondary)]">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('daily.colDay')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('daily.colDate')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('daily.colTier')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('daily.severityIndex')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('daily.colHazard')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-right">{t('daily.colRain')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-right">{t('daily.colTemp')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-right">{t('daily.colWind')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-right">{t('daily.colProb')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ap-separator-opaque)] text-[var(--ap-label)]">
              {sortedTableRows.map((row) => {
                const isPeak = peakDateSet.has(row.targetDate);
                const sevIdx = severityIndexOf(row.severityScore);
                const w = row.weather ?? {};
                const m = row.metrics ?? {};
                const topProb =
                  typeof m.confidence === 'number'
                    ? `${formatNumber(Math.round(m.confidence * 100))}%`
                    : typeof m.probTop1 === 'number'
                      ? `${formatNumber(Math.round(m.probTop1 * 100))}%`
                      : '—';
                return (
                  <tr
                    key={row.advisoryId}
                    data-table-day={row.forecastDay}
                    data-table-peak={isPeak ? 'true' : undefined}
                    className={isPeak ? 'bg-[var(--ap-bg-grouped)] font-semibold' : undefined}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span>D{formatNumber(row.forecastDay)}</span>
                      {isPeak && (
                        <span className="ml-1.5 rounded border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] px-1.5 py-0.5 text-xs font-bold">
                          {t('daily.peakBadge')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <time dateTime={row.targetDate}>{formatDate(row.targetDate)}</time>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <AlertLevelBadge level={row.tier} label={t(`alerts.tier.${row.tier}`)} size="sm" />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-bold">
                      {formatNumber(sevIdx)}/100{' '}
                      <span className="font-normal text-[var(--ap-label-secondary)]">({fmt2(row.severityScore)})</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{hazardLabel(row.hazard, language)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">{fmt1(w.precipitationMm, ' mm')}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      {typeof w.temperatureMaxC === 'number' || typeof w.temperatureMinC === 'number'
                        ? `${fmt1(w.temperatureMaxC, '°')} / ${fmt1(w.temperatureMinC, '°')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">{fmt1(w.windKmh, ' km/h')}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">{topProb}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
