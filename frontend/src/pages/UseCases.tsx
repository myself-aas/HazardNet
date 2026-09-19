import MaterialIcon from "../components/MaterialIcon";
import React from 'react';
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import { usePageSeo } from '../hooks/usePageSeo';

interface UseCaseData {
  id: string;
  title: string;
  region: string;
  hazardType: string;
  impactLevel: string;
  icon: string;
  bannerColor: string;
  districtId: string;
  summary: string;
  satelliteData: string;
  affectedCrops: string[];
  mitigationSteps: string[];
  stats: { label: string; value: string }[];
}

const USE_CASES: UseCaseData[] = [
  {
    id: 'haor',
    title: 'Northeastern Haor Basin Flash Flood Protection',
    region: 'Sylhet, Sunamganj, Netrokona & Kishoreganj',
    hazardType: 'Flash Flood',
    impactLevel: 'Critical Hazard (Upstream Surge)',
    icon: 'water',
    bannerColor: 'border-cyan-300 bg-cyan-50/80 text-cyan-900',
    districtId: 'sunamganj',
    summary: 'Rapid pre-monsoon water level surges in April-May overwhelm submersible embankments, threatening over 800,000 hectares of ripe Boro paddy rice right before harvest season.',
    satelliteData: 'Sentinel-1 C-band SAR VV/VH backscatter drop below -18dB indicates open water surface expansion across Haor depressions.',
    affectedCrops: ['Boro Paddy Rice (BRRI dhan28/29)', 'Freshwater Inland Fisheries', 'Haor Cattle Forage'],
    mitigationSteps: [
      'Trigger 72-hour early harvest advisory for Boro rice at 80% grain maturity.',
      'Deploy mobile water pumping units near vulnerable submersible dikes.',
      'Dispatch livestock evacuation alerts to high-ground Kanda refuges.'
    ],
    stats: [
      { label: 'Annual Crop Exposure', value: '$240M USD' },
      { label: 'Warning Lead Time', value: '72 Hours' },
      { label: 'Model Accuracy', value: '94.8% F1-Score' }
    ]
  },
  {
    id: 'cyclone',
    title: 'Southern Coastal Belt Cyclone & Saline Surge Mitigation',
    region: 'Satkhira, Khulna, Bagerhat, Barguna & Cox\'s Bazar',
    hazardType: 'Tropical Cyclone',
    impactLevel: 'Severe Coastal Inundation',
    icon: 'cyclone',
    bannerColor: 'border-carbon-30 bg-carbon-05 text-carbon-90',
    districtId: 'satkhira',
    summary: 'Category 1-3 cyclones originating in the Bay of Bengal generate +2m to +4m storm surges that breach polders, flooding shrimp ghers and salinizing agricultural soils.',
    satelliteData: 'Sentinel-2 NDWI (Normalized Difference Water Index) combined with ERA5 reanalysis surface wind vectors (>120 km/h).',
    affectedCrops: ['Aman Rice Seedbeds', 'Shrimp & Crab Aquaculture', 'Betel Leaf Farms', 'Salt Pans'],
    mitigationSteps: [
      'Activate automated coastal polder sluice gate lockdown before surge peak.',
      'Alert brackish aquaculture farmers to reinforce perimeter netting against fish escape.',
      'Issue post-surge soil leaching recommendations with gypsum and organic mulch.'
    ],
    stats: [
      { label: 'Polder Coverage', value: '123 Coastal Zones' },
      { label: 'Surge Prediction', value: '±0.25m Height' },
      { label: 'Population Served', value: '14.2M People' }
    ]
  },
  {
    id: 'barind',
    title: 'Northwestern Barind Tract Drought & Soil Moisture Deficit',
    region: 'Rajshahi, Naogaon, Chapainawabganj & Bogra',
    hazardType: 'Drought',
    impactLevel: 'Extreme Soil Aridity',
    icon: 'sunny',
    bannerColor: 'border-amber-300 bg-amber-50/80 text-amber-900',
    districtId: 'rajshahi',
    summary: 'High terrace clay soils in Barind suffer prolonged rainfall deficits during pre-monsoon and post-monsoon windows, severely stressing Aus rice transplanting and mango orchards.',
    satelliteData: 'Landsat-8 / Sentinel-2 NDMI (Soil Moisture Index) and MODIS Land Surface Temperature (LST >38°C).',
    affectedCrops: ['Aus & Aman Rice', 'Fazli & Ashwina Mangoes', 'Maize & Winter Wheat'],
    mitigationSteps: [
      'Recommend Alternate Wetting & Drying (AWD) irrigation schedules to conserve 30% groundwater.',
      'Promote drought-tolerant crop diversification (Mustard, Chickpea, Sorghum).',
      'Schedule deep tube well supplementary irrigation during critical flowering stages.'
    ],
    stats: [
      { label: 'Irrigation Saved', value: '32% Water Volume' },
      { label: 'SPEI Index Tracked', value: '-2.5 to +2.5' },
      { label: 'Farmers Reached', value: '450,000+' }
    ]
  },
  {
    id: 'coldwave',
    title: 'Sub-Himalayan Winter Cold Snap & Fog Injury Advisory',
    region: 'Panchagarh, Thakurgaon, Dinajpur, Rangpur & Kurigram',
    hazardType: 'Cold Wave',
    impactLevel: 'Seedling Chilling Injury',
    icon: 'ac_unit',
    bannerColor: 'border-blue-300 bg-blue-50/80 text-blue-900',
    districtId: 'panchagarh',
    summary: 'Cold air advection from the Himalayan foothills drops winter minimum temperatures below 7°C accompanied by dense fog, causing yellowing and chilling injury in Boro rice seedbeds.',
    satelliteData: 'INSAT-3D fog boundary segmentation + ERA5-Land 2m temperature fields (<8°C for >12 hours).',
    affectedCrops: ['Boro Paddy Seedbeds', 'Potato Tubers (Late Blight)', 'Winter Vegetables & Mustard'],
    mitigationSteps: [
      'Advise farmers to cover seedling nurseries with transparent polythene sheets at night.',
      'Maintain 3-5cm standing water in seedbeds during cold nights to buffer soil temperature.',
      'Issue preventive fungicide spraying advisories for potato late blight fungal disease.'
    ],
    stats: [
      { label: 'Min Temp Tracked', value: '4.5°C Floor' },
      { label: 'Seedling Loss Cut', value: '68% Reduction' },
      { label: 'Fog Warning Lead', value: '24 Hours' }
    ]
  }
];

