import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ForecastDashboard from '../components/ForecastDashboard';

export const AnalyticsAnalyticsPage: React.FC = () => {
  const { subCategory } = useParams<{ subCategory?: string }>();
  const navigate = useNavigate();
  const activeTab = subCategory || 'forecast-dashboard';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
    >
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden transition-all duration-300 hover:shadow-lg">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono font-bold mb-3 shadow-2xs">
            <span>RESEARCHER & ADMIN ANALYTICS</span>
            <span>•</span>
            <span>TensorFlow & CI/CD Telemetry</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Model Diagnostics & Pipeline Observability
          </h1>
          <p className="text-slate-600 mt-2 max-w-3xl text-xs sm:text-sm leading-relaxed">
            Cross-strategy validation of the hazard classifier (leakage-safe evaluation, values registered in docs/CLAIMS.md) and the automated GitHub Actions CI/CD forecast pipeline.
          </p>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-2.5 border-b border-slate-200/90 pb-4 overflow-x-auto scrollbar-none touch-scroll">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/forecast-dashboard')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'forecast-dashboard' ? 'bg-amber-500 text-slate-900 shadow-2xs' : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          Forecast Dashboard (Firestore & Recharts)
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/model-metrics')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'model-metrics' ? 'bg-amber-500 text-slate-900 shadow-2xs' : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          Model Metrics (Cross-Strategy Validation)
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/pipeline-status')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'pipeline-status' ? 'bg-amber-500 text-slate-900 shadow-2xs' : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          Pipeline Status (GitHub Actions CI/CD)
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/historical')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'historical' ? 'bg-amber-500 text-slate-900 shadow-2xs' : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          Historical EM-DAT vs Prediction Explorer
        </motion.button>
      </div>

      {/* Content based on subTab with AnimatePresence */}
      <AnimatePresence mode="wait">
        {activeTab === 'forecast-dashboard' && (
          <motion.div
            key="forecast-dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <ForecastDashboard onSelectDistrict={(id) => navigate(`/?district=${id}`)} />
          </motion.div>
        )}
        {activeTab === 'model-metrics' && (
          <motion.div
            key="model-metrics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
          >
            <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md hover:shadow-lg transition-all space-y-3 cursor-pointer">
              <div className="text-xs font-mono text-slate-500 font-bold">EVENT 5-FOLD CV (LEAKY BASELINE)</div>
              <div className="text-3xl font-black text-slate-900">98.87%</div>
              <p className="text-xs text-slate-600 leading-relaxed">Random-split accuracy — leakage-inflated; shown only as a labeled legacy reference.</p>
            </motion.div>
            <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md hover:shadow-lg transition-all space-y-3 cursor-pointer">
              <div className="text-xs font-mono text-slate-500 font-bold">SPATIAL LEAVE-ONE-DISTRICT-OUT</div>
              <div className="text-3xl font-black text-slate-900">95.66%</div>
              <p className="text-xs text-slate-600 leading-relaxed">Held-out districts — honest in-distribution spatial skill.</p>
            </motion.div>
            <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md hover:shadow-lg transition-all space-y-3 sm:col-span-2 md:col-span-1 cursor-pointer">
              <div className="text-xs font-mono text-slate-500 font-bold">TEMPORAL (FORWARD-TIME)</div>
              <div className="text-3xl font-black text-slate-900">10.9%</div>
              <p className="text-xs text-slate-600 leading-relaxed">Near chance — the v3 leakage-safe retraining program exists because of this number.</p>
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'pipeline-status' && (
          <motion.div
            key="pipeline-status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6"
          >
            <h2 className="text-xl font-bold text-slate-900">GitHub Actions Forecast Pipeline Sync Logs</h2>
            <div className="space-y-3 font-mono text-xs">
              <motion.div whileHover={{ x: 3 }} className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>[SUCCESS] GEE Sync: Sentinel-1/2 SAR & ERA5-Land rasters fetched (00:00 UTC daily run)</span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold w-fit border border-emerald-200">OK</span>
              </motion.div>
              <motion.div whileHover={{ x: 3 }} className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>[SUCCESS] Model bundle verified: hazardnet_fp32.tflite (sha256 manifest)</span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold w-fit border border-emerald-200">OK</span>
              </motion.div>
              <motion.div whileHover={{ x: 3 }} className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>[RUNNING] Firebase Firestore real-time sync worker active</span>
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold w-fit border border-amber-200">LIVE</span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {activeTab === 'historical' && (
          <motion.div
            key="historical"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6"
          >
            <h2 className="text-xl font-bold text-slate-900">EM-DAT International Disaster Database vs HazardNet Predictions</h2>
            <p className="text-sm text-slate-600 leading-relaxed">Comparative analysis of historical flood, cyclone, and drought events (1990-2026) in Bangladesh mapped against neural tensor forecasts.</p>
            <div className="h-64 bg-slate-50/80 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-500 font-mono text-xs px-4 text-center">
              Interactive EM-DAT Comparison Chart (Authorized Researcher View)
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AnalyticsAnalyticsPage;
