import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Thermometer,
  Droplets,
  Wind,
  Eye,
  Gauge,
  Sunrise,
  Sunset,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Sun,
  Moon,
  Umbrella,
  Snowflake,
  Navigation,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  MapPin,
  Calendar,
  Layers,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  ComposedChart,
  Bar,
} from 'recharts';
import type { WeatherResponse, CurrentWeather, HourlyWeather, DailyWeather } from '../lib/weather';
import { windDirectionLabel } from '../lib/weather';
import { wmoCodeInfo } from '../lib/wmoWeatherCodes';

interface WeatherPanelProps {
  data: WeatherResponse;
  /** Optional label for the location (e.g. district name) */
  locationLabel?: string;
  /** Loading/error states are handled by the hook; pass true to show a refresh spinner */
  loading?: boolean;
  onRefresh?: () => void;
  error?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format an ISO timestamp to HH:mm (local to the returned timezone). */
const fmtHour = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
};
const fmtDay = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return iso; }
};
const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return iso; }
};

// Celius → convenient rounding
const c = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${Math.round(v)}°`;
const msToKmh = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${Math.round(v * 3.6)} km/h`;
const mm = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} mm`;
const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${Math.round(v)}%`;
const hpa = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${Math.round(v)} hPa`;
const km = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v / 1000).toFixed(1)} km`;

/** Zip hourly arrays into objects, restricted to the next N hours from now. */
function hourlyWindow(hourly: HourlyWeather, hours: number) {
  const now = Date.now();
  const startIdx = hourly.time.findIndex((t) => new Date(t).getTime() >= now) - 1;
  const begin = Math.max(0, startIdx < 0 ? 0 : startIdx);
  const end = Math.min(hourly.time.length, begin + hours);
  const rows: Array<Record<string, number | string>> = [];
  for (let i = begin; i < end; i++) {
    const row: Record<string, number | string> = { time: fmtHour(hourly.time[i]) };
    for (const [k, arr] of Object.entries(hourly)) {
      if (k === 'time') continue;
      if (Array.isArray(arr)) row[k] = arr[i];
    }
    rows.push(row);
  }
  return rows;
}

/** Zip daily arrays into objects. */
function dailyRows(daily: DailyWeather) {
  const rows: Array<Record<string, number | string>> = [];
  for (let i = 0; i < daily.time.length; i++) {
    const row: Record<string, number | string> = {
      date: fmtDay(daily.time[i]),
      iso: daily.time[i],
    };
    for (const [k, arr] of Object.entries(daily)) {
      if (k === 'time') continue;
      if (Array.isArray(arr)) row[k] = arr[i];
    }
    rows.push(row);
  }
  return rows;
}

// ── UI bits ────────────────────────────────────────────────────────────────

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, label, value, sub }) => (
  <div className="flex items-start gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
    <div className="mt-0.5 text-slate-500 dark:text-slate-400">{icon}</div>
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
    </div>
  </div>
);

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title, icon, children, defaultOpen = true,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

