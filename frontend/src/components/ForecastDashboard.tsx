import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
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
  ComposedChart,
  Line
} from 'recharts';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fetchStaticForecastSnapshot, ForecastRow } from '../lib/forecasts';
import MaterialIcon from './MaterialIcon';
import toast from 'react-hot-toast';
import { BentoGrid, BentoCard } from './ui/BentoGrid';
import { BottomSheet } from './ui/BottomSheet';
import { FloatingControlBar } from './ui/FloatingControlBar';

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
  const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dbSource, setDbSource] = useState<'firestore' | 'fallback'>('firestore');
  const [selectedHorizon, setSelectedHorizon] = useState<'7_days' | '15_days'>('7_days');
  const [selectedDistrict, setSelectedDistrict] = useState<string>(initialDistrictId);
  const [selectedHazard, setSelectedHazard] = useState<string>('all');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<'all' | 'high' | 'moderate' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChartTab, setActiveChartTab] = useState<'trends' | 'comparison' | 'dualTrack'>('trends');

  // Drawer / BottomSheet state for selected district telemetry detail
  const [activeSheetItem, setActiveSheetItem] = useState<ForecastRow | null>(null);

  // Load forecast data: immediate static snapshot baseline + live Firestore listener
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    // Immediately seed with snapshot data so charts render without delay
    fetchStaticForecastSnapshot(selectedHorizon)
      .then((rows) => {
        if (isMounted && rows && rows.length > 0) {
          setForecasts(rows);
          setDbSource('fallback');
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Initial static snapshot load issue:', err);
      });

    // Attempt real-time Firestore sync
    try {
      const forecastsRef = collection(db, 'forecasts');
      const q = query(forecastsRef, orderBy('prediction_date', 'desc'), limit(500));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!isMounted) return;
          if (!snapshot.empty) {
            const docs: ForecastRow[] = [];
            snapshot.forEach((doc) => {
              docs.push(doc.data() as ForecastRow);
            });
            setForecasts(docs);
            setDbSource('firestore');
            setLoading(false);
          } else {
            setDbSource('fallback');
            setLoading(false);
          }
        },
        () => {
          if (unsubscribe) {
            try {
              unsubscribe();
            } catch {
              // Ignore detachment error
            }
            unsubscribe = undefined;
          }
          if (isMounted) {
            setDbSource('fallback');
            setLoading(false);
          }
        }
      );
    } catch (err) {
      console.warn('Firestore initialization failed, running with static fallback:', err);
      if (isMounted) {
        setDbSource('fallback');
        setLoading(false);
      }
    }

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [selectedHorizon]);

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

  const [severityMode] = useState<'physics' | 'model' | 'blended'>('physics');

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

      entry[hazardKey] = Math.max(entry[hazardKey] ?? 0, scorePercent);
      entry.maxSeverity = Math.max(entry.maxSeverity ?? 0, scorePercent);

      if (f.model_severity !== undefined) {
        entry.modelSeverity = Math.round((f.model_severity ?? 0) * 100);
      }
      if (f.physics_severity !== undefined) {
        entry.physicsSeverity = Math.round((f.physics_severity ?? 0) * 100);
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredForecasts]);

  // District comparison bar chart data
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
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden transition-all duration-300 hover:shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono font-bold shadow-2xs">
                <MaterialIcon name="analytics" className="w-3.5 h-3.5 text-amber-600" />
                <span>FORECAST DASHBOARD</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                  dbSource === 'firestore'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-carbon-10 border-carbon-20 text-carbon-70'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${dbSource === 'firestore' ? 'bg-emerald-500 animate-pulse' : 'bg-carbon-40'}`} />
                <span>{dbSource === 'firestore' ? 'Firestore Live Sync' : 'Local Forecast Baseline'}</span>
              </span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-extrabold text-carbon-90 tracking-tight">
              District Hazard Forecast Analytics
            </h2>
            <p className="text-carbon-60 text-xs sm:text-sm max-w-3xl leading-relaxed">
              Real-time multi-hazard risk quantification and weather trends across Bangladesh's 64 agricultural districts powered by CNN AI model inference and weather service observations.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-carbon-90 text-white text-xs font-extrabold shadow-sm hover:bg-carbon-80 transition-all cursor-pointer min-h-[44px]"
            >
              <MaterialIcon name="download" className="w-4 h-4 text-amber-400" />
              <span>Export CSV Data</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Mobile Bento Box Telemetry Grid */}
      <BentoGrid>
        <BentoCard
          title="Active Forecasts"
          value={stats.total}
          unit="Districts"
          subtitle={`Horizon: ${selectedHorizon.replace('_', ' ')}`}
          statusBadge={{ label: 'TACTICAL', color: '#1c67e3' }}
          icon={<MaterialIcon name="assessment" />}
        />
        <BentoCard
          title="High Risk Watch"
          value={stats.highRisk}
          unit="Districts"
          subtitle="Severity Score ≥ 67%"
          statusBadge={{ label: 'CRITICAL', color: '#dc2626' }}
          icon={<MaterialIcon name="warning" />}
          gaugePercent={Math.min(100, (stats.highRisk / Math.max(1, stats.total)) * 100 * 2)}
        />
        <BentoCard
          title="Moderate Risk"
          value={stats.modRisk}
          unit="Districts"
          subtitle="Severity Score 34% - 66%"
          statusBadge={{ label: 'ADVISORY', color: '#ea6f24' }}
          icon={<MaterialIcon name="error_outline" />}
          gaugePercent={Math.min(100, (stats.modRisk / Math.max(1, stats.total)) * 100 * 1.5)}
        />
        <BentoCard
          title="Avg AI Confidence"
          value={`${stats.avgConfidence.toFixed(1)}%`}
          subtitle={`Latest Run: ${stats.latestDate}`}
          statusBadge={{ label: 'VERIFIED', color: '#16a34a' }}
          icon={<MaterialIcon name="verified" />}
          gaugePercent={stats.avgConfidence}
        />
      </BentoGrid>

      {/* Floating Glass Search & Control Bar */}
      <FloatingControlBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search district, hazard, or division..."
        chips={[
          { id: 'all', label: 'All Hazards', active: selectedHazard === 'all' },
          { id: 'Flood', label: 'Floods', active: selectedHazard === 'Flood' },
          { id: 'Flash Flood', label: 'Flash Flood', active: selectedHazard === 'Flash Flood' },
          { id: 'Tropical Cyclone', label: 'Cyclone', active: selectedHazard === 'Tropical Cyclone' },
          { id: 'Drought', label: 'Drought', active: selectedHazard === 'Drought' },
        ]}
        onSelectChip={(chipId) => setSelectedHazard(chipId)}
      />

      {/* Control Toolbar / Horizon Filters */}
      <div className="bg-white border border-carbon-20/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Horizon Switcher */}
          <div className="inline-flex rounded-xl p-1 bg-carbon-10 border border-carbon-20 shrink-0">
            <button
              onClick={() => setSelectedHorizon('7_days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
                selectedHorizon === '7_days' ? 'bg-white text-carbon-90 shadow-2xs font-extrabold' : 'text-carbon-60 hover:text-carbon-90'
              }`}
            >
              7-Day Tactical
            </button>
            <button
              onClick={() => setSelectedHorizon('15_days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
                selectedHorizon === '15_days' ? 'bg-white text-carbon-90 shadow-2xs font-extrabold' : 'text-carbon-60 hover:text-carbon-90'
              }`}
            >
              15-Day Strategic
            </button>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap gap-2 flex-1 justify-end">
            <select
              value={selectedDistrict}
              onChange={(e) => {
                setSelectedDistrict(e.target.value);
                if (onSelectDistrict && e.target.value) onSelectDistrict(e.target.value);
              }}
              aria-label="Filter District"
              className="bg-carbon-05 border border-carbon-20 rounded-xl px-3 py-2 text-xs font-medium text-carbon-80 focus:outline-none min-h-[44px]"
            >
              <option value="">All 64 Districts</option>
              {availableDistricts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={selectedRiskLevel}
              onChange={(e) => setSelectedRiskLevel(e.target.value as any)}
              aria-label="Filter Risk Severity Level"
              className="bg-carbon-05 border border-carbon-20 rounded-xl px-3 py-2 text-xs font-medium text-carbon-80 focus:outline-none min-h-[44px]"
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
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon-10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-carbon-90 flex items-center gap-2">
              <MaterialIcon name="show_chart" className="w-5 h-5 text-amber-500" />
              <span>Interactive Risk Trend & Visualization</span>
            </h2>
            <p className="text-xs text-carbon-60 mt-0.5">
              Recharts powered analytics displaying forecasted hazard severity across prediction dates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveChartTab('trends')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                activeChartTab === 'trends' ? 'bg-amber-500 text-carbon-90 shadow-2xs font-extrabold' : 'bg-carbon-10 text-carbon-60 hover:bg-carbon-20'
              }`}
            >
              Trends
            </button>
            <button
              onClick={() => setActiveChartTab('comparison')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                activeChartTab === 'comparison' ? 'bg-amber-500 text-carbon-90 shadow-2xs font-extrabold' : 'bg-carbon-10 text-carbon-60 hover:bg-carbon-20'
              }`}
            >
              Bar Chart
            </button>
            <button
              onClick={() => setActiveChartTab('dualTrack')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                activeChartTab === 'dualTrack' ? 'bg-amber-500 text-carbon-90 shadow-2xs font-extrabold' : 'bg-carbon-10 text-carbon-60 hover:bg-carbon-20'
              }`}
            >
              Dual-Track
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-72 w-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <span className="w-8 h-8 border-3 border-carbon-30 border-t-amber-500 rounded-full animate-spin" />
              <span className="text-xs font-mono text-carbon-60">Querying Firestore Forecast Store...</span>
            </div>
          </div>
        ) : (
          <div className="w-full pt-2">
            {activeChartTab === 'trends' && (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
                    <XAxis dataKey="date" stroke="#77777a" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#77777a" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <ReferenceLine y={67} stroke="#ef4444" strokeDasharray="4 4" />
                    <ReferenceLine y={34} stroke="#f59e0b" strokeDasharray="4 4" />

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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
                    <XAxis dataKey="name" stroke="#77777a" fontSize={11} angle={-35} textAnchor="end" interval={0} />
                    <YAxis domain={[0, 100]} stroke="#77777a" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" />
                    <XAxis dataKey="date" stroke="#77777a" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#77777a" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="modelSeverity" name="CNN Neural Net %" stroke="#8b5cf6" strokeWidth={3} />
                    <Line type="monotone" dataKey="physicsSeverity" name="Physics Proxy %" stroke="#06b6d4" strokeWidth={2} strokeDasharray="4 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* District Forecast Records Table */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-carbon-90 flex items-center gap-2">
            <MaterialIcon name="table_chart" className="w-4 h-4 text-carbon-60" />
            <span>Detailed District Forecast Records ({filteredForecasts.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-carbon-20/90">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-carbon-05 border-b border-carbon-20 text-[11px] font-mono uppercase text-carbon-60 font-bold">
                <th className="p-3">District</th>
                <th className="p-3">Hazard Type</th>
                <th className="p-3">Severity Score</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Target Date</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-10 text-xs">
              {filteredForecasts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-carbon-60">
                    No forecast records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredForecasts.slice(0, 30).map((item, idx) => {
                  const physScore = item.physics_severity !== undefined ? item.physics_severity : (item.severity_score ?? 0);
                  const isHigh = physScore >= RISK_THRESHOLDS.HIGH;
                  const isMod = physScore >= RISK_THRESHOLDS.MODERATE && physScore < RISK_THRESHOLDS.HIGH;

                  return (
                    <tr
                      key={idx}
                      onClick={() => setActiveSheetItem(item)}
                      className="hover:bg-carbon-05/80 transition-colors cursor-pointer"
                    >
                      <td className="p-3 font-bold text-carbon-90">
                        {item.district_name}
                        {item.division && <span className="text-[10px] text-carbon-60 font-normal block">{item.division}</span>}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-carbon-80">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: HAZARD_COLORS[item.hazard_type] || '#77777a' }}
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
                      <td className="p-3 font-mono font-bold text-emerald-700">
                        {Math.round((item.confidence ?? 0) * 100)}%
                      </td>
                      <td className="p-3 font-mono text-carbon-60">{item.target_date || item.prediction_date}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSheetItem(item);
                          }}
                          className="text-nasa-blue font-extrabold text-xs hover:underline cursor-pointer min-h-[44px] px-2"
                        >
                          Inspect Sheet
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Glassmorphic Contextual Telemetry BottomSheet */}
      <BottomSheet
        isOpen={Boolean(activeSheetItem)}
        onClose={() => setActiveSheetItem(null)}
        title={activeSheetItem?.district_name ? `${activeSheetItem.district_name} District Telemetry` : 'District Telemetry'}
        subtitle={activeSheetItem?.division ? `Division: ${activeSheetItem.division}` : undefined}
        footerContent={
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setActiveSheetItem(null)}
              className="px-4 py-2.5 rounded-xl border border-carbon-20 font-sans font-semibold text-xs text-carbon-80 hover:bg-carbon-10 min-h-[44px]"
            >
              Dismiss
            </button>
            {activeSheetItem && onSelectDistrict && (
              <button
                onClick={() => {
                  onSelectDistrict(String(activeSheetItem.district_id));
                  setActiveSheetItem(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-nasa-blue text-white font-sans font-semibold text-xs hover:bg-nasa-blue-shade shadow-xs min-h-[44px]"
              >
                View on Live GIS Map
              </button>
            )}
          </div>
        }
      >
        {activeSheetItem && (
          <div className="space-y-4 text-carbon-90 dark:text-carbon-05">
            <div className="p-4 rounded-2xl bg-carbon-05 dark:bg-carbon-80 border border-carbon-20/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-carbon-60 uppercase">Primary Climate Hazard</span>
                <p className="text-lg font-heading font-bold text-carbon-90 dark:text-carbon-05 mt-0.5">
                  {activeSheetItem.hazard_type}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-nasa-red/10 text-nasa-red border border-nasa-red/20">
                Score: {Math.round((activeSheetItem.severity_score ?? 0) * 100)}/100
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white dark:bg-carbon-90 border border-carbon-20/60">
                <span className="text-[11px] font-mono text-carbon-60 uppercase">AI Model Confidence</span>
                <p className="text-xl font-mono font-bold text-emerald-600 mt-1">
                  {Math.round((activeSheetItem.confidence ?? 0) * 100)}%
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-carbon-90 border border-carbon-20/60">
                <span className="text-[11px] font-mono text-carbon-60 uppercase">Forecast Horizon</span>
                <p className="text-xl font-mono font-bold text-carbon-90 dark:text-carbon-05 mt-1">
                  {activeSheetItem.horizon || selectedHorizon}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-page dark:bg-carbon-80 border border-carbon-20/60 space-y-2">
              <h4 className="font-heading font-semibold text-sm">Agricultural Advisory Note</h4>
              <p className="text-xs text-carbon-70 dark:text-carbon-30 leading-relaxed">
                Elevated multi-hazard risk detected for {activeSheetItem.district_name}. High salinity and rainfall forecast indicates immediate field drainage and crop protection measures recommended.
              </p>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
};

export default ForecastDashboard;
