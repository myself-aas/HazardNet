import MaterialIcon from "./MaterialIcon";
import { useState } from 'react';
import ThirtyDayTrendChart from './ThirtyDayTrendChart';
import NationalOverview from './NationalOverview';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface District {
  id: string;
  name: string;
  division: string;
  lat: number;
  lng: number;
  risk: 'Low' | 'Moderate' | 'High';
  mainCrop: string;
}

interface RiskAnalyticsProps {
  onSelectDistrict?: (district: District) => void;
}

// 1. Multi-Year Historical & Projected Regional Trend Data (2018 - 2026)
const multiYearTrendData = [
  { year: '2018', Sylhet: 68, Rangpur: 54, Rajshahi: 42, Khulna: 60, Chattogram: 58, Dhaka: 38 },
  { year: '2019', Sylhet: 74, Rangpur: 62, Rajshahi: 45, Khulna: 78, Chattogram: 64, Dhaka: 41 },
  { year: '2020', Sylhet: 82, Rangpur: 75, Rajshahi: 48, Khulna: 85, Chattogram: 72, Dhaka: 49 },
  { year: '2021', Sylhet: 79, Rangpur: 68, Rajshahi: 52, Khulna: 71, Chattogram: 68, Dhaka: 44 },
  { year: '2022', Sylhet: 96, Rangpur: 88, Rajshahi: 59, Khulna: 80, Chattogram: 82, Dhaka: 55 },
  { year: '2023', Sylhet: 85, Rangpur: 72, Rajshahi: 64, Khulna: 88, Chattogram: 76, Dhaka: 48 },
  { year: '2024', Sylhet: 91, Rangpur: 82, Rajshahi: 68, Khulna: 84, Chattogram: 89, Dhaka: 52 },
  { year: '2025 (Proj)', Sylhet: 94, Rangpur: 86, Rajshahi: 72, Khulna: 91, Chattogram: 85, Dhaka: 56 },
  { year: '2026 (Proj)', Sylhet: 97, Rangpur: 89, Rajshahi: 75, Khulna: 94, Chattogram: 92, Dhaka: 58 }
];

// 2. Annual Occurrence Frequency (Number of Major Extreme Weather Events)
const occurrenceFrequencyData = [
  { year: '2018', Sylhet: 4, Rangpur: 3, Rajshahi: 2, Khulna: 3, Chattogram: 3 },
  { year: '2019', Sylhet: 5, Rangpur: 4, Rajshahi: 2, Khulna: 5, Chattogram: 4 },
  { year: '2020', Sylhet: 6, Rangpur: 5, Rajshahi: 3, Khulna: 6, Chattogram: 5 },
  { year: '2021', Sylhet: 5, Rangpur: 4, Rajshahi: 3, Khulna: 4, Chattogram: 4 },
  { year: '2022', Sylhet: 8, Rangpur: 7, Rajshahi: 4, Khulna: 6, Chattogram: 6 },
  { year: '2023', Sylhet: 6, Rangpur: 5, Rajshahi: 4, Khulna: 7, Chattogram: 5 },
  { year: '2024', Sylhet: 7, Rangpur: 6, Rajshahi: 5, Khulna: 6, Chattogram: 7 },
  { year: '2025 (Proj)', Sylhet: 8, Rangpur: 7, Rajshahi: 5, Khulna: 8, Chattogram: 7 },
  { year: '2026 (Proj)', Sylhet: 9, Rangpur: 8, Rajshahi: 6, Khulna: 8, Chattogram: 8 }
];

// 3. Monthly Seasonal Risk Cycle across Bangladesh Agricultural Calendar
const monthlySeasonalData = [
  { month: 'Jan', FlashFlood: 5, MonsoonFlood: 2, Cyclone: 10, Drought: 35, ColdWave: 85 },
  { month: 'Feb', FlashFlood: 8, MonsoonFlood: 3, Cyclone: 12, Drought: 48, ColdWave: 60 },
  { month: 'Mar', FlashFlood: 18, MonsoonFlood: 5, Cyclone: 25, Drought: 65, ColdWave: 15 },
  { month: 'Apr', FlashFlood: 72, MonsoonFlood: 12, Cyclone: 45, Drought: 78, ColdWave: 2 },
  { month: 'May', FlashFlood: 88, MonsoonFlood: 30, Cyclone: 82, Drought: 55, ColdWave: 0 },
  { month: 'Jun', FlashFlood: 92, MonsoonFlood: 75, Cyclone: 50, Drought: 20, ColdWave: 0 },
  { month: 'Jul', FlashFlood: 85, MonsoonFlood: 96, Cyclone: 30, Drought: 10, ColdWave: 0 },
  { month: 'Aug', FlashFlood: 70, MonsoonFlood: 90, Cyclone: 35, Drought: 12, ColdWave: 0 },
  { month: 'Sep', FlashFlood: 55, MonsoonFlood: 78, Cyclone: 60, Drought: 22, ColdWave: 0 },
  { month: 'Oct', FlashFlood: 30, MonsoonFlood: 45, Cyclone: 88, Drought: 30, ColdWave: 5 },
  { month: 'Nov', FlashFlood: 12, MonsoonFlood: 15, Cyclone: 75, Drought: 38, ColdWave: 25 },
  { month: 'Dec', FlashFlood: 4, MonsoonFlood: 5, Cyclone: 20, Drought: 42, ColdWave: 78 }
];

