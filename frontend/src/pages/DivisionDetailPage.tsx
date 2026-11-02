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
  ReferenceLine,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Calendar,
  Layers,
  CloudRain,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import {
  fetchDivisionEvents,
  canonicalDivisionName,
  resolveCanonicalDistrict,
  type DivisionEventsResponse,
  type ForecastRecord,
} from '../lib/eventsClient';
import {
  loadNationalDailySnapshot,
  summarizeContinuous15Days,
  type DailyAdvisory,
  type DailyRun,
  type DailyTier,
} from '../lib/dailyAdvisories';
import { loadAlerts, type AlertRecord } from '../lib/alerts';
import { InfinityLoader } from '../components/brand';
import { getHazardBorder, getHazardColor, getHazardSurface } from '../lib/hazardPalette';
import { CardStackRows } from '../components/ui/CardStackTable';

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

const TIER_RANK: Record<DailyTier, number> = {
  NORMAL: 0,
  WATCH: 1,
  WARNING: 2,
  SEVERE: 3,
  EXTREME: 4,
};

function tierBadgeClasses(tier: DailyTier | string): string {
  switch (tier) {
    case 'EXTREME':
    case 'SEVERE':
      return 'bg-red-50 text-red-800 border border-red-200';
    case 'WARNING':
      return 'bg-amber-100 text-amber-900 border border-amber-300';
    case 'WATCH':
      return 'bg-amber-50 text-amber-800 border border-amber-200';
    default:
      return 'bg-carbon-10 text-carbon-70 border border-carbon-20';
  }
}

type TrajectoryChartMode = 'severity' | 'districts' | 'weather';
type DistrictSortMode = 'severity' | 'events' | 'name';

interface EnrichedDistrictRow {
  district: string;
  slug: string;
  eventCount: number;
  tier: DailyTier;
  dominantHazard: string;
  peakSeverityScore: number | null;
  peakSeverityIndex: number | null;
  modelIndex: number | null;
  physicsIndex: number | null;
  peakDate: string;
  peakDayNumber: number | null;
  activeAdvisoryDays: number;
  totalTrajectoryDays: number;
  precipitationMm: number | null;
  windMaxKmh: number | null;
  tempMaxC: number | null;
  publishedAlertId: string | null;
}