export const UseCases: React.FC = () => {
  // Per-route <head>: see the note in frontend/src/hooks/usePageSeo.ts.
  usePageSeo('/use-cases');
  const [searchParams] = useSearchParams();
  const caseParam = searchParams.get('case');
  const [activeCaseId, setActiveCaseId] = useState<string>('haor');

  useEffect(() => {
    if (caseParam && USE_CASES.some((c) => c.id === caseParam)) {
      setActiveCaseId(caseParam);
    }
  }, [caseParam]);

  const activeCase = USE_CASES.find((c) => c.id === activeCaseId) || USE_CASES[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-6xl mx-auto"
    >
      
      <Breadcrumbs />

      {/* Header Banner */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden group space-y-3">
        <div className="absolute top-0 left-0 w-full h-1 bg-nasa-red"></div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 text-amber-900 border border-amber-300 uppercase tracking-wider shadow-2xs">
            Agricultural Disaster AI
          </span>
          <span className="text-carbon-30">•</span>
          <span className="text-xs text-carbon-60 font-semibold">South Asia Regional Deployment</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-brand font-black text-carbon-90 tracking-tight">
          Hazard<span className="text-nasa-red-shade">Net</span> Operational Use Cases & Field Impact
        </h1>
        <p className="text-carbon-60 text-xs md:text-sm leading-relaxed max-w-3xl">
          Discover how HazardNet's 15-band multi-task neural network mitigates disaster risks across distinct agro-ecological zones in Bangladesh, protecting food security and rural livelihoods.
        </p>
      </div>

      {/* Use Case Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {USE_CASES.map((item) => {
          const isSelected = item.id === activeCaseId;
          return (
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              key={item.id}
              onClick={() => setActiveCaseId(item.id)}
              className={`p-4 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md cursor-pointer ${
                isSelected
                  ? 'bg-amber-50/90 text-carbon-90 border-nasa-blue ring-2 ring-nasa-blue/40 shadow-amber-500/10'
                  : 'bg-white text-carbon-80 border-carbon-20 hover:border-carbon-30 hover:bg-carbon-05/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <MaterialIcon name={item.icon} className="w-4 h-4" />
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-extrabold border ${
                  isSelected ? 'bg-amber-200/90 text-amber-950 border-amber-300' : 'bg-carbon-10 text-carbon-70 border-carbon-20'
                }`}>
                  {item.hazardType}
                </span>
              </div>

              <div>
                <h3 className="font-extrabold text-xs sm:text-sm leading-snug line-clamp-2 text-carbon-90">{item.title}</h3>
                <p className={`text-[11px] mt-1 font-medium line-clamp-1 ${isSelected ? 'text-carbon-70' : 'text-carbon-60'}`}>
                  {item.region}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Active Detailed Use Case Display with AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCase.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="bg-white border border-carbon-20/90 rounded-3xl p-6 md:p-8 shadow-lg space-y-6 relative overflow-hidden"
        >
          
          {/* Case Banner */}
          <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${activeCase.bannerColor}`}>
            <div className="flex items-center gap-3.5">
              <MaterialIcon name={activeCase.icon} className="w-4 h-4" />
              <div>
                <h2 className="text-lg font-black text-carbon-90 tracking-tight">{activeCase.title}</h2>
                <p className="text-xs font-semibold text-carbon-70 opacity-90 mt-0.5">{activeCase.region} • {activeCase.impactLevel}</p>
              </div>
            </div>

            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                to={`/?district=${activeCase.districtId}&report=true`}
                className="px-4 py-2.5 rounded-xl bg-carbon-90 hover:bg-carbon-80 text-white text-xs font-black transition-all shadow-md hover:shadow-lg shrink-0 text-center inline-block cursor-pointer"
              >
                <MaterialIcon name="satellite_alt" className="w-4 h-4" /> Simulate Hazard on Live GIS
              </Link>
            </motion.div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {activeCase.stats.map((st, i) => (
              <motion.div whileHover={{ y: -3 }} key={i} className="p-4 sm:p-5 rounded-2xl bg-carbon-05/90 border border-carbon-20/80 hover:border-amber-300/80 hover:shadow-md transition-all duration-300 space-y-1.5">
                <span className="text-[10px] font-mono font-bold text-carbon-60 uppercase tracking-wider block">{st.label}</span>
                <span className="text-xl sm:text-2xl font-black text-carbon-90">{st.value}</span>
              </motion.div>
            ))}
          </div>

          {/* Core Summary & Satellite Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-5 rounded-2xl bg-carbon-05/80 border border-carbon-20/80 hover:border-carbon-30 transition-all shadow-2xs">
              <h3 className="font-bold text-xs uppercase font-mono text-carbon-90 flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-100 text-amber-900"><MaterialIcon name="content_copy" className="w-4 h-4" /></span> Problem Statement & Threat
              </h3>
              <p className="text-xs sm:text-sm text-carbon-60 leading-relaxed font-normal">
                {activeCase.summary}
              </p>
            </div>

            <div className="space-y-3 p-5 rounded-2xl bg-carbon-05/80 border border-carbon-20/80 hover:border-carbon-30 transition-all shadow-2xs">
              <h3 className="font-bold text-xs uppercase font-mono text-carbon-90 flex items-center gap-2">
                <span className="p-1 rounded-lg bg-cyan-100 text-cyan-900"><MaterialIcon name="satellite_alt" className="w-4 h-4" /></span> Satellite Sentinel Radar & Spectral Signature
              </h3>
              <p className="text-xs text-carbon-70 leading-relaxed font-mono bg-white p-3.5 rounded-xl border border-carbon-20 shadow-2xs">
                {activeCase.satelliteData}
              </p>
            </div>
          </div>

          {/* Crops Affected & Mitigation Protocols */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-carbon-90 flex items-center gap-2">
                <MaterialIcon name="agriculture" className="w-4 h-4 text-emerald-600" /> Vulnerable Crops & Local Commodities
              </h3>
              <ul className="space-y-2 text-xs">
                {activeCase.affectedCrops.map((crop, i) => (
                  <motion.li whileHover={{ x: 3 }} key={i} className="p-3 rounded-xl bg-carbon-05/90 border border-carbon-20/80 text-carbon-70 flex items-center gap-2.5 font-semibold hover:border-emerald-300/80 transition-all shadow-2xs">
                    <span className="text-emerald-600 font-extrabold bg-emerald-100/80 rounded-full p-0.5 px-1 text-[10px]">✔</span>
                    <span>{crop}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-carbon-90 flex items-center gap-2">
                <MaterialIcon name="shield" className="w-4 h-4" /> Automated Agronomic 72-Hour Mitigation Steps
              </h3>
              <ul className="space-y-2 text-xs">
                {activeCase.mitigationSteps.map((step, i) => (
                  <motion.li whileHover={{ x: 3 }} key={i} className="p-3 rounded-xl bg-carbon-05/90 border border-carbon-20/80 text-carbon-70 flex items-start gap-2.5 hover:border-amber-300/80 transition-all shadow-2xs">
                    <span className="font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-lg text-xs shrink-0">{i + 1}</span>
                    <span className="font-medium pt-0.5">{step}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

          </div>

        </motion.div>
      </AnimatePresence>

      {/* Cross-Link Quick Actions */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs text-carbon-90">
        <div className="space-y-1 text-center md:text-left">
          <h3 className="text-lg font-black text-carbon-90 tracking-tight">Ready to test these models locally on your system?</h3>
          <p className="text-xs text-carbon-60 font-medium">
            Download our standalone Wasm runtime, desktop GUI, or Python PyPI library for offline satellite tensor evaluation.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/download"
              className="px-5 py-2.5 rounded-xl bg-nasa-red hover:bg-nasa-red-shade text-carbon-black font-black text-xs transition-all shadow-md hover:shadow-lg inline-block cursor-pointer"
            >
              <MaterialIcon name="download" className="w-4 h-4" /> Download Software
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/docs"
              className="px-5 py-2.5 rounded-xl bg-white text-carbon-90 font-bold text-xs hover:bg-carbon-10 transition-all border border-carbon-30 shadow-xs inline-block cursor-pointer"
            >
              <MaterialIcon name="menu_book" className="w-4 h-4" /> Read Research Docs
            </Link>
          </motion.div>
        </div>
      </div>

    </motion.div>
  );
};

export default UseCases;
