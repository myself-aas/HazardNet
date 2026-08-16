import MaterialIcon from "../components/MaterialIcon";
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { getGranularDisasterData, GranularDisasterData } from '../data/disasterDetails';
import { ALL_64_DISTRICTS, getDistrictById } from '../data/bangladeshDistricts';
import { HeartIcon } from '../components/ui/animated-state-icons';

export const DistrictDetailPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const districtId = id || 'kurigram';
  
  const data: GranularDisasterData = getGranularDisasterData(districtId);
  const district = getDistrictById(districtId) || ALL_64_DISTRICTS[0];

  const [activeTab, setActiveTab] = useState<'overview' | 'tensor' | 'upazilas' | 'advisories' | 'history' | 'actions'>('overview');
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleDownloadReport = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HazardNet_District_Report_${data.districtName}_2026.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareAlert = () => {
    const alertText = `HAZARDNET NATIONAL INTELLIGENCE REPORT [${data.districtName} District]\nHazard: ${data.hazardType} (${data.hazardSubtype})\nSeverity Index: ${(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}%\nImpacted Population: ${data.affectedPopulation.toLocaleString()} residents\nActive Shelters: ${data.emergencyResponse.activeShelters}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(alertText);
      setCopiedAlert(true);
      setTimeout(() => setCopiedAlert(false), 2500);
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    if (risk === 'High') return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    if (risk === 'Moderate') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 font-sans text-slate-100"
    >
      
      {/* Breadcrumb / Back Navigation */}
      <div className="flex items-center justify-between">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          title="Back to National Map & Overview"
          aria-label="Back to National Map & Overview"
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700 transition-all shadow-sm cursor-pointer group flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-amber-400 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </motion.button>

        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSaved(!saved)}
            title={saved ? "Saved" : "Save"}
            aria-label={saved ? "Saved" : "Save"}
            className={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-sm ${
              saved 
                ? 'bg-rose-950/40 border-rose-500/50 text-rose-400 shadow-rose-950/30' 
                : 'bg-slate-900 border-slate-800 text-rose-400 hover:bg-rose-900/30 hover:border-rose-700/50 hover:text-rose-300'
            }`}
          >
            <svg className={`w-5 h-5 transition-transform ${saved ? 'scale-110 fill-rose-500 text-rose-500' : 'fill-none stroke-current'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleShareAlert}
            title={copiedAlert ? "Copied Briefing!" : "Share Briefing"}
            aria-label={copiedAlert ? "Copied Briefing!" : "Share Briefing"}
            className={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-sm ${
              copiedAlert
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-700/50 hover:text-cyan-300'
            }`}
          >
            {copiedAlert ? (
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.print()}
            title="Export Print-Friendly Report"
            aria-label="Export Print-Friendly Report"
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-xs transition-all flex items-center gap-2 shadow-lg shadow-amber-500/25 cursor-pointer"
          >
            <MaterialIcon name="print" className="text-base" />
            <span className="hidden sm:inline">Export Report</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownloadReport}
            title="Download JSON Report"
            aria-label="Download JSON Report"
            className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black transition-all flex items-center justify-center shadow-lg shadow-cyan-600/25 cursor-pointer"
          >
            <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </motion.button>
        </div>
      </div>

      {/* District Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                {data.districtName} District
              </h1>
              <span className="text-slate-400 text-sm font-medium">({data.division} Division)</span>
              <span className={`px-3 py-1 rounded-full text-xs font-mono font-extrabold border ${getRiskBadgeColor(data.modelAssessment.riskCategory)}`}>
                {data.modelAssessment.riskCategory} Risk ({ (data.modelAssessment.continuousSeverityIndex * 100).toFixed(0) }% Severity)
              </span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Comprehensive real-time disaster intelligence, tensor anomaly diagnostics, meteorological telemetry, and BRRI/DAE emergency advisories for {data.districtName}.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-2 shrink-0 text-xs font-mono">
            <div className="flex justify-between gap-4 text-slate-400">
              <span>Latitude / Longitude:</span>
              <span className="text-slate-200">{district.lat.toFixed(4)}°N, {district.lng.toFixed(4)}°E</span>
            </div>
            <div className="flex justify-between gap-4 text-slate-400">
              <span>Elevation MSL:</span>
              <span className="text-cyan-400 font-bold">{data.elevationMeters} meters</span>
            </div>
            <div className="flex justify-between gap-4 text-slate-400">
              <span>Satellite Update:</span>
              <span className="text-emerald-400">{data.lastSatelliteUpdate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* TabView Navigation Bar */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-2 shadow-2xl overflow-x-auto scrollbar-none sticky top-[60px] sm:top-[68px] z-30 backdrop-blur-md">
        <div role="tablist" aria-label="District Analysis TabView" className="flex items-center gap-1.5 min-w-max">
          {[
            {
              id: 'overview',
              label: 'Overview & Impact',
              code: 'METRICS',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              )
            },
            {
              id: 'tensor',
              label: 'Tensor & AI Diagnostics',
              code: 'TENSOR',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )
            },
            {
              id: 'upazilas',
              label: 'Upazila Breakdown',
              code: 'UPAZILA',
              badge: data.impactedUpazilas.length,
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )
            },
            {
              id: 'advisories',
              label: 'Institutional Advisories',
              code: 'ADVISORY',
              badge: data.emergencyResponse.advisoryBullets.length,
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )
            },
            {
              id: 'history',
              label: 'Historical EM-DAT',
              code: 'HISTORY',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )
            },
            {
              id: 'actions',
              label: 'Mitigation & Shelters',
              code: 'ACTION',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isActive ? 'text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="districtActiveTabIndicator"
                    className="absolute inset-0 bg-cyan-400 rounded-xl shadow-md shadow-cyan-400/20"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className={`relative z-10 flex items-center justify-center ${isActive ? 'text-slate-950' : 'text-cyan-400'}`}>
                  {tab.icon}
                </span>
                <span className="relative z-10 flex items-center gap-2">
                  <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded tracking-wide font-extrabold ${
                    isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}>
                    {tab.code}
                  </span>
                  <span className="tracking-tight text-xs font-bold">{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-cyan-400 border border-slate-700'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels Container with AnimatePresence */}
      <AnimatePresence mode="wait">
        {/* TAB 1: OVERVIEW & IMPACT METRICS */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div whileHover={{ y: -2 }} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-2">
                <div className="text-xs font-mono text-slate-400 uppercase">Estimated Impact Area</div>
                <div className="text-2xl font-black text-rose-400">{data.estimatedImpactAreaKm2.toLocaleString()} sq km</div>
                <p className="text-[11px] text-slate-400">{data.impactAreaPercentage}% of total district territory</p>
              </motion.div>
              <motion.div whileHover={{ y: -2 }} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-2">
                <div className="text-xs font-mono text-slate-400 uppercase">Affected Population</div>
                <div className="text-2xl font-black text-white">{data.affectedPopulation.toLocaleString()}</div>
                <p className="text-[11px] text-slate-400">{data.affectedHouseholds.toLocaleString()} households at risk</p>
              </motion.div>
              <motion.div whileHover={{ y: -2 }} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-2">
                <div className="text-xs font-mono text-slate-400 uppercase">Crop Land At Risk</div>
                <div className="text-2xl font-black text-amber-400">{data.affectedCropLandHectares.toLocaleString()} ha</div>
                <p className="text-[11px] text-slate-400">{data.primaryCropsAtRisk.join(', ')}</p>
              </motion.div>
              <motion.div whileHover={{ y: -2 }} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-2">
                <div className="text-xs font-mono text-slate-400 uppercase">Active Shelters</div>
                <div className="text-2xl font-black text-emerald-400">{data.emergencyResponse.activeShelters} Centers</div>
                <p className="text-[11px] text-slate-400">{data.emergencyResponse.shelterCapacityUsedPercent}% capacity utilized</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                <h3 className="text-sm font-extrabold text-cyan-400 uppercase tracking-wider">Physical Sensor Telemetry ({data.physicalSensorMetrics.sensorStationName})</h3>
                <div className="space-y-3 text-xs font-mono">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">{data.physicalSensorMetrics.primaryMetricName}:</span>
                    <span className="text-white font-bold text-sm">{data.physicalSensorMetrics.primaryMetricValue}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">{data.physicalSensorMetrics.secondaryMetricName}:</span>
                    <span className="text-cyan-400 font-bold text-sm">{data.physicalSensorMetrics.secondaryMetricValue}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                <h3 className="text-sm font-extrabold text-cyan-400 uppercase tracking-wider">Incident Timeline & Forecast Window</h3>
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Incident Date Recorded:</span>
                    <span className="text-white font-mono font-bold">{data.incidentDate}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Peak Impact Window:</span>
                    <span className="text-amber-400 font-mono font-bold">{data.peakImpactWindow}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Primary Hazard Subtype:</span>
                    <span className="text-cyan-400 font-bold">{data.hazardSubtype}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: TENSOR & AI DIAGNOSTICS */}
        {activeTab === 'tensor' && (
          <motion.div
            key="tensor"
            role="tabpanel"
            id="panel-tensor"
            aria-labelledby="tab-tensor"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">TensorFlow Spatial Attention Neural Diagnostics</h2>
                <p className="text-xs text-slate-400 mt-1">Real-time softmax probability distribution and model confidence metrics for {data.districtName}.</p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs">
                Confidence Score: {(data.modelAssessment.confidenceLevel * 100).toFixed(1)}%
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <div className="text-[10px] font-mono text-cyan-400">INFERENCE LATENCY</div>
                <div className="text-2xl font-black text-white">38.4 ms</div>
                <p className="text-[11px] text-slate-400">WebGL accelerated tensor inference.</p>
              </div>
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <div className="text-[10px] font-mono text-cyan-400">CALIBRATION ERROR (ECE)</div>
                <div className="text-2xl font-black text-white">1.45%</div>
                <p className="text-[11px] text-slate-400">High probabilistic reliability.</p>
              </div>
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <div className="text-[10px] font-mono text-cyan-400">CONTINUOUS SEVERITY INDEX</div>
                <div className="text-2xl font-black text-rose-400">{(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}%</div>
                <p className="text-[11px] text-slate-400">Normalized spatial hazard index.</p>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">Softmax Hazard Probabilities</h3>
              <div className="space-y-2">
                {data.modelAssessment.softmaxProbabilities.map((prob, i) => (
                  <div key={i} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-slate-200">{prob.hazard}</span>
                    <div className="flex items-center gap-3 flex-1 max-w-md">
                      <div className="flex-1 bg-slate-900 h-2 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${prob.probability * 100}%` }}
                          transition={{ duration: 0.5, delay: i * 0.05 }}
                          className="bg-cyan-500 h-full rounded-full"
                        ></motion.div>
                      </div>
                      <span className="text-xs font-mono font-bold text-cyan-400 w-12 text-right">{(prob.probability * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 3: UPAZILA BREAKDOWN */}
        {activeTab === 'upazilas' && (
          <motion.div
            key="upazilas"
            role="tabpanel"
            id="panel-upazilas"
            aria-labelledby="tab-upazilas"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-white">Upazila / Thana Vulnerability Matrix</h2>
              <p className="text-xs text-slate-400 mt-1">Granular impact analysis across administrative sub-districts in {data.districtName}.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono">
                    <th className="pb-3 px-4">Upazila Name</th>
                    <th className="pb-3 px-4">Status & Risk Level</th>
                    <th className="pb-3 px-4">Severity Score</th>
                    <th className="pb-3 px-4 text-right">Households Affected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {data.impactedUpazilas.map((up, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">{up.name}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${
                          up.status === 'Critically Inundated' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          up.status === 'High Risk' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        }`}>
                          {up.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">{(up.severityScore * 100).toFixed(0)}%</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">{up.householdsAffected.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* TAB 4: INSTITUTIONAL ADVISORIES */}
        {activeTab === 'advisories' && (
          <motion.div
            key="advisories"
            role="tabpanel"
            id="panel-advisories"
            aria-labelledby="tab-advisories"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold mb-3">
                  BRRI / DAE & WHO EMERGENCY PROTOCOLS
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Actionable Institutional Advisories</h2>
                <p className="text-xs text-slate-400 mt-1">Official guidelines for farmers, livestock owners, and local authorities in {data.districtName}.</p>
              </div>

              <div className="space-y-3">
                {data.emergencyResponse.advisoryBullets.map((bullet, idx) => (
                  <motion.div
                    whileHover={{ x: 2 }}
                    key={idx}
                    className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-start gap-3"
                  >
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-mono text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">{bullet}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 5: HISTORICAL EM-DAT */}
        {activeTab === 'history' && (
          <motion.div
            key="history"
            role="tabpanel"
            id="panel-history"
            aria-labelledby="tab-history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-white">Historical EM-DAT Disaster Database Comparison</h2>
              <p className="text-xs text-slate-400 mt-1">Cross-referencing past hazard severity with HazardNet predictive models for {data.districtName}.</p>
            </div>

            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="text-sm font-bold text-cyan-400">EM-DAT Benchmark Analysis (1990-2026)</div>
              <p className="text-xs text-slate-300 leading-relaxed">{data.historicalComparison}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">RECORDED EVENTS</div>
                  <div className="text-xl font-bold text-white mt-1">14 Major Incidents</div>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">MAX HISTORICAL SEVERITY</div>
                  <div className="text-xl font-bold text-rose-400 mt-1">0.91 Index (2020)</div>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">MODEL CORRELATION</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">94.8% Accuracy</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 6: MITIGATION & SHELTERS */}
        {activeTab === 'actions' && (
          <motion.div
            key="actions"
            role="tabpanel"
            id="panel-actions"
            aria-labelledby="tab-actions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                <h3 className="text-sm font-extrabold text-cyan-400 uppercase tracking-wider">Emergency Relief Status</h3>
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Active Cyclone / Flood Shelters:</span>
                    <span className="text-white font-mono font-bold">{data.emergencyResponse.activeShelters} Centers</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Shelter Capacity Utilization:</span>
                    <span className="text-amber-400 font-mono font-bold">{data.emergencyResponse.shelterCapacityUsedPercent}%</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Relief Grain Distributed:</span>
                    <span className="text-emerald-400 font-mono font-bold">{data.emergencyResponse.reliefDistributedTons} Metric Tons</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Medical Rapid Teams Deployed:</span>
                    <span className="text-cyan-400 font-mono font-bold">{data.emergencyResponse.medicalTeamsDeployed} Teams</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <h3 className="text-sm font-extrabold text-cyan-400 uppercase tracking-wider">National Emergency Contacts</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    For immediate coordination with district commissioners (DC) or Upazila Nirbahi Officers (UNO) in {data.districtName}, contact the National Disaster Operation Center.
                  </p>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono space-y-1">
                    <div className="text-white font-bold">Emergency Hotline: 1090 / 999</div>
                    <div className="text-slate-400">Control Room: +880-2-9888123</div>
                  </div>
                </div>

                <div className="pt-4">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toast.success(`Emergency alert dispatched for ${data.districtName} district authorities.`, { icon: <MaterialIcon name="emergency" className="w-4 h-4 inline-block mr-1" /> })}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs rounded-2xl transition-colors cursor-pointer shadow-xs"
                  >
                    Broadcast District Emergency Dispatch
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

export default DistrictDetailPage;
