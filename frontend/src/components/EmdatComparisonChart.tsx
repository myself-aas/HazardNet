/**
 * EM-DAT observed record vs HazardNet detection benchmark (2000–2026).
 *
 * This panel used to be a 160px grey box containing the words "Interactive
 * EM-DAT Comparison Chart (Authorized Researcher View)". The caption promised a
 * chart; nothing behind it had ever been built.
 *
 * What it can honestly show, and what it must not
 * ------------------------------------------------
 * Two datasets exist and they are NOT the same kind of thing, so they are drawn
 * as two different marks rather than two lines inviting a skill comparison:
 *
 *   • The observed record — 3,062 catalogued events, 2000–2026, aggregated to
 *     an annual count. This is the EM-DAT-derived side and it spans every year.
 *
 *   • The detection benchmark — five episodes (2020, 2021, 2023, 2024, 2025)
 *     from model-performance.json, each scored as "districts named by the
 *     record" vs "districts HazardNet flagged".
 *
 * model-performance.json states its own limits in `how_to_read`, and they are
 * binding on this chart: the counts are "detection counts against recorded
 * historical events, not a forecast-skill estimate", and "five episodes is far
 * too small to support a skill claim". So the episodes are plotted as discrete
 * annotated markers against the year axis — never interpolated into a line,
 * never expressed as an accuracy percentage, and the caveats are rendered on
 * the panel rather than buried in a tooltip. A reader should not be able to
 * take a skill claim away from this chart, because the data cannot support one.
 *
 * Colour never carries meaning alone (WCAG 1.4.1): every series is labelled in
 * the legend, every marker has an aria-label, and the whole chart has a
 * `<table>` text alternative for screen readers and for printing.
 */
import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';

export interface EmdatEventRecord {
  year: number;
  hazard_type: string;
}

export interface EmdatEpisode {
  id: string;
  title: string;
  hazard_class: string;
  onset_date: string;
  detection: {
    named_districts: number;
    flagged_any_class: number;
  };
}

export interface EmdatComparisonChartProps {
  events: EmdatEventRecord[];
  episodes: EmdatEpisode[];
  /** Verbatim caveats from model-performance.json `how_to_read`. */
  caveats?: string[];
  className?: string;
}

interface YearBucket {
  year: number;
  count: number;
}

