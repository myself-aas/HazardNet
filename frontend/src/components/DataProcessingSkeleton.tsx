import { useEffect, useState } from 'react';

/**
 * Loading state for data-backed views (map, prediction panel, upload).
 *
 * HONESTY NOTE (audit UI-02 / UI-14 / UX-12, 2026-09-17)
 * -----------------------------------------------------
 * This component previously showed fixed telemetry that looked like measured
 * output — `SYSTEM ACTIVE`, `LATENCY: 18ms`, `Softmax Probability Tensor
 * 98.4%`, `Severity Index Regression 0.74 RMS`, `GIS Tile Pyramid Ingestion
 * 246 / 256`, `Raster Cache: OPTIMIZED (HTTP/2)` — plus a randomised progress
 * bar that looped back on itself. The first thing a visitor saw on
 * hazardnet.live was therefore a screen of precise-looking numbers that were
 * hardcoded, and nothing on the page said so.
 *
 * Everything here is now either (a) true of the loading state, or (b) clearly
 * labelled as a placeholder. There are no fabricated values: the bars are
 * indeterminate, the only measured quantity is elapsed time, and the status
 * text says what is being fetched. Real numbers appear when the data arrives.
 */

interface DataProcessingSkeletonProps {
  title?: string;
  subtitle?: string;
  mode?: 'map' | 'panel' | 'full';
  compact?: boolean;
  progressMessage?: string;
  onDismiss?: () => void;
}

/** Truthful descriptions of what the page is waiting for, rotated for feedback. */
const LOADING_MESSAGES = [
  'Fetching the latest forecast snapshot…',
  'Loading map tiles for the current view…',
  'Preparing district hazard layers…',
  'Rendering severity markers…',
];

export const DataProcessingSkeleton: React.FC<DataProcessingSkeletonProps> = ({
  title = 'LOADING FORECAST DATA',
  subtitle = 'Fetching the current hazard outlook and map layers.',
  mode = 'map',
  compact = false,
  progressMessage,
  onDismiss,
}) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2200);
    const clockTimer = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => {
      clearInterval(messageTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const statusText = progressMessage || LOADING_MESSAGES[messageIndex];

  return (
    <div
      className={`relative overflow-hidden border border-slate-200 rounded-2xl bg-white/95 backdrop-blur-md shadow-xs flex flex-col justify-between transition-all duration-300 ${
        mode === 'full'
          ? 'w-full h-dvh min-h-[500px]'
          : mode === 'map'
          ? 'w-full h-full min-h-[380px] p-6'
          : 'w-full p-5'
      }`}
    >
      {/* Screen-reader status: one polite announcement, decorative visuals hidden. */}
      <p role="status" aria-live="polite" className="sr-only">
        {title}. {statusText} Elapsed {elapsedSeconds} seconds.
      </p>

      {/* HUD Header Bar */}
      <div className="relative z-20 flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs" aria-hidden="true">
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-nasa-red animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-nasa-red-shade bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Loading
              </span>
              <span className="text-[10px] font-mono text-slate-500">Forecasts · map layers</span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-wide font-mono mt-0.5 flex items-center gap-2">
              {title}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Elapsed time is measured, not invented — the previous "LATENCY: 18ms"
              was a hardcoded constant unrelated to anything the app was doing. */}
          <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
            <span className="font-bold">Elapsed {elapsedSeconds}s</span>
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
              title="Dismiss the loading overlay"
            >
              CLOSE
            </button>
          )}
        </div>
      </div>

      {/* Center Skeleton Viewport */}
      <div className="relative z-20 flex-1 my-2 flex flex-col justify-center" aria-hidden="true">
        {!compact ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full items-center">
            {/* Left column: what is loading (no invented values) */}
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 backdrop-blur-xs">
              <div className="flex items-center justify-between text-xs font-mono text-slate-700 border-b border-slate-200 pb-2 font-bold">
                <span>WAITING FOR</span>
                <span className="text-amber-700 font-bold">PENDING</span>
              </div>

              <div className="space-y-2.5">
                {['Forecast snapshot', 'Map tiles', 'District layers'].map((label) => (
                  <div key={label}>
                    <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1 font-semibold">
                      <span>{label}</span>
                      <span className="text-slate-400">—</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                      <div className="h-full w-1/2 bg-slate-400/70 cyber-skeleton-shimmer rounded-full" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="h-10 rounded-lg bg-white border border-slate-200 p-2 flex flex-col justify-between cyber-skeleton-shimmer">
                  <div className="w-12 h-1.5 bg-slate-200 rounded" />
                  <div className="w-20 h-2 bg-slate-300 rounded" />
                </div>
                <div className="h-10 rounded-lg bg-white border border-slate-200 p-2 flex flex-col justify-between cyber-skeleton-shimmer">
                  <div className="w-10 h-1.5 bg-slate-200 rounded" />
                  <div className="w-16 h-2 bg-slate-300 rounded" />
                </div>
              </div>
            </div>

            {/* Center: decorative radar sweep */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 relative min-h-[180px]">
              <div className="relative w-36 h-36 rounded-full border border-slate-300 flex items-center justify-center bg-white shadow-xs">
                <div className="absolute inset-3 rounded-full border border-slate-200" />
                <div className="absolute inset-7 rounded-full border border-slate-200 border-dashed" />
                <div className="absolute inset-12 rounded-full border border-emerald-500/30" />

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-[1px] bg-slate-200" />
                  <div className="h-full w-[1px] bg-slate-200 absolute" />
                </div>

                <div className="absolute inset-0 rounded-full animate-radar-spin pointer-events-none">
                  <div className="w-1/2 h-1/2 bg-amber-400/20 origin-bottom-right rounded-tl-full border-r border-amber-500/60" />
                </div>

                <div className="w-2.5 h-2.5 rounded-full bg-nasa-red" />
              </div>

              <div className="mt-3 font-mono text-[10px] text-slate-500 font-bold tracking-widest text-center">
                BANGLADESH · 64 DISTRICTS
              </div>
            </div>

            {/* Right column: tile placeholders */}
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 backdrop-blur-xs">
              <div className="flex items-center justify-between text-xs font-mono text-slate-700 border-b border-slate-200 pb-2 font-bold">
                <span>RASTER MESH TILES</span>
                <span className="text-slate-500 font-mono font-bold">LOADING</span>
              </div>

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
                    <div className="w-2/3 h-1 bg-slate-300/70 rounded" />
                  </div>
                ))}
              </div>

              <div className="text-[11px] font-mono text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between font-semibold">
                <span>Tiles</span>
                <span className="text-slate-500 font-bold">Cached as you browse</span>
              </div>
            </div>
          </div>
        ) : (
          /* Compact mode */
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

      {/* Footer: truthful status stream + indeterminate progress (no fake %) */}
      <div className="relative z-20 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-[11px]">
        <div className="flex items-center gap-2 text-slate-600 truncate max-w-xl">
          <span className="text-amber-700 font-bold font-mono">[LOADING]</span>
          <span className="text-slate-800 font-semibold truncate">{statusText}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div
            className="w-28 sm:w-36 h-2 rounded-full bg-slate-200 border border-slate-300 overflow-hidden"
            role="progressbar"
            aria-label="Loading forecast data"
          >
            <div className="h-full w-1/3 bg-nasa-red rounded-full cyber-skeleton-shimmer" />
          </div>
          <span className="text-slate-500 font-bold font-mono">loading</span>
        </div>
      </div>
    </div>
  );
};

export default DataProcessingSkeleton;
