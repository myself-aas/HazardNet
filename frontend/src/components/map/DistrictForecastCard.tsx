import React, { useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { LocationMap } from '../ui/expand-map';
import { BottomSheet, type SheetDisclosureStage } from '../ui/BottomSheet';
import { DistrictData } from '../../data/bangladeshDistricts';

/**
 * Selected-district forecast for the live map, presented in the shared BottomSheet
 * on every viewport. The sheet supplies the drag, the three stages, the close
 * control and the action row; this component supplies the rows.
 *
 * Non-modal: the map stays interactive underneath, so the user can pick another
 * district while this one is open.
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

export type DisclosureStage = SheetDisclosureStage;

export const DistrictForecastCard: React.FC<DistrictForecastCardProps> = ({
  district,
  onClose,
  onOpenAnalytics,
  onOpenAdvisory,
}) => {
  const [stage, setStage] = useState<DisclosureStage>('half');
  const [showLocationMap, setShowLocationMap] = useState(false);
  const tone = riskTone(district.severity);
  const severityPct = Math.round(district.severity * 100);
  // Peek shows the headline reading only; the facts appear from half upwards.
  const showDetails = stage !== 'peek';

  const handleStageChange = (next: DisclosureStage) => {
    setStage(next);
    setShowLocationMap(next === 'expanded');
  };

  return (
    <BottomSheet
      isOpen
      modal={false}
      onClose={onClose}
      stage={stage}
      onStageChange={handleStageChange}
      title={district.name}
      subtitle={`${district.division} Division`}
      ariaLabel={`${district.name} district forecast`}
      closeLabel="Close district forecast"
      testId="district-forecast-card"
      footerContent={
        <>
          {onOpenAdvisory && (
            <button
              type="button"
              onClick={onOpenAdvisory}
              className="flex-1 min-w-0 min-h-[44px] py-2.5 px-3 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 font-semibold text-xs sm:text-sm leading-tight flex items-center justify-center gap-2 touch-manipulation rounded-full"
            >
              <MaterialIcon name="insights" className="w-4 h-4 shrink-0 text-blue-300" />
              Open district intelligence
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenAnalytics(district.id)}
            className="flex-1 min-w-0 min-h-[44px] py-2.5 px-3 bg-primary hover:bg-primary-strong text-ap-action-fg font-semibold text-xs sm:text-sm leading-tight flex items-center justify-center gap-2 touch-manipulation rounded-full"
          >
            <MaterialIcon name="analytics" className="w-4 h-4 shrink-0" />
            View Detailed Disaster Analytics
          </button>
        </>
      }
    >
      {/* Forecast label and risk, above the facts. */}
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-carbon-60">
          <span className="w-6 h-6 rounded-full bg-ap-primary/10 flex items-center justify-center shrink-0">
            <MaterialIcon name="radar" className="w-3.5 h-3.5 text-ap-link" />
          </span>
          <span>Forecast</span>
        </span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${tone.badge}`}>
          {district.risk} Risk
        </span>
      </div>

      <div className="divide-y divide-carbon-10">
        {/* Hazard and severity: label left, score right, slim meter under. */}
        <div className="flex flex-col gap-2 py-3.5 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm sm:text-base font-bold text-carbon-90 dark:text-white">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.bar}`} aria-hidden="true" />
              <span className="truncate">{district.hazardType}</span>
            </span>
            <span className={`shrink-0 font-mono text-xs sm:text-sm font-bold tabular-nums ${tone.text}`}>
              Severity score {(severityPct / 100).toFixed(2)}
            </span>
          </div>
          <div
            className="w-full h-1.5 bg-carbon-10 overflow-hidden rounded-full"
            role="meter"
            aria-valuenow={severityPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${district.name} hazard severity`}
          >
            <div className={`h-full rounded-full transition-[width] duration-300 ${tone.bar}`} style={{ width: `${severityPct}%` }} />
          </div>
        </div>

        {showDetails && (
          <>
            <div className="flex items-center justify-between gap-3 py-3 sm:py-3.5" title={`Main crop: ${district.mainCrop}`}>
              <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-carbon-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-carbon-05">
                  <MaterialIcon name="agriculture" className="h-4 w-4 text-severity-low" />
                </span>
                Crop
              </span>
              <span className="truncate text-sm sm:text-base font-bold text-carbon-90 dark:text-white">{district.mainCrop}</span>
            </div>

            <div className="flex items-center justify-between gap-3 py-3 sm:py-3.5">
              <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-carbon-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-carbon-05">
                  <MaterialIcon name="terrain" className="h-4 w-4 text-amber-600" />
                </span>
                Elevation
              </span>
              <span className="shrink-0 text-sm sm:text-base font-bold text-carbon-90 dark:text-white">{district.elevationMeters}m MSL</span>
            </div>

            <div className="flex items-center justify-between gap-3 py-3 sm:py-3.5">
              <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-carbon-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-carbon-05">
                  <MaterialIcon name="my_location" className="h-4 w-4 text-ap-link" />
                </span>
                Location
              </span>
              <span className="shrink-0 font-mono text-xs sm:text-sm font-bold tabular-nums text-carbon-90 dark:text-white">
                {district.lat.toFixed(2)}°N, {district.lng.toFixed(2)}°E
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !showLocationMap;
                setShowLocationMap(next);
                setStage(next ? 'expanded' : 'half');
              }}
              aria-expanded={showLocationMap}
              className="my-2 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-full border border-carbon-20 bg-carbon-05 px-4 py-2 text-xs sm:text-sm font-bold text-carbon-70 hover:bg-carbon-10 dark:hover:bg-carbon-70 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <MaterialIcon name="map" className="w-4 h-4 text-ap-link shrink-0" />
                <span className="truncate">Location Map</span>
              </span>
              <MaterialIcon
                name="expand_more"
                aria-hidden="true"
                className={`w-4 h-4 shrink-0 transition-transform ${showLocationMap ? 'rotate-180' : ''}`}
              />
            </button>

            {showLocationMap && (
              <div className="overflow-hidden rounded-2xl border border-carbon-20 mb-3">
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
          </>
        )}
      </div>
    </BottomSheet>
  );
};

export default DistrictForecastCard;
