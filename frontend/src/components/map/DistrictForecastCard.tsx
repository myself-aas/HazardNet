import React from 'react';
import { motion } from 'framer-motion';
import MaterialIcon from '../MaterialIcon';
import { LocationMap } from '../ui/expand-map';
import { DistrictData } from '../../data/bangladeshDistricts';

/**
 * District forecast card for the live map.
 *
 * Replaces the old native Leaflet popup + inline "Targeted Location Hazard"
 * HUD, both of which were cropped behind the sticky top navbar (they docked
 * at top-6 / opened above the marker inside the map pane). This card is a
 * viewport-docked overlay that always sits BELOW the navbar (top-20/top-24)
 * and above the Leaflet panes, so it can never be clipped.
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
        badge: 'bg-rose-100 text-rose-800 border-rose-200',
        text: 'text-rose-600',
        bar: 'bg-rose-500',
        ring: 'border-rose-300',
      }
    : severity >= 0.5
      ? {
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
          text: 'text-amber-600',
          bar: 'bg-amber-500',
          ring: 'border-amber-300',
        }
      : {
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          text: 'text-emerald-600',
          bar: 'bg-emerald-500',
          ring: 'border-emerald-300',
        };

export const DistrictForecastCard: React.FC<DistrictForecastCardProps> = ({
  district,
  onClose,
  onOpenAnalytics,
}) => {
  const tone = riskTone(district.severity);
  const severityPct = Math.round(district.severity * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -12, x: 20 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      /* top-20 (80px) on mobile / top-24 (96px) on desktop clears the
         ~70px sticky navbar that overlays the fullscreen map. */
      className="absolute top-20 sm:top-24 left-4 right-4 sm:left-auto sm:right-6 z-[1000] pointer-events-auto sm:max-w-[340px] w-auto sm:w-full"
      role="dialog"
      aria-label={`${district.name} district forecast`}
    >
      <div className="bg-white/98 border border-slate-200 rounded-2xl shadow-2xl text-slate-800 flex flex-col gap-3 relative overflow-hidden">
        {/* amber identity strip */}
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]" />

        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 pt-3.5 px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              <MaterialIcon name="radar" className="w-3.5 h-3.5 text-[#d08305]" />
              District Forecast
            </div>
            <h4 className="text-base font-black text-slate-900 tracking-tight mt-0.5 truncate">
              {district.name} District
            </h4>
            <p className="text-[10px] font-bold text-slate-400 font-mono mt-0.5">
              {district.division.toUpperCase()} DIVISION · BANGLADESH
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${tone.badge}`}>
              {district.risk} Risk
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center text-xs transition-colors cursor-pointer border border-slate-200 shadow-xs"
              title="Close district forecast"
              aria-label="Close district forecast"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Primary hazard + severity meter */}
        <div className={`mx-4 bg-slate-50 border ${tone.ring} rounded-xl p-3 flex flex-col gap-2`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${tone.bar} animate-pulse`} aria-hidden="true" />
              {district.hazardType}
            </span>
            <span className={`text-xs font-black font-mono ${tone.text}`}>{severityPct}% Severity</span>
          </div>
          <div
            className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"
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
          <p className="text-[10px] font-semibold text-slate-500">
            Classified primary hazard · physical severity index
          </p>
        </div>

        {/* District facts */}
        <div className="grid grid-cols-2 gap-2 px-4 text-[11px]">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wide">Main Crop</span>
            <span className="font-bold text-slate-800">{district.mainCrop}</span>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wide">Elevation</span>
            <span className="font-bold text-slate-800">{district.elevationMeters}m MSL</span>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 col-span-2">
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wide">Coordinates</span>
            <span className="font-bold font-mono text-sky-700">
              {district.lat.toFixed(2)}°N, {district.lng.toFixed(2)}°E
            </span>
          </div>
        </div>

        {/* Expandable location map tile */}
        <div className="px-4">
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

        {/* CTA */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => onOpenAnalytics(district.id)}
            className="w-full py-2.5 bg-[#f9a825] hover:bg-[#d08305] text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
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
