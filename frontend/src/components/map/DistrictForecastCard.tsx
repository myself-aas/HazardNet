import React, { useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { LocationMap } from '../ui/expand-map';
import { DistrictData } from '../../data/bangladeshDistricts';

/**
 * Selected-district summary for the live map.
 *
 * Mobile: in-flow below the map (parent layout). Desktop: overlay max 320px
 * with a 16px gutter, never covering attribution.
 */

export type DistrictWithRisk = DistrictData & { severity: number; risk: string };

export interface DistrictForecastCardProps {
  district: DistrictWithRisk;
  onClose: () => void;
  onOpenAnalytics: (districtId: string) => void;
  /**
   * Opens the in-map AI advisory / model-metrics drawer. Optional because the
   * drawer only exists on the full-screen GIS stage; the card is also rendered
   * by the embedded consoles, which have no drawer to open.
   */
  onOpenAdvisory?: () => void;
}

const riskTone = (severity: number) =>
  severity >= 0.8
    ? {
        badge: 'bg-severity-high-surface text-severity-high border-severity-high',
        text: 'text-severity-high',
        bar: 'bg-severity-high-solid',
      }
    : severity >= 0.5
      ? {
          badge: 'bg-severity-moderate-surface text-severity-moderate border-severity-moderate',
          text: 'text-severity-moderate',
          bar: 'bg-severity-moderate-solid',
        }
      : {
          badge: 'bg-severity-low-surface text-severity-low border-severity-low',
          text: 'text-severity-low',
          bar: 'bg-severity-low-solid',
        };

export const DistrictForecastCard: React.FC<DistrictForecastCardProps> = ({
  district,
  onClose,
  onOpenAnalytics,
  onOpenAdvisory,
}) => {
  const [showLocationMap, setShowLocationMap] = useState(false);
  const tone = riskTone(district.severity);
  const severityPct = Math.round(district.severity * 100);

  return (
    <div
      role="dialog"
      aria-label={`${district.name} district forecast`}
      data-testid="district-forecast-card"
      className="flex flex-col min-h-0 w-full bg-white dark:bg-carbon-90 border border-carbon-20 dark:border-carbon-80 text-carbon-80 dark:text-carbon-10 rounded-t-3xl sm:rounded-2xl shadow-md"
    >
      {/* Drag affordance for the mobile bottom-sheet presentation. Decorative:
          the sheet is in flow, there is nothing to drag, but the handle is the
          visual cue that this panel belongs to the sheet family. */}
      <div className="map-sheet-handle sm:hidden" aria-hidden="true" />

      <div className="flex items-start justify-between gap-2 sm:gap-3 border-b border-carbon-10 dark:border-carbon-80 p-3 sm:p-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-carbon-60 dark:text-carbon-40 uppercase tracking-wide">
            <span className="w-6 h-6 rounded-full bg-nasa-blue/10 flex items-center justify-center shrink-0">
              <MaterialIcon name="radar" className="w-3.5 h-3.5 text-nasa-blue" />
            </span>
            <span>Forecast</span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-carbon-90 dark:text-white tracking-tight mt-1 sm:mt-1.5 truncate">
            {district.name}
            <span className="ml-1.5 sm:ml-2 font-mono text-xs font-semibold text-carbon-60 dark:text-carbon-40">
              {district.division.toUpperCase()}
            </span>
          </h4>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${tone.badge}`}>
            {district.risk} Risk
          </span>
          <button
            type="button"
            onClick={onClose}
            className="tap-target w-9 sm:w-10 h-9 sm:h-10 rounded-full bg-carbon-05 dark:bg-carbon-80 hover:bg-carbon-10 dark:hover:bg-carbon-70 text-carbon-70 dark:text-carbon-30 flex items-center justify-center touch-manipulation transition-colors"
            title="Close district forecast"
            aria-label="Close district forecast"
          >
            <MaterialIcon name="close" className="w-4 sm:w-5 h-4 sm:h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 overflow-y-auto overscroll-contain min-h-0">
        <div className="border border-carbon-10 dark:border-carbon-80 p-2.5 sm:p-3 flex flex-col gap-2 sm:gap-2.5 rounded-2xl bg-carbon-05 dark:bg-carbon-80/50">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm sm:text-base font-semibold text-carbon-90 dark:text-white flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${tone.bar}`} aria-hidden="true" />
              <span className="truncate">{district.hazardType}</span>
            </span>
            <span className={`text-xs sm:text-sm font-semibold font-mono tabular-nums shrink-0 ${tone.text}`}>
              Severity score {(severityPct / 100).toFixed(2)}
            </span>
          </div>
          <div
            className="w-full h-2 bg-carbon-10 dark:bg-carbon-70 overflow-hidden rounded-full"
            role="meter"
            aria-valuenow={severityPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${district.name} hazard severity`}
          >
            <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${severityPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 text-xs">
          <div
            className="bg-carbon-05 dark:bg-carbon-80/50 p-2 sm:p-3 border border-carbon-10 dark:border-carbon-70 rounded-2xl min-w-0"
            title={`Main crop: ${district.mainCrop}`}
          >
            <span className="text-carbon-60 dark:text-carbon-40 flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
              <MaterialIcon name="agriculture" className="w-3.5 h-3.5 text-nasa-green shrink-0" />
              Crop
            </span>
            <span className="font-semibold text-sm sm:text-base text-carbon-90 dark:text-white truncate block">{district.mainCrop}</span>
          </div>
          <div className="bg-carbon-05 dark:bg-carbon-80/50 p-2 sm:p-3 border border-carbon-10 dark:border-carbon-70 rounded-2xl min-w-0">
            <span className="text-carbon-60 dark:text-carbon-40 flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
              <MaterialIcon name="terrain" className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Elev.
            </span>
            <span className="font-semibold text-sm sm:text-base text-carbon-90 dark:text-white">{district.elevationMeters}m MSL</span>
          </div>
          <div className="bg-carbon-05 dark:bg-carbon-80/50 p-2 sm:p-3 border border-carbon-10 dark:border-carbon-70 rounded-2xl min-w-0 sm:col-span-1 col-span-2">
            <span className="text-carbon-60 dark:text-carbon-40 flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
              <MaterialIcon name="my_location" className="w-3.5 h-3.5 text-nasa-blue shrink-0" />
              Loc.
            </span>
            <span className="font-semibold font-mono text-xs sm:text-sm text-carbon-90 dark:text-white tabular-nums">
              {district.lat.toFixed(2)}°N, {district.lng.toFixed(2)}°E
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowLocationMap((value) => !value)}
          aria-expanded={showLocationMap}
          className="flex items-center justify-between gap-2 min-h-10 sm:min-h-11 border border-carbon-10 dark:border-carbon-80 bg-white dark:bg-carbon-80/50 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-carbon-70 dark:text-carbon-30 hover:bg-carbon-05 dark:hover:bg-carbon-70 touch-manipulation transition-colors rounded-full"
        >
          <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <MaterialIcon name="map" className="w-4 h-4 text-nasa-blue shrink-0" />
            <span className="truncate">Location Map</span>
          </span>
          <span className={`transition-transform shrink-0 ${showLocationMap ? 'rotate-180' : ''}`} aria-hidden="true">
            ▾
          </span>
        </button>
        {showLocationMap && (
          <div className="overflow-hidden rounded-2xl border border-carbon-20">
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

      <div className="px-4 pb-4 shrink-0 space-y-2">
        {onOpenAdvisory && (
          <button
            type="button"
            onClick={onOpenAdvisory}
            className="w-full min-h-[44px] py-2.5 bg-carbon-90 hover:bg-carbon-80 text-white font-semibold text-sm flex items-center justify-center gap-2 touch-manipulation rounded-full"
          >
            <MaterialIcon name="insights" className="w-4 h-4 text-nasa-red" />
            Open district intelligence
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenAnalytics(district.id)}
          className="w-full min-h-[44px] py-3 bg-nasa-blue hover:bg-nasa-blue-shade text-white font-semibold text-base flex items-center justify-center gap-2 touch-manipulation rounded-full"
        >
          <MaterialIcon name="analytics" className="w-4 h-4" />
          View Detailed Disaster Analytics
        </button>
      </div>
    </div>
  );
};

export default DistrictForecastCard;