// 4. Regional Primary Hazard Distribution
const regionalHazardBreakdown = [
  { region: 'Sylhet (Haor)', FlashFlood: 65, MonsoonFlood: 20, Cyclone: 5, Drought: 5, ColdWave: 5 },
  { region: 'Rangpur (North)', FlashFlood: 25, MonsoonFlood: 45, Cyclone: 5, Drought: 10, ColdWave: 15 },
  { region: 'Rajshahi (Barind)', FlashFlood: 5, MonsoonFlood: 15, Cyclone: 5, Drought: 60, ColdWave: 15 },
  { region: 'Khulna (South)', FlashFlood: 10, MonsoonFlood: 25, Cyclone: 55, Drought: 10, ColdWave: 0 },
  { region: 'Chattogram (Coast)', FlashFlood: 20, MonsoonFlood: 20, Cyclone: 50, Drought: 10, ColdWave: 0 },
  { region: 'Dhaka (Central)', FlashFlood: 15, MonsoonFlood: 55, Cyclone: 15, Drought: 15, ColdWave: 0 }
];

// Region color palette
const REGION_COLORS = {
  Sylhet: '#38bdf8',      // Cyan / Sky
  Rangpur: '#34d399',     // Emerald
  Rajshahi: '#f59e0b',    // Amber
  Khulna: '#ef4444',      // Rose / Red
  Chattogram: '#a855f7',  // Purple
  Dhaka: '#6366f1'        // Indigo
};

const HAZARD_COLORS = {
  FlashFlood: '#38bdf8',
  MonsoonFlood: '#34d399',
  Cyclone: '#ef4444',
  Drought: '#f59e0b',
  ColdWave: '#a855f7'
};

const districtMap: Record<string, District> = {
  Sylhet: { id: 'sunamganj', name: 'Sunamganj (Sylhet)', division: 'Sylhet', lat: 25.0658, lng: 91.3950, risk: 'High', mainCrop: 'Boro Paddy (Haor Basin)' },
  Rangpur: { id: 'kurigram', name: 'Kurigram (Rangpur)', division: 'Rangpur', lat: 25.8058, lng: 89.6361, risk: 'High', mainCrop: 'Aman Rice & Jute' },
  Rajshahi: { id: 'rajshahi', name: 'Rajshahi', division: 'Rajshahi', lat: 24.3745, lng: 88.6042, risk: 'Moderate', mainCrop: 'Mango Orchards & Wheat' },
  Khulna: { id: 'satkhira', name: 'Satkhira (Khulna)', division: 'Khulna', lat: 22.7185, lng: 89.0705, risk: 'High', mainCrop: 'Shrimp Farming & Saline Rice' },
  Chattogram: { id: 'coxsbazar', name: 'Cox\'s Bazar', division: 'Chattogram', lat: 21.4272, lng: 92.0058, risk: 'High', mainCrop: 'Betel Leaf & Salt Agriculture' },
  Dhaka: { id: 'dhaka', name: 'Dhaka', division: 'Dhaka', lat: 23.8103, lng: 90.4125, risk: 'Moderate', mainCrop: 'Peri-urban Horticulture' }
};

