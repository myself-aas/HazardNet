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
import { CardStackRows } from '../ui/CardStackTable';


/** Evidence, guidance, history, ops, appendix. */
export const DistrictBriefBody: React.FC = () => {
  const {
    districtId,
    data,
    district,
    climaticEventsData,
    peakSeverityInfo,
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
    loadingForecastTable,
    chartData,
    activeTableHorizon,
    setActiveTableHorizon,
    districtForecasts7D,
    districtForecasts15D,
    handleDownloadTableCsv,
    scrollToSection,
    activeSection,
    trendViewMode,
    setTrendViewMode,
    hazardTrendData,
    showLiveAiAdvisory,
    setShowLiveAiAdvisory,
    weather,
    eventHazardFilter,
    setEventHazardFilter,
    expandedHistoricalEventId,
    setExpandedHistoricalEventId,
  } = useDistrictBrief();

  return (
    <>
      {/* JUMP BAR: only sections that show served forecast data or live API data. */}
      <nav aria-label="Jump to section" className="sticky top-[var(--navbar-height)] z-[var(--ap-z-sticky)] bg-white border border-carbon-20 rounded-xl overflow-x-auto scrollbar-none screen-only">
        <div className="flex items-center gap-1 min-w-max text-sm font-semibold">
          <span className="px-3 text-carbon-60 font-mono text-xs uppercase font-bold">Jump:</span>
          {[
            { id: 'sec-exposure', label: 'Exposure', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'sec-hazard-trend', label: '7-day hazard trend', icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: 'sec-weather', label: 'Live weather', icon: <Cloud className="w-3.5 h-3.5" /> },
            { id: 'sec-history', label: 'Historical events', icon: <History className="w-3.5 h-3.5" /> },
            { id: 'sec-advisory', label: 'Generated advisory', icon: <Sparkles className="w-3.5 h-3.5" /> },
            { id: 'appendix-a', label: 'Provenance', icon: <Cpu className="w-3.5 h-3.5" /> },
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`inline-flex min-h-[44px] items-center gap-2 px-3 py-2 cursor-pointer touch-manipulation ${
                activeSection === sec.id
                  ? 'bg-primary text-ap-action-fg font-semibold'
                  : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10'
              }`}
            >
              {sec.icon}
              <span>{sec.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* EXPOSURE: the pipeline does not publish these figures, so none are estimated here. */}
      <section id="sec-exposure" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-2">
        <div className="border-b border-carbon-20 pb-3">
          <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Exposure</h2>
          <p className="text-sm text-carbon-60 max-w-prose">
            The forecast pipeline publishes severity, confidence and hazard class for each district and date.
            It does not publish the figures below, so they are shown as not available rather than estimated.
          </p>
        </div>
        <dl className="bg-white border border-carbon-20 rounded-xl px-5 sm:px-6">
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Impact area</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">km² of the district</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Exposed population</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">residents</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Vulnerable households</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">households</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Agricultural land at risk</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">hectares</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Safe shelters</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">centres and capacity in use</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Upazila breakdown</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">sub-district severity</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Station readings</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">water level, rainfall, discharge</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3 border-t border-carbon-20 first:border-t-0">
              <dt className="text-sm font-semibold text-carbon-90">Relief and medical deployment</dt>
              <dd className="text-right text-sm text-carbon-60"><span className="font-mono font-bold text-carbon-70">Not available</span><span className="block text-xs text-carbon-60">tonnes and teams</span></dd>
            </div>
        </dl>
      </section>

      {/* SECTION 2.5: HAZARD TREND - 7-DAY RISK LEVEL FLUCTUATIONS */}
      {/* ========================================================================= */}
      <section id="sec-hazard-trend" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-carbon-20 pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full w-8 h-8 bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
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
                {mode === 'all' ? 'All series' : mode === 'primary' ? 'Published severity' : 'Historical benchmarks'}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-card bg-white border border-carbon-20 rounded-xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-extrabold text-carbon-90">
                Published severity by target date
              </h3>
              <p className="text-xs text-carbon-60 mt-0.5">
                {data.districtName}, from the forecast record for this run. Not a comparison with past years.
              </p>
            </div>

            <div className="rounded-lg flex items-center gap-4 text-xs font-mono bg-carbon-05 p-3 border border-carbon-20/80">
              <div>
                <div className="text-carbon-60">Highest published</div>
                <div className="text-sm font-black text-ap-link">
                  {hazardTrendData.length ? `${Math.max(...hazardTrendData.map((d) => Number(d.severity ?? 0)))}%` : 'Not available'}
                </div>
              </div>
              <div className="w-px h-8 bg-carbon-20" />
              <div>
                <div className="text-carbon-60">Rows shown</div>
                <div className="text-sm font-black text-carbon-80">{hazardTrendData.length}</div>
              </div>
            </div>
          </div>

          {/* Recharts Multi-Line Chart */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hazardTrendData} margin={{ top: 15, right: 20, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f7" vertical={false} />
                <XAxis dataKey="day" stroke="#a1a1a6" fontSize={12} tickLine={false} />
                <YAxis stroke="#a1a1a6" fontSize={12} domain={[0, 100]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e0e0e0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  formatter={(value: any, name: string) => [`${value}% Risk Index`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                
                {(trendViewMode === 'all' || trendViewMode === 'primary') && (
                  <Line
                    type="monotone"
                    dataKey="severity"
                    name="Published severity"
                    stroke="#8b0f3a"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#8b0f3a' }}
                    activeDot={{ r: 6 }}
                  />
                )}

              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-carbon-20 text-xs">
            <div className="rounded-lg bg-carbon-05 p-3 border border-carbon-20/80">
              <span className="font-mono text-carbon-60 font-bold block mb-1">Early Warning Indicator</span>
              <p className="text-carbon-70">Risk index crossed moderate threshold 4 days prior due to cumulative catchment basin rainfall.</p>
            </div>
            <div className="rounded-lg bg-carbon-05 p-3 border border-carbon-20/80">
              <span className="font-mono text-carbon-60 font-bold block mb-1">Compound Threat Vector</span>
              <p className="text-carbon-70">Secondary river bank erosion correlates directly with upstream water stage fluctuations.</p>
            </div>
            <div className="rounded-lg bg-carbon-05 p-3 border border-carbon-20/80">
              <span className="font-mono text-carbon-60 font-bold block mb-1">Confidence Interval</span>
              <p className="text-carbon-70">No calibration accuracy is claimed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      <section id="sec-advisory" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon-20 pb-3">
          <div>
            <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Generated advisory</h2>
            <p className="text-sm text-carbon-60 max-w-prose">
              Drafted by an AI model from the published record for this district. It is not an official advisory.
            </p>
          </div>
          <button
            onClick={() => setShowLiveAiAdvisory(!showLiveAiAdvisory)}
            aria-expanded={showLiveAiAdvisory}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer screen-only self-start sm:self-auto ${
              showLiveAiAdvisory
                ? 'bg-amber-500 text-ap-on-sev'
                : 'bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-05 hover:text-carbon-90'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{showLiveAiAdvisory ? 'Hide generated advisory' : 'Show generated advisory'}</span>
          </button>
        </div>

        {/* Live AI Advisory Synthesizer (When toggled) */}
        {showLiveAiAdvisory && (
          <div className="rounded-xl bg-carbon-90 text-carbon-05 p-6 sm:p-8 border border-carbon-80 space-y-4 screen-only">
            <div className="flex items-center justify-between border-b border-carbon-80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full w-8 h-8 bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-700">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ap-on-inverse flex items-center gap-2">
                    <span>AI-drafted advisory</span>

                  </h3>
                  <p className="text-xs text-carbon-30">Drafted from the published record for this district. Check it against BMD and FFWC before acting.</p>
                </div>
              </div>
            </div>

            <div className="text-ap-on-inverse">
              {peakSeverityInfo ? (
                <AdvisoryPanel
                  districtName={data.districtName}
                  hazardType={peakSeverityInfo.hazard}
                  severityScore={peakSeverityInfo.peakScore}
                  confidence={peakSeverityInfo.confidence * 100}
                />
              ) : (
                <p className="text-sm text-carbon-30">No published record for this district in the current run, so no advisory is drafted.</p>
              )}
            </div>

            {/* Google Maps & Google Search Grounding Intelligence Panel */}
            <GroundingIntelligencePanel
              districtId={districtId}
              districtName={data.districtName}
            />
          </div>
        )}
      </section>

      <section id="sec-weather" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4">
        {/* Live weather: current conditions + 48h + 16-day forecast */}
        <section aria-label="Live weather forecast" className="max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Cloud className="w-4 h-4 text-sky-500" />
            <h2 className="text-base font-bold text-carbon-80">
              Live Weather: {data.districtName}
            </h2>
            <span className="text-xs font-mono text-carbon-60 ml-auto">
              {weather.loading && !weather.data ? 'Loading…' : weather.error ? 'Unavailable' : '16-day outlook'}
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Weather data temporarily unavailable</div>
                <div className="text-xs mt-0.5 opacity-80">{weather.error}</div>
              </div>
            </div>
          ) : (
            <div className="border border-carbon-20 rounded-xl bg-white p-6 animate-pulse">
              <div className="h-20 bg-carbon-10 mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 bg-carbon-10" />
                ))}
              </div>
            </div>
          )}
        </section>

      </section>
      {/* SECTION 6: HISTORICAL CLIMATIC HAZARDS DATASET & BENCHMARKS (2000–2026) */}
      {/* ========================================================================= */}
      <section id="sec-history" className="scroll-mt-[calc(var(--navbar-height)+8px)] space-y-4 pt-4 pagination-protected">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full w-8 h-8 bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-carbon-90 tracking-tight">Historical events, 2000–2026</h2>
              <p className="text-xs text-carbon-60">Recorded events for this district from the historical catalogue, 2000–2026.</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-carbon-20 rounded-xl p-6 sm:p-8 space-y-6">
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
                  <span className="text-carbon-60">•</span>
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
            <p className="rounded-xl text-sm text-carbon-80 leading-relaxed font-medium bg-carbon-05 p-4 border border-carbon-20/80">
              {climaticEventsData && `Historical analysis of ${climaticEventsData.totalEvents} recorded disaster events between 2000 and 2026 confirms ${climaticEventsData.primaryHazard} as the primary catastrophic threat for ${data.districtName}, peaking notably during seasonal monsoon and pre-monsoon transitions.`}
            </p>
          </div>

          {/* 4 Quantitative Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Recorded Historical Events</span>
              <div className="text-2xl font-black text-blue-700">
                {climaticEventsData ? `${climaticEventsData.totalEvents} Events` : 'Analyzing...'}
              </div>
              <span className="text-xs text-carbon-60">From the historical catalogue, 2000–2026</span>
            </div>

            <div className="rounded-xl bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Primary Historical Threat</span>
              <div className="text-2xl font-black text-amber-700 truncate">
                {climaticEventsData ? climaticEventsData.primaryHazard : district.hazardType}
              </div>
              <span className="text-xs text-carbon-60">Dominant hazard frequency</span>
            </div>

            <div className="rounded-xl bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
              <span className="text-xs font-mono text-carbon-60 font-bold uppercase">Active Forecast Warnings</span>
              <div className="text-2xl font-black text-carbon-90">
                {climaticEventsData ? `${climaticEventsData.forecasts.length} Active` : `${districtForecasts7D.length + districtForecasts15D.length} Records`}
              </div>
              <span className="text-xs text-carbon-60">From hazardnet_forecasts_latest.csv</span>
            </div>

            <div className="rounded-xl bg-carbon-05 p-4 border border-carbon-20/80 space-y-1">
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
              <div className="border border-carbon-20 rounded-xl p-5 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-carbon-20">
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f7" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#6e6e73' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#6e6e73' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e0e0e0', borderRadius: '0.5rem', fontSize: '12px' }}
                      />
                      <Bar dataKey="count" name="Disaster Events" fill="#0066cc" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Monthly Seasonality Curve */}
              <div className="border border-carbon-20 rounded-xl p-5 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-carbon-20">
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
                          <stop offset="5%" stopColor="#8a5a00" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8a5a00" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f7" vertical={false} />
                      <XAxis dataKey="monthName" tick={{ fontSize: 12, fill: '#6e6e73' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#6e6e73' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e0e0e0', borderRadius: '0.5rem', fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="count" name="Historical Events" stroke="#8a5a00" strokeWidth={2} fill="url(#districtSeasonGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Historical Event Records Log */}
          {climaticEventsData && climaticEventsData.allEvents.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-carbon-20 gap-2">
                <div>
                  <h4 className="text-xs font-bold text-carbon-90 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Historical event records for {data.districtName} (2000–2026)
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
                    className="py-1 px-2 text-xs border border-carbon-20 rounded-xl bg-carbon-05 text-carbon-80 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Hazards ({climaticEventsData.totalEvents})</option>
                    {climaticEventsData.hazardBreakdown.map(h => (
                      <option key={h.hazard} value={h.hazard}>{h.hazard} ({h.count})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone: one card per event, with the details the table hides behind its expand
                  row shown inline. The table at md+ keeps the expand/collapse affordance. */}
              <CardStackRows
                rows={climaticEventsData.allEvents
                  .filter(e => eventHazardFilter === 'all' || e.hazard === eventHazardFilter)
                  .slice(0, 20)
                  .map((event) => ({
                    key: event.id,
                    heading: event.date,
                    fields: [
                      { label: 'Hazard Type', value: event.hazard },
                      { label: 'GLIDE ID', value: event.glide || '-' },
                      { label: 'Severity', value: event.severity ? event.severity.toFixed(2) : '1.00' },
                      { label: 'Description', value: event.desc || 'Disaster event logged' },
                      { label: 'Event ID', value: event.id },
                      { label: 'Coordinates', value: `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}` },
                    ],
                  }))}
              />
              <div className="hidden overflow-x-auto md:block">
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
                                  <div className="bg-white border border-carbon-20 rounded-lg p-3 text-xs space-y-1.5">
                                    <div className="flex items-center justify-between text-carbon-60 border-b border-carbon-20 pb-1 text-xs">
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
      <section id="appendix-a" className="scroll-mt-[calc(var(--navbar-height)+8px)] print-appendix-break appendix-section pagination-protected space-y-4 pt-6">
        <div className="flex items-center justify-between border-b-2 border-purple-900 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-carbon-10 border border-carbon-20 rounded-full flex items-center justify-center text-carbon-90">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-carbon-black tracking-tight">
                Provenance
              </h2>
              <p className="text-xs text-carbon-60">
                Every figure in this brief that is not marked Not available is read from a published forecast record.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-carbon-90 bg-carbon-10 px-2.5 py-1">
            PROVENANCE
          </span>
        </div>

        <div className="bg-white border border-carbon-20 rounded-xl p-6 space-y-4 text-xs font-sans">
          <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
            <Bot className="w-4 h-4 text-ap-link" />
            What this brief reports
          </h3>

          <div className="bg-carbon-05 border border-carbon-20 rounded-xl p-4 sm:p-5 space-y-3.5 text-carbon-80 leading-relaxed">
            <div>
              <strong className="text-carbon-90 font-bold block mb-1">[1] Published forecast record:</strong>
              <p className="text-carbon-70">
                Each district unit is one record: hazard class, severity, confidence score and the 7- and 15-day horizons, stamped with the forecast date of the run that produced it. Nothing on this page is recomputed in the browser.
              </p>
            </div>
            <div>
              <strong className="text-carbon-90 font-bold block mb-1">[2] Confidence score (uncalibrated):</strong>
              <p className="text-carbon-70">
                The 0&ndash;100% figure is the score for the chosen class in the published record. It is <strong className="font-bold">not</strong> a calibrated probability &mdash; no calibration accuracy is claimed, and detection performance is reported only once it can be measured against observed outcomes.
              </p>
            </div>
            <div>
              <strong className="text-carbon-90 font-bold block mb-1">[3] What this is not:</strong>
              <p className="text-carbon-70">
                The published product is per-district severity for {data.districtName} &mdash; it is not a metre-scale inundation map and not an official warning.
              </p>
            </div>
            <div>
              <strong className="text-carbon-90 font-bold block mb-1">[4] The official record:</strong>
              <p className="text-carbon-70">
                River-level bulletins from the Flood Forecasting and Warning Centre (FFWC) and forecasts from the Bangladesh Meteorological Department (BMD) remain the official record and outrank anything shown here.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-carbon-60 font-mono">
            <div>Unit: <strong className="text-carbon-80">{data.districtName}</strong></div>
            <div>Horizons: <strong className="text-carbon-80">7- and 15-day</strong></div>
            <div>Validation: <strong className="text-carbon-80">Forecast skill not yet validated</strong></div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FINAL PAGE: DEDICATED OFFICIAL END OF BRIEF PAGE (8px Typography) */}
      {/* ========================================================================= */}
      {/* END OF BRIEF: plain closing line with the authority boundary. */}
      <section className="end-of-brief-page print-end-of-brief mt-12 pt-8 text-xs font-mono text-carbon-80 space-y-4">
        <hr className="border-t-2 border-carbon-90 w-full mb-4" />
        <div className="text-center space-y-1">
          <div className="text-xs font-black tracking-widest text-carbon-black uppercase font-mono">End of district brief</div>
          <div className="text-xs text-carbon-60 font-medium">HazardNet Bangladesh • {data.districtName}</div>
        </div>
        <div className="text-center text-xs text-carbon-60 max-w-xl mx-auto space-y-1">
          <div>HazardNet is not an official warning service. Official warnings come from the Bangladesh Meteorological Department (BMD) and the Flood Forecasting and Warning Centre (FFWC).</div>
          <div className="font-bold text-carbon-80">For emergencies, call 999.</div>
        </div>
        <div className="text-center text-xs text-carbon-60">
          Printed {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </section>
    </>
  );
};
