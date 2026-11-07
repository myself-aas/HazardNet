import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { analyzeDailySnapshot, type CategoryCount, type ReportAnalysis } from '../lib/reportAnalysis';
import type { DailyAdvisory, DailySnapshot } from '../lib/reports';

/**
 * Render the verified daily report Markdown plus snapshot-bound analysis.
 *
 * Template directives supported in archived report files:
 *   {{chart:tier-distribution}}
 *   {{chart:hazard-distribution}}
 *   {{chart:severity-by-division}}
 *   {{chart:severity-distribution}}
 *   {{chart:severity-by-date}}
 *   {{chart:hazard-by-division}}
 *   {{table:top-advisories}}
 *
 * A chart is shown only when the source snapshot date and run ID match the report. Older
 * Markdown remains readable: its committed tables stay visible and an explanation replaces
 * any figure whose original snapshot is no longer available.
 */

const TIER_FILL: Record<string, string> = {
  EMERGENCY: 'var(--color-rose-600)',
  SEVERE: 'var(--color-rose-600)',
  WARNING: 'var(--color-orange-600)',
  WATCH: 'var(--color-amber-600)',
  ADVISORY: 'var(--ap-link)',
  NORMAL: 'var(--color-emerald-600)',
  'NOT RECORDED': 'var(--ap-n-50)',
};

const HAZARD_PALETTE = [
  'var(--ap-link)',
  'var(--color-amber-600)',
  'var(--color-rose-600)',
  'var(--color-emerald-600)',
  'var(--color-violet-600)',
  'var(--color-cyan-600)',
  'var(--color-pink-600)',
  'var(--color-lime-600)',
];

export interface ReportHeading {
  id: string;
  text: string;
  level: number;
}

type Block =
  | { kind: 'markdown'; text: string; headings: ReportHeading[] }
  | { kind: 'directive'; name: string }
  | { kind: 'callout'; tone: string; text: string; headings: ReportHeading[] };

function plainMarkdownText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_~]/g, '')
    .trim();
}

export function slugifyReportHeading(text: string): string {
  const slug = plainMarkdownText(text)
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-');
  return slug || 'section';
}

function headingsForMarkdown(text: string, used: Map<string, number>): ReportHeading[] {
  const headings: ReportHeading[] = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const level = match[1].length;
    if (level === 1) continue;
    const headingText = plainMarkdownText(match[2]);
    const base = slugifyReportHeading(headingText);
    const occurrence = used.get(base) ?? 0;
    used.set(base, occurrence + 1);
    headings.push({
      id: occurrence === 0 ? base : `${base}-${occurrence}`,
      text: headingText,
      level,
    });
  }
  return headings;
}

export function parseReportBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  const usedHeadingIds = new Map<string, number>();
  let buffer: string[] = [];
  let callout: { tone: string; lines: string[] } | null = null;
  let fenced = false;

  const addMarkdown = (value: string) => {
    if (!value.trim()) return;
    blocks.push({ kind: 'markdown', text: value, headings: headingsForMarkdown(value, usedHeadingIds) });
  };
  const flush = () => {
    addMarkdown(buffer.join('\n'));
    buffer = [];
  };

  for (const line of lines) {
    if (callout) {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        callout.lines.push(line);
        continue;
      }
      if (!fenced && line.trim() === ':::') {
        const text = callout.lines.join('\n').trim();
        blocks.push({ kind: 'callout', tone: callout.tone, text, headings: headingsForMarkdown(text, usedHeadingIds) });
        callout = null;
      } else {
        callout.lines.push(line);
      }
      continue;
    }

    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      buffer.push(line);
      continue;
    }
    if (fenced) {
      buffer.push(line);
      continue;
    }

    const calloutOpen = line.match(/^:::(info|warning|danger)\s*$/);
    if (calloutOpen) {
      flush();
      callout = { tone: calloutOpen[1], lines: [] };
      continue;
    }
    const directive = line.match(/^\{\{(\w[\w:-]*)\}\}\s*$/);
    if (directive) {
      flush();
      blocks.push({ kind: 'directive', name: directive[1] });
      continue;
    }
    buffer.push(line);
  }

  flush();
  if (callout) {
    const text = callout.lines.join('\n').trim();
    blocks.push({ kind: 'callout', tone: callout.tone, text, headings: headingsForMarkdown(text, usedHeadingIds) });
  }
  return blocks;
}

function hasSection(headings: ReportHeading[], expression: RegExp): boolean {
  return headings.some((heading) => expression.test(heading.text));
}

function isSnapshotForReport(snapshot: DailySnapshot | null, reportDate?: string, reportRunId?: string): snapshot is DailySnapshot {
  if (!snapshot || !reportDate) return false;
  const snapshotDate = typeof snapshot.run?.generatedAt === 'string' ? snapshot.run.generatedAt.slice(0, 10) : '';
  if (snapshotDate !== reportDate) return false;
  return !reportRunId || snapshot.run.id === reportRunId;
}

