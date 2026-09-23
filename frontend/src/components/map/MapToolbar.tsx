import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { MAP_LAYERS, type MapLayerKey } from '../../hooks/useLeafletMap';
import { FORECAST_HORIZONS, formatHorizonLabel, type ForecastHorizon } from '../../lib/forecasts';
import type { HazardLayerDef } from './mapPrimitives';

export type MapViewMode = 'map' | 'table';

const LAYER_LABELS: Record<MapLayerKey, string> = {
  esriSatellite: 'Satellite',
  esriClarity: 'Clarity',
  cartoDark: 'Dark GIS',
  osmStandard: 'Street Map',
  esriShadedRelief: 'Relief',
  topoMap: 'Topo',
};

const chip = (active: boolean) =>
  `min-h-[44px] px-3 py-2 rounded-control border text-xs font-semibold whitespace-nowrap touch-manipulation ${
    active ? 'bg-nasa-blue text-white border-nasa-blue' : 'bg-white text-carbon-70 border-carbon-20'
  }`;

export interface MapToolbarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  viewMode: MapViewMode;
  onViewModeChange: (mode: MapViewMode) => void;
  activeLayer: MapLayerKey;
  onLayerChange: (layer: MapLayerKey) => void;
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
 * Live-map HUD toolbar: layers, horizon, hazards, and map/table parity.
 * 44px controls, 12px labels, opaque white, no glass.
 */
export const MapToolbar: React.FC<MapToolbarProps> = ({
  collapsed,
  onCollapsedChange,
  viewMode,
  onViewModeChange,
  activeLayer,
  onLayerChange,
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
      <div className="p-2 lg:px-4 bg-white flex items-center justify-between gap-2 flex-wrap">
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
          {(Object.keys(MAP_LAYERS) as MapLayerKey[]).slice(0, 3).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onLayerChange(key)}
              aria-pressed={activeLayer === key}
              className={chip(activeLayer === key)}
            >
              {LAYER_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            className="min-h-[44px] px-3 py-2 bg-carbon-90 text-white text-xs font-semibold touch-manipulation"
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
      <div className="p-2 lg:px-4 lg:py-2 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="px-3 min-h-[44px] bg-nasa-blue text-white flex items-center justify-center font-semibold text-xs shrink-0 uppercase tracking-wide">
            GIS
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-carbon-90 tracking-tight">Hazard map</h3>
            <p className="text-xs text-carbon-60">
              {filteredCount} / {totalCount} districts
              {lowBandwidth ? ' · data saver (street map)' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          <div className="flex items-center gap-2 overflow-x-auto max-w-full" role="group" aria-label="Base map layer">
            {(Object.keys(MAP_LAYERS) as MapLayerKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onLayerChange(key)}
                aria-pressed={activeLayer === key}
                className={chip(activeLayer === key)}
              >
                {LAYER_LABELS[key]}
              </button>
            ))}
          </div>

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
            className="min-h-[44px] px-3 py-2 bg-nasa-blue text-white text-xs font-semibold flex items-center gap-2 touch-manipulation disabled:opacity-50"
            title="Export visible map as an image"
          >
            <MaterialIcon name="photo_camera" className="w-4 h-4" />
            {exporting ? 'Capturing…' : 'Export'}
          </button>

          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="min-h-[44px] px-3 py-2 bg-carbon-90 text-white text-xs font-semibold touch-manipulation"
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
          <input
            id="map-district-search"
            type="search"
            placeholder="Search districts, hazards, or divisions"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full h-12 lg:h-11 px-4 bg-white border border-carbon-20 rounded-control text-carbon-80 placeholder-carbon-60 text-base focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
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
            className="px-2 min-h-[24px] inline-flex items-center rounded-control text-xs font-semibold whitespace-nowrap border border-carbon-20 bg-carbon-05 text-carbon-70"
            title={
              isLive
                ? `Stored pipeline forecast — ${liveCount}/64 districts matched, prediction date ${predictionDate}`
                : 'Static baseline data — the forecast API is offline or has no rows yet'
            }
          >
            {isLive ? `Stored ${liveCount}/64` : 'Baseline'}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
          <button
            type="button"
            onClick={() => (allHazardsOn ? onClearHazards() : onSelectAllHazards())}
            className={`min-h-[44px] px-3 py-2 rounded-control border text-xs font-semibold whitespace-nowrap touch-manipulation ${
              allHazardsOn
                ? 'bg-carbon-90 text-white border-carbon-90'
                : 'bg-white text-carbon-70 border-carbon-20'
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
