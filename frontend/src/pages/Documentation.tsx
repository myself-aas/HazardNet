import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import MaterialIcon from '../components/MaterialIcon';
import { usePageSeo } from '../hooks/usePageSeo';

/**
 * Results reference for the published HazardNet outputs. Model code, dataset
 * collection, training and benchmarking are research-private and documented
 * here only as "not published".
 */
export const Documentation: React.FC = () => {
  // Per-route <head>: the prerenderer writes these into the static HTML, but a
  // client-side transition needs the hook to keep title/canonical/robots correct.
  usePageSeo('/docs');
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      {/* Title Banner */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-nasa-red/10 text-nasa-red-shade border border-nasa-blue/20">
            HazardNet Results Reference
          </span>
          <span className="text-carbon-30">•</span>
          <span className="text-xs text-carbon-60 font-medium">System Documentation 2026</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-brand font-black text-carbon-90 tracking-tight">
          Hazard<span className="text-nasa-red-shade">Net</span> Results Reference
        </h1>
        <p className="text-xs md:text-sm text-carbon-60 mt-2 leading-relaxed">
          What the system publishes, how to read every number, and where the limits are.
          Methods are research-private: this site publishes results and outputs only.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-4">
          <div className="px-4 py-2 bg-carbon-10 text-carbon-60 text-xs font-bold border border-carbon-20">
            Methods are research-private
          </div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/model-performance"
              className="px-4 py-2 bg-carbon-10 hover:bg-carbon-20 text-carbon-80 text-xs font-bold transition-all border border-carbon-20 flex items-center gap-1.5"
            >
              <MaterialIcon name="insights" className="w-4 h-4 inline-block mr-1" />
              <span>Validation Scorecard</span>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* The published record */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <h2 className="text-lg font-bold text-carbon-90">The published forecast record</h2>
        <p className="text-xs text-carbon-70 leading-relaxed">
          Every figure on HazardNet traces to one published record per district and forecast date:
        </p>
        <ul className="text-xs text-carbon-70 space-y-1.5 list-disc pl-5">
          <li><strong>District</strong> — one of the 64 districts of Bangladesh.</li>
          <li><strong>Hazard class</strong> — one of eight classes.</li>
          <li><strong>Severity</strong> — a continuous value reported in two tracks (see below).</li>
          <li><strong>Confidence score</strong> — the score for the chosen class, uncalibrated.</li>
          <li><strong>Horizons</strong> — 7- and 15-day outlook windows.</li>
          <li><strong>Forecast date</strong> — the run that produced the record.</li>
        </ul>
      </div>

      {/* Severity */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <h2 className="text-lg font-bold text-carbon-90">Severity values</h2>
        <p className="text-xs text-carbon-70 leading-relaxed">
          Two tracks are reported side by side: a <strong>skill track</strong> — the system&apos;s own
          score for the class it selected — and a <strong>physics track</strong> — an independent
          estimate. They can disagree, and when they do, that is shown rather than smoothed away.
          Neither is an official warning level.
        </p>
      </div>

      {/* Alerts */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <h2 className="text-lg font-bold text-carbon-90">Alert levels</h2>
        <p className="text-xs text-carbon-70 leading-relaxed">
          Four levels are published: no alert, watch, warning and severe — at or below the
          configured ceiling for each hazard class, and never inflated by this site. Official
          warnings come from the Bangladesh Meteorological Department and the Flood Forecasting
          and Warning Centre; HazardNet defers to them.
        </p>
      </div>

      {/* Freshness */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <h2 className="text-lg font-bold text-carbon-90">Freshness &amp; provenance</h2>
        <p className="text-xs text-carbon-70 leading-relaxed">
          Every surface is stamped with the forecast date behind it. A stale run is labelled as
          stale; a missing run is shown as missing — no number is interpolated to fill a gap.
        </p>
      </div>

      {/* Validation */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <h2 className="text-lg font-bold text-carbon-90">Validation status</h2>
        <p className="text-xs text-carbon-70 leading-relaxed">
          Forecast skill is <strong>not yet validated</strong> against observed outcomes. The
          published scorecard reports per-episode detection counts for five historical episodes
          and states what those numbers cannot support. See the{' '}
          <Link to="/model-performance" className="underline decoration-dotted font-semibold">
            validation scorecard
          </Link>
          .
        </p>
      </div>

      {/* Not published */}
      <div className="bg-white border border-carbon-20 p-6 md:p-8 space-y-3">
        <h2 className="text-lg font-bold text-carbon-90">What is not published</h2>
        <p className="text-xs text-carbon-70 leading-relaxed">
          Model code, dataset collection procedures, training and benchmarking are research-private.
          Only results and outputs are public — on this site and in the repository. For research
          collaboration or licensing enquiries, use the{' '}
          <Link to="/contact" className="underline decoration-dotted font-semibold">
            contact page
          </Link>
          .
        </p>
      </div>
    </motion.div>
  );
};

export default Documentation;
