import React, { createContext, useContext } from 'react';
import type { DistrictData } from '../../data/bangladeshDistricts';
import type { ForecastRow } from '../../lib/forecasts';
import type { DistrictEventsResponse } from '../../lib/eventsClient';

/**
 * Identity fields only. Every other figure on the district brief comes from the
 * published forecast record (`peakSeverityInfo`, the forecast rows) or from a live
 * API (weather, historical events). Exposure figures are not published, so they
 * are never carried in this context.
 */
export interface DistrictBriefIdentity {
  districtId: string;
  districtName: string;
  division: string;
}

export interface PeakSeverityInfo {
  peakDate: string;
  peakScore: number;
  hazard: string;
  physicsSeverity?: number;
  modelSeverity?: number;
  confidence: number;
}

export interface ForecastRunMetadata {
  predictionDate: string | null;
  source: string | null;
  ingestionTimestamp: string | null;
}

export interface DistrictBriefContextValue {
  districtId: string;
  data: DistrictBriefIdentity;
  district: DistrictData;
  metadata: ForecastRunMetadata;
  climaticEventsData: DistrictEventsResponse | null;
  /** Null when the run did not cover this district. */
  peakSeverityInfo: PeakSeverityInfo | null;
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
  loadingForecastTable: boolean;
  chartData: Array<{ date: string; physicsSeverity: number; modelSeverity: number; confidence: number }>;
  activeTableHorizon: '7_days' | '15_days';
  setActiveTableHorizon: (horizon: '7_days' | '15_days') => void;
  districtForecasts7D: ForecastRow[];
  districtForecasts15D: ForecastRow[];
  handleDownloadTableCsv: () => void;
  scrollToSection: (id: string) => void;
  activeSection: string;
  trendViewMode: 'all' | 'primary' | 'comparison';
  setTrendViewMode: (mode: 'all' | 'primary' | 'comparison') => void;
  hazardTrendData: Array<Record<string, string | number>>;
  showLiveAiAdvisory: boolean;
  setShowLiveAiAdvisory: (value: boolean) => void;
  weather: any;
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
