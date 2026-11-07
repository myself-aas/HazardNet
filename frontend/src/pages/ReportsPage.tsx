import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/apple/primitives';
import Breadcrumbs from '../components/Breadcrumbs';
import ReportTemplate, { ReportTableOfContents } from '../components/ReportTemplate';
import {
  fetchArchiveIndex,
  fetchDailySnapshot,
  fetchReportMarkdown,
  isValidReportDate,
  type ArchiveEntry,
  type ArchiveIndex,
  type DailySnapshot,
} from '../lib/reports';

type LoadState = 'loading' | 'ready' | 'empty' | 'not-found' | 'unavailable';

function snapshotDate(snapshot: DailySnapshot | null): string | null {
  const date = snapshot?.run?.generatedAt?.slice(0, 10);
  return date && isValidReportDate(date) ? date : null;
}

function formatUtc(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function reportValue(value?: string | number | null): string {
  return value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
}

const ReportsPage: React.FC = () => {
  const { date } = useParams<{ date?: string }>();
  const [reloadKey, setReloadKey] = useState(0);
  const [archive, setArchive] = useState<ArchiveIndex | null>(null);
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [reportEntry, setReportEntry] = useState<ArchiveEntry | null>(null);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setArchive(null);
    setSnapshot(null);
    setReportEntry(null);
    setReportDate(null);
    setMarkdown(null);

    (async () => {
      const [index, latestSnapshot] = await Promise.all([fetchArchiveIndex(), fetchDailySnapshot()]);
      if (cancelled) return;
      setArchive(index);
      setSnapshot(latestSnapshot);

      if (date && !isValidReportDate(date)) {
        setReportDate(date);
        setState('not-found');
        return;
      }

      const requestedDate = date
        ?? index?.entries[0]?.date
        ?? (index === null ? snapshotDate(latestSnapshot) : null);
      if (!requestedDate) {
        setState(index?.entries.length === 0 ? 'empty' : 'unavailable');
        return;
      }

      const entry = index?.entries.find((item) => item.date === requestedDate) ?? null;
      if (date && index && !entry) {
        setReportDate(requestedDate);
        setState('not-found');
        return;
      }

      const reportMarkdown = await fetchReportMarkdown(requestedDate);
      if (cancelled) return;
      setReportDate(requestedDate);
      setReportEntry(entry);
      if (!reportMarkdown) {
        setState('unavailable');
        return;
      }
      setMarkdown(reportMarkdown);
      setState('ready');
    })();

    return () => { cancelled = true; };
  }, [date, reloadKey]);

  const latestDate = archive?.entries[0]?.date ?? null;
  const matchingSnapshot = useMemo(() => {
    if (!snapshot || !reportDate || snapshotDate(snapshot) !== reportDate) return null;
    if (reportEntry?.runId && snapshot.run.id !== reportEntry.runId) return null;
    return snapshot;
  }, [snapshot, reportDate, reportEntry]);
  const reportRunId = reportEntry?.runId ?? matchingSnapshot?.run.id;
  const reportGeneratedAt = reportEntry?.generatedAt ?? matchingSnapshot?.run.generatedAt;
  const datasetVersion = reportEntry?.datasetVersion ?? matchingSnapshot?.run.sourceDatasetVersion ?? null;
  const modelVersion = reportEntry?.modelVersion ?? matchingSnapshot?.run.modelVersion ?? null;
  const snapshotIsDifferent = Boolean(snapshot && reportDate && !matchingSnapshot);

  const retry = () => setReloadKey((value) => value + 1);

  return (
    <main data-report-page="daily-report" className="mx-auto w-full max-w-7xl px-ap-lg py-6 sm:py-8">
      <Breadcrumbs customItems={[
        { label: 'Home', path: '/' },
        { label: 'Daily reports', path: '/reports' },
        ...(date ? [{ label: date, path: `/reports/${date}` }] : []),
      ]} />

      <header className="report-print-header mt-6 border-b border-ap-hairline pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="ap-display-md">
              {reportDate ? `Daily report: ${reportDate}` : 'Daily report'}
            </h1>
            <p className="mt-2 max-w-[72ch] text-ap-label-secondary">
              A dated summary of the published advisory snapshot, its coverage and its limitations.
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Link
              to="/reports/archive"
              className="inline-flex min-h-[44px] items-center rounded-md border border-ap-hairline px-4 py-2 font-medium text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
            >
              Browse archive
            </Link>
            {reportDate && latestDate && reportDate !== latestDate && (
              <Link
                to="/reports"
                className="inline-flex min-h-[44px] items-center rounded-md border border-ap-hairline px-4 py-2 font-medium text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
              >
                Latest report
              </Link>
            )}
            {state === 'ready' && (
              <Button intent="utility" onClick={() => window.print()} aria-label="Print this daily report">
                Print report
              </Button>
            )}
          </div>
        </div>

        <p className="mt-5 max-w-[76ch] text-ap-body-sm text-ap-label">
          <strong className="font-semibold">Official warnings:</strong> HazardNet is not an official warning service. Consult the Bangladesh Meteorological Department (BMD)
          and Flood Forecasting and Warning Centre (FFWC). For emergencies, call 999.
        </p>

        {state === 'ready' && (
          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-y border-ap-hairline py-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-ap-label-md text-ap-label-secondary">Generated at</dt>
              <dd className="mt-1 font-mono text-ap-body-sm tabular-nums text-ap-label">{formatUtc(reportGeneratedAt)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ap-label-md text-ap-label-secondary">Published run</dt>
              <dd className="mt-1 break-words font-mono text-ap-body-sm text-ap-label">{reportValue(reportRunId)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ap-label-md text-ap-label-secondary">Dataset version</dt>
              <dd className="mt-1 font-mono text-ap-body-sm tabular-nums text-ap-label">{reportValue(datasetVersion)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ap-label-md text-ap-label-secondary">Model version</dt>
              <dd className="mt-1 break-words font-mono text-ap-body-sm text-ap-label">{reportValue(modelVersion)}</dd>
            </div>
          </dl>
        )}
      </header>

      {!archive && state === 'ready' && (
        <p className="mt-5 max-w-[76ch] text-ap-body-sm text-ap-label-secondary" role="note">
          {date
            ? 'The archive index could not be loaded, so this dated report could not be verified against the published archive.'
            : 'The archive index could not be loaded. The latest report was selected from the available snapshot, so the archive listing may be incomplete.'}
        </p>
      )}
      {snapshotIsDifferent && state === 'ready' && (
        <p className="mt-5 max-w-[76ch] text-ap-body-sm text-ap-label-secondary" role="note">
          A newer snapshot is available ({reportValue(snapshot?.run.id)}, generated {formatUtc(snapshot?.run.generatedAt)}),
          but it does not match this archived report. Interactive analyses use only a matching run; the newer data are not substituted.
        </p>
      )}
      {!snapshot && state === 'ready' && (
        <p className="mt-5 max-w-[76ch] text-ap-body-sm text-ap-label-secondary" role="note">
          The report text is available, but its source snapshot could not be loaded. Published tables remain readable; interactive calculations are omitted.
        </p>
      )}

      <div className="report-layout mt-8 grid min-w-0 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <aside className="report-toc hidden min-w-0 lg:block" aria-label="Report navigation">
          {markdown && reportDate && (
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
              <ReportTableOfContents
                markdown={markdown}
                snapshot={snapshot}
                reportDate={reportDate}
                reportRunId={reportRunId}
              />
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {markdown && reportDate && (
            <div className="report-toc no-print mb-6 lg:hidden">
              <ReportTableOfContents
                markdown={markdown}
                snapshot={snapshot}
                reportDate={reportDate}
                reportRunId={reportRunId}
              />
            </div>
          )}

          {state === 'loading' && (
            <p className="py-8 text-center text-ap-label-md text-ap-label-secondary" role="status" aria-live="polite">
              Loading daily report and published data…
            </p>
          )}
          {state === 'empty' && (
            <section className="py-6" aria-labelledby="empty-report-heading">
              <h2 id="empty-report-heading" className="ap-tagline">No report published for any date yet</h2>
              <p className="mt-2 max-w-[72ch] text-ap-label-secondary">A report will appear after the next verified publication run.</p>
              <Button intent="secondary" className="mt-4" onClick={retry}>Try again</Button>
            </section>
          )}
          {state === 'not-found' && (
            <section className="py-6" aria-labelledby="missing-report-heading">
              <h2 id="missing-report-heading" className="ap-tagline">Report not found</h2>
              <p className="mt-2 max-w-[72ch] text-ap-label-secondary">
                No published report is indexed for {reportDate || date || 'that date'}. Choose a dated entry from the report archive.
              </p>
              <Link
                to="/reports/archive"
                className="mt-3 inline-flex min-h-[44px] items-center rounded-md border border-ap-hairline px-4 py-2 font-medium text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
              >
                Browse report archive
              </Link>
            </section>
          )}
          {state === 'unavailable' && (
            <section className="py-6" aria-labelledby="unavailable-report-heading">
              <h2 id="unavailable-report-heading" className="ap-tagline">No report published for this selection can be confirmed</h2>
              <p className="mt-2 max-w-[72ch] text-ap-label-secondary">
                The report index, report file or published snapshot is unavailable. Check your connection and try again; the page will not fill missing values with zeros.
              </p>
              <Button intent="secondary" className="mt-4" onClick={retry}>Try again</Button>
              <Link
                to="/reports/archive"
                className="ml-3 inline-flex min-h-[44px] items-center rounded-md px-3 py-2 font-medium text-ap-link underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary"
              >
                Open archive
              </Link>
            </section>
          )}
          {state === 'ready' && markdown && reportDate && (
            <ReportTemplate
              markdown={markdown}
              snapshot={snapshot}
              reportDate={reportDate}
              reportRunId={reportRunId}
            />
          )}
        </div>
      </div>
    </main>
  );
};

export { ReportsPage };
export default ReportsPage;