export const DivisionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const divisionId = (id || 'dhaka').toLowerCase();

  const [data, setData] = useState<DivisionEventsResponse | null>(null);
  const [dailyAdvisories, setDailyAdvisories] = useState<DailyAdvisory[]>([]);
  const [dailyRun, setDailyRun] = useState<DailyRun | null>(null);
  const [publishedAlerts, setPublishedAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive chart & table controls
  const [trajectoryMode, setTrajectoryMode] = useState<TrajectoryChartMode>('severity');
  const [districtSort, setDistrictSort] = useState<DistrictSortMode>('severity');

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
        const [divisionResult, nationalDaily, alertsResult] = await Promise.all([
          fetchDivisionEvents(divisionId),
          loadNationalDailySnapshot().catch(() => ({
            status: 'unavailable' as const,
            source: 'none' as const,
            run: null,
            advisories: [],
          })),
          loadAlerts().catch(() => null),
        ]);

        if (mounted) {
          const targetDiv = canonicalDivisionName(divisionId);
          const divDaily = nationalDaily.advisories.filter((row) => {
            const resolved = resolveCanonicalDistrict(row.district);
            if (resolved) return canonicalDivisionName(resolved.division) === targetDiv;
            return canonicalDivisionName(row.division) === targetDiv;
          });
          const divAlerts = (alertsResult?.alerts || []).filter((a) => {
            const resolved = resolveCanonicalDistrict(a.district_name || '');
            if (resolved) return canonicalDivisionName(resolved.division) === targetDiv;
            return canonicalDivisionName(a.division || '') === targetDiv;
          });

          setData(divisionResult);
          setDailyAdvisories(divDaily);
          setDailyRun(nationalDaily.run);
          setPublishedAlerts(divAlerts);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load division events data');
          setLoading(false);
        }
      }
    }
    loadDivision();
    return () => {
      mounted = false;
    };
  }, [divisionId]);

  // Enriched constituent district rows combining 960-row daily advisories, forecasts, alerts, and 26-yr events
  const enrichedDistrictRows = useMemo<EnrichedDistrictRow[]>(() => {
    if (!data) return [];

    const byDistrictDaily = new Map<string, DailyAdvisory[]>();
    for (const row of dailyAdvisories) {
      const key = resolveCanonicalDistrict(row.district)?.id || row.district.toLowerCase().replace(/[^a-z0-9]/g, '');
      const list = byDistrictDaily.get(key);
      if (list) list.push(row);
      else byDistrictDaily.set(key, [row]);
    }

    const alertByDistrictKey = new Map<string, AlertRecord>();
    for (const alert of publishedAlerts) {
      const distName = alert.district_name || '';
      const key = resolveCanonicalDistrict(distName)?.id || distName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key && !alertByDistrictKey.has(key)) alertByDistrictKey.set(key, alert);
    }

    const rows = data.districtRankings.map((dr) => {
      const canonical = resolveCanonicalDistrict(dr.district);
      const slug = canonical?.id || dr.district.toLowerCase().replace(/[^a-z0-9]/g, '');
      const fRow: ForecastRecord | undefined = data.forecasts.find((f) => {
        const fCanon = resolveCanonicalDistrict(f.districtName);
        if (canonical && fCanon) return fCanon.id === canonical.id;
        return f.districtName.toLowerCase() === dr.district.toLowerCase();
      });
      const distDaily = byDistrictDaily.get(slug) || [];
      const summary15 = distDaily.length > 0 ? summarizeContinuous15Days(distDaily) : null;
      const peakDaily = summary15?.primaryPeak || null;
      const highestTier =
        distDaily.length > 0
          ? distDaily.reduce<DailyTier>(
              (best, r) => (TIER_RANK[r.tier] > TIER_RANK[best] ? r.tier : best),
              'NORMAL',
            )
          : fRow && fRow.severityScore >= 0.25
            ? 'WATCH'
            : 'NORMAL';

      const activeAdvisoryDays = distDaily.filter((r) => r.tier !== 'NORMAL').length;
      const peakScore =
        summary15 !== null
          ? summary15.maxSeverityScore
          : dr.forecast15DSeverity !== null
            ? dr.forecast15DSeverity
            : fRow?.severityScore ?? null;
      const peakIdx = peakScore !== null ? Math.round(peakScore * 100) : null;

      const rawModel =
        peakDaily?.metrics?.modelSeverity ??
        (peakDaily?.metrics?.modelSeverityRaw !== undefined
          ? Math.min(1, peakDaily.metrics.modelSeverityRaw / 4)
          : undefined);
      const rawPhysics = peakDaily?.metrics?.physicsSeverity ?? peakScore ?? undefined;

      const modelIndex = rawModel !== undefined ? Math.round(rawModel * 100) : peakIdx;
      const physicsIndex = rawPhysics !== undefined ? Math.round(rawPhysics * 100) : peakIdx;

      const maxRain =
        distDaily.length > 0
          ? Math.max(...distDaily.map((r) => r.weather?.precipitationMm ?? 0))
          : fRow?.precipitationMm ?? null;
      const maxWind =
        distDaily.length > 0
          ? Math.max(...distDaily.map((r) => r.weather?.windKmh ?? 0))
          : fRow?.windMaxKmh ?? null;
      const maxTemp =
        distDaily.length > 0
          ? Math.max(...distDaily.map((r) => r.weather?.temperatureMaxC ?? 0))
          : fRow?.temperatureMax ?? null;

      const alert = alertByDistrictKey.get(slug) || null;

      return {
        district: dr.district,
        slug,
        eventCount: dr.eventCount,
        tier: highestTier,
        dominantHazard: peakDaily?.hazard || dr.forecast15DHazard || fRow?.hazardType || 'No active hazard',
        peakSeverityScore: peakScore,
        peakSeverityIndex: peakIdx,
        modelIndex,
        physicsIndex,
        peakDate: peakDaily?.targetDate || fRow?.targetDate || '-',
        peakDayNumber: peakDaily?.forecastDay ?? null,
        activeAdvisoryDays: distDaily.length > 0 ? activeAdvisoryDays : highestTier !== 'NORMAL' ? 1 : 0,
        totalTrajectoryDays: distDaily.length || 15,
        precipitationMm: maxRain,
        windMaxKmh: maxWind,
        tempMaxC: maxTemp,
        publishedAlertId: alert?.id || null,
      };
    });

    return rows.sort((a, b) => {
      if (districtSort === 'name') return a.district.localeCompare(b.district);
      if (districtSort === 'events') {
        return b.eventCount - a.eventCount || (b.peakSeverityIndex ?? 0) - (a.peakSeverityIndex ?? 0);
      }
      return (
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        (b.peakSeverityIndex ?? 0) - (a.peakSeverityIndex ?? 0) ||
        b.activeAdvisoryDays - a.activeAdvisoryDays ||
        b.eventCount - a.eventCount
      );
    });
  }, [data, dailyAdvisories, publishedAlerts, districtSort]);

  // Division-wide continuous 15-day trajectory series (Days 1-15)
  const divisionTrajectorySeries = useMemo(() => {
    if (dailyAdvisories.length === 0) return [];
    const byDay = new Map<number, DailyAdvisory[]>();
    for (const row of dailyAdvisories) {
      const list = byDay.get(row.forecastDay);
      if (list) list.push(row);
      else byDay.set(row.forecastDay, [row]);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, rows]) => {
        const targetDate = rows[0]?.targetDate || `Day ${day}`;
        const shortDate = targetDate.length >= 10 ? targetDate.slice(5) : targetDate;
        const scores = rows.map((r) => r.severityScore * 100);
        const maxSeverity = Math.round(Math.max(...scores));
        const meanSeverity = Math.round(scores.reduce((s, v) => s + v, 0) / rows.length);
        const watchPlusCount = rows.filter((r) => r.tier !== 'NORMAL').length;
        const normalCount = rows.length - watchPlusCount;
        const meanRainMm =
          Math.round((rows.reduce((s, r) => s + (r.weather?.precipitationMm ?? 0), 0) / rows.length) * 10) / 10;
        const maxTempC =
          Math.round(Math.max(...rows.map((r) => r.weather?.temperatureMaxC ?? 0)) * 10) / 10;
        return {
          dayLabel: `D${day} (${shortDate})`,
          forecastDay: day,
          targetDate,
          'Peak Severity (0-100)': maxSeverity,
          'Mean Severity (0-100)': meanSeverity,
          'WATCH+ Districts': watchPlusCount,
          'Normal Districts': normalCount,
          'Mean Rain (mm)': meanRainMm,
          'Max Temp (C)': maxTempC,
        };
      });
  }, [dailyAdvisories]);

  // Division peak summary across all constituent districts
  const divisionAdvisoryHeadline = useMemo(() => {
    const watchPlusDistricts = enrichedDistrictRows.filter((r) => r.tier !== 'NORMAL').length;
    const highestTier = enrichedDistrictRows.reduce<DailyTier>(
      (best, r) => (TIER_RANK[r.tier] > TIER_RANK[best] ? r.tier : best),
      'NORMAL',
    );
    const maxIdx = enrichedDistrictRows.reduce((m, r) => Math.max(m, r.peakSeverityIndex ?? 0), 0);
    const peakDayRow =
      divisionTrajectorySeries.length > 0
        ? divisionTrajectorySeries.reduce(
            (best, cur) =>
              cur['Peak Severity (0-100)'] > best['Peak Severity (0-100)'] ||
              (cur['Peak Severity (0-100)'] === best['Peak Severity (0-100)'] &&
                cur['Mean Rain (mm)'] > best['Mean Rain (mm)'])
                ? cur
                : best,
            divisionTrajectorySeries[0],
          )
        : null;
    return {
      watchPlusDistricts,
      highestTier,
      maxIdx,
      peakDate: peakDayRow?.targetDate || enrichedDistrictRows[0]?.peakDate || '-',
      peakForecastDay: peakDayRow?.forecastDay || enrichedDistrictRows[0]?.peakDayNumber || null,
    };
  }, [enrichedDistrictRows, divisionTrajectorySeries]);

  // District peak severity comparison chart (0-100 scale: Published vs Model vs Physics)
  const forecastChartData = useMemo(() => {
    return enrichedDistrictRows.map((d) => ({
      district: d.district,
      'Published Peak (0-100)': d.peakSeverityIndex ?? 0,
      'Model Index (0-100)': d.modelIndex ?? 0,
      'Physics Index (0-100)': d.physicsIndex ?? 0,
      hazard: d.dominantHazard,
    }));
  }, [enrichedDistrictRows]);

  // Unique hazards and districts in this division for filter dropdowns
  const availableHazards = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.allEvents.map((e) => e.hazard))).sort();
  }, [data]);

  const availableDistricts = useMemo(() => {
    if (!data) return [];
    const names = new Set<string>([
      ...data.districtRankings.map((d) => d.district),
      ...data.allEvents.map((e) => e.district),
    ]);
    return Array.from(names).sort();
  }, [data]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.allEvents.filter((e) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        q === '' ||
        e.district.toLowerCase().includes(q) ||
        e.hazard.toLowerCase().includes(q) ||
        e.glide.toLowerCase().includes(q) ||
        e.desc.toLowerCase().includes(q);

      const matchesHazard = selectedHazard === 'all' || e.hazard === selectedHazard;
      const matchesDistrict = selectedDistrict === 'all' || e.district === selectedDistrict;

      return matchesSearch && matchesHazard && matchesDistrict;
    });
  }, [data, searchQuery, selectedHazard, selectedDistrict]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-carbon-05 flex items-center justify-center p-6">
        <div className="text-center">
          <InfinityLoader size={96} label="Loading" className="mx-auto mb-3 block" />
          <p className="text-sm font-medium text-carbon-70">Loading division data...</p>
          <p className="text-xs text-carbon-60 mt-1">
            Loading 15-day advisories, forecasts, and historical events (2000-2026)
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-carbon-05 flex items-center justify-center p-6">
        <div className="bg-white border border-carbon-20 rounded-2xl p-8 max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-carbon-90">Failed to Load Division Data</h1>
          <p className="text-xs text-carbon-60 mt-2">{error || 'Division data not found.'}</p>
          <Link
            to="/divisions"
            className="mt-5 inline-flex min-h-[44px] items-center px-4 bg-primary text-ap-action-fg text-sm font-semibold hover:bg-primary-strong"
          >
            Back to Divisions
          </Link>
        </div>
      </div>
    );
  }

  const districtExposureHeight = Math.max(260, data.districtRankings.length * 28);
  const hasForecastOrAdvisories = enrichedDistrictRows.some((r) => r.peakSeverityIndex !== null);

  return (
    <div className="min-h-dvh bg-carbon-05 text-carbon-80 pb-8 pt-6 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-carbon-60 mb-4">
        <Link to="/" className="hover:text-ap-link transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link to="/divisions" className="hover:text-ap-link transition-colors">
          Divisions
        </Link>
        <span>/</span>
        <span className="text-carbon-80 font-medium">{data.division}</span>
      </div>

      {/* Division Switcher Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 scrollbar-none">
        {ALL_DIVISIONS.map((d) => {
          const isActive = d.id === divisionId || (divisionId === 'chittagong' && d.id === 'chattogram');
          return (
            <button
              key={d.id}
              onClick={() => navigate(`/divisions/${d.id}`)}
              className={`inline-flex min-h-[44px] items-center px-3 text-sm font-semibold whitespace-nowrap touch-manipulation ${
                isActive
                  ? 'bg-primary text-ap-action-fg'
                  : 'bg-white border border-carbon-20 text-carbon-70 hover:bg-carbon-10 hover:text-carbon-90'
              }`}
            >
              {d.name}
            </button>
          );
        })}
      </div>

      {/* Header Profile Card */}
      <div className="bg-white border border-carbon-20 rounded-2xl p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${tierBadgeClasses(divisionAdvisoryHeadline.highestTier)}`}>
                {divisionAdvisoryHeadline.highestTier} OUTLOOK
              </span>
              {dailyRun && (
                <span className="text-xs text-carbon-60">
                  Run cutoff {dailyRun.dataCutoff.slice(0, 16).replace('T', ' ')} UTC · {dailyRun.modelVersion}
                </span>
              )}
            </div>
            <h1 className="text-ap-lead font-bold sm:text-ap-display-md text-carbon-90 tracking-tight">
              {data.division} Division
            </h1>
            <p className="mt-1.5 text-base leading-[1.62] text-carbon-70 max-w-2xl">
              {data.division} Division spans {data.totalDistricts} constituent districts with{' '}
              {data.totalEvents.toLocaleString()} verified climatic disaster records (2000-2026) and continuous 15-day
              daily hazard advisories.{' '}
              {data.totalEvents > 0 && data.primaryHazard && (
                <>
                  Dominant historical hazard: <span className="font-semibold text-carbon-90">{data.primaryHazard}</span>.
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
            <div className="rounded-xl bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-carbon-90 tabular-nums">{data.totalDistricts}</div>
              <div className="text-xs text-carbon-60 font-medium">Districts</div>
            </div>
            <div className="rounded-xl bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-ap-link tabular-nums">{data.totalEvents.toLocaleString()}</div>
              <div className="text-xs text-carbon-60 font-medium">Recorded Events</div>
            </div>
            <div className="rounded-xl bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-amber-700 tabular-nums">
                {divisionAdvisoryHeadline.watchPlusDistricts}/{data.totalDistricts}
              </div>
              <div className="text-xs text-carbon-60 font-medium">WATCH+ Districts</div>
            </div>
            <div className="rounded-xl bg-carbon-05 border border-carbon-20/80 p-3 text-center">
              <div className="text-xl font-bold text-carbon-90 tabular-nums">{divisionAdvisoryHeadline.maxIdx}/100</div>
              <div className="text-xs text-carbon-60 font-medium">Peak 15d Severity</div>
            </div>
          </div>
        </div>
      </div>

      {/* Continuous 15-Day Division Trajectory & Published Advisories */}
      {divisionTrajectorySeries.length > 0 && (
        <div className="bg-white border border-carbon-20 rounded-2xl p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-carbon-20 gap-4">
            <div>
              <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-ap-link" />
                Continuous 15-Day Division Trajectory ({data.division})
              </h2>
              <p className="text-xs text-carbon-60 mt-0.5">
                Aggregated across {dailyAdvisories.length} daily district-day advisories (Days 1-15) · Peak division
                window: <strong className="text-carbon-90">{divisionAdvisoryHeadline.peakDate}</strong>
                {divisionAdvisoryHeadline.peakForecastDay ? ` (Day ${divisionAdvisoryHeadline.peakForecastDay})` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Division trajectory chart metric">
              {(
                [
                  { key: 'severity', label: 'Severity Index (0-100)' },
                  { key: 'districts', label: 'WATCH+ Districts' },
                  { key: 'weather', label: 'Rain & Max Temp' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTrajectoryMode(opt.key)}
                  aria-pressed={trajectoryMode === opt.key}
                  className={`min-h-[44px] px-3 text-xs font-semibold rounded-md touch-manipulation cursor-pointer ${
                    trajectoryMode === opt.key
                      ? 'bg-primary text-ap-action-fg'
                      : 'bg-carbon-05 border border-carbon-20 text-carbon-70 hover:bg-carbon-10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              {trajectoryMode === 'severity' ? (
                <AreaChart data={divisionTrajectorySeries} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="divPeakSevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ap-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--ap-primary)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px' }} />
                  <ReferenceLine y={25} stroke="var(--ap-sev-medium)" strokeDasharray="4 4" />
                  <ReferenceLine y={50} stroke="var(--ap-sev-high)" strokeDasharray="4 4" />
                  <Area
                    type="monotone"
                    dataKey="Peak Severity (0-100)"
                    stroke="var(--ap-primary)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#divPeakSevGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="Mean Severity (0-100)"
                    stroke="var(--ap-sev-low)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--ap-sev-low)' }}
                  />
                </AreaChart>
              ) : trajectoryMode === 'districts' ? (
                <BarChart data={divisionTrajectorySeries} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px' }} />
                  <Bar dataKey="WATCH+ Districts" stackId="tiers" fill="var(--ap-sev-medium)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Normal Districts" stackId="tiers" fill="var(--ap-separator-opaque)" />
                </BarChart>
              ) : (
                <LineChart data={divisionTrajectorySeries} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="Mean Rain (mm)"
                    stroke="var(--ap-primary)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'var(--ap-primary)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Max Temp (C)"
                    stroke="var(--ap-sev-high)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--ap-sev-high)' }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Constituent District Advisories & 15-Day Forecast Matrix */}
      {hasForecastOrAdvisories && (
        <div className="bg-white border border-carbon-20 rounded-2xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-carbon-20 gap-3">
            <div>
              <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-ap-link" />
                Constituent District Advisories &amp; 15-Day Forecasts ({data.division})
              </h2>
              <p className="text-xs text-carbon-60 mt-0.5">
                Published advisory tiers, Model vs. Physics peak severity (0-100), peak severe dates, and evidence links
                across all {enrichedDistrictRows.length} districts
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="division-district-sort" className="text-xs font-medium text-carbon-60">
                Sort:
              </label>
              <select
                id="division-district-sort"
                value={districtSort}
                onChange={(e) => setDistrictSort(e.target.value as DistrictSortMode)}
                className="h-11 min-h-[44px] py-1.5 px-2.5 text-sm border border-carbon-20 rounded-md bg-carbon-05 text-carbon-80"
              >
                <option value="severity">Peak Severity &amp; Advisory Tier</option>
                <option value="events">26-Yr Historical Events</option>
                <option value="name">District Name (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Interactive Rechart: District Peak Severity (Published vs Model vs Physics 0-100) */}
          <div className="pt-4 pb-2">
            <h3 className="text-xs font-bold text-carbon-70 uppercase tracking-wider mb-2">
              District 15-Day Peak Severity Comparison (0-100 Scale: Published vs. AI Model vs. Physics)
            </h3>
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastChartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
                  <XAxis dataKey="district" tick={{ fontSize: 11, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px' }} />
                  <ReferenceLine y={25} stroke="var(--ap-sev-medium)" strokeDasharray="4 4" />
                  <Bar dataKey="Published Peak (0-100)" fill="var(--ap-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Model Index (0-100)" fill="var(--ap-sev-medium)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Physics Index (0-100)" fill="var(--ap-sev-low)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* District Forecast & Advisory Table. Below md the same rows render as cards. */}
          <CardStackRows
            className="mt-4 pt-4 border-t border-carbon-20"
            rows={enrichedDistrictRows.map((row) => ({
              key: row.district,
              heading: `${row.district} (${row.tier})`,
              fields: [
                { label: 'Published Advisory Tier', value: row.tier },
                { label: 'Dominant Hazard (Days 1-15)', value: row.dominantHazard },
                {
                  label: 'Peak Severity Index',
                  value:
                    row.peakSeverityIndex !== null
                      ? `${row.peakSeverityIndex}/100 (Model ${row.modelIndex ?? '-'} · Physics ${row.physicsIndex ?? '-'})`
                      : 'Not available',
                },
                {
                  label: 'Peak Severe Date',
                  value: row.peakDayNumber ? `${row.peakDate} (Day ${row.peakDayNumber})` : row.peakDate,
                },
                {
                  label: 'Active WATCH+ Window',
                  value: `${row.activeAdvisoryDays}/${row.totalTrajectoryDays} days`,
                },
                {
                  label: 'Peak Weather',
                  value:
                    row.precipitationMm !== null
                      ? `${row.precipitationMm.toFixed(1)} mm rain · ${(row.windMaxKmh ?? 0).toFixed(1)} km/h wind`
                      : '-',
                },
                { label: '26-Yr Recorded Events', value: row.eventCount.toLocaleString() },
              ],
              footer: (
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to={`/forecast/district/${row.slug}`}
                    className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-ap-link hover:text-ap-link"
                  >
                    <span>15-Day Outlook</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  {row.publishedAlertId && (
                    <Link
                      to={`/alerts/${row.publishedAlertId}`}
                      className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-amber-800 hover:text-ap-link"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Evidence Card</span>
                    </Link>
                  )}
                </div>
              ),
            }))}
          />
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-carbon-05 text-carbon-60 font-semibold border-b border-carbon-20">
                <tr>
                  <th className="p-3">District</th>
                  <th className="p-3">Advisory Tier</th>
                  <th className="p-3">Dominant Hazard</th>
                  <th className="p-3">Peak Severity (0-100)</th>
                  <th className="p-3">Peak Severe Date</th>
                  <th className="p-3">Active Days</th>
                  <th className="p-3">Peak Rain / Wind</th>
                  <th className="p-3">26-Yr Events</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-10">
                {enrichedDistrictRows.map((row) => (
                  <tr key={row.district} className="hover:bg-carbon-05/80 transition-colors">
                    <td className="p-3 font-semibold text-carbon-90">
                      <Link to={`/forecast/district/${row.slug}`} className="hover:text-ap-link">
                        {row.district}
                      </Link>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${tierBadgeClasses(row.tier)}`}>
                        {row.tier}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          backgroundColor: getHazardSurface(row.dominantHazard),
                          color: 'var(--ap-label)',
                          borderColor: getHazardBorder(row.dominantHazard),
                          borderWidth: 1,
                          borderStyle: 'solid',
                        }}
                      >
                        {row.dominantHazard}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {row.peakSeverityIndex !== null ? (
                        <div className="space-y-1 min-w-[120px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold tabular-nums text-carbon-90">{row.peakSeverityIndex}/100</span>
                            <span className="text-carbon-60 tabular-nums">
                              M{row.modelIndex ?? '-'} · P{row.physicsIndex ?? '-'}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-carbon-10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, Math.max(4, row.peakSeverityIndex))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-carbon-60">N/A</span>
                      )}
                    </td>
                    <td className="p-3 text-carbon-70 whitespace-nowrap tabular-nums">
                      {row.peakDate}
                      {row.peakDayNumber ? <span className="text-carbon-60"> (D{row.peakDayNumber})</span> : null}
                    </td>
                    <td className="p-3 text-carbon-70 whitespace-nowrap tabular-nums font-medium">
                      {row.activeAdvisoryDays}/{row.totalTrajectoryDays}d
                    </td>
                    <td className="p-3 text-carbon-60 whitespace-nowrap tabular-nums">
                      {row.precipitationMm !== null
                        ? `${row.precipitationMm.toFixed(1)} mm · ${(row.windMaxKmh ?? 0).toFixed(1)} km/h`
                        : '-'}
                    </td>
                    <td className="p-3 text-carbon-80 font-semibold tabular-nums">
                      {row.eventCount.toLocaleString()}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <Link
                          to={`/forecast/district/${row.slug}`}
                          className="inline-flex items-center gap-1 text-ap-link hover:text-ap-link font-semibold"
                        >
                          <span>Outlook</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                        {row.publishedAlertId && (
                          <Link
                            to={`/alerts/${row.publishedAlertId}`}
                            className="inline-flex items-center gap-1 text-amber-800 hover:text-ap-link font-semibold"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Alert</span>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interactive Historical Recharts Grid */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-1">
          <h2 className="text-lg font-bold text-carbon-90">
            26-Year Historical Disaster Analytics (2000-2026)
          </h2>
          <span className="text-xs text-carbon-60">
            Verified historical catalog across {data.totalDistricts} districts in {data.division} Division
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Yearly Trend 2000-2026 */}
          <div className="bg-white border border-carbon-20 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-carbon-20">
              <div>
                <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-ap-link" />
                  26-Year Historical Disaster Trend (2000-2026)
                </h3>
                <p className="text-xs text-carbon-60">Total events recorded per year in {data.division}</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70 rounded tabular-nums">
                {data.yearlyTrend.reduce((a, b) => a + b.total, 0).toLocaleString()} Total
              </span>
            </div>
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.yearlyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                  <defs>
                    <linearGradient id="divAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ap-primary)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--ap-primary)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Disaster Events"
                    stroke="var(--ap-primary)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#divAreaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: District Vulnerability Ranking */}
          <div className="bg-white border border-carbon-20 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-carbon-20">
              <div>
                <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-ap-link" />
                  Constituent Districts Disaster Exposure
                </h3>
                <p className="text-xs text-carbon-60">Historical disaster frequency across {data.division} districts</p>
              </div>
            </div>
            <div className="w-full pt-4" style={{ height: `${districtExposureHeight}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.districtRankings}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis
                    dataKey="district"
                    type="category"
                    tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }}
                    width={96}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Bar
                    dataKey="eventCount"
                    name="Total Events (2000-2026)"
                    fill="var(--ap-primary)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Monthly Seasonality Curve */}
          <div className="bg-white border border-carbon-20 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-carbon-20">
              <div>
                <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-ap-link" />
                  Monthly Seasonality Curve (Jan-Dec)
                </h3>
                <p className="text-xs text-carbon-60">Calendar month disaster distribution in {data.division}</p>
              </div>
            </div>
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.seasonalPattern} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
                  <XAxis dataKey="monthName" tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ap-bg-canvas)',
                      borderColor: 'var(--ap-separator-opaque)',
                      borderRadius: 'var(--ap-radius-md)',
                      boxShadow: 'var(--ap-elev-flat)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Monthly Events"
                    stroke="var(--ap-sev-low)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: 'var(--ap-sev-low)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Hazard Mix Breakdown */}
          <div className="bg-white border border-carbon-20 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-carbon-20">
              <div>
                <h3 className="text-sm font-bold text-carbon-90 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-ap-link" />
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
                        <Cell key={entry.hazard} fill={getHazardColor(entry.hazard)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--ap-bg-canvas)',
                        borderColor: 'var(--ap-separator-opaque)',
                        borderRadius: 'var(--ap-radius-md)',
                        boxShadow: 'var(--ap-elev-flat)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full sm:w-1/2 space-y-1.5 text-xs max-h-56 overflow-y-auto pr-2">
                {data.hazardBreakdown.map((h) => (
                  <div key={h.hazard} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5" style={{ backgroundColor: getHazardColor(h.hazard) }} />
                      <span className="font-medium text-carbon-70 truncate max-w-[130px]">{h.hazard}</span>
                    </div>
                    <span className="text-carbon-60 font-semibold tabular-nums">
                      {h.count} ({h.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Disaster Events Archive Table */}
      <div className="bg-white border border-carbon-20 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-carbon-20 gap-4">
          <div>
            <h2 className="text-base font-bold text-carbon-90 flex items-center gap-2">
              <Layers className="w-4 h-4 text-ap-link" />
              Historical Climatic Events Archive ({data.division} Division)
            </h2>
            <p className="text-xs text-carbon-60">
              Showing {filteredEvents.length.toLocaleString()} of {data.totalEvents.toLocaleString()} verified records
              from the 2000-2026 Bangladesh Climatic Hazards Catalog
            </p>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-carbon-60" />
              <input
                type="text"
                aria-label="Search historical events"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, GLIDE, desc..."
                className="h-11 min-h-[44px] pl-8 pr-3 text-base border border-carbon-20 rounded-md bg-carbon-05 text-carbon-80 placeholder-carbon-40 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
              />
            </div>

            <select
              aria-label="Filter by hazard type"
              value={selectedHazard}
              onChange={(e) => setSelectedHazard(e.target.value)}
              className="h-11 min-h-[44px] py-1.5 px-2.5 text-base border border-carbon-20 rounded-2xl bg-carbon-05 text-carbon-70 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
            >
              <option value="all">All Hazards</option>
              {availableHazards.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by district"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="h-11 min-h-[44px] py-1.5 px-2.5 text-base border border-carbon-20 rounded-2xl bg-carbon-05 text-carbon-70 focus:outline-none focus-visible:outline focus-visible:outline-offset-1"
            >
              <option value="all">All Districts</option>
              {availableDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <CardStackRows
          className="mt-4"
          rows={filteredEvents.slice(0, 40).map((event) => {
            const districtSlug =
              resolveCanonicalDistrict(event.district)?.id ||
              event.district.toLowerCase().replace(/[^a-z0-9]/g, '');
            return {
              key: event.id,
              heading: event.date,
              fields: [
                {
                  label: 'District',
                  value: (
                    <Link to={`/forecast/district/${districtSlug}`} className="font-semibold text-ap-link">
                      {event.district}
                    </Link>
                  ),
                },
                { label: 'Hazard Type', value: event.hazard },
                { label: 'GLIDE', value: event.glide || '-' },
                { label: 'Severity', value: event.severity ? event.severity.toFixed(2) : 'Not recorded' },
                { label: 'Description', value: event.desc || 'No descriptive summary logged' },
                { label: 'Event ID', value: event.id },
                { label: 'Coordinates', value: `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}` },
              ],
              footer: (
                <Link
                  to={`/forecast/district/${districtSlug}`}
                  className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-ap-link"
                >
                  <span>Go to {event.district} District Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ),
            };
          })}
        />
        <div className="mt-4 hidden overflow-x-auto md:block">
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
                const districtSlug =
                  resolveCanonicalDistrict(event.district)?.id ||
                  event.district.toLowerCase().replace(/[^a-z0-9]/g, '');

                return (
                  <React.Fragment key={event.id}>
                    <tr className="hover:bg-carbon-05/80 transition-colors">
                      <td className="p-3 font-medium text-carbon-90 whitespace-nowrap tabular-nums">{event.date}</td>
                      <td className="p-3 font-semibold text-carbon-80">
                        <Link to={`/forecast/district/${districtSlug}`} className="hover:text-ap-link">
                          {event.district}
                        </Link>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: getHazardSurface(event.hazard),
                            color: 'var(--ap-label)',
                            borderColor: getHazardBorder(event.hazard),
                            borderWidth: 1,
                            borderStyle: 'solid',
                          }}
                        >
                          {event.hazard}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-carbon-60 whitespace-nowrap">{event.glide || '-'}</td>
                      <td className="p-3 font-bold text-carbon-70">
                        <span
                          className={`px-2 py-0.5 rounded text-xs tabular-nums ${
                            event.severity >= 3.0
                              ? 'bg-carbon-05 text-ap-link border border-carbon-20'
                              : event.severity >= 2.0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-carbon-10 text-carbon-70'
                          }`}
                        >
                          {event.severity ? event.severity.toFixed(2) : '1.00'}
                        </span>
                      </td>
                      <td className="p-3 text-carbon-60 max-w-xs truncate">
                        {event.desc || 'No descriptive summary logged'}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                          className="text-ap-link font-semibold inline-flex min-h-[44px] items-center gap-1 cursor-pointer touch-manipulation"
                        >
                          <span>{isExpanded ? 'Less' : 'Details'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-carbon-05/30">
                        <td colSpan={7} className="p-4 border-b border-carbon-20">
                          <div className="bg-white border border-carbon-20 rounded-2xl p-4 text-xs space-y-2">
                            <div className="flex flex-wrap items-center justify-between text-carbon-60 pb-2 border-b border-carbon-20 gap-2">
                              <span>
                                <strong>Event ID:</strong> {event.id}
                              </span>
                              <span>
                                <strong>Coordinates:</strong> {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
                              </span>
                              <span>
                                <strong>GLIDE Reference:</strong> {event.glide || 'None assigned'}
                              </span>
                            </div>
                            <p className="text-carbon-70 leading-relaxed pt-1">
                              <strong>Report Summary:</strong>{' '}
                              {event.desc || 'Verified district-level climatic hazard record in the 2000-2026 catalog.'}
                            </p>
                            <div className="pt-2 flex justify-end">
                              <Link
                                to={`/forecast/district/${districtSlug}`}
                                className="inline-flex items-center gap-1 text-ap-link hover:text-ap-link font-semibold"
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
