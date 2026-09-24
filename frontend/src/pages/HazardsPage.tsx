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
  Wind,
  Droplets,
  Waves,
  CloudLightning,
  Snowflake,
  Sun,
  Activity,
  Flame,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { fetchEventsSummary, fetchAllForecastRecords, EventsSummary, ForecastRecord } from '../lib/eventsClient';

interface HazardCardData {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: any;
  season: string;
  description: string;
  totalHistoricalEvents: number;
  percentage: number;
  activeForecastsCount: number;
  topDivisions: string[];
}

const HAZARDS_CATALOG = [
  {
    id: 'cyclone',
    slug: 'cyclone',
    name: 'Tropical Cyclone',
    color: '#ef4444',
    icon: Wind,
    season: 'May, Oct - Nov (Pre & Post-Monsoon)',
    description: 'Catastrophic marine vortexes accompanied by storm surges penetrating coastal embankments in the Bay of Bengal.',
  },
  {
    id: 'flood',
    slug: 'flood',
    name: 'Flood',
    color: '#3b82f6',
    icon: Droplets,
    season: 'Jun - Sep (Monsoon Inundation)',
    description: 'Major transboundary river swells across the Brahmaputra, Ganges, and Meghna basins affecting millions.',
  },
  {
    id: 'flash-flood',
    slug: 'flash-flood',
    name: 'Flash Flood',
    color: '#06b6d4',
    icon: Waves,
    season: 'Apr - Jun (Pre-Monsoon Haor Basins)',
    description: 'Sudden, high-velocity hill torrents rushing from Meghalaya and Tripura hills drowning standing Boro paddy.',
  },
  {
    id: 'severe-local-storm',
    slug: 'severe-local-storm',
    name: 'Severe Local Storm',
    color: '#f59e0b',
    icon: CloudLightning,
    season: 'Mar - May (Norwesters / Kalbaishakhi)',
    description: 'Violent squalls, tornado cells, lightning strikes, and hailstorms causing localized structural and crop ruin.',
  },
  {
    id: 'cold-wave',
    slug: 'cold-wave',
    name: 'Cold Wave',
    color: '#6366f1',
    icon: Snowflake,
    season: 'Dec - Jan (Winter)',
    description: 'Severe temperature drops and persistent dense fog in the northern/north-western divisions harming health and crops.',
  },
  {
    id: 'drought',
    slug: 'drought',
    name: 'Drought',
    color: '#d97706',
    icon: Sun,
    season: 'Feb - May (Rabi & Pre-Kharif)',
    description: 'Soil moisture depletion and depleted aquifers in the Barind tract delaying aman and rabi sowing.',
  },
  {
    id: 'heat-wave',
    slug: 'heat-wave',
    name: 'Heat Wave',
    color: '#ea580c',
    icon: Sun,
    season: 'Apr - Jun (Pre-Monsoon)',
    description: 'Extreme thermal stress with ambient temperatures exceeding 40°C triggering power grid strain and livestock mortality.',
  },
  {
    id: 'earthquake',
    slug: 'earthquake',
    name: 'Earthquake',
    color: '#8b5cf6',
    icon: Activity,
    season: 'Seismic faults (Dauki, Chittagong-Tripura)',
    description: 'Tectonic vulnerability along the Dauki Fault and Indo-Burma subduction zones threatening dense urban centers.',
  },
  {
    id: 'fire',
    slug: 'fire',
    name: 'Fire',
    color: '#dc2626',
    icon: Flame,
    season: 'Mar - May (Dry Season)',
    description: 'Dry season structural and agricultural fires exacerbated by low humidity and strong southerly breezes.',
  },
];

