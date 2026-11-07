import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import CardStackTable from '../ui/CardStackTable';

export interface DocsChartPoint {
  label: string;
  value: number;
  /** Numeric x coordinate for time series; missing years create a visible gap. */
  x?: number;
}

export interface DocsChartDefinition {
  type: 'bar' | 'line';
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  valueFormat?: 'count' | 'decimal' | 'percent' | 'score';
  data: DocsChartPoint[];
  maxValue?: number;
  source?: string;
  note?: string;
}

export interface DocsFormulaDefinition {
  label: string;
  expression: string;
  spoken: string;
  explanation: string;
  variables?: Array<{ symbol: string; meaning: string }>;
}

export interface DocsFigureDefinition {
  type: 'process' | 'horizon';
  title: string;
  description: string;
  steps?: Array<{ title: string; detail: string }>;
  totalDays?: number;
  nearTermDays?: number;
  nearTermLabel?: string;
  longerLeadLabel?: string;
}

export interface DocsTopic {
  to: string;
  kicker: string;
  title: string;
  blurb: string;
}

export interface TocItem {
  id: string;
  label: string;
}

function formatValue(value: number, format: DocsChartDefinition['valueFormat'] = 'count'): string {
  if (!Number.isFinite(value)) return 'Not recorded';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'score') return value.toFixed(2);
  if (format === 'decimal') return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return Math.round(value).toLocaleString('en-US');
}

function chartTicks(maxValue: number): number[] {
  if (maxValue <= 1) return [0, maxValue / 2, maxValue];
  const step = maxValue / 2;
  return [0, step, maxValue];
}

function BarChartSvg({ chart, titleId, descriptionId }: {
  chart: DocsChartDefinition;
  titleId: string;
  descriptionId: string;
}) {
  const width = 720;
  const left = 198;
  const plotWidth = 438;
  const top = 26;
  const rowHeight = 32;
  const bottom = 46;
  const height = Math.max(148, top + chart.data.length * rowHeight + bottom);
  const maximum = chart.maxValue ?? Math.max(1, ...chart.data.map((point) => point.value));
  const plotBottom = top + chart.data.length * rowHeight;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full min-w-[34rem]"
      role="img"
      aria-labelledby={`${titleId}-svg`}
      aria-describedby={`${descriptionId}-svg`}
    >
      <title id={titleId}>{chart.title}</title>
      <desc id={descriptionId}>{chart.description}</desc>
      {chartTicks(maximum).map((tick) => {
        const x = left + (tick / maximum) * plotWidth;
        return (
          <g key={tick}>
            <line x1={x} y1={top - 8} x2={x} y2={plotBottom} stroke="currentColor" className="text-carbon-30" strokeDasharray="2 4" />
            <text x={x} y={plotBottom + 18} textAnchor="middle" fill="currentColor" className="text-carbon-60" fontSize="11">
              {formatValue(tick, chart.valueFormat)}
            </text>
          </g>
        );
      })}
      {chart.data.map((point, index) => {
        const y = top + index * rowHeight + 2;
        const barWidth = Math.max(0, Math.min(plotWidth, (point.value / maximum) * plotWidth));
        return (
          <g key={`${point.label}-${index}`}>
            <text x={left - 10} y={y + 14} textAnchor="end" fill="currentColor" className="text-carbon-70" fontSize="12">
              {point.label}
            </text>
            <rect x={left} y={y} width={barWidth} height="18" rx="3" fill="currentColor" className="text-ap-link" />
            <text x={left + barWidth + 7} y={y + 14} fill="currentColor" className="text-carbon-90" fontSize="12" fontWeight="600">
              {formatValue(point.value, chart.valueFormat)}
            </text>
          </g>
        );
      })}
      <text x={left + plotWidth / 2} y={height - 6} textAnchor="middle" fill="currentColor" className="text-carbon-60" fontSize="11">
        {chart.xLabel}
      </text>
    </svg>
  );
}

