import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReportTemplate from '../components/ReportTemplate';
import Breadcrumbs from '../components/Breadcrumbs';
import {
  fetchArchiveIndex, fetchDailySnapshot, fetchReportMarkdown, isValidReportDate,
  type ArchiveIndex, type DailySnapshot,
} from '../lib/reports';

/**
 * `/reports` and `/reports/<YYYY-MM-DD>` — the daily report produced by the
 * `public_daily_advisories.yml` pipeline from the Kaggle dataset. Without a date
 * the latest archived report is shown; the interactive charts and tables read the
 * live published snapshot, so the page always shows real-time values.
 */
export const ReportsPage: React.FC = () => {
  const { date } = useParams<{ date?: string }>();
  const [archive, setArchive] = useState<ArchiveIndex | null>(null);
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const [index, snap] = await Promise.all([fetchArchiveIndex(), fetchDailySnapshot()]);
      if (cancelled) return;
      setArchive(index);
      setSnapshot(snap);
      const target = date ?? index?.entries[0]?.date;
      if (!target || !isValidReportDate(target)) {
        setLoading(false);
        if (date) setNotFound(true);
        return;
      }
      const md = await fetchReportMarkdown(target);
      if (cancelled) return;
      setMarkdown(md);
      if (!md && date) setNotFound(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date]);

  const latest = archive?.entries[0];
  const currentDate = date ?? latest?.date;

  return (
    <main className="mx-auto max-w-3xl px-ap-lg py-8">
      <Breadcrumbs customItems={[{ label: 'Home', path: '/' }, { label: 'Daily reports', path: '/reports' }, ...(date ? [{ label: date, path: `/reports/${date}` }] : [])]} />
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-carbon-90">Daily report{currentDate ? `: ${currentDate}` : ''}</h1>
        <p className="mt-2 text-carbon-60">
          Published automatically from the latest verified Kaggle dataset run.{' '}
          <Link to="/reports/archive" className="text-ap-link underline">Browse the archive</Link>
        </p>
        {latest && !date && (
          <p className="mt-1 text-sm text-carbon-60">
            Showing the most recent report ({latest.date}, run {latest.runId}). Older reports: <Link to={`/reports/${latest.date}`} className="text-ap-link underline">{latest.date}</Link> or the <Link to="/reports/archive" className="text-ap-link underline">full archive</Link>.
          </p>
        )}
      </header>
      {loading && <p className="py-8 text-center text-sm text-carbon-60" role="status">Loading daily report…</p>}
      {!loading && notFound && (
        <p className="py-8 text-center text-sm text-carbon-60">No report published for {date ?? 'today'} yet. Check the <Link to="/reports/archive" className="text-ap-link underline">archive</Link> for previous reports.</p>
      )}
      {!loading && !notFound && markdown && <ReportTemplate markdown={markdown} snapshot={snapshot} />}
    </main>
  );
};

export default ReportsPage;
