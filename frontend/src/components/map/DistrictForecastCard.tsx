import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import MaterialIcon from '../MaterialIcon';
import { LocationMap } from '../ui/expand-map';
import { DistrictData } from '../../data/bangladeshDistricts';

/**
 * District forecast card for the live map (compact edition).
 *
 * Design constraints, from field feedback:
 *  - docks BELOW the top navbar (top-20/sm:top-24) — never cropped at the top
 *  - height is hard-capped to the measured map viewport (JS-measured inline
 *    maxHeight + CSS fallback) with an internal scroll region — never
 *    cropped at the bottom, even with the location map expanded
 *  - compact: single-row fact grid, collapsible location map (collapsed by
 *    default), tightened paddings
 *  - wider (sm:max-w-[440px]) so the one-row facts stay readable
 *  - translucent glass background (bg-white/85 + backdrop blur) so the map
 *    stays visible underneath
 */

export type DistrictWithRisk = DistrictData & { severity: number; risk: string };

export interface DistrictForecastCardProps {
  district: DistrictWithRisk;
  onClose: () => void;
  onOpenAnalytics: (districtId: string) => void;
}

const riskTone = (severity: number) =>
  severity >= 0.8
    ? {
        badge: 'bg-rose-100/90 text-rose-800 border-rose-200/80',
        text: 'text-rose-600',
        bar: 'bg-rose-500',
        ring: 'border-rose-300/70',
      }
    : severity >= 0.5
      ? {
          badge: 'bg-amber-100/90 text-amber-800 border-amber-200/80',
          text: 'text-amber-600',
          bar: 'bg-amber-500',
          ring: 'border-amber-300/70',
        }
      : {
          badge: 'bg-emerald-100/90 text-emerald-800 border-emerald-200/80',
          text: 'text-emerald-600',
          bar: 'bg-emerald-500',
          ring: 'border-emerald-300/70',
        };

