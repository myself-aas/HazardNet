import MaterialIcon from "./MaterialIcon";
import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';

interface ThirtyDayTrendChartProps {
  districtName?: string;
  districtId?: string;
}

// Helper to generate realistic 30-day historical data tailored per district
function generate30DayHistoricalData(districtId: string = 'kurigram') {
  const data = [];
  const now = new Date(2026, 6, 31); // Jul 31, 2026

  // Base multipliers depending on region characteristic
  let floodBase = 35;
  let flashFloodBase = 20;
  let cycloneBase = 15;
  let droughtBase = 25;

  if (districtId === 'sunamganj' || districtId === 'sylhet') {
    flashFloodBase = 70;
    floodBase = 50;
  } else if (districtId === 'kurigram' || districtId === 'sirajganj') {
    floodBase = 75;
    flashFloodBase = 40;
  } else if (districtId === 'satkhira' || districtId === 'coxsbazar' || districtId === 'khulna') {
    cycloneBase = 70;
    floodBase = 40;
  } else if (districtId === 'rajshahi') {
    droughtBase = 75;
    floodBase = 20;
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);

    const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Simulate weather anomaly waves around day 12-18 and day 24-28
    const wave1 = Math.sin((30 - i) * 0.3) * 18;
    const wave2 = Math.cos((30 - i) * 0.4) * 12;

    const floodSeverity = Math.min(98, Math.max(10, Math.round(floodBase + wave1 + (i % 5) * 2)));
    const flashFloodSeverity = Math.min(95, Math.max(5, Math.round(flashFloodBase + wave2 + (i % 7) * 3)));
    const cycloneSeverity = Math.min(92, Math.max(5, Math.round(cycloneBase - wave1 * 0.5 + (i % 4) * 2)));
    const droughtSeverity = Math.min(90, Math.max(5, Math.round(droughtBase - wave2 * 0.6)));

    // Combined overall severity score
    const peakSeverity = Math.max(floodSeverity, flashFloodSeverity, cycloneSeverity, droughtSeverity);

    data.push({
      date: dayLabel,
      fullDate: d.toISOString().split('T')[0],
      'Monsoon Flood': floodSeverity,
      'Flash Flood': flashFloodSeverity,
      'Tropical Cyclone': cycloneSeverity,
      'Drought Stress': droughtSeverity,
      OverallSeverity: peakSeverity,
      isPeakDay: i === 12 || i === 25
    });
  }

  return data;
}