// Custom Tooltip for Recharts
const CustomDarkTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 border border-slate-200 p-3 rounded-xl shadow-lg backdrop-blur-md text-xs font-sans space-y-1.5 z-50">
        <p className="font-extrabold text-slate-900 border-b border-slate-200 pb-1 flex items-center justify-between gap-4">
          <span>{label}</span>
          <span className="text-[10px] font-mono text-slate-500 font-normal">HazardNet Analytics</span>
        </p>
        <div className="space-y-1 pt-1">
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }}></span>
                <span className="text-slate-600 font-sans">{entry.name}:</span>
              </div>
              <span className="font-bold text-slate-900">{entry.value}{entry.unit || '%'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const RiskAnalytics: React.FC<RiskAnalyticsProps> = ({ onSelectDistrict }) => {
  const [metricMode, setMetricMode] = useState<'severity' | 'frequency'>('severity');
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('All');
  const [activeHazardType, setActiveHazardType] = useState<string>('All');

  const trendDataToUse = metricMode === 'severity' ? multiYearTrendData : occurrenceFrequencyData;

  const visibleRegions = selectedRegionFilter === 'All'
    ? ['Sylhet', 'Rangpur', 'Rajshahi', 'Khulna', 'Chattogram', 'Dhaka']
    : [selectedRegionFilter];

  return (
    <div className="space-y-6">

      {/* Top Banner KPI Header */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden">
        
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-slate-100/50 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/80">
                Multi-Regional Trend Intelligence
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-mono text-slate-500 font-semibold">
                Recharts Powered Time-Series
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Regional Risk Analytics & Climate Trends
            </h2>
            <p className="text-xs md:text-sm text-slate-600 mt-1 max-w-3xl">
              Multi-year historical and neural model projected trend analysis for agricultural disaster hazards in Bangladesh divisions (2018-2026).
            </p>
          </div>

          {/* Metric Mode Toggle */}
          <div className="flex items-center bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/90 self-start lg:self-center shadow-2xs">
            <button
              onClick={() => setMetricMode('severity')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                metricMode === 'severity'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Severity Index (%)</span>
            </button>
            <button
              onClick={() => setMetricMode('frequency')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                metricMode === 'frequency'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Occurrence Count (Events/yr)</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-200/90">
          
          <div className="bg-slate-50/80 border border-slate-200/90 p-4 rounded-2xl space-y-1 shadow-2xs hover:shadow-md transition-all">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
              Highest Risk Region
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold text-slate-900">Sylhet Haor Basin</span>
              <span className="text-xs font-bold text-rose-600 font-mono">Flash Flood</span>
            </div>
            <p className="text-[11px] text-slate-500">Pre-monsoon flash flood vulnerability</p>
          </div>

          <div className="bg-slate-50/80 border border-slate-200/90 p-4 rounded-2xl space-y-1 shadow-2xs hover:shadow-md transition-all">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
              Fastest Severity Spike
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold text-amber-700">Barind Tract (Rajshahi)</span>
              <span className="text-xs font-bold text-amber-700 font-mono">Rising trend</span>
            </div>
            <p className="text-[11px] text-slate-500">Intensified seasonal drought & heat stress</p>
          </div>

          <div className="bg-slate-50/80 border border-slate-200/90 p-4 rounded-2xl space-y-1 shadow-2xs hover:shadow-md transition-all">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
              Coastal Cyclone Hotspot
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold text-rose-700">Satkhira & Cox's Bazar</span>
              <span className="text-xs font-bold text-rose-600 font-mono">Storm surge</span>
            </div>
            <p className="text-[11px] text-slate-500">Tropical storm surge peak in Oct-Nov</p>
          </div>

          <div className="bg-slate-50/80 border border-slate-200/90 p-4 rounded-2xl space-y-1 shadow-2xs hover:shadow-md transition-all">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
              Protected Crop Acreage
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold text-emerald-700">Coastal & Haor Belts</span>
              <span className="text-xs font-bold text-emerald-600 font-mono">Advisory active</span>
            </div>
            <p className="text-[11px] text-slate-500">Early harvest advisories for pre-monsoon windows</p>
          </div>

        </div>

      </div>

      {/* Main Chart 1: Multi-Year Regional Trend Lines */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-4">
        
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              Regional Multi-Year Hazard Occurrence Trends (2018-2026)
            </h3>
            <p className="text-xs text-slate-500">
              Interactive Recharts line trajectories showing regional escalation curves for Bangladesh
            </p>
          </div>

          {/* Region Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-mono mr-1">Filter Region:</span>
            {['All', 'Sylhet', 'Rangpur', 'Rajshahi', 'Khulna', 'Chattogram', 'Dhaka'].map((reg) => (
              <button
                key={reg}
                onClick={() => setSelectedRegionFilter(reg)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  selectedRegionFilter === reg
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {reg}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Line Chart Viewport */}
        <div className="w-full h-[360px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendDataToUse}
              margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="year"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                unit={metricMode === 'severity' ? '%' : ''}
                domain={metricMode === 'severity' ? [0, 100] : [0, 'auto']}
              />
              <Tooltip content={<CustomDarkTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '12px', fontSize: '12px', color: '#023246' }}
              />

              {visibleRegions.map((region) => (
                <Line
                  key={region}
                  type="monotone"
                  dataKey={region}
                  name={`${region} Division`}
                  stroke={REGION_COLORS[region as keyof typeof REGION_COLORS]}
                  strokeWidth={3}
                  dot={{ r: 4, fill: REGION_COLORS[region as keyof typeof REGION_COLORS], strokeWidth: 1.5, stroke: '#ffffff' }}
                  activeDot={{ r: 7, stroke: '#023246', strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Regional Quick Jump Trigger */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 font-mono text-[11px]">
            <MaterialIcon name="bolt" className="w-4 h-4 inline-block mr-1" /> Click region hotspot to inspect GIS location:
          </span>
          <div className="flex flex-wrap gap-2">
            {Object.keys(districtMap).map((reg) => {
              const d = districtMap[reg];
              return (
                <button
                  key={reg}
                  onClick={() => onSelectDistrict && onSelectDistrict(d)}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-medium text-[11px] transition-all flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: REGION_COLORS[reg as keyof typeof REGION_COLORS] }}></span>
                  <span>{d.name}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Grid: Chart 2 (Seasonal Cycles) & Chart 3 (Hazard Breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Monthly Seasonal Vulnerability Cycle Area Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md space-y-4 flex flex-col justify-between">
          
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MaterialIcon name="calendar_month" className="w-4 h-4 text-amber-600" /> Annual Seasonal Hazard Probability Cycle
                </h3>
                <p className="text-xs text-slate-500">
                  Month-by-month probability curve across Bangladesh's agricultural harvest calendar
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                12-Month Area Overlay
              </span>
            </div>

            <div className="w-full h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlySeasonalData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorFlash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={HAZARD_COLORS.FlashFlood} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={HAZARD_COLORS.FlashFlood} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorMonsoon" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={HAZARD_COLORS.MonsoonFlood} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={HAZARD_COLORS.MonsoonFlood} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCyclone" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={HAZARD_COLORS.Cyclone} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={HAZARD_COLORS.Cyclone} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDrought" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={HAZARD_COLORS.Drought} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={HAZARD_COLORS.Drought} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip content={<CustomDarkTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#023246' }} />

                  <Area
                    type="monotone"
                    dataKey="FlashFlood"
                    name="Flash Flood (Haor)"
                    stroke={HAZARD_COLORS.FlashFlood}
                    fillOpacity={1}
                    fill="url(#colorFlash)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="MonsoonFlood"
                    name="Monsoon Flood"
                    stroke={HAZARD_COLORS.MonsoonFlood}
                    fillOpacity={1}
                    fill="url(#colorMonsoon)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="Cyclone"
                    name="Tropical Cyclone"
                    stroke={HAZARD_COLORS.Cyclone}
                    fillOpacity={1}
                    fill="url(#colorCyclone)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="Drought"
                    name="Drought Stress"
                    stroke={HAZARD_COLORS.Drought}
                    fillOpacity={1}
                    fill="url(#colorDrought)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-center gap-3">
            <span className="text-lg"><MaterialIcon name="lightbulb" className="w-4 h-4 inline-block mr-1" /></span>
            <p>
              <strong className="text-slate-900">Agricultural Insight:</strong> Pre-monsoon flash flood peaks in April-May coincide with physiological maturity of Boro Rice in Sylhet, whereas monsoon river floods peak in July-August across Rangpur/Sirajganj.
            </p>
          </div>

        </div>

        {/* Hazard Breakdown Stacked Bar Chart */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md space-y-4 flex flex-col justify-between">
          
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MaterialIcon name="public" className="w-4 h-4 text-sky-600" /> Regional Hazard Composition (%)
                </h3>
                <p className="text-xs text-slate-500">
                  Dominant disaster risk share by region
                </p>
              </div>
            </div>

            <div className="w-full h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={regionalHazardBreakdown}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} unit="%" domain={[0, 100]} />
                  <YAxis dataKey="region" type="category" stroke="#64748b" fontSize={10} width={90} tickLine={false} />
                  <Tooltip content={<CustomDarkTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '10px', color: '#023246' }} />

                  <Bar dataKey="FlashFlood" name="Flash Flood" stackId="a" fill={HAZARD_COLORS.FlashFlood} />
                  <Bar dataKey="MonsoonFlood" name="Monsoon Flood" stackId="a" fill={HAZARD_COLORS.MonsoonFlood} />
                  <Bar dataKey="Cyclone" name="Cyclone" stackId="a" fill={HAZARD_COLORS.Cyclone} />
                  <Bar dataKey="Drought" name="Drought" stackId="a" fill={HAZARD_COLORS.Drought} />
                  <Bar dataKey="ColdWave" name="Cold Wave" stackId="a" fill={HAZARD_COLORS.ColdWave} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
            <span className="font-mono text-slate-500 font-bold">Model Resolution: 250m Spatial Tile</span>
            <span className="font-bold text-slate-900">6 Divisions Analyzed</span>
          </div>

        </div>

      </div>

      {/* National Overview Section */}
      <NationalOverview onSelectDistrict={(d) => onSelectDistrict && onSelectDistrict(d)} />

      {/* 30-Day Historical Telemetry Trend Component */}
      <ThirtyDayTrendChart districtName="National Overview" districtId="kurigram" />

    </div>
  );
};

export default RiskAnalytics;