function LineChartSvg({ chart, titleId, descriptionId }: {
  chart: DocsChartDefinition;
  titleId: string;
  descriptionId: string;
}) {
  const width = 720;
  const height = 300;
  const left = 58;
  const right = 24;
  const top = 24;
  const bottom = 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xValues = chart.data.map((point, index) => point.x ?? index);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const maximum = chart.maxValue ?? Math.max(1, ...chart.data.map((point) => point.value));
  const xPosition = (value: number) => left + ((value - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
  const yPosition = (value: number) => top + plotHeight - (value / maximum) * plotHeight;
  const segments: Array<Array<{ point: DocsChartPoint; x: number }>> = [];

  chart.data.forEach((point, index) => {
    const x = point.x ?? index;
    const current = segments[segments.length - 1];
    if (!current || (current.length > 0 && x - current[current.length - 1].x > 1)) segments.push([{ point, x }]);
    else current.push({ point, x });
  });

  const tickStep = xMax - xMin > 10 ? 5 : Math.max(1, Math.round((xMax - xMin) / 4));
  const xTicks = new Set<number>([xMin, xMax]);
  for (let tick = Math.ceil(xMin / tickStep) * tickStep; tick < xMax; tick += tickStep) xTicks.add(tick);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full min-w-[34rem]"
      role="img"
      aria-labelledby={`${titleId}-svg`}
      aria-describedby={`${descriptionId}-svg`}
    >
      <title id={titleId}>{chart.title}</title>
      <desc id={descriptionId}>{chart.description}</desc>
      {chartTicks(maximum).map((tick) => {
        const y = yPosition(tick);
        return (
          <g key={tick}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="currentColor" className="text-carbon-30" strokeDasharray="2 4" />
            <text x={left - 8} y={y + 4} textAnchor="end" fill="currentColor" className="text-carbon-60" fontSize="11">
              {formatValue(tick, chart.valueFormat)}
            </text>
          </g>
        );
      })}
      <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} stroke="currentColor" className="text-carbon-40" />
      {[...xTicks].sort((a, b) => a - b).map((tick) => (
        <g key={tick} className="text-carbon-60">
          <line x1={xPosition(tick)} y1={top + plotHeight} x2={xPosition(tick)} y2={top + plotHeight + 4} stroke="currentColor" />
          <text x={xPosition(tick)} y={height - 34} textAnchor="middle" fill="currentColor" fontSize="11">{tick}</text>
        </g>
      ))}
      {segments.map((segment, index) => segment.length > 1 && (
        <path
          key={`segment-${index}`}
          d={segment.map(({ point, x }, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${xPosition(x)} ${yPosition(point.value)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-ap-link"
        />
      ))}
      {chart.data.map((point, index) => {
        const x = point.x ?? index;
        return (
          <circle key={`${point.label}-${index}`} cx={xPosition(x)} cy={yPosition(point.value)} r="3.5" fill="currentColor" className="text-ap-link">
            <title>{`${point.label}: ${formatValue(point.value, chart.valueFormat)}`}</title>
          </circle>
        );
      })}
      <text x={left + plotWidth / 2} y={height - 7} textAnchor="middle" fill="currentColor" className="text-carbon-60" fontSize="11">
        {chart.xLabel}
      </text>
      <text x="14" y={top + plotHeight / 2} textAnchor="middle" fill="currentColor" className="text-carbon-60" fontSize="11" transform={`rotate(-90 14 ${top + plotHeight / 2})`}>
        {chart.yLabel}
      </text>
    </svg>
  );
}

export const DocsStatChart: React.FC<{ chart: DocsChartDefinition }> = ({ chart }) => {
  const id = useId().replace(/:/g, '');
  const titleId = `docs-chart-${id}-title`;
  const descriptionId = `docs-chart-${id}-description`;
  const tableRows = chart.data.map((point) => [point.label, formatValue(point.value, chart.valueFormat)]);
  const tableCaption = `${chart.title} data`;
  const tableColumns = chart.type === 'bar'
    ? [chart.yLabel || 'Category', chart.xLabel || 'Value']
    : [chart.xLabel || 'Category', chart.yLabel || 'Value'];
  const axisDescription = chart.type === 'bar'
    ? `${chart.yLabel} categories are shown beside the bars; bar length represents ${chart.xLabel.toLowerCase()}.`
    : `${chart.xLabel} is shown on the horizontal axis; ${chart.yLabel.toLowerCase()} is the measured quantity.`;

  return (
    <figure className="my-5 min-w-0 rounded-ap-md border border-ap-hairline bg-ap-grouped p-4 sm:p-5" aria-labelledby={titleId}>
      <div className="mb-3">
        <h3 id={titleId} className="text-base font-semibold text-ap-label">{chart.title}</h3>
        <p id={descriptionId} className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ap-label-secondary">{chart.description}</p>
      </div>
      <div className="overflow-x-auto rounded-ap-sm" role="region" aria-label={`${chart.title} chart`} tabIndex={0}>
        {chart.type === 'bar'
          ? <BarChartSvg chart={chart} titleId={`${titleId}-svg`} descriptionId={`${descriptionId}-svg`} />
          : <LineChartSvg chart={chart} titleId={`${titleId}-svg`} descriptionId={`${descriptionId}-svg`} />}
      </div>
      <figcaption className="mt-3 space-y-1 text-xs leading-relaxed text-ap-label-secondary">
        <p>{axisDescription}</p>
        {chart.source && <p>Source: {chart.source}</p>}
        {chart.note && <p>{chart.note}</p>}
      </figcaption>
      <details className="mt-3 border-t border-ap-hairline pt-2">
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-medium text-ap-link underline underline-offset-4">View chart values as a table</summary>
        <div className="mt-2">
          <CardStackTable columns={tableColumns} rows={tableRows} caption={tableCaption} />
        </div>
      </details>
    </figure>
  );
};

export const DocsFormulaSet: React.FC<{ formulas: DocsFormulaDefinition[] }> = ({ formulas }) => (
  <div className="my-4 grid gap-3">
    {formulas.map((formula) => (
      <section key={`${formula.label}-${formula.expression}`} className="rounded-ap-md border border-ap-hairline bg-ap-grouped p-4" aria-label={formula.label}>
        <h3 className="text-sm font-semibold text-ap-label">{formula.label}</h3>
        <p className="mt-2 overflow-x-auto rounded-ap-sm bg-ap-inset px-3 py-2 font-mono text-sm text-ap-label">
          <code aria-label={formula.spoken}>{formula.expression}</code>
        </p>
        <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-ap-label-secondary">{formula.explanation}</p>
        {formula.variables && formula.variables.length > 0 && (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {formula.variables.map((variable) => (
              <div key={`${formula.label}-${variable.symbol}`} className="flex gap-2 text-xs leading-relaxed">
                <dt className="min-w-8 font-mono font-semibold text-ap-label">{variable.symbol}</dt>
                <dd className="text-ap-label-secondary">{variable.meaning}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    ))}
  </div>
);

export const DocsProcessFigure: React.FC<{ figure: DocsFigureDefinition }> = ({ figure }) => (
  <figure className="my-5 rounded-ap-md border border-ap-hairline p-4 sm:p-5" aria-label={figure.title}>
    <figcaption className="mb-4">
      <h3 className="text-base font-semibold text-ap-label">{figure.title}</h3>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ap-label-secondary">{figure.description}</p>
    </figcaption>
    {figure.type === 'process' ? (
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(figure.steps ?? []).map((step, index) => (
          <li key={`${step.title}-${index}`} className="min-w-0 rounded-ap-sm border border-ap-hairline bg-ap-grouped p-3">
            <span className="font-mono text-xs font-semibold text-ap-label-tertiary">{String(index + 1).padStart(2, '0')}</span>
            <h4 className="mt-1 text-sm font-semibold text-ap-label">{step.title}</h4>
            <p className="mt-1 text-xs leading-relaxed text-ap-label-secondary">{step.detail}</p>
          </li>
        ))}
      </ol>
    ) : (
      <div className="space-y-4">
        {[0, 1].map((rangeIndex) => {
          const total = figure.totalDays ?? 15;
          const near = Math.min(figure.nearTermDays ?? 7, total);
          const start = rangeIndex === 0 ? 1 : near + 1;
          const end = rangeIndex === 0 ? near : total;
          const days = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
          if (days.length === 0) return null;
          const label = rangeIndex === 0 ? (figure.nearTermLabel ?? `Days 1 to ${near}`) : (figure.longerLeadLabel ?? `Days ${near + 1} to ${total}`);
          return (
            <div key={label}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-ap-label">{label}</h4>
                <span className="text-xs text-ap-label-secondary">{days.length} daily steps</span>
              </div>
              <ol className={`grid gap-1 ${rangeIndex === 0 ? 'grid-cols-7' : 'grid-cols-8'}`} aria-label={label}>
                {days.map((day) => (
                  <li key={day} className={`min-w-0 rounded-ap-sm border px-1 py-2 text-center font-mono text-xs tabular-nums ${rangeIndex === 0 ? 'border-ap-primary bg-ap-grouped text-ap-label' : 'border-ap-hairline text-ap-label-secondary'}`}>
                    {day}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
        <p className="text-xs leading-relaxed text-ap-label-secondary">The longer-lead band is not a numerical uncertainty interval. It communicates that meteorological uncertainty generally grows with lead time.</p>
      </div>
    )}
  </figure>
);

export const DocsTopicGrid: React.FC<{ topics: DocsTopic[] }> = ({ topics }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {topics.map((topic) => (
      <Link key={topic.to} to={topic.to} className="group flex min-h-32 flex-col rounded-ap-md border border-ap-hairline p-4 transition-colors hover:border-ap-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary">
        <span className="font-mono text-xs font-semibold text-ap-label-tertiary">{topic.kicker}</span>
        <span className="mt-2 text-base font-semibold text-ap-label group-hover:text-ap-link">{topic.title}</span>
        <span className="mt-1 text-sm leading-relaxed text-ap-label-secondary">{topic.blurb}</span>
      </Link>
    ))}
  </div>
);

export const DocsTableOfContents: React.FC<{ items: TocItem[]; variant: 'desktop' | 'mobile' }> = ({ items, variant }) => {
  if (items.length < 2) return null;
  if (variant === 'mobile') {
    return (
      <nav aria-label="On this page" className="mb-5 lg:hidden">
        <details className="rounded-ap-md border border-ap-hairline p-3">
          <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-ap-label">On this page</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {items.map((item) => <li key={item.id}><a href={`#${item.id}`} className="text-ap-link underline underline-offset-4">{item.label}</a></li>)}
          </ol>
        </details>
      </nav>
    );
  }
  return (
    <nav aria-label="On this page" className="hidden lg:block">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ap-label-tertiary">On this page</p>
      <ol className="list-decimal space-y-2 border-l border-ap-hairline pl-5 text-sm">
        {items.map((item) => <li key={item.id}><a href={`#${item.id}`} className="text-ap-label-secondary underline-offset-4 hover:text-ap-link hover:underline">{item.label}</a></li>)}
      </ol>
    </nav>
  );
};
