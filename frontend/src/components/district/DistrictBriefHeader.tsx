import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, AlertTriangle, History, Calendar, ExternalLink } from 'lucide-react';
import { DistrictAlertStrip } from '../alerts/DistrictAlertStrip';
import { PrintQrCode } from '../PrintQrCode';

import { useDistrictBrief } from './DistrictBriefContext';


/** District h1, source/date, published-alert strip. */
export const DistrictBriefHeader: React.FC = () => {
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

      {/* CONSOLIDATED OFFICIAL DISTRICT DISASTER INTELLIGENCE HEADER */}
      <header className="district-brief-header mb-6 border-b-2 border-carbon-90 pb-4 bg-white p-4 sm:p-6 border border-carbon-20 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon-20 pb-2 text-xs font-mono text-carbon-70 leading-tight min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-carbon-90 uppercase tracking-wider">HazardNet</span>
            <span className="text-carbon-60">•</span>
            <span className="font-semibold text-carbon-60">MoDMR / NDMA Disaster Intelligence</span>
          </div>
          <div className="flex items-center gap-2">
            <span>DISPATCH ID: <strong className="text-carbon-90 font-bold">HN-BD-2026-{data.districtId.toUpperCase().slice(0, 4)}-{new Date().toISOString().slice(5, 10).replace('-', '')}</strong></span>
            <span className="text-carbon-60">•</span>
            <span>DATE: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} BST</span>
          </div>
        </div>

        {/* Header Title with Prominent Risk Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono font-bold text-carbon-60 uppercase tracking-wider">
              DISTRICT DISASTER INTELLIGENCE BRIEF
            </div>
            <h1 className="text-[28px] sm:text-[32px] font-bold text-carbon-90 tracking-tight leading-[1.2]">
              {data.districtName} District <span className="text-carbon-30 font-light mx-1">|</span> {data.hazardType}
            </h1>
          </div>

          {/* Prominent Risk Badge */}
          <div className="shrink-0">
            <span className={`inline-flex min-h-6 items-center gap-2 px-3 py-1 rounded-control text-xs font-mono font-bold ${
              data.modelAssessment.riskCategory === 'High' ? 'bg-[#dc2626] text-white' :
              data.modelAssessment.riskCategory === 'Moderate' ? 'bg-[#f59e0b] text-carbon-black' :
              'bg-[#16a34a] text-white'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                data.modelAssessment.riskCategory === 'High' ? 'bg-white animate-pulse' :
                data.modelAssessment.riskCategory === 'Moderate' ? 'bg-carbon-black' : 'bg-white'
              }`} />
              Risk Level: {data.modelAssessment.riskCategory} ({Math.round(district.severity * 100)}% Severity)
            </span>
          </div>
        </div>

        {/* Published alert for this district (Phase 5). Sits directly under the page
            title because "is there an alert for me here" is the first question, and
            an absent strip must not read as an absent hazard. */}
        <DistrictAlertStrip
          district={district.id || data.districtName || district.name}
          baselineOnly={Boolean((data as { baselineOnly?: boolean }).baselineOnly)}
        />

        {/* Quick Navigation to Parent Division & Primary Hazard Dashboards */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            to={`/divisions/${(climaticEventsData?.division || data.division).toLowerCase()}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:text-blue-800 transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{climaticEventsData?.division || data.division} Division Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <Link
            to={`/hazards/${(climaticEventsData?.primaryHazard || data.hazardType).toLowerCase().replace(/\s+/g, '-')}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 hover:text-amber-900 transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{climaticEventsData?.primaryHazard || data.hazardType} Peril Analytics</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          {climaticEventsData && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-carbon-10 text-carbon-70 border border-carbon-20">
              <History className="w-3.5 h-3.5 text-carbon-60" />
              <span>{climaticEventsData.totalEvents} Verified Historical Events (2000–2026)</span>
            </span>
          )}
        </div>

        {/* Highlighted Hazard & Peak Severity Occurrence Date Banner */}
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-amber-500 text-carbon-black font-black">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <div className="text-carbon-60 font-semibold uppercase tracking-wider text-xs">Peak Severity Occurrence Date</div>
              <div className="text-carbon-black font-black text-sm sm:text-base flex items-center gap-2">
                <span>{peakSeverityInfo.peakDate}</span>
                <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-black">
                  {Math.round(peakSeverityInfo.peakScore * 100)}% Severity
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:border-l sm:border-amber-200/80 sm:pl-6">
            <div>
              <div className="text-carbon-60 font-semibold uppercase tracking-wider text-xs">Highlighted Hazard</div>
              <div className="text-red-700 font-black uppercase tracking-wider text-sm">{peakSeverityInfo.hazard}</div>
            </div>
            <div>
              <div className="text-carbon-60 font-semibold uppercase tracking-wider text-xs">Model Confidence</div>
              <div className="text-carbon-black font-extrabold text-sm">{Math.round(peakSeverityInfo.confidence * 100)}%</div>
            </div>
          </div>
        </div>

        {/* Consolidated Metadata Block (Two-Column Layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-carbon-05 border border-carbon-20/90 p-4 text-sm">
          {/* Column 1: Hazard Sub-type & Regional Ingestion */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-carbon-60 font-medium">Hazard Category:</span>
              <strong className="font-bold text-carbon-90">{data.hazardType}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-carbon-60 font-medium">Administrative Division:</span>
              <strong className="font-bold text-carbon-90">{data.division} Division</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-carbon-60 font-medium">Specific Phenomenon:</span>
              <strong className="font-bold text-carbon-90">{data.hazardSubtype}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-carbon-60 font-medium">Ingestion Telemetry Station:</span>
              <strong className="font-mono font-bold text-carbon-90">{data.physicalSensorMetrics.sensorStationName}</strong>
            </div>
          </div>

          {/* Column 2: Geospatial Center, Elevation & Live Telemetry Link */}
          <div className="space-y-1.5 sm:pl-4 sm:border-l sm:border-carbon-20 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-carbon-60 font-medium">Geospatial Datum:</span>
                <span className="font-mono font-bold text-carbon-90">{district.lat.toFixed(4)}°N, {district.lng.toFixed(4)}°E</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-carbon-60 font-medium">Surface Elevation Datum:</span>
                <span className="font-mono font-bold text-carbon-90">{data.elevationMeters} m MSL</span>
              </div>
              {/* `flex-wrap` + `break-all`: the printed brief carries the full URL, and on a
                  375px viewport the label and the unbroken URL cannot share a line — this row was
                  the 20px of document-level horizontal overflow the E2E suite caught on
                  /forecast/district/dhaka. The URL must stay readable, so it wraps rather than
                  being truncated. */}
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-carbon-60 font-medium">Interactive Dashboard:</span>
                <a
                  href={`https://www.hazardnet.live/forecast/district/${districtId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:text-blue-900 font-bold inline-flex items-center gap-1 underline min-w-0 break-all"
                >
                  <span>www.hazardnet.live/forecast/district/{districtId}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>

            <div className="pt-2 border-t border-carbon-20 flex items-center justify-between">
              <span className="text-[8pt] text-carbon-60 font-mono">Real-time Mobile Telemetry Feed:</span>
              <PrintQrCode
                url={`https://www.hazardnet.live/forecast/district/${districtId}`}
                districtOrSector={data.districtName}
                title="Live Field Telemetry"
                size={42}
              />
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
