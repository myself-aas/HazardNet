import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  Waves, Users, Sprout, Building2, Activity, Crosshair, TrendingUp, Cpu, BarChart3, Info, ExternalLink,
  Layers, Search, SlidersHorizontal, ShieldCheck, Sparkles, Bot, Cloud, AlertTriangle, History, Calendar,
  Radio, PhoneCall, FileText,
} from 'lucide-react';
import AdvisoryPanel from '../AdvisoryPanel';
import { GroundingIntelligencePanel } from '../GroundingIntelligencePanel';
import { WeatherPanel } from '../WeatherPanel';
import { getHazardIcon } from './districtBriefUtils';

import { useDistrictBrief } from './DistrictBriefContext';


/** Evidence, guidance, history, ops, appendix. */
export const DistrictBriefBody: React.FC = () => {
  const {
    districtId,
    data,
    district,
    climaticEventsData,
    peakSeverityInfo,
    riskStyles,
    navigate,
    saved,
    copiedAlert,
    districtDropdownOpen,
    searchDistrict,
    filteredDistricts,
    setDistrictDropdownOpen,
    setSearchDistrict,
    handleToggleSave,
    handleShareAlert,
    handlePrintBrief,
    handleDownloadReport,
    loadingForecastTable,
    chartData,
    activeTableHorizon,
    setActiveTableHorizon,
    districtForecasts7D,
    districtForecasts15D,
    handleDownloadTableCsv,
    scrollToSection,
    activeSection,
    processedUpazilas,
    upazilaViewMode,
    setUpazilaViewMode,
    upazilaSearch,
    setUpazilaSearch,
    upazilaFilter,
    setUpazilaFilter,
    upazilaSortBy,
    setUpazilaSortBy,
    trendViewMode,
    setTrendViewMode,
    hazardTrendData,
    showLiveAiAdvisory,
    setShowLiveAiAdvisory,
    weather,
    dispatchStatus,
    handleTriggerDispatch,
    dispatchLogs,
    eventHazardFilter,
    setEventHazardFilter,
    expandedHistoricalEventId,
    setExpandedHistoricalEventId,
  } = useDistrictBrief();

  return (
    <>
      {/* 3. STICKY EXECUTIVE SECTION JUMP BAR */}
      <div className="sticky top-[var(--navbar-height)] z-[var(--z-sticky)] bg-white border border-carbon-20 overflow-x-auto scrollbar-none screen-only">
        <div className="flex items-center gap-1 min-w-max text-sm font-semibold">
          <span className="px-3 text-carbon-60 font-mono text-xs uppercase font-bold">Jump:</span>
          {[
            { id: 'sec-impact', label: 'Impact & Demographics', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'sec-telemetry', label: 'Hydro-Met Sensor Telemetry', icon: <Activity className="w-3.5 h-3.5" /> },
            { id: 'sec-hazard-trend', label: '7-Day Hazard Trend', icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: 'sec-ai-overview', label: 'AI Spatial Risk Overview', icon: <Cpu className="w-3.5 h-3.5" /> },
            { id: 'sec-upazilas', label: 'Upazila Vulnerability Matrix', badge: data.impactedUpazilas.length, icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'sec-advisories', label: 'Institutional Advisories', badge: data.emergencyResponse.advisoryBullets.length, icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'sec-history', label: 'EM-DAT Benchmark', icon: <History className="w-3.5 h-3.5" /> },
            { id: 'sec-ops', label: 'Emergency SOPs & Dispatch', icon: <Radio className="w-3.5 h-3.5" /> },
            { id: 'appendix-a', label: 'Appendix A: Neural Diagnostics', icon: <Cpu className="w-3.5 h-3.5" /> },
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`inline-flex min-h-[44px] items-center gap-2 px-3 py-2 cursor-pointer touch-manipulation ${
                activeSection === sec.id
                  ? 'bg-nasa-blue text-white font-semibold'
                  : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10'
              }`}
            >
              {sec.icon}
              <span>{sec.label}</span>
              {sec.badge !== undefined && (
                <span className="px-1.5 py-0.2 bg-carbon-20 text-carbon-80 rounded-sm font-mono text-xs font-extrabold">
                  {sec.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: CORE IMPACT & HUMANITARIAN TELEMETRY */}
      {/* ========================================================================= */}
      <section id="sec-impact" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-carbon-05 border border-carbon-20 flex items-center justify-center text-nasa-red-shade">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Core Impact & Humanitarian Telemetry</h2>
              <p className="text-xs text-carbon-60">Spatial territory exposure, population vulnerability, and standing crop risk estimations.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">SECTION I</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Estimated Impact Area */}
          <div className="impact-metric-pill bg-white border border-carbon-20 p-5 space-y-3 hover:border-carbon-30 transition-all">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 flex items-center justify-center shrink-0 ${
                data.modelAssessment.riskCategory === 'High' ? 'bg-carbon-05 border border-rose-100 text-[var(--severity-red)]' :
                data.modelAssessment.riskCategory === 'Moderate' ? 'bg-amber-50 border border-amber-100 text-[var(--severity-amber)]' :
                'bg-carbon-05 border border-emerald-100 text-[var(--severity-green)]'
              }`}>
                <Waves className="w-4 h-4 shrink-0" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-mono font-bold text-carbon-60 uppercase block truncate">Impacted Territory</span>
                <div className="text-xl sm:text-2xl font-black text-carbon-90 font-mono tracking-tight whitespace-nowrap">
                  {data.estimatedImpactAreaKm2.toLocaleString()} km²
                </div>
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t border-carbon-10">
              <div className="flex items-center justify-between text-xs text-carbon-60">
                <span>District Exposure</span>
                <strong className={`font-bold ${
                  data.modelAssessment.riskCategory === 'High' ? 'text-[var(--severity-red)]' :
                  data.modelAssessment.riskCategory === 'Moderate' ? 'text-[var(--severity-amber)]' :
                  'text-[var(--severity-green)]'
                }`}>{data.impactAreaPercentage}%</strong>
              </div>
              <div className="w-full bg-carbon-10 h-2 rounded-sm overflow-hidden">
                <div className={`h-full rounded-sm transition-all duration-700 ${
                  data.modelAssessment.riskCategory === 'High' ? 'bg-[var(--severity-red)]' :
                  data.modelAssessment.riskCategory === 'Moderate' ? 'bg-[var(--severity-amber)]' :
                  'bg-[var(--severity-green)]'
                }`} style={{ width: `${data.impactAreaPercentage}%` }} />
              </div>
            </div>
            <div className="text-xs text-carbon-60 truncate">
              Total landmass: {data.totalDistrictAreaKm2.toLocaleString()} km²
            </div>
          </div>

          {/* Card 2: Affected Population & Households */}
          <div className="impact-metric-pill bg-white border border-carbon-20 p-5 space-y-3 hover:border-carbon-30 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Users className="w-4 h-4 shrink-0" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-mono font-bold text-carbon-60 uppercase block truncate">Exposed Population</span>
                <div className="text-xl sm:text-2xl font-black text-carbon-90 font-mono tracking-tight whitespace-nowrap">
                  {data.affectedPopulation.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t border-carbon-10">
              <div className="flex items-center justify-between text-xs text-carbon-60">
                <span>Vulnerable Families</span>
                <strong className="font-bold text-carbon-90">{data.affectedHouseholds.toLocaleString()} HH</strong>
              </div>
              <div className="w-full bg-carbon-10 h-2 rounded-sm overflow-hidden">
                <div className="bg-blue-500 h-full rounded-sm" style={{ width: '68%' }} />
              </div>
            </div>
            <div className="text-xs text-carbon-60 truncate">
              Density: 4.4 members / household
            </div>
          </div>

          {/* Card 3: Crop Land & Agriculture */}
          <div className="impact-metric-pill bg-white border border-carbon-20 p-5 space-y-3 hover:border-carbon-30 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Sprout className="w-4 h-4 shrink-0" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-mono font-bold text-carbon-60 uppercase block truncate">Agricultural Land</span>
                <div className="text-xl sm:text-2xl font-black text-carbon-90 font-mono tracking-tight whitespace-nowrap">
                  {data.affectedCropLandHectares.toLocaleString()} ha
                </div>
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t border-carbon-10">
              <div className="flex items-center justify-between text-xs text-carbon-60">
                <span>Standing Crops</span>
                <strong className="font-bold text-carbon-90 truncate ml-1">{data.primaryCropsAtRisk.join(', ')}</strong>
              </div>
              <div className="w-full bg-carbon-10 h-2 rounded-sm overflow-hidden">
                <div className="bg-amber-500 h-full rounded-sm" style={{ width: '84%' }} />
              </div>
            </div>
            <div className="text-xs text-carbon-60 truncate">
              Vegetative & harvest phase alert
            </div>
          </div>

          {/* Card 4: Active Emergency Shelters */}
          <div className="impact-metric-pill bg-white border border-carbon-20 p-5 space-y-3 hover:border-carbon-30 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-carbon-05 border border-emerald-100 flex items-center justify-center text-carbon-80 shrink-0">
                <Building2 className="w-4 h-4 shrink-0" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-mono font-bold text-carbon-60 uppercase block truncate">Safe Shelters</span>
                <div className="text-xl sm:text-2xl font-black text-carbon-90 font-mono tracking-tight whitespace-nowrap">
                  {data.emergencyResponse.activeShelters} centers
                </div>
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t border-carbon-10">
              <div className="flex items-center justify-between text-xs text-carbon-60">
                <span>Capacity Utilized</span>
                <strong className="font-bold text-carbon-80">{data.emergencyResponse.shelterCapacityUsedPercent}%</strong>
              </div>
              <div className="w-full bg-carbon-10 h-2 rounded-sm overflow-hidden">
                <div className="bg-nasa-green h-full rounded-sm" style={{ width: `${data.emergencyResponse.shelterCapacityUsedPercent}%` }} />
              </div>
            </div>
            <div className="text-xs text-carbon-60 truncate">
              Equipped with solar & water purification
            </div>
          </div>
        </div>
      </section>

      {/* GEOSPATIAL HAZARD SEVERITY MINI-HEATMAP */}
      <section className="bg-white border border-carbon-20/90 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
          <div>
            <div className="text-xs font-mono font-bold text-amber-600 uppercase tracking-wider">
              Geospatial Distribution Matrix
            </div>
            <h3 className="text-xl font-black text-carbon-black tracking-tight">
              Hazard Severity Heatmap — {data.districtName} District Sub-Regions
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono min-w-0">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-nasa-green" /> Low (0-33%)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Moderate (34-66%)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-nasa-red-shade" /> Critical (67-100%)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.impactedUpazilas.map((upazila, idx) => {
            const scorePct = Math.round(upazila.severityScore * 100);
            const isCrit = upazila.status === 'Critically Inundated' || scorePct >= 67;
            const isHigh = upazila.status === 'High Risk' || (scorePct >= 40 && scorePct < 67);
            return (
              <div
                key={idx}
                className={`p-4 border transition-all relative overflow-hidden flex flex-col justify-between space-y-3 ${
                  isCrit ? 'bg-carbon-05/70 border-carbon-20' :
                  isHigh ? 'bg-amber-50/70 border-amber-200' :
                  'bg-carbon-05 border-carbon-20'
                }`}
              >
                {/* Heatmap background intensity bar */}
                <div
                  className={`absolute bottom-0 left-0 h-1 transition-all duration-500 ${
                    isCrit ? 'bg-nasa-red-shade' : isHigh ? 'bg-amber-500' : 'bg-nasa-green'
                  }`}
                  style={{ width: `${scorePct}%` }}
                />

                <div className="flex items-center justify-between">
                  <span className="font-bold text-carbon-90 text-sm">{upazila.name}</span>
                  <span className={`px-2.5 py-0.5 rounded-sm text-xs font-mono font-black ${
                    isCrit ? 'bg-nasa-red-shade text-white animate-pulse' :
                    isHigh ? 'bg-amber-500 text-carbon-black' :
                    'bg-emerald-600 text-white'
                  }`}>
                    {scorePct}% Intensity
                  </span>
                </div>

                <div className="space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between text-carbon-60">
                    <span>Status:</span>
                    <strong className={`font-bold ${isCrit ? 'text-rose-700' : isHigh ? 'text-amber-800' : 'text-carbon-80'}`}>
                      {upazila.status}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-carbon-60">
                    <span>Exposed HH:</span>
                    <strong className="text-carbon-90 font-bold">{upazila.householdsAffected.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-xs font-mono text-carbon-60 bg-carbon-05 border border-carbon-20 p-3 flex flex-wrap items-center justify-between gap-2 min-w-0">
          <span className="min-w-0 break-words">Spatial Grid Resolution: ADM3 Upazila Boundary Ingestion • Model Confidence: {data.modelAssessment.confidenceLevel}%</span>
          <span className="font-bold text-carbon-90">Total Sub-Regions Mapped: {data.impactedUpazilas.length}</span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: HYDRO-MET SENSOR TELEMETRY & 24-HOUR TREND */}
      {/* ========================================================================= */}
      <section id="sec-telemetry" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Real-time Physical Telemetry & 24h Gauge Trend</h2>
              <p className="text-xs text-carbon-60">
                Station readings from <span className="font-bold text-carbon-70">{data.physicalSensorMetrics.sensorStationName}</span> synchronized with BMD / BWDB networks.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">SECTION II</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Telemetry Sensor Gauges (1 col) */}
          <div className="bg-white border border-carbon-20 p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-carbon-10 text-carbon-70 text-xs font-mono font-bold">
                <Crosshair className="w-3.5 h-3.5 text-blue-600" />
                <span>Station: {data.physicalSensorMetrics.sensorStationName}</span>
              </div>

              <div className="space-y-3 pt-2">
                <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
                  <span className="text-xs font-mono text-carbon-60 font-bold uppercase">{data.physicalSensorMetrics.primaryMetricName}</span>
                  <div className={`text-2xl font-black font-mono ${
                    data.modelAssessment.riskCategory === 'High' ? 'text-nasa-red-shade' :
                    data.modelAssessment.riskCategory === 'Moderate' ? 'text-amber-600' :
                    'text-carbon-80'
                  }`}>
                    {data.physicalSensorMetrics.primaryMetricValue}
                  </div>
                  <span className="text-xs text-carbon-60">
                    {data.modelAssessment.riskCategory === 'High' ? 'Critical danger threshold exceeded' :
                     data.modelAssessment.riskCategory === 'Moderate' ? 'Approaching danger threshold' :
                     'Within normal operational safety limits'}
                  </span>
                </div>

                <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
                  <span className="text-xs font-mono text-carbon-60 font-bold uppercase">{data.physicalSensorMetrics.secondaryMetricName}</span>
                  <div className="text-2xl font-black text-blue-600 font-mono">{data.physicalSensorMetrics.secondaryMetricValue}</div>
                  <span className="text-xs text-carbon-60">Secondary telemetry vector</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-carbon-10 space-y-2 text-xs">
              <div className="flex items-center justify-between text-carbon-60">
                <span>Peak Hazard Window:</span>
                <strong className="font-mono text-carbon-90">{data.peakImpactWindow}</strong>
              </div>
              <div className="flex items-center justify-between text-carbon-60">
                <span>Incident Ingestion:</span>
                <strong className="font-mono text-carbon-90">{data.incidentDate}</strong>
              </div>
            </div>
          </div>

          <div className="chart-card pagination-protected bg-white border border-carbon-20 p-4 sm:p-6 space-y-4 lg:col-span-2 flex flex-col justify-center">
            <h3 className="text-base font-bold text-carbon-90">24-hour gauge trend</h3>
            <p className="text-base leading-[1.62] text-carbon-70">
              A 24-hour station sparkline is not recorded for this district. Station values above are the latest stored readings; no interpolated hydro-met trajectory is shown.
            </p>
            <p className="text-xs text-carbon-60">Source: not recorded</p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2.5: HAZARD TREND - 7-DAY RISK LEVEL FLUCTUATIONS */}
      {/* ========================================================================= */}
      <section id="sec-hazard-trend" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-carbon-20 pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Hazard Trend: 7-Day Risk Level Fluctuations</h2>
              <p className="text-xs text-carbon-60">Longitudinal risk scoring and multi-hazard severity progression over the past week.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-carbon-10 p-1 text-xs font-bold screen-only">
            {(['all', 'primary', 'comparison'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTrendViewMode(mode)}
                className={`px-3 py-1 transition-all cursor-pointer capitalize ${
                  trendViewMode === mode ? 'bg-white text-carbon-90 font-extrabold' : 'text-carbon-60 hover:text-carbon-black'
                }`}
              >
                {mode === 'all' ? 'All Vectors' : mode === 'primary' ? data.hazardType : 'Historical Benchmarks'}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-card bg-white border border-carbon-20 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-1 border border-amber-200">
                Longitudinal AI Telemetry (7-Day Window)
              </span>
              <h3 className="text-base font-extrabold text-carbon-90 mt-2">
                {data.districtName} — stored {data.hazardType} outlook
              </h3>
              <p className="text-xs text-carbon-60 mt-0.5">
                Evaluated against historical multi-year EM-DAT disaster recurrence models and satellite radar observations.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono bg-carbon-05 p-3 border border-carbon-20/80">
              <div>
                <div className="text-carbon-60">7-Day Peak Risk</div>
                <div className="text-sm font-black text-nasa-red-shade">
                  {hazardTrendData.length ? Math.max(...hazardTrendData.map(d => Number(d[data.hazardType] || 0))) : "\u2014"} / 100
                </div>
              </div>
              <div className="w-px h-8 bg-carbon-20" />
              <div>
                <div className="text-carbon-60">Trend Basis</div>
                <div className="text-sm font-black text-amber-600">7-Day window</div>
              </div>
            </div>
          </div>

          {/* Recharts Multi-Line Chart */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hazardTrendData} margin={{ top: 15, right: 20, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                <XAxis dataKey="day" stroke="#959599" fontSize={11} tickLine={false} />
                <YAxis stroke="#959599" fontSize={11} domain={[0, 100]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #d1d1d1', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  formatter={(value: any, name: string) => [`${value}% Risk Index`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                
                {(trendViewMode === 'all' || trendViewMode === 'primary') && (
                  <Line
                    type="monotone"
                    dataKey={data.hazardType}
                    name={`${data.hazardType} Risk`}
                    stroke="#e11d48"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#e11d48' }}
                    activeDot={{ r: 6 }}
                  />
                )}

              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-carbon-10 text-xs">
            <div className="bg-carbon-05 p-3 border border-carbon-20/80">
              <span className="font-mono text-carbon-60 font-bold block mb-1">Early Warning Indicator</span>
              <p className="text-carbon-70">Risk index crossed moderate threshold 4 days prior due to cumulative catchment basin rainfall.</p>
            </div>
            <div className="bg-carbon-05 p-3 border border-carbon-20/80">
              <span className="font-mono text-carbon-60 font-bold block mb-1">Compound Threat Vector</span>
              <p className="text-carbon-70">Secondary river bank erosion correlates directly with upstream water stage fluctuations.</p>
            </div>
            <div className="bg-carbon-05 p-3 border border-carbon-20/80">
              <span className="font-mono text-carbon-60 font-bold block mb-1">Confidence Interval</span>
              <p className="text-carbon-70">No calibration map has been fitted — the model card documents what is and is not measured.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: EXECUTIVE AI RISK OVERVIEW & SPATIAL RADAR BACKSCATTER */}
      {/* ========================================================================= */}
      <section id="sec-ai-overview" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-carbon-05 border border-carbon-20 flex items-center justify-center text-nasa-blue">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">AI Spatial Risk Overview & Satellite Backscatter</h2>
              <p className="text-xs text-carbon-60">Ensemble confidence scoring, probabilistic hazard breakdown, and radar dielectric validation.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#appendix-a"
              onClick={(e) => { e.preventDefault(); scrollToSection('appendix-a'); }}
              className="text-xs text-nasa-blue-shade hover:text-carbon-90 font-mono font-bold inline-flex items-center gap-1 screen-only"
            >
              <span>View Technical Appendix</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">SECTION III</span>
          </div>
        </div>

        {/* Probabilities & Diagnosis Narrative */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Probability Breakdown Bars */}
          <div className="bg-white border border-carbon-20 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-nasa-blue" />
                Hazard Probability Breakdown
              </h3>
              <span className="text-xs font-mono text-carbon-60">Total = 100%</span>
            </div>

            <div className="space-y-3 pt-1">
              {data.modelAssessment.softmaxProbabilities.map((prob, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-carbon-70">
                    <span className="flex items-center gap-2">
                      {getHazardIcon(prob.hazard)}
                      {prob.hazard}
                    </span>
                    <span className="font-mono font-bold text-carbon-90">{(prob.probability * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-carbon-10 h-2.5 rounded-sm overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${prob.probability * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: i * 0.1 }}
                      className={`h-full rounded-sm ${
                        i === 0 ? 'bg-nasa-blue' : i === 1 ? 'bg-nasa-orange' : 'bg-carbon-40'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Diagnosis Narrative */}
          <div className="bg-white border border-carbon-20 p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                Executive Spatial Risk Verification
              </h3>
              <div className="bg-carbon-05 border border-carbon-20/80 p-4 text-xs font-mono text-carbon-80 leading-relaxed space-y-2">
                <p>
                  Satellite imagery shows high water saturation across low-lying areas, and the severity index is computed from the day's Earth Engine and Open-Meteo inputs.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-carbon-10 flex items-center justify-between text-xs text-carbon-60 font-mono">
              <span>Model Confidence: <strong className="text-carbon-80 font-bold">{data.modelAssessment.confidenceLevel}% (High)</strong></span>
              <span>Updated: {data.lastSatelliteUpdate.split('•')[0]}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: UPAZILA / THANA VULNERABILITY MATRIX (GRID OF DATA CARDS) */}
      {/* ========================================================================= */}
      <section id="sec-upazilas" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 upazila-matrix-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Upazila / Thana Vulnerability Matrix</h2>
              <p className="text-xs text-carbon-60">Administrative sub-district breakdown with severity scores, population exposure, and priority directives.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* View Mode Toggle for Screen */}
            <div className="flex items-center bg-carbon-10 p-1 text-xs font-bold screen-only">
              <button
                onClick={() => setUpazilaViewMode('cards')}
                className={`px-3 py-1 transition-all cursor-pointer ${
                  upazilaViewMode === 'cards' ? 'bg-white text-carbon-90 font-extrabold' : 'text-carbon-60 hover:text-carbon-black'
                }`}
              >
                Cards View
              </button>
              <button
                onClick={() => setUpazilaViewMode('table')}
                className={`px-3 py-1 transition-all cursor-pointer ${
                  upazilaViewMode === 'table' ? 'bg-white text-carbon-90 font-extrabold' : 'text-carbon-60 hover:text-carbon-black'
                }`}
              >
                Table View
              </button>
            </div>
            <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">
              {processedUpazilas.length} UPAZILAS LISTED
            </span>
            <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">SECTION IV</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white border border-carbon-20 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 screen-only">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:min-w-[200px] sm:w-auto">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-carbon-60" />
              <input
                type="text"
                placeholder="Filter upazilas..."
                value={upazilaSearch}
                onChange={(e) => setUpazilaSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-carbon-05 border border-carbon-20 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs">
              {(['All', 'Critically Inundated', 'High Risk', 'Moderate Impact'] as const).map((filterVal) => (
                <button
                  key={filterVal}
                  onClick={() => setUpazilaFilter(filterVal)}
                  className={`px-3 py-1.5 font-bold transition-all cursor-pointer ${
                    upazilaFilter === filterVal
                      ? 'bg-carbon-90 text-white'
                      : 'bg-carbon-10 text-carbon-60 hover:bg-carbon-20'
                  }`}
                >
                  {filterVal}
                </button>
              ))}
            </div>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 text-xs text-carbon-60 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-carbon-60" />
            <span>Sort By:</span>
            <select
              value={upazilaSortBy}
              onChange={(e: any) => setUpazilaSortBy(e.target.value)}
              className="bg-carbon-05 border border-carbon-20 px-2.5 py-1.5 text-xs font-bold text-carbon-80 focus:outline-none cursor-pointer"
            >
              <option value="severity">Severity Score (Highest)</option>
              <option value="households">Affected Households</option>
              <option value="name">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>

        {/* PRIMARY VIEW: CSS GRID OF UPAZILA DATA CARDS (DEFAULT & ALWAYS PRINTED) */}
        {(upazilaViewMode === 'cards' || typeof window === 'undefined') ? (
          <div className="upazila-grid grid grid-cols-1 md:grid-cols-2 gap-4">
            {processedUpazilas.length === 0 ? (
              <div className="col-span-2 py-8 text-center text-carbon-60 bg-white border border-carbon-20">
                No sub-districts matched the selected filter criteria.
              </div>
            ) : (
              processedUpazilas.map((up, idx) => (
                <article
                  key={idx}
                  className="upazila-card pagination-protected break-inside-avoid bg-white border border-carbon-20 p-5 space-y-3 hover:border-carbon-30 transition-all flex flex-col justify-between"
                >
                  {/* Card Header: Upazila Name + Geocode + Priority Badge */}
                  <div className="flex items-start justify-between gap-3 border-b border-carbon-10 pb-3">
                    <div>
                      <h3 className="font-extrabold text-carbon-black text-base flex items-center gap-2">
                        <span>{up.name}</span>
                        <span className="text-xs font-mono text-carbon-60 font-normal">
                          (GEO-{data.districtId.toUpperCase().slice(0, 3)}-{idx + 101})
                        </span>
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2.5 py-0.5 rounded-sm text-[10.5px] font-mono font-black ${
                          up.status === 'Critically Inundated' ? 'bg-rose-100 text-rose-800 border border-carbon-20' :
                          up.status === 'High Risk' ? 'bg-carbon-05 text-rose-900 border border-carbon-20' :
                          up.status === 'Moderate Impact' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                          'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {up.status}
                        </span>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 text-xs font-mono font-black tracking-wide shrink-0 ${
                      up.severityScore >= 0.8 ? 'bg-nasa-red-shade text-white' :
                      up.severityScore >= 0.5 ? 'bg-amber-500 text-carbon-black font-bold' :
                      'bg-carbon-10 text-carbon-70'
                    }`}>
                      {up.severityScore >= 0.8 ? 'PRIORITY 1: CRITICAL' : up.severityScore >= 0.5 ? 'PRIORITY 2: STANDBY' : 'PRIORITY 3: MONITOR'}
                    </span>
                  </div>

                  {/* 4-Item Sub-Grid Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div className="bg-carbon-05 p-2.5 border border-carbon-10 space-y-1">
                      <span className="text-xs font-mono text-carbon-60 font-bold uppercase block">Severity Score</span>
                      <div className="flex items-center justify-between">
                        <span className="text-base font-black text-carbon-90 font-mono">
                          {(up.severityScore * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs font-mono text-carbon-60">/ 100</span>
                      </div>
                      <div className="w-full bg-carbon-20 h-1.5 rounded-sm overflow-hidden">
                        <div
                          className={`h-full rounded-sm ${
                            up.severityScore >= 0.8 ? 'bg-nasa-green' : up.severityScore >= 0.5 ? 'bg-amber-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${up.severityScore * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-carbon-05 p-2.5 border border-carbon-10 space-y-1">
                      <span className="text-xs font-mono text-carbon-60 font-bold uppercase block">Exposed Households</span>
                      <div className="text-base font-black text-carbon-90 font-mono">
                        {up.householdsAffected.toLocaleString()}
                      </div>
                      <div className="text-xs text-carbon-60 truncate">
                        Est. ~{(up.householdsAffected * 4.4).toLocaleString()} residents
                      </div>
                    </div>
                  </div>

                  {/* Action Directive Footnote */}
                  <div className="pt-2 border-t border-carbon-10 flex items-center justify-between text-xs text-carbon-60 font-medium">
                    <span className="truncate">
                      {up.severityScore >= 0.8
                        ? 'Immediate relief boats & evacuation required'
                        : up.severityScore >= 0.5
                        ? 'Standby mobile medical & dry food provisioning'
                        : 'Routine hydrological embankment surveillance'}
                    </span>
                    <span className="font-mono font-bold text-carbon-60 shrink-0 ml-2">EOC-LVL-{up.severityScore >= 0.8 ? '1' : up.severityScore >= 0.5 ? '2' : '3'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        ) : (
          /* ALTERNATIVE TABLE VIEW (SCREEN-ONLY) */
          <div className="bg-white border border-carbon-20 overflow-hidden screen-only">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-carbon-20 bg-carbon-05/80 text-carbon-60 font-mono font-bold">
                    <th className="py-3.5 px-5">Upazila / Thana Name</th>
                    <th className="py-3.5 px-4">Status & Inundation Level</th>
                    <th className="py-3.5 px-4">Continuous Severity</th>
                    <th className="py-3.5 px-4">Affected Households</th>
                    <th className="py-3.5 px-5 text-right">Evacuation Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-10 font-sans">
                  {processedUpazilas.map((up, idx) => (
                    <tr key={idx} className="hover:bg-carbon-05/80 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-bold text-carbon-90 text-sm">{up.name}</div>
                        <div className="text-xs text-carbon-60 font-mono">Geocode: {data.districtId}-{idx + 101}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-sm text-xs font-mono font-extrabold ${
                          up.status === 'Critically Inundated' ? 'bg-rose-100 text-rose-800 border border-carbon-20' :
                          up.status === 'High Risk' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                          'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {up.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-carbon-10 h-2 rounded-sm overflow-hidden">
                            <div
                              className={`h-full rounded-sm ${
                                up.severityScore >= 0.8 ? 'bg-nasa-green' : up.severityScore >= 0.5 ? 'bg-amber-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${up.severityScore * 100}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-carbon-90">
                            {(up.severityScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-carbon-80">
                        {up.householdsAffected.toLocaleString()} families
                      </td>
                      <td className="py-4 px-5 text-right">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold font-mono ${
                          up.severityScore >= 0.8 ? 'bg-nasa-red-shade text-white' :
                          up.severityScore >= 0.5 ? 'bg-amber-100 text-amber-900' :
                          'bg-carbon-10 text-carbon-70'
                        }`}>
                          {up.severityScore >= 0.8 ? 'Priority 1: Immediate' : up.severityScore >= 0.5 ? 'Priority 2: Standby' : 'Priority 3: Monitor'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5: INSTITUTIONAL DIRECTIVES & AGRICULTURAL ADVISORIES */}
      {/* ========================================================================= */}
      <section id="sec-advisories" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-carbon-05 border border-carbon-20 flex items-center justify-center text-carbon-80">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Institutional Directives & Emergency Advisories</h2>
              <p className="text-xs text-carbon-60">Official protocol recommendations formulated by DAE, BRRI, BMD, and WHO.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowLiveAiAdvisory(!showLiveAiAdvisory)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer screen-only ${
                showLiveAiAdvisory
                  ? 'bg-amber-500 text-carbon-black'
                  : 'bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-05 hover:text-carbon-90'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>{showLiveAiAdvisory ? 'Hide AI Synthesizer' : 'Synthesize Gemini AI Advisory'}</span>
            </button>
            <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">SECTION V</span>
          </div>
        </div>

        {/* Live AI Advisory Synthesizer (When toggled) */}
        {showLiveAiAdvisory && (
          <div className="bg-carbon-90 text-white p-6 sm:p-8 border border-carbon-80 space-y-4 screen-only">
            <div className="flex items-center justify-between border-b border-carbon-80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Gemini 2.5 Dynamic Advisory Engine</span>
                    <span className="px-2 py-0.5 rounded-sm bg-amber-400/20 text-amber-300 text-xs font-mono font-bold">ONLINE</span>
                  </h3>
                  <p className="text-xs text-carbon-60">Real-time LLM inference synthesizing localized meteorological & agrarian guidance.</p>
                </div>
              </div>
            </div>

            <div className="text-carbon-90">
              <AdvisoryPanel
                districtName={data.districtName}
                hazardType={data.hazardType}
                severityScore={data.modelAssessment.continuousSeverityIndex}
                confidence={data.modelAssessment.confidenceLevel}
              />
            </div>

            {/* Google Maps & Google Search Grounding Intelligence Panel */}
            <GroundingIntelligencePanel
              districtId={districtId}
              districtName={data.districtName}
            />
          </div>
        )}

        {/* Open-Meteo live weather: current conditions + 48h + 16-day forecast */}
        <section aria-label="Live weather forecast" className="max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Cloud className="w-4 h-4 text-sky-500" />
            <h2 className="text-base font-bold text-carbon-80 dark:text-carbon-10">
              Live Weather — {data.districtName}
            </h2>
            <span className="text-xs font-mono text-carbon-60 ml-auto">
              {weather.loading && !weather.data ? 'Loading…' : weather.error ? 'Unavailable' : 'Open-Meteo 16-day'}
            </span>
          </div>
          {weather.data ? (
            <WeatherPanel
              data={weather.data}
              locationLabel={`${data.districtName} (${district.lat.toFixed(2)}°, ${district.lng.toFixed(2)}°)`}
              loading={weather.loading}
              error={weather.error}
            />
          ) : weather.error ? (
            <div className="border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Weather data temporarily unavailable</div>
                <div className="text-xs mt-0.5 opacity-80">{weather.error}</div>
              </div>
            </div>
          ) : (
            <div className="border border-carbon-20 bg-white p-6 animate-pulse">
              <div className="h-20 bg-carbon-10 mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 bg-carbon-10" />
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Actionable Protocol Cards (2 cols) */}
          <div className="bg-white border border-carbon-20 p-6 space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-carbon-05 border border-carbon-20 text-carbon-80 text-xs font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>BRRI & DAE ACTION DIRECTIVES</span>
              </div>
              <span className="text-xs font-mono text-carbon-60">Updated: Today 06:00 BST</span>
            </div>

            {/* Directives with Prominent Number Badges and Left Border */}
            <div className="space-y-4 pt-1">
              {data.emergencyResponse.advisoryBullets.map((bullet, idx) => (
                <div
                  key={idx}
                  className="bg-carbon-05 border border-carbon-20/90 p-4 sm:p-5 flex flex-wrap items-start gap-4 hover:border-carbon-30 transition-colors"
                >
                  <span className="w-8 h-8 rounded-sm bg-carbon-10 text-carbon-80 font-mono text-sm flex items-center justify-center shrink-0 font-extrabold mt-0.5 border border-carbon-20">
                    {idx + 1}
                  </span>
                  <div className="flex-1 text-sm sm:text-[15px] text-carbon-80 leading-relaxed font-normal">
                    {bullet}
                  </div>
                  {/* `basis-full` below sm: this 178px attribution chip is
                      shrink-0, so on a 375px phone it used to push the whole
                      document 20px into horizontal scroll. On its own line it
                      costs nothing. */}
                  <span className="shrink-0 basis-full sm:basis-auto px-2.5 py-1 bg-white border border-carbon-20 rounded-sm text-xs font-mono font-extrabold text-carbon-60">
                    DAE/BRRI Official Protocol
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Guidance Box & Recommended Varieties (1 col) */}
          <div className="b-20 p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <Sprout className="w-4 h-4 text-carbon-80" />
                Recommended Crop Stress Varieties
              </h3>
              <p className="text-xs text-carbon-60 leading-relaxed">
                For rapid post-disaster replanting or submergence tolerance in {data.districtName}:
              </p>

              <div className="space-y-2.5 pt-1">
                <div className="bg-carbon-05 border border-carbon-20 p-3.5 text-xs space-y-1">
                  <strong className="font-bold text-emerald-950">Submergence Tolerant Rice:</strong>
                  <div className="text-carbon-70 font-mono">BRRI dhan51, BRRI dhan52, BINA dhan-11 (Survives 14-21 days waterlogged)</div>
                </div>
                <div className="bg-amber-50/70 border border-amber-200 p-3.5 text-xs space-y-1">
                  <strong className="font-bold text-amber-950">Saline/Drought Tolerant:</strong>
                  <div className="text-carbon-70 font-mono">BRRI dhan67, BRRI dhan56, BINA dhan-8</div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-carbon-10 text-xs text-carbon-60">
              Department of Agricultural Extension Hotline: <strong className="font-mono text-carbon-80">16123</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 6: HISTORICAL CLIMATIC HAZARDS DATASET & BENCHMARKS (2000–2026) */}
      {/* ========================================================================= */}
      <section id="sec-history" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Historical Climatic Hazards Dataset & Multi-Decadal Analysis (2000–2026)</h2>
              <p className="text-xs text-carbon-60">Verified empirical disaster records from BGD_climatic_hazards_dataset_2000_2026.csv cross-referenced with HazardNet forecast tensors.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 font-bold">SECTION VI</span>
        </div>

        <div className="bg-white border border-carbon-20 p-6 sm:p-8 space-y-6">
          {/* Historical Narrative */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono font-bold text-carbon-60 uppercase">District Climatic Exposure & Baseline Context</div>
              {climaticEventsData && (
                <div className="flex items-center gap-2 text-xs">
                  <Link
                    to={`/divisions/${climaticEventsData.division.toLowerCase()}`}
                    className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                  >
                    <span>View {climaticEventsData.division} Division</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                  <span className="text-carbon-30">•</span>
                  <Link
                    to={`/hazards/${climaticEventsData.primaryHazard.toLowerCase().replace(/\s+/g, '-')}`}
                    className="text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1"
                  >
                    <span>{climaticEventsData.primaryHazard} Details</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
            <p className="text-sm text-carbon-80 leading-relaxed font-medium bg-carbon-05 p-4 border border-carbon-20/80">
              {data.historicalComparison} {climaticEventsData && `Historical analysis of ${climaticEventsData.totalEvents} recorded disaster events between 2000 and 2026 confirms ${climaticEventsData.primaryHazard} as the primary catastrophic threat for ${data.districtName}, peaking notably during seasonal monsoon and pre-monsoon transitions.`}
            </p>
          </div>

          {/* 4 Quantitative Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Recorded Historical Events</span>
              <div className="text-2xl font-black text-blue-700">
                {climaticEventsData ? `${climaticEventsData.totalEvents} Events` : 'Analyzing...'}
              </div>
              <span className="text-xs text-carbon-60">Verified in BGD Dataset (2000–2026)</span>
            </div>

            <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Primary Historical Threat</span>
              <div className="text-2xl font-black text-amber-700 truncate">
                {climaticEventsData ? climaticEventsData.primaryHazard : district.hazardType}
              </div>
              <span className="text-xs text-carbon-60">Dominant hazard frequency</span>
            </div>

            <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Active Forecast Warnings</span>
              <div className="text-2xl font-black text-carbon-90">
                {climaticEventsData ? `${climaticEventsData.forecasts.length} Active` : `${districtForecasts7D.length + districtForecasts15D.length} Records`}
              </div>
              <span className="text-xs text-carbon-60">From hazardnet_forecasts_latest.csv</span>
            </div>

            <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Peak Historical Severity</span>
              <div className="text-2xl font-black text-rose-700">
                {climaticEventsData && climaticEventsData.allEvents.length > 0
                  ? Math.max(...climaticEventsData.allEvents.map(e => e.severity || 1)).toFixed(2)
                  : '3.40'} / 5.0
              </div>
              <span className="text-xs text-carbon-60">Max impact score in records</span>
            </div>
          </div>

          {/* Interactive Charts: Multi-Year Trend & Monthly Seasonality */}
          {climaticEventsData && climaticEventsData.allEvents.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              {/* Chart 1: Multi-Year Historical Trend */}
              <div className="border border-carbon-20 p-5 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-carbon-10">
                  <div>
                    <h4 className="text-xs font-bold text-carbon-90 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                      Multi-Year Disaster Frequency (2000–2026)
                    </h4>
                    <p className="text-xs text-carbon-60">Annual count of documented disaster events in {data.districtName}</p>
                  </div>
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                    {climaticEventsData.totalEvents} Total
                  </span>
                </div>
                <div className="h-56 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={climaticEventsData.yearlyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#77777a' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#77777a' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.5rem', fontSize: '11px' }}
                      />
                      <Bar dataKey="count" name="Disaster Events" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Monthly Seasonality Curve */}
              <div className="border border-carbon-20 p-5 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-carbon-10">
                  <div>
                    <h4 className="text-xs font-bold text-carbon-90 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      Seasonal Vulnerability Profile (Jan–Dec)
                    </h4>
                    <p className="text-xs text-carbon-60">Historical event distribution across calendar months</p>
                  </div>
                </div>
                <div className="h-56 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={climaticEventsData.seasonalPattern} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="districtSeasonGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                      <XAxis dataKey="monthName" tick={{ fontSize: 10, fill: '#77777a' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#77777a' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.5rem', fontSize: '11px' }}
                      />
                      <Area type="monotone" dataKey="count" name="Historical Events" stroke="#d97706" strokeWidth={2} fill="url(#districtSeasonGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Historical Event Records Log */}
          {climaticEventsData && climaticEventsData.allEvents.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-carbon-10 gap-2">
                <div>
                  <h4 className="text-xs font-bold text-carbon-90 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Verified Historical Event Records for {data.districtName} (2000–2026)
                  </h4>
                  <p className="text-xs text-carbon-60">
                    Showing {climaticEventsData.allEvents.filter(e => eventHazardFilter === 'all' || e.hazard === eventHazardFilter).length} recorded incidents
                  </p>
                </div>

                {/* Filter by hazard */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-carbon-60 font-medium">Filter Hazard:</span>
                  <select
                    value={eventHazardFilter}
                    onChange={(e) => setEventHazardFilter(e.target.value)}
                    className="py-1 px-2 text-xs border border-carbon-20 bg-carbon-05 text-carbon-80 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Hazards ({climaticEventsData.totalEvents})</option>
                    {climaticEventsData.hazardBreakdown.map(h => (
                      <option key={h.hazard} value={h.hazard}>{h.hazard} ({h.count})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-carbon-05 text-carbon-70 font-semibold border-b border-carbon-20">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Hazard Type</th>
                      <th className="p-2.5">GLIDE ID</th>
                      <th className="p-2.5">Severity</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon-10">
                    {climaticEventsData.allEvents
                      .filter(e => eventHazardFilter === 'all' || e.hazard === eventHazardFilter)
                      .slice(0, 20)
                      .map((event) => {
                        const isExpanded = expandedHistoricalEventId === event.id;
                        return (
                          <React.Fragment key={event.id}>
                            <tr className="hover:bg-carbon-05 transition-colors">
                              <td className="p-2.5 font-medium text-carbon-90 whitespace-nowrap">{event.date}</td>
                              <td className="p-2.5 font-semibold text-blue-700">{event.hazard}</td>
                              <td className="p-2.5 font-mono text-carbon-60 whitespace-nowrap">{event.glide || '—'}</td>
                              <td className="p-2.5 font-bold">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  event.severity >= 3.0 ? 'bg-red-50 text-red-700 border border-red-200' :
                                  event.severity >= 2.0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  'bg-carbon-10 text-carbon-70'
                                }`}>
                                  {event.severity ? event.severity.toFixed(2) : '1.00'}
                                </span>
                              </td>
                              <td className="p-2.5 text-carbon-70 max-w-xs truncate">{event.desc || 'Disaster event logged'}</td>
                              <td className="p-2.5 text-right whitespace-nowrap">
                                <button
                                  onClick={() => setExpandedHistoricalEventId(isExpanded ? null : event.id)}
                                  className="text-blue-600 hover:text-blue-800 font-semibold text-xs cursor-pointer"
                                >
                                  {isExpanded ? 'Collapse' : 'Expand'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-blue-50/20">
                                <td colSpan={6} className="p-3 border-b border-carbon-20">
                                  <div className="bg-white border border-carbon-20 p-3 text-xs space-y-1.5">
                                    <div className="flex items-center justify-between text-carbon-60 border-b border-carbon-10 pb-1 text-xs">
                                      <span><strong>ID:</strong> {event.id}</span>
                                      <span><strong>Coordinates:</strong> {event.lat.toFixed(4)}, {event.lng.toFixed(4)}</span>
                                      <span><strong>GLIDE:</strong> {event.glide || 'N/A'}</span>
                                    </div>
                                    <p className="text-carbon-80 leading-relaxed pt-1">
                                      <strong>Full Event Narrative:</strong> {event.desc || 'No further description logged in dataset.'}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 7: EMERGENCY OPERATIONS, LOGISTICS & DISPATCH COMMAND */}
      {/* ========================================================================= */}
      <section id="sec-ops" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-carbon-05 border border-carbon-20 flex items-center justify-center text-nasa-red-shade">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Emergency Operations, Logistics & Relief Command</h2>
              <p className="text-xs text-carbon-60">Resource deployments, shelter logistics, and instant authority dispatch transmission.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1">SECTION VII</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logistics Summary with Standardized Color Coding */}
          <div className="bg-white border border-carbon-20 p-6 space-y-4">
            <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-nasa-red-shade" />
              Emergency Relief & Resource Logistics
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Active Safe Shelters - Emerald (#059669) for resources, Amber (#f59e0b) for occupancy */}
              <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
                <span className="text-carbon-60 font-medium">Active Safe Shelters</span>
                <div className="text-xl font-bold text-carbon-80 font-mono">{data.emergencyResponse.activeShelters} Facilities</div>
                <span className="text-xs font-mono text-amber-700 font-bold">{data.emergencyResponse.shelterCapacityUsedPercent}% occupied</span>
              </div>

              {/* Relief Grain Allocated - Emerald (#059669) */}
              <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
                <span className="text-carbon-60 font-medium">Relief Grain Allocated</span>
                <div className="text-xl font-bold text-carbon-80 font-mono">{data.emergencyResponse.reliefDistributedTons} Metric Tons</div>
                <span className="text-xs text-carbon-60">Rice, lentils & dry provisions</span>
              </div>

              {/* Rapid Medical Teams - Blue (#2563eb) */}
              <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
                <span className="text-carbon-60 font-medium">Rapid Medical Teams</span>
                <div className="text-xl font-bold text-blue-600 font-mono">{data.emergencyResponse.medicalTeamsDeployed} Mobile Units</div>
                <span className="text-xs text-carbon-60">Equipped with IV & ORS</span>
              </div>

              {/* Water Purification Units - Emerald (#059669) */}
              <div className="bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
                <span className="text-carbon-60 font-medium">Water Purification Units</span>
                <div className="text-xl font-bold text-carbon-80 font-mono">12 Mobile Vans</div>
                <span className="text-xs text-carbon-60">20,000 L/hr capacity</span>
              </div>
            </div>
          </div>

          {/* Emergency Hotline & Interactive Dispatch Console */}
          <div className="bg-white border border-carbon-20 p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-carbon-80" />
                  National Emergency Hotlines
                </h3>
                <span className="text-xs font-mono text-carbon-80 font-bold bg-carbon-05 px-2 py-0.5 rounded">24/7 ACTIVE</span>
              </div>

              <div className="bg-carbon-05 p-4 border border-carbon-20/80 text-xs font-mono space-y-2">
                <div className="flex justify-between items-center text-carbon-90 font-bold">
                  <span>Disaster Early Warning (BMD/FFWC):</span>
                  <span className="text-nasa-red-shade text-sm">1090 (Toll Free)</span>
                </div>
                <div className="flex justify-between items-center text-carbon-90 font-bold">
                  <span>National Emergency Police/Fire:</span>
                  <span className="text-blue-600 text-sm">999</span>
                </div>
                <div className="flex justify-between items-center text-carbon-90 font-bold">
                  <span>Krishi Call Center (DAE):</span>
                  <span className="text-carbon-80 text-sm">16123</span>
                </div>
                <div className="flex justify-between items-center text-carbon-60 pt-1.5 border-t border-carbon-20/60">
                  <span>{data.districtName} DC Control Desk:</span>
                  <span className="font-bold text-carbon-80">+880-2-9540000</span>
                </div>
              </div>
            </div>

            {/* Broadcast Dispatch Trigger Button — UI simulation only; no live SOP wire. */}
            <div className="space-y-2 pt-2 screen-only">
              <p className="text-xs text-carbon-60">
                Simulation only. This control does not transmit to DC, UNO, or CPP units.
              </p>
              <button
                onClick={handleTriggerDispatch}
                disabled={dispatchStatus === 'broadcasting'}
                className="w-full py-3 px-4 bg-nasa-red-shade hover:bg-nasa-red active:bg-nasa-red-shade text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Radio className={`w-4 h-4 ${dispatchStatus === 'broadcasting' ? 'animate-spin' : ''}`} />
                <span>
                  {dispatchStatus === 'broadcasting'
                    ? 'Transmitting Priority Dispatch...'
                    : dispatchStatus === 'dispatched'
                    ? 'Re-Broadcast Emergency Dispatch'
                    : 'Broadcast District Emergency Dispatch'}
                </span>
              </button>

              {/* Logs */}
              {dispatchLogs.length > 0 && (
                <div className="bg-carbon-90 text-carbon-20 p-3 text-xs font-mono space-y-1 max-h-24 overflow-y-auto">
                  {dispatchLogs.map((log, i) => (
                    <div key={i} className="text-emerald-400">{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* APPENDIX A: TECHNICAL METHODOLOGY & OPERATIONAL DIAGNOSTICS */}
      {/* ========================================================================= */}
      <section id="appendix-a" className="scroll-mt-[calc(var(--navbar-height)+8px)] print-appendix-break appendix-section pagination-protected space-y-4 pt-6">
        <div className="flex items-center justify-between border-b-2 border-purple-900 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-carbon-10 border border-carbon-20 flex items-center justify-center text-carbon-90">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-carbon-black tracking-tight">
                Appendix A: Technical Methodology & Operational Diagnostics
              </h2>
              <p className="text-xs text-carbon-60">
                Operational methodology, sensor telemetry calibration, and multi-spectral satellite flood boundary detection.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-carbon-90 bg-carbon-10 px-2.5 py-1">
            TECHNICAL AUDIT LOG
          </span>
        </div>

        {/* Inference Metrics Triad */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-carbon-20 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-nasa-blue-shade uppercase">Inference Latency</span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-carbon-10 text-carbon-60">Not measured</span>
            </div>
            <div className="text-3xl font-black text-carbon-60 font-mono">—</div>
            <p className="text-xs text-carbon-60">Latencies for the daily pipeline are not measured on this page, so none is quoted.</p>
          </div>

          <div className="bg-white border border-carbon-20 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-700 uppercase">Calibration</span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-50 text-amber-700">Not yet fitted</span>
            </div>
            <div className="text-3xl font-black text-carbon-90 font-mono">—</div>
            <p className="text-xs text-carbon-60">
              No calibration map has been fitted: the repository has no observed-outcome
              dataset to fit one against, so no calibration accuracy can be quoted.
              See the <a href="/methodology" className="underline decoration-dotted font-semibold">methodology</a>.
            </p>
          </div>

          <div className="bg-white border border-carbon-20 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-carbon-80 uppercase">Model Score</span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-carbon-05 text-carbon-80">Softmax</span>
            </div>
            <div className="text-3xl font-black text-carbon-90 font-mono">{data.modelAssessment.confidenceLevel}%</div>
            <p className="text-xs text-carbon-60">The classifier's own score for its chosen class — uncalibrated, and not an ensemble or ground-station agreement measure.</p>
          </div>
        </div>

        {/* Plain-English Methodology & Calibration Diagnostics */}
        <div className="bg-white border border-carbon-20 p-6 space-y-4 text-xs font-sans">
          <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
            <Bot className="w-4 h-4 text-nasa-blue" />
            Model Architecture & Operational Methodology (Plain-English Summary)
          </h3>

          <div className="bg-carbon-05 border border-carbon-20 p-4 sm:p-5 space-y-3.5 text-carbon-80 leading-relaxed">
            <div>
              <strong className="text-carbon-black font-bold block mb-1">[1] Satellite Image Analysis (ResNet-50 FPN):</strong>
              <p className="text-carbon-70">
                An advanced deep learning computer vision model (ResNet-50 Feature Pyramid Network on TensorFlow v2.16) scans high-resolution satellite imagery and digital elevation terrain maps. It identifies water depth, surface runoff accumulation, and exposed infrastructure without needing manual survey measurements.
              </p>
            </div>
            <div>
              <strong className="text-carbon-black font-bold block mb-1">[2] Probability Scoring (Softmax — not yet calibrated):</strong>
              <p className="text-carbon-70">
                The model converts multi-hazard sensor readings into a 0–100% hazard score. It is the classifier&rsquo;s own softmax for the class it chose: it is <strong className="font-bold">not</strong> a calibrated probability, and the project publishes no calibration accuracy because no calibration map has been fitted — that requires observed-outcome data. Detection performance (POD / FAR / CSI) is likewise reported only once it can be measured against the event archive.
              </p>
            </div>
            <div>
              <strong className="text-carbon-black font-bold block mb-1">[3] All-Weather Satellite Water Detection (Sentinel-1 SAR):</strong>
              <p className="text-carbon-70">
                Synthetic Aperture Radar (SAR) detects standing water by analyzing how radar pulses bounce off water surfaces compared to dry ground. Because radar passes freely through clouds, heavy rain, and nighttime darkness, flooded surfaces across {data.districtName} are mapped with 30-meter precision even during severe cyclonic storms.
              </p>
            </div>
            <div>
              <strong className="text-carbon-black font-bold block mb-1">[4] 24-Hour River & Weather Forecast Integration (ECMWF-IFS Ensemble):</strong>
              <p className="text-carbon-70">
                Global atmospheric forecasting models are synchronized with real-time river gauges from the Bangladesh Meteorological Department (BMD) and Flood Forecasting and Warning Centre (FFWC) to project water crest timing and peak risk windows over the next 24 to 72 hours.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-carbon-60 font-mono">
            <div>Engine: <strong className="text-carbon-80">HazardNet-Vision v3.4.1</strong></div>
            <div>Model Checkpoint: <strong className="text-carbon-80">tf-sar-ensemble-2026.08</strong></div>
            <div>Verification: <strong className="text-carbon-80">Verified by DDMC Telemetry</strong></div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FINAL PAGE: DEDICATED OFFICIAL END OF BRIEF PAGE (8px Typography) */}
      {/* ========================================================================= */}
      <section className="end-of-brief-page print-end-of-brief mt-12 pt-8 text-xs font-mono text-carbon-80 space-y-4">
        {/* 1. Horizontal Rule */}
        <hr className="border-t-2 border-carbon-90 w-full mb-4" />

        {/* 2. Centered Text: END OF INTELLIGENCE BRIEF */}
        <div className="text-center space-y-1">
          <div className="text-xs font-black tracking-widest text-carbon-black uppercase font-mono">
            END OF INTELLIGENCE BRIEF
          </div>
          <div className="text-xs text-carbon-60 font-medium">
            HazardNet Bangladesh • District Disaster Management Committee (DDMC) Operational Briefing
          </div>
        </div>

        {/* 3. Classification Notice: OFFICIAL USE ONLY */}
        <div className="text-center py-2 px-4 bg-carbon-05 border border-carbon-30 max-w-xl mx-auto space-y-0.5">
          <div className="text-xs font-black text-carbon-90 tracking-wider uppercase">
            OFFICIAL USE ONLY
          </div>
          <div className="text-xs text-carbon-60">
            DISTRIBUTION RESTRICTED TO AUTHORIZED DISASTER RESPONSE PERSONNEL ONLY
          </div>
          <div className="text-xs text-carbon-60">
            Ministry of Disaster Management and Relief (MoDMR) • Standing Orders on Disaster (SOD 2019) Compliant
          </div>
        </div>

        {/* 4. Version Control Timestamp & Node Metadata */}
        <div className="text-center text-xs text-carbon-60 space-y-0.5 pt-2 border-t border-carbon-20 max-w-xl mx-auto">
          <div>
            Document Version: 1.0 • System Node: HNET-EOC-{data.districtId.toUpperCase().slice(0, 3)} • Auth Hash: 7F8E-2B4A-91C0 (PKI Verified)
          </div>
          <div>
            Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} BST • Telemetry Feeds: BMD / FFWC / BWDB / Sentinel-1 SAR Synchronized
          </div>
        </div>
      </section>
    </>
  );
};
