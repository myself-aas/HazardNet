import React, { useState, useMemo } from 'react';
import { ALL_64_DISTRICTS, ALL_8_DIVISIONS, DistrictData } from '../data/bangladeshDistricts';
import { getVulnerabilityColor, formatVulnerabilityScore, getVulnerabilityTier } from '../lib/geo';
import defaultVulnerabilityData from '../../public/data/historical/districts-vulnerability.json';

export interface DistrictVulnerabilityRecord {
  rank: number;
  district: string;
  division?: string;
  unique_hazard_types: number;
  total_events: number;
  avg_severity: number;
  cumulative_affected: number;
  vulnerability_score: number;
}

export interface DistrictRiskMapProps {
  districts?: DistrictVulnerabilityRecord[];
  selectedDistrict?: string | null;
  onSelectDistrict?: (districtName: string) => void;
  className?: string;
  lowBandwidth?: boolean;
}

export const DistrictRiskMap: React.FC<DistrictRiskMapProps> = ({
  districts = defaultVulnerabilityData as DistrictVulnerabilityRecord[],
  selectedDistrict = null,
  onSelectDistrict,
  className = '',
  lowBandwidth = false,
}) => {
  const [hoveredDistrict, setHoveredDistrict] = useState<{
    name: string;
    division: string;
    score: number;
    rank: number;
    events: number;
    hazardType: string;
    cx: number;
    cy: number;
  } | null>(null);

  const [activeDivisionFilter, setActiveDivisionFilter] = useState<string>('All');

  // Build a lookup map by lowercased/slug district name
  const vulnerabilityLookup = useMemo(() => {
    const map = new Map<string, DistrictVulnerabilityRecord>();
    for (const d of districts) {
      map.set(d.district.toLowerCase().replace(/[^a-z0-9]/g, ''), d);
    }
    return map;
  }, [districts]);

  // Merge static geographic coords with vulnerability stats
  const enrichedDistricts = useMemo(() => {
    return ALL_64_DISTRICTS.map((geo) => {
      const cleanKey = geo.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const vuln = vulnerabilityLookup.get(cleanKey);
      const score = vuln ? vuln.vulnerability_score : geo.severity;
      const rank = vuln ? vuln.rank : 0;
      const events = vuln ? vuln.total_events : 0;
      const hazardClass = geo.hazardType;

      return {
        ...geo,
        score,
        rank,
        events,
        hazardClass,
        color: getVulnerabilityColor(score),
        tier: getVulnerabilityTier(score),
      };
    });
  }, [vulnerabilityLookup]);

  const filteredDistricts = useMemo(() => {
    if (activeDivisionFilter === 'All') return enrichedDistricts;
    return enrichedDistricts.filter(
      (d) => d.division.toLowerCase() === activeDivisionFilter.toLowerCase()
    );
  }, [enrichedDistricts, activeDivisionFilter]);

  const divisionsList = useMemo(() => {
    return ['All', ...ALL_8_DIVISIONS.map((d) => d.name)];
  }, []);

  return (
    <div
      className={`relative w-full bg-carbon-90 border border-carbon-80 rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col text-carbon-10 ${className}`}
      data-testid="district-risk-map"
    >
      {/* Header controls & Division Quick Jump */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-carbon-80">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full bg-rose-500 ${
                lowBandwidth ? '' : 'animate-pulse'
              }`}
            />
            <h3 className="text-base font-bold text-white tracking-tight">
              Historical District Vulnerability Choropleth
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-carbon-80 text-rose-300 border border-carbon-70">
              64 Districts Analyzed (2000–2026)
            </span>
          </div>
          <p className="text-xs text-carbon-40 mt-1">
            Continuous empirical vulnerability ramp based on multi-hazard recurrence, frequency, and impacts.
          </p>
        </div>

        {/* Division Quick Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-thin">
          {divisionsList.map((div) => {
            const isSelected = activeDivisionFilter.toLowerCase() === div.toLowerCase();
            return (
              <button
                key={div}
                type="button"
                onClick={() => setActiveDivisionFilter(div)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-rose-600 text-white font-semibold shadow-sm'
                    : 'bg-carbon-80 text-carbon-30 hover:bg-carbon-70 hover:text-white'
                }`}
                aria-pressed={isSelected}
              >
                {div}
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Map Canvas Area */}
      <div className="relative w-full h-[420px] sm:h-[480px] bg-carbon-black/60 rounded-xl border border-carbon-80/80 overflow-hidden flex items-center justify-center p-2">
        {/* Tooltip Overlay */}
        {hoveredDistrict && (
          <div
            className="absolute top-4 right-4 z-30 bg-carbon-90/95 backdrop-blur-md border border-carbon-70 p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 w-[min(220px,calc(100%-1.5rem))] pointer-events-none text-carbon-20"
            role="tooltip"
          >
            <div className="flex items-center justify-between border-b border-carbon-80 pb-1.5">
              <span className="font-bold text-white text-sm">
                {hoveredDistrict.name}
              </span>
              <span
                className="px-2 py-0.5 rounded text-xs font-mono font-bold"
                style={{
                  backgroundColor: `${getVulnerabilityColor(hoveredDistrict.score)}22`,
                  color: getVulnerabilityColor(hoveredDistrict.score),
                  border: `1px solid ${getVulnerabilityColor(hoveredDistrict.score)}55`,
                }}
              >
                Rank #{hoveredDistrict.rank || 'N/A'}
              </span>
            </div>
            <div className="text-carbon-40">
              Division:{' '}
              <strong className="text-carbon-20">{hoveredDistrict.division}</strong>
            </div>
            <div className="text-carbon-40">
              Primary Hazard:{' '}
              <strong className="text-carbon-20">{hoveredDistrict.hazardType}</strong>
            </div>
            <div className="text-carbon-40">
              Historical Events:{' '}
              <strong className="text-carbon-20">{hoveredDistrict.events}</strong>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-carbon-80 font-mono">
              <span className="text-carbon-40">Vulnerability Index:</span>
              <span
                className="font-bold text-sm"
                style={{ color: getVulnerabilityColor(hoveredDistrict.score) }}
              >
                {formatVulnerabilityScore(hoveredDistrict.score)}
              </span>
            </div>
          </div>
        )}

        <svg
          viewBox="0 0 100 100"
          className="w-full h-full max-h-[460px] select-none"
          preserveAspectRatio="xMidYMid meet"
          role="region"
          aria-label="Bangladesh 64 District Risk Choropleth Map"
        >
          {/* Base Division Boundary Outlines for Context */}
          <g className="division-boundaries opacity-40">
            {ALL_8_DIVISIONS.map((div) => (
              <path
                key={div.id}
                d={div.path}
                fill={div.fill || '#17171b'}
                stroke={div.stroke || '#444447'}
                strokeWidth={0.35}
                strokeDasharray="1, 1"
              />
            ))}
          </g>

          {/* 64 District Markers with Choropleth Color Ramp */}
          <g className="districts-layer">
            {filteredDistricts.map((d) => {
              const isSelected =
                selectedDistrict &&
                d.name.toLowerCase() === selectedDistrict.toLowerCase();
              const isHovered =
                hoveredDistrict &&
                hoveredDistrict.name.toLowerCase() === d.name.toLowerCase();

              const radius = isSelected ? 2.4 : isHovered ? 2.1 : 1.6;
              const fill = d.color;

              return (
                <g
                  key={d.id}
                  role="graphics-symbol"
                  aria-label={`${d.name} - Vulnerability: ${formatVulnerabilityScore(
                    d.score
                  )}, Rank: ${d.rank}, Events: ${d.events}, Division: ${d.division}`}
                  tabIndex={0}
                  className="cursor-pointer transition-all duration-150 outline-hidden focus:outline-hidden"
                  onClick={() => onSelectDistrict && onSelectDistrict(d.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onSelectDistrict) onSelectDistrict(d.name);
                    }
                  }}
                  onMouseEnter={() =>
                    setHoveredDistrict({
                      name: d.name,
                      division: d.division,
                      score: d.score,
                      rank: d.rank,
                      events: d.events,
                      hazardType: d.hazardClass,
                      cx: d.cx,
                      cy: d.cy,
                    })
                  }
                  onMouseLeave={() => setHoveredDistrict(null)}
                  onFocus={() =>
                    setHoveredDistrict({
                      name: d.name,
                      division: d.division,
                      score: d.score,
                      rank: d.rank,
                      events: d.events,
                      hazardType: d.hazardClass,
                      cx: d.cx,
                      cy: d.cy,
                    })
                  }
                  onBlur={() => setHoveredDistrict(null)}
                >
                  {/* Highlight Ring for Selected or Hovered */}
                  {(isSelected || isHovered) && (
                    <circle
                      cx={d.cx}
                      cy={d.cy}
                      r={radius + 1.2}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={0.5}
                      strokeOpacity={0.9}
                    />
                  )}

                  {/* Core District Node */}
                  <circle
                    cx={d.cx}
                    cy={d.cy}
                    r={radius}
                    fill={fill}
                    stroke={isSelected ? '#ffffff' : '#17171b'}
                    strokeWidth={isSelected ? 0.6 : 0.3}
                  />

                  {/* Accessible / subtle district label when zoomed or high rank */}
                  {(isSelected || d.rank <= 5) && (
                    <text
                      x={d.cx}
                      y={d.cy - radius - 0.8}
                      textAnchor="middle"
                      /* svg-user-units: 3.4 == 12px at the narrowest rendered width (the viewBox
                         is 0 0 100 100 and the map is never narrower than ~353px), 20px at 600px.
                         A CSS px value here would be a user unit, not a font size - see the
                         legibility floor in __tests__/designTypography.test.js. */
                      className="text-xs font-sans font-bold fill-carbon-10 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    >
                      {d.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Vulnerability Color Ramp Legend */}
      <div className="mt-4 pt-3 border-t border-carbon-80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-carbon-40 font-medium">Vulnerability Index:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#16a34a]" />
            <span className="text-carbon-40 text-xs">Low (&lt;0.40)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ea580c]" />
            <span className="text-carbon-40 text-xs">Moderate (0.40–0.65)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#dc2626]" />
            <span className="text-carbon-40 text-xs">High (0.65–0.85)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#7f1d1d]" />
            <span className="text-carbon-40 text-xs">Critical (&ge;0.85)</span>
          </div>
        </div>

        <div className="text-carbon-50 text-xs">
          Click or press Enter on any district node to inspect historical hazard details.
        </div>
      </div>
    </div>
  );
};

export default DistrictRiskMap;
