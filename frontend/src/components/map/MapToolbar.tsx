import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { FORECAST_HORIZONS, formatHorizonLabel, type ForecastHorizon } from '../../lib/forecasts';
import type { HazardLayerDef } from './mapPrimitives';

export type MapViewMode = 'map' | 'table';

const chip = (active: boolean) =>
  `min-h-[44px] px-3.5 py-2 rounded-full border text-xs font-semibold whitespace-nowrap touch-manipulation transition-colors ${
    active
      ? 'bg-nasa-blue text-white border-nasa-blue shadow-sm'
      : 'bg-white text-carbon-70 border-carbon-20 hover:bg-carbon-05 hover:text-carbon-90'
  }`;

export interface MapToolbarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  viewMode: MapViewMode;
  onViewModeChange: (mode: MapViewMode) => void;
  highContrast: boolean;
  onHighContrastChange: (value: boolean) => void;
  exporting: boolean;
  onExport: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  forecastHorizon: ForecastHorizon;
  onForecastHorizonChange: (horizon: ForecastHorizon) => void;
  isLive: boolean;
  liveCount: number;
  predictionDate?: string | null;
  hazardLayers: HazardLayerDef[];
  selectedHazards: string[];
  onToggleHazard: (id: string) => void;
  onSelectAllHazards: () => void;
  onClearHazards: () => void;
  hazardCounts: Record<string, number>;
  filteredCount: number;
  totalCount: number;
  lowBandwidth: boolean;
}

const ViewModeToggle: React.FC<{
  viewMode: MapViewMode;
  onViewModeChange: (mode: MapViewMode) => void;
}> = ({ viewMode, onViewModeChange }) => (
  <div className="flex items-center gap-2" role="group" aria-label="Map or table">
    <button
      type="button"
      aria-pressed={viewMode === 'map'}
      onClick={() => onViewModeChange('map')}
      className={chip(viewMode === 'map')}
    >
      Map
    </button>
    <button
      type="button"
      aria-pressed={viewMode === 'table'}
      onClick={() => onViewModeChange('table')}
      className={chip(viewMode === 'table')}
    >
      Table
    </button>
  </div>
);

/**
 * Live-map HUD toolbar: horizon, hazards, and map/table parity.
 * 44px controls, 12px labels, opaque white, no glass.
 *
 * There is deliberately no basemap switcher here: the live map ships a single
 * OpenStreetMap ground (see `useLeafletMap.MAP_LAYERS`), so the only map controls
 * that remain are the ones that change what the data says, not what it sits on.
 */
export const MapToolbar: React.FC<MapToolbarProps> = ({
  collapsed,
  onCollapsedChange,
  viewMode,
  onViewModeChange,
  highContrast,
  onHighContrastChange,
  exporting,
  onExport,
  searchQuery,
  onSearchQueryChange,
  forecastHorizon,
  onForecastHorizonChange,
  isLive,
  liveCount,
  predictionDate,
  hazardLayers,
  selectedHazards,
  onToggleHazard,
  onSelectAllHazards,
  onClearHazards,
  hazardCounts,
  filteredCount,
  totalCount,
  lowBandwidth,
}) => {
  const allHazardsOn = selectedHazards.length === hazardLayers.length;

  if (collapsed) {
    return (
      <div className="p-2 lg:px-4 bg-white flex items-center justify-between gap-2 flex-wrap rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-carbon-90">
            {viewMode === 'table' ? 'District table' : 'Map'}
          </span>
          <span className="text-xs text-carbon-60 font-mono hidden sm:inline tabular-nums">
            {filteredCount} districts
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            className="min-h-[44px] px-4 py-2 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 text-xs font-semibold touch-manipulation rounded-full transition-colors"
            title="Expand map controls and filters"
          >
            Controls
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-2 lg:px-4 lg:py-2 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-2 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="px-3.5 min-h-[44px] bg-nasa-blue text-white flex items-center justify-center font-semibold text-xs shrink-0 uppercase tracking-wide rounded-full">
            GIS
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-carbon-90 tracking-tight">Hazard map</h3>
            <p className="text-xs text-carbon-60">
              {filteredCount} / {totalCount} districts
              {lowBandwidth ? ' · data saver' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />

          <button
            type="button"
            onClick={() => onHighContrastChange(!highContrast)}
            aria-pressed={highContrast}
            className={`${chip(highContrast)} flex items-center gap-2`}
            title="Toggle high-contrast tiles"
          >
            <MaterialIcon name="bolt" className="w-4 h-4" />
            {highContrast ? 'Contrast on' : 'Contrast off'}
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="min-h-[44px] px-4 py-2 bg-nasa-blue hover:bg-nasa-blue-shade text-white text-xs font-semibold flex items-center gap-2 touch-manipulation disabled:opacity-50 rounded-full transition-colors"
            title="Export visible map as an image"
          >
            <MaterialIcon name="photo_camera" className="w-4 h-4" />
            {exporting ? 'Capturing…' : 'Export'}
          </button>

          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="min-h-[44px] px-4 py-2 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 text-xs font-semibold touch-manipulation rounded-full transition-colors"
            title="Collapse map controls"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="px-2 py-2 lg:px-4 bg-white border-t border-carbon-20 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="relative w-full lg:w-[320px]">
          <label htmlFor="map-district-search" className="sr-only">
            Search districts
          </label>
          <MaterialIcon
            name="search"
            className="w-5 h-5 text-carbon-50 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            id="map-district-search"
            type="search"
            placeholder="Search districts, hazards, or divisions"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full h-12 lg:h-11 pl-12 pr-4 bg-carbon-05 border border-carbon-20 rounded-full text-carbon-80 placeholder-carbon-60 text-base focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap" role="group" aria-label="Forecast horizon">
          {FORECAST_HORIZONS.map((horizon) => (
            <button
              key={horizon}
              type="button"
              onClick={() => onForecastHorizonChange(horizon)}
              aria-pressed={forecastHorizon === horizon}
              className={chip(forecastHorizon === horizon)}
            >
              {formatHorizonLabel(horizon)}
            </button>
          ))}
          <span
            className="px-2.5 min-h-[24px] inline-flex items-center rounded-full text-xs font-semibold whitespace-nowrap border border-carbon-20 bg-carbon-05 text-carbon-70"
            title={
              isLive
                ? `Stored pipeline forecast: ${liveCount}/64 districts matched, prediction date ${predictionDate}`
                : 'Static baseline data: the forecast API is offline or has no rows yet'
            }
          >
            {isLive ? `Stored ${liveCount}/64` : 'Baseline'}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
          <button
            type="button"
            onClick={() => (allHazardsOn ? onClearHazards() : onSelectAllHazards())}
            className={`min-h-[44px] px-3.5 py-2 rounded-full border text-xs font-semibold whitespace-nowrap touch-manipulation transition-colors ${
              allHazardsOn
                ? 'bg-carbon-90 text-white border-carbon-90'
                : 'bg-white text-carbon-70 border-carbon-20 hover:bg-carbon-05 hover:text-carbon-90'
            }`}
          >
            All hazards ({selectedHazards.length}/{hazardLayers.length})
          </button>
          {hazardLayers.map((hazard) => {
            const active = selectedHazards.includes(hazard.id);
            return (
              <button
                key={hazard.id}
                type="button"
                onClick={() => onToggleHazard(hazard.id)}
                aria-pressed={active}
                className={`${chip(active)} flex items-center gap-2`}
              >
                <span>{hazard.name}</span>
                <span className="font-mono tabular-nums text-xs">{hazardCounts[hazard.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default MapToolbar;
