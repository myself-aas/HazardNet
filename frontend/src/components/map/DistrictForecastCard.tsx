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

export type DisclosureStage = 'peek' | 'half' | 'expanded';

const NEXT_STAGE: Record<DisclosureStage, DisclosureStage> = {
  peek: 'half',
  half: 'expanded',
  expanded: 'peek',
};

export const DistrictForecastCard: React.FC<DistrictForecastCardProps> = ({
  district,
  onClose,
  onOpenAnalytics,
  onOpenAdvisory,
}) => {
  const [disclosureStage, setDisclosureStage] = useState<DisclosureStage>('half');
  const [showLocationMap, setShowLocationMap] = useState(false);
  const tone = riskTone(district.severity);
  const severityPct = Math.round(district.severity * 100);

  const cycleDisclosureStage = () => {
    setDisclosureStage((prev) => {
      const next = NEXT_STAGE[prev];
      setShowLocationMap(next === 'expanded');
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-label={`${district.name} district forecast`}
      data-testid="district-forecast-card"
      data-disclosure-stage={disclosureStage}
      className="flex flex-col min-h-0 w-full bg-white border border-carbon-20 text-carbon-80 rounded-t-3xl sm:rounded-2xl shadow-md"
    >
      {/* 3-stage progressive disclosure handle (peek / half / expanded) */}
      <button
        type="button"
        onClick={cycleDisclosureStage}
        data-testid="disclosure-stage-toggle"
        aria-label={`Cycle forecast disclosure stage (current: ${disclosureStage})`}
        className="w-full min-h-[44px] flex flex-col items-center justify-center gap-1 pt-2 pb-1 px-4 text-xs font-mono text-carbon-60 hover:bg-carbon-05 dark:hover:bg-carbon-80/50 touch-manipulation transition-colors border-b border-carbon-20"
      >
        <span className="w-10 h-1.5 rounded-full bg-carbon-30" aria-hidden="true" />
        <span className="sr-only">
          Stage: {disclosureStage}
        </span>
      </button>

      <div className="flex items-start justify-between gap-2 sm:gap-3 border-b border-carbon-20 p-3 sm:p-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-carbon-60 uppercase tracking-wide">
            <span className="w-6 h-6 rounded-full bg-ap-primary/10 flex items-center justify-center shrink-0">
              <MaterialIcon name="radar" className="w-3.5 h-3.5 text-ap-link" />
            </span>
            <span>Forecast</span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-carbon-90 dark:text-white tracking-tight mt-1 sm:mt-1.5 truncate">
            {district.name}
            <span className="ml-1.5 sm:ml-2 font-mono text-xs font-semibold text-carbon-60">
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
            className="tap-target min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-carbon-05 hover:bg-carbon-10 dark:hover:bg-carbon-70 text-carbon-70 flex items-center justify-center touch-manipulation transition-colors"
            title="Close district forecast"
            aria-label="Close district forecast"
          >
            <MaterialIcon name="close" className="w-4 sm:w-5 h-4 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Rows, not nested cards (2026-10-05 restyle): one floating sheet with
          hairline dividers, grey labels with icon bubbles on the left, bold
          values right-aligned — the way the reference tracking sheets read
          their data. The contract strings tests assert stay exact:
"Severity score 0.88", "28m MSL", coordinates, main-crop title. */}
      <div className="flex flex-col overflow-y-auto overscroll-contain min-h-0 px-4 sm:px-5">
        <div className="divide-y divide-carbon-10">
          {/* hazard + severity row: label left, score right, slim meter under */}
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

          {disclosureStage !== 'peek' && (
            <>
              {/* crop row */}
              <div
                className="flex items-center justify-between gap-3 py-3 sm:py-3.5"
                title={`Main crop: ${district.mainCrop}`}
              >
                <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-carbon-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-carbon-05">
                    <MaterialIcon name="agriculture" className="h-4 w-4 text-severity-low" />
                  </span>
                  Crop
                </span>
                <span className="truncate text-sm sm:text-base font-bold text-carbon-90 dark:text-white">{district.mainCrop}</span>
              </div>

              {/* elevation row */}
              <div className="flex items-center justify-between gap-3 py-3 sm:py-3.5">
                <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-carbon-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-carbon-05">
                    <MaterialIcon name="terrain" className="h-4 w-4 text-amber-600" />
                  </span>
                  Elevation
                </span>
                <span className="shrink-0 text-sm sm:text-base font-bold text-carbon-90 dark:text-white">{district.elevationMeters}m MSL</span>
              </div>

              {/* location row */}
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
                  setShowLocationMap((value) => {
                    const next = !value;
                    setDisclosureStage(next ? 'expanded' : 'half');
                    return next;
                  });
                }}
                aria-expanded={showLocationMap}
                className="my-2 flex min-h-[44px] items-center justify-between gap-2 rounded-full border border-carbon-20 bg-carbon-05 px-4 py-2 text-xs sm:text-sm font-bold text-carbon-70 hover:bg-carbon-10 dark:hover:bg-carbon-70 hover:text-carbon-90 dark:hover:text-white touch-manipulation transition-colors"
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
      </div>

      <div className="px-4 pb-4 shrink-0 space-y-2">
        {onOpenAdvisory && (
          <button
            type="button"
            onClick={onOpenAdvisory}
            className="w-full min-h-[44px] py-2.5 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 font-semibold text-sm flex items-center justify-center gap-2 touch-manipulation rounded-full"
          >
            <MaterialIcon name="insights" className="w-4 h-4 text-blue-300" />
            Open district intelligence
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenAnalytics(district.id)}
          className="w-full min-h-[44px] py-3 bg-primary hover:bg-primary-strong text-ap-action-fg font-semibold text-base flex items-center justify-center gap-2 touch-manipulation rounded-full"
        >
          <MaterialIcon name="analytics" className="w-4 h-4" />
          View Detailed Disaster Analytics
        </button>
      </div>
    </div>
  );
};

export default DistrictForecastCard;
