import { useState } from 'react';
import {
  ALL_64_DISTRICTS,
  ALL_8_DIVISIONS,
  DistrictData,
  DivisionData
} from '../data/bangladeshDistricts';
import { LEVEL_COLOURS } from './alerts/AlertLevelBadge';

interface BangladeshSvgMapProps {
  onSelectDistrict?: (district: DistrictData) => void;
  onSelectDivision?: (division: DivisionData) => void;
  selectedDistrictId?: string;
  selectedDivisionId?: string;
  activeHazardFilter?: string;
  mapViewMode?: 'districts' | 'divisions';
  onOpenDisasterModal?: (districtId: string) => void;
  /**
   * Alert-engine choropleth (Phase 5): district slug → published alert level.
   *
   * When supplied, the district markers are coloured by *alert level* instead of the
   * static baseline severity, because those two things frequently disagree and only
   * one of them is a published alert. Districts absent from the map keep the baseline
   * colour and are labelled as baseline in the table — see `DistrictAlertTable`.
   */
  alertLevels?: Record<string, string> | null;
  /** level → already-translated label, for the accessible name of each marker. */
  alertLevelLabels?: Record<string, string> | null;
  /**
   * Low-bandwidth rendering: drop the pulsing glow circles, the ping rings and the
   * dotted background grid. The map stays fully usable (it is vector geometry) —
   * only the decoration that costs repaints goes away.
   */
  lowBandwidth?: boolean;
  /** Replaces the static severity legend when the alert layer is active. */
  legendSlot?: React.ReactNode;
}

