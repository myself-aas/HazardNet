import React from 'react';
import { MapPin, Compass, Bot, ExternalLink } from 'lucide-react';
import { PrintQrCode } from '../PrintQrCode';

import { useDistrictBrief } from './DistrictBriefContext';


/** Stored outlook summary — Section 3 step before charts. */
export const DistrictOutlookCard: React.FC = () => {
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
        {/* 2. EXECUTIVE HERO COMMAND CARD */}
        <section className="bg-white border border-carbon-20 p-4 sm:p-6 relative overflow-hidden">
          {/* Subtle decorative background glow */}

          
          <div className="relative z-10 space-y-6">
            {/* Status indicators & Descriptive summary — Starts directly with descriptive summary */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 screen-only">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-carbon-10 border border-carbon-20 text-carbon-70 text-xs font-mono font-bold">
                  <MapPin className="w-3 h-3 text-carbon-60" />
                  {data.division} Division
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-carbon-10 border border-carbon-20 text-carbon-70 text-xs font-mono font-bold">
                  <Compass className="w-3 h-3 text-carbon-60" />
                  {district.lat.toFixed(3)}°N, {district.lng.toFixed(3)}°E
                </span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm border text-xs font-mono font-extrabold ${riskStyles.bg}`}>
                  <span className={`w-2 h-2 rounded-full ${
                    data.modelAssessment.riskCategory === 'High' ? 'bg-[var(--severity-red)] animate-pulse' :
                    data.modelAssessment.riskCategory === 'Moderate' ? 'bg-[var(--severity-amber)]' : 'bg-[var(--severity-green)]'
                  }`} />
                  {data.modelAssessment.riskCategory} Risk Classification
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-carbon-05 border border-carbon-20 text-nasa-blue-shade text-xs font-mono font-bold">
                  <Bot className="w-3 h-3 text-nasa-blue" />
                  Model Score: {data.modelAssessment.confidenceLevel}% (uncalibrated)
                </span>
              </div>

              {/* Start directly with descriptive summary */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <p className="text-carbon-80 text-sm sm:text-base leading-relaxed font-medium max-w-4xl">
                  {data.hazardSubtype}. Continuous severity index calculated at{' '}
                  <strong className="text-carbon-black font-bold">{(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}%</strong> with a model score of{' '}
                  <strong className="text-carbon-black font-bold">{data.modelAssessment.confidenceLevel}%</strong>. That score is the classifier&rsquo;s own (uncalibrated) softmax, not a measured probability of the event — calibration and POD/FAR are tracked in the{' '}
                  <a href="/methodology" className="underline decoration-dotted font-semibold">methodology</a>. Primary exposure focuses across low-elevation agricultural floodplains, dense riverine settlements, and vulnerable embankment corridors.
                </p>

                {/* Quick Live Link / QR preview for Screen */}
                <div className="hidden lg:flex items-center gap-3 bg-carbon-05 border border-carbon-20/80 p-3 shrink-0 screen-only">
                  <div className="shrink-0">
                    <PrintQrCode
                      url={`https://www.hazardnet.live/forecast/district/${districtId}`}
                      districtOrSector={data.districtName}
                      title="Mobile Link"
                      size={52}
                    />
                  </div>
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-carbon-90 block font-mono text-xs">LIVE TELEMETRY STREAM</span>
                    <a
                      href={`https://www.hazardnet.live/forecast/district/${districtId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-semibold text-xs inline-flex items-center gap-1"
                    >
                      <span>View Live Dashboard</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

          {/* 3-Column Key Metrics Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-carbon-10">
            {/* Metric 1: Severity Gauge */}
            <div className="metric-card bg-carbon-05 border border-carbon-20 p-4 sm:p-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-carbon-60 uppercase">Severity Gauge</span>
                <span className={`px-2 py-0.5 rounded-sm text-xs font-mono font-extrabold ${riskStyles.badge}`}>
                  {data.modelAssessment.riskCategory}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-carbon-black font-mono">
                  {(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}
                  <span className="text-sm font-semibold text-carbon-60">/100</span>
                </span>
                <span className="text-xs font-mono font-bold text-carbon-60">
                  | {data.hazardType}
                </span>
              </div>
              <div className="w-full bg-carbon-20 h-2 rounded-sm overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all duration-700 ${riskStyles.bar}`}
                  style={{ width: `${Math.min(100, Math.max(5, data.modelAssessment.continuousSeverityIndex * 100))}%` }}
                />
              </div>
              <div className="text-xs text-carbon-60 font-medium">
                Continuous vulnerability indexing
              </div>
            </div>

            {/* Metric 2: AI Model Confidence */}
            <div className="metric-card bg-carbon-05 border border-carbon-20 p-4 sm:p-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-carbon-60 uppercase">AI Model Confidence</span>
                <span className="px-2 py-0.5 rounded-sm text-xs font-mono font-bold bg-carbon-10 text-carbon-80">
                  ▲ High Reliability
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-carbon-80 font-mono">
                  {data.modelAssessment.confidenceLevel}%
                </span>
                <span className="text-xs font-mono font-bold text-carbon-60">
                  | Neural Attention
                </span>
              </div>
              <div className="w-full bg-carbon-20 h-2 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm bg-nasa-green transition-all duration-700"
                  style={{ width: `${data.modelAssessment.confidenceLevel}%` }}
                />
              </div>
              <div className="text-xs text-carbon-60 font-medium">
                Trained on GCM & ECMWF Ensembles
              </div>
            </div>

            {/* Metric 3: Hydro-Dynamic Elevation */}
            <div className="metric-card bg-carbon-05 border border-carbon-20 p-4 sm:p-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-carbon-60 uppercase">Elevation Datum</span>
                <span className="px-2 py-0.5 rounded-sm text-xs font-mono font-bold bg-blue-100 text-blue-800">
                  SRTM Geodetic
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-carbon-black font-mono">
                  {data.elevationMeters}
                  <span className="text-sm font-semibold text-carbon-60 ml-1">m MSL</span>
                </span>
                <span className="text-xs font-mono font-bold text-carbon-60">
                  | Mean Sea Level
                </span>
              </div>
              <div className="w-full bg-carbon-20 h-2 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm bg-blue-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, (data.elevationMeters / 40) * 100)}%` }}
                />
              </div>
              <div className="text-xs text-carbon-60 font-medium truncate">
                Station: {data.physicalSensorMetrics.sensorStationName}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
