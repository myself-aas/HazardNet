import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { getGranularDisasterData, GranularDisasterData } from '../data/disasterDetails';
import { ALL_64_DISTRICTS, getDistrictById } from '../data/bangladeshDistricts';
import { fetchForecastMetadata, fetchStaticForecastSnapshot, ForecastRow, canonicalKey } from '../lib/forecasts';
import { useWeather } from '../hooks/useWeather';
import { fetchDistrictEvents, DistrictEventsResponse } from '../lib/eventsClient';
import { useI18n } from '../hooks/useI18n';
import { getRiskColor } from '../components/district/districtBriefUtils';
import { DistrictBriefProvider } from '../components/district/DistrictBriefContext';
import { DistrictBriefActions } from '../components/district/DistrictBriefActions';
import { DistrictBriefHeader } from '../components/district/DistrictBriefHeader';
import { DistrictOutlookCard } from '../components/district/DistrictOutlookCard';
import { DistrictForecastRecords } from '../components/district/DistrictForecastRecords';
import { DistrictBriefBody } from '../components/district/DistrictBriefBody';
import { DistrictPrintFooter } from '../components/district/DistrictPrintFooter';

export const DistrictDetailPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { formatDate } = useI18n();
  const districtId = id || 'kurigram';

  const [livePredictionDate, setLivePredictionDate] = useState<string | null>(null);
  const [liveSource, setLiveSource] = useState<string | null>(null);
  const [ingestionTimestamp, setIngestionTimestamp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refreshMetadata = async () => {
      try {
        const metadata = await fetchForecastMetadata();
        if (cancelled) return;
        setLivePredictionDate(metadata.predictionDate);
        setLiveSource(metadata.source);
        setIngestionTimestamp(metadata.ingestionTimestamp);
      } catch {
        // Do not revive the static July dates when the live source is unavailable.
        if (!cancelled) {
          setLivePredictionDate(null);
          setLiveSource(null);
          setIngestionTimestamp(null);
        }
      }
    };

    refreshMetadata();
    const interval = window.setInterval(refreshMetadata, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const data: GranularDisasterData = useMemo(() => {
    const fallback = getGranularDisasterData(districtId);
    if (!livePredictionDate) {
      return {
        ...fallback,
        peakImpactWindow: 'Live forecast data unavailable',
        incidentDate: 'Live forecast data unavailable',
        lastSatelliteUpdate: 'Awaiting forecast pipeline ingestion',
      };
    }
    const prediction = new Date(`${livePredictionDate}T00:00:00Z`);
    const end = new Date(prediction.getTime() + 6 * 86_400_000);
    const endIso = end.toISOString().slice(0, 10);
    
    const formattedIngestionTime = ingestionTimestamp
      ? (() => {
          const ingestionDate = new Date(ingestionTimestamp);
          if (Number.isNaN(ingestionDate.getTime())) return 'Unavailable';
          const dateStr = ingestionDate.toLocaleDateString('en-CA', {
            timeZone: 'Europe/London',
          });
          const timeStr = ingestionDate.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/London',
          });
          const tzAbbr = ingestionDate.toLocaleString('en-GB', {
            timeZone: 'Europe/London',
            timeZoneName: 'short',
          }).split(' ').pop();
          return `${dateStr} ${timeStr} ${tzAbbr || ''}`.trim();
        })()
      : 'Awaiting forecast ingestion';
    
    return {
      ...fallback,
      incidentDate: formattedIngestionTime,
      peakImpactWindow: `${formatDate(livePredictionDate)} - ${formatDate(endIso)}`,
      lastSatelliteUpdate: `${liveSource ?? 'Latest forecast'} • ${livePredictionDate}`,
    };
  }, [districtId, livePredictionDate, liveSource, ingestionTimestamp, formatDate]);
  const district = useMemo(() => getDistrictById(districtId) || ALL_64_DISTRICTS[0], [districtId]);

  // Live Open-Meteo weather (current + 48h hourly + 16-day daily) for this
  // district's centroid. The hook handles caching + 15-min refresh.
  const weather = useWeather(district?.lat, district?.lng, {
    forecast_days: 16,
    timezone: 'Asia/Dhaka',
  });

  // District CSV Forecast Data for 7 and 15 Days (daily pipeline)
  const [districtForecasts7D, setDistrictForecasts7D] = useState<ForecastRow[]>([]);
  const [districtForecasts15D, setDistrictForecasts15D] = useState<ForecastRow[]>([]);
  const [loadingForecastTable, setLoadingForecastTable] = useState<boolean>(true);
  const [activeTableHorizon, setActiveTableHorizon] = useState<'7_days' | '15_days'>('7_days');

  useEffect(() => {
    let isMounted = true;
    setLoadingForecastTable(true);
    Promise.all([
      fetchStaticForecastSnapshot('7_days').catch(() => []),
      fetchStaticForecastSnapshot('15_days').catch(() => []),
    ]).then(([rows7, rows15]) => {
      if (!isMounted) return;
      const matchName = district.name.toLowerCase();
      const filterDistrict = (r: ForecastRow) =>
        r.district_name.toLowerCase() === matchName ||
        canonicalKey(r.district_name) === canonicalKey(district.name);

      const district7D = rows7.filter(filterDistrict);
      const district15D = rows15.filter(filterDistrict);
      setDistrictForecasts7D(district7D);
      setDistrictForecasts15D(district15D);
      // The pipeline does not always emit BOTH horizons for every district
      // (a GEE/inference hiccup can drop one), so don't open the section on
      // an empty tab when the other horizon has records: 2026-09-16's run
      // covered Mymensingh only in the 15-day CSV, and the page opened on
      // "7-Day Forecast (0) — no forecast records found" anyway.
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
  }, [district.name]);

  // Real Historical Events Dataset (2000-2026) for this specific District
  const [climaticEventsData, setClimaticEventsData] = useState<DistrictEventsResponse | null>(null);
  const [loadingClimaticEvents, setLoadingClimaticEvents] = useState<boolean>(true);
  const [eventHazardFilter, setEventHazardFilter] = useState<string>('all');
  const [expandedHistoricalEventId, setExpandedHistoricalEventId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoadingClimaticEvents(true);
    fetchDistrictEvents(district.name || districtId)
      .then((res) => {
        if (isMounted) {
          setClimaticEventsData(res);
          setLoadingClimaticEvents(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to load district historical events:', err);
        if (isMounted) setLoadingClimaticEvents(false);
      });
    return () => {
      isMounted = false;
    };
  }, [district.name, districtId]);

  // Find possible highest severity occurrence date across 7 and 15 day rows
  const peakSeverityInfo = useMemo(() => {
    const all = [...districtForecasts7D, ...districtForecasts15D];
    if (all.length === 0) return { peakDate: 'N/A', peakScore: district.severity, hazard: district.hazardType, confidence: 0.88 };
    const maxRow = all.reduce((max, r) => (r.severity_score > max.severity_score ? r : max), all[0]);
    return {
      peakDate: maxRow.target_date,
      peakScore: maxRow.severity_score,
      hazard: maxRow.hazard_type,
      physicsSeverity: maxRow.physics_severity ?? maxRow.severity_score,
      modelSeverity: maxRow.model_severity ?? maxRow.severity_score,
      confidence: maxRow.confidence,
    };
  }, [districtForecasts7D, districtForecasts15D, district]);

  const chartData = useMemo(() => {
    const rows = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
    return rows.map((r) => ({
      date: r.target_date,
      physicsSeverity: Math.round((r.physics_severity ?? r.severity_score) * 100),
      modelSeverity: Math.round((r.model_severity ?? r.severity_score) * 100),
      confidence: Math.round(r.confidence * 100),
    }));
  }, [districtForecasts7D, districtForecasts15D, activeTableHorizon]);

  // UI States
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchDistrict, setSearchDistrict] = useState('');
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [upazilaSearch, setUpazilaSearch] = useState('');
  const [upazilaFilter, setUpazilaFilter] = useState<'All' | 'Critically Inundated' | 'High Risk' | 'Moderate Impact' | 'Alert Mode'>('All');
  const [upazilaSortBy, setUpazilaSortBy] = useState<'severity' | 'households' | 'name'>('severity');
  const [activeSection, setActiveSection] = useState<string>('sec-impact');
  const [dispatchStatus, setDispatchStatus] = useState<'idle' | 'broadcasting' | 'dispatched'>('idle');
  const [dispatchLogs, setDispatchLogs] = useState<string[]>([]);
  const [showLiveAiAdvisory, setShowLiveAiAdvisory] = useState<boolean>(false);
  const [trendViewMode, setTrendViewMode] = useState<'all' | 'primary' | 'comparison'>('all');
  const [upazilaViewMode, setUpazilaViewMode] = useState<'cards' | 'table'>('cards');

  // District Search Filtering
  const filteredDistricts = useMemo(() => {
    if (!searchDistrict.trim()) return ALL_64_DISTRICTS;
    return ALL_64_DISTRICTS.filter(d => 
      d.name.toLowerCase().includes(searchDistrict.toLowerCase()) ||
      d.division.toLowerCase().includes(searchDistrict.toLowerCase()) ||
      d.hazardType.toLowerCase().includes(searchDistrict.toLowerCase())
    );
  }, [searchDistrict]);

  // Upazila Filtering & Sorting
  const processedUpazilas = useMemo(() => {
    return data.impactedUpazilas
      .filter(up => {
        const matchesQuery = up.name.toLowerCase().includes(upazilaSearch.toLowerCase());
        const matchesFilter = upazilaFilter === 'All' || up.status === upazilaFilter;
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        if (upazilaSortBy === 'severity') return b.severityScore - a.severityScore;
        if (upazilaSortBy === 'households') return b.householdsAffected - a.householdsAffected;
        return a.name.localeCompare(b.name);
      });
  }, [data.impactedUpazilas, upazilaSearch, upazilaFilter, upazilaSortBy]);

  // 7-day hazard series from the stored outlook only. Compound Vulnerability is
  // withheld (UX-11): it is not a registered producer value.
  const hazardTrendData = useMemo(() => {
    const rows = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
    if (rows.length === 0) return [];
    return rows.map((r) => ({
      day: r.target_date,
      [data.hazardType]: Math.round((r.severity_score ?? 0) * 100),
    }));
  }, [data.hazardType, districtForecasts7D, districtForecasts15D, activeTableHorizon]);

  // Actions
  const handleDownloadReport = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HazardNet_District_Intelligence_${data.districtName}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`District telemetry report exported for ${data.districtName}`);
  };

  const handlePrintBrief = () => {
    window.print();
  };

  const handleDownloadTableCsv = () => {
    const rowsToExport = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
    if (rowsToExport.length === 0) {
      toast.error('No forecast records available to export for this horizon.');
      return;
    }
    const headers = [
      'District ID',
      'District Name',
      'Horizon',
      'Target Date',
      'Prediction Date',
      'Hazard Type',
      'Physics Severity',
      'CNN Model Severity',
      'Confidence',
      'Min Temp (°C)',
      'Max Temp (°C)',
      'Precipitation (mm)',
      'Wind Max (km/h)'
    ];
    const csvRows = [headers.join(',')];
    for (const r of rowsToExport) {
      const values = [
        r.district_id,
        `"${r.district_name}"`,
        r.horizon || activeTableHorizon,
        r.target_date,
        r.prediction_date,
        `"${r.hazard_type}"`,
        r.physics_severity ?? r.severity_score,
        r.model_severity ?? r.severity_score,
        r.confidence,
        r.temperature_min ?? '',
        r.temperature_max ?? '',
        r.precipitation_mm ?? '',
        r.wind_max_kmh ?? ''
      ];
      csvRows.push(values.join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `hazardnet_${districtId}_${activeTableHorizon}_forecasts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rowsToExport.length} forecast records to CSV (${activeTableHorizon === '7_days' ? '7-Day' : '15-Day'}).`);
  };

  const handleShareAlert = () => {
    const alertText = `HAZARDNET OFFICIAL DISASTER INTELLIGENCE BRIEF\nDistrict: ${data.districtName} (${data.division} Division)\nHazard: ${data.hazardType} - ${data.hazardSubtype}\nSeverity Index: ${(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}% [${data.modelAssessment.riskCategory} Risk]\nImpact Area: ${data.estimatedImpactAreaKm2.toLocaleString()} km² (${data.impactAreaPercentage}%)\nAffected Population: ${data.affectedPopulation.toLocaleString()} residents\nOperational Shelters: ${data.emergencyResponse.activeShelters} Centers\nStation Telemetry: ${data.physicalSensorMetrics.primaryMetricName}: ${data.physicalSensorMetrics.primaryMetricValue}\n\nGenerated by HazardNet National Early Warning System.`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(alertText);
      setCopiedAlert(true);
      toast.success('Executive intelligence brief copied to clipboard');
      setTimeout(() => setCopiedAlert(false), 2500);
    }
  };

  const handleToggleSave = () => {
    const nextSaved = !saved;
    setSaved(nextSaved);
    if (nextSaved) {
      toast.success(`Pinned ${data.districtName} District to Priority Watchlist`);
    } else {
      toast('Removed from Priority Watchlist');
    }
  };

  const handleTriggerDispatch = () => {
    if (dispatchStatus === 'broadcasting') return;
    setDispatchStatus('broadcasting');
    toast.loading(`Broadcasting emergency dispatch for ${data.districtName}...`, { id: 'dispatch-toast' });
    
    setTimeout(() => {
      setDispatchStatus('dispatched');
      toast.success(`Emergency SOPs transmitted to DC, UNOs, and CPP volunteer units in ${data.districtName}.`, {
        id: 'dispatch-toast',
        duration: 4000,
      });
      setDispatchLogs(prev => [
        `[${new Date().toLocaleTimeString()}] High-priority warning SMS queued for ${data.affectedHouseholds.toLocaleString()} households.`,
        `[${new Date().toLocaleTimeString()}] Automated radio bulletin pushed to Bangladesh Betar regional transmitter.`,
        `[${new Date().toLocaleTimeString()}] Field coordination alert dispatched to ${data.emergencyResponse.activeShelters} designated shelter commanders.`,
        ...prev
      ]);
    }, 1400);
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -120;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };


  const riskStyles = getRiskColor(data.modelAssessment.riskCategory);

  const brief = {
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
  };

  return (
    <DistrictBriefProvider value={brief}>
      <div id="district-detail-container" className="w-full max-w-7xl mx-auto min-w-0 overflow-x-hidden space-y-8 font-sans pb-16">
        <DistrictBriefActions />
        <DistrictBriefHeader />
        {/* Section 3 order: outlook before the CSV table / charts. */}
        <DistrictOutlookCard />
        <DistrictForecastRecords />
        <div className="space-y-8">
          <DistrictBriefBody />
        </div>
        <DistrictPrintFooter />
      </div>
    </DistrictBriefProvider>
  );
};

export default DistrictDetailPage;