export const DistrictForecastCard: React.FC<DistrictForecastCardProps> = ({
  district,
  onClose,
  onOpenAnalytics,
}) => {
  const [showLocationMap, setShowLocationMap] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measuredMaxHeight, setMeasuredMaxHeight] = useState<number | null>(null);
  const tone = riskTone(district.severity);
  const severityPct = Math.round(district.severity * 100);

  /**
   * Measure the real space between the card's top edge and the bottom of the
   * map overlay (the card's parent covers the map viewport). An inline
   * maxHeight beats any percentage-resolution quirks in the ancestor chain
   * (absolute + animated HUD layers), so the card can never overflow the map
   * — it scrolls internally instead.
   */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const parent = wrapper?.parentElement;
    if (!wrapper || !parent) return;

    const measure = () => {
      const parentBottom = parent.getBoundingClientRect().bottom;
      const cardTop = wrapper.getBoundingClientRect().top;
      const available = Math.floor(parentBottom - cardTop - 12); // breathing room
      setMeasuredMaxHeight(available > 120 ? available : null);
    };

    measure();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(parent);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <motion.div
      ref={wrapperRef}
      initial={{ opacity: 0, y: -12, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -12, x: 20 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      /* top-20 (80px) mobile / top-24 (96px) desktop clears the ~70px sticky
         navbar; the measured maxHeight (inline) + calc fallback cap keep the
         card inside the map viewport, scrolling internally when the location
         map is expanded on short viewports. */
      style={measuredMaxHeight ? { maxHeight: `${measuredMaxHeight}px` } : undefined}
      className="absolute top-20 sm:top-24 left-4 right-4 sm:left-auto sm:right-6 z-[1000] pointer-events-auto sm:max-w-[440px] w-auto sm:w-full max-h-[calc(100%_-_5.5rem)] sm:max-h-[calc(100%_-_7rem)] flex flex-col"
      role="dialog"
      aria-label={`${district.name} district forecast`}
    >
      <div className="flex flex-col flex-1 min-h-0 bg-white/85 backdrop-blur-md border border-slate-200/70 rounded-2xl shadow-xl text-slate-800 relative overflow-hidden">
        {/* amber identity strip */}
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]" />

        {/* Header (fixed) */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-200/60 pb-2 pt-3 px-3.5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              <MaterialIcon name="radar" className="w-3 h-3 text-[#d08305]" />
              District Forecast
            </div>
            <h4 className="text-sm font-black text-slate-900 tracking-tight mt-0.5 truncate">
              {district.name} District
              <span className="ml-1.5 font-mono text-[9px] font-bold text-slate-400">{district.division.toUpperCase()}</span>
            </h4>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${tone.badge}`}>
              {district.risk} Risk
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded-full bg-slate-100/80 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center text-[11px] transition-colors cursor-pointer border border-slate-200/80"
              title="Close district forecast"
              aria-label="Close district forecast"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body (only if the viewport is very short) */}
        <div className="flex flex-col gap-2 p-3 overflow-y-auto overscroll-contain min-h-0">
          {/* Primary hazard + severity meter */}
          <div className={`bg-white/60 border ${tone.ring} rounded-xl px-2.5 py-2 flex flex-col gap-1.5`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${tone.bar} animate-pulse`} aria-hidden="true" />
                {district.hazardType}
              </span>
              <span className={`text-[11px] font-black font-mono ${tone.text}`}>{severityPct}% Severity</span>
            </div>
            <div
              className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden"
              role="meter"
              aria-valuenow={severityPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${district.name} hazard severity`}
            >
              <div
                className={`h-full rounded-full ${tone.bar} transition-all duration-700`}
                style={{ width: `${severityPct}%` }}
              />
            </div>
          </div>

          {/* District facts — single compact row */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="bg-white/60 p-1.5 rounded-lg border border-slate-200/70 min-w-0" title={`Main crop: ${district.mainCrop}`}>
              <span className="text-slate-500 block text-[8px] font-bold uppercase tracking-wide">Main Crop</span>
              <span className="font-bold text-slate-800 truncate block">{district.mainCrop}</span>
            </div>
            <div className="bg-white/60 p-1.5 rounded-lg border border-slate-200/70 min-w-0">
              <span className="text-slate-500 block text-[8px] font-bold uppercase tracking-wide">Elevation</span>
              <span className="font-bold text-slate-800">{district.elevationMeters}m MSL</span>
            </div>
            <div className="bg-white/60 p-1.5 rounded-lg border border-slate-200/70 min-w-0">
              <span className="text-slate-500 block text-[8px] font-bold uppercase tracking-wide">Coords</span>
              <span className="font-bold font-mono text-sky-700">
                {district.lat.toFixed(2)}°N, {district.lng.toFixed(2)}°E
              </span>
            </div>
          </div>

          {/* Collapsible location map (collapsed by default to keep compact) */}
          <button
            type="button"
            onClick={() => setShowLocationMap((value) => !value)}
            aria-expanded={showLocationMap}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/60 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-white/90 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <MaterialIcon name="map" className="w-3 h-3 text-[#d08305]" />
              Location Map
            </span>
            <span className={`transition-transform ${showLocationMap ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
          </button>
          {showLocationMap && (
            <div className="overflow-hidden">
              <LocationMap
                location={`${district.name} District, ${district.division}`}
                coordinates={`${district.lat.toFixed(4)}° N, ${district.lng.toFixed(4)}° E`}
                lat={district.lat}
                lng={district.lng}
                hazardType={district.hazardType}
                severity={district.severity}
                risk={district.risk}
                division={district.division}
                elevation={district.elevationMeters}
              />
            </div>
          )}
        </div>

        {/* CTA (fixed) */}
        <div className="px-3 pb-3 shrink-0">
          <button
            type="button"
            onClick={() => onOpenAnalytics(district.id)}
            className="w-full py-2 bg-[#f9a825] hover:bg-[#d08305] text-white font-black text-[11px] rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <MaterialIcon name="analytics" className="w-3.5 h-3.5" />
            View Detailed Disaster Analytics
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default DistrictForecastCard;
