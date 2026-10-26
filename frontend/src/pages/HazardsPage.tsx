import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
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
} from 'lucide-react';
import {
  fetchEventsSummary,
  fetchForecastFeed,
  EventsSummary,
  ForecastRecord,
  ForecastFeed,
} from '../lib/eventsClient';
import { getHazardColor, getHazardSurface } from '../lib/hazardPalette';
import { DataStateEmpty, DataStateError, DataStateLoading } from '../components/ui/DataState';
import { KeyFigures } from '../components/ui/KeyFigures';

interface HazardCardData {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: any;
  season: string;
  description: string;
  /** False for Earthquake: the archive records it, the model does not forecast it. */
  modelled: boolean;
  totalHistoricalEvents: number;
  /** null when no archive is loaded, so there is no denominator to compute a share from. */
  percentage: number | null;
  activeForecastsCount: number;
  topDivisions: string[];
}

interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  icon: any;
  season: string;
  description: string;
  /** Absent means modelled; only Earthquake carries `false`. */
  modelled?: boolean;
}

const HAZARDS_CATALOG: CatalogEntry[] = [
  {
    id: 'cyclone',
    slug: 'cyclone',
    name: 'Tropical Cyclone',
    icon: Wind,
    season: 'May, Oct - Nov (Pre & Post-Monsoon)',
    description:
      'Catastrophic marine vortexes accompanied by storm surges penetrating coastal embankments in the Bay of Bengal.',
  },
  {
    id: 'flood',
    slug: 'flood',
    name: 'Flood',
    icon: Droplets,
    season: 'Jun - Sep (Monsoon Inundation)',
    description:
      'Major transboundary river swells across the Brahmaputra, Ganges, and Meghna basins affecting millions.',
  },
  {
    id: 'flash-flood',
    slug: 'flash-flood',
    name: 'Flash Flood',
    icon: Waves,
    season: 'Apr - Jun (Pre-Monsoon Haor Basins)',
    description:
      'Sudden, high-velocity hill torrents rushing from Meghalaya and Tripura hills drowning standing Boro paddy.',
  },
  {
    id: 'severe-local-storm',
    slug: 'severe-local-storm',
    name: 'Severe Local Storm',
    icon: CloudLightning,
    season: 'Mar - May (Norwesters / Kalbaishakhi)',
    description:
      'Violent squalls, tornado cells, lightning strikes, and hailstorms causing localized structural and crop ruin.',
  },
  {
    id: 'cold-wave',
    slug: 'cold-wave',
    name: 'Cold Wave',
    icon: Snowflake,
    season: 'Dec - Jan (Winter)',
    description:
      'Severe temperature drops and persistent dense fog in the northern/north-western divisions harming health and crops.',
  },
  {
    id: 'drought',
    slug: 'drought',
    name: 'Drought',
    icon: Sun,
    season: 'Feb - May (Rabi & Pre-Kharif)',
    description: 'Soil moisture depletion and depleted aquifers in the Barind tract delaying aman and rabi sowing.',
  },
  {
    id: 'heat-wave',
    slug: 'heat-wave',
    name: 'Heat Wave',
    icon: Sun,
    season: 'Apr - Jun (Pre-Monsoon)',
    description:
      'Extreme thermal stress with ambient temperatures exceeding 40°C triggering power grid strain and livestock mortality.',
  },
  {
    // Earthquake is tracked in the archive but is not one of the eight climatic classes
    // the hazard model scores — see `frontend/src/lib/hazardPalette.ts`, which states the
    // same exclusion. The flag keeps the page's count honest instead of adding a ninth.
    modelled: false,
    id: 'earthquake',
    slug: 'earthquake',
    name: 'Earthquake',
    icon: Activity,
    season: 'Seismic faults (Dauki, Chittagong-Tripura)',
    description:
      'Tectonic vulnerability along the Dauki Fault and Indo-Burma subduction zones threatening dense urban centers.',
  },
  {
    id: 'fire',
    slug: 'fire',
    name: 'Fire',
    icon: Flame,
    season: 'Mar - May (Dry Season)',
    description:
      'Dry season structural and agricultural fires exacerbated by low humidity and strong southerly breezes.',
  },
];

