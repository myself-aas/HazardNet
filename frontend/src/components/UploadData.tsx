import MaterialIcon from "./MaterialIcon";
import { useState } from 'react';
import DataProcessingSkeleton from './DataProcessingSkeleton';

export const UploadData: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setIsSuccess(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
      setIsSuccess(false);
    }
  };

  const handleUpload = () => {
    if (!file) return;
    setIsProcessing(true);
    setIsSuccess(false);

    // Simulate backend processing & raster tiling
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
    }, 2800);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
      
      {/* Cyber Grid Processing Screen Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 p-4 bg-slate-950/95 backdrop-blur-md flex flex-col justify-center animate-fadeIn">
          <DataProcessingSkeleton
            title="RASTERIZING MULTI-SPECTRAL SATELLITE INPUT"
            subtitle={`Ingesting ${file?.name || 'satellite tensor'} & generating GeoTIFF risk tiles...`}
            mode="panel"
            onDismiss={() => setIsProcessing(false)}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xl shadow-inner">
            <MaterialIcon name="satellite_alt" className="w-4 h-4 inline-block mr-1" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">GeoTIFF & Hydro-Met Raster Ingestion</h2>
            <p className="text-xs text-slate-400">
              Upload multi-spectral GeoTIFF, NetCDF4, or tabular CSV weather streams for TFLite inference
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          GIS Pipeline
        </span>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer relative overflow-hidden ${
          dragOver
            ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
            : file
            ? 'border-emerald-500/50 bg-slate-950/60'
            : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40'
        }`}
      >
        <input
          type="file"
          accept=".tif,.tiff,.nc,.csv,.json,.geojson"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        <div className="space-y-3 pointer-events-none">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl shadow-lg">
            {file ? 'description' : '📥'}
          </div>

          {file ? (
            <div className="space-y-1">
              <span className="text-sm font-bold text-emerald-400 font-mono block">
                {file.name}
              </span>
              <span className="text-xs text-slate-400 font-mono block">
                {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for neural rasterization
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-sm font-bold text-white block">
                Drag & drop multi-spectral satellite file or click to browse
              </span>
              <span className="text-xs text-slate-400 font-mono block">
                Supports .tif, .tiff, .nc, .csv, .geojson (Max 250MB)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-slate-400 font-mono">
          {file ? `Selected: ${file.name}` : 'No file selected'}
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || isProcessing}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs font-mono transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
            file && !isProcessing
              ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs cursor-pointer active:scale-95'
              : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
          }`}
        >
          <MaterialIcon name="bolt" className="w-4 h-4 inline-block mr-1" />
          <span>Process Raster & Run Inference</span>
        </button>
      </div>

      {/* Success Notification */}
      {isSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <MaterialIcon name="check_circle" className="w-4 h-4 inline-block mr-1" />
            <span>
              Raster successfully tile-pyramided & hazard predictions synchronized across all 64 districts!
            </span>
          </div>
          <button
            onClick={() => setIsSuccess(false)}
            className="text-emerald-400 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
};

export default UploadData;
