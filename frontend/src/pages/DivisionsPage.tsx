import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  MapPin,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  Calendar,
  CloudRain,
  ShieldAlert,
} from 'lucide-react';
import { fetchEventsSummary, fetchAllForecastRecords, EventsSummary, ForecastRecord } from '../lib/eventsClient';

interface DivisionCardData {
  id: string;
  name: string;
  capital: string;
  districtCount: number;
  totalHistoricalEvents: number;
  primaryHazard: string;
  activeForecastsCount: number;
  avgForecastSeverity: number;
  topDistricts: string[];
}

const DIVISION_META = [
  { id: 'dhaka', name: 'Dhaka', capital: 'Dhaka', districtCount: 13, primaryHazard: 'Monsoon Flood & River Erosion' },
  { id: 'chattogram', name: 'Chattogram', capital: 'Chattogram', districtCount: 11, primaryHazard: 'Coastal Cyclone & Flash Flood' },
  { id: 'rajshahi', name: 'Rajshahi', capital: 'Rajshahi', districtCount: 8, primaryHazard: 'Severe Drought & Heat Wave' },
  { id: 'khulna', name: 'Khulna', capital: 'Khulna', districtCount: 10, primaryHazard: 'Tropical Cyclone & Saline Intrusion' },
  { id: 'barisal', name: 'Barisal', capital: 'Barisal', districtCount: 6, primaryHazard: 'Coastal Storm Surge & Inundation' },
  { id: 'sylhet', name: 'Sylhet', capital: 'Sylhet', districtCount: 4, primaryHazard: 'Haor Pre-Monsoon Flash Flood' },
  { id: 'rangpur', name: 'Rangpur', capital: 'Rangpur', districtCount: 8, primaryHazard: 'River Inundation & Cold Wave' },
  { id: 'mymensingh', name: 'Mymensingh', capital: 'Mymensingh', districtCount: 4, primaryHazard: 'Flash Flood & River Swell' },
];

export const DivisionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<EventsSummary | null>(null);
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [sumData, fcData] = await Promise.all([
          fetchEventsSummary(),
          fetchAllForecastRecords(),
        ]);
        if (mounted) {
          setSummary(sumData);
          setForecasts(fcData);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to load divisions data');
          setLoading(false);
        }
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  const divisionsList: DivisionCardData[] = DIVISION_META.map(div => {
    const histEvents = summary?.divisionBreakdown?.find(d => d.division.toLowerCase() === div.name.toLowerCase() || (div.name === 'Chattogram' && d.division.toLowerCase() === 'chittagong'))?.count
      || summary?.byDivision?.[div.name]
      || summary?.byDivision?.[div.id]
      || 0;
    const divForecasts = forecasts.filter(f => f.division.toLowerCase() === div.name.toLowerCase() || (div.name === 'Chattogram' && f.division.toLowerCase() === 'chittagong'));
    const avgSev = divForecasts.length > 0
      ? divForecasts.reduce((acc, f) => acc + f.severityScore, 0) / divForecasts.length
      : 0;

    const divDistricts = summary?.topDistricts
      ?.filter(d => d.division.toLowerCase() === div.name.toLowerCase() || (div.name === 'Chattogram' && d.division.toLowerCase() === 'chittagong'))
      ?.slice(0, 3)
      ?.map(d => d.district) || [];

    return {
      ...div,
      totalHistoricalEvents: histEvents,
      activeForecastsCount: divForecasts.length,
      avgForecastSeverity: Math.round(avgSev * 10) / 10,
      topDistricts: divDistricts,
    };
  });

  const chartData = divisionsList.map(d => ({
    name: d.name,
    'Historical Events (2000-2026)': d.totalHistoricalEvents,
    'Active Forecast Records': d.activeForecastsCount,
  })).sort((a, b) => b['Historical Events (2000-2026)'] - a['Historical Events (2000-2026)']);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20 pt-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
        <Link to="/" className="hover:text-blue-600 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Divisions</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>National Administrative Tiers</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Bangladesh Regional Divisions
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
              Real-time multi-hazard exposure, 26-year historical disaster analysis (2000–2026), and active tensor forecasts across all 8 administrative divisions.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-slate-900">8</div>
              <div className="text-xs text-slate-500 font-medium">Divisions</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-slate-900">64</div>
              <div className="text-xs text-slate-500 font-medium">Districts</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-xl sm:text-2xl font-bold text-blue-700">{summary?.totalEvents ?? '3,062'}</div>
              <div className="text-xs text-slate-500 font-medium">Recorded Events</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Division Comparative Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Division Disaster Frequency & Alert Volume
            </h2>
            <p className="text-xs text-slate-500">
              Comparing all 8 divisions from historical records (2000-2026) and active forecast tensors
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
            Source: BGD Climatic Hazards Dataset & HazardNet Forecasts
          </span>
        </div>

        <div className="h-72 sm:h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar dataKey="Historical Events (2000-2026)" fill="#2563eb" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Active Forecast Records" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 8 Divisions Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Explore Individual Divisions</h2>
          <span className="text-xs text-slate-500">Click any division to open its dedicated dashboard</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {divisionsList.map((division) => (
            <div
              key={division.id}
              onClick={() => navigate(`/divisions/${division.id}`)}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-blue-50 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                    {division.districtCount} Districts
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {division.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Capital: {division.capital}</p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">2000–2026 Events:</span>
                    <span className="font-semibold text-slate-800">{division.totalHistoricalEvents.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Active Forecasts:</span>
                    <span className="font-semibold text-blue-700">{division.activeForecastsCount} records</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Primary Hazard:</span>
                    <span className="font-medium text-amber-700 truncate max-w-[130px]">{division.primaryHazard}</span>
                  </div>
                </div>

                {division.topDistricts.length > 0 && (
                  <div className="mt-3 pt-2">
                    <div className="text-[11px] text-slate-400 mb-1">Key Districts:</div>
                    <div className="flex flex-wrap gap-1">
                      {division.topDistricts.map(dist => (
                        <span key={dist} className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded text-[11px]">
                          {dist}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-600 group-hover:translate-x-1 transition-transform">
                <span>View Division Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DivisionsPage;
