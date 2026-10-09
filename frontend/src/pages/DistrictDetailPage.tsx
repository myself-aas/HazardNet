import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { ALL_64_DISTRICTS, getDistrictById } from '../data/bangladeshDistricts';
import { fetchForecastMetadata, fetchStaticForecastSnapshot, ForecastRow, canonicalKey } from '../lib/forecasts';
import { useWeather } from '../hooks/useWeather';
import { fetchDistrictEvents, DistrictEventsResponse } from '../lib/eventsClient';
import { DistrictBriefProvider } from '../components/district/DistrictBriefContext';
import type { DistrictBriefContextValue, ForecastRunMetadata, PeakSeverityInfo } from '../components/district/DistrictBriefContext';
import { DistrictBriefActions } from '../components/district/DistrictBriefActions';
import { DistrictBriefHeader } from '../components/district/DistrictBriefHeader';
import { DistrictOutlookCard } from '../components/district/DistrictOutlookCard';
import { DistrictForecastRecords } from '../components/district/DistrictForecastRecords';
import { DistrictBriefBody } from '../components/district/DistrictBriefBody';
import { DistrictPrintFooter } from '../components/district/DistrictPrintFooter';

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const DistrictDetailPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const districtId = id || 'kurigram';
  const district = useMemo(() => getDistrictById(districtId), [districtId]);

  const [metadata, setMetadata] = useState<ForecastRunMetadata>({
    predictionDate: null,
    source: null,
    ingestionTimestamp: null,
  });

  useEffect(() => {
    let cancelled = false;
    const refreshMetadata = async () => {
      try {
        const m = await fetchForecastMetadata();
        if (cancelled) return;
        setMetadata({ predictionDate: m.predictionDate, source: m.source, ingestionTimestamp: m.ingestionTimestamp });
      } catch {
        // Never revive stale dates when the live source is unavailable.
        if (!cancelled) setMetadata({ predictionDate: null, source: null, ingestionTimestamp: null });
      }
    };
    refreshMetadata();
    const interval = window.setInterval(refreshMetadata, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Live weather for the district centroid (cached, 15-minute refresh).
  const weather = useWeather(district?.lat, district?.lng, { forecast_days: 16, timezone: 'Asia/Dhaka' });

  const [districtForecasts7D, setDistrictForecasts7D] = useState<ForecastRow[]>([]);
  const [districtForecasts15D, setDistrictForecasts15D] = useState<ForecastRow[]>([]);
  const [loadingForecastTable, setLoadingForecastTable] = useState<boolean>(true);
  const [activeTableHorizon, setActiveTableHorizon] = useState<'7_days' | '15_days'>('7_days');

  useEffect(() => {
    if (!district) return;
    let isMounted = true;
    setLoadingForecastTable(true);
    Promise.all([
      fetchStaticForecastSnapshot('7_days').catch(() => []),
      fetchStaticForecastSnapshot('15_days').catch(() => []),
    ]).then(([rows7, rows15]) => {
      if (!isMounted) return;
      const matchName = district.name.toLowerCase();
      const filterDistrict = (r: ForecastRow) =>
        r.district_name.toLowerCase() === matchName || canonicalKey(r.district_name) === canonicalKey(district.name);
      const district7D = rows7.filter(filterDistrict);
      const district15D = rows15.filter(filterDistrict);
      setDistrictForecasts7D(district7D);
      setDistrictForecasts15D(district15D);
      // The pipeline does not always emit both horizons for every district, so open the horizon that has rows.
      setActiveTableHorizon((current) => {
        const rowsFor = (h: '7_days' | '15_days') => (h === '7_days' ? district7D : district15D);
        if (rowsFor(current).length > 0) return current;
        const other = current === '7_days' ? '15_days' : '7_days';
        return rowsFor(other).length > 0 ? other : current;
      });
      setLoadingForecastTable(false);
    }).catch(() => {
      if (isMounted) setLoadingForecastTable(false);
    });
    return () => {
      isMounted = false;
    };
  }, [district]);

  const [climaticEventsData, setClimaticEventsData] = useState<DistrictEventsResponse | null>(null);
  const [eventHazardFilter, setEventHazardFilter] = useState<string>('all');
  const [expandedHistoricalEventId, setExpandedHistoricalEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!district) return;
    let isMounted = true;
    fetchDistrictEvents(district.name)
      .then((res) => {
        if (isMounted) setClimaticEventsData(res);
      })
      .catch((err) => {
        console.warn('Failed to load district historical events:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [district]);

  // Peak of the published rows for this district. Null when the run did not cover it.
  const peakSeverityInfo: PeakSeverityInfo | null = useMemo(() => {
    const all = [...districtForecasts7D, ...districtForecasts15D];
    if (all.length === 0) return null;
    const maxRow = all.reduce((max, r) => (r.severity_score > max.severity_score ? r : max), all[0]);
    return {
      peakDate: maxRow.target_date,
      peakScore: maxRow.severity_score,
      hazard: maxRow.hazard_type,
      physicsSeverity: maxRow.physics_severity ?? maxRow.severity_score,
      modelSeverity: maxRow.model_severity ?? maxRow.severity_score,
      confidence: maxRow.confidence,
    };
  }, [districtForecasts7D, districtForecasts15D]);

  const chartData = useMemo(() => {
    const rows = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
    return rows.map((r) => ({
      date: r.target_date,
      physicsSeverity: Math.round((r.physics_severity ?? r.severity_score) * 100),
      modelSeverity: Math.round((r.model_severity ?? r.severity_score) * 100),
      confidence: Math.round(r.confidence * 100),
    }));
  }, [districtForecasts7D, districtForecasts15D, activeTableHorizon]);

  const [copiedAlert, setCopiedAlert] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchDistrict, setSearchDistrict] = useState('');
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('sec-exposure');
  const [showLiveAiAdvisory, setShowLiveAiAdvisory] = useState<boolean>(false);
  const [trendViewMode, setTrendViewMode] = useState<'all' | 'primary' | 'comparison'>('all');

  const filteredDistricts = useMemo(() => {
    if (!searchDistrict.trim()) return ALL_64_DISTRICTS;
    const q = searchDistrict.toLowerCase();
    return ALL_64_DISTRICTS.filter(
      (d) => d.name.toLowerCase().includes(q) || d.division.toLowerCase().includes(q) || d.hazardType.toLowerCase().includes(q),
    );
  }, [searchDistrict]);

  // 7-day series from the stored outlook only.
  const hazardTrendData = useMemo(() => {
    const rows = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
    if (rows.length === 0 || !peakSeverityInfo) return [];
    return rows.map((r) => ({
      day: r.target_date,
      severity: Math.round((r.severity_score ?? 0) * 100),
    }));
  }, [districtForecasts7D, districtForecasts15D, activeTableHorizon, peakSeverityInfo]);

  const handlePrintBrief = () => window.print();

  const handleDownloadTableCsv = () => {
    const rowsToExport = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
    if (!district || rowsToExport.length === 0) {
      toast.error('No forecast records available to export for this horizon.');
      return;
    }
    const headers = [
      'District ID', 'District Name', 'Horizon', 'Target Date', 'Prediction Date', 'Hazard Type',
      'Physics Severity', 'CNN Model Severity', 'Confidence', 'Min Temp (°C)', 'Max Temp (°C)',
      'Precipitation (mm)', 'Wind Max (km/h)',
    ];
    const csvRows = [headers.join(',')];
    for (const r of rowsToExport) {
      csvRows.push([
        r.district_id, r.district_name, r.horizon || activeTableHorizon, r.target_date, r.prediction_date,
        r.hazard_type, r.physics_severity ?? r.severity_score, r.model_severity ?? r.severity_score,
        r.confidence, r.temperature_min, r.temperature_max, r.precipitation_mm, r.wind_max_kmh,
      ].map(csvCell).join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `hazardnet_${district.id}_${activeTableHorizon}_forecasts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rowsToExport.length} forecast records (${activeTableHorizon === '7_days' ? '7-day' : '15-day'}).`);
  };

  const handleShareAlert = () => {
    if (!district || !navigator.clipboard) return;
    const lines = [
      `HazardNet district brief: ${district.name} (${district.division} Division)`,
      peakSeverityInfo
        ? `Peak published severity: ${Math.round(peakSeverityInfo.peakScore * 100)}% (${peakSeverityInfo.hazard}, ${peakSeverityInfo.peakDate})`
        : 'Peak published severity: not available for this district in the current run',
      `Forecast run: ${metadata.predictionDate ?? 'not available'}`,
      '',
      'HazardNet is not an official warning service. Official warnings: BMD and FFWC. For emergencies, call 999.',
      `${window.location.origin}/forecast/district/${district.id}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAlert(true);
    toast.success('District summary copied');
    setTimeout(() => setCopiedAlert(false), 2500);
  };

  const handleToggleSave = () => {
    const nextSaved = !saved;
    setSaved(nextSaved);
    if (!district) return;
    if (nextSaved) toast.success(`Saved ${district.name} to your districts`);
    else toast(`Removed ${district.name} from your districts`);
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      const y = element.getBoundingClientRect().top + window.pageYOffset - 120;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  if (!district) {
    return (
      <div className="w-full max-w-3xl mx-auto py-16 px-4 space-y-3">
        <h1 className="text-2xl font-bold text-carbon-90">District not found</h1>
        <p className="text-sm text-carbon-60">
          “{districtId}” is not one of the 64 districts HazardNet covers.
        </p>
        <button onClick={() => navigate('/live')} className="text-sm font-semibold text-ap-link underline">
          Back to the live map
        </button>
      </div>
    );
  }

  const brief: DistrictBriefContextValue = {
    districtId,
    data: { districtId: district.id, districtName: district.name, division: district.division },
    district,
    metadata,
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
  };

  return (
    <DistrictBriefProvider value={brief}>
      <div id="district-detail-container" className="w-full max-w-7xl mx-auto min-w-0 overflow-x-hidden space-y-8 font-sans pb-16">
        <DistrictBriefActions />
        <DistrictBriefHeader />
        <DistrictOutlookCard />
        <DistrictForecastRecords />
        <DistrictBriefBody />
        <DistrictPrintFooter />
      </div>
    </DistrictBriefProvider>
  );
};

export default DistrictDetailPage;
