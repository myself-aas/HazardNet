import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ForecastDashboard from '../components/ForecastDashboard';
import { DataStateEmpty, DataStateError, DataStateLoading } from '../components/ui/DataState';
import EmdatComparisonChart from '../components/EmdatComparisonChart';
import { DataCreditLines } from '../components/DataCreditLines';
import hazardCatalog from '../../public/data/historical/hazard-catalog-index.json';
import modelPerformance from '../../public/data/model-performance.json';

/** Shape of `public/data/forecasts-latest.json` (hazardnet-forecast-snapshot/v2). */
interface ForecastSnapshot {
  schema?: string;
  generated_at?: string;
  prediction_date?: string;
  source?: string;
  kernel?: string;
  horizons?: Record<string, unknown[]>;
  coverage?: Record<string, unknown>;
  lineage?: Record<string, unknown>;
}

/** One line of the snapshot's own provenance, or null when the field is absent. */
function field(label: string, value: unknown): { label: string; value: string } | null {
  if (value === null || value === undefined || value === '') return null;
  return { label, value: String(value) };
}

export const AnalyticsPage: React.FC = () => {
  const { subCategory } = useParams<{ subCategory?: string }>();
  const navigate = useNavigate();
  const activeTab = subCategory || 'forecast-dashboard';

  // Pipeline status comes from the snapshot this deployment actually serves
  // (cache-busted), never from invented "log lines" (UI-01).
  const [snapshot, setSnapshot] = useState<ForecastSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSnapshotLoading(true);
    setSnapshotError(null);
    fetch('/data/forecasts-latest.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: ForecastSnapshot) => {
        if (!cancelled) {
          setSnapshot(data);
          setSnapshotLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSnapshot(null);
          setSnapshotError(err instanceof Error ? err.message : 'unavailable');
          setSnapshotLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const provenance = [
    field('Schema', snapshot?.schema),
    field('Generated at', snapshot?.generated_at),
    field('Prediction date', snapshot?.prediction_date),
    field('Kernel', snapshot?.kernel),
    field('Source', snapshot?.source),
    field('Horizons', snapshot?.horizons ? Object.entries(snapshot.horizons).map(([h, rows]) => `${h}: ${Array.isArray(rows) ? rows.length : '?'} rows`).join(' · ') : null),
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
    >
      <div className="ap-card relative overflow-hidden transition-all duration-300">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono font-bold mb-3 shadow-2xs">
            <span>RESEARCHER & ADMIN ANALYTICS</span>
            <span>•</span>
            <span>Model and pipeline diagnostics</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-carbon-90 tracking-tight">
            Model Diagnostics & Pipeline Observability
          </h1>
          <p className="text-carbon-60 mt-2 max-w-3xl text-xs sm:text-sm leading-relaxed">
            What this deployment can actually show: the freshness and provenance of the last forecast snapshot, the
            raw forecast store, and the pipeline that produced it. Accuracy metrics (latency, MAE, ECE) appear here
            only after a benchmark has been run and recorded. Until then this page says so instead of quoting
            numbers.
          </p>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-2.5 border-b border-carbon-20/90 pb-4 overflow-x-auto scrollbar-none touch-scroll">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/forecast-dashboard')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'forecast-dashboard' ? 'bg-amber-500 text-ap-on-sev shadow-2xs' : 'bg-white text-carbon-70 border border-carbon-20/90 hover:bg-carbon-05 shadow-2xs'
          }`}
        >
          Forecast dashboard
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/model-metrics')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'model-metrics' ? 'bg-amber-500 text-ap-on-sev shadow-2xs' : 'bg-white text-carbon-70 border border-carbon-20/90 hover:bg-carbon-05 shadow-2xs'
          }`}
        >
          Model metrics
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/pipeline-status')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'pipeline-status' ? 'bg-amber-500 text-ap-on-sev shadow-2xs' : 'bg-white text-carbon-70 border border-carbon-20/90 hover:bg-carbon-05 shadow-2xs'
          }`}
        >
          Pipeline status
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/historical')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
            activeTab === 'historical' ? 'bg-amber-500 text-ap-on-sev shadow-2xs' : 'bg-white text-carbon-70 border border-carbon-20/90 hover:bg-carbon-05 shadow-2xs'
          }`}
        >
          Historical record vs detections
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
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6"
          >
            <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} className="ap-card transition-all space-y-3 cursor-pointer md:col-span-2">
              <div className="text-xs font-mono text-carbon-60 font-bold">INFERENCE LATENCY</div>
              <div className="text-2xl font-black text-carbon-60">Not published</div>
              <p className="text-xs text-carbon-60 leading-relaxed">
                No committed benchmark measures end-to-end inference latency.
              </p>
            </motion.div>
            <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} className="ap-card transition-all space-y-3 cursor-pointer">
              <div className="text-xs font-mono text-carbon-60 font-bold">MEAN ABSOLUTE ERROR (MAE)</div>
              <div className="text-2xl font-black text-carbon-60">Not published</div>
              <p className="text-xs text-carbon-60 leading-relaxed">
                The classifier has not yet been scored against independent BMD/FFWC station records, so no error
                metric is quoted here. The methodology page describes the validation status that does exist.
              </p>
            </motion.div>
            <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} className="ap-card transition-all space-y-3 sm:col-span-2 md:col-span-1 cursor-pointer">
              <div className="text-xs font-mono text-carbon-60 font-bold">EXPECTED CALIBRATION ERROR (ECE)</div>
              <div className="text-2xl font-black text-carbon-60">Not published</div>
              <p className="text-xs text-carbon-60 leading-relaxed">
                No calibration has been fitted against observed outcomes, so no calibration error is quoted here.
              </p>
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
            className="ap-card space-y-6"
          >
            <h2 className="text-xl font-bold text-carbon-90">Pipeline status, as the snapshot reports it</h2>
            <p className="text-xs text-carbon-60 leading-relaxed">
              Read from the committed forecast snapshot on every load. This page does not quote run logs it did not
              read.
            </p>

            {snapshotLoading && <DataStateLoading label="Reading the forecast snapshot" loader={false} />}

            {!snapshotLoading && snapshotError && (
              <DataStateError
                title="The forecast snapshot could not be read"
                detail={snapshotError}
                onRetry={() => setReloadNonce((n) => n + 1)}
              />
            )}

            {!snapshotLoading && !snapshotError && provenance.length === 0 && (
              <DataStateEmpty
                title="The snapshot does not state its provenance"
                body="The file loaded, but carries none of the fields that say when it was produced and by what."
              />
            )}

            {!snapshotLoading && !snapshotError && provenance.length > 0 && (
              <dl className="divide-y divide-carbon-10 border border-carbon-20 rounded-xl bg-white">
                {provenance.map((row) => (
                  <div key={row.label} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                    <dt className="text-xs font-semibold text-carbon-60">{row.label}</dt>
                    <dd className="break-words font-mono text-xs text-carbon-90 sm:text-right">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </motion.div>
        )}

        {activeTab === 'historical' && (
          <motion.div
            key="historical"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="ap-card space-y-6"
          >
            <h2 className="text-xl font-bold text-carbon-90">Recorded historical events vs HazardNet detections</h2>
            <p className="text-sm text-carbon-60 leading-relaxed">
              The catalogued historical record for Bangladesh plotted against the episodes HazardNet has been
              scored on. The two are different kinds of measurement and are drawn as different marks: the record
              spans every year, the benchmark covers five episodes and reports detection only.
            </p>
            <EmdatComparisonChart
              events={hazardCatalog as { year: number; hazard_type: string }[]}
              episodes={modelPerformance.episodes}
              caveats={modelPerformance.how_to_read}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <DataCreditLines ids={['forecasts', 'advisoryEda']} showBibtex />
    </motion.div>
  );
};

export default AnalyticsPage;
