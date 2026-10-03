import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DistrictRiskMap, DistrictVulnerabilityRecord } from '../components/DistrictRiskMap';
import { DistrictVulnerabilityTable } from '../components/DistrictVulnerabilityTable';
import { HistoricalHazardCatalog, HistoricalHazardRecord } from '../components/HistoricalHazardCatalog';
import { TemporalTrendChart, TemporalTrendRecord } from '../components/TemporalTrendChart';
import { MultiHazardDistributionChart, HazardDistributionRecord } from '../components/MultiHazardDistributionChart';
import { GlideResourcePopover } from '../components/GlideResourcePopover';
import { EventReportModal, DisasterMasterEvent } from '../components/EventReportModal';
import { usePageSeo } from '../hooks/usePageSeo';

type HistoricalData = {
  masterEvents: DisasterMasterEvent[];
  vulnerability: DistrictVulnerabilityRecord[];
  trends: TemporalTrendRecord[];
  distribution: HazardDistributionRecord[];
  catalog: HistoricalHazardRecord[];
};

async function fetchHistoricalData(): Promise<HistoricalData> {
  const paths = [
    'events-master',
    'districts-vulnerability',
    'temporal-trends',
    'hazard-distribution',
    'hazard-catalog-index',
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
  };
}

export const HistoricalCatalogPage: React.FC = () => {
  usePageSeo('/archive');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [activeGlide, setActiveGlide] = useState<string | null>(null);
  const [isGlideOpen, setIsGlideOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<DisasterMasterEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
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
    return <div className="min-h-dvh bg-carbon-90 text-carbon-10 p-8" role="status">Loading historical archive…</div>;
  }

  if (isError || !data) {
    return <div className="min-h-dvh bg-carbon-90 text-carbon-10 p-8" role="alert">Historical archive data is temporarily unavailable.</div>;
  }

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
    <div className="min-h-dvh bg-carbon-90 text-carbon-10 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Hero Header */}
        <header className="border-b border-carbon-80 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-800/80">
                  Phase E Verified
                </span>
                <span className="text-xs font-mono text-carbon-40">
                  Empirical Catalog 2000–2026
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Historical Hazard Archive
              </h1>
              <p className="text-sm text-carbon-40 mt-2 max-w-3xl leading-relaxed">
                3,062 recorded event-district observations in the 26-year empirical multi-hazard registry spanning all 64 districts of Bangladesh. This is an observation count, not a count of disasters: 70 distinct physical episodes are cross-referenced with UN OCHA ReliefWeb, FAO GIEWS, WHO Emergency, and ADRC multilateral GLIDE disaster systems.
              </p>
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-4 bg-carbon-90 border border-carbon-80 p-3.5 rounded-2xl shrink-0">
              <div className="text-center px-2 border-r border-carbon-80">
                <div className="text-xs text-carbon-40 font-medium">Districts</div>
                <div className="text-lg font-bold font-mono text-white">64</div>
              </div>
              <div className="text-center px-2 border-r border-carbon-80">
                <div className="text-xs text-carbon-40 font-medium">Clean Events</div>
                <div className="text-lg font-bold font-mono text-rose-400">3,062</div>
              </div>
              <div className="text-center px-2">
                <div className="text-xs text-carbon-40 font-medium">GLIDE Rec.</div>
                <div className="text-lg font-bold font-mono text-blue-400">70</div>
              </div>
            </div>
          </div>
        </header>

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
