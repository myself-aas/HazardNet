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
}) => {
  const [showLocationMap, setShowLocationMap] = useState(false);
  const tone = riskTone(district.severity);
  const severityPct = Math.round(district.severity * 100);

  return (
    <div
      role="dialog"
      aria-label={`${district.name} district forecast`}
      data-testid="district-forecast-card"
      className="flex flex-col min-h-0 w-full bg-white border border-carbon-20 text-carbon-80"
    >
      <div className="flex items-start justify-between gap-2 border-b border-carbon-20 p-4 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-carbon-60 uppercase tracking-wide">
            <MaterialIcon name="radar" className="w-3 h-3 text-nasa-blue" />
            District forecast
          </div>
          <h4 className="text-base font-bold text-carbon-90 tracking-tight mt-1 truncate">
            {district.name} District
            <span className="ml-2 font-mono text-xs font-semibold text-carbon-60">
              {district.division.toUpperCase()}
            </span>
          </h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2 py-1 rounded-control border ${tone.badge}`}>
            {district.risk} Risk
          </span>
          <button
            type="button"
            onClick={onClose}
            className="tap-target w-11 h-11 rounded-control bg-carbon-05 hover:bg-carbon-10 text-carbon-70 flex items-center justify-center touch-manipulation"
            title="Close district forecast"
            aria-label="Close district forecast"
          >
            <MaterialIcon name="close" className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4 overflow-y-auto overscroll-contain min-h-0">
        <div className="border border-carbon-20 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-semibold text-carbon-90 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${tone.bar}`} aria-hidden="true" />
              {district.hazardType}
            </span>
            <span className={`text-sm font-semibold font-mono tabular-nums ${tone.text}`}>
              Severity score {(severityPct / 100).toFixed(2)}
            </span>
          </div>
          <div
            className="w-full h-2 bg-carbon-10 overflow-hidden"
            role="meter"
            aria-valuenow={severityPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${district.name} hazard severity`}
          >
            <div className={`h-full ${tone.bar}`} style={{ width: `${severityPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div
            className="bg-carbon-05 p-2 border border-carbon-20 min-w-0"
            title={`Main crop: ${district.mainCrop}`}
          >
            <span className="text-carbon-60 block text-xs font-bold uppercase tracking-wide">Main Crop</span>
            <span className="font-semibold text-base text-carbon-80 truncate block">{district.mainCrop}</span>
          </div>
          <div className="bg-carbon-05 p-2 border border-carbon-20 min-w-0">
            <span className="text-carbon-60 block text-xs font-bold uppercase tracking-wide">Elevation</span>
            <span className="font-semibold text-base text-carbon-80">{district.elevationMeters}m MSL</span>
          </div>
          <div className="bg-carbon-05 p-2 border border-carbon-20 min-w-0">
            <span className="text-carbon-60 block text-xs font-bold uppercase tracking-wide">Coords</span>
            <span className="font-semibold font-mono text-sm text-carbon-80 tabular-nums">
              {district.lat.toFixed(2)}°N, {district.lng.toFixed(2)}°E
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowLocationMap((value) => !value)}
          aria-expanded={showLocationMap}
          className="flex items-center justify-between gap-2 min-h-[44px] border border-carbon-20 bg-white px-3 py-2 text-sm font-semibold text-carbon-70 hover:bg-carbon-05 touch-manipulation"
        >
          <span className="flex items-center gap-2">
            <MaterialIcon name="map" className="w-4 h-4 text-nasa-blue" />
            Location Map
          </span>
          <span className={`transition-transform ${showLocationMap ? 'rotate-180' : ''}`} aria-hidden="true">
            ▾
          </span>
        </button>
        {showLocationMap && (
          <div className="overflow-hidden border border-carbon-20">
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

      <div className="px-4 pb-4 shrink-0">
        <button
          type="button"
          onClick={() => onOpenAnalytics(district.id)}
          className="w-full min-h-[44px] py-3 bg-nasa-blue hover:bg-nasa-blue-shade text-white font-semibold text-base flex items-center justify-center gap-2 touch-manipulation"
        >
          <MaterialIcon name="analytics" className="w-4 h-4" />
          View Detailed Disaster Analytics
        </button>
      </div>
    </div>
  );
};

export default DistrictForecastCard;
