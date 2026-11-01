/**
 * A small, public-only bridge from the older forecast/alert surfaces to the
 * district day-by-day outlook. Never merge daily rows into map severity,
 * two-horizon records or issued alerts: each has a different release contract.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDistrictById } from '../data/bangladeshDistricts';
import { useI18n } from '../hooks/useI18n';
import { loadDistrictDaily, type DistrictDailyResult } from '../lib/dailyAdvisories';

const UNAVAILABLE: DistrictDailyResult = {
  status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null,
};

export function DailyOutlookEntry({ districtId }: { districtId?: string | null }) {
  const district = districtId ? getDistrictById(districtId) : null;
  const districtName = district?.name;
  const { t, formatDate } = useI18n();
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
      <p className="mt-2 text-[var(--ap-label-secondary)]">{t('daily.researchShort')}</p>
      <p className="mt-1 text-[var(--ap-label-secondary)]">{t('daily.nav.separate')}</p>
      <Link to={district ? `/forecast/district/${district.id}` : '/districts'}
        className="ap-focusable mt-2 inline-flex min-h-[44px] items-center text-[var(--ap-link)] underline underline-offset-4">
        {t('daily.nav.open')}{district ? `: ${district.name}` : ''}
      </Link>
    </section>
  );
}
