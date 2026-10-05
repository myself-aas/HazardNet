import { useRef, useState } from 'react';
import {
  ALL_64_DISTRICTS,
  ALL_8_DIVISIONS,
  DistrictData,
  DivisionData
} from '../data/bangladeshDistricts';
import { LEVEL_COLOURS } from './alerts/AlertLevelBadge';
import { SEVERITY_TIERS, getSeverityVar, severityTierRange } from '../services/geolocationService';

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
  /**
   * Roving tabindex. Every marker used to be `tabIndex={0}`, which put 64
   * districts plus 8 divisions — 72 stops — in the page's tab order, so a
   * keyboard user had to press Tab 72 times to get past the map. The map is
   * one composite widget: it takes a single stop, and Arrow keys move the
   * active marker inside it. Home/End jump to the ends.
   */
  const [activeIndex, setActiveIndex] = useState(0);
  const markerRefs = useRef<Record<number, SVGGElement | null>>({});
  const [activeDivIndex, setActiveDivIndex] = useState(0);
  const divisionRefs = useRef<Record<number, SVGGElement | null>>({});

  const gridKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    count: number,
    activate: () => void,
    refs: React.MutableRefObject<Record<number, SVGGElement | null>> = markerRefs,
    setIndex: (n: number) => void = setActiveIndex,
  ) => {
    const moveActive = (delta: number) => {
      const next = Math.max(0, Math.min(count - 1, index + delta));
      setIndex(next);
      refs.current[next]?.focus();
    };
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); moveActive(1); break;
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
      case 'Home': e.preventDefault(); moveActive(-count); break;
      case 'End': e.preventDefault(); moveActive(count); break;
      case 'Enter': case ' ': e.preventDefault(); activate(); break;
      default: break;
    }
  };

  const filteredDistricts = ALL_64_DISTRICTS.filter((d) => {
    if (hazardFilter === 'All') return true;
    return d.hazardType === hazardFilter;
  });

  return (
    <div className="w-full bg-white rounded-2xl border border-carbon-20 p-4 shadow-xl relative overflow-hidden flex flex-col justify-between text-carbon-80">
      
      {/* Background Tech Grid (skipped in low-bandwidth mode: pure decoration) */}
      {!lowBandwidth && (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: 'radial-gradient(var(--color-carbon-40) 0.75px, transparent 0.75px)',
            backgroundSize: '16px 16px'
          }}
        />
      )}

      {/* Header & Map Level Mode Controls */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-carbon-20">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full bg-ap-primary ${lowBandwidth ? '' : 'animate-ping'}`}></span>
            <h3 className="text-sm font-extrabold text-carbon-90 tracking-tight flex items-center gap-2">
              <span>Vector Spatial Heatmap</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-carbon-10 text-carbon-70 border border-carbon-20">
              {viewMode === 'districts' ? 'All 64 Districts' : 'All 8 Divisions'}
            </span>
          </div>
          <p className="text-xs text-carbon-60 mt-0.5">
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
          <div className="flex items-center bg-carbon-10 p-1 rounded-xl border border-carbon-20 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('districts')}
              aria-pressed={viewMode === 'districts'}
              className={`min-h-[44px] px-2.5 py-1 rounded-lg font-bold transition-colors ${
                viewMode === 'districts'
                  ? 'bg-primary text-ap-action-fg shadow-xs'
                  : 'text-carbon-60 hover:text-carbon-90'
              }`}
            >
              64 Districts
            </button>
            <button
              type="button"
              onClick={() => setViewMode('divisions')}
              aria-pressed={viewMode === 'divisions'}
              className={`min-h-[44px] px-2.5 py-1 rounded-lg font-bold transition-colors ${
                viewMode === 'divisions'
                  ? 'bg-primary text-ap-action-fg shadow-xs'
                  : 'text-carbon-60 hover:text-carbon-90'
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
                    type="button"
                    onClick={() => setHazardFilter(f)}
                    aria-pressed={isAct}
                    className={`min-h-[44px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      isAct
                        ? 'bg-carbon-90 text-ap-on-inverse font-bold border border-carbon-90'
                        : 'text-carbon-60 bg-carbon-05 hover:bg-carbon-10 border border-carbon-20'
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
      <div className="relative z-10 w-full h-[380px] sm:h-[440px] flex items-center justify-center bg-carbon-05 rounded-xl border border-carbon-20 p-2 overflow-hidden">
        
        {/* District Hover Tooltip Overlay */}
        {viewMode === 'districts' && hoveredDistrict && (
          <div className="absolute top-3 right-3 z-30 bg-white/95 backdrop-blur-md border border-carbon-20 p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 max-w-[230px] pointer-events-none text-carbon-80">
            <div className="flex items-center justify-between gap-2 border-b border-carbon-20 pb-1">
              <span className="font-extrabold text-carbon-90 text-sm">{hoveredDistrict.name}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                hoveredDistrict.risk === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}>
                {hoveredDistrict.risk} Risk
              </span>
            </div>
            <div className="text-carbon-60">Division: <strong className="text-carbon-90">{hoveredDistrict.division}</strong></div>
            <div className="text-carbon-60">Hazard: <strong className="text-carbon-90">{hoveredDistrict.hazardType}</strong></div>
            <div className="text-carbon-60">Main Crop: <strong className="text-carbon-80">{hoveredDistrict.mainCrop}</strong></div>
            <div className="flex items-center justify-between pt-1 border-t border-carbon-20 font-mono text-xs">
              <span className="text-carbon-60">Model Output:</span>
              <span className="font-bold text-rose-600">{(hoveredDistrict.severity * 100).toFixed(0)}% Severity</span>
            </div>
          </div>
        )}

        {/* Division Hover Tooltip Overlay */}
        {viewMode === 'divisions' && hoveredDivision && (
          <div className="absolute top-3 right-3 z-30 bg-white/95 backdrop-blur-md border border-carbon-20 p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 max-w-[240px] pointer-events-none text-carbon-80">
            <div className="flex items-center justify-between gap-2 border-b border-carbon-20 pb-1">
              <span className="font-extrabold text-carbon-90 text-sm">{hoveredDivision.name}</span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-carbon-10 text-carbon-80 border border-carbon-20">
                {hoveredDivision.districtCount} Districts
              </span>
            </div>
            <div className="text-carbon-60">Division Capital: <strong className="text-carbon-90">{hoveredDivision.capital}</strong></div>
            <div className="text-carbon-60">Primary Hazard: <strong className="text-carbon-90">{hoveredDivision.primaryHazard}</strong></div>
            <div className="flex items-center justify-between pt-1 border-t border-carbon-20 font-mono text-xs">
              <span className="text-carbon-60">Avg Regional Severity:</span>
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
              <stop offset="0%" stopColor="var(--ap-sev-very-high)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--ap-sev-very-high)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="modRiskGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--ap-sev-moderate)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--ap-sev-moderate)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lowRiskGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--ap-sev-low)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--ap-sev-low)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Render 8 Division SVG Polygons */}
          {ALL_8_DIVISIONS.map((div, divIndex) => {
            const isSelectedDiv = div.id === selectedDivisionId;
            return (
              <g
                key={div.id}
                ref={(el) => { divisionRefs.current[divIndex] = el; }}
                /* Only the layer the reader is actually working in takes a tab
                   stop. In districts mode the division polygons are background
                   geography, so putting all 8 of them in the tab order just
                   made the reader pass through the basemap twice. */
                tabIndex={viewMode === 'divisions' && divIndex === activeDivIndex ? 0 : -1}
                role="button"
                aria-label={`${div.name}, Primary Hazard: ${div.primaryHazard}, Average Severity: ${(div.avgSeverity * 100).toFixed(0)}%`}
                onFocus={() => setActiveDivIndex(divIndex)}
                onKeyDown={(e) => gridKeyDown(
                  e, divIndex, ALL_8_DIVISIONS.length,
                  () => { if (onSelectDivision) onSelectDivision(div); },
                  divisionRefs, setActiveDivIndex,
                )}
                className="cursor-pointer group/div focus:outline-hidden"
              >
                <path
                  d={div.path}
                  fill={isSelectedDiv ? 'var(--color-ap-primary)' : 'var(--color-carbon-05)'}
                  fillOpacity={isSelectedDiv ? 0.18 : 1}
                  stroke={isSelectedDiv ? 'var(--color-ap-primary)' : 'var(--color-carbon-20)'}
                  strokeWidth={isSelectedDiv ? '1.2' : '0.5'}
                  strokeDasharray={viewMode === 'divisions' ? 'none' : '1 1'}
                  onMouseEnter={() => setHoveredDivision(div)}
                  onMouseLeave={() => setHoveredDivision(null)}
                  onClick={() => onSelectDivision && onSelectDivision(div)}
                  /* Selection and hover are CHROME, so they use the one accent.
                     Amber here used to collide with the severity encoding: an
                     amber-filled division looked like a moderate-severity
                     reading rather than the thing you had clicked. */
                  className="transition-colors duration-300 hover:fill-ap-primary/10"
                />
                {/* Focus ring, drawn as geometry. `focus:outline-hidden` on its
                    own removed the only keyboard affordance (WCAG 2.4.7); the
                    accent stroke below replaces it and clears 3:1 against both
                    the canvas and the division fill in either theme. */}
                <path
                  d={div.path}
                  fill="none"
                  stroke="var(--ap-focus-ring)"
                  strokeWidth="1.6"
                  className="pointer-events-none opacity-0 group-focus-visible/div:opacity-100"
                />

                {/* Render Division Centroid Labels in Division Mode */}
                {viewMode === 'divisions' && (
                  <g className="pointer-events-none">
                    <circle
                      cx={div.cx}
                      cy={div.cy}
                      r="2.5"
                      fill="var(--color-carbon-90)"
                      stroke="var(--ap-bg-canvas)"
                      strokeWidth="0.5"
                    />
                    <text
                      x={div.cx}
                      y={div.cy - 3.5}
                      fill="var(--color-carbon-90)"
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
                      fill="var(--color-carbon-60)"
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
            stroke="var(--ap-haz-flood)"
            strokeWidth="0.8"
            strokeOpacity="0.6"
          />
          <path
            d="M 72,28 Q 65,40 58,53"
            fill="none"
            stroke="var(--ap-haz-flood)"
            strokeWidth="0.6"
            strokeOpacity="0.6"
          />

          {/* Render All 64 District Nodes in Districts View Mode */}
          {viewMode === 'districts' &&
            filteredDistricts.map((dist, index) => {
              const isSelected = dist.id === selectedDistrictId;
              const alertLevel = alertLevels ? alertLevels[dist.id] : undefined;
              const color = alertLevel ? LEVEL_COLOURS[alertLevel as keyof typeof LEVEL_COLOURS] : getSeverityVar(dist.severity);
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
                  ref={(el) => { markerRefs.current[index] = el; }}
                  tabIndex={index === activeIndex ? 0 : -1}
                  role="button"
                  aria-label={`${dist.name} District, Risk: ${dist.risk}, Hazard: ${dist.hazardType}, Severity: ${(dist.severity * 100).toFixed(0)}%${alertLabel}`}
                  onClick={() => {
                    setActiveIndex(index);
                    if (onSelectDistrict) onSelectDistrict(dist);
                    if (onOpenDisasterModal) onOpenDisasterModal(dist.id);
                  }}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(e) => gridKeyDown(e, index, filteredDistricts.length, () => {
                    if (onSelectDistrict) onSelectDistrict(dist);
                    if (onOpenDisasterModal) onOpenDisasterModal(dist.id);
                  })}
                  onMouseEnter={() => setHoveredDistrict(dist)}
                  onMouseLeave={() => setHoveredDistrict(null)}
                  className="cursor-pointer group focus:outline-hidden"
                >
                  {/* Hit target. The painted marker is r=1.4 in a 100-unit
                      viewBox, which is about 12 CSS px across at this map's
                      rendered size — half of the 24 px WCAG 2.5.8 floor, and
                      genuinely hard to hit on a phone. This transparent circle
                      carries the pointer and gives every district the same
                      ~29 px target without changing the drawing. */}
                  <circle cx={dist.cx} cy={dist.cy} r="3.5" fill="transparent" />
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
                    stroke="var(--ap-bg-canvas)"
                    strokeWidth="0.5"
                    className="transition-transform group-hover:scale-150"
                  />

                  {/* Keyboard focus ring. Separate geometry rather than a
                      stroke swap, so it reads at 3:1 against the marker fill
                      whatever severity colour that marker happens to be. */}
                  <circle
                    cx={dist.cx}
                    cy={dist.cy}
                    r="3.2"
                    fill="none"
                    stroke="var(--ap-focus-ring)"
                    strokeWidth="0.7"
                    className="pointer-events-none opacity-0 group-focus-visible:opacity-100"
                  />

                  {/* Selected Ring */}
                  {isSelected && (
                    <circle
                      cx={dist.cx}
                      cy={dist.cy}
                      r={3.2}
                      fill="none"
                      stroke="var(--color-carbon-90)"
                      strokeWidth="0.5"
                      strokeDasharray="0.6 0.6"
                    />
                  )}

                  {/* Label Text for Key Districts or Selected */}
                  {(isSelected || alertLevel || dist.severity >= 0.8 || dist.id === 'dhaka' || dist.id === 'rajshahi' || dist.id === 'chattogram' || dist.id === 'khulna') && (
                    <text
                      x={dist.cx + 1.8}
                      y={dist.cy + 0.8}
                      fill={isSelected ? 'var(--color-carbon-90)' : 'var(--color-carbon-80)'}
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
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-carbon-20 text-xs text-carbon-60">
        
        {/* Legend: alert levels when the alert layer is on, baseline severity otherwise */}
        {legendSlot ? legendSlot : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-bold text-carbon-70">Severity scale:</span>
          {/* Rendered straight off SEVERITY_TIERS, the same table
              getSeverityVar paints the markers from. The previous key was
              written by hand and had drifted: it showed three bands where the
              map drew five, its swatches were emerald/amber/rose while the
              markers used the Apple severity ramp, and the thresholds it
              printed ("<0.50", ">0.75") were neither of the two the code
              actually used. A key that disagrees with the map is worse than
              no key, so it can no longer be written separately. */}
          {SEVERITY_TIERS.map((tier, i) => (
            <span key={tier.tier} className="flex items-center gap-1.5 font-mono text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(${tier.cssVar})` }}
                aria-hidden="true"
              />
              <span>{tier.label} <span className="text-carbon-50">{severityTierRange(i)}</span></span>
            </span>
          ))}
        </div>
        )}

        {/* Selected Zone Display */}
        <div className="flex flex-wrap items-center gap-2">
          {alertLevels && (
            <span className="font-mono text-xs text-carbon-80 bg-amber-50 px-3 py-1 rounded-lg border border-amber-300">
              Alert layer: <strong>{Object.keys(alertLevels).length} districts</strong>
            </span>
          )}
          <div className="font-mono text-xs text-carbon-80 bg-carbon-10 px-3 py-1 rounded-lg border border-carbon-20">
            Showing: <strong>{viewMode === 'districts' ? `${filteredDistricts.length} / 64 Districts` : 'All 8 Divisions'}</strong>
          </div>
        </div>

        <p className="mt-2 text-xs leading-snug text-carbon-60">
          Map lines delineate study areas and do not necessarily depict accepted national boundaries.
        </p>

      </div>

    </div>
  );
};

export default BangladeshSvgMap;
