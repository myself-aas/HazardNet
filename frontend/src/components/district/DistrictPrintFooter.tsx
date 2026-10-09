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
      {/* PRINT-ONLY FIXED RUNNING FOOTER WITH DYNAMIC CSS PAGE NUMBERING */}
      <footer className="print-only print-page-footer py-1 text-xs">
        <div className="flex items-center justify-between w-full text-xs">
          <span>HazardNet • District brief • not an official warning</span>
          <span>DISTRICT: {data.districtName.toUpperCase()} ({data.division.toUpperCase()} DIV)</span>
          <span className="print-page-number font-mono"></span>
        </div>
      </footer>

    </>
  );
};