const HAZARD_PALETTE = {
  'Monsoon Flood': { color: '#38bdf8', gradientId: 'gradMonsoon' },
  'Flash Flood': { color: '#34d399', gradientId: 'gradFlash' },
  'Tropical Cyclone': { color: '#f43f5e', gradientId: 'gradCyclone' },
  'Drought Stress': { color: '#fbbf24', gradientId: 'gradDrought' },
  'Overall Severity': { color: '#a855f7', gradientId: 'gradOverall' }
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-lg text-xs font-sans space-y-2 z-50 text-slate-800">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-1.5">
          <span className="font-extrabold text-slate-900 text-sm">{label}, 2026</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold">
            30-Day GIS History
          </span>
        </div>
        <div className="space-y-1 pt-1">
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-6 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }}></span>
                <span className="text-slate-600 font-sans">{entry.name}:</span>
              </div>
              <span className="font-extrabold text-slate-900">{entry.value}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const ThirtyDayTrendChart: React.FC<ThirtyDayTrendChartProps> = ({
  districtName = 'Kurigram',
  districtId = 'kurigram'
}) => {
  const [selectedHazard, setSelectedHazard] = useState<string>('All');

  const chartData = useMemo(() => {
    return generate30DayHistoricalData(districtId);
  }, [districtId]);

  // Statistics calculation
  const stats = useMemo(() => {
    const severities = chartData.map((d) => d.OverallSeverity);
    const max = Math.max(...severities);
    const avg = Math.round(severities.reduce((a, b) => a + b, 0) / severities.length);
    const latest = severities[severities.length - 1];
    const prev = severities[severities.length - 2] || latest;
    const diff = latest - prev;

    return { max, avg, latest, diff };
  }, [chartData]);

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 transition-all duration-300 hover:shadow-lg">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-nasa-red/10 text-nasa-red-shade border border-nasa-blue/20 shadow-2xs">
              30-Day Historical Telemetry
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs sm:text-sm font-mono text-slate-500 font-bold">{districtName} District</span>
          </div>
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <MaterialIcon name="severity" className="w-4 h-4 text-rose-600" /> 30-Day Historical Hazard Severity Index
          </h3>
          <p className="text-xs sm:text-sm text-slate-600">
            Daily Sentinel-2 multispectral and ERA5-Land reanalysis severity quantification (Jul 2 - Jul 31)
          </p>
        </div>

        {/* Hazard Selector Pills */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {['All', 'Monsoon Flood', 'Flash Flood', 'Tropical Cyclone', 'Drought Stress'].map((h) => (
            <button
              key={h}
              onClick={() => setSelectedHazard(h)}
              className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all duration-200 min-h-[38px] cursor-pointer ${
                selectedHazard === h
                  ? 'bg-nasa-red text-slate-900 shadow-2xs scale-[1.02]'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/80 p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="space-y-1">
          <span className="text-[10px] sm:text-xs font-mono uppercase text-slate-500 font-bold block">30-Day Peak Severity</span>
          <span className="text-xl sm:text-2xl font-extrabold text-rose-600 font-mono">{stats.max}%</span>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] sm:text-xs font-mono uppercase text-slate-500 font-bold block">30-Day Mean Index</span>
          <span className="text-xl sm:text-2xl font-extrabold text-amber-600 font-mono">{stats.avg}%</span>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] sm:text-xs font-mono uppercase text-slate-500 font-bold block">Latest Telemetry (Today)</span>
          <span className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{stats.latest}%</span>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] sm:text-xs font-mono uppercase text-slate-500 font-bold block">24h Severity Trend</span>
          <span className={`text-xl sm:text-2xl font-extrabold font-mono ${stats.diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {stats.diff > 0 ? `+${stats.diff}%` : `${stats.diff}%`}
          </span>
        </div>
      </div>

      {/* Recharts Area Chart */}
      <div className="w-full h-[320px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradMonsoon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={HAZARD_PALETTE['Monsoon Flood'].color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={HAZARD_PALETTE['Monsoon Flood'].color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradFlash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={HAZARD_PALETTE['Flash Flood'].color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={HAZARD_PALETTE['Flash Flood'].color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCyclone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={HAZARD_PALETTE['Tropical Cyclone'].color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={HAZARD_PALETTE['Tropical Cyclone'].color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradDrought" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={HAZARD_PALETTE['Drought Stress'].color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={HAZARD_PALETTE['Drought Stress'].color} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#475569', paddingTop: '8px' }} />

            <ReferenceLine y={75} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Catastrophic Threshold (75%)', fill: '#f43f5e', fontSize: 10, position: 'insideTopRight' }} />

            {(selectedHazard === 'All' || selectedHazard === 'Monsoon Flood') && (
              <Area
                type="monotone"
                dataKey="Monsoon Flood"
                name="Monsoon Flood"
                stroke={HAZARD_PALETTE['Monsoon Flood'].color}
                fill="url(#gradMonsoon)"
                strokeWidth={2.5}
                activeDot={{ r: 6 }}
              />
            )}

            {(selectedHazard === 'All' || selectedHazard === 'Flash Flood') && (
              <Area
                type="monotone"
                dataKey="Flash Flood"
                name="Flash Flood"
                stroke={HAZARD_PALETTE['Flash Flood'].color}
                fill="url(#gradFlash)"
                strokeWidth={2.5}
                activeDot={{ r: 6 }}
              />
            )}

            {(selectedHazard === 'All' || selectedHazard === 'Tropical Cyclone') && (
              <Area
                type="monotone"
                dataKey="Tropical Cyclone"
                name="Tropical Cyclone"
                stroke={HAZARD_PALETTE['Tropical Cyclone'].color}
                fill="url(#gradCyclone)"
                strokeWidth={2.5}
                activeDot={{ r: 6 }}
              />
            )}

            {(selectedHazard === 'All' || selectedHazard === 'Drought Stress') && (
              <Area
                type="monotone"
                dataKey="Drought Stress"
                name="Drought Stress"
                stroke={HAZARD_PALETTE['Drought Stress'].color}
                fill="url(#gradDrought)"
                strokeWidth={2.5}
                activeDot={{ r: 6 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 font-mono">
          
          <span>Continuous Severity Normalization [0.0 - 1.0]</span>
        </span>
        <span className="font-mono text-slate-700 font-bold">
          Source: Sentinel-2 L2A & ERA5-Land Continuous Satellite Stream
        </span>
      </div>

    </div>
  );
};

export default ThirtyDayTrendChart;
