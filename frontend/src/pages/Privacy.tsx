import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';

export const Privacy: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-4xl mx-auto"
    >
      <Breadcrumbs />

      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6 text-xs text-slate-700 leading-relaxed">
        
        <div className="border-b border-slate-200 pb-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 uppercase">
              Privacy Policy
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">Updated: August 1, 2026</span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900">
            HazardNet AI Telemetry & Data Privacy Policy
          </h1>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">1. Commitment to Open Privacy</h2>
          <p>
            HazardNet AI is committed to protecting user privacy while delivering life-saving disaster warnings. Our edge-first WebAssembly architecture minimizes data transmission by performing neural network model inference directly inside your web browser or local device memory.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">2. Information We Process</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
            <li>
              <strong>Geolocation Data:</strong> If you grant location permission, your browser latitude and longitude are used exclusively in volatile memory to identify your local Bangladesh district and calculate distance to active flood or cyclone hazard zones. Location coordinates are never sold or logged to external servers.
            </li>
            <li>
              <strong>Uploaded Satellite GeoTIFF Files:</strong> User-uploaded raster tiles on the Ingestion page are processed temporarily in memory for 15-channel array tensor transformation. Files are automatically erased after inference completion.
            </li>
            <li>
              <strong>Offline Caching:</strong> Baseline district hazard tiles and model weights (<span className="font-mono bg-slate-100 p-0.5 rounded border border-slate-200">.tflite</span>) are cached in your browser's IndexedDB storage to guarantee offline availability during internet outages.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">3. Zero Third-Party Tracker Guarantee</h2>
          <p className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl font-medium">
            HazardNet contains <strong>no third-party advertising trackers</strong>, no social media tracking scripts, and no commercial data brokers. All telemetry is limited to anonymous error logs required for system uptime maintenance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">4. Contact Our Privacy Lead</h2>
          <p>
            If you have questions regarding data privacy or wish to request data removal, contact us via our <Link to="/contact" className="text-amber-800 font-bold underline">Contact Page</Link> or view our <Link to="/terms" className="text-amber-800 font-bold underline">Terms of Service</Link>.
          </p>
        </section>

      </div>

    </motion.div>
  );
};

export default Privacy;