export const HazardsPage: React.FC = () => {
  const [summary, setSummary] = useState<EventsSummary | null>(null);
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
      } catch (err) {
        console.error('Failed to load hazards summary:', err);
        setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  const hazardsList: HazardCardData[] = HAZARDS_CATALOG.map(h => {
    const histEvents = summary?.hazardBreakdown?.find(hb => hb.hazard.toLowerCase() === h.name.toLowerCase() || hb.hazard.toLowerCase().includes(h.slug) || h.name.toLowerCase().includes(hb.hazard.toLowerCase()))?.count
      || summary?.byHazard?.[h.name]
      || 0;
    const totalEvents = summary?.totalEvents || 3062;
    const pct = Math.round((histEvents / totalEvents) * 1000) / 10;
    const activeFc = forecasts.filter(f => f.hazardType.toLowerCase().includes(h.slug) || h.name.toLowerCase().includes(f.hazardType.toLowerCase()));

    return {
      ...h,
      totalHistoricalEvents: histEvents,
      percentage: pct,
      activeForecastsCount: activeFc.length,
      topDivisions: ['Dhaka', 'Chattogram', 'Sylhet'],
    };
  });

  const chartData = hazardsList.map(h => ({
    name: h.name,
    'Historical Occurrences': h.totalHistoricalEvents,
    'Active Warning Records': h.activeForecastsCount,
  })).sort((a, b) => b['Historical Occurrences'] - a['Historical Occurrences']);

  return (
    <div className="min-h-screen bg-carbon-05 text-carbon-80 pb-8 pt-6 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-carbon-60 mb-4">
        <Link to="/" className="hover:text-nasa-blue-shade transition-colors">Home</Link>
        <span>/</span>
        <span className="text-carbon-80 font-medium">Hazards</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white border border-carbon-20 p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold bg-carbon-05 text-nasa-red-shade border border-carbon-20 mb-3">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Multi-Hazard Classification Framework</span>
            </div>
            <h1 className="text-[28px] font-bold sm:text-[32px] text-carbon-90 tracking-tight">
              Climatic Hazards of Bangladesh
            </h1>
            <p className="mt-2 text-base leading-[1.62] text-carbon-70 max-w-2xl leading-relaxed">
              Comprehensive taxonomy and real-time record monitoring for the 9 primary disaster perils documented in Bangladesh (2000–2026), grounded in the BGD Climatic Hazards Dataset and HazardNet forecasts.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-carbon-90">9</div>
              <div className="text-xs text-carbon-60 font-medium">Hazard Types</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-nasa-blue-shade">{summary?.totalEvents ?? '3,062'}</div>
              <div className="text-xs text-carbon-60 font-medium">Historical Records</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-xl sm:text-2xl font-bold text-amber-700">{forecasts.length}</div>
              <div className="text-xs text-carbon-60 font-medium">Active Forecasts</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive National Hazards Frequency Chart */}
      <div className="bg-white border border-carbon-20 p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-carbon-10 gap-2">
          <div>
            <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-nasa-blue-shade" />
              National Hazard Distribution & Alert Frequency
            </h2>
            <p className="text-xs text-carbon-60">
              Comparing historical frequency (2000-2026) with current active forecast warnings
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-carbon-10 text-carbon-70 rounded-md">
            Source: BGD Climatic Hazards Dataset (3,062 events)
          </span>
        </div>

        <div className="h-72 sm:h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#58585b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#58585b' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar dataKey="Historical Occurrences" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Active Warning Records" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 9 Hazards Cards Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-carbon-90">Individual Hazard Profiles</h2>
          <span className="text-xs text-carbon-60">Select any hazard for dedicated temporal and geographic analytics</span>
        </div>

        <div className="grid grid-cols-1 min-[880px]:grid-cols-2 min-[1200px]:grid-cols-3 gap-5">
          {hazardsList.map((hazard) => {
            const Icon = hazard.icon;
            return (
              <Link
                key={hazard.id}
                to={`/hazards/${hazard.slug}`}
                className="bg-white border border-carbon-20 p-6 hover:border-carbon-30 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="p-2.5 transition-colors"
                      style={{ backgroundColor: `${hazard.color}15`, color: hazard.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70">
                      {hazard.percentage}% of all events
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-carbon-90 group-hover:text-nasa-blue-shade transition-colors">
                    {hazard.name}
                  </h3>
                  <p className="text-xs text-carbon-60 mt-2 leading-relaxed line-clamp-2">
                    {hazard.description}
                  </p>

                  <div className="mt-4 pt-3 border-t border-carbon-10 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-carbon-60">2000–2026 Archive:</span>
                      <span className="font-bold text-carbon-90">{hazard.totalHistoricalEvents.toLocaleString()} events</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-carbon-60">Peak Season:</span>
                      <span className="font-medium text-carbon-70 truncate max-w-[170px]">{hazard.season}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-carbon-60">Active Warning Records:</span>
                      <span className="font-bold text-nasa-blue-shade">{hazard.activeForecastsCount} active</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-carbon-10 flex min-h-[44px] items-center justify-between text-sm font-semibold text-nasa-blue-shade">
                  <span>Explore hazard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HazardsPage;
