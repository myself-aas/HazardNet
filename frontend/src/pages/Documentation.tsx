import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import MaterialIcon from '../components/MaterialIcon';

/**
 * Documentation hub. The topic pages it links to are rendered by ArticlePage
 * from src/content/site-routes.json, so the prerendered HTML and the SPA can
 * never drift apart. This hub is the map: one card per topic, deep links into
 * the surfaces being documented, and the honesty rules up front.
 */

interface DocTopic {
  to: string;
  icon: string;
  kicker: string;
  title: string;
  blurb: string;
}

const TOPICS: DocTopic[] = [
  {
    to: '/docs/platform',
    icon: 'hub',
    kicker: '01',
    title: 'The platform',
    blurb: 'What HazardNet publishes and a map of every surface, from the live map to the last run.',
  },
  {
    to: '/docs/hazards',
    icon: 'thunderstorm',
    kicker: '02',
    title: 'Hazard classes',
    blurb: 'The eight classes, their seasons, what each is scored from, and where the score stops telling the truth.',
  },
  {
    to: '/docs/districts',
    icon: 'map',
    kicker: '03',
    title: 'Districts',
    blurb: 'The 64-district, 8-division coverage and what a district outlook page carries.',
  },
  {
    to: '/docs/forecasts',
    icon: 'timeline',
    kicker: '04',
    title: 'Forecasts',
    blurb: 'The published record, the two severity tracks, the 7-day and 15-day horizons and the freshness policy.',
  },
  {
    to: '/docs/alerts-and-advisories',
    icon: 'notification_important',
    kicker: '05',
    title: 'Alerts and advisories',
    blurb: 'The four alert levels, the ceiling rule, and the line between guidance and official warnings.',
  },
  {
    to: '/docs/archive',
    icon: 'history_edu',
    kicker: '06',
    title: 'Historical archive',
    blurb: 'The catalogued record since May 2000, its national baseline and the Earth Engine cross-check.',
  },
  {
    to: '/docs/data-and-api',
    icon: 'database',
    kicker: '07',
    title: 'Data and the API',
    blurb: 'Provenance and attribution, downloadable artifacts and the read-only forecast and archive endpoints.',
  },
  {
    to: '/docs/verification',
    icon: 'verified_user',
    kicker: '08',
    title: 'Verification',
    blurb: 'What has been checked, what has not, and what stays research-private.',
  },
];

const CROSS_LINKS = [
  { to: '/methodology', label: 'Methodology' },
  { to: '/data-sources', label: 'Data sources' },
  { to: '/model-performance', label: 'Validation scorecard' },
  { to: '/faq', label: 'FAQ' },
];

export const Documentation: React.FC = () => {
  // Per-route <head>: the prerenderer writes these into the static HTML, but a
  // client-side transition needs the hook to keep title/canonical/robots correct.
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      {/* Title banner */}
      <div className="bg-carbon-05 border border-carbon-20 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-ap-primary/10 text-ap-link border border-ap-primary/20">
            Documentation
          </span>
          <span className="text-carbon-60">•</span>
          <span className="text-xs text-carbon-60 font-medium">Updated 5 October 2026</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-brand font-black text-carbon-90 tracking-tight">
          Hazard<span className="text-ap-link">Net</span> documentation
        </h1>
        <p className="text-xs md:text-sm text-carbon-60 mt-2 leading-relaxed max-w-2xl">
          One place that explains every HazardNet surface and every number it shows: what the
          system publishes, how to read it, and where its limits are. Methods are
          research-private; this site publishes results and outputs only.
        </p>
      </div>

      {/* Topic index */}
      <section aria-labelledby="docs-topic-index">
        <h2 id="docs-topic-index" className="text-lg font-bold text-carbon-90 mb-3">
          How the documentation is organized
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOPICS.map((topic) => (
            <Link
              key={topic.to}
              to={topic.to}
              className="group bg-carbon-05 border border-carbon-20 rounded-2xl p-5 hover:border-carbon-20 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-carbon-50">{topic.kicker}</span>
                <MaterialIcon
                  name={topic.icon}
                  className="w-4 h-4 text-carbon-50 group-hover:text-ap-link transition-colors"
                />
              </div>
              <span className="text-sm font-bold text-carbon-90 group-hover:text-ap-link transition-colors">
                {topic.title}
              </span>
              <span className="text-xs text-carbon-60 leading-relaxed">{topic.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Honesty strip */}
      <section className="bg-carbon-05 border border-carbon-20 rounded-2xl p-6 space-y-2">
        <h2 className="text-sm font-bold text-carbon-90">Three standing rules</h2>
        <ul className="text-xs text-carbon-70 space-y-1.5 list-disc pl-5">
          <li>
            HazardNet is decision support, not an official warning service. Official warnings
            come from the Bangladesh Meteorological Department and the Flood Forecasting and
            Warning Centre.
          </li>
          <li>
            Forecast skill is not yet validated against observed outcomes. Every severity value
            is published with that stated, and nothing is interpolated to fill a gap.
          </li>
          <li>
            Model code, dataset collection, training and benchmarking are research-private.
            Results and outputs are public.
          </li>
        </ul>
      </section>

      {/* Cross-links to the trust surfaces */}
      <section className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-carbon-60 mr-1">Related references</span>
        {CROSS_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="px-3 py-1.5 bg-carbon-05 hover:bg-carbon-10 border border-carbon-20 rounded-full text-xs font-bold text-carbon-80 transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </section>
    </motion.div>
  );
};

export default Documentation;
