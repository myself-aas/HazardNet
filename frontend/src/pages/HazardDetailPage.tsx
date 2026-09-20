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
  AlertTriangle,
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
  Calendar,
  Layers,
  MapPin,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { fetchHazardEvents, HazardEventsResponse, ClimaticEvent, ForecastRecord } from '../lib/eventsClient';

const ALL_HAZARD_PILLS = [
  { slug: 'cyclone', name: 'Tropical Cyclone', icon: Wind },
  { slug: 'flood', name: 'Flood', icon: Droplets },
  { slug: 'flash-flood', name: 'Flash Flood', icon: Waves },
  { slug: 'severe-local-storm', name: 'Severe Local Storm', icon: CloudLightning },
  { slug: 'cold-wave', name: 'Cold Wave', icon: Snowflake },
  { slug: 'drought', name: 'Drought', icon: Sun },
  { slug: 'heat-wave', name: 'Heat Wave', icon: Sun },
  { slug: 'earthquake', name: 'Earthquake', icon: Activity },
  { slug: 'fire', name: 'Fire', icon: Flame },
];

const HAZARD_METADATA: Record<string, { definition: string; vulnerableZones: string; triggers: string; season: string; color: string }> = {
  'cyclone': {
    definition: 'Intense tropical cyclonic storms originating in the southern Bay of Bengal producing destructive cyclonic winds and 3–9 meter coastal storm surges.',
    vulnerableZones: 'Coastal belt including Barguna, Patuakhali, Bhola, Noakhali, Chattogram, Cox\'s Bazar, and Khulna coastal polders.',
    triggers: 'Sea surface temperatures > 28°C, low vertical wind shear, and Coriolis vorticity amplification.',
    season: 'Pre-monsoon (April–May) and Post-monsoon (October–November)',
    color: '#ef4444',
  },
  'flood': {
    definition: 'Extensive riverine overbanking and widespread flood inundation driven by monsoon precipitation across transboundary upstream catchments in India, Nepal, and Bhutan.',
    vulnerableZones: 'Brahmaputra-Jamuna floodplains (Kurigram, Gaibandha, Sirajganj), Ganges basin (Rajbari, Faridpur), and Meghna confluence.',
    triggers: 'Excessive Himalayan precipitation, synchronized river crests, and high downstream sea levels retarding drainage.',
    season: 'June through September (South-West Monsoon)',
    color: '#3b82f6',
  },
  'flash-flood': {
    definition: 'Rapidly rising, high-velocity flood flows occurring within 3 to 6 hours of localized high-intensity rainfall in adjacent upstream Meghalaya and Tripura hills.',
    vulnerableZones: 'North-eastern Haor wetland basin covering Sunamganj, Sylhet, Netrokona, Kishoreganj, and Habiganj.',
    triggers: 'Pre-monsoon convective thunderstorms and steep catchment gradients across the Meghalaya plateau border.',
    season: 'April through June (Pre-Monsoon Boro harvest window)',
    color: '#06b6d4',
  },
  'severe-local-storm': {
    definition: 'Meso-scale convective systems manifesting as violent squall lines (Norwesters / Kalbaishakhi), localized tornado funnels, severe hail, and intense cloud-to-ground lightning.',
    vulnerableZones: 'Central and south-western plains including Brahmanbaria, Cumilla, Tangail, Manikganj, and Faridpur.',
    triggers: 'Interaction between warm moist Bay of Bengal air and dry cool north-westerly continental air masses.',
    season: 'March through May (Spring / Hot Weather Period)',
    color: '#f59e0b',
  },
  'cold-wave': {
    definition: 'Sustained sub-normal ambient temperature anomalies (<10°C minimum temperatures) accompanied by persistent high-pressure radiative fog blankets.',
    vulnerableZones: 'North-western frontier districts: Panchagarh, Dinajpur, Thakurgaon, Kurigram, and Nilphamari.',
    triggers: 'Continental cold air outflow from the sub-Himalayan plains during stable winter anticyclonic regimes.',
    season: 'December through January (Winter)',
    color: '#6366f1',
  },
  'drought': {
    definition: 'Prolonged deficit in meteorological rainfall and depleted root-zone soil moisture leading to hydrological drought and agricultural crop failure.',
    vulnerableZones: 'High Barind Tract in Rajshahi, Chapainawabganj, Naogaon, and Kushtia.',
    triggers: 'Delayed monsoon onset, break-monsoon spells, and declining regional groundwater tables.',
    season: 'February through May (Rabi and Pre-Kharif seasons)',
    color: '#d97706',
  },
  'heat-wave': {
    definition: 'Consecutive days of extreme thermal heat index with maximum ambient temperatures exceeding 36°C (mild), 38°C (moderate), or 40°C (severe).',
    vulnerableZones: 'Western and central districts including Chuadanga, Rajshahi, Jashore, Dhaka, and Pabna.',
    triggers: 'Dry westerly continental advection, clear insolation skies, and urban heat island amplification.',
    season: 'April through June',
    color: '#ea580c',
  },
  'earthquake': {
    definition: 'Tectonic ground shaking generated by brittle fault rupture along active tectonic boundaries bordering Bangladesh.',
    vulnerableZones: 'Dauki Fault zone (Sylhet, Mymensingh) and Chittagong-Tripura folded belt (Chattogram, Rangamati, Bandarban).',
    triggers: 'Active subduction and oblique collision of the Indian Plate beneath the Eurasian and Burma plates.',
    season: 'Aseasonal / Geological risk',
    color: '#8b5cf6',
  },
  'fire': {
    definition: 'Uncontrolled structural and open agricultural fires spreading through dry combustible vegetation or dense rural settlements.',
    vulnerableZones: 'Dry rural settlements, harvest crop fields, and dense informal commercial clusters across all divisions.',
    triggers: 'Low relative humidity (<30%), elevated ambient temperature, and strong gusty surface winds.',
    season: 'March through May (Dry Summer Period)',
    color: '#dc2626',
  },
};

