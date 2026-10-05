import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DistrictRiskMap, DistrictVulnerabilityRecord } from '../components/DistrictRiskMap';
import { DistrictVulnerabilityTable } from '../components/DistrictVulnerabilityTable';
import { HistoricalHazardCatalog, HistoricalHazardRecord } from '../components/HistoricalHazardCatalog';
import { TemporalTrendChart, TemporalTrendRecord } from '../components/TemporalTrendChart';
import { MultiHazardDistributionChart, HazardDistributionRecord } from '../components/MultiHazardDistributionChart';
import { GlideResourcePopover } from '../components/GlideResourcePopover';
import { EventReportModal, DisasterMasterEvent } from '../components/EventReportModal';
import { DataStateEmpty, DataStateError, DataStateLoading } from '../components/ui/DataState';

type BaselineMetric = { metric: string; value: string; numeric?: number };
type CorrelationMatrix = { variables: string[]; matrix: (number | null)[][] };
type GeeValidation = {
  gee_rows: number;
  catalog_rows: number;
  matched: number;
  mismatched: number;
  sample_mismatches: { id: string; field: string }[];
} | null;

type HistoricalData = {
  masterEvents: DisasterMasterEvent[];
  vulnerability: DistrictVulnerabilityRecord[];
  trends: TemporalTrendRecord[];
  distribution: HazardDistributionRecord[];
  catalog: HistoricalHazardRecord[];
  baseline: { metrics: BaselineMetric[] };
  correlations: CorrelationMatrix;
  geeValidation: GeeValidation;
};

async function fetchHistoricalData(): Promise<HistoricalData> {
  const paths = [
    'events-master',
    'districts-vulnerability',
    'temporal-trends',
    'hazard-distribution',
    'hazard-catalog-index',
    'national-summary',
    'correlations',
    'gee-validation',
  ];
  const responses = await Promise.all(
    paths.map(async (name) => {
      const response = await fetch(`/data/historical/${name}.json`);
      if (!response.ok) throw new Error(`Unable to load ${name} (${response.status})`);
      return response.json();
    }),
  );

  return {
    masterEvents: responses[0] as DisasterMasterEvent[],
    vulnerability: responses[1] as DistrictVulnerabilityRecord[],
    trends: responses[2] as TemporalTrendRecord[],
    distribution: responses[3] as HazardDistributionRecord[],
    catalog: responses[4] as HistoricalHazardRecord[],
    baseline: (responses[5] as { metrics?: BaselineMetric[] }).metrics
      ? (responses[5] as { metrics: BaselineMetric[] })
      : { metrics: [] },
    correlations: (responses[6] as CorrelationMatrix) ?? { variables: [], matrix: [] },
    geeValidation: (responses[7] as GeeValidation) ?? null,
  };
}

export const HistoricalCatalogPage: React.FC = () => {
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [activeGlide, setActiveGlide] = useState<string | null>(null);
  const [isGlideOpen, setIsGlideOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<DisasterMasterEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['historical-catalog'],
    queryFn: fetchHistoricalData,
    staleTime: 1000 * 60 * 60,
  });

  // Map GLIDE to master event lookup
  const masterByGlide = useMemo(() => {
    const map = new Map<string, DisasterMasterEvent>();
    for (const evt of data?.masterEvents ?? []) {
      if (evt.glide) {
        map.set(evt.glide.trim().toUpperCase(), evt);
      }
    }
    return map;
  }, [data?.masterEvents]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-carbon-05 text-carbon-80">
        <DataStateLoading
          label="Loading the historical archive"
          detail="Reading the event master, district vulnerability, trend and distribution artifacts."
        />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-dvh bg-carbon-05 text-carbon-80 p-4 sm:p-8">
        <DataStateError
          title="The historical archive is temporarily unavailable"
          onRetry={() => { void refetch(); }}
        />
      </div>
    );
  }

  /**
   * The five artifacts loaded, but with no rows. That is the archive's empty state: the page still
   * renders its shell, and says which reads came back empty instead of drawing zeroes as data.
   */
  const archiveIsEmpty = data.catalog.length === 0 && data.masterEvents.length === 0;

  const handleOpenGlide = (glideId: string) => {
    setActiveGlide(glideId);
    setIsGlideOpen(true);
  };

  const handleSelectEvent = (record: HistoricalHazardRecord) => {
    const cleanGlide = record.glide?.trim().toUpperCase();
    const existing = cleanGlide ? masterByGlide.get(cleanGlide) : null;

    if (existing) {
      setActiveEvent(existing);
    } else {
      // Synthesize event modal from catalog record
      setActiveEvent({
        event_id: record.id,
        glide: record.glide || 'Domestic Catalog',
        date: record.date,
        year: record.year,
        hazard_type: record.hazard_type,
        location_districts: [record.district],
        full_description: record.summary && record.summary !== 'No detailed description available.'
          ? record.summary
          : `Historical ${record.hazard_type} event recorded in ${record.district} district on ${record.date}. Validated severity index: ${record.severity_index_name} (score: ${record.severity_score}).`,
        gee_start: record.gee_start,
        gee_end: record.gee_end,
        validated_affected: record.validated_affected,
      });
    }
    setIsEventModalOpen(true);
  };

  return (
    <div className="min-h-dvh bg-carbon-05 text-carbon-80 py-8 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Hero Header */}
        <header className="border-b border-carbon-20 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-50 text-nasa-red border border-rose-200">
                  Phase E Verified
                </span>
                <span className="text-xs font-mono text-carbon-60">
                  Empirical Catalog 2000–2026
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-carbon-90 tracking-tight">
                Historical Hazard Archive
              </h1>
              <p className="text-sm text-carbon-60 mt-2 max-w-3xl leading-relaxed">
                3,062 recorded event-district observations in the 26-year empirical multi-hazard registry spanning all 64 districts of Bangladesh. This is an observation count, not a count of disasters: 70 distinct physical episodes are cross-referenced with UN OCHA ReliefWeb, FAO GIEWS, WHO Emergency, and ADRC multilateral GLIDE disaster systems.
              </p>
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-4 bg-white border border-carbon-20 p-3.5 rounded-2xl shrink-0">
              <div className="text-center px-2 border-r border-carbon-20">
                <div className="text-xs text-carbon-60 font-medium">Districts</div>
                <div className="text-lg font-bold font-mono text-carbon-90">64</div>
              </div>
              <div className="text-center px-2 border-r border-carbon-20">
                <div className="text-xs text-carbon-60 font-medium">Clean Events</div>
                <div className="text-lg font-bold font-mono text-nasa-red">3,062</div>
              </div>
              <div className="text-center px-2">
                <div className="text-xs text-carbon-60 font-medium">GLIDE Rec.</div>
                <div className="text-lg font-bold font-mono text-nasa-blue">70</div>
              </div>
            </div>
          </div>
        </header>

        {data.baseline.metrics.length > 0 && (
          <section
            aria-label="National baseline statistics"
            className="bg-white border border-carbon-20 rounded-2xl p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-base font-bold text-carbon-90 tracking-tight">National baseline</h2>
              <span className="text-xs font-mono text-carbon-60">2000 to 2026 · general summary stats</span>
            </div>
            <dl className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {data.baseline.metrics.map((m) => (
                <div key={m.metric} className="bg-carbon-05 border border-carbon-10 rounded-xl px-3 py-2.5">
                  <dt className="text-xs text-carbon-60 leading-snug">{m.metric}</dt>
                  <dd className="text-sm font-bold font-mono text-carbon-90 tabular-nums mt-0.5">{m.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
              {data.correlations.variables.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-carbon-60 mb-2">
                    Statistical correlations (Pearson)
                  </h3>
                  <ul className="md:hidden flex flex-col gap-2 mb-3">
                    {data.correlations.matrix.map((row, i) =>
                      row.map((cell, j) =>
                        cell == null || i <= j ? null : (
                          <li
                            key={`${i}-${j}`}
                            className="flex items-center justify-between gap-3 bg-carbon-05 border border-carbon-10 rounded-xl px-3 py-2 text-xs font-mono tabular-nums"
                          >
                            <span className="text-carbon-70">
                              {data.correlations.variables[i].replace(/_/g, ' ')} and{' '}
                              {data.correlations.variables[j].replace(/_/g, ' ')}
                            </span>
                            <span className="font-bold text-carbon-90">{cell.toFixed(2)}</span>
                          </li>
                        ),
                      ),
                    )}
                  </ul>
                  <div className="hidden md:block">
                  <table className="w-full text-xs font-mono tabular-nums">
                    <thead>
                      <tr>
                        <th className="text-left py-1 pr-2 font-semibold text-carbon-60"></th>
                        {data.correlations.variables.map((v) => (
                          <th key={v} className="text-right py-1 pl-2 font-semibold text-carbon-60">
                            {v.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.correlations.matrix.map((row, i) => (
                        <tr key={data.correlations.variables[i]} className="border-t border-carbon-10">
                          <th className="text-left py-1 pr-2 font-semibold text-carbon-70">
                            {data.correlations.variables[i].replace(/_/g, ' ')}
                          </th>
                          {row.map((cell, j) => (
                            <td key={j} className="text-right py-1 pl-2 text-carbon-80">
                              {cell == null ? '·' : cell.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              {data.geeValidation && (
                <div className="text-xs leading-relaxed text-carbon-70">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-carbon-60 mb-2">
                    GEE export cross-check
                  </h3>
                  <p>
                    {data.geeValidation.gee_rows} hand-off rows were compared against the{' '}
                    {data.geeValidation.catalog_rows} row clean archive: {data.geeValidation.matched} agree
                    on GLIDE, district, hazard and observation window; {data.geeValidation.mismatched} carry
                    drift, mostly revised GLIDE numbers. The drift is reported by gee-validation.json and is
                    never silently absorbed into the catalog.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {archiveIsEmpty && (
          <DataStateEmpty
            title="This deployment's historical archive is empty"
            body="The master-event, catalog, vulnerability, trend and distribution artifacts all loaded with no records, so the map ranking, the charts and the catalog below have nothing to read."
          />
        )}

        {/* Spatial & Vulnerability Section (TASK-017 & TASK-018) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6">
            <DistrictRiskMap
              districts={data.vulnerability}
              selectedDistrict={selectedDistrict}
              onSelectDistrict={(d) => setSelectedDistrict(d)}
            />
          </div>
          <div className="lg:col-span-6">
            <DistrictVulnerabilityTable
              districts={data.vulnerability}
              selectedDistrict={selectedDistrict}
              onSelectDistrict={(d) => setSelectedDistrict(d)}
            />
          </div>
        </section>

        {/* Temporal & Classification Analytics (TASK-019) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7">
            <TemporalTrendChart data={data.trends} />
          </div>
          <div className="lg:col-span-5">
            <MultiHazardDistributionChart data={data.distribution} />
          </div>
        </section>

        {/* Full Historical Catalog (TASK-018 & TASK-020) */}
        <section>
          <HistoricalHazardCatalog
            records={data.catalog}
            onSelectEvent={handleSelectEvent}
            onOpenGlide={handleOpenGlide}
          />
        </section>
      </div>

      {/* Multilateral GLIDE Popover */}
      {activeGlide && (
        <GlideResourcePopover
          glideId={activeGlide}
          isOpen={isGlideOpen}
          onClose={() => setIsGlideOpen(false)}
        />
      )}

      {/* Disaster Master Report Modal */}
      {activeEvent && (
        <EventReportModal
          event={activeEvent}
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          onOpenGlide={handleOpenGlide}
        />
      )}
    </div>
  );
};

export default HistoricalCatalogPage;
