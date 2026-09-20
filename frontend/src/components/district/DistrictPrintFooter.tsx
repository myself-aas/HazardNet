import React from 'react';

import { useDistrictBrief } from './DistrictBriefContext';


/** Print-only running footer. */
export const DistrictPrintFooter: React.FC = () => {
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
      {/* PRINT-ONLY FIXED RUNNING FOOTER WITH DYNAMIC CSS PAGE NUMBERING */}
      <footer className="print-only print-page-footer py-1 text-xs">
        <div className="flex items-center justify-between w-full text-xs">
          <span>HAZARDNET • SOD 2019 INTELLIGENCE BRIEF</span>
          <span>DISTRICT: {data.districtName.toUpperCase()} ({data.division.toUpperCase()} DIV)</span>
          <span className="print-page-number font-mono"></span>
        </div>
      </footer>

    </>
  );
};
