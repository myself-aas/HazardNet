import React from 'react';
import MaterialIcon from './MaterialIcon';

interface MapLegendUIProps {
  isRadarActive: boolean;
  setIsRadarActive: (val: boolean) => void;
}

/**
 * Live Doppler radar reflectivity legend, shown on the map while the radar
 * layer is active. Colour plus words; 12px type; 44×44 dismiss.
 */
export const MapLegendUI: React.FC<MapLegendUIProps> = ({ isRadarActive, setIsRadarActive }) => {
  if (!isRadarActive) return null;

  return (
    <div className="absolute bottom-16 left-4 right-4 sm:left-4 sm:right-auto z-[var(--z-sticky)] pointer-events-auto max-w-[320px]">
      <div className="bg-white border border-carbon-20 p-4 text-carbon-80 text-xs flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 border-b border-carbon-20 pb-2">
          <div className="font-bold text-xs text-carbon-90 uppercase tracking-wide">
            Doppler radar reflectivity (dBZ)
          </div>
          <button
            type="button"
            onClick={() => setIsRadarActive(false)}
            className="tap-target w-11 h-11 rounded-control bg-carbon-05 hover:bg-carbon-10 text-carbon-70 flex items-center justify-center shrink-0 touch-manipulation"
            title="Dismiss Radar Legend"
            aria-label="Dismiss Radar Legend"
          >
            <MaterialIcon name="close" className="w-5 h-5" />
          </button>
        </div>
        <ul className="flex flex-col gap-2 text-xs font-mono">
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 bg-sky-500 shrink-0" aria-hidden="true" />
            <span>20 dBZ Light</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 bg-amber-500 shrink-0" aria-hidden="true" />
            <span>38 dBZ Moderate</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 bg-rose-600 shrink-0" aria-hidden="true" />
            <span>55+ dBZ Heavy</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
