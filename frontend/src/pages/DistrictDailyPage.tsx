/**
 * District day-by-day outlook backed by the 960-row Kaggle daily dataset.
 * Renders all 5 tiers (NORMAL, WATCH, WARNING, SEVERE, EXTREME), severityScore,
 * weather values, and full forecast metrics alongside clear research /
 * non-official-warning disclaimers pointing to BMD, FFWC, DDM, and 999.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { ALL_64_DISTRICTS, getDistrictById } from '../data/bangladeshDistricts';
import { AlertLevelBadge, ADVISORY_TIER_COLOURS } from '../components/alerts/AlertLevelBadge';
import { HazardGlyph } from '../components/apple/HazardGlyph';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import { Continuous15DayTrajectory } from '../components/district/Continuous15DayTrajectory';
import { useI18n } from '../hooks/useI18n';
import { hazardLabel } from '../hooks/useHazardLabel';
import {
  dhakaCalendarDate,
  loadDistrictDaily,
  severityIndexOf,
  summarizeContinuous15Days,
  type DailyAdvisory,
  type DistrictDailyResult,
  type DailyStatus,
} from '../lib/dailyAdvisories';

// The published-records view is a separate public chunk, never a privileged
// research ledger. Keeping it lazy preserves the low-bandwidth farmer entry.
const DistrictDetailPage = React.lazy(() => import('./DistrictDetailPage').then((module) => ({ default: module.DistrictDetailPage })));

const EMPTY: DistrictDailyResult = {
  status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null,
};

function DayOutlook({ row, isPeakDay }: { row: DailyAdvisory; isPeakDay: boolean }) {
  const { language, t, formatDate, formatNumber } = useI18n();
  const w = row.weather || {};
  const m = row.metrics;

  const fmt1 = (val: number) => formatNumber(val, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const fmt2 = (val: number) => formatNumber(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sevIndex = severityIndexOf(row.severityScore);
  const tierColour = ADVISORY_TIER_COLOURS[row.tier] ?? ADVISORY_TIER_COLOURS.NORMAL;

  const weatherItems: { label: string; value: string }[] = [];
  if (w.precipitationMm !== undefined) {
    weatherItems.push({ label: t('daily.weather.precip'), value: `${fmt1(w.precipitationMm)}\u00A0mm` });
  }
  if (w.temperatureMinC !== undefined && w.temperatureMaxC !== undefined) {
    weatherItems.push({
      label: t('daily.weather.tempRange'),
      value: `${fmt1(w.temperatureMinC)}\u00A0°C to ${fmt1(w.temperatureMaxC)}\u00A0°C`,
    });
  } else if (w.temperatureMaxC !== undefined) {
    weatherItems.push({ label: t('daily.weather.tempMax'), value: `${fmt1(w.temperatureMaxC)}\u00A0°C` });
  }
  if (w.temperatureMeanC !== undefined) {
    weatherItems.push({ label: t('daily.weather.tempMean'), value: `${fmt1(w.temperatureMeanC)}\u00A0°C` });
  }
  if (w.windKmh !== undefined) {
    weatherItems.push({ label: t('daily.weather.wind'), value: `${fmt1(w.windKmh)}\u00A0km/h` });
  }
  if (w.humidityPct !== undefined) {
    weatherItems.push({ label: t('daily.weather.humidity'), value: `${formatNumber(Math.round(w.humidityPct))}\u00A0%` });
  }
  if (w.dewpointC !== undefined) {
    weatherItems.push({ label: t('daily.weather.dewpoint'), value: `${fmt1(w.dewpointC)}\u00A0°C` });
  }
  if (w.solarRadiationMjM2 !== undefined) {
    weatherItems.push({ label: t('daily.weather.solar'), value: `${fmt1(w.solarRadiationMjM2)}\u00A0MJ/m²` });
  }
  if (w.evapotranspirationMm !== undefined) {
    weatherItems.push({ label: t('daily.weather.et0'), value: `${fmt1(w.evapotranspirationMm)}\u00A0mm` });
  }

  const metricItems: { label: string; value: string }[] = [];
  if (m) {
    if (m.confidence !== undefined) {
      metricItems.push({ label: t('daily.metric.confidence'), value: `${formatNumber(Math.round(m.confidence * 100))}%` });
    }
    if (m.confidenceRaw !== undefined) {
      metricItems.push({ label: t('daily.metric.confidenceRaw'), value: `${formatNumber(Math.round(m.confidenceRaw * 100))}%` });
    }
    if (m.finalSeverity !== undefined) {
      metricItems.push({ label: t('daily.metric.finalSeverity'), value: `${formatNumber(Math.round(m.finalSeverity * 100))}% (${fmt2(m.finalSeverity)})` });
    }
    if (m.modelSeverity !== undefined) {
      metricItems.push({ label: t('daily.metric.modelSeverity'), value: `${formatNumber(Math.round(m.modelSeverity * 100))}% (${fmt2(m.modelSeverity)})` });
    }
    if (m.physicsSeverity !== undefined) {
      metricItems.push({ label: t('daily.metric.physicsSeverity'), value: `${formatNumber(Math.round(m.physicsSeverity * 100))}% (${fmt2(m.physicsSeverity)})` });
    }
    if (m.trackDivergence !== undefined) {
      metricItems.push({ label: t('daily.metric.trackDivergence'), value: fmt2(m.trackDivergence) });
    }
    if (m.probTop1 !== undefined) {
      const shares = [m.probTop1, m.probTop2, m.probTop3]
        .filter((v): v is number => v !== undefined)
        .map((v) => `${formatNumber(Math.round(v * 100))}%`)
        .join(' / ');
      metricItems.push({ label: t('daily.metric.topClassShare'), value: shares });
    }
    if (m.top2Hazard || m.top3Hazard) {
      const runners = [m.top2Hazard, m.top3Hazard]
        .filter((h): h is NonNullable<typeof h> => Boolean(h))
        .map((h) => hazardLabel(h, language))
        .join(', ');
      if (runners) {
        metricItems.push({ label: t('daily.metric.secondaryHazards'), value: runners });
      }
    }
    if (m.physicsOverride) {
      metricItems.push({ label: t('daily.metric.physicsOverride'), value: 'Yes' });
    }
  }

  return (
    <li
      id={`day-${row.targetDate}`}
      data-peak={isPeakDay ? 'true' : undefined}
      className={
        isPeakDay
          ? 'my-2 rounded-xl border-2 bg-[var(--ap-bg-grouped)] px-4 py-5 sm:px-5 shadow-2xs'
          : 'border-t border-[var(--ap-separator-opaque)] py-5 first:border-t-0 [[data-peak=true]+&]:border-t-0'
      }
      style={isPeakDay ? { borderColor: tierColour } : undefined}
    >
      <article aria-label={`${formatDate(row.targetDate)}, ${hazardLabel(row.hazard, language)}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-xs font-semibold tabular-nums text-[var(--ap-label-secondary)]">
                {t('daily.dayOf15', { day: formatNumber(row.forecastDay) })}
              </span>
              <p className="font-semibold tabular-nums text-[var(--ap-label)]">
                <time dateTime={row.targetDate}>{formatDate(row.targetDate)}</time>
              </p>
              {isPeakDay && (
                <span className="rounded border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] px-2 py-0.5 text-xs font-bold text-[var(--ap-label)]">
                  {t('daily.peakBannerSingle')}
                </span>
              )}
              {row.peak === 'unique' && (
                <span className="text-xs font-medium text-[var(--ap-label-secondary)]">
                  {t('daily.peakUnique')}
                </span>
              )}
              {isPeakDay && row.peak === 'tied' && (
                <span className="text-xs font-medium text-[var(--ap-label-secondary)]">
                  {t('daily.peakTied')}
                </span>
              )}
            </div>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[var(--ap-label)]">
              <HazardGlyph hazard={row.hazard} size={20} />
              {hazardLabel(row.hazard, language)}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1.5 min-w-[160px]">
            <AlertLevelBadge level={row.tier} label={t(`alerts.tier.${row.tier}`)}
              srPrefix={t('daily.tier')} role="" size="lg" />
            <span className="text-xs font-semibold tabular-nums text-[var(--ap-label)]">
              {t('daily.severityIndex')}: {formatNumber(sevIndex)}/100 ({fmt2(row.severityScore)})
            </span>
            <span className="text-xs tabular-nums text-[var(--ap-label-secondary)]">
              {t('daily.severityScore')}: {formatNumber(sevIndex)}% ({fmt2(row.severityScore)})
            </span>
            <div
              aria-hidden="true"
              className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--ap-separator-opaque)]"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(4, sevIndex)}%`, backgroundColor: tierColour }}
              />
            </div>
          </div>
        </div>

        {row.requiresReview && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-950">
            {t('daily.reviewNotice')}
          </p>
        )}

        {weatherItems.length > 0 && (
          <dl
            aria-label={t('daily.weatherTitle')}
            className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[var(--ap-separator-opaque)] pt-3 text-xs sm:grid-cols-4"
          >
            {weatherItems.map((item) => (
              <div key={item.label}>
                <dt className="text-[var(--ap-label-secondary)]">{item.label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-[var(--ap-label)]">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-3.5 font-semibold text-[var(--ap-label)]">{t('daily.actions')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--ap-label)]">
          {row.actionIds.map((id) => <li key={id}>{t(`daily.action.${id}`)}</li>)}
        </ul>

        <details className="group mt-3 text-sm text-[var(--ap-label-secondary)]">
          <summary className="ap-focusable flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[var(--ap-link)] underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            {t('daily.why')}
            <ChevronDown aria-hidden="true" size={16} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="max-w-prose space-y-3 border-t border-[var(--ap-separator-opaque)] pt-3 pb-1">
            {metricItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--ap-label)]">
                  {t('daily.metricsTitle')}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
                  {metricItems.map((item) => (
                    <div key={item.label}>
                      <dt className="text-[var(--ap-label-secondary)]">{item.label}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[var(--ap-label)]">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <p>{t(`daily.reason.${row.reasonCode}`)}</p>
            {row.peak === 'unknown' && <p>{t('daily.peakUnknown')}</p>}
            {row.qualityNotes.map((note) => <p key={note}>{t(`daily.quality.${note}`)}</p>)}
            {!m && <p>{t('daily.uncertainty')}</p>}
          </div>
        </details>
      </article>
    </li>
  );
}

const FarmerDistrictDailyPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const district = getDistrictById(id || 'kurigram');
  const { t, formatDate } = useI18n();
  const [outlook, setOutlook] = useState<DistrictDailyResult>(EMPTY);
  const [loading, setLoading] = useState(true);
  // Default to showing all 15 continuous days; `?days=7` optionally narrows to the first 7 days.
  const expanded = searchParams.get('days') !== '7';
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => new Date());

  const toggleExpanded = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get('days') === '7') next.delete('days');
      else next.set('days', '7');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (!district) return;
    const controller = new AbortController();
    setLoading(true);
    setOutlook(EMPTY);
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
  const status: DailyStatus = outlook.status === 'fresh' && outlook.run && now.getTime() > Date.parse(outlook.run.expiresAt)
    ? 'stale' : outlook.status;
  const rows = useMemo(
    () => (status === 'fresh' && outlook.advisories.length === 15
      ? outlook.advisories.slice().sort((a, b) => a.forecastDay - b.forecastDay)
      : outlook.advisories.filter((row) => row.targetDate >= today)),
    [outlook.advisories, status, today],
  );
  const summary15 = useMemo(() => summarizeContinuous15Days(rows), [rows]);
  const anchorStart = rows[0]?.targetDate ?? today;
  const seventhDate = new Date(Date.parse(`${anchorStart}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const firstWeek = rows.filter((row) => row.targetDate <= seventhDate);
  const visible = expanded ? rows : firstWeek;
  const expiredOffline = status === 'offline' && outlook.run && now.getTime() > Date.parse(outlook.run.expiresAt);

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-7 px-4 pb-16 pt-4 text-[var(--ap-label)] sm:px-6">
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t('daily.return')}>
        <Link to="/live" className="ap-focusable inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[var(--ap-link)] underline underline-offset-4">
          <ArrowLeft aria-hidden="true" size={18} />{t('daily.return')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {district && (
            <label htmlFor="daily-district-select" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ap-label-secondary)]">
              <span>{t('daily.switchDistrict')}</span>
              <select
                id="daily-district-select"
                value={district.id}
                onChange={(e) => {
                  const qs = searchParams.toString();
                  navigate(`/forecast/district/${e.target.value}${qs ? `?${qs}` : ''}`);
                }}
                className="ap-focusable min-h-[44px] rounded-lg border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] px-3 py-1.5 text-sm font-semibold text-[var(--ap-label)]"
              >
                {ALL_64_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.division})
                  </option>
                ))}
              </select>
            </label>
          )}
          <LanguageToggle variant="switch" tone="daily" />
        </div>
      </nav>

      <header className="space-y-4">
        <h1 className="text-3xl font-semibold leading-tight text-[var(--ap-label)] sm:text-4xl">
          <span lang="en">{district?.name || id || '-'}</span> {t('daily.title')}
        </h1>
        <p className="max-w-prose text-base text-[var(--ap-label-secondary)]">{t('daily.standfirst')}</p>
        <div className="max-w-prose space-y-2 rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] p-4 text-sm leading-relaxed text-[var(--ap-label)]" role="note">
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
            <section aria-labelledby="daily-days-heading" className="space-y-5">
              {rows.length > 0 && (
                <Continuous15DayTrajectory advisories={rows} interactiveAnchors />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="daily-days-heading" className="text-2xl font-semibold text-[var(--ap-label)]">
                  {t(expanded ? 'daily.extendedDate' : 'daily.currentDate')}
                </h2>
                {rows.some((row) => row.targetDate > seventhDate) && (
                  <button type="button" onClick={toggleExpanded} aria-expanded={expanded}
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
                    {visible.map((row) => (
                      <DayOutlook
                        key={row.advisoryId}
                        row={row}
                        isPeakDay={summary15.peakDateSet.has(row.targetDate)}
                      />
                    ))}
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
