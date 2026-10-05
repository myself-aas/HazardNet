import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  ArrowRight,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { fetchEventsSummary, fetchForecastFeed, EventsSummary, ForecastRecord, ForecastFeed } from '../lib/eventsClient';
import { DataStateEmpty, DataStateError, DataStateLoading } from '../components/ui/DataState';

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
  const [summary, setSummary] = useState<EventsSummary | null>(null);
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [feed, setFeed] = useState<ForecastFeed['source']>('none');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [sumData, fcFeed] = await Promise.all([
          fetchEventsSummary(),
          fetchForecastFeed(),
        ]);
        if (mounted) {
          setSummary(sumData);
          setForecasts(fcFeed.records);
          setFeed(fcFeed.source);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load divisions data');
          setLoading(false);
        }
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [reloadNonce]);

  /** A summary tagged `fallback` is an unavailable sentinel, not this deployment's archive. */
  const archiveLoaded = summary !== null && summary.source !== 'fallback';

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
    <div className="min-h-dvh bg-carbon-05 text-carbon-80 pb-8 pt-6 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-carbon-60 mb-4">
        <Link to="/" className="hover:text-nasa-blue-shade transition-colors">Home</Link>
        <span>/</span>
        <span className="text-carbon-80 font-medium">Divisions</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white border border-carbon-20 p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold bg-carbon-05 text-nasa-blue-shade border border-carbon-20 mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>National Administrative Tiers</span>
            </div>
            <h1 className="text-ap-lead font-bold sm:text-ap-display-md text-carbon-90 tracking-tight">
              Bangladesh Regional Divisions
            </h1>
            <p className="mt-2 text-base leading-[1.62] text-carbon-70 max-w-2xl leading-relaxed">
              Real-time multi-hazard exposure, 26-year historical disaster analysis (2000–2026), and active record forecasts across all 8 administrative divisions.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-carbon-90">8</div>
              <div className="text-xs text-carbon-60 font-medium">Divisions</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-carbon-90">64</div>
              <div className="text-xs text-carbon-60 font-medium">Districts</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-xl sm:text-2xl font-bold text-nasa-blue-shade">
                {archiveLoaded ? summary!.totalEvents.toLocaleString() : '—'}
              </div>
              <div className="text-xs text-carbon-60 font-medium">Recorded Events</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Division Comparative Chart */}
      <div className="bg-white border border-carbon-20 p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-carbon-20 gap-2">
          <div>
            <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-nasa-blue-shade" />
              Division Disaster Frequency & Alert Volume
            </h2>
            <p className="text-xs text-carbon-60">
              Comparing all 8 divisions from historical records (2000-2026) and active forecast records
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-carbon-10 text-carbon-70 rounded-md">
            {archiveLoaded
              ? 'Source: BGD Climatic Hazards Dataset & HazardNet Forecasts'
              : 'Source: no hazard archive is loaded in this deployment'}
          </span>
        </div>

        {loading && (
          <DataStateLoading
            label="Loading the division archive"
            detail="Reading historical records and the current forecast run."
          />
        )}

        {!loading && error && (
          <DataStateError
            title="The division archive could not be loaded"
            detail={error}
            onRetry={() => setReloadNonce((n) => n + 1)}
            className="mt-4"
          />
        )}

        {!loading && !error && !archiveLoaded && (
          <DataStateEmpty
            className="mt-4"
            title="No hazard archive is loaded in this deployment"
            body="The division profiles below are the administrative framework this deployment ships. Event counts and forecast volumes come from the historical archive and the forecast feed, neither of which is present here."
          />
        )}

        <div className={`h-72 sm:h-80 w-full pt-4 ${!loading && !error && archiveLoaded ? '' : 'hidden'}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--ap-bg-canvas)', borderColor: 'var(--ap-separator-opaque)', borderRadius: 'var(--ap-radius-md)', boxShadow: 'var(--ap-elev-flat)' }}
                cursor={{ fill: 'var(--ap-bg-canvas)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar dataKey="Historical Events (2000-2026)" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Active Forecast Records" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 8 Divisions Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-carbon-90">Explore Individual Divisions</h2>
          <span className="text-xs text-carbon-60">Click any division to open its dedicated dashboard</span>
        </div>

        <div className="grid grid-cols-1 min-[880px]:grid-cols-2 min-[1200px]:grid-cols-3 gap-4">
          {divisionsList.map((division) => (
            <Link
              key={division.id}
              to={`/divisions/${division.id}`}
              className="bg-white border border-carbon-20 p-6 hover:border-carbon-30 group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-carbon-05 text-nasa-blue-shade group-hover:bg-nasa-blue group-hover:text-white transition-colors">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70">
                    {division.districtCount} Districts
                  </span>
                </div>

                <h3 className="text-lg font-bold text-carbon-90 group-hover:text-nasa-blue-shade transition-colors">
                  {division.name}
                </h3>
                <p className="text-xs text-carbon-60 mt-0.5">Capital: {division.capital}</p>

                <div className="mt-4 pt-3 border-t border-carbon-20 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-carbon-60">2000–2026 Events:</span>
                    <span className="font-semibold text-carbon-80">
                      {archiveLoaded ? division.totalHistoricalEvents.toLocaleString() : 'Not loaded'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-carbon-60">Active Forecasts:</span>
                    <span className="font-semibold text-nasa-blue-shade">
                      {feed === 'none' ? 'Not loaded' : `${division.activeForecastsCount} records`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-carbon-60">Primary Hazard:</span>
                    <span className="font-medium text-amber-700 truncate max-w-[130px]">{division.primaryHazard}</span>
                  </div>
                </div>

                {division.topDistricts.length > 0 && (
                  <div className="mt-3 pt-2">
                    <div className="text-xs text-carbon-60 mb-1">Key Districts:</div>
                    <div className="flex flex-wrap gap-1">
                      {division.topDistricts.map(dist => (
                        <span key={dist} className="px-2 py-0.5 bg-carbon-05 border border-carbon-20 text-carbon-60 rounded text-xs">
                          {dist}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-carbon-20 flex min-h-[44px] items-center justify-between text-sm font-semibold text-nasa-blue-shade">
                <span>View division</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DivisionsPage;
