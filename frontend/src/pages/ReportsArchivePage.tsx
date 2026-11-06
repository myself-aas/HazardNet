import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { fetchArchiveIndex, type ArchiveIndex } from '../lib/reports';

/**
 * `/reports/archive` — every daily report the CI/CD pipeline has published,
 * newest first, with the run metadata and highest-severity advisory of each day.
 */
export const ReportsArchivePage: React.FC = () => {
  const [archive, setArchive] = useState<ArchiveIndex | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const index = await fetchArchiveIndex();
      if (!cancelled) { setArchive(index); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-ap-lg py-8">
      <Breadcrumbs customItems={[{ label: 'Home', path: '/' }, { label: 'Daily reports', path: '/reports' }, { label: 'Archive', path: '/reports/archive' }]} />
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-carbon-90">Daily report archive</h1>
        <p className="mt-2 text-carbon-60">
          One report per verified Kaggle dataset run, published by the daily CI/CD pipeline.{' '}
          <Link to="/reports" className="text-ap-link underline">Latest report</Link>
        </p>
      </header>
      {loading && <p className="py-8 text-center text-sm text-carbon-60" role="status">Loading report archive…</p>}
      {!loading && (!archive || archive.entries.length === 0) && (
        <p className="py-8 text-center text-sm text-carbon-60">No archived reports yet. The next successful pipeline run will publish the first one.</p>
      )}
      {!loading && archive && archive.entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-carbon-30 text-left">
                <th className="px-2 py-1 font-bold text-carbon-80">Date</th>
                <th className="px-2 py-1 font-bold text-carbon-80">Run</th>
                <th className="px-2 py-1 font-bold text-carbon-80">Kaggle v.</th>
                <th className="px-2 py-1 font-bold text-carbon-80">Rows</th>
                <th className="px-2 py-1 font-bold text-carbon-80">Top advisory</th>
              </tr>
            </thead>
            <tbody>
              {archive.entries.map((entry) => (
                <tr key={entry.date} className="border-b border-carbon-10">
                  <td className="px-2 py-1">
                    <Link to={`/reports/${entry.date}`} className="font-semibold text-ap-link underline">
                      {entry.date}
                    </Link>
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-carbon-60">{entry.runId}</td>
                  <td className="px-2 py-1">{entry.datasetVersion ?? '—'}</td>
                  <td className="px-2 py-1">{entry.rows}</td>
                  <td className="px-2 py-1">
                    {entry.topAdvisory
                      ? `${entry.topAdvisory.district} · ${entry.topAdvisory.hazard} (${entry.topAdvisory.tier}, ${entry.topAdvisory.severityScore.toFixed(2)})`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};

export default ReportsArchivePage;