export const WeatherPanel: React.FC<WeatherPanelProps> = ({
  data, locationLabel, loading, onRefresh, error,
}) => {
  const current = data.current;
  const info = wmoCodeInfo(current.weather_code);

  const hours48 = useMemo(() => hourlyWindow(data.hourly, 48), [data.hourly]);
  const daily = useMemo(() => dailyRows(data.daily), [data.daily]);

  const isDay = current.is_day === 1;
  const SunMoon = isDay ? Sun : Moon;

  return (
    <div className="w-full space-y-4 text-slate-800 dark:text-slate-100">
      {/* ── Header / current conditions ───────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm/6 text-sky-100">
              <MapPin size={14} />
              <span className="truncate">
                {locationLabel || `${data.latitude.toFixed(2)}°, ${data.longitude.toFixed(2)}°`}
              </span>
              {loading && <RefreshCw size={14} className="animate-spin opacity-80" />}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="ml-auto rounded-full bg-white/10 hover:bg-white/20 p-1 transition"
                  aria-label="Refresh weather"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-5xl font-semibold tracking-tight">
                {Math.round(current.temperature_2m)}°
              </span>
              <span className="text-sky-100 text-lg">C</span>
            </div>
            <div className="mt-1 text-sky-50 text-base font-medium flex items-center gap-2">
              <span className="text-2xl" aria-hidden>{info.emoji}</span>
              <span>{info.label}</span>
            </div>
            <div className="mt-0.5 text-sm text-sky-100/90">
              Feels like {Math.round(current.apparent_temperature)}°C
              {current.precipitation > 0 && <> · {current.precipitation.toFixed(1)} mm precip</>}
              {current.wind_speed_10m > 8 && <> · {Math.round(current.wind_speed_10m * 3.6)} km/h wind</>}
            </div>
          </div>
          <div className="text-right text-sky-100 text-xs">
            <div className="flex items-center justify-end gap-1">
              <SunMoon size={14} />
              <span>{isDay ? 'Day' : 'Night'}</span>
            </div>
            <div>Elev. {Math.round(data.elevation)} m</div>
            <div className="mt-1">
              <Clock size={12} className="inline mr-0.5" />
              {fmtTime(current.time)}
            </div>
          </div>
        </div>
        {/* decorative circle */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
        {error && (
          <div className="mt-3 rounded-md bg-red-500/20 border border-red-300/40 px-3 py-2 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Quick stat grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat
          icon={<Droplets size={18} />}
          label="Humidity"
          value={pct(current.relative_humidity_2m)}
        />
        <Stat
          icon={<Wind size={18} />}
          label="Wind"
          value={msToKmh(current.wind_speed_10m)}
          sub={
            <>
              <Navigation
                size={12}
                className="inline -mt-0.5 mr-1"
                style={{ transform: `rotate(${current.wind_direction_10m}deg)` }}
              />
              {windDirectionLabel(current.wind_direction_10m)} · gusts {msToKmh(current.wind_gusts_10m)}
            </>
          }
        />
        <Stat
          icon={<Gauge size={18} />}
          label="Pressure"
          value={hpa(current.pressure_msl)}
        />
        <Stat
          icon={<Eye size={18} />}
          label="Visibility"
          value={km(current.visibility)}
        />
        <Stat
          icon={<Cloud size={18} />}
          label="Cloud cover"
          value={pct(current.cloud_cover)}
          sub={
            <>
              L {pct(current.cloud_cover_low)} · M {pct(current.cloud_cover_mid)} · H {pct(current.cloud_cover_high)}
            </>
          }
        />
        <Stat
          icon={<Umbrella size={18} />}
          label="Precipitation"
          value={mm(current.precipitation)}
          sub={`Rain ${mm(current.rain)} · Showers ${mm(current.showers)} · Snow ${mm(current.snowfall)}`}
        />
        <Stat
          icon={<Thermometer size={18} />}
          label="Dew point"
          value={c(current.dew_point_2m)}
        />
        <Stat
          icon={<Snowflake size={18} />}
          label="Soil temp (0cm)"
          value={c(current.soil_temperature_0cm)}
          sub={`6cm ${c(current.soil_temperature_6cm)} · 18cm ${c(current.soil_temperature_18cm)}`}
        />
      </div>

      {/* ── Sunrise / sunset today ──────────────────────────────── */}
      {daily[0] && (
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={<Sunrise size={18} />} label="Sunrise today" value={fmtTime(String(daily[0].sunrise))} />
          <Stat icon={<Sunset size={18} />} label="Sunset today" value={fmtTime(String(daily[0].sunset))} />
        </div>
      )}

      {/* ── Hourly chart (temperature + precipitation) ─────────── */}
      <Section title="48-hour forecast" icon={<Clock size={16} />}>
        <div className="h-56 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hours48} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={30}
                stroke="#94a3b8"
              />
              <YAxis
                yAxisId="temp"
                tick={{ fontSize: 11 }}
                stroke="#f59e0b"
                unit="°"
                domain={['dataMin - 3', 'dataMax + 3']}
              />
              <YAxis
                yAxisId="precip"
                orientation="right"
                tick={{ fontSize: 11 }}
                stroke="#3b82f6"
                unit="mm"
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Area
                yAxisId="temp"
                type="monotone"
                dataKey="temperature_2m"
                stroke="#f59e0b"
                fill="url(#tempGrad)"
                strokeWidth={2}
                name="Temp (°C)"
              />
              <Bar
                yAxisId="precip"
                dataKey="precipitation"
                fill="#3b82f6"
                opacity={0.7}
                name="Precip (mm)"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="apparent_temperature"
                stroke="#ef4444"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                dot={false}
                name="Feels like (°C)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Wind + humidity strip */}
        <div className="h-40 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hours48} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={30} stroke="#94a3b8" />
              <YAxis yAxisId="wind" tick={{ fontSize: 11 }} stroke="#10b981" unit="" />
              <YAxis yAxisId="hum" orientation="right" tick={{ fontSize: 11 }} stroke="#06b6d4" unit="%" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="wind" type="monotone" dataKey="wind_speed_10m" stroke="#10b981" strokeWidth={1.5} dot={false} name="Wind m/s" />
              <Line yAxisId="wind" type="monotone" dataKey="wind_gusts_10m" stroke="#059669" strokeDasharray="2 2" dot={false} name="Gust m/s" />
              <Line yAxisId="hum" type="monotone" dataKey="relative_humidity_2m" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="Humidity %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ── 16-day forecast table ──────────────────────────────── */}
      <Section title={`${daily.length}-day forecast`} icon={<Calendar size={16} />}>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 px-3">Cond.</th>
                <th className="py-2 px-3 text-right">Hi / Lo</th>
                <th className="py-2 px-3 text-right">Precip</th>
                <th className="py-2 px-3 text-right">Rain</th>
                <th className="py-2 px-3 text-right">Snow</th>
                <th className="py-2 px-3 text-right">Wind max</th>
                <th className="py-2 px-3 text-right">UV max</th>
                <th className="py-2 px-3 text-right">Sun</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => {
                const w = wmoCodeInfo(d.weather_code as number);
                return (
                  <tr
                    key={String(d.iso)}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{String(d.date)}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span aria-hidden>{w.emoji}</span>
                        <span className="text-xs">{w.label}</span>
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      <span className="text-rose-600 dark:text-rose-400">{c(d.temperature_2m_max)}</span>
                      {' / '}
                      <span className="text-sky-600 dark:text-sky-400">{c(d.temperature_2m_min)}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {mm(d.precipitation_sum)}
                      {typeof d.precipitation_probability_max === 'number' && (
                        <span className="text-slate-400 ml-1">({Math.round(d.precipitation_probability_max)}%)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{mm(d.rain_sum)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{mm(d.snowfall_sum)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {msToKmh(d.wind_speed_10m_max)}
                      {typeof d.wind_direction_10m_dominant === 'number' && (
                        <span className="text-slate-400 ml-1">
                          {windDirectionLabel(d.wind_direction_10m_dominant)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {typeof d.uv_index_max === 'number' ? Math.round(d.uv_index_max) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {typeof d.sunshine_duration === 'number'
                        ? `${(d.sunshine_duration / 3600).toFixed(1)} h`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Soil & agricultural variables ───────────────────────── */}
      <Section title="Soil & agricultural conditions" icon={<Layers size={16} />} defaultOpen={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <Stat icon={<Thermometer size={18} />} label="Soil T 0cm" value={c(current.soil_temperature_0cm)} />
          <Stat icon={<Thermometer size={18} />} label="Soil T 6cm" value={c(current.soil_temperature_6cm)} />
          <Stat icon={<Thermometer size={18} />} label="Soil T 18cm" value={c(current.soil_temperature_18cm)} />
          <Stat icon={<Thermometer size={18} />} label="Soil T 54cm" value={c(current.soil_temperature_54cm)} />
          <Stat icon={<Droplets size={18} />} label="Soil M 0–1cm" value={pct(current.soil_moisture_0_to_1cm ? (current.soil_moisture_0_to_1cm as number) * 100 : null)} />
          <Stat icon={<Droplets size={18} />} label="Soil M 1–3cm" value={pct(current.soil_moisture_1_to_3cm ? (current.soil_moisture_1_to_3cm as number) * 100 : null)} />
          <Stat icon={<Droplets size={18} />} label="Soil M 3–9cm" value={pct(current.soil_moisture_3_to_9cm ? (current.soil_moisture_3_to_9cm as number) * 100 : null)} />
          <Stat icon={<Droplets size={18} />} label="Soil M 9–27cm" value={pct(current.soil_moisture_9_to_27cm ? (current.soil_moisture_9_to_27cm as number) * 100 : null)} />
        </div>
      </Section>

      {/* ── Footer / source ─────────────────────────────────────── */}
      <div className="text-center text-[11px] text-slate-400 dark:text-slate-500 pt-2 pb-1">
        Data from <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline hover:text-sky-500">Open-Meteo</a>
        {' · '}
        {data._meta.license}
        {' · '}
        cached {new Date(data._meta.cached_at).toLocaleString()}
      </div>
    </div>
  );
};

export default WeatherPanel;
