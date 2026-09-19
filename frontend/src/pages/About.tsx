import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import { usePageSeo } from '../hooks/usePageSeo';

export const About: React.FC = () => {
  // Per-route <head>: the prerenderer writes these into the static HTML, but a
  // client-side transition needs the hook to keep title/canonical/robots correct.
  usePageSeo('/about');
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto text-carbon-80"
    >
      <Breadcrumbs />

      {/* Hero Banner */}
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2 }}
        className="bg-white border border-carbon-20 rounded-2xl p-6 md:p-8 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200">
            HazardNet Early Warning Initiative
          </span>
          <span className="text-carbon-30">•</span>
          <span className="text-xs text-carbon-60 font-medium">Active Deployment: 2026</span>
        </div>
        
        <h1 className="text-2xl md:text-3xl font-brand font-black text-carbon-90 tracking-tight">
          Hazard<span className="text-nasa-red-shade">Net</span> Agro-Climatic Intelligence Platform
        </h1>
        <p className="text-xs md:text-sm text-carbon-60 leading-relaxed max-w-3xl">
          Automated multi-hazard early warning, 15-band satellite feature classification, physical severity quantification, and offline-capable edge computing for agricultural extension across Bangladesh.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/use-cases"
              className="px-4 py-2 rounded-xl bg-carbon-90 hover:bg-carbon-80 text-white text-xs font-bold transition-all shadow-xs inline-block"
            >
              Explore Regional Use Cases
            </Link>
          </motion.div>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/download"
              className="px-4 py-2 rounded-xl bg-nasa-red hover:bg-nasa-red-shade text-carbon-90 text-xs font-bold transition-all shadow-xs inline-block"
            >
              Download Offline Software
            </Link>
          </motion.div>

          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <a
              href="https://github.com/myself-aas/HazardNet"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-carbon-10 text-carbon-70 text-xs font-bold border border-carbon-20 hover:text-carbon-90 hover:bg-carbon-20 transition-all inline-block"
            >
              GitHub Repository
            </a>
          </motion.div>
        </div>
      </motion.div>

      {/* Impact Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Spatial Coverage', val: '64 Districts', detail: 'All 8 Administrative Divisions' },
          { label: 'Hazard Categories', val: '8 Distinct Classes', detail: 'Flood, Cyclone, Drought & Storms' },
          { label: 'Severity Precision', val: '0.00 - 1.00', detail: 'Continuous Physical Index' },
          { label: 'Inference Target', val: '<100ms Latency', detail: 'Edge-First TFLite WASM Engine' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            whileHover={{ y: -3, scale: 1.01 }}
            className="bg-white border border-carbon-20 p-5 rounded-2xl space-y-1 shadow-xs cursor-pointer"
          >
            <span className="text-[10px] font-mono uppercase text-carbon-60 font-bold block">{stat.label}</span>
            <span className="text-xl font-extrabold text-carbon-90">{stat.val}</span>
            <p className="text-[11px] text-carbon-60">{stat.detail}</p>
          </motion.div>
        ))}
      </div>

      {/* Team & Institutional Partners */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-carbon-20 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs"
      >
        <h2 className="text-lg font-bold text-carbon-90">
          Institutional Collaborators & Research Partners
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {[
            { name: 'BUET GIS Lab', role: 'Geospatial Modeling Partner', location: 'Dhaka, Bangladesh' },
            { name: 'SPARRSO', role: 'Space Research & Remote Sensing', location: 'Agargaon, Dhaka' },
            { name: 'BMD & FFWC', role: 'Meteorological Data Liaison', location: 'Dhaka, Bangladesh' },
            { name: 'DAE (Dept of Agricultural Extension)', role: 'Agronomic Guidance Advisor', location: 'Dhaka, Bangladesh' }
          ].map((partner, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -2 }}
              className="p-4 rounded-xl bg-carbon-05 border border-carbon-20 space-y-1 transition-all"
            >
              <h3 className="font-bold text-carbon-90">{partner.name}</h3>
              <p className="text-carbon-70 font-medium text-[11px]">{partner.role}</p>
              <p className="text-carbon-60 text-[10px]">{partner.location}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Disaster Vulnerability Overview */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-carbon-20 rounded-2xl p-6 md:p-8 space-y-4 shadow-xs"
      >
        <h2 className="text-lg font-bold text-carbon-90">
          Agro-Ecological Vulnerability Context in Bangladesh
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-carbon-70">
          {[
            {
              title: 'Haor Basin & Pre-Monsoon Flash Floods',
              desc: 'Districts like Sunamganj and Habiganj face rapid upstream water surges in April/May, threatening 800,000+ hectares of ripe Boro paddy rice right before harvest.',
              link: '/use-cases?case=haor',
              linkText: 'Read Haor Case Study →'
            },
            {
              title: 'Northern Cold Waves & Drought',
              desc: 'Kurigram, Rangpur, and Rajshahi experience severe seedling stunting during winter cold snaps and soil moisture deficits during summer Aus/Aman seasons.',
              link: '/use-cases?case=coldwave',
              linkText: 'Read Cold Wave Case Study →'
            },
            {
              title: 'Coastal Cyclones & Salinity Intrusion',
              desc: 'Satkhira, Barguna, and Cox\'s Bazar suffer storm surges from Bay of Bengal cyclones (Remal, Amphan), causing long-term soil salinity elevation.',
              link: '/use-cases?case=cyclone',
              linkText: 'Read Coastal Surge Case Study →'
            },
            {
              title: 'Nor\'wester Convective Storms',
              desc: 'Severe local storms bring high velocity winds and hail damage across central agricultural districts during spring planting windows.',
              link: '/docs',
              linkText: 'Read Model Architecture →'
            }
          ].map((item, idx) => (
            <motion.div
              key={idx}
              whileHover={{ scale: 1.01 }}
              className="bg-carbon-05 border border-carbon-20 p-4 rounded-xl space-y-2 transition-all"
            >
              <h3 className="font-bold text-carbon-90">
                {item.title}
              </h3>
              <p className="leading-relaxed text-carbon-60">
                {item.desc}
              </p>
              <Link to={item.link} className="text-amber-800 font-bold underline inline-block pt-1 hover:text-amber-900">
                {item.linkText}
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Open Source Project Code & License Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-carbon-20 rounded-2xl p-6 md:p-8 space-y-3 shadow-xs"
      >
        <h2 className="text-lg font-bold text-carbon-90">
          Open Source Code & License
        </h2>
        <p className="text-xs text-carbon-60 leading-relaxed">
          The HazardNet platform is licensed under the <strong>Creative Commons Attribution 4.0 International (CC BY 4.0)</strong> license. You are free to copy, redistribute, and build upon our model files and early warning algorithms, provided proper credit is given to the project.
        </p>
        <div className="p-4 bg-carbon-90 text-carbon-10 rounded-xl font-mono text-xs select-all overflow-x-auto border border-carbon-80">
          {`# Clone the HazardNet GitHub Repository
git clone https://github.com/myself-aas/HazardNet.git
cd HazardNet

# Start the local development server
npm install
npm run dev`}
        </div>
      </motion.div>

    </motion.div>
  );
};

export default About;
