import { readTensorUpload } from '../lib/tensorUpload';
import MaterialIcon from "../components/MaterialIcon";
import React from 'react';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PredictionPanel from '../components/PredictionPanel';

const hazardProfiles = {
  'Cold Wave': {
    description: 'Abnormally low temperatures endangering winter crops (Boro seedlings, mustard).',
    impact: 'Seedling stunting, cold injury, reduced yield',
    mitigation: [
      'Maintain 3-5 cm standing water in Boro seedbeds',
      'Cover seedbeds with transparent polythene sheets overnight',
      'Apply light irrigation during severe cold snaps'
    ],
    icon: 'ac_unit'
  },
  Drought: {
    description: 'Extended dry periods with soil moisture deficit & elevated land surface temperature.',
    impact: 'Crop wilting, soil degradation, severe yield reduction',
    mitigation: [
      'Deploy supplemental drip or micro-sprinkler irrigation',
      'Apply organic straw mulching to conserve topsoil moisture',
      'Promote drought-tolerant Aus/Aman rice varieties (BRRI dhan56/57)'
    ],
    icon: 'dry'
  },
  Fire: {
    description: 'High thermal anomaly with elevated SWIR reflectance in dry crop residues.',
    impact: 'Loss of ripe crop harvest, smoke pollution, soil organic burn',
    mitigation: [
      'Enforce crop residue management instead of stubble burning',
      'Establish 5m wide wet perimeter firebreaks around storage granaries',
      'Deploy localized water pump reserves during dry harvest months'
    ],
    icon: 'local_fire_department'
  },
  'Flash Flood': {
    description: 'Sudden, rapid water level rise in northeastern haor areas from upstream heavy rainfall.',
    impact: 'Complete inundation of ripening pre-monsoon Boro paddy',
    mitigation: [
      'Early harvest when Boro rice reaches 80% physiological maturity',
      'Strengthen submersible char embankments and drainage canals',
      'Utilize short-duration Boro varieties (BRRI dhan28/88)'
    ],
    icon: 'water'
  },
  Flood: {
    description: 'Monsoon inundation with high precipitation accumulation & sharp SAR backscatter drops.',
    impact: 'Widespread standing crop damage, soil erosion, farmer displacement',
    mitigation: [
      'Cultivate submergence-tolerant rice varieties (BRRI dhan51/52, Bina-11)',
      'Construct elevated floating seedbeds (Dhap) for vegetable production',
      'Establish community grain banks and elevated fodder shelters'
    ],
    icon: 'rainy'
  },
  'Heat Wave': {
    description: 'Extreme maximum temperatures (>38°C) causing spikelet sterility.',
    impact: 'Grain flower abortion, heat stress, forced maturity',
    mitigation: [
      'Keep paddy fields flooded with 5-7 cm cool standing water',
      'Foliar spray of 1% potassium chloride (KCl) solution to boost heat tolerance',
      'Shift sowing dates to align flowering with milder temperature windows'
    ],
    icon: 'sunny'
  },
  'Severe Local Storm': {
    description: 'Convective storm system (Nor\'wester/Kalbaishakhi) with high winds & hail.',
    impact: 'Crop lodging, physical hail damage, fruit shedding',
    mitigation: [
      'Provide mechanical staking for banana, sugarcane, and vegetables',
      'Drain excess rainwater immediately after storm events',
      'Erect windbreak trees along northern and western field perimeters'
    ],
    icon: 'thunderstorm'
  },
  'Tropical Cyclone': {
    description: 'Severe coastal storm surge and high wind system causing storm inundation.',
    impact: 'Saline water intrusion, severe structural and crop devastation',
    mitigation: [
      'Harvest mature coastal crops immediately upon cyclone warning (Signal 4+)',
      'Construct multi-purpose coastal sluice gates and polder embankments',
      'Plant salt-tolerant Aman varieties (BRRI dhan73/87) post-event'
    ],
    icon: 'cyclone'
  }
};

const UploadPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [predictionResult, setPredictionResult] = useState<{
    prediction: number[];
    severity: number;
    processingTimeMs: number;
    channelFeatures?: any;
  } | null>(null);

  const processRasterTensor = async (upload: File) => {
    setLoading(true);
    setError(null);
    setPredictionResult(null);
    const start = performance.now();
    try {
      const body = await readTensorUpload(upload);
      const res = await fetch('/api/predict', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body,
        signal: AbortSignal.timeout(55_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Model inference failed.');
      const pred = data.prediction;
      if (pred?.source !== 'tflite' || !Array.isArray(pred.class_probabilities)
          || pred.class_probabilities.length !== 8 || !Number.isFinite(pred.severity_score)) {
        throw new Error('Unverified model response. No prediction displayed.');
      }
      setPredictionResult({ prediction: pred.class_probabilities.map((p: { score: number }) => p.score),
        severity: pred.severity_score,
        processingTimeMs: data.inference?.latency_ms ?? performance.now() - start });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed. No prediction generated.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setFileName(f.name);
      setError(null);
      processRasterTensor(f);
    } else {
      setError('Please drag & drop a valid GeoTIFF / NetCDF raster file.');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setFileName(f.name);
      setError(null);
      processRasterTensor(f);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200">
            Multispectral Tensor Ingestion
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          GeoTIFF & Multispectral Raster Ingestion
        </h1>
        <p className="text-xs md:text-sm text-slate-600 mt-1 max-w-2xl">
          Upload 15-channel spatio-temporal tensors <code className="text-slate-900 font-bold">(1, 15, 10, 64, 64)</code> in NCDHW format from a real tensor JSON or a time-stacked TIFF.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Upload Control Column */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Drag & Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="bg-white border-2 border-dashed border-slate-300 hover:border-[#f9a825] transition-all rounded-2xl p-6 text-center cursor-pointer relative overflow-hidden group shadow-xs"
          >
            <input
              type="file"
              accept=".tif,.tiff,.geotiff,.json"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform">
              <MaterialIcon name="satellite_alt" className="w-4 h-4 inline-block mr-1" />
            </div>
            
            <h3 className="text-sm font-bold text-slate-900">
              {fileName ? `Loaded: ${fileName}` : 'Drop GeoTIFF Raster File Here'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Supports .tif/.tiff/.geotiff time stacks and tensor .json.
            </p>
            
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl border border-slate-800 transition-colors shadow-xs"
            >
              Browse Local Files
            </motion.button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs text-slate-600">
            Trained FP32 model inference only. TIFFs must contain 10 chronological images,
            each 64×64 with 15 bands in the documented preprocessing order. JSON tensors
            use raw NCDHW values. Missing time steps and nodata are rejected, never fabricated.
          </div>

          {/* Tensor Channel Mapping Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono space-y-2 text-slate-700">
            <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
              15-Channel Spatial Mappings
            </h4>
            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
              <div>Ch 0: SAR VV</div>
              <div>Ch 1: SAR VH</div>
              <div>Ch 2: Sentinel Blue</div>
              <div>Ch 3: Sentinel Red</div>
              <div>Ch 4: Sentinel NIR</div>
              <div>Ch 5: Sentinel SWIR</div>
              <div>Ch 6: 2m Temperature</div>
              <div>Ch 7: Total Precip</div>
              <div>Ch 8: Max Temp</div>
              <div>Ch 9: Min Temp</div>
              <div>Ch 10: Soil Water L1</div>
              <div>Ch 11: Soil Water L3</div>
            </div>
          </div>

        </div>

        {/* Prediction Results Panel */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-12 text-center space-y-4 shadow-xs"
              >
                <div className="w-12 h-12 border-4 border-[#f9a825] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <h3 className="text-base font-bold text-slate-900">Running 3D-CNN Inference...</h3>
                <p className="text-xs text-slate-500">
                  Transposing NCDHW to NDHWC tensor and querying TFLite FP32 Dual-Head Model.
                </p>
              </motion.div>
            ) : predictionResult ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <PredictionPanel
                  hazardProfiles={hazardProfiles}
                  prediction={predictionResult.prediction}
                  severity={predictionResult.severity}
                  processingTimeMs={predictionResult.processingTimeMs}
                  channelFeatures={predictionResult.channelFeatures}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-12 text-center text-slate-500 space-y-2 shadow-xs"
              >
                <span className="text-3xl sm:text-4xl block"><MaterialIcon name="satellite_alt" className="w-4 h-4 inline-block mr-1" /></span>
                <h3 className="text-sm font-bold text-slate-900">No Raster Loaded Yet</h3>
                <p className="text-xs">Upload a real time-stacked TIFF or tensor JSON to run the trained model.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

    </motion.div>
  );
};

export default UploadPage;