export function buildReportContents(
  markdown: string,
  snapshot: DailySnapshot | null,
  reportDate?: string,
  reportRunId?: string,
): ReportHeading[] {
  const blocks = parseReportBlocks(markdown);
  const headings = blocks.flatMap((block) => block.kind === 'directive' ? [] : block.headings)
    .filter((heading) => heading.level <= 3);
  const allHeadings = blocks.flatMap((block) => block.kind === 'directive' ? [] : block.headings);
  const snapshotMatches = isSnapshotForReport(snapshot, reportDate, reportRunId);

  if (!hasSection(allHeadings, /statistical analysis/i)) {
    headings.push({ id: 'statistical-analysis', text: 'Mathematical and statistical analysis', level: 2 });
    if (snapshotMatches) {
      headings.push(
        { id: 'severity-distribution', text: 'Severity-score distribution', level: 3 },
        { id: 'forecast-horizon', text: 'Mean severity by target date', level: 3 },
        { id: 'hazard-by-division', text: 'Hazard rows by division', level: 3 },
        { id: 'coverage-quality', text: 'Coverage and data quality', level: 3 },
      );
    }
  }
  if (!hasSection(allHeadings, /frequently asked questions|\bfaq\b/i)) {
    headings.push({ id: 'report-faq', text: 'Frequently asked questions', level: 2 });
  }
  return headings;
}

