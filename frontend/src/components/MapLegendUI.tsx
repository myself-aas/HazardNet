import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MapLegendUIProps {
  isRadarActive: boolean;
  setIsRadarActive: (val: boolean) => void;
}

/**
 * Live Doppler radar reflectivity legend, shown on the map while the radar
 * layer is active. (The former "Hazard Risk & GIS Layer Legend" panel was
 * removed by design — risk thresholds and hazard toggles live in the map
 * controls and the district forecast card instead.)
 */
export const MapLegendUI: React.FC<MapLegendUIProps> = ({ isRadarActive, setIsRadarActive }) => (
  <AnimatePresence>
    {isRadarActive && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
        className="absolute bottom-40 sm:bottom-14 left-4 right-4 sm:left-6 sm:right-auto z-[1000] pointer-events-auto"
      >
        <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 shadow-xl text-slate-800 text-xs flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
            <div className="font-black text-[11px] text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              DOPPLER RADAR REFLECTIVITY (dBZ)
            </div>
            <button
              onClick={() => setIsRadarActive(false)}
              className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center text-[10px] transition-colors cursor-pointer shrink-0 ml-2"
              title="Dismiss Radar Legend"
              aria-label="Dismiss Radar Legend"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded bg-sky-500 text-white font-bold">20 dBZ Light</span>
            <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-bold">38 dBZ Moderate</span>
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold">55+ dBZ Heavy</span>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);
