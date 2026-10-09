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
    metadata,
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
      {/* CONSOLIDATED OFFICIAL DISTRICT DISASTER INTELLIGENCE HEADER
          A hairline card like every other surface on the brief. The 2px carbon-90
          masthead rule it used to carry clashes with the rounded corners the
          Cupertino Precision sweep added (the detector's `border-accent-on-rounded`),
          and DESIGN.md §Elevation & Depth puts hierarchy in "optical hairline
          borders", not heavy rules. The printed directive keeps its masthead rule:
          see PrintPreviewModal.tsx. */}
      <header className="district-brief-header mb-6 pb-4 bg-white p-4 sm:p-6 border border-carbon-20 rounded-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon-20 pb-2 text-xs font-mono text-carbon-70 leading-tight min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-carbon-90 uppercase tracking-wider">HazardNet</span>
            <span className="text-carbon-60">•</span>
            <span className="font-semibold text-carbon-60">District brief</span>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Forecast run: <strong className="text-carbon-90 font-bold">{metadata.predictionDate ?? 'not available'}</strong>
            </span>
          </div>
        </div>

        {/* Header Title with Prominent Risk Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-ap-lead sm:text-ap-display-md font-bold text-carbon-90 tracking-tight leading-[1.2]">
              {data.districtName} District
            </h1>
          </div>

          <div className="shrink-0">
            {peakSeverityInfo ? (
              <span className="inline-flex min-h-6 items-center gap-2 px-3 py-1 rounded-control text-xs font-mono font-bold bg-carbon-10 text-carbon-90 border border-carbon-30">
                Peak published severity {Math.round(peakSeverityInfo.peakScore * 100)}%
              </span>
            ) : (
              <span className="inline-flex min-h-6 items-center gap-2 px-3 py-1 rounded-control text-xs font-mono font-bold bg-carbon-05 text-carbon-70 border border-carbon-20">
                Not in the current forecast run
              </span>
            )}
          </div>
        </div>

        {/* Published alert for this district (Phase 5). Sits directly under the page
            title because "is there an alert for me here" is the first question, and
            an absent strip must not read as an absent hazard. */}
        <DistrictAlertStrip
          district={district.id || data.districtName || district.name}
        />

        {/* Quick Navigation to Parent Division & Primary Hazard Dashboards */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            to={`/divisions/${(climaticEventsData?.division || data.division).toLowerCase()}`}
            className="rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:text-blue-800 transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{climaticEventsData?.division || data.division} Division Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <Link
            to={`/hazards/${(climaticEventsData?.primaryHazard || peakSeverityInfo?.hazard || 'flood').toLowerCase().replace(/\s+/g, '-')}`}
            className="rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 hover:text-amber-900 transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{climaticEventsData?.primaryHazard || peakSeverityInfo?.hazard || 'Hazard'} analytics</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          {climaticEventsData && (
            <span className="rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-carbon-10 text-carbon-70 border border-carbon-20">
              <History className="w-3.5 h-3.5 text-carbon-60" />
              <span>{climaticEventsData.totalEvents} recorded historical events (2000–2026)</span>
            </span>
          )}
        </div>

        {peakSeverityInfo ? (
          <div className="rounded-xl bg-carbon-05 border border-carbon-20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-carbon-60 font-semibold uppercase tracking-wider text-xs">Peak date in the published record</div>
              <div className="text-carbon-90 font-bold text-sm sm:text-base">
                <span>{peakSeverityInfo.peakDate}</span>
                <span className="ml-2 font-mono">{Math.round(peakSeverityInfo.peakScore * 100)}% severity</span>
              </div>
            </div>
            <div className="flex items-center gap-6 sm:border-l sm:border-carbon-20 sm:pl-6">
              <div>
                <div className="text-carbon-60 font-semibold uppercase tracking-wider text-xs">Hazard</div>
                <div className="text-carbon-90 font-bold text-sm">{peakSeverityInfo.hazard}</div>
              </div>
              <div>
                <div className="text-carbon-60 font-semibold uppercase tracking-wider text-xs">Confidence score (uncalibrated)</div>
                <div className="text-carbon-90 font-bold text-sm">{Math.round(peakSeverityInfo.confidence * 100)}%</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-carbon-05 border border-carbon-20 p-4 text-sm text-carbon-70">
            This district is not in the current forecast run. No severity, date or confidence is shown, and the absence is not a zero.
          </p>
        )}

        {/* Consolidated Metadata Block (Two-Column Layout) */}
        <div className="rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 bg-carbon-05 border border-carbon-20/90 p-4 text-sm">
          {/* Column 1: Hazard Sub-type & Regional Ingestion */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-carbon-60 font-medium">Hazard Category:</span>
              <strong className="font-bold text-carbon-90">{peakSeverityInfo?.hazard ?? 'Not in current run'}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-carbon-60 font-medium">Administrative Division:</span>
              <strong className="font-bold text-carbon-90">{data.division} Division</strong>
            </div>
          </div>

          {/* Column 2: Geospatial Center, Elevation & Live Telemetry Link */}
          <div className="space-y-1.5 sm:pl-4 sm:border-l sm:border-carbon-20 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-carbon-60 font-medium">Geospatial Datum:</span>
                <span className="font-mono font-bold text-carbon-90">
                  {district.lat.toFixed(4)}°N, {district.lng.toFixed(4)}°E
                </span>
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
              <span className="text-[8pt] text-carbon-60 font-mono">Open on a phone:</span>
              <PrintQrCode
                url={`https://www.hazardnet.live/forecast/district/${districtId}`}
                districtOrSector={data.districtName}
                title="District page QR code"
                size={42}
              />
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
