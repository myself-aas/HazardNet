import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  MapPin,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Calendar,
  Layers,
  CloudRain,
  Wind,
  Search,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { fetchDivisionEvents, DivisionEventsResponse, ClimaticEvent, ForecastRecord } from '../lib/eventsClient';

const ALL_DIVISIONS = [
  { id: 'dhaka', name: 'Dhaka' },
  { id: 'chattogram', name: 'Chattogram' },
  { id: 'rajshahi', name: 'Rajshahi' },
  { id: 'khulna', name: 'Khulna' },
  { id: 'barisal', name: 'Barisal' },
  { id: 'sylhet', name: 'Sylhet' },
  { id: 'rangpur', name: 'Rangpur' },
  { id: 'mymensingh', name: 'Mymensingh' },
];

const HAZARD_COLORS: Record<string, string> = {
  'Tropical Cyclone': '#ef4444',
  'Flood': '#3b82f6',
  'Flash Flood': '#06b6d4',
  'Severe Local Storm': '#f59e0b',
  'Cold Wave': '#6366f1',
  'Drought': '#d97706',
  'Heat Wave': '#ea580c',
  'Earthquake': '#8b5cf6',
  'Fire': '#dc2626',
};

export const DivisionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const divisionId = (id || 'dhaka').toLowerCase();

  const [data, setData] = useState<DivisionEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for historical table
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHazard, setSelectedHazard] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadDivision() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchDivisionEvents(divisionId);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to load division events data');
          setLoading(false);
        }
      }
    }
    loadDivision();
    return () => { mounted = false; };
  }, [divisionId]);

  // Unique hazards and districts in this division for filter dropdowns
  const availableHazards = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.allEvents.map(e => e.hazard))).sort();
  }, [data]);

  const availableDistricts = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.allEvents.map(e => e.district))).sort();
  }, [data]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.allEvents.filter(e => {
      const matchesSearch = searchQuery === '' ||
        e.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.hazard.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.glide.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.desc.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesHazard = selectedHazard === 'all' || e.hazard === selectedHazard;
      const matchesDistrict = selectedDistrict === 'all' || e.district === selectedDistrict;

      return matchesSearch && matchesHazard && matchesDistrict;
    });
  }, [data, searchQuery, selectedHazard, selectedDistrict]);

  // Forecast Comparison Chart Data (per district in this division)
  const forecastChartData = useMemo(() => {
    if (!data || !data.districtRankings) return [];
    return data.districtRankings.map(d => ({
      district: d.district,
      '7-Day Severity': d.forecast7DSeverity !== null ? d.forecast7DSeverity : 0,
      '15-Day Severity': d.forecast15DSeverity !== null ? d.forecast15DSeverity : 0,
      forecast7DHazard: d.forecast7DHazard,
      forecast15DHazard: d.forecast15DHazard,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-carbon-05 flex items-center justify-center p-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-nasa-blue-shade animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-carbon-70">Loading {divisionId} division climatic data...</p>
          <p className="text-xs text-carbon-60 mt-1">Parsing historical events (2000-2026) & forecast tensors</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-carbon-05 flex items-center justify-center p-6">
        <div className="bg-white border border-carbon-20 p-8 max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-carbon-90">Failed to Load Division Data</h2>
          <p className="text-xs text-carbon-60 mt-2">{error || 'Division data not found.'}</p>
          <Link
            to="/divisions"
            className="mt-5 inline-flex min-h-[44px] items-center px-4 bg-nasa-blue text-white text-sm font-semibold hover:bg-nasa-blue-shade"
          >
            Back to Divisions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-carbon-05 text-carbon-80 pb-8 pt-6 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-carbon-60 mb-4">
        <Link to="/" className="hover:text-nasa-blue-shade transition-colors">Home</Link>
        <span>/</span>
        <Link to="/divisions" className="hover:text-nasa-blue-shade transition-colors">Divisions</Link>
        <span>/</span>
        <span className="text-carbon-80 font-medium">{data.division}</span>
      </div>

      {/* Division Switcher Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 scrollbar-none">
        {ALL_DIVISIONS.map(d => {
          const isActive = d.id === divisionId;
          return (
            <button
              key={d.id}
              onClick={() => navigate(`/divisions/${d.id}`)}
              className={`inline-flex min-h-[44px] items-center px-3 text-sm font-semibold whitespace-nowrap touch-manipulation ${
                isActive
                  ? 'bg-nasa-blue text-white'
                  : 'bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-10 hover:text-carbon-90'
              }`}
            >
              {d.name}
            </button>
          );
        })}
      </div>

      {/* Header Profile Card */}
      <div className="bg-white border border-carbon-20 p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold bg-carbon-05 text-nasa-blue-shade border border-carbon-20 mb-3">
              <MapPin className="w-3.5 h-3.5" />
              <span>Administrative Division Dashboard</span>
            </div>
            <h1 className="text-[28px] font-bold sm:text-[32px] text-carbon-90 tracking-tight">
              {data.division} Division
            </h1>
            <p className="mt-1.5 text-base leading-[1.62] text-carbon-70 max-w-2xl">
              Covering {data.totalDistricts} constituent districts with {data.totalEvents.toLocaleString()} verified climatic disaster events recorded between 2000 and 2026. Primary regional vulnerability: <span className="font-semibold text-carbon-90">{data.primaryHazard}</span>.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-carbon-90">{data.totalDistricts}</div>
              <div className="text-xs text-carbon-60 font-medium">Districts</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-nasa-blue-shade">{data.totalEvents.toLocaleString()}</div>
              <div className="text-xs text-carbon-60 font-medium">Recorded Events</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-amber-700">{data.forecasts.length}</div>
              <div className="text-xs text-carbon-60 font-medium">Active Forecasts</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-carbon-90">2000-2026</div>
              <div className="text-xs text-carbon-60 font-medium">Archive Span</div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Forecast Alert Matrix for this Division */}
      {data.forecasts.length > 0 && (
        <div className="bg-white border border-carbon-20 p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-carbon-10 gap-2">
            <div>
              <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-nasa-blue-shade" />
                Active Model Forecasts Across {data.division} Districts
              </h2>
              <p className="text-xs text-carbon-60">
                Directly from latest 7-day and 15-day AI tensor predictions (hazardnet_forecasts_latest.csv)
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-carbon-05 text-nasa-blue-shade rounded-md">
              {data.forecasts.length} Tensors Active
            </span>
          </div>

          {/* Interactive Rechart: District Forecast Severity Comparison */}
          <div className="pt-4 pb-2">
            <h3 className="text-xs font-bold text-carbon-70 uppercase tracking-wider mb-2">
              District Forecast Severity Comparison (7-Day vs 15-Day Horizons)
            </h3>
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastChartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                  <XAxis dataKey="district" tick={{ fontSize: 11, fill: '#58585b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#58585b' }} domain={[0, 4]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px' }} />
                  <Bar dataKey="7-Day Severity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="15-Day Severity" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* District Forecast Table */}
          <div className="overflow-x-auto mt-4 pt-4 border-t border-carbon-10">
            <table className="w-full text-left text-xs">
              <thead className="bg-carbon-05 text-carbon-60 font-semibold border-b border-carbon-20">
                <tr>
                  <th className="p-3">District</th>
                  <th className="p-3">7-Day Threat</th>
                  <th className="p-3">7-Day Severity</th>
                  <th className="p-3">15-Day Threat</th>
                  <th className="p-3">15-Day Severity</th>
                  <th className="p-3">Precipitation (mm)</th>
                  <th className="p-3">Max Wind (km/h)</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-10">
                {data.districtRankings.map((dr) => {
                  const f7 = data.forecasts.find(f => f.districtName.toLowerCase() === dr.district.toLowerCase() && f.horizon === '7_days');
                  const f15 = data.forecasts.find(f => f.districtName.toLowerCase() === dr.district.toLowerCase() && f.horizon === '15_days');
                  const targetDistrictSlug = dr.district.toLowerCase().replace(/[^a-z0-9]/g, '');

                  return (
                    <tr key={dr.district} className="hover:bg-carbon-05/80 transition-colors">
                      <td className="p-3 font-semibold text-carbon-90">{dr.district}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-carbon-05 text-nasa-blue-shade border border-carbon-20">
                          {dr.forecast7DHazard || 'No threat'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-semibold ${
                          (dr.forecast7DSeverity || 0) >= 2.5 ? 'text-red-600' :
                          (dr.forecast7DSeverity || 0) >= 1.5 ? 'text-amber-600' : 'text-carbon-70'
                        }`}>
                          {dr.forecast7DSeverity !== null ? dr.forecast7DSeverity.toFixed(2) : 'N/A'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          {dr.forecast15DHazard || 'No threat'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-semibold ${
                          (dr.forecast15DSeverity || 0) >= 2.5 ? 'text-red-600' :
                          (dr.forecast15DSeverity || 0) >= 1.5 ? 'text-amber-600' : 'text-carbon-70'
                        }`}>
                          {dr.forecast15DSeverity !== null ? dr.forecast15DSeverity.toFixed(2) : 'N/A'}
                        </span>
                      </td>
                      <td className="p-3 text-carbon-60">
                        {f7 ? `${f7.precipitationMm.toFixed(1)} mm` : '-'}
                      </td>
                      <td className="p-3 text-carbon-60">
                        {f7 ? `${f7.windMaxKmh.toFixed(1)} km/h` : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          to={`/forecast/district/${targetDistrictSlug}`}
                          className="inline-flex items-center gap-1 text-nasa-blue-shade hover:text-nasa-blue-shade font-semibold"
                        >
                          <span>District Page</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interactive Historical Recharts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Chart 1: Yearly Trend 2000-2026 */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-nasa-blue-shade" />
                26-Year Historical Disaster Trend (2000–2026)
              </h3>
              <p className="text-xs text-carbon-60">Total events recorded per year in {data.division}</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70 rounded">
              {data.yearlyTrend.reduce((a, b) => a + b.total, 0)} Total
            </span>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.yearlyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <defs>
                  <linearGradient id="divAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#58585b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="total" name="Disaster Events" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#divAreaGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: District Vulnerability Ranking */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <Layers className="w-4 h-4 text-nasa-blue-shade" />
                Constituent Districts Disaster Exposure
              </h3>
              <p className="text-xs text-carbon-60">Historical disaster frequency across {data.division} districts</p>
            </div>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.districtRankings} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis dataKey="district" type="category" tick={{ fontSize: 11, fill: '#58585b' }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="eventCount" name="Total Events (2000-2026)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Monthly Seasonality Curve */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-nasa-blue-shade" />
                Monthly Seasonality Curve (Jan–Dec)
              </h3>
              <p className="text-xs text-carbon-60">Calendar month disaster distribution in {data.division}</p>
            </div>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.seasonalPattern} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#58585b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="count" name="Monthly Events" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Hazard Mix Breakdown */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-nasa-blue-shade" />
                Hazard Type Composition
              </h3>
              <p className="text-xs text-carbon-60">Breakdown of disaster types experienced in this division</p>
            </div>
          </div>
          <div className="h-64 w-full pt-4 flex flex-col sm:flex-row items-center justify-between">
            <div className="w-full sm:w-1/2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.hazardBreakdown}
                    dataKey="count"
                    nameKey="hazard"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data.hazardBreakdown.map((entry) => (
                      <Cell key={entry.hazard} fill={HAZARD_COLORS[entry.hazard] || '#77777a'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 space-y-1.5 text-xs max-h-56 overflow-y-auto pr-2">
              {data.hazardBreakdown.map((h) => (
                <div key={h.hazard} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5" style={{ backgroundColor: HAZARD_COLORS[h.hazard] || '#77777a' }} />
                    <span className="font-medium text-carbon-70 truncate max-w-[130px]">{h.hazard}</span>
                  </div>
                  <span className="text-carbon-60 font-semibold">{h.count} ({h.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Historical Disaster Events Archive Table (Real data from CSV) */}
      <div className="bg-white border border-carbon-20 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-carbon-10 gap-4">
          <div>
            <h3 className="text-base font-bold text-carbon-90 flex items-center gap-2">
              <Layers className="w-4 h-4 text-nasa-blue-shade" />
              Historical Climatic Events Archive ({data.division} Division)
            </h3>
            <p className="text-xs text-carbon-60">
              Showing {filteredEvents.length} of {data.totalEvents} verified records from BGD_climatic_hazards_dataset_2000_2026.csv
            </p>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-carbon-60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, GLIDE, desc..."
                className="h-11 min-h-[44px] pl-8 pr-3 text-base border border-carbon-20 bg-carbon-05 text-carbon-80 placeholder-carbon-40 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
              />
            </div>

            <select
              value={selectedHazard}
              onChange={(e) => setSelectedHazard(e.target.value)}
              className="h-11 min-h-[44px] py-1.5 px-2.5 text-base border border-carbon-20 bg-carbon-05 text-carbon-70 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
            >
              <option value="all">All Hazards</option>
              {availableHazards.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>

            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="h-11 min-h-[44px] py-1.5 px-2.5 text-base border border-carbon-20 bg-carbon-05 text-carbon-70 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
            >
              <option value="all">All Districts</option>
              {availableDistricts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs">
            <thead className="bg-carbon-05 text-carbon-60 font-semibold border-b border-carbon-20">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">District</th>
                <th className="p-3">Hazard Type</th>
                <th className="p-3">GLIDE</th>
                <th className="p-3">Severity Score</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-10">
              {filteredEvents.slice(0, 40).map((event) => {
                const isExpanded = expandedEventId === event.id;
                const hazardColor = HAZARD_COLORS[event.hazard] || '#77777a';
                const districtSlug = event.district.toLowerCase().replace(/[^a-z0-9]/g, '');

                return (
                  <React.Fragment key={event.id}>
                    <tr className="hover:bg-carbon-05/80 transition-colors">
                      <td className="p-3 font-medium text-carbon-90 whitespace-nowrap">{event.date}</td>
                      <td className="p-3 font-semibold text-carbon-80">
                        <Link to={`/forecast/district/${districtSlug}`} className="hover:text-nasa-blue-shade">
                          {event.district}
                        </Link>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: `${hazardColor}15`,
                            color: hazardColor,
                            border: `1px solid ${hazardColor}30`,
                          }}
                        >
                          {event.hazard}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-carbon-60 whitespace-nowrap">{event.glide || '—'}</td>
                      <td className="p-3 font-bold text-carbon-70">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          event.severity >= 3.0 ? 'bg-carbon-05 text-nasa-red-shade border border-carbon-20' :
                          event.severity >= 2.0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-carbon-10 text-carbon-70'
                        }`}>
                          {event.severity ? event.severity.toFixed(2) : '1.00'}
                        </span>
                      </td>
                      <td className="p-3 text-carbon-60 max-w-xs truncate">
                        {event.desc || 'No descriptive summary logged'}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                          className="text-nasa-blue-shade font-semibold inline-flex min-h-[44px] items-center gap-1 cursor-pointer touch-manipulation"
                        >
                          <span>{isExpanded ? 'Less' : 'Details'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-carbon-05/30">
                        <td colSpan={7} className="p-4 border-b border-carbon-20">
                          <div className="bg-white border border-carbon-20 p-4 text-xs space-y-2">
                            <div className="flex items-center justify-between text-carbon-60 pb-2 border-b border-carbon-10">
                              <span><strong>Event ID:</strong> {event.id}</span>
                              <span><strong>Coordinates:</strong> {event.lat.toFixed(4)}, {event.lng.toFixed(4)}</span>
                              <span><strong>GLIDE Reference:</strong> {event.glide || 'None assigned'}</span>
                            </div>
                            <p className="text-carbon-70 leading-relaxed pt-1">
                              <strong>Report Summary:</strong> {event.desc || 'No detailed narrative logged for this event.'}
                            </p>
                            <div className="pt-2 flex justify-end">
                              <Link
                                to={`/forecast/district/${districtSlug}`}
                                className="inline-flex items-center gap-1 text-nasa-blue-shade hover:text-nasa-blue-shade font-semibold"
                              >
                                <span>Go to {event.district} District Dashboard</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredEvents.length === 0 && (
            <div className="py-8 text-center text-carbon-60 text-xs">
              No historical events match the specified filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DivisionDetailPage;
