import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Download, Share2, Printer, Bookmark, BookmarkCheck, Search, MapPin, ChevronDown,
} from 'lucide-react';
import { PdfExportButton } from '../PdfExportButton';

import { useDistrictBrief } from './DistrictBriefContext';


/** Top utility bar: district switcher and print/export. */
export const DistrictBriefActions: React.FC = () => {
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
      {/* 1. TOP UTILITY HEADER / ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 screen-only">
        {/* Left: Back to National Overview + District Switcher Dropdown */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="inline-flex min-h-[44px] items-center gap-2 px-3 py-2 bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-05 hover:text-carbon-90 text-sm font-semibold cursor-pointer group touch-manipulation"
            title="Return to Bangladesh National Overview Map"
          >
            <ArrowLeft className="w-4 h-4 text-carbon-60 group-hover:-translate-x-0.5 transition-transform" />
            <span>National Map</span>
          </button>

          {/* Quick District Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDistrictDropdownOpen(!districtDropdownOpen)}
              className="inline-flex min-h-[44px] items-center gap-2.5 px-3 py-2 bg-white border border-carbon-20 text-carbon-90 hover:border-carbon-30 text-sm font-semibold cursor-pointer touch-manipulation"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>Switch District: <strong className="text-carbon-black">{data.districtName}</strong></span>
              <ChevronDown className={`w-3.5 h-3.5 text-carbon-60 transition-transform ${districtDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {districtDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white border border-carbon-20 z-[var(--z-overlay)] p-3 space-y-2"
                >
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-carbon-60" />
                    <input
                      type="text"
                      placeholder="Search 64 districts or division..."
                      value={searchDistrict}
                      onChange={(e) => setSearchDistrict(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-carbon-05 border border-carbon-20 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                    {filteredDistricts.length === 0 ? (
                      <div className="p-3 text-center text-xs text-carbon-60">No districts match search</div>
                    ) : (
                      filteredDistricts.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setDistrictDropdownOpen(false);
                            setSearchDistrict('');
                            navigate(`/forecast/district/${d.id}`);
                          }}
                          className={`w-full flex items-center justify-between p-2 text-xs transition-colors cursor-pointer ${
                            d.id === districtId ? 'bg-amber-50 text-amber-950 font-bold' : 'hover:bg-carbon-05 text-carbon-70'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{d.name}</span>
                            <span className="text-xs text-carbon-60">({d.division})</span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-sm font-mono font-bold ${
                            d.risk === 'High' ? 'bg-rose-100 text-rose-700' :
                            d.risk === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                            'bg-carbon-10 text-carbon-80'
                          }`}>
                            {(d.severity * 100).toFixed(0)}%
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Executive Action Controls.
            `flex-wrap`: bookmark + share + PDF + JSON is ~357px of controls, which is a 37px
            document overflow at 320px if they are forced onto one line. They wrap instead. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Bookmark / Watchlist */}
          <button
            onClick={handleToggleSave}
            title={saved ? 'District Saved to Watchlist' : 'Add District to Watchlist'}
            className={`min-h-[44px] min-w-[44px] border flex items-center justify-center cursor-pointer touch-manipulation ${
              saved
                ? 'bg-carbon-05 border-carbon-20 text-carbon-90'
                : 'bg-white border-carbon-20 text-carbon-60 hover:bg-carbon-05 hover:text-carbon-90'
            }`}
          >
            {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>

          {/* Share Intelligence Briefing */}
          <button
            onClick={handleShareAlert}
            title="Copy Executive Intelligence Briefing"
            className="inline-flex min-h-[44px] items-center gap-2 px-3 py-2 bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-05 hover:text-carbon-90 text-sm font-semibold cursor-pointer touch-manipulation"
          >
            <Share2 className="w-4 h-4 text-blue-600" />
            <span className="hidden md:inline">{copiedAlert ? 'Copied Brief' : 'Share Brief'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintBrief}
            title="Print this district brief (HTML print is the primary export)"
            className="inline-flex min-h-[44px] items-center gap-2 px-3 py-2 bg-nasa-blue text-white text-sm font-semibold cursor-pointer touch-manipulation"
          >
            <Printer className="w-4 h-4" />
            <span>Print brief</span>
          </button>

          {/* Optional PDF filename configuration (secondary to HTML print) */}
          <PdfExportButton
            elementId="district-detail-container"
            filename={`HazardNet_${data.districtName}_{hazard}_{docType}_{date}.pdf`}
            filenameTemplate="HazardNet_{docType}_{region}_{date}.pdf"
            regionName={data.districtName}
            districtName={data.districtName}
            hazardType={data.hazardType}
            documentType="District Intelligence Brief"
            title="Export PDF Brief"
            filenameContext={{
              region: data.districtName,
              district: data.districtName,
              division: data.division,
              hazard: data.hazardType,
              hazardType: data.hazardType,
              docType: 'District_Brief',
              documentType: 'District Intelligence Brief',
            }}
          />

          {/* Download Full JSON Telemetry */}
          <button
            onClick={handleDownloadReport}
            title="Download Raw Machine-Readable JSON Telemetry"
            className="inline-flex min-h-[44px] items-center gap-2 px-3.5 py-2 bg-carbon-90 hover:bg-carbon-80 text-white text-sm font-semibold cursor-pointer touch-manipulation"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Export Data</span>
          </button>
        </div>
      </div>
    </>
  );
};
