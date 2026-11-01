/**
 * Farmer-first district outlook. No raw technical ledger, score or inferred second
 * hazard is rendered. The existing published two-horizon record remains a
 * separate, explicitly labelled view, not a privileged/private expert drawer.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { getDistrictById } from '../data/bangladeshDistricts';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { HazardGlyph } from '../components/apple/HazardGlyph';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import { useI18n } from '../hooks/useI18n';
import { hazardLabel } from '../hooks/useHazardLabel';
import {
  dhakaCalendarDate, loadDistrictDaily, type DailyAdvisory, type DistrictDailyResult, type DailyStatus,
} from '../lib/dailyAdvisories';

// The published-records view is a separate public chunk, never a privileged
// research ledger. Keeping it lazy preserves the low-bandwidth farmer entry.
const DistrictDetailPage = React.lazy(() => import('./DistrictDetailPage').then((module) => ({ default: module.DistrictDetailPage })));

const EMPTY: DistrictDailyResult = {
  status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null,
};

/** Labels come from a published enum, not the producer's free-text explanation. */
function DayOutlook({ row }: { row: DailyAdvisory }) {
  const { language, t, formatDate } = useI18n();
  return (
    <li className="border-t border-[var(--ap-separator-opaque)] py-5 first:border-t-0">
      <article aria-label={`${formatDate(row.targetDate)} · ${hazardLabel(row.hazard, language)}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="font-semibold tabular-nums text-[var(--ap-label)]">{formatDate(row.targetDate)}</p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[var(--ap-label)]">
              <HazardGlyph hazard={row.hazard} size={20} />
              {hazardLabel(row.hazard, language)}
            </h3>
          </div>
          <AlertLevelBadge level={row.tier} label={t(`alerts.tier.${row.tier}`)}
            srPrefix={t('daily.tier')} role="" size="lg" />
        </div>
        <p className="mt-3 font-semibold text-[var(--ap-label)]">{t('daily.actions')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--ap-label)]">
          {row.actionIds.map((id) => <li key={id}>{t(`daily.action.${id}`)}</li>)}
        </ul>
        <details className="group mt-4 text-sm text-[var(--ap-label-secondary)]">
          <summary className="ap-focusable flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[var(--ap-link)] underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            {t('daily.why')}
            <ChevronDown aria-hidden="true" size={16} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="max-w-prose space-y-2 pb-1">
            <p>{t(`daily.reason.${row.reasonCode}`)}</p>
            {row.peak === 'unique' && <p>{t('daily.peakUnique')}</p>}
            {row.peak === 'tied' && <p>{t('daily.peakTied')}</p>}
            {row.peak === 'unknown' && <p>{t('daily.peakUnknown')}</p>}
            {row.qualityNotes.map((note) => <p key={note}>{t(`daily.quality.${note}`)}</p>)}
            <p>{t('daily.uncertainty')}</p>
          </div>
        </details>
      </article>
    </li>
  );
}

const FarmerDistrictDailyPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const district = getDistrictById(id || 'kurigram');
  const { t, formatDate } = useI18n();
  const [outlook, setOutlook] = useState<DistrictDailyResult>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!district) return;
    const controller = new AbortController();
    setLoading(true);
    setOutlook(EMPTY);
    setExpanded(false);
    const checkedAt = new Date();
    setNow(checkedAt);
    loadDistrictDaily(district.name, { now: checkedAt, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setOutlook(result); })
      .catch(() => { if (!controller.signal.aborted) setOutlook(EMPTY); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [district?.name, revision]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  const today = dhakaCalendarDate(now);
  const rows = useMemo(() => outlook.advisories.filter((row) => row.targetDate >= today), [outlook.advisories, today]);
  const seventhDate = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const firstWeek = rows.filter((row) => row.targetDate <= seventhDate);
  const visible = expanded ? rows : firstWeek;
  const status: DailyStatus = outlook.status === 'fresh' && outlook.run && now.getTime() > Date.parse(outlook.run.expiresAt)
    ? 'stale' : outlook.status;
  const expiredOffline = status === 'offline' && outlook.run && now.getTime() > Date.parse(outlook.run.expiresAt);

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-7 px-4 pb-16 pt-4 text-[var(--ap-label)] sm:px-6">
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t('daily.return')}>
        <Link to="/live" className="ap-focusable inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[var(--ap-link)] underline underline-offset-4">
          <ArrowLeft aria-hidden="true" size={18} />{t('daily.return')}
        </Link>
        <LanguageToggle variant="switch" tone="daily" />
      </nav>

      <header className="space-y-4">
        <h1 className="text-3xl font-semibold leading-tight text-[var(--ap-label)] sm:text-4xl">
          <span lang="en">{district?.name || id || '—'}</span> {t('daily.title')}
        </h1>
        <p className="max-w-prose text-base text-[var(--ap-label-secondary)]">{t('daily.standfirst')}</p>
        <div className="max-w-prose space-y-2 border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] p-4 text-sm leading-relaxed text-[var(--ap-label)]" role="note">
          <p>{t('daily.researchNotice')}</p>
          <p>{t('daily.authority')}</p>
        </div>
      </header>

      {!district ? (
        <section aria-live="polite" className="space-y-4">
          <h2 className="text-xl font-semibold">{t('daily.unavailable')}</h2>
          <p>{t('daily.notFound')}</p>
        </section>
      ) : (
        <>
          <section aria-live="polite" aria-busy={loading} className="space-y-2">
            <h2 className="text-lg font-semibold text-[var(--ap-label)]">
              {loading ? t('daily.loading') : t(`daily.${status}`)}
            </h2>
            {!loading && status === 'stale' && <p className="max-w-prose text-[var(--ap-label)]">{t('daily.staleWarning')}</p>}
            {!loading && status === 'offline' && (
              <p className="max-w-prose text-[var(--ap-label)]">
                {t('daily.offlineWarning')} {expiredOffline ? t('daily.offlineExpired') : ''}
              </p>
            )}
            {!loading && status === 'unavailable' && (
              <div className="space-y-3">
                <p className="max-w-prose text-[var(--ap-label)]">{t('daily.unavailableWarning')}</p>
                <button type="button" onClick={() => setRevision((value) => value + 1)}
                  className="ap-focusable inline-flex min-h-[44px] items-center gap-2 rounded-control border border-[var(--ap-separator-opaque)] px-4 text-sm font-semibold text-[var(--ap-link)]">
                  <RefreshCw aria-hidden="true" size={16} /> {t('common.retry')}
                </button>
              </div>
            )}
            {!loading && rows[0]?.qualityNotes.map((note) => (
              <p key={note} className="max-w-prose text-sm text-[var(--ap-label)]">
                {t(`daily.quality.${note}`)}
              </p>
            ))}
            {!loading && outlook.run && (
              <div className="space-y-1 text-sm text-[var(--ap-label-secondary)]">
                <p>{t('daily.cutoff', { date: formatDate(outlook.run.dataCutoff, { withTime: true }) })}</p>
                <p>{t('daily.issued', { date: formatDate(outlook.run.generatedAt, { withTime: true }) })}</p>
                {status !== 'offline' && <p>{t(outlook.source === 'api' ? 'daily.api' : 'daily.snapshot')}</p>}
              </div>
            )}
          </section>

          {!loading && status !== 'unavailable' && (
            <section aria-labelledby="daily-days-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="daily-days-heading" className="text-2xl font-semibold text-[var(--ap-label)]">
                  {t(expanded ? 'daily.extendedDate' : 'daily.currentDate')}
                </h2>
                {rows.some((row) => row.targetDate > seventhDate) && (
                  <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
                    aria-controls="daily-outlook-days"
                    className="ap-focusable inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[var(--ap-link)] underline underline-offset-4">
                    {expanded ? t('daily.show7') : t('daily.show15')}
                    <ChevronRight aria-hidden="true" size={16} className={expanded ? 'rotate-90' : ''} />
                  </button>
                )}
              </div>
              <p className="max-w-prose text-sm text-[var(--ap-label-secondary)]">{t('daily.coverage')}</p>
              {visible.length === 0 ? (
                <p className="max-w-prose py-5 text-[var(--ap-label)]">{t(rows.length > 0 ? 'daily.emptyWeek' : 'daily.empty')}</p>
              ) : (
                <>
                  {visible[0].targetDate > today && <p>{t('daily.nextPublished', { date: formatDate(visible[0].targetDate) })}</p>}
                  <ol id="daily-outlook-days" className="max-w-3xl">
                    {visible.map((row) => <DayOutlook key={row.advisoryId} row={row} />)}
                  </ol>
                </>
              )}
            </section>
          )}
          <footer className="space-y-3 border-t border-[var(--ap-separator-opaque)] pt-6 text-sm">
            <Link className="ap-focusable inline-flex min-h-[44px] items-center text-[var(--ap-link)] underline underline-offset-4" to="/alerts">
              {t('daily.alertsLink')}
            </Link>
            <div>
              <Link to={`/forecast/district/${district.id}?view=published-records`}
                className="ap-focusable inline-flex min-h-[44px] items-center text-[var(--ap-link)] underline underline-offset-4">
                {t('daily.recordsLink')}
              </Link>
              <p className="max-w-prose text-[var(--ap-label-secondary)]">{t('daily.recordsNote')}</p>
            </div>
            <p>{t('daily.authority')}</p>
          </footer>
        </>
      )}
    </div>
  );
};

export const DistrictDailyPage: React.FC = () => {
  const [params] = useSearchParams();
  const { t } = useI18n();
  // This parameter selects an already-public legacy view; it grants no access.
  return params.get('view') === 'published-records'
    ? <React.Suspense fallback={<p role="status" className="p-4">{t('common.loading')}</p>}><DistrictDetailPage /></React.Suspense>
    : <FarmerDistrictDailyPage />;
};

export default DistrictDailyPage;