const WIDTH = 860;
const HEIGHT = 340;
const PAD = { top: 28, right: 24, bottom: 46, left: 56 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

/** A tick count that lands on round numbers for whatever the peak year is. */
const niceMax = (max: number): number => {
  if (max <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / pow) * pow;
};

export const EmdatComparisonChart: React.FC<EmdatComparisonChartProps> = ({
  events,
  episodes,
  caveats = [],
  className = '',
}) => {
  const [hovered, setHovered] = useState<YearBucket | null>(null);

  const buckets = useMemo<YearBucket[]>(() => {
    const by = new Map<number, number>();
    for (const e of events) {
      if (!Number.isFinite(e.year)) continue;
      by.set(e.year, (by.get(e.year) ?? 0) + 1);
    }
    return [...by.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
  }, [events]);

  const minYear = buckets[0]?.year ?? 2000;
  const maxYear = buckets[buckets.length - 1]?.year ?? 2026;
  const span = Math.max(1, maxYear - minYear);
  const yMax = niceMax(Math.max(...buckets.map((b) => b.count), 1));

  const xOf = (year: number) => PAD.left + ((year - minYear) / span) * INNER_W;
  const yOf = (value: number) => PAD.top + INNER_H - (value / yMax) * INNER_H;
  // One bar per year, with a gutter, so 26 bars never collide.
  const barW = Math.max(4, (INNER_W / (span + 1)) * 0.62);

  const marks = useMemo(
    () =>
      episodes
        .map((ep) => {
          const year = Number(ep.onset_date?.slice(0, 4));
          const named = ep.detection?.named_districts ?? 0;
          const flagged = ep.detection?.flagged_any_class ?? 0;
          return { ep, year, named, flagged };
        })
        .filter((m) => Number.isFinite(m.year) && m.year >= minYear && m.year <= maxYear),
    [episodes, minYear, maxYear],
  );

  // Deduped: on a very small record (or an empty one) the quarter fractions
  // round onto the same integer and React sees duplicate keys.
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f)))];
  const yearLabels = buckets.filter((_, i) => i % 3 === 0 || i === buckets.length - 1);

  return (
    <figure className={`m-0 ${className}`} data-testid="emdat-comparison-chart">
      {/* Legend. Every series is named in text, so colour is never the only cue. */}
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-ap-link" aria-hidden="true" />
          <span className="font-medium text-carbon-80">Catalogued events per year</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rotate-45 border border-severity-moderate bg-severity-moderate-surface"
            aria-hidden="true"
          />
          <span className="font-medium text-carbon-80">Benchmarked episode (detection only)</span>
        </span>
        <span className="font-mono text-carbon-60">
          {events.length.toLocaleString()} events · {minYear}–{maxYear}
        </span>
      </figcaption>

      <div className="relative w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-carbon-20/90 bg-carbon-05/60 p-2">
        {hovered && (
          <div
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border border-carbon-20 bg-surface-page px-3 py-1.5 text-xs shadow-md"
          >
            <span className="font-mono font-bold text-carbon-90">{hovered.year}</span>
            <span className="ml-2 text-carbon-70">
              {hovered.count.toLocaleString()} catalogued event{hovered.count === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {/* svg-user-units: the viewBox is 0 0 860 340 and `min-w-[860px]` stops the
            element ever rendering narrower than the viewBox, so one user unit is
            never smaller than one CSS px. Axis labels at `text-xs` therefore render
            at 12px or larger at every width (exactly 12px at 860px, 16.8px at
            1200px) and clear the legibility floor in
            __tests__/designTypography.test.js. Below 860px the figure scrolls
            horizontally rather than shrinking the type. */}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full min-w-[860px]"
          role="img"
          aria-label={`Catalogued hazard events per year from ${minYear} to ${maxYear}, with ${marks.length} benchmarked detection episodes marked.`}
        >
          {/* Gridlines + y axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yOf(t)}
                y2={yOf(t)}
                className="stroke-carbon-20"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={yOf(t) + 4}
                textAnchor="end"
                className="fill-carbon-60 font-mono text-xs"
              >
                {t}
              </text>
            </g>
          ))}

          {/* Observed record */}
          {buckets.map((b) => {
            const h = Math.max(1, PAD.top + INNER_H - yOf(b.count));
            return (
              <rect
                key={b.year}
                x={xOf(b.year) - barW / 2}
                y={yOf(b.count)}
                width={barW}
                height={h}
                rx={2}
                className={`transition-opacity ${
                  hovered && hovered.year !== b.year ? 'opacity-40' : 'opacity-100'
                } fill-ap-link`}
                onMouseEnter={() => setHovered(b)}
                onMouseLeave={() => setHovered(null)}
                tabIndex={0}
                role="button"
                aria-label={`${b.year}: ${b.count} catalogued events`}
                onFocus={() => setHovered(b)}
                onBlur={() => setHovered(null)}
              />
            );
          })}

          {/* Benchmarked episodes — discrete marks, deliberately not a series. */}
          {marks.map((m) => {
            const x = xOf(m.year);
            const y = PAD.top + 6;
            return (
              <g key={m.ep.id}>
                <line
                  x1={x}
                  x2={x}
                  y1={y}
                  y2={PAD.top + INNER_H}
                  className="stroke-severity-moderate"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <rect
                  x={x - 5}
                  y={y - 5}
                  width={10}
                  height={10}
                  transform={`rotate(45 ${x} ${y})`}
                  className="fill-severity-moderate-surface stroke-severity-moderate"
                  strokeWidth={1.5}
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.ep.title}. Detection only: ${m.flagged} of ${m.named} named districts flagged.`}
                />
              </g>
            );
          })}

          {/* x axis */}
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + INNER_H}
            y2={PAD.top + INNER_H}
            className="stroke-carbon-30"
            strokeWidth={1}
          />
          {yearLabels.map((b) => (
            <text
              key={b.year}
              x={xOf(b.year)}
              y={PAD.top + INNER_H + 20}
              textAnchor="middle"
              className="fill-carbon-60 font-mono text-xs"
            >
              {b.year}
            </text>
          ))}
        </svg>
      </div>

      {/* Episode detail. The numbers are counts, never a percentage. */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {marks.map((m) => (
          <li
            key={m.ep.id}
            className="flex items-baseline justify-between gap-3 rounded-xl border border-carbon-20/90 bg-surface-page px-3 py-2"
          >
            <span className="min-w-0 truncate text-xs font-medium text-carbon-80" title={m.ep.title}>
              {m.ep.title}
            </span>
            <span className="shrink-0 font-mono text-xs text-carbon-60">
              {m.flagged}/{m.named} districts
            </span>
          </li>
        ))}
      </ul>

      {caveats.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            How to read this
          </p>
          <ul className="mt-1.5 space-y-1">
            {caveats.map((c) => (
              <li key={c} className="text-xs leading-relaxed text-amber-900">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Text alternative. A chart that only exists as pixels is unreadable to a
          screen reader and useless in the PDF export. */}
      <table className="sr-only">
        <caption>Catalogued hazard events per year, {minYear} to {maxYear}</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Catalogued events</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.year}>
              <th scope="row">{b.year}</th>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

export default EmdatComparisonChart;
