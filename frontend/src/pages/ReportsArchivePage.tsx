import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/apple/primitives';
import Breadcrumbs from '../components/Breadcrumbs';
import { fetchArchiveIndex, type ArchiveIndex } from '../lib/reports';

function formatUtc(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return `${new Date(value).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function formatCount(value: number): string {
  return Number.isFinite(value) ? String(value) : 'Not recorded';
}

/** `/reports/archive` — published report dates, run provenance and coverage metadata. */
const ReportsArchivePage: React.FC = () => {
  const [archive, setArchive] = useState<ArchiveIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const index = await fetchArchiveIndex();
      if (!cancelled) {
        setArchive(index);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return (
    <main data-report-page="archive" className="mx-auto w-full max-w-7xl px-ap-lg py-6 sm:py-8">
      <Breadcrumbs customItems={[
        { label: 'Home', path: '/' },
        { label: 'Daily reports', path: '/reports' },
        { label: 'Archive', path: '/reports/archive' },
      ]} />
      <header className="report-print-header mt-6 border-b border-ap-hairline pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="ap-display-md">Daily report archive</h1>
            <p className="mt-2 max-w-[72ch] text-ap-label-secondary">
              Dated reports published after a verified daily data run. Each entry links to the report and its provenance.
            </p>
          </div>
          <Link
            to="/reports"
            className="no-print inline-flex min-h-[44px] items-center rounded-md border border-ap-hairline px-4 py-2 font-medium text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
          >
            Latest report
          </Link>
        </div>
        <p className="mt-5 max-w-[76ch] text-ap-body-sm text-ap-label">
          <strong className="font-semibold">Official warnings:</strong> HazardNet is not an official warning service. Consult the Bangladesh Meteorological Department (BMD)
          and Flood Forecasting and Warning Centre (FFWC). For emergencies, call 999.
        </p>
      </header>

      {loading && (
        <p className="py-8 text-center text-ap-body-sm text-ap-label-secondary" role="status" aria-live="polite">
          Loading report archive…
        </p>
      )}
      {!loading && !archive && (
        <section className="py-6" aria-labelledby="archive-unavailable-heading">
          <h2 id="archive-unavailable-heading" className="ap-tagline">Archive unavailable</h2>
          <p className="mt-2 max-w-[72ch] text-ap-label-secondary">The report index could not be loaded. Check your connection and try again.</p>
          <Button intent="secondary" className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
        </section>
      )}
      {!loading && archive && archive.entries.length === 0 && (
        <section className="py-6" aria-labelledby="archive-empty-heading">
          <h2 id="archive-empty-heading" className="ap-tagline">No archived reports yet</h2>
          <p className="mt-2 max-w-[72ch] text-ap-label-secondary">The first entry will appear after a verified publication run.</p>
        </section>
      )}
      {!loading && archive && archive.entries.length > 0 && (
        <section className="mt-8" aria-labelledby="archive-table-heading">
          <h2 id="archive-table-heading" className="ap-tagline">Published runs</h2>
          <p className="mt-2 text-ap-body-sm text-ap-label-secondary">
            {archive.entries.length} archived {archive.entries.length === 1 ? 'report' : 'reports'}, newest first. A row is a published advisory record, not an observed event count. When scores tie, one row is chosen by target date, district, then hazard.
          </p>
          <div className="report-table-region mt-4 overflow-x-auto rounded-md border border-ap-hairline" role="region" aria-label="Archived daily reports table" tabIndex={0}>
            <table className="min-w-[64rem] border-collapse text-ap-body-sm">
              <caption className="sr-only">Published daily reports, newest first, with run, coverage and one highest-scoring row per report. Ties are broken by target date, district, then hazard.</caption>
              <thead className="border-b border-ap-hairline bg-ap-grouped text-left text-ap-label">
                <tr>
                  <th scope="col" className="px-3 py-3 text-ap-label-md font-semibold">Report date</th>
                  <th scope="col" className="px-3 py-3 text-ap-label-md font-semibold">Generated at</th>
                  <th scope="col" className="px-3 py-3 text-ap-label-md font-semibold">Run / dataset</th>
                  <th scope="col" className="px-3 py-3 text-ap-label-md font-semibold">Coverage</th>
                  <th scope="col" className="px-3 py-3 text-ap-label-md font-semibold">Published tiers</th>
                  <th scope="col" className="px-3 py-3 text-ap-label-md font-semibold">One highest-scoring row</th>
                </tr>
              </thead>
              <tbody>
                {archive.entries.map((entry) => (
                  <tr key={entry.date} className="border-b border-ap-hairline last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        to={`/reports/${entry.date}`}
                        className="inline-flex min-h-[44px] items-center rounded font-semibold text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
                      >
                        {entry.date}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-ap-label-sm tabular-nums text-ap-label-secondary">
                      {formatUtc(entry.generatedAt)}
                    </td>
                    <td className="max-w-64 px-3 py-2 text-ap-label-secondary">
                      <span className="block break-all font-mono text-ap-label-sm text-ap-label">{entry.runId || 'Not recorded'}</span>
                      <span className="mt-1 block">Kaggle dataset {entry.datasetVersion ?? 'version not recorded'}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ap-label-secondary">
                      {formatCount(entry.rows)} rows · {formatCount(entry.districts)} districts · {formatCount(entry.forecastDays)} days
                    </td>
                    <td className="max-w-56 px-3 py-2 text-ap-label-secondary">
                      {Object.entries(entry.tiers ?? {}).length > 0
                        ? Object.entries(entry.tiers).map(([tier, count]) => `${tier}: ${count}`).join(' · ')
                        : 'Not recorded'}
                    </td>
                    <td className="max-w-80 px-3 py-2 text-ap-label-secondary">
                      {entry.topAdvisory ? (
                        <>
                          <span className="block">{entry.topAdvisory.district} · {entry.topAdvisory.hazard} · {entry.topAdvisory.tier} · score {Number.isFinite(entry.topAdvisory.severityScore) ? entry.topAdvisory.severityScore.toFixed(2) : 'not recorded'}</span>
                          {entry.topAdvisory.targetDate && <span className="mt-1 block text-ap-label-sm">Target date: {entry.topAdvisory.targetDate}</span>}
                        </>
                      ) : 'Not available'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};

export { ReportsArchivePage };
export default ReportsArchivePage;
