const fs = require('fs');

const uiContent = `import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DistrictData } from '../data/bangladeshDistricts';
import { HAZARD_LAYERS, HazardLayerDef } from './LiveMapView';

interface MapLegendUIProps {
  isLegendOpen: boolean;
  setIsLegendOpen: (val: boolean) => void;
  isRadarActive: boolean;
  setIsRadarActive: (val: boolean) => void;
  liveDistrictsData: (DistrictData & { severity: number; risk: string })[];
  handleSelectDistrict: (dist: DistrictData & { severity: number; risk: string }) => void;
  selectedHazards: string[];
  toggleHazard: (id: string) => void;
}

export const MapLegendUI: React.FC<MapLegendUIProps> = ({
  isLegendOpen,
  setIsLegendOpen,
  isRadarActive,
  setIsRadarActive,
  liveDistrictsData,
  handleSelectDistrict,
  selectedHazards,
  toggleHazard,
}) => {
  return (
    <>
      {/* Dynamic Map Hazard & GIS Legend Panel Overlay */}
      <AnimatePresence>
        {isLegendOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: -20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 20, x: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute bottom-24 sm:bottom-6 left-4 right-4 sm:right-auto sm:left-6 lg:left-20 z-[1020] pointer-events-auto sm:max-w-sm w-auto sm:w-full"
          >
            <div className="bg-white/98 border border-slate-200/90 shadow-2xl rounded-2xl p-3.5 backdrop-blur-md text-slate-800 flex flex-col gap-2.5">
              {/* Legend Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 font-mono">
                    Hazard Risk & GIS Layer Legend
                  </h4>
                </div>
                <button
                  onClick={() => setIsLegendOpen(false)}
                  className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-xs transition-colors"
                  title="Minimize Legend Overlay"
                >
                  ✕
                </button>
              </div>

              {/* Risk Severity Breakdown */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wide">
                  District Risk Severity Thresholds
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <button
                    onClick={() => {
                      const highDist = liveDistrictsData.find((d) => d.severity >= 0.8 || d.risk === 'High');
                      if (highDist) handleSelectDistrict(highDist);
                    }}
                    className="flex flex-col p-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 hover:bg-rose-100 transition-colors text-left"
                    title="Click to focus high risk district"
                  >
                    <div className="flex items-center gap-1 font-extrabold text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                      <span>High Risk</span>
                    </div>
                    <span className="font-mono text-[10px] text-rose-700 font-bold mt-0.5">≥ 80% Severity</span>
                  </button>

                  <button
                    onClick={() => {
                      const modDist = liveDistrictsData.find((d) => (d.severity >= 0.5 && d.severity < 0.8) || d.risk === 'Moderate');
                      if (modDist) handleSelectDistrict(modDist);
                    }}
                    className="flex flex-col p-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 transition-colors text-left"
                    title="Click to focus moderate risk district"
                  >
                    <div className="flex items-center gap-1 font-extrabold text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                      <span>Moderate</span>
                    </div>
                    <span className="font-mono text-[10px] text-amber-700 font-bold mt-0.5">50 - 79% Risk</span>
                  </button>

                  <button
                    onClick={() => {
                      const lowDist = liveDistrictsData.find((d) => d.severity < 0.5 || d.risk === 'Low');
                      if (lowDist) handleSelectDistrict(lowDist);
                    }}
                    className="flex flex-col p-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100 transition-colors text-left"
                    title="Click to focus low risk district"
                  >
                    <div className="flex items-center gap-1 font-extrabold text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      <span>Low Risk</span>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-700 font-bold mt-0.5">&lt; 50% Severity</span>
                  </button>
                </div>
              </div>

              {/* Visual Feature Layers Explanation */}
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wide">
                  Map Feature Symbol Key
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-700 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded border border-amber-500 bg-amber-200/50 inline-block"></span>
                    <span>14-Pt Boundary</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-sky-500 inline-block"></span>
                    <span>River Basins</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-purple-500 bg-purple-200 inline-block"></span>
                    <span>Doppler Radar</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🎯</span>
                    <span>GPS Pinpoint</span>
                  </div>
                </div>
              </div>

              {/* Active Hazard Quick Toggle Chips */}
              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                {HAZARD_LAYERS.map((h) => {
                  const isAct = selectedHazards.includes(h.id);
                  return (
                    <button
                      key={h.id}
                      onClick={() => toggleHazard(h.id)}
                      className={\`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all border \${
                        isAct ? h.badgeColor : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
                      }\`}
                      title={\`Toggle \${h.name} markers\`}
                    >
                      {h.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Doppler Radar Legend (When Radar Active) */}
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
    </>
  );
};
`;

fs.writeFileSync('frontend/src/components/MapLegendUI.tsx', uiContent);

const liveMapFile = 'frontend/src/components/LiveMapView.tsx';
let liveMapContent = fs.readFileSync(liveMapFile, 'utf8');

// The chunk we want to replace starts at: {/* Dynamic Map Hazard & GIS Legend Panel Overlay */}
// and ends at: </AnimatePresence> just before {/* Bottom-Center Floating Clear Search & Inspect Pill */}

const startIndex = liveMapContent.indexOf('{/* Dynamic Map Hazard & GIS Legend Panel Overlay */}');
const endIndexStr = '{/* Bottom-Center Floating Clear Search & Inspect Pill */}';
const endIndex = liveMapContent.indexOf(endIndexStr);

if (startIndex > -1 && endIndex > -1) {
  const replacement = `          <MapLegendUI
            isLegendOpen={isLegendOpen}
            setIsLegendOpen={setIsLegendOpen}
            isRadarActive={isRadarActive}
            setIsRadarActive={setIsRadarActive}
            liveDistrictsData={liveDistrictsData as any}
            handleSelectDistrict={handleSelectDistrict as any}
            selectedHazards={selectedHazards}
            toggleHazard={toggleHazard}
          />

          `;
  liveMapContent = liveMapContent.substring(0, startIndex) + replacement + liveMapContent.substring(endIndex);
  
  // Add import to top
  const importStatement = "import { MapLegendUI } from './MapLegendUI';\n";
  const importIndex = liveMapContent.indexOf("import {");
  liveMapContent = liveMapContent.substring(0, importIndex) + importStatement + liveMapContent.substring(importIndex);
  
  fs.writeFileSync(liveMapFile, liveMapContent);
} else {
  console.log('Could not find chunk bounds');
}
