import React, { createContext, useContext } from 'react';
import type { GranularDisasterData, UpazilaImpact } from '../../data/disasterDetails';
import type { DistrictData } from '../../data/bangladeshDistricts';
import type { ForecastRow } from '../../lib/forecasts';
import type { DistrictEventsResponse } from '../../lib/eventsClient';
import type { RiskStyles } from './districtBriefUtils';

export interface PeakSeverityInfo {
  peakDate: string;
  peakScore: number;
  hazard: string;
  physicsSeverity?: number;
  modelSeverity?: number;
  confidence: number;
}

export interface DistrictBriefContextValue {
  districtId: string;
  data: GranularDisasterData;
  district: DistrictData;
  climaticEventsData: DistrictEventsResponse | null;
  peakSeverityInfo: PeakSeverityInfo;
  riskStyles: RiskStyles;
  navigate: (to: string) => void;
  saved: boolean;
  copiedAlert: boolean;
  districtDropdownOpen: boolean;
  searchDistrict: string;
  filteredDistricts: DistrictData[];
  setDistrictDropdownOpen: (open: boolean) => void;
  setSearchDistrict: (value: string) => void;
  handleToggleSave: () => void;
  handleShareAlert: () => void;
  handlePrintBrief: () => void;
  handleDownloadReport: () => void;
  loadingForecastTable: boolean;
  chartData: Array<{ date: string; physicsSeverity: number; modelSeverity: number; confidence: number }>;
  activeTableHorizon: '7_days' | '15_days';
  setActiveTableHorizon: (horizon: '7_days' | '15_days') => void;
  districtForecasts7D: ForecastRow[];
  districtForecasts15D: ForecastRow[];
  handleDownloadTableCsv: () => void;
  scrollToSection: (id: string) => void;
  activeSection: string;
  processedUpazilas: UpazilaImpact[];
  upazilaViewMode: 'cards' | 'table';
  setUpazilaViewMode: (mode: 'cards' | 'table') => void;
  upazilaSearch: string;
  setUpazilaSearch: (value: string) => void;
  upazilaFilter: 'All' | 'Critically Inundated' | 'High Risk' | 'Moderate Impact' | 'Alert Mode';
  setUpazilaFilter: (value: 'All' | 'Critically Inundated' | 'High Risk' | 'Moderate Impact' | 'Alert Mode') => void;
  upazilaSortBy: 'severity' | 'households' | 'name';
  setUpazilaSortBy: (value: 'severity' | 'households' | 'name') => void;
  trendViewMode: 'all' | 'primary' | 'comparison';
  setTrendViewMode: (mode: 'all' | 'primary' | 'comparison') => void;
  hazardTrendData: Array<Record<string, string | number>>;
  showLiveAiAdvisory: boolean;
  setShowLiveAiAdvisory: (value: boolean) => void;
  weather: any;
  dispatchStatus: 'idle' | 'broadcasting' | 'dispatched';
  handleTriggerDispatch: () => void;
  dispatchLogs: string[];
  eventHazardFilter: string;
  setEventHazardFilter: (value: string) => void;
  expandedHistoricalEventId: string | null;
  setExpandedHistoricalEventId: (id: string | null) => void;
}

const DistrictBriefContext = createContext<DistrictBriefContextValue | null>(null);

export const DistrictBriefProvider = DistrictBriefContext.Provider;

export function useDistrictBrief(): DistrictBriefContextValue {
  const value = useContext(DistrictBriefContext);
  if (!value) {
    throw new Error('useDistrictBrief must be used inside DistrictBriefProvider');
  }
  return value;
}