export const HazardsPage: React.FC = () => {
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
        const [sumData, fcFeed] = await Promise.all([fetchEventsSummary(), fetchForecastFeed()]);
        if (mounted) {
          setSummary(sumData);
          setForecasts(fcFeed.records);
          setFeed(fcFeed.source);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'The hazard archive could not be read.');
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [reloadNonce]);

  // `source: 'fallback'` means neither the API nor the committed summary artifact answered. Keep
  // the catalogue visible, but show the archive's empty state instead of claiming statistics.
  const archiveLoaded = summary !== null && summary.source !== 'fallback';

  const hazardsList: HazardCardData[] = HAZARDS_CATALOG.map((h) => {
    const histEvents =
      summary?.hazardBreakdown?.find(
        (hb) =>
          hb.hazard.toLowerCase() === h.name.toLowerCase() ||
          hb.hazard.toLowerCase().includes(h.slug) ||
          h.name.toLowerCase().includes(hb.hazard.toLowerCase()),
      )?.count ||
      summary?.byHazard?.[h.name] ||
      0;
    const totalEvents = archiveLoaded ? summary!.totalEvents : 0;
    const pct = totalEvents > 0 ? Math.round((histEvents / totalEvents) * 1000) / 10 : null;
    const activeFc = forecasts.filter(
      (f) => f.hazardType.toLowerCase().includes(h.slug) || h.name.toLowerCase().includes(f.hazardType.toLowerCase()),
    );

    return {
      ...h,
      modelled: h.modelled !== false,
      color: getHazardColor(h.slug),
      totalHistoricalEvents: histEvents,
      // A share of the archive is a claim about the hazard model. Earthquake has archive
      // volume but no modelled class, so it reports no share rather than a misleading one.
      percentage: h.modelled === false ? null : pct,
      activeForecastsCount: activeFc.length,
      topDivisions: ['Dhaka', 'Chattogram', 'Sylhet'],
    };
  });

  const modelledCount = hazardsList.filter((h) => h.modelled).length;
  const archiveOnlyCount = hazardsList.length - modelledCount;

  const chartData = hazardsList
    .map((h) => ({
      name: h.name,
      'Historical Occurrences': h.totalHistoricalEvents,
      'Active Warning Records': h.activeForecastsCount,
    }))
    .sort((a, b) => b['Historical Occurrences'] - a['Historical Occurrences']);

  return (
    <div className="min-h-dvh bg-carbon-05 text-carbon-80 pb-8 pt-6 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-carbon-60 mb-4">
        <Link to="/" className="hover:text-ap-link transition-colors">
          Home
        </Link>
        <span>/</span>
        <span className="text-carbon-80 font-medium">Hazards</span>
      </div>

      {/* Header: the title, the count that is true, and a row of figures rather than tiles. */}
      <div className="mb-8">
        <h1 className="text-ap-lead font-bold sm:text-ap-display-md text-carbon-90 tracking-tight">
          Hazards of Bangladesh
        </h1>
        <p className="mt-2 text-base leading-[1.62] text-carbon-70 max-w-2xl">
          The eight climatic classes the hazard model scores, and earthquake — tracked in the 2000–2026 archive but
          outside the model. Grounded in the BGD Climatic Hazards Dataset and HazardNet forecasts.
        </p>
        <KeyFigures
          className="mt-4"
          label="Hazard coverage"
          figures={[
            { label: 'Climatic classes', value: modelledCount },
            { label: 'Archive-only classes', value: archiveOnlyCount },
            {
              label: 'Recorded events',
              value: archiveLoaded ? summary!.totalEvents.toLocaleString() : '—',
              emphasis: true,
            },
            { label: 'Active forecasts', value: feed === 'none' ? '—' : forecasts.length },
          ]}
        />
      </div>

      {/* Interactive National Hazards Frequency Chart */}
      <div className="bg-white border border-carbon-20 rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-carbon-20 gap-2">
          <div>
            <h2 className="text-base font-semibold text-carbon-90 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-ap-link" />
              National Hazard Distribution & Alert Frequency
            </h2>
            <p className="text-xs text-carbon-60">
              Comparing historical frequency (2000-2026) with current active forecast warnings
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-carbon-10 text-carbon-70 rounded-md">
            {archiveLoaded
              ? `Source: BGD Climatic Hazards Dataset (${summary!.totalEvents.toLocaleString()} events)`
              : 'Source: no hazard archive is loaded in this deployment'}
          </span>
        </div>

        {loading && (
          <DataStateLoading
            label="Loading the hazard archive"
            detail="Cross-referencing historical records with the current forecast run."
          />
        )}

        {!loading && error && (
          <DataStateError
            title="The hazard archive could not be loaded"
            detail={error}
            onRetry={() => setReloadNonce((n) => n + 1)}
            className="mt-4"
          />
        )}

        {!loading && !error && !archiveLoaded && (
          <DataStateEmpty
            className="mt-4"
            title="No hazard archive is loaded in this deployment"
            body="The hazard profiles below are the classification framework this deployment ships. The occurrence counts they usually carry come from the historical archive, which is not present here; nothing is interpolated to replace it."
          />
        )}

        <div className={`h-72 sm:h-80 w-full pt-4 ${!loading && !error && archiveLoaded ? '' : 'hidden'}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ap-separator)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--ap-label-secondary)' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--ap-bg-canvas)',
                  borderColor: 'var(--ap-separator-opaque)',
                  borderRadius: 'var(--ap-radius-md)',
                  boxShadow: 'var(--ap-elev-flat)',
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar dataKey="Historical Occurrences" fill="var(--ap-primary)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Active Warning Records" fill="var(--ap-sev-low)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 9 Hazards Cards Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-carbon-90">Individual Hazard Profiles</h2>
          <span className="text-xs text-carbon-60">
            Select any hazard for dedicated temporal and geographic analytics
          </span>
        </div>

        <div className="grid grid-cols-1 min-[880px]:grid-cols-2 min-[1200px]:grid-cols-3 gap-5">
          {hazardsList.map((hazard) => {
            const Icon = hazard.icon;
            return (
              <Link
                key={hazard.id}
                to={`/hazards/${hazard.slug}`}
                className="bg-white border border-carbon-20 rounded-2xl p-6 hover:border-carbon-30 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="p-2.5 transition-colors"
                      style={{ backgroundColor: getHazardSurface(hazard.slug), color: hazard.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    {hazard.modelled ? (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70">
                        {hazard.percentage === null
                          ? 'Share of events not available'
                          : `${hazard.percentage}% of all events`}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-carbon-10 text-carbon-70">
                        Archive only · not modelled
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-carbon-90 group-hover:text-ap-link transition-colors">
                    {hazard.name}
                  </h3>
                  <p className="text-xs text-carbon-60 mt-2 leading-relaxed line-clamp-2">{hazard.description}</p>

                  <div className="mt-4 pt-3 border-t border-carbon-20 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-carbon-60">2000–2026 Archive:</span>
                      <span className="font-bold text-carbon-90">
                        {archiveLoaded ? `${hazard.totalHistoricalEvents.toLocaleString()} events` : 'Not loaded'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-carbon-60">Peak Season:</span>
                      <span className="font-medium text-carbon-70 truncate max-w-[170px]">{hazard.season}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-carbon-60">Active Warning Records:</span>
                      <span className="font-bold text-ap-link">
                        {!hazard.modelled
                          ? 'Not modelled'
                          : feed === 'none'
                            ? 'Not loaded'
                            : `${hazard.activeForecastsCount} active`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-carbon-20 flex min-h-[44px] items-center justify-between text-sm font-semibold text-ap-link">
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