export const BangladeshSvgMap: React.FC<BangladeshSvgMapProps> = ({
  onSelectDistrict,
  onSelectDivision,
  selectedDistrictId,
  selectedDivisionId = 'rangpur',
  activeHazardFilter = 'All',
  mapViewMode = 'districts',
  onOpenDisasterModal,
  alertLevels = null,
  alertLevelLabels = null,
  lowBandwidth = false,
  legendSlot = null,
}) => {
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictData | null>(null);
  const [hoveredDivision, setHoveredDivision] = useState<DivisionData | null>(null);
  const [hazardFilter, setHazardFilter] = useState<string>(activeHazardFilter);
  const [viewMode, setViewMode] = useState<'districts' | 'divisions'>(mapViewMode);

  const filteredDistricts = ALL_64_DISTRICTS.filter((d) => {
    if (hazardFilter === 'All') return true;
    return d.hazardType === hazardFilter;
  });

  const getSeverityColor = (sev: number) => {
    if (sev >= 0.8) return '#ef4444'; // Red
    if (sev >= 0.5) return '#f59e0b'; // Amber
    return '#10b981'; // Emerald
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-xl relative overflow-hidden flex flex-col justify-between text-slate-800">
      
      {/* Background Tech Grid (skipped in low-bandwidth mode: pure decoration) */}
      {!lowBandwidth && (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `radial-gradient(#94a3b8 0.75px, transparent 0.75px)`,
            backgroundSize: '16px 16px'
          }}
        />
      )}

      {/* Header & Map Level Mode Controls */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full bg-nasa-red ${lowBandwidth ? '' : 'animate-ping'}`}></span>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Vector Spatial Heatmap</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {viewMode === 'districts' ? 'All 64 Districts' : 'All 8 Divisions'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Vector spatial map with live multi-hazard severity indices
          </p>
        </div>

        {/* Mode & Hazard Filter Tabs.
            `w-full sm:w-auto` matters: the parent is `flex-col items-start` on small
            screens, so without it this row sizes to its *content* (463 px) instead of
            the card (327 px) — `flex-wrap` then has nothing to wrap against, the row
            overflows, and the ancestor's `overflow-hidden` clips the last filters with
            no scrollbar and no keyboard path. Measured at 375 px: row 463 px → 293 px,
            card no longer clips, every chip reachable. */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          
          {/* Districts vs Divisions Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('districts')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'districts'
                  ? 'bg-nasa-red text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              64 Districts
            </button>
            <button
              onClick={() => setViewMode('divisions')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'divisions'
                  ? 'bg-nasa-red text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8 Divisions
            </button>
          </div>

          {/* Hazard Quick Filters */}
          {/* `min-w-0` lets the hazard scroller shrink inside the flex row instead of
              forcing the row to its content width; without it the scroll container
              never becomes scrollable because the row grows past the card first. */}
          {viewMode === 'districts' && (
            <div className="flex items-center gap-1 overflow-x-auto max-w-full min-w-0">
              {['All', 'Flash Flood', 'Monsoon Flood', 'Tropical Cyclone', 'Drought'].map((f) => {
                const isAct = hazardFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setHazardFilter(f)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${
                      isAct
                        ? 'bg-slate-900 text-white font-bold border border-slate-900'
                        : 'text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* SVG Canvas Map Area */}
      <div className="relative z-10 w-full h-[380px] sm:h-[440px] flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200 p-2 overflow-hidden">
        
        {/* District Hover Tooltip Overlay */}
        {viewMode === 'districts' && hoveredDistrict && (
          <div className="absolute top-3 right-3 z-30 bg-white/95 backdrop-blur-md border border-slate-200 p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 max-w-[230px] pointer-events-none text-slate-800">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
              <span className="font-extrabold text-slate-900 text-sm">{hoveredDistrict.name}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                hoveredDistrict.risk === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}>
                {hoveredDistrict.risk} Risk
              </span>
            </div>
            <div className="text-slate-600">Division: <strong className="text-slate-900">{hoveredDistrict.division}</strong></div>
            <div className="text-slate-600">Hazard: <strong className="text-slate-900">{hoveredDistrict.hazardType}</strong></div>
            <div className="text-slate-600">Main Crop: <strong className="text-slate-800">{hoveredDistrict.mainCrop}</strong></div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-mono text-[11px]">
              <span className="text-slate-500">Model Output:</span>
              <span className="font-bold text-rose-600">{(hoveredDistrict.severity * 100).toFixed(0)}% Severity</span>
            </div>
          </div>
        )}

        {/* Division Hover Tooltip Overlay */}
        {viewMode === 'divisions' && hoveredDivision && (
          <div className="absolute top-3 right-3 z-30 bg-white/95 backdrop-blur-md border border-slate-200 p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 max-w-[240px] pointer-events-none text-slate-800">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
              <span className="font-extrabold text-slate-900 text-sm">{hoveredDivision.name}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                {hoveredDivision.districtCount} Districts
              </span>
            </div>
            <div className="text-slate-600">Division Capital: <strong className="text-slate-900">{hoveredDivision.capital}</strong></div>
            <div className="text-slate-600">Primary Hazard: <strong className="text-slate-900">{hoveredDivision.primaryHazard}</strong></div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-mono text-[11px]">
              <span className="text-slate-500">Avg Regional Severity:</span>
              <span className="font-bold text-rose-600">{(hoveredDivision.avgSeverity * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}

        <svg
          viewBox="0 0 100 100"
          className="w-full h-full max-h-[420px] drop-shadow-sm focus:outline-hidden"
          preserveAspectRatio="xMidYMid meet"
          role="region"
          aria-label="Interactive Vector Spatial Map of Bangladesh with multi-hazard risk indices"
        >
          <defs>
            <radialGradient id="highRiskGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="modRiskGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lowRiskGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Render 8 Division SVG Polygons */}
          {ALL_8_DIVISIONS.map((div) => {
            const isSelectedDiv = div.id === selectedDivisionId;
            return (
              <g
                key={div.id}
                tabIndex={0}
                role="button"
                aria-label={`${div.name}, Primary Hazard: ${div.primaryHazard}, Average Severity: ${(div.avgSeverity * 100).toFixed(0)}%`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (onSelectDivision) onSelectDivision(div);
                  }
                }}
                className="cursor-pointer outline-hidden focus:outline-hidden group/div"
              >
                <path
                  d={div.path}
                  fill={isSelectedDiv ? 'rgba(249, 168, 37, 0.25)' : '#f1f5f9'}
                  stroke={isSelectedDiv ? '#f64137' : '#cbd5e1'}
                  strokeWidth={isSelectedDiv ? '1.2' : '0.5'}
                  strokeDasharray={viewMode === 'divisions' ? 'none' : '1 1'}
                  onMouseEnter={() => setHoveredDivision(div)}
                  onMouseLeave={() => setHoveredDivision(null)}
                  onClick={() => onSelectDivision && onSelectDivision(div)}
                  className="transition-all duration-300 hover:fill-amber-100 group-focus/div:stroke-amber-600 group-focus/div:stroke-[1.5]"
                />

                {/* Render Division Centroid Labels in Division Mode */}
                {viewMode === 'divisions' && (
                  <g className="pointer-events-none">
                    <circle
                      cx={div.cx}
                      cy={div.cy}
                      r="2.5"
                      fill="#0f172a"
                      stroke="#ffffff"
                      strokeWidth="0.5"
                    />
                    <text
                      x={div.cx}
                      y={div.cy - 3.5}
                      fill="#0f172a"
                      fontSize="2.8"
                      fontWeight="bold"
                      textAnchor="middle"
                      className="font-sans font-extrabold select-none drop-shadow-xs"
                    >
                      {div.name.replace(' Division', '')}
                    </text>
                    <text
                      x={div.cx}
                      y={div.cy + 5}
                      fill="#475569"
                      fontSize="2"
                      fontFamily="monospace"
                      textAnchor="middle"
                      className="select-none"
                    >
                      {(div.avgSeverity * 100).toFixed(0)}% Sev
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* River Network Accents */}
          <path
            d="M 48,16 Q 46,35 58,53 T 54,72"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="0.8"
            strokeOpacity="0.6"
          />
          <path
            d="M 72,28 Q 65,40 58,53"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="0.6"
            strokeOpacity="0.6"
          />

          {/* Render All 64 District Nodes in Districts View Mode */}
          {viewMode === 'districts' &&
            filteredDistricts.map((dist) => {
              const isSelected = dist.id === selectedDistrictId;
              const alertLevel = alertLevels ? alertLevels[dist.id] : undefined;
              const color = alertLevel ? LEVEL_COLOURS[alertLevel as keyof typeof LEVEL_COLOURS] : getSeverityColor(dist.severity);
              const isHigh = !alertLevel && dist.severity >= 0.8;
              // Accessible name: the baseline risk is always stated, and the published
              // alert level is appended when one exists. A comma expression here would
              // silently print only the level code, so the label is built step by step.
              const alertLevelName = alertLevel
                ? String((alertLevelLabels && alertLevelLabels[alertLevel]) || alertLevel)
                : null;
              const alertLabel = alertLevelName ? `, HazardNet alert: ${alertLevelName}` : '';

              return (
                <g
                  key={dist.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${dist.name} District, Risk: ${dist.risk}, Hazard: ${dist.hazardType}, Severity: ${(dist.severity * 100).toFixed(0)}%${alertLabel}`}
                  onClick={() => {
                    if (onSelectDistrict) onSelectDistrict(dist);
                    if (onOpenDisasterModal) onOpenDisasterModal(dist.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onSelectDistrict) onSelectDistrict(dist);
                      if (onOpenDisasterModal) onOpenDisasterModal(dist.id);
                    }
                  }}
                  onMouseEnter={() => setHoveredDistrict(dist)}
                  onMouseLeave={() => setHoveredDistrict(null)}
                  className="cursor-pointer group outline-hidden focus:outline-hidden"
                >
                  {/* Heatmap Glow Circle (decorative; skipped in low-bandwidth mode) */}
                  {!lowBandwidth && (
                    <circle
                      cx={dist.cx}
                      cy={dist.cy}
                      r={isSelected ? 4.5 : isHigh ? 3.5 : 2.5}
                      fill={isHigh ? 'url(#highRiskGlow)' : 'url(#modRiskGlow)'}
                      className="animate-pulse opacity-80"
                    />
                  )}

                  {/* High Risk Ping Ring */}
                  {!lowBandwidth && isHigh && (
                    <circle
                      cx={dist.cx}
                      cy={dist.cy}
                      r="3"
                      fill="none"
                      stroke={color}
                      strokeWidth="0.3"
                      className="animate-ping opacity-75"
                    />
                  )}

                  {/* Primary District Center Marker */}
                  <circle
                    cx={dist.cx}
                    cy={dist.cy}
                    r={isSelected ? 2.2 : 1.4}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth="0.5"
                    className="transition-transform group-hover:scale-150 group-focus:scale-175 group-focus:stroke-[#0f172a] group-focus:stroke-[0.8]"
                  />

                  {/* Selected Ring */}
                  {isSelected && (
                    <circle
                      cx={dist.cx}
                      cy={dist.cy}
                      r={3.2}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="0.5"
                      strokeDasharray="0.6 0.6"
                    />
                  )}

                  {/* Label Text for Key Districts or Selected */}
                  {(isSelected || alertLevel || dist.severity >= 0.8 || dist.id === 'dhaka' || dist.id === 'rajshahi' || dist.id === 'chattogram' || dist.id === 'khulna') && (
                    <text
                      x={dist.cx + 1.8}
                      y={dist.cy + 0.8}
                      fill={isSelected ? '#0f172a' : '#334155'}
                      fontSize="1.9"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      className="font-sans pointer-events-none select-none drop-shadow-xs"
                    >
                      {dist.name}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>

      </div>

      {/* Footer Legend & Selected Node HUD */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
        
        {/* Legend: alert levels when the alert layer is on, baseline severity otherwise */}
        {legendSlot ? legendSlot : (
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-700">Severity Scale:</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Low (&lt;0.50)</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>High (&gt;0.75)</span>
          </div>
        </div>
        )}

        {/* Selected Zone Display */}
        <div className="flex flex-wrap items-center gap-2">
          {alertLevels && (
            <span className="font-mono text-[11px] text-slate-800 bg-amber-50 px-3 py-1 rounded-lg border border-amber-300">
              Alert layer: <strong>{Object.keys(alertLevels).length} districts</strong>
            </span>
          )}
          <div className="font-mono text-[11px] text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
            Showing: <strong>{viewMode === 'districts' ? `${filteredDistricts.length} / 64 Districts` : 'All 8 Divisions'}</strong>
          </div>
        </div>

      </div>

    </div>
  );
};

export default BangladeshSvgMap;