export const HazardDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const rawSlug = (slug || 'flood').toLowerCase();

  // Normalize slug to match catalog
  const currentSlug = useMemo(() => {
    if (rawSlug.includes('cyclone')) return 'cyclone';
    if (rawSlug.includes('flash')) return 'flash-flood';
    if (rawSlug.includes('storm')) return 'severe-local-storm';
    if (rawSlug.includes('cold')) return 'cold-wave';
    if (rawSlug.includes('heat')) return 'heat-wave';
    if (rawSlug.includes('drought')) return 'drought';
    if (rawSlug.includes('quake') || rawSlug.includes('earthquake')) return 'earthquake';
    if (rawSlug.includes('fire')) return 'fire';
    return 'flood';
  }, [rawSlug]);

  const meta = HAZARD_METADATA[currentSlug] || HAZARD_METADATA['flood'];

  const [data, setData] = useState<HazardEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for historical table
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadHazard() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchHazardEvents(currentSlug);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to load hazard events data');
          setLoading(false);
        }
      }
    }
    loadHazard();
    return () => { mounted = false; };
  }, [currentSlug]);

  // Unique divisions and districts for filters
  const availableDivisions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.allEvents.map(e => e.division))).sort();
  }, [data]);

  const availableDistricts = useMemo(() => {
    if (!data) return [];
    const list = selectedDivision === 'all'
      ? data.allEvents.map(e => e.district)
      : data.allEvents.filter(e => e.division === selectedDivision).map(e => e.district);
    return Array.from(new Set(list)).sort();
  }, [data, selectedDivision]);

  // Filtered historical events
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.allEvents.filter(e => {
      const matchesSearch = searchQuery === '' ||
        e.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.division.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.glide.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.desc.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesDiv = selectedDivision === 'all' || e.division === selectedDivision;
      const matchesDist = selectedDistrict === 'all' || e.district === selectedDistrict;

      return matchesSearch && matchesDiv && matchesDist;
    });
  }, [data, searchQuery, selectedDivision, selectedDistrict]);

  // Top 15 districts chart data
  const top15Districts = useMemo(() => {
    if (!data || !data.topDistricts) return [];
    return data.topDistricts.slice(0, 15).map(d => ({
      district: d.district,
      division: d.division,
      count: d.count,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-carbon-05 flex items-center justify-center p-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-nasa-blue-shade animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-carbon-70">Loading {data?.hazard || currentSlug} hazard data...</p>
          <p className="text-xs text-carbon-60 mt-1">Cross-referencing historical events & active warning tensors</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-carbon-05 flex items-center justify-center p-6">
        <div className="bg-white border border-carbon-20 p-8 max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-carbon-90">Failed to Load Hazard Data</h2>
          <p className="text-xs text-carbon-60 mt-2">{error || 'Hazard data not found.'}</p>
          <Link
            to="/hazards"
            className="mt-5 inline-flex min-h-[44px] items-center px-4 bg-nasa-blue text-white text-sm font-semibold hover:bg-nasa-blue-shade"
          >
            Back to Hazards
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
        <Link to="/hazards" className="hover:text-nasa-blue-shade transition-colors">Hazards</Link>
        <span>/</span>
        <span className="text-carbon-80 font-medium">{data.hazard}</span>
      </div>

      {/* Hazard Switcher Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 scrollbar-none">
        {ALL_HAZARD_PILLS.map(h => {
          const isActive = h.slug === currentSlug;
          const Icon = h.icon;
          return (
            <button
              key={h.slug}
              onClick={() => navigate(`/hazards/${h.slug}`)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 px-3 text-sm font-semibold whitespace-nowrap touch-manipulation ${
                isActive
                  ? 'bg-nasa-blue text-white'
                  : 'bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-10 hover:text-carbon-90'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{h.name}</span>
            </button>
          );
        })}
      </div>

      {/* Hazard Profile Header */}
      <div className="bg-white border border-carbon-20 p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold mb-3" style={{ backgroundColor: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>National Peril Profile</span>
            </div>
            <h1 className="text-[28px] font-bold sm:text-[32px] text-carbon-90 tracking-tight">
              {data.hazard}
            </h1>
            <p className="mt-2 text-base leading-[1.62] text-carbon-70 max-w-2xl">
              {meta.definition}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-carbon-60">
              <div><strong className="text-carbon-70">Peak Season:</strong> {meta.season}</div>
              <div><strong className="text-carbon-70">Key Triggers:</strong> {meta.triggers}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-nasa-blue-shade">{data.totalEvents.toLocaleString()}</div>
              <div className="text-xs text-carbon-60 font-medium">Historical Records</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-amber-700">{data.forecasts.length}</div>
              <div className="text-xs text-carbon-60 font-medium">Active Forecasts</div>
            </div>
            <div className="bg-carbon-05 border border-carbon-20/80 p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-xl font-bold text-carbon-90">{data.forecastDistrictsCount}</div>
              <div className="text-xs text-carbon-60 font-medium">Districts Under Alert</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Forecast Alert Matrix for this Hazard */}
      {data.forecasts.length > 0 && (
        <div className="bg-white border border-carbon-20 p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-carbon-10 gap-2">
            <div>
              <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Active Forecast Warnings for {data.hazard} Across Bangladesh
              </h2>
              <p className="text-xs text-carbon-60">
                Identified in latest run from hazardnet_forecasts_latest.csv
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
              {data.forecasts.length} Active Warnings
            </span>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-carbon-05 text-carbon-60 font-semibold border-b border-carbon-20">
                <tr>
                  <th className="p-3">District</th>
                  <th className="p-3">Division</th>
                  <th className="p-3">Horizon</th>
                  <th className="p-3">Target Date</th>
                  <th className="p-3">Model Severity</th>
                  <th className="p-3">Physics Severity</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">Precipitation</th>
                  <th className="p-3">Wind Speed</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-10">
                {data.forecasts.map((fc, idx) => {
                  const districtSlug = fc.districtName.toLowerCase().replace(/[^a-z0-9]/g, '');
                  return (
                    <tr key={`${fc.districtName}-${fc.horizon}-${idx}`} className="hover:bg-carbon-05/80 transition-colors">
                      <td className="p-3 font-semibold text-carbon-90">{fc.districtName}</td>
                      <td className="p-3 text-carbon-60">
                        <Link to={`/divisions/${fc.division.toLowerCase()}`} className="hover:text-nasa-blue-shade">
                          {fc.division}
                        </Link>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-carbon-10 text-carbon-70">
                          {fc.horizon === '7_days' ? '7-Day' : '15-Day'}
                        </span>
                      </td>
                      <td className="p-3 text-carbon-60 whitespace-nowrap">{fc.targetDate}</td>
                      <td className="p-3 font-semibold text-nasa-blue-shade">{fc.modelSeverity.toFixed(2)}</td>
                      <td className="p-3 font-semibold text-amber-700">{fc.physicsSeverity.toFixed(2)}</td>
                      <td className="p-3 text-carbon-60">{Math.round(fc.confidence * 100)}%</td>
                      <td className="p-3 text-carbon-60">{fc.precipitationMm.toFixed(1)} mm</td>
                      <td className="p-3 text-carbon-60">{fc.windMaxKmh.toFixed(1)} km/h</td>
                      <td className="p-3 text-right">
                        <Link
                          to={`/forecast/district/${districtSlug}`}
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

      {/* Interactive Recharts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Chart 1: 26-Year Historical Disaster Trend */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-nasa-blue-shade" />
                26-Year Historical Occurrence Trend (2000–2026)
              </h3>
              <p className="text-xs text-carbon-60">Annual occurrences of {data.hazard} across Bangladesh</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70 rounded">
              {data.totalEvents} Total Events
            </span>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.yearlyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#58585b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" name="Recorded Events" fill={meta.color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Top 15 Most Impacted Districts */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-nasa-blue-shade" />
                Top 15 Most Impacted Districts
              </h3>
              <p className="text-xs text-carbon-60">Districts recording highest {data.hazard} episodes</p>
            </div>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top15Districts} layout="vertical" margin={{ top: 10, right: 20, left: 30, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis dataKey="district" type="category" tick={{ fontSize: 11, fill: '#58585b' }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" name="Disaster Events" fill="#3b82f6" radius={[0, 4, 4, 0]} />
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
              <p className="text-xs text-carbon-60">Distribution of historical occurrences by calendar month</p>
            </div>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.seasonalPattern} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <defs>
                  <linearGradient id="hazardSeasonGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={meta.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={meta.color} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#58585b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="count" name="Events" stroke={meta.color} strokeWidth={2.5} fillOpacity={1} fill="url(#hazardSeasonGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Division Exposure Breakdown */}
        <div className="bg-white border border-carbon-20 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-carbon-10">
            <div>
              <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                <Layers className="w-4 h-4 text-nasa-blue-shade" />
                Regional Division Breakdown
              </h3>
              <p className="text-xs text-carbon-60">Geographic distribution of {data.hazard} across the 8 divisions</p>
            </div>
          </div>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.divisionBreakdown} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e3e3" vertical={false} />
                <XAxis dataKey="division" tick={{ fontSize: 11, fill: '#58585b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#58585b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d1d1', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" name="Events" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Historical Disaster Events Archive Table for this Hazard */}
      <div className="bg-white border border-carbon-20 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-carbon-10 gap-4">
          <div>
            <h3 className="text-base font-bold text-carbon-90 flex items-center gap-2">
              <Layers className="w-4 h-4 text-nasa-blue-shade" />
              Verified Event Log ({data.hazard})
            </h3>
            <p className="text-xs text-carbon-60">
              Showing {filteredEvents.length} of {data.totalEvents} recorded incidents from BGD_climatic_hazards_dataset_2000_2026.csv
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
                placeholder="Search events, district, GLIDE..."
                className="h-11 min-h-[44px] pl-8 pr-3 text-base border border-carbon-20 bg-carbon-05 text-carbon-80 placeholder-carbon-40 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
              />
            </div>

            <select
              value={selectedDivision}
              onChange={(e) => { setSelectedDivision(e.target.value); setSelectedDistrict('all'); }}
              className="h-11 min-h-[44px] py-1.5 px-2.5 text-base border border-carbon-20 bg-carbon-05 text-carbon-70 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
            >
              <option value="all">All Divisions</option>
              {availableDivisions.map(d => (
                <option key={d} value={d}>{d}</option>
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
                <th className="p-3">Division</th>
                <th className="p-3">GLIDE</th>
                <th className="p-3">Severity Score</th>
                <th className="p-3">Summary</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-10">
              {filteredEvents.slice(0, 40).map((event) => {
                const isExpanded = expandedEventId === event.id;
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
                      <td className="p-3 text-carbon-60">{event.division}</td>
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
                              <span><strong>GLIDE:</strong> {event.glide || 'None assigned'}</span>
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

export default HazardDetailPage;
