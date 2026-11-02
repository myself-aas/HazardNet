/**
 * Bridge card linking `/live`, `/advisories`, and `/districts/:id` to the 15-day
 * day-by-day Kaggle district outlook, summarizing peak tier, severityScore, and weather
 * when available while keeping research / non-official-warning disclaimers explicit.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDistrictById } from '../data/bangladeshDistricts';
import { AlertLevelBadge } from './alerts/AlertLevelBadge';
import { useI18n } from '../hooks/useI18n';
import { hazardLabel } from '../hooks/useHazardLabel';
import { loadDistrictDaily, type DistrictDailyResult } from '../lib/dailyAdvisories';

const UNAVAILABLE: DistrictDailyResult = {
  status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null,
};

export function DailyOutlookEntry({ districtId }: { districtId?: string | null }) {
  const district = districtId ? getDistrictById(districtId) : null;
  const districtName = district?.name;
  const { language, t, formatDate, formatNumber } = useI18n();
  const [result, setResult] = useState<DistrictDailyResult>(UNAVAILABLE);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!districtName) {
      setResult(UNAVAILABLE);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setResult(UNAVAILABLE);
    setLoading(true);
    loadDistrictDaily(districtName, { now: new Date(), signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setResult(next); })
      .catch(() => { if (!controller.signal.aborted) setResult(UNAVAILABLE); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [districtName]);

  const peakRow = useMemo(() => {
    const valid = result.advisories.filter(
      (row) => row && typeof row.hazard === 'string' && typeof row.tier === 'string' && typeof row.targetDate === 'string',
    );
    if (!valid.length) return null;
    return valid.reduce(
      (best, row) => ((row.severityScore ?? 0) > (best.severityScore ?? 0) ? row : best),
      valid[0],
    );
  }, [result.advisories]);

  let state: string;
  if (!district) state = t('daily.nav.choose');
  else if (loading) state = t('daily.loading');
  else if (result.status === 'fresh') {
    state = result.advisories.length && result.run
      ? `${t('daily.fresh')}. ${t('daily.cutoff', { date: formatDate(result.run.dataCutoff, { withTime: true }) })}`
      : t('daily.emptyWeek');
  } else if (result.status === 'stale') state = t('daily.staleWarning');
  else if (result.status === 'offline') state = t('daily.offlineWarning');
  else state = t('daily.unavailableWarning');

  return (
    <section className="screen-only border-t border-[var(--ap-separator-opaque)] py-4 text-sm text-[var(--ap-label)]"
      aria-label={t('daily.nav.open')}>
      <p aria-live={district ? 'polite' : 'off'}>{state}</p>
      {peakRow && (
        <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs">
          <AlertLevelBadge level={peakRow.tier} label={t(`alerts.tier.${peakRow.tier}`)} size="sm" />
          <span className="font-semibold text-[var(--ap-label)]">
            {hazardLabel(peakRow.hazard, language)} ({formatDate(peakRow.targetDate)})
          </span>
          {typeof peakRow.severityScore === 'number' && Number.isFinite(peakRow.severityScore) && (
            <span className="tabular-nums text-[var(--ap-label-secondary)]">
              {t('daily.severityScore')}: {formatNumber(Math.round(peakRow.severityScore * 100))}% ({formatNumber(peakRow.severityScore, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
          )}
          {peakRow.weather?.precipitationMm !== undefined && (
            <span className="tabular-nums text-[var(--ap-label-secondary)]">
              {t('daily.weather.precip')}: {formatNumber(peakRow.weather.precipitationMm, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}{'\u00A0'}mm
            </span>
          )}
        </div>
      )}
      <p className="mt-2 text-[var(--ap-label-secondary)]">{t('daily.researchShort')}</p>
      <p className="mt-1 text-[var(--ap-label-secondary)]">{t('daily.nav.separate')}</p>
      <Link to={district ? `/forecast/district/${district.id}` : '/districts'}
        className="ap-focusable mt-2 inline-flex min-h-[44px] items-center text-[var(--ap-link)] underline underline-offset-4">
        {t('daily.nav.open')}{district ? `: ${district.name}` : ''}
      </Link>
    </section>
  );
}
