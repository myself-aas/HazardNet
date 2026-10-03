import React, { useState, useMemo } from 'react';
import defaultDistribution from '../../public/data/historical/hazard-distribution.json';

export interface HazardDistributionRecord {
  hazard_type: string;
  event_count: number;
  percentage: number;
  mean_severity: number;
  std_severity: number;
  max_severity: number;
  total_affected: number;
}

export interface MultiHazardDistributionChartProps {
  data?: HazardDistributionRecord[];
  className?: string;
  lowBandwidth?: boolean;
}

const COLOR_PALETTE = [
  '#3b82f6', // Flood (Blue)
  '#ef4444', // Tropical Cyclone (Red)
  '#f59e0b', // Severe Local Storm (Amber)
  '#06b6d4', // Flash Flood (Cyan)
  '#8b5cf6', // Cold Wave (Purple)
  '#ec4899', // Epidemic (Pink)
  '#f97316', // Earthquake (Orange)
  '#dc2626', // Fire (Dark Red)
  '#eab308', // Drought (Yellow)
  '#fb923c', // Heat Wave (Light Orange)
];

export const MultiHazardDistributionChart: React.FC<MultiHazardDistributionChartProps> = ({
  data = defaultDistribution as HazardDistributionRecord[],
  className = '',
  lowBandwidth = false,
}) => {
  const [hoveredHazard, setHoveredHazard] = useState<HazardDistributionRecord | null>(null);

  const totalEvents = useMemo(() => {
    return data.reduce((sum, item) => sum + item.event_count, 0);
  }, [data]);

  // Donut geometry calculations
  const size = 300;
  const radius = 110;
  const innerRadius = 65;
  const center = size / 2;

  // Calculate SVG arc paths for donut
  const slices = useMemo(() => {
    let accumulatedAngle = 0;
    return data.map((item, idx) => {
      const fraction = item.event_count / (totalEvents || 1);
      const angle = fraction * 2 * Math.PI;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle += angle;

      // Arc coordinates
      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const x3 = center + innerRadius * Math.cos(endAngle);
      const y3 = center + innerRadius * Math.sin(endAngle);
      const x4 = center + innerRadius * Math.cos(startAngle);
      const y4 = center + innerRadius * Math.sin(startAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      const pathData = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z',
      ].join(' ');

      return {
        ...item,
        path: pathData,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
      };
    });
  }, [data, totalEvents, center, radius, innerRadius]);

  return (
    <div
      className={`bg-carbon-90 border border-carbon-80 rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col text-carbon-10 ${className}`}
      data-testid="multi-hazard-distribution-chart"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-carbon-80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-tight">
              Multi-Hazard Classification Breakdown
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/60 text-rose-300 border border-rose-800/60">
              {data.length} Hazard Classes
            </span>
          </div>
          <p className="text-xs text-carbon-40 mt-1">
            Empirical historical frequency distribution of meteorological and geophysical hazards.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Donut Chart Canvas */}
        <div className="lg:col-span-6 flex items-center justify-center relative">
          <div className="relative w-[280px] h-[280px]">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-full h-full select-none"
              role="img"
              aria-label="Multi-hazard classification distribution donut chart"
            >
              {slices.map((slice) => {
                const isHovered = hoveredHazard?.hazard_type === slice.hazard_type;
                return (
                  <path
                    key={slice.hazard_type}
                    d={slice.path}
                    fill={slice.color}
                    stroke="#17171b"
                    strokeWidth={isHovered ? 2.5 : 1}
                    className="cursor-pointer transition-transform hover:opacity-90 focus:outline-hidden"
                    tabIndex={0}
                    role="button"
                    aria-label={`${slice.hazard_type}: ${slice.event_count} events (${slice.percentage}%)`}
                    onMouseEnter={() => setHoveredHazard(slice)}
                    onMouseLeave={() => setHoveredHazard(null)}
                    onFocus={() => setHoveredHazard(slice)}
                    onBlur={() => setHoveredHazard(null)}
                  />
                );
              })}
            </svg>

            {/* Central Donut Readout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {hoveredHazard ? (
                <>
                  <span className="text-xs font-medium text-carbon-40 max-w-[100px] truncate">
                    {hoveredHazard.hazard_type}
                  </span>
                  <span className="text-lg font-bold font-mono text-white">
                    {hoveredHazard.event_count}
                  </span>
                  <span className="text-xs font-mono text-rose-400 font-bold">
                    {hoveredHazard.percentage}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs text-carbon-40">Total Recorded</span>
                  <span className="text-xl font-bold font-mono text-white">
                    {totalEvents.toLocaleString()}
                  </span>
                  <span className="text-xs text-carbon-50">2000–2026</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Legend / Breakdown List */}
        <div className="lg:col-span-6 space-y-2">
          {slices.map((item) => {
            const isHovered = hoveredHazard?.hazard_type === item.hazard_type;
            return (
              <div
                key={item.hazard_type}
                tabIndex={0}
                role="button"
                onMouseEnter={() => setHoveredHazard(item)}
                onMouseLeave={() => setHoveredHazard(null)}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  isHovered ? 'bg-carbon-80' : 'bg-carbon-black/40 hover:bg-carbon-80/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs font-medium text-carbon-20 truncate">
                    {item.hazard_type}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs shrink-0">
                  <span className="text-carbon-40">{item.event_count.toLocaleString()}</span>
                  <span className="text-carbon-20 font-bold w-12 text-right">
                    {item.percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MultiHazardDistributionChart;
