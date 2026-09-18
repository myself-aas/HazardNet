import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import MaterialIcon from '../components/MaterialIcon';

export const Documentation: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      {/* Title Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-nasa-red/10 text-nasa-red-shade border border-nasa-blue/20">
            HazardNet Technical Specifications
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500 font-medium">System Documentation 2026</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-brand font-black text-slate-900 tracking-tight">
          Hazard<span className="text-nasa-red-shade">Net</span> Model Architecture & Pipeline
        </h1>
        <p className="text-xs md:text-sm text-slate-600 mt-2 leading-relaxed">
          Spatio-temporal 3D Depthwise-Separable CNN with Squeeze-and-Excitation (SE) blocks for joint multi-hazard classification and continuous physical severity quantification.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-4">
          <div className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
            Hosted inference keeps model weights private
          </div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/download?selectedTab=python"
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200 flex items-center gap-1.5"
            >
              <MaterialIcon name="code" className="w-4 h-4 inline-block mr-1" />
              <span>Python SDK Docs</span>
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <a
              href="https://github.com/myself-aas/HazardNet"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200 hover:bg-slate-200 transition-all flex items-center gap-1.5"
            >
              <span>⭐</span>
              <span>GitHub Repository</span>
            </a>
          </motion.div>
        </div>
      </div>

      {/* Model Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        <motion.div whileHover={{ y: -3 }} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1 shadow-xs">
          <span className="text-[10px] uppercase text-slate-500 block font-bold">Input Tensor Shape</span>
          <span className="text-lg font-bold text-slate-900">(1, 15, 10, 64, 64)</span>
          <p className="text-[11px] text-slate-600 font-sans mt-1">NCDHW (Batch=1, Channels=15, Timesteps=10, Height=64, Width=64)</p>
        </motion.div>
        <motion.div whileHover={{ y: -3 }} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1 shadow-xs">
          <span className="text-[10px] uppercase text-slate-500 block font-bold">Format & Precision</span>
          <span className="text-lg font-bold text-slate-900">FP32 TFLite</span>
          <p className="text-[11px] text-slate-600 font-sans mt-1">Bypassed INT8 quantization due to CONV_3D operator constraints</p>
        </motion.div>
        <motion.div whileHover={{ y: -3 }} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1 shadow-xs">
          <span className="text-[10px] uppercase text-slate-500 block font-bold">Dual Output Heads</span>
          <span className="text-lg font-bold text-slate-900">Softmax + Sigmoid</span>
          <p className="text-[11px] text-slate-600 font-sans mt-1">8 Hazard Classes + Continuous Physical Severity Index [0.0 - 1.0]</p>
        </motion.div>
      </div>

      {/* 15 Multispectral Channels Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <MaterialIcon name="radar" className="text-xl text-amber-600" />
          <span>15-Band Multispectral & Meteorological Features</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {[
            { ch: '0', name: 'SAR VV Backscatter', source: 'Sentinel-1 C-band', usage: 'Surface water inundation & soil roughness' },
            { ch: '1', name: 'SAR VH Backscatter', source: 'Sentinel-1 C-band', usage: 'Crop canopy structure & volume scattering' },
            { ch: '2', name: 'Blue Reflectance', source: 'Sentinel-2 MSI', usage: 'Atmospheric aerosols & clear water' },
            { ch: '3', name: 'Red Reflectance', source: 'Sentinel-2 MSI', usage: 'Chlorophyll absorption & vegetation stress' },
            { ch: '4', name: 'NIR Reflectance', source: 'Sentinel-2 MSI', usage: 'Cellular leaf structure & NDVI calculation' },
            { ch: '5', name: 'SWIR Reflectance', source: 'Sentinel-2 MSI', usage: 'Leaf water content & burned residue' },
            { ch: '6', name: '2m Surface Air Temp', source: 'ERA5-Land', usage: 'Thermal stress & ambient heat tracking' },
            { ch: '7', name: 'Total Precipitation', source: 'ERA5-Land', usage: 'Monsoon rainfall accumulation & drought' },
            { ch: '8', name: 'Max Daily Temperature', source: 'ERA5-Land', usage: 'Heat wave peak anomaly detection' },
            { ch: '9', name: 'Min Daily Temperature', source: 'ERA5-Land', usage: 'Cold wave seedbed damage threshold' },
            { ch: '10', name: 'Soil Water Vol Layer 1', source: 'ERA5-Land', usage: 'Topsoil moisture deficit (0-7cm)' },
            { ch: '11', name: 'Soil Water Vol Layer 3', source: 'ERA5-Land', usage: 'Rootzone moisture reserve (28-100cm)' },
            { ch: '12', name: 'Soil Temp Layer 1', source: 'ERA5-Land', usage: 'Germination temperature monitoring' },
            { ch: '13', name: '2m Dewpoint Temp', source: 'ERA5-Land', usage: 'Humidity & storm convective potential' },
            { ch: '14', name: 'Surface Solar Radiation', source: 'ERA5-Land', usage: 'Photosynthetic active radiation (PAR)' },
          ].map((item) => (
            <motion.div whileHover={{ scale: 1.01, y: -2 }} key={item.ch} className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-slate-900">Channel {item.ch}</span>
                <span className="text-[10px] text-slate-500 font-mono">{item.source}</span>
              </div>
              <div className="font-bold text-slate-800 text-xs">{item.name}</div>
              <p className="text-[11px] text-slate-600">{item.usage}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Dual Loss Formulation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <MaterialIcon name="functions" className="text-xl text-amber-600" />
          <span>Dual-Head Loss Function Formulation</span>
        </h2>
        <div className="p-4 bg-slate-900 rounded-xl font-mono text-xs text-amber-400 border border-slate-800 overflow-x-auto font-bold">
          L_total = α * L_CE(y_cls, ŷ_cls) + β * L_MSE(y_sev, ŷ_sev)
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Where <code className="text-slate-900 font-bold bg-slate-100 px-1 py-0.5 rounded">L_CE</code> is Categorical Cross-Entropy over the 8 hazard classes, and <code className="text-slate-900 font-bold bg-slate-100 px-1 py-0.5 rounded">L_MSE</code> is Mean Squared Error optimizing the continuous Sigmoid severity output against physical loss ratios. Weighting coefficients are set to <code className="text-slate-800 font-bold">α = 1.0</code> and <code className="text-slate-800 font-bold">β = 0.5</code>.
        </p>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-2 shadow-md">
        <h2 className="text-lg font-bold">Hosted inference architecture</h2>
        <p className="text-xs text-slate-300 leading-relaxed">HazardNet model weights and preprocessing parameters remain on the inference server. The browser submits authorized inputs and receives prediction results only; no model artifact is cached or shipped to clients.</p>
      </div>

      {/* Quick Action Footer */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
        <div className="space-y-1 text-center md:text-left">
          <h3 className="text-base md:text-lg font-bold text-white">Need API key access or custom research deployment?</h3>
          <p className="text-xs text-slate-300">
            Submit an academic API request or contact our remote sensing engineers.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/contact?form=api"
              className="px-4 py-2.5 rounded-xl bg-nasa-red text-slate-900 font-bold text-xs hover:bg-nasa-red-shade transition-all shadow-xs"
            >
              🔑 Request API Key
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/use-cases"
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-700 transition-all border border-slate-700"
            >
              🌾 View Use Cases
            </Link>
          </motion.div>
        </div>
      </div>

    </motion.div>
  );
};

export default Documentation;
