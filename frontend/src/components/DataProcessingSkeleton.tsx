import { useEffect, useState } from 'react';

interface DataProcessingSkeletonProps {
  title?: string;
  subtitle?: string;
  mode?: 'map' | 'panel' | 'full';
  compact?: boolean;
  progressMessage?: string;
  onDismiss?: () => void;
}

const TELEMETRY_LOGS = [
  'INGESTING SENTINEL-2 & MODIS MULTI-SPECTRAL RASTER TENSORS...',
  'CONNECTING TO GIS TILE SERVER (ZOOM L7 / TILE MESH 64-DISTRICTS)...',
  'COMPUTING VEGETATION INDEX (NDVI) & WATER MASK (NDWI)...',
  'EXECUTING TFLITE DUAL-HEAD NEURAL MODEL (SOFTMAX + REGRESSION)...',
  'RASTERIZING FLOOD & CYCLONE SPATIAL SEVERITY HEATMAPS...',
  'SYNCHRONIZING HYDRO-MET SENSOR STREAMS & WEATHER TELEMETRY...',
  'FINALIZING HIGH-RESOLUTION TILES & MARKER CLUSTERS...'
];

export const DataProcessingSkeleton: React.FC<DataProcessingSkeletonProps> = ({
  title = 'PROCESSING HAZARD PREDICTIONS',
  subtitle = 'Fetching spatial map tiles & executing dual-head neural inference...',
  mode = 'map',
  compact = false,
  progressMessage,
  onDismiss,
}) => {
  const [logIndex, setLogIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(15);

  useEffect(() => {
    const logTimer = setInterval(() => {
      setLogIndex((prev) => (prev + 1) % TELEMETRY_LOGS.length);
    }, 1200);

    const progressTimer = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 92) return 24; // Loop back for continuous simulation
        return prev + Math.floor(Math.random() * 18) + 5;
      });
    }, 600);

    return () => {
      clearInterval(logTimer);
      clearInterval(progressTimer);
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden border border-slate-200 rounded-2xl bg-white/95 backdrop-blur-md shadow-xs flex flex-col justify-between transition-all duration-300 ${
        mode === 'full'
          ? 'w-full h-screen min-h-[500px]'
          : mode === 'map'
          ? 'w-full h-full min-h-[380px] p-6'
          : 'w-full p-5'
      }`}
    >
      {/* HUD Header Bar */}
      <div className="relative z-20 flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div className="flex items-center gap-3">
          {/* Pulsing Status Icon */}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs">
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#f9a825] animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-[#d08305] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                SYSTEM ACTIVE
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                TFLite • GPU Acceleration
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-wide font-mono mt-0.5 flex items-center gap-2">
              {title}
            </h3>
          </div>
        </div>

        {/* Right HUD Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold">LATENCY: 18ms</span>
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
              title="Dismiss Loader"
            >
              CLOSE
            </button>
          )}
        </div>
      </div>

      {/* Center Cyber Skeleton & Radar Viewport */}
      <div className="relative z-20 flex-1 my-2 flex flex-col justify-center">
        {!compact ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full items-center">
            
            {/* Left Skeleton Column: Telemetry & Metrics */}
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 backdrop-blur-xs">
              <div className="flex items-center justify-between text-xs font-mono text-slate-700 border-b border-slate-200 pb-2 font-bold">
                <span>MODEL INFERENCE</span>
                <span className="text-emerald-600 font-bold">READY</span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1 font-semibold">
                    <span>Softmax Probability Tensor</span>
                    <span className="text-slate-900 font-bold">98.4%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                    <div className="h-full bg-[#f9a825] rounded-full" style={{ width: `${Math.min(progressPercent + 20, 100)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1 font-semibold">
                    <span>Severity Index Regression</span>
                    <span className="text-amber-800 font-bold">0.74 RMS</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(progressPercent + 10, 90)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1 font-semibold">
                    <span>GIS Tile Pyramid Ingestion</span>
                    <span className="text-slate-900 font-bold">246 / 256</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                    <div className="h-full bg-slate-500 cyber-skeleton-shimmer rounded-full" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              </div>

              {/* Wireframe Card Skeletons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="h-10 rounded-lg bg-white border border-slate-200 p-2 flex flex-col justify-between cyber-skeleton-shimmer">
                  <div className="w-12 h-1.5 bg-slate-200 rounded" />
                  <div className="w-20 h-2 bg-slate-400 rounded" />
                </div>
                <div className="h-10 rounded-lg bg-white border border-slate-200 p-2 flex flex-col justify-between cyber-skeleton-shimmer">
                  <div className="w-10 h-1.5 bg-slate-200 rounded" />
                  <div className="w-16 h-2 bg-emerald-500/40 rounded" />
                </div>
              </div>
            </div>

            {/* Center Skeleton: Radar Sweeper Target Reticle */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 relative min-h-[180px]">
              {/* Radar Target Circle */}
              <div className="relative w-36 h-36 rounded-full border border-slate-300 flex items-center justify-center bg-white shadow-xs">
                {/* Concentric Rings */}
                <div className="absolute inset-3 rounded-full border border-slate-200" />
                <div className="absolute inset-7 rounded-full border border-slate-200 border-dashed" />
                <div className="absolute inset-12 rounded-full border border-emerald-500/30" />
                
                {/* Crosshairs */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-[1px] bg-slate-200" />
                  <div className="h-full w-[1px] bg-slate-200 absolute" />
                </div>

                {/* Rotating Sweeper Needle */}
                <div className="absolute inset-0 rounded-full animate-radar-spin pointer-events-none">
                  <div className="w-1/2 h-1/2 bg-amber-400/20 origin-bottom-right rounded-tl-full border-r border-amber-500/60" />
                </div>

                {/* Center Blip */}
                <div className="w-2.5 h-2.5 rounded-full bg-[#f9a825]" />
              </div>

              {/* Coordinates HUD text */}
              <div className="mt-3 font-mono text-[10px] text-slate-500 font-bold tracking-widest text-center">
                SCANNING BANGLADESH GRID • 23.81°N 90.41°E
              </div>
            </div>

            {/* Right Skeleton Column: Tile Pyramid Grid Skeleton */}
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 backdrop-blur-xs">
              <div className="flex items-center justify-between text-xs font-mono text-slate-700 border-b border-slate-200 pb-2 font-bold">
                <span>RASTER MESH TILES</span>
                <span className="text-slate-900 font-mono font-bold">64 REGIONS</span>
              </div>

              {/* 3x3 Simulated Map Tile Matrix */}
              <div className="grid grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-white border border-slate-200 p-1.5 flex flex-col justify-between relative overflow-hidden cyber-skeleton-shimmer"
                  >
                    <div className="flex justify-between items-center text-[9px] font-mono text-slate-400">
                      <span>Z7</span>
                      <span className="text-slate-600 font-bold">#0{i + 1}</span>
                    </div>
                    <div className="w-full h-1 bg-slate-300 rounded" />
                    <div className="w-2/3 h-1 bg-emerald-500/40 rounded" />
                  </div>
                ))}
              </div>

              <div className="text-[11px] font-mono text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between font-semibold">
                <span>Raster Cache:</span>
                <span className="text-emerald-700 font-bold">OPTIMIZED (HTTP/2)</span>
              </div>
            </div>

          </div>
        ) : (
          /* Compact Skeleton Mode */
          <div className="flex flex-col items-center justify-center space-y-3 py-6">
            <div className="relative w-16 h-16 rounded-full border border-slate-300 flex items-center justify-center bg-slate-50">
              <div className="absolute inset-0 rounded-full animate-radar-spin">
                <div className="w-1/2 h-1/2 bg-amber-400/30 origin-bottom-right rounded-tl-full" />
              </div>
            </div>

            <div className="text-center font-mono space-y-1">
              <div className="text-xs text-slate-900 font-bold">{title}</div>
              <div className="text-[11px] text-slate-500 font-semibold">{subtitle}</div>
            </div>
          </div>
        )}
      </div>

      {/* HUD Footer Stream Console */}
      <div className="relative z-20 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-[11px]">
        
        {/* Live Terminal Stream Line */}
        <div className="flex items-center gap-2 text-slate-600 truncate max-w-xl">
          <span className="text-emerald-700 font-bold font-mono">[LOG]</span>
          <span className="text-slate-800 font-semibold truncate">
            {progressMessage || TELEMETRY_LOGS[logIndex]}
          </span>
        </div>

        {/* Global Progress Bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-28 sm:w-36 h-2 rounded-full bg-slate-200 border border-slate-300 overflow-hidden">
            <div
              className="h-full bg-[#f9a825] transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-slate-800 font-bold font-mono w-10 text-right">
            {progressPercent}%
          </span>
        </div>

      </div>
    </div>
  );
};

export default DataProcessingSkeleton;
