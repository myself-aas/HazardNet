import { useForecasts } from '../hooks/useForecasts';
import { useHazardContext } from '../hooks/useHazardContext';
import { isVerifiedForecastFresh } from '../lib/profileForecast';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ComposedChart
} from 'recharts';
import type { ForecastRow } from '../lib/forecasts';
import MaterialIcon from './MaterialIcon';
import toast from 'react-hot-toast';

interface ForecastDashboardProps {
  initialDistrictId?: string;
  onSelectDistrict?: (districtId: string) => void;
}

const HAZARD_COLORS: Record<string, string> = {
  'Flood': '#3b82f6',
  'Flash Flood': '#06b6d4',
  'Tropical Cyclone': '#ef4444',
  'Drought': '#f59e0b',
  'Heat Wave': '#f97316',
  'Cold Wave': '#6366f1',
  'Severe Local Storm': '#8b5cf6',
  'Fire': '#dc2626',
};

const RISK_THRESHOLDS = {
  HIGH: 0.67,
  MODERATE: 0.34,
};

export const ForecastDashboard: React.FC<ForecastDashboardProps> = ({
  initialDistrictId = '',
  onSelectDistrict,
}) => {
  const { horizon: selectedHorizon, setHorizon: setSelectedHorizon } = useHazardContext();
  const forecastQuery = useForecasts(selectedHorizon);
  const forecasts = forecastQuery.data ?? [];
  const loading = forecastQuery.isPending;
  const dbSource = forecasts.length && forecasts.every(row => row.source_kind === 'api' && isVerifiedForecastFresh(row)) ? 'verified' : 'fallback';
  const [selectedDistrict, setSelectedDistrict] = useState<string>(initialDistrictId);
  const [selectedHazard, setSelectedHazard] = useState<string>('all');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<'all' | 'high' | 'moderate' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChartTab, setActiveChartTab] = useState<'trends' | 'comparison' | 'dualTrack'>('trends');

  // Unique lists for filter dropdowns
  const availableDistricts = useMemo(() => {
    const set = new Map<string, string>();
    forecasts.forEach((f) => {
      const idStr = String(f.district_id);
      if (!set.has(idStr)) {
        set.set(idStr, f.district_name || `District ${f.district_id}`);
      }
    });
    return Array.from(set.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [forecasts]);

  const availableHazards = useMemo(() => {
    const set = new Set<string>();
    forecasts.forEach((f) => {
      if (f.hazard_type) set.add(f.hazard_type);
    });
    return Array.from(set).sort();
  }, [forecasts]);

  const [severityMode, setSeverityMode] = useState<'physics' | 'model' | 'blended'>('physics');

  // Filtered dataset
  const filteredForecasts = useMemo(() => {
    return forecasts.filter((f) => {
      if (f.horizon && f.horizon !== selectedHorizon) return false;
      if (selectedDistrict && String(f.district_id) !== selectedDistrict && f.district_name.toLowerCase() !== selectedDistrict.toLowerCase()) {
        return false;
      }
      if (selectedHazard !== 'all' && f.hazard_type !== selectedHazard) return false;

      const score = severityMode === 'physics' && f.physics_severity !== undefined
        ? f.physics_severity
        : (severityMode === 'model' && f.model_severity !== undefined ? f.model_severity : (f.severity_score ?? 0));

      if (selectedRiskLevel === 'high' && score < RISK_THRESHOLDS.HIGH) return false;
      if (selectedRiskLevel === 'moderate' && (score < RISK_THRESHOLDS.MODERATE || score >= RISK_THRESHOLDS.HIGH)) return false;
      if (selectedRiskLevel === 'low' && score >= RISK_THRESHOLDS.MODERATE) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = f.district_name.toLowerCase().includes(q);
        const matchHazard = f.hazard_type.toLowerCase().includes(q);
        const matchDivision = (f.division || '').toLowerCase().includes(q);
        if (!matchName && !matchHazard && !matchDivision) return false;
      }

      return true;
    });
  }, [forecasts, selectedHorizon, selectedDistrict, selectedHazard, selectedRiskLevel, searchQuery, severityMode]);

  // Telemetry metrics
  const stats = useMemo(() => {
    const total = filteredForecasts.length;
    const highRisk = filteredForecasts.filter((f) => (f.severity_score ?? 0) >= RISK_THRESHOLDS.HIGH).length;
    const modRisk = filteredForecasts.filter(
      (f) => (f.severity_score ?? 0) >= RISK_THRESHOLDS.MODERATE && (f.severity_score ?? 0) < RISK_THRESHOLDS.HIGH
    ).length;
    const avgConfidence = total > 0 ? (filteredForecasts.reduce((acc, f) => acc + (f.confidence ?? 0), 0) / total) * 100 : 0;
    const latestDate = forecasts.length > 0 ? forecasts[0].prediction_date : 'N/A';

    return { total, highRisk, modRisk, avgConfidence, latestDate };
  }, [filteredForecasts, forecasts]);

  // Trend line chart data aggregated by target_date / prediction_date
  const trendChartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, any>>();

    filteredForecasts.forEach((f) => {
      const dateKey = f.target_date || f.prediction_date;
      if (!dateKey) return;

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: dateKey, count: 0 });
      }

      const entry = dateMap.get(dateKey)!;
      const hazardKey = f.hazard_type || 'Unknown';
      const physVal = f.physics_severity !== undefined ? f.physics_severity : (f.severity_score ?? 0);
      const scorePercent = Math.round(physVal * 100);

      // Store max severity for hazard on this date
      entry[hazardKey] = Math.max(entry[hazardKey] ?? 0, scorePercent);
      entry.maxSeverity = Math.max(entry.maxSeverity ?? 0, scorePercent);

      // Model vs Physics dual-track values
      if (f.model_severity !== undefined) {
        entry.modelSeverity = Math.round((f.model_severity ?? 0) * 100);
      }
      if (f.physics_severity !== undefined) {
        entry.physicsSeverity = Math.round((f.physics_severity ?? 0) * 100);
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredForecasts]);

  // District comparison bar chart data (Top 12 districts by severity)
  const districtComparisonData = useMemo(() => {
    const districtMap = new Map<string, { name: string; maxSeverity: number; hazard: string; confidence: number }>();

    filteredForecasts.forEach((f) => {
      const name = f.district_name || `District ${f.district_id}`;
      const physVal = f.physics_severity !== undefined ? f.physics_severity : (f.severity_score ?? 0);
      const scorePercent = Math.round(physVal * 100);

      const existing = districtMap.get(name);
      if (!existing || scorePercent > existing.maxSeverity) {
        districtMap.set(name, {
          name,
          maxSeverity: scorePercent,
          hazard: f.hazard_type,
          confidence: Math.round((f.confidence ?? 0) * 100),
        });
      }
    });

    return Array.from(districtMap.values())
      .sort((a, b) => b.maxSeverity - a.maxSeverity)
      .slice(0, 14);
  }, [filteredForecasts]);

  // Export filtered forecasts to CSV
  const handleExportCsv = () => {
    if (filteredForecasts.length === 0) {
      toast.error('No data available to export');
      return;
    }

    const headers = [
      'district_id',
      'district_name',
      'division',
      'horizon',
      'hazard_type',
      'severity_score',
      'confidence',
      'prediction_date',
      'target_date',
      'temperature_mean',
      'precipitation_mm',
      'wind_max_kmh',
    ];

    const rows = filteredForecasts.map((f) => [
      f.district_id,
      `"${f.district_name}"`,
      `"${f.division || ''}"`,
      f.horizon,
      `"${f.hazard_type}"`,
      f.severity_score,
      f.confidence,
      f.prediction_date,
      f.target_date,
      f.temperature_mean ?? '',
      f.precipitation_mm ?? '',
      f.wind_max_kmh ?? '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hazardnet_forecasts_${selectedHorizon}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredForecasts.length} forecast records`);
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Banner & Status */}
      <button className="hn-button" disabled={forecastQuery.isFetching} onClick={() => void forecastQuery.refetch()}>Retry / refresh forecasts</button>
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden transition-all duration-300 hover:shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono font-bold shadow-2xs">
                <MaterialIcon name="analytics" className="w-3.5 h-3.5 text-amber-600" />
                <span>FORECAST DASHBOARD</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                  dbSource === 'verified'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${dbSource === 'verified' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span>{dbSource === 'verified' ? 'Fresh run-verified forecast' : 'Stale / offline reference — not current'}</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              District Hazard Forecast Analytics
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-3xl leading-relaxed">
              Experimental multi-hazard forecasts and weather trends across Bangladesh's 64 agricultural districts powered by CNN AI model inference and Open-Meteo observations.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-extrabold shadow-sm hover:bg-slate-800 transition-all cursor-pointer"
            >
              <MaterialIcon name="download" className="w-4 h-4 text-amber-400" />
              <span>Export CSV Data</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Total Active Forecasts</span>
            <MaterialIcon name="list_alt" className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">{stats.total}</div>
          <p className="text-[11px] text-slate-500 font-mono">Horizon: {selectedHorizon.replace('_', ' ')}</p>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1"
        >
          <div className="flex items-center justify-between text-rose-600">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">High Risk Districts</span>
            <MaterialIcon name="warning" className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600">{stats.highRisk}</div>
          <p className="text-[11px] text-slate-500 font-mono">Severity ≥ 67%</p>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1"
        >
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Moderate Risk</span>
            <MaterialIcon name="error_outline" className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">{stats.modRisk}</div>
          <p className="text-[11px] text-slate-500 font-mono">Severity 34% - 66%</p>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1"
        >
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Avg AI Confidence</span>
            <MaterialIcon name="verified" className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">{stats.avgConfidence.toFixed(1)}%</div>
          <p className="text-[11px] text-slate-500 font-mono">Latest Run: {stats.latestDate}</p>
        </motion.div>
      </div>

      {/* Control Toolbar / Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <MaterialIcon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search district, hazard, or division..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <MaterialIcon name="close" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Horizon Switcher */}
          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 shrink-0">
            <button
              onClick={() => setSelectedHorizon('7_days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedHorizon === '7_days' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7-Day Tactical
            </button>
            <button
              onClick={() => setSelectedHorizon('15_days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedHorizon === '15_days' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              15-Day Strategic
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Filter District</label>
            <select
              value={selectedDistrict}
              onChange={(e) => {
                setSelectedDistrict(e.target.value);
                if (onSelectDistrict && e.target.value) onSelectDistrict(e.target.value);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <option value="">All 64 Districts</option>
              {availableDistricts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Filter Hazard Type</label>
            <select
              value={selectedHazard}
              onChange={(e) => setSelectedHazard(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All Hazard Types</option>
              {availableHazards.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Risk Severity Level</label>
            <select
              value={selectedRiskLevel}
              onChange={(e) => setSelectedRiskLevel(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High Risk (≥ 67%)</option>
              <option value="moderate">Moderate Risk (34% - 66%)</option>
              <option value="low">Low Risk (&lt; 34%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Charts Container */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MaterialIcon name="show_chart" className="w-5 h-5 text-amber-500" />
              <span>Interactive Risk Trend & Visualization</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recharts powered analytics displaying forecasted hazard severity across prediction dates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveChartTab('trends')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeChartTab === 'trends' ? 'bg-amber-500 text-slate-900 shadow-2xs font-extrabold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Hazard Severity Trends
            </button>
            <button
              onClick={() => setActiveChartTab('comparison')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeChartTab === 'comparison' ? 'bg-amber-500 text-slate-900 shadow-2xs font-extrabold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              District Risk Bar Chart
            </button>
            <button
              onClick={() => setActiveChartTab('dualTrack')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeChartTab === 'dualTrack' ? 'bg-amber-500 text-slate-900 shadow-2xs font-extrabold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              CNN vs Physics Dual-Track
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-72 w-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <span className="w-8 h-8 border-3 border-slate-300 border-t-amber-500 rounded-full animate-spin" />
              <span className="text-xs font-mono text-slate-500">Loading forecasts…</span>
            </div>
          </div>
        ) : (
          <div className="w-full pt-2">
            {activeChartTab === 'trends' && (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="highRiskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="modRiskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="floodGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-lg text-xs space-y-1.5 z-50">
                              <div className="font-extrabold text-slate-900 border-b border-slate-100 pb-1">
                                Date: {label}
                              </div>
                              {payload.map((entry: any, i: number) => (
                                <div key={i} className="flex items-center justify-between gap-4 text-xs font-mono">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                    {entry.name}:
                                  </span>
                                  <span className="font-bold">{entry.value}%</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <ReferenceLine y={67} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'High Risk (67%)', fill: '#ef4444', fontSize: 10 }} />
                    <ReferenceLine y={34} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Moderate Risk (34%)', fill: '#f59e0b', fontSize: 10 }} />

                    {availableHazards.map((hazard) => (
                      <Area
                        key={hazard}
                        type="monotone"
                        dataKey={hazard}
                        name={hazard}
                        stroke={HAZARD_COLORS[hazard] || '#8884d8'}
                        fill={HAZARD_COLORS[hazard] || '#8884d8'}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeChartTab === 'comparison' && (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={districtComparisonData} margin={{ top: 10, right: 30, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      stroke="#64748b"
                      fontSize={11}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-lg text-xs space-y-1">
                              <div className="font-extrabold text-slate-900">{label}</div>
                              <div className="text-slate-600 font-mono">Primary Hazard: {data.hazard}</div>
                              <div className="text-slate-900 font-mono font-bold">Severity Score: {data.maxSeverity}%</div>
                              <div className="text-emerald-700 font-mono">AI Confidence: {data.confidence}%</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine y={67} stroke="#ef4444" strokeDasharray="4 4" />
                    <Bar dataKey="maxSeverity" name="Severity Score %" radius={[6, 6, 0, 0]}>
                      {districtComparisonData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.maxSeverity >= 67 ? '#ef4444' : entry.maxSeverity >= 34 ? '#f59e0b' : '#10b981'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeChartTab === 'dualTrack' && (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <ReferenceLine y={67} stroke="#ef4444" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="modelSeverity"
                      name="CNN Neural Net Severity %"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="physicsSeverity"
                      name="Physics-Based Proxy Severity %"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* District Forecast Details Table */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MaterialIcon name="table_chart" className="w-4 h-4 text-slate-600" />
            <span>Detailed District Forecast Records ({filteredForecasts.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200/90">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500 font-bold">
                <th className="p-3">District</th>
                <th className="p-3">Hazard Type</th>
                <th className="p-3">Physics Severity</th>
                <th className="p-3">CNN Severity</th>
                <th className="p-3">HazardNet Confidence</th>
                <th className="p-3">Target Date</th>
                <th className="p-3">Temperature</th>
                <th className="p-3">Precipitation</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredForecasts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No forecast records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredForecasts.slice(0, 30).map((item, idx) => {
                  const physScore = item.physics_severity !== undefined ? item.physics_severity : (item.severity_score ?? 0);
                  const modelScore = item.model_severity !== undefined ? item.model_severity : (item.severity_score ?? 0);
                  const isHigh = physScore >= RISK_THRESHOLDS.HIGH;
                  const isMod = physScore >= RISK_THRESHOLDS.MODERATE && physScore < RISK_THRESHOLDS.HIGH;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-bold text-slate-900">
                        {item.district_name}
                        {item.division && <span className="text-[10px] text-slate-400 font-normal block">{item.division}</span>}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: HAZARD_COLORS[item.hazard_type] || '#64748b' }}
                          />
                          {item.hazard_type}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                            isHigh
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isMod
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {Math.round(physScore * 100)}% ({isHigh ? 'High' : isMod ? 'Moderate' : 'Low'})
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        {Math.round(modelScore * 100)}%
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700">
                        {Math.round((item.confidence ?? 0) * 100)}%
                      </td>
                      <td className="p-3 font-mono text-slate-600">{item.target_date || item.prediction_date}</td>
                      <td className="p-3 font-mono text-slate-600">
                        {item.temperature_mean !== undefined ? `${item.temperature_mean.toFixed(1)}°C` : '—'}
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {item.precipitation_mm !== undefined ? `${item.precipitation_mm.toFixed(1)} mm` : '—'}
                      </td>
                      <td className="p-3 text-right">
                        {onSelectDistrict && (
                          <button
                            onClick={() => onSelectDistrict(String(item.district_id))}
                            className="text-amber-600 hover:text-amber-800 font-extrabold text-[11px] hover:underline cursor-pointer"
                          >
                            View Map
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ForecastDashboard;