export const ReportTableOfContents: React.FC<{
  markdown: string;
  snapshot: DailySnapshot | null;
  reportDate?: string;
  reportRunId?: string;
}> = ({ markdown, snapshot, reportDate, reportRunId }) => {
  const headings = useMemo(
    () => buildReportContents(markdown, snapshot, reportDate, reportRunId),
    [markdown, snapshot, reportDate, reportRunId],
  );
  if (headings.length === 0) return null;

  const links = (
    <ol className="mt-3 space-y-1 text-ap-body-sm">
      {headings.map((heading) => (
        <li key={heading.id} className={heading.level === 3 ? 'pl-3' : undefined}>
          <a
            href={`#${heading.id}`}
            className="inline-flex min-h-[44px] items-center rounded py-2 text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <details className="mb-8 border-y border-ap-hairline py-2 lg:hidden">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-ap-label-md font-semibold text-ap-label">
          In this report
        </summary>
        <nav aria-label="Report contents">{links}</nav>
      </details>
      <nav aria-label="Report contents" className="hidden lg:block">
        <h2 className="text-ap-label-md font-semibold text-ap-label">In this report</h2>
        {links}
      </nav>
    </>
  );
};

const REPORT_TABLE_CLASS = 'min-w-full border-collapse text-ap-body-sm';

const ReportDataTable: React.FC<{
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}> = ({ caption, headers, rows }) => (
  <div className="report-table-region my-4 overflow-x-auto rounded-md border border-ap-hairline" role="region" aria-label={`${caption} table`} tabIndex={0}>
    <table className={REPORT_TABLE_CLASS}>
      <caption className="sr-only">{caption}</caption>
      <thead className="border-b border-ap-hairline bg-ap-grouped text-left text-ap-label">
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col" className="whitespace-nowrap px-3 py-2 text-ap-label-md font-semibold">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? rows.map((row, index) => (
          <tr key={`${String(row[0])}-${index}`} className="border-b border-ap-hairline last:border-0">
            {row.map((cell, cellIndex) => (
              <td key={`${cellIndex}-${String(cell)}`} className="px-3 py-2 text-ap-label-secondary">
                {cell}
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td colSpan={headers.length} className="px-3 py-3 text-ap-label-secondary">No published rows are available for this table.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const ChartTooltip = () => (
  <Tooltip
    contentStyle={{
      backgroundColor: 'var(--ap-bg-elevated)',
      border: '1px solid var(--ap-card-border)',
      borderRadius: 'var(--ap-radius-sm)',
      color: 'var(--ap-label)',
      fontFamily: 'var(--ap-font-text)',
    }}
    labelStyle={{ color: 'var(--ap-label)' }}
    itemStyle={{ color: 'var(--ap-label)' }}
  />
);

const ChartCard: React.FC<{
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  chartLabel: string;
  dataTable?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, description, sourceLabel, chartLabel, dataTable, children }) => (
  <figure id={id} className="report-chart my-8 min-w-0 border-b border-ap-hairline pb-6" aria-labelledby={`${id}-title`}>
    <figcaption className="mb-3">
      <h3 id={`${id}-title`} className="text-ap-headline-sm font-semibold text-ap-label">{title}</h3>
      <p className="mt-1 max-w-[72ch] text-ap-body-sm text-ap-label-secondary">{description}</p>
    </figcaption>
    <div className="h-72 min-w-0 w-full" role="img" aria-label={chartLabel}>
      {children}
    </div>
    <p className="mt-2 text-ap-label-sm text-ap-label-secondary">Source: {sourceLabel}</p>
    {dataTable && (
      <details className="mt-2 border-t border-ap-hairline">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-ap-label-md font-medium text-ap-link underline underline-offset-4">
          View chart values as a table
        </summary>
        {dataTable}
      </details>
    )}
  </figure>
);

const MissingChartData: React.FC<{ name: string }> = ({ name }) => (
  <p className="my-4 text-ap-body-sm text-ap-label-secondary" role="note">
    The {name} figure is not rendered because the archived source snapshot for this report date is not available.
    The published report table below is retained; a newer run is not substituted for historical data.
  </p>
);

type SortKey = 'district' | 'division' | 'hazard' | 'targetDate' | 'tier' | 'severityScore';

function formatScore(value: unknown, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'Not recorded';
}

function rankedRows(rows: DailyAdvisory[]): DailyAdvisory[] {
  return [...rows]
    .sort((a, b) => {
      const left = typeof a.severityScore === 'number' && Number.isFinite(a.severityScore) ? a.severityScore : -Infinity;
      const right = typeof b.severityScore === 'number' && Number.isFinite(b.severityScore) ? b.severityScore : -Infinity;
      return right - left
        || String(a.targetDate).localeCompare(String(b.targetDate))
        || String(a.district).localeCompare(String(b.district))
        || String(a.hazard).localeCompare(String(b.hazard));
    })
    .slice(0, 15);
}

const TopAdvisoriesTable: React.FC<{ rows: DailyAdvisory[] }> = ({ rows }) => {
  const [sortKey, setSortKey] = useState<SortKey>('severityScore');
  const [descending, setDescending] = useState(true);
  const topRows = useMemo(() => {
    const top = rankedRows(rows);
    return [...top].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      let comparison = 0;
      if (sortKey === 'severityScore') {
        const aScore = typeof aValue === 'number' && Number.isFinite(aValue) ? aValue : -Infinity;
        const bScore = typeof bValue === 'number' && Number.isFinite(bValue) ? bValue : -Infinity;
        comparison = aScore - bScore;
      } else {
        comparison = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, { numeric: true });
      }
      return (descending ? -comparison : comparison)
        || String(a.targetDate).localeCompare(String(b.targetDate))
        || String(a.district).localeCompare(String(b.district))
        || String(a.hazard).localeCompare(String(b.hazard));
    });
  }, [rows, sortKey, descending]);

  const headers: Array<{ key: SortKey; label: string }> = [
    { key: 'district', label: 'District' },
    { key: 'division', label: 'Division' },
    { key: 'hazard', label: 'Hazard' },
    { key: 'targetDate', label: 'Target date' },
    { key: 'tier', label: 'Tier' },
    { key: 'severityScore', label: 'Severity score' },
  ];

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(key === 'severityScore');
    }
  };

  return (
    <div className="my-6">
      <p id="top-advisories-note" className="mb-2 text-ap-body-sm text-ap-label-secondary">
        Highest-scoring 15 published rows. Ties retain the same score and are ordered by target date, district and hazard.
      </p>
      <div className="overflow-x-auto rounded-md border border-ap-hairline" role="region" aria-label="Sortable highest-severity advisories table" tabIndex={0}>
        <table className={`${REPORT_TABLE_CLASS} min-w-[48rem]`}>
          <caption className="sr-only">Highest-severity published advisory rows; sorted within the top 15 by the selected column.</caption>
          <thead className="border-b border-ap-hairline bg-ap-grouped text-left text-ap-label">
            <tr>
              {headers.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={sortKey === key ? (descending ? 'descending' : 'ascending') : 'none'}
                  className="px-2 py-1 text-ap-label-md font-semibold"
                >
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-label={`Sort top advisory rows by ${label}${sortKey === key ? (descending ? ', descending' : ', ascending') : ''}`}
                    className="flex min-h-[44px] items-center rounded px-2 text-left underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
                  >
                    {label}
                    {sortKey === key && (descending
                      ? <ArrowDown className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />
                      : <ArrowUp className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topRows.length > 0 ? topRows.map((row, index) => (
              <tr key={`${row.district}-${row.targetDate}-${row.hazard}-${index}`} className="border-b border-ap-hairline last:border-0">
                <td className="px-3 py-2 font-medium text-ap-label">{row.district || 'Not recorded'}</td>
                <td className="px-3 py-2 text-ap-label-secondary">{row.division || 'Not recorded'}</td>
                <td className="px-3 py-2 text-ap-label-secondary">{row.hazard || 'Not recorded'}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-ap-label-secondary">{row.targetDate || 'Not recorded'}</td>
                <td className="px-3 py-2">
                  <span className="font-semibold text-ap-label">{row.tier || 'Not recorded'}</span>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-ap-label">{formatScore(row.severityScore, 3)}</td>
              </tr>
            )) : (
              <tr><td colSpan={headers.length} className="px-3 py-3 text-ap-label-secondary">No advisory rows are available in the matched snapshot.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function countTable(rows: CategoryCount[], caption: string): React.ReactNode {
  return (
    <ReportDataTable
      caption={caption}
      headers={['Category', 'Rows', 'Share of rows']}
      rows={rows.map((row) => [row.name, row.count, formatPercent(row.share)])}
    />
  );
}

function snapshotSourceLabel(snapshot: DailySnapshot): string {
  const id = snapshot.run?.id || 'Run ID not recorded';
  const generatedAt = snapshot.run?.generatedAt || 'generation time not recorded';
  return `${id} · generated ${generatedAt}`;
}

const ReportAnalysisSection: React.FC<{ analysis: ReportAnalysis; snapshot: DailySnapshot }> = ({ analysis, snapshot }) => {
  const sourceLabel = snapshotSourceLabel(snapshot);
  const severity = analysis.severity;
  const statisticRows: Array<[string, string]> = [
    ['Published advisory rows', String(analysis.rowCount)],
    ['Valid severity scores', String(severity.validCount)],
    ['Missing or non-finite scores', String(severity.missingCount)],
    ['Mean (μ)', formatScore(severity.mean)],
    ['Median', formatScore(severity.median)],
    ['Population standard deviation (σ)', formatScore(severity.populationStdDev)],
    ['Minimum', formatScore(severity.min)],
    ['First quartile (Q1)', formatScore(severity.q1)],
    ['Third quartile (Q3)', formatScore(severity.q3)],
    ['Interquartile range (Q3 − Q1)', formatScore(severity.iqr)],
    ['Maximum', formatScore(severity.max)],
    ['Range (maximum − minimum)', formatScore(severity.range)],
    ['Coefficient of variation', severity.coefficientOfVariation === null
      ? (severity.mean === 0 ? 'Not defined (mean is zero)' : 'Not available')
      : `${severity.coefficientOfVariation.toFixed(1)}%`],
    ['Skewness', severity.skewness === null
      ? (severity.validCount > 0 && severity.populationStdDev === 0 ? 'Not defined (all scores are equal)' : 'Not available')
      : formatScore(severity.skewness)],
    ['Mode (score; count)', severity.mode === null ? 'Not available' : `${formatScore(severity.mode)}; ${severity.modeCount}`],
    ['Distinct score values', String(severity.distinctValues)],
    ['Tukey outliers (1.5 × IQR)', severity.tukeyOutlierCount === null ? 'Not available' : String(severity.tukeyOutlierCount)],
    ['Linear slope across target dates', analysis.trend.slopePerDay === null
      ? 'Not available' : `${analysis.trend.slopePerDay.toFixed(4)} score/day`],
    ['Pearson r across target-date means', analysis.trend.correlation === null
      ? 'Not defined (insufficient or no variation)' : analysis.trend.correlation.toFixed(3)],
  ];
  const coverage = analysis.coverage;
  const check = (match: boolean | null) => match === null ? 'Not recorded' : match ? 'Matches' : 'Mismatch';
  const qualityRows: Array<[string, string]> = [
    ['Snapshot rows / declared rows', `${coverage.publishedRows} / ${coverage.declaredRows ?? 'Not recorded'}`],
    ['Published row-count check', check(coverage.rowsMatch)],
    ['Observed / declared districts', `${coverage.districtsObserved} / ${coverage.districtsDeclared ?? 'Not recorded'}`],
    ['District-count check', check(coverage.districtsMatch)],
    ['Observed / declared target dates', `${coverage.targetDatesObserved} / ${coverage.forecastDaysDeclared ?? 'Not recorded'}`],
    ['Forecast-day count check', check(coverage.forecastDaysMatch)],
    ['District–target-date pairs observed / expected', `${coverage.districtDatePairsObserved} / ${coverage.districtDatePairsExpected ?? 'Not recorded'}`],
    ['District–target-date pair coverage', coverage.districtDatePairCoveragePercent === null
      ? 'Not available' : `${coverage.districtDatePairCoveragePercent.toFixed(1)}%`],
    ['Duplicate district–hazard–date rows', String(coverage.duplicateDistrictHazardDateRows)],
    ['Severity scores outside [0, 1]', String(coverage.scoresOutsideZeroToOne)],
    ...coverage.missingByField.map(({ field, count }) => [`Rows with missing ${field.toLowerCase()}`, String(count)] as [string, string]),
  ];
  const divisionRows = analysis.divisions.map((division) => [
    division.name,
    String(division.rows),
    String(division.districts),
    String(division.validScores),
    formatScore(division.mean),
    formatScore(division.median),
    formatScore(division.populationStdDev),
    formatScore(division.min),
    formatScore(division.max),
  ]);
  const dateRows = analysis.dates.map((date) => [
    date.targetDate,
    String(date.rows),
    String(date.validScores),
    formatScore(date.mean),
    formatScore(date.median),
    formatScore(date.populationStdDev),
    formatScore(date.min),
    formatScore(date.max),
  ]);
  const hazardsByDivisionRows = analysis.divisionHazardRows.map((row) => [
    String(row.division),
    ...analysis.hazardsByDivision.map((hazard) => String(row[hazard] ?? 0)),
    String(row.total ?? 0),
  ]);
  const histogramRows = analysis.severityHistogram.map((bin) => [bin.name, bin.count, formatPercent(bin.share)]);
  const scoreRangeLabel = 'Score intervals are chart bins, not advisory thresholds.';

  return (
    <section id="statistical-analysis" className="mt-12 scroll-mt-24" aria-labelledby="statistical-analysis-heading">
      <h2 id="statistical-analysis-heading" className="mb-3 mt-10 ap-tagline">
        Mathematical and statistical analysis
      </h2>
      <p className="max-w-[72ch] text-ap-body-md text-ap-label-secondary">
        Descriptive statistics for the matched published snapshot only. Severity scores are model outputs, not observed impacts,
        event probabilities or calibrated confidence values. Rows in one run are related across districts and target dates.
      </p>

      <h3 id="severity-distribution" className="mb-2 mt-8 scroll-mt-24 text-ap-headline-sm font-semibold text-ap-label">Severity-score distribution</h3>
      <p className="max-w-[72ch] text-ap-body-sm text-ap-label-secondary">{scoreRangeLabel} Values outside [0, 1] remain visible in dedicated bins.</p>
      <ChartCard
        id="severity-distribution-figure"
        title="Published severity scores by 0.1-wide interval"
        description="Each bar counts finite score values in the interval named on the vertical axis. The horizontal axis is a row count."
        sourceLabel={sourceLabel}
        chartLabel={`Histogram of ${severity.validCount} valid severity scores. ${severity.distinctValues} distinct score values.`}
        dataTable={<ReportDataTable caption="Severity score histogram data" headers={['Score interval', 'Rows', 'Share']} rows={histogramRows} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analysis.severityHistogram} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={96} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
            <ChartTooltip />
            <Bar dataKey="count" name="Rows" fill="var(--ap-link)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ReportDataTable caption="Descriptive statistics for severity scores" headers={['Descriptive statistic', 'Value']} rows={statisticRows} />

      <h3 id="forecast-horizon" className="mb-2 mt-10 scroll-mt-24 text-ap-headline-sm font-semibold text-ap-label">Mean severity by target date</h3>
      <p className="max-w-[72ch] text-ap-body-sm text-ap-label-secondary">
        A daily aggregate across the rows published for each target date. The optional slope and correlation are descriptive fits only;
        no significance test is applied.
      </p>
      <ChartCard
        id="severity-by-date-figure"
        title="Mean score across target dates"
        description="The line connects per-date means from this run. Inspect the accompanying table for row counts and observed score ranges."
        sourceLabel={sourceLabel}
        chartLabel={`Mean severity score by target date across ${analysis.dates.length} dates.`}
        dataTable={<ReportDataTable caption="Severity by target date" headers={['Target date', 'Rows', 'Valid scores', 'Mean', 'Median', 'Population SD', 'Minimum', 'Maximum']} rows={dateRows} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={analysis.dates} margin={{ top: 12, right: 20, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" />
            <XAxis
              dataKey="targetDate"
              tickFormatter={(value: string) => value.slice(5)}
              minTickGap={16}
              tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }}
            />
            <YAxis domain={[0, 1]} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
            <ChartTooltip />
            <Line
              type="monotone"
              dataKey="mean"
              name="Mean severity score"
              stroke="var(--ap-link)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--ap-link)' }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ReportDataTable caption="Severity score summary by target date" headers={['Target date', 'Rows', 'Valid scores', 'Mean', 'Median', 'Population SD', 'Minimum', 'Maximum']} rows={dateRows} />

      <h3 id="hazard-by-division" className="mb-2 mt-10 scroll-mt-24 text-ap-headline-sm font-semibold text-ap-label">Hazard rows by division</h3>
      <p className="max-w-[72ch] text-ap-body-sm text-ap-label-secondary">The stacked bars show counts, not rates. Hazard names are repeated in the data table so color is not the sole identifier.</p>
      <ChartCard
        id="hazard-division-figure"
        title="Published rows by hazard and division"
        description="Each horizontal bar is a division; segments are labeled by hazard in the table below."
        sourceLabel={sourceLabel}
        chartLabel={`Stacked counts for ${analysis.hazardsByDivision.length} hazard classes across ${analysis.divisions.length} divisions.`}
        dataTable={<ReportDataTable
          caption="Hazard row counts by division"
          headers={['Division', ...analysis.hazardsByDivision, 'Total rows']}
          rows={hazardsByDivisionRows}
        />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analysis.divisionHazardRows} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 12 }}>
            <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
            <YAxis type="category" dataKey="division" width={112} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
            <ChartTooltip />
            {analysis.hazardsByDivision.map((hazard, index) => (
              <Bar
                key={hazard}
                dataKey={hazard}
                name={hazard}
                stackId="hazard"
                fill={HAZARD_PALETTE[index % HAZARD_PALETTE.length]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ReportDataTable
        caption="Published hazard row counts by division"
        headers={['Division', ...analysis.hazardsByDivision, 'Total rows']}
        rows={hazardsByDivisionRows}
      />

      <h3 id="coverage-quality" className="mb-2 mt-10 scroll-mt-24 text-ap-headline-sm font-semibold text-ap-label">Coverage and data quality</h3>
      <p className="max-w-[72ch] text-ap-body-sm text-ap-label-secondary">
        District–target-date pair coverage compares unique observed pairs with the declared district × forecast-day count; it is not hazard-specific coverage.
      </p>
      <ReportDataTable caption="Snapshot coverage and data checks" headers={['Check', 'Observed value']} rows={qualityRows} />
      <p className="my-4 max-w-[72ch] text-ap-body-sm text-ap-label-secondary">
        No inferential p-values or confidence intervals are calculated: these are descriptive aggregates from one run, not an independent observed-outcome sample.
      </p>
    </section>
  );
};

const FallbackFaq: React.FC = () => {
  const items = [
    {
      question: 'Does a severity score mean an event will happen?',
      answer: 'No. It is a model output for a target date, not an observed impact or a calibrated probability. Read it with the run date, coverage checks and stated limitations.',
    },
    {
      question: 'Does WATCH mean an official warning?',
      answer: 'No. HazardNet is not an official warning service. Official warnings come from BMD and FFWC; call 999 for emergencies.',
    },
    {
      question: 'Why are p-values and confidence intervals not shown?',
      answer: 'Rows in a single forecast run share districts and target dates, so they are not an independent sample of observed outcomes. This report sticks to descriptive statistics.',
    },
    {
      question: 'Why does the analysis say its source snapshot is unavailable?',
      answer: 'The archive keeps report text for older runs, but the interactive analysis only appears when the matching source snapshot is available. A newer run is never substituted for an older report.',
    },
    {
      question: 'Where should I look for current official warnings?',
      answer: 'Use official Bangladesh Meteorological Department and Flood Forecasting and Warning Centre bulletins. For emergencies, call 999.',
    },
  ];
  return (
    <section id="report-faq" className="mt-12 scroll-mt-24" aria-labelledby="report-faq-heading">
      <h2 id="report-faq-heading" className="mb-3 mt-10 ap-tagline">Frequently asked questions</h2>
      <div className="divide-y divide-ap-hairline border-y border-ap-hairline">
        {items.map((item) => (
          <details key={item.question}>
            <summary className="flex min-h-[48px] cursor-pointer items-center py-3 font-semibold text-ap-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary">
              {item.question}
            </summary>
            <p className="max-w-[72ch] pb-4 text-ap-body-md text-ap-label-secondary">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
};

function removeFirstMarkdownTable(markdown: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line, index) => line.trim().startsWith('|')
    && lines[index + 1]?.trim().startsWith('|')
    && /^\|[\s:|-]+\|?$/.test(lines[index + 1].trim()));
  if (start < 0) return markdown;
  let end = start + 2;
  while (end < lines.length && lines[end].trim().startsWith('|')) end += 1;
  lines.splice(start, end - start);
  return lines.join('\n');
}

function textFromReactNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromReactNode).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textFromReactNode(node.props.children);
  return '';
}

const Markdown: React.FC<{ text: string; headings: ReportHeading[] }> = ({ text, headings }) => {
  let headingIndex = 0;
  const headingId = (children: React.ReactNode, level: number): string => {
    const slug = slugifyReportHeading(textFromReactNode(children));
    for (let index = headingIndex; index < headings.length; index += 1) {
      const candidate = headings[index];
      if (candidate.level === level && slugifyReportHeading(candidate.text) === slug) {
        headingIndex = index + 1;
        return candidate.id;
      }
    }
    return slug;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: () => null,
        h2: ({ children }) => (
          <h2 id={headingId(children, 2)} className="mb-3 mt-10 scroll-mt-24 ap-tagline">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 id={headingId(children, 3)} className="mb-2 mt-8 scroll-mt-24 text-ap-headline-sm font-semibold text-ap-label">
            {children}
          </h3>
        ),
        h4: ({ children }) => <h4 className="mb-2 mt-6 text-ap-headline-sm font-semibold text-ap-label">{children}</h4>,
        p: ({ children }) => <p className="my-3 max-w-[72ch] text-ap-body-md text-ap-label-secondary">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-6 text-ap-body-md text-ap-label-secondary">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6 text-ap-body-md text-ap-label-secondary">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        a: ({ children, href }) => <a href={href} className="ap-link underline underline-offset-4">{children}</a>,
        table: ({ children }) => (
          <div className="report-table-region my-5 overflow-x-auto rounded-md border border-ap-hairline" role="region" aria-label="Published report data table" tabIndex={0}>
            <table className={REPORT_TABLE_CLASS}>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-ap-hairline bg-ap-grouped">{children}</thead>,
        tr: ({ children }) => <tr className="border-b border-ap-hairline last:border-0">{children}</tr>,
        th: ({ children }) => <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-ap-label">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-ap-body-sm text-ap-label-secondary">{children}</td>,
        code: ({ children }) => <code className="rounded bg-ap-grouped px-1 py-0.5 font-mono text-ap-body-sm text-ap-label">{children}</code>,
        pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-ap-hairline bg-ap-grouped p-4 font-mono text-ap-body-sm text-ap-label">{children}</pre>,
        blockquote: ({ children }) => <blockquote className="my-4 border-l border-ap-hairline pl-4 text-ap-label-secondary">{children}</blockquote>,
        hr: () => <hr className="my-8 border-ap-hairline" />,
        strong: ({ children }) => <strong className="font-semibold text-ap-label">{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
};

const CALLOUT_STYLE: Record<string, React.CSSProperties> = {
  info: { borderColor: 'var(--ap-info)', backgroundColor: 'var(--ap-bg-grouped)', color: 'var(--ap-label)' },
  warning: { borderColor: 'var(--ap-warning)', backgroundColor: 'var(--ap-bg-grouped)', color: 'var(--ap-label)' },
  danger: { borderColor: 'var(--ap-danger)', backgroundColor: 'var(--ap-bg-grouped)', color: 'var(--ap-label)' },
};

const ReportTemplate: React.FC<{
  markdown: string;
  snapshot: DailySnapshot | null;
  reportDate?: string;
  reportRunId?: string;
}> = ({ markdown, snapshot, reportDate, reportRunId }) => {
  const blocks = useMemo(() => parseReportBlocks(markdown), [markdown]);
  const snapshotMatches = isSnapshotForReport(snapshot, reportDate, reportRunId);
  const matchedSnapshot = snapshotMatches ? snapshot : null;
  const analysis = useMemo(
    () => matchedSnapshot ? analyzeDailySnapshot(matchedSnapshot) : null,
    [matchedSnapshot],
  );
  const headings = blocks.flatMap((block) => block.kind === 'directive' ? [] : block.headings);
  const hasStatisticalSection = hasSection(headings, /statistical analysis/i);
  const hasFaqSection = hasSection(headings, /frequently asked questions|\bfaq\b/i);
  const advisories = matchedSnapshot?.advisories ?? [];
  const snapshotLabel = matchedSnapshot ? snapshotSourceLabel(matchedSnapshot) : '';

  const renderChart = (name: string): React.ReactNode => {
    if (!analysis || !matchedSnapshot) {
      const friendlyName = name.replace(/^chart:/, '').replace(/-/g, ' ');
      return <MissingChartData name={friendlyName} />;
    }

    switch (name) {
      case 'chart:tier-distribution':
        return (
          <ChartCard
            id="tier-distribution-figure"
            title="Published advisory tiers"
            description="Each bar counts published rows for one tier. The table names each tier and gives its share of all rows."
            sourceLabel={snapshotLabel}
            chartLabel={`${analysis.tiers.length} advisory tiers across ${analysis.rowCount} published rows.`}
            dataTable={countTable(analysis.tiers, 'Advisory tier distribution')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.tiers} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <ChartTooltip />
                <Bar dataKey="count" name="Published rows" isAnimationActive={false}>
                  {analysis.tiers.map((entry) => <Cell key={entry.name} fill={TIER_FILL[entry.name] || 'var(--ap-n-50)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:hazard-distribution':
        return (
          <ChartCard
            id="hazard-distribution-figure"
            title="Published rows by hazard"
            description="Counts describe the hazard labels in the snapshot; they are not probabilities of occurrence."
            sourceLabel={snapshotLabel}
            chartLabel={`${analysis.hazards.length} hazard categories across ${analysis.rowCount} published rows.`}
            dataTable={countTable(analysis.hazards, 'Hazard mix in the published snapshot')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.hazards} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 12 }}>
                <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <ChartTooltip />
                <Bar dataKey="count" name="Published rows" isAnimationActive={false}>
                  {analysis.hazards.map((entry, index) => (
                    <Cell key={entry.name} fill={HAZARD_PALETTE[index % HAZARD_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:severity-by-division':
        return (
          <ChartCard
            id="severity-by-division-figure"
            title="Mean severity score by division"
            description="The horizontal scale is the published 0–1 score range; each division's row count and score range are in the table."
            sourceLabel={snapshotLabel}
            chartLabel={`Mean severity score by ${analysis.divisions.length} divisions.`}
            dataTable={<ReportDataTable
              caption="Severity score summaries by division"
              headers={['Division', 'Rows', 'Districts', 'Valid scores', 'Mean', 'Median', 'Population SD', 'Minimum', 'Maximum']}
              rows={analysis.divisions.map((division) => [
                division.name,
                division.rows,
                division.districts,
                division.validScores,
                formatScore(division.mean),
                formatScore(division.median),
                formatScore(division.populationStdDev),
                formatScore(division.min),
                formatScore(division.max),
              ])}
            />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.divisions} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 12 }}>
                <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <ChartTooltip />
                <Bar dataKey="mean" name="Mean severity score" fill="var(--ap-link)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:severity-distribution':
        return (
          <ChartCard
            id="severity-distribution-figure"
            title="Severity scores by 0.1-wide interval"
            description="Bars count finite score values. Display intervals are not advisory thresholds."
            sourceLabel={snapshotLabel}
            chartLabel={`Histogram of ${analysis.severity.validCount} valid scores in ${analysis.severityHistogram.length} intervals.`}
            dataTable={<ReportDataTable
              caption="Severity score histogram"
              headers={['Score interval', 'Rows', 'Share']}
              rows={analysis.severityHistogram.map((bin) => [bin.name, bin.count, formatPercent(bin.share)])}
            />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.severityHistogram} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <ChartTooltip />
                <Bar dataKey="count" name="Rows" fill="var(--ap-link)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:severity-by-date':
        return (
          <ChartCard
            id="severity-by-date-figure"
            title="Mean severity across target dates"
            description="Each point is a mean for one target date in this run. It is a forecast-horizon summary, not observed history."
            sourceLabel={snapshotLabel}
            chartLabel={`Mean severity by target date across ${analysis.dates.length} dates.`}
            dataTable={<ReportDataTable
              caption="Severity score summary by target date"
              headers={['Target date', 'Rows', 'Valid scores', 'Mean', 'Median', 'Population SD', 'Minimum', 'Maximum']}
              rows={analysis.dates.map((date) => [date.targetDate, date.rows, date.validScores, formatScore(date.mean), formatScore(date.median), formatScore(date.populationStdDev), formatScore(date.min), formatScore(date.max)])}
            />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analysis.dates} margin={{ top: 12, right: 20, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" />
                <XAxis dataKey="targetDate" tickFormatter={(value: string) => value.slice(5)} minTickGap={16} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <YAxis domain={[0, 1]} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <ChartTooltip />
                <Line type="monotone" dataKey="mean" name="Mean severity score" stroke="var(--ap-link)" strokeWidth={2} dot={{ r: 3, fill: 'var(--ap-link)' }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      case 'chart:hazard-by-division':
        return (
          <ChartCard
            id="hazard-division-figure"
            title="Published hazard rows by division"
            description="Stacked segments count rows, not rates. The expandable data table names every hazard so color is not the sole identifier."
            sourceLabel={snapshotLabel}
            chartLabel={`Hazard row counts for ${analysis.hazardsByDivision.length} hazard types across ${analysis.divisions.length} divisions.`}
            dataTable={<ReportDataTable
              caption="Hazard row counts by division"
              headers={['Division', ...analysis.hazardsByDivision, 'Total rows']}
              rows={analysis.divisionHazardRows.map((row) => [String(row.division), ...analysis.hazardsByDivision.map((hazard) => Number(row[hazard] ?? 0)), Number(row.total ?? 0)])}
            />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.divisionHazardRows} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 12 }}>
                <CartesianGrid stroke="var(--ap-separator)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="division" width={112} tick={{ fill: 'var(--ap-label-secondary)', fontSize: 12 }} />
                <ChartTooltip />
                {analysis.hazardsByDivision.map((hazard, index) => (
                  <Bar key={hazard} dataKey={hazard} name={hazard} stackId="hazard" fill={HAZARD_PALETTE[index % HAZARD_PALETTE.length]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      default:
        return null;
    }
  };

  const renderDirective = (name: string): React.ReactNode => {
    if (name.startsWith('chart:')) return renderChart(name);
    if (name === 'table:top-advisories') {
      return matchedSnapshot
        ? <TopAdvisoriesTable rows={advisories} />
        : <MissingChartData name="top advisories table" />;
    }
    return <p className="my-3 text-ap-body-sm text-ap-label-secondary">This report contains an unsupported visual directive: {name}.</p>;
  };

  const suppressTableAfter = new Set<string>([
    'chart:tier-distribution',
    'chart:hazard-distribution',
    'chart:severity-by-division',
    'chart:severity-by-date',
    'chart:hazard-by-division',
    'table:top-advisories',
  ]);
  let nextTableBlock = false;

  return (
    <article className="report-prose min-w-0">
      {blocks.map((block, index) => {
        if (block.kind === 'directive') {
          nextTableBlock = matchedSnapshot !== null && suppressTableAfter.has(block.name);
          return <React.Fragment key={`directive-${index}`}>{renderDirective(block.name)}</React.Fragment>;
        }
        if (block.kind === 'callout') {
          nextTableBlock = false;
          return (
            <div
              key={`callout-${index}`}
              className="my-5 rounded-lg border px-4 py-3"
              style={{ ...CALLOUT_STYLE[block.tone], borderWidth: '1px' }}
              role="note"
              aria-label={`${block.tone} report note`}
            >
              <strong className="font-semibold">{block.tone === 'info' ? 'Information: ' : `${block.tone[0].toUpperCase()}${block.tone.slice(1)}: `}</strong>
              <Markdown text={block.text} headings={block.headings} />
            </div>
          );
        }
        const text = nextTableBlock ? removeFirstMarkdownTable(block.text) : block.text;
        nextTableBlock = false;
        return text.trim()
          ? <Markdown key={`markdown-${index}`} text={text} headings={block.headings} />
          : null;
      })}
      {!hasStatisticalSection && (
        matchedSnapshot && analysis
          ? <ReportAnalysisSection analysis={analysis} snapshot={matchedSnapshot} />
          : (
            <section id="statistical-analysis" className="mt-12 scroll-mt-24" aria-labelledby="statistical-analysis-heading">
              <h2 id="statistical-analysis-heading" className="mb-3 mt-10 ap-tagline">
                Mathematical and statistical analysis
              </h2>
              <p className="max-w-[72ch] text-ap-body-md text-ap-label-secondary">
                Interactive analysis is not available for this archived report because its matching source snapshot is not retained.
                The newer published snapshot is not substituted; use the dated tables above as the archive record.
              </p>
            </section>
          )
      )}
      {!hasFaqSection && <FallbackFaq />}
    </article>
  );
};

export default ReportTemplate;
