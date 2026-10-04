import React, { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import defaultTrends from '../../public/data/historical/temporal-trends.json';

export interface TemporalTrendRecord {
  year: number;
  event_frequency: number;
  annual_affected_population: number;
}

export interface TemporalTrendChartProps {
  data?: TemporalTrendRecord[];
  className?: string;
  lowBandwidth?: boolean;
}

interface MilestoneAnnotation {
  year: number;
  label: string;
  sublabel: string;
  color: string;
}

const MILESTONES: MilestoneAnnotation[] = [
  { year: 2007, label: 'Cyclone Sidr', sublabel: 'Cat 5 / 3,400+ casualties', color: '#ef4444' },
  { year: 2017, label: 'Flash Floods', sublabel: 'Haor Basin submerged', color: '#3b82f6' },
  { year: 2024, label: 'Cyclone Remal', sublabel: 'Severe storm surge', color: '#f59e0b' },
];

export const TemporalTrendChart: React.FC<TemporalTrendChartProps> = ({
  data = defaultTrends as TemporalTrendRecord[],
  className = '',
  lowBandwidth = false,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<TemporalTrendRecord | null>(null);

  // Sort data chronologically
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year);
  }, [data]);

  const maxFreq = useMemo(() => {
    return Math.max(...sortedData.map((d) => d.event_frequency), 400);
  }, [sortedData]);

  const minYear = sortedData[0]?.year || 2000;
  const maxYear = sortedData[sortedData.length - 1]?.year || 2026;
  const yearSpan = Math.max(1, maxYear - minYear);

  // SVG dimensions
  const width = 800;
  const height = 320;
  const padding = { top: 35, right: 30, bottom: 40, left: 55 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Scale functions
  const getX = (year: number) => {
    return padding.left + ((year - minYear) / yearSpan) * innerWidth;
  };

  const getY = (val: number) => {
    return padding.top + innerHeight - (val / maxFreq) * innerHeight;
  };

  // Generate SVG path points
  const points = useMemo(() => {
    return sortedData.map((d) => ({
      x: getX(d.year),
      y: getY(d.event_frequency),
      record: d,
    }));
  }, [sortedData, minYear, yearSpan, maxFreq, innerWidth, innerHeight]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottomY = padding.top + innerHeight;
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [linePath, points, padding.top, innerHeight]);

  return (
    <div
      className={`bg-carbon-90 border border-carbon-80 rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col text-carbon-10 ${className}`}
      data-testid="temporal-trend-chart"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-carbon-80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-tight">
              Temporal Hazard Recurrence Trends (2000–2026)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/60 text-rose-300 border border-rose-800/60">
              26-Year Empirical Record
            </span>
          </div>
          <p className="text-xs text-carbon-40 mt-1">
            Annual event frequency across all 64 districts with historical milestone disaster annotations.
          </p>
        </div>

        {/* Milestone Legend */}
        <div className="flex flex-wrap items-center gap-2">
          {MILESTONES.map((m) => (
            <div key={m.year} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              <span className="text-carbon-30 font-medium">
                {m.year} {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Chart Container */}
      <div className="relative w-full h-[280px] sm:h-[340px] bg-carbon-black/60 rounded-xl border border-carbon-80/80 p-2 overflow-hidden flex items-center justify-center">
        {/* Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute top-3 left-16 z-20 bg-carbon-90/95 backdrop-blur-md border border-carbon-70 px-3 py-2 rounded-lg shadow-xl text-xs space-y-1 pointer-events-none"
            role="tooltip"
          >
            <div className="flex items-center justify-between gap-4 font-mono font-bold text-white">
              <span>Year {hoveredPoint.year}</span>
              <span className="text-rose-400">{hoveredPoint.event_frequency} Events</span>
            </div>
            {MILESTONES.find((m) => m.year === hoveredPoint.year) && (
              <div className="text-xs text-amber-300 font-semibold pt-0.5">
                <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {MILESTONES.find((m) => m.year === hoveredPoint.year)?.label}:{' '}
                {MILESTONES.find((m) => m.year === hoveredPoint.year)?.sublabel}
              </div>
            )}
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full select-none"
          preserveAspectRatio="none"
          role="img"
          aria-label="Annual hazard recurrence trend line chart from 2000 to 2026"
        >
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          {[0, 100, 200, 300, 400].map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick} className="grid-tick">
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#444447"
                  strokeWidth={0.5}
                  strokeDasharray="3, 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-xs font-mono fill-carbon-50"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Area under curve */}
          {!lowBandwidth && (
            <path d={areaPath} fill="url(#trendGradient)" />
          )}

          {/* Main Trend Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Milestone Vertical Callout Lines */}
          {MILESTONES.map((m) => {
            const x = getX(m.year);
            const yBottom = padding.top + innerHeight;
            const yTop = padding.top - 10;
            return (
              <g key={m.year} className="milestone-marker">
                <line
                  x1={x}
                  y1={yTop + 14}
                  x2={x}
                  y2={yBottom}
                  stroke={m.color}
                  strokeWidth={1.5}
                  strokeDasharray="2, 2"
                />
                <circle cx={x} cy={yTop + 10} r={4} fill={m.color} />
                <text
                  x={x}
                  y={yTop + 2}
                  textAnchor="middle"
                  className="text-xs font-mono font-bold"
                  fill={m.color}
                >
                  {m.year}
                </text>
              </g>
            );
          })}

          {/* Interactive Data Nodes */}
          {points.map((p) => {
            const isHovered = hoveredPoint?.year === p.record.year;
            return (
              <g
                key={p.record.year}
                tabIndex={0}
                role="button"
                aria-label={`Year ${p.record.year}: ${p.record.event_frequency} hazard events`}
                className="cursor-pointer focus:outline-hidden"
                onMouseEnter={() => setHoveredPoint(p.record)}
                onMouseLeave={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(p.record)}
                onBlur={() => setHoveredPoint(null)}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 5.5 : 3}
                  fill={isHovered ? '#ffffff' : '#f43f5e'}
                  stroke="#17171b"
                  strokeWidth={1.5}
                  className="transition-all"
                />
                {/* Year X-axis label every 2-3 years or milestones */}
                {(p.record.year % 4 === 0 || p.record.year === 2026) && (
                  <text
                    x={p.x}
                    y={padding.top + innerHeight + 18}
                    textAnchor="middle"
                    className="text-xs font-mono fill-carbon-40"
                  >
                    {p.record.year}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default TemporalTrendChart;
