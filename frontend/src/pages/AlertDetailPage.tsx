/**
 * `/alerts/:id` — one alert, in full (Phase 5).
 *
 * The evidence card is the printable artefact PRODUCT_SPEC §1.3 implies: a district
 * officer, a journalist or a union parishad secretary can open the URL, read the whole
 * trail, and export it as a PDF that still carries the §1.7 disclaimer.
 *
 * Two behaviours worth noting:
 *  - the page loads the *same* payload the list does (`loadAlerts`), then finds the
 *    alert by id. That costs a list fetch, but it keeps one contract, one fallback path
 *    and one freshness rule rather than an endpoint used only here;
 *  - if the id is not in the payload — superseded by a newer run, or dropped because it
 *    was not PUBLISHED — the page says exactly that instead of rendering a blank card.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MaterialIcon from '../components/MaterialIcon';
import { AlertCard } from '../components/alerts/AlertCard';
import { DataSourceBanner } from '../components/alerts/DataSourceBanner';
import { Disclaimer } from '../components/alerts/Disclaimer';
import { EvidenceCard, EvidenceCardExportButton } from '../components/alerts/EvidenceCard';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { useBandwidthMode } from '../hooks/useBandwidthMode';
import { useI18n } from '../hooks/useI18n';
import { usePageSeo } from '../hooks/usePageSeo';
import {
  type AlertRecord, type AlertsResult, freshnessOf, loadAlerts,
} from '../lib/alerts';

export const AlertDetailPage: React.FC = () => {
  usePageSeo('/alerts');
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { lowBandwidth } = useBandwidthMode();

  const [result, setResult] = useState<AlertsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const next = await loadAlerts({
          offlineFirst: typeof navigator !== 'undefined' && navigator.onLine === false,
        });
        if (!cancelled) setResult(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const alert: AlertRecord | null = useMemo(() => {
    if (!result || !id) return null;
    const wanted = decodeURIComponent(id);
    return result.alerts.find((entry) => entry.id === wanted) || null;
  }, [result, id]);

  const freshness = result ? freshnessOf(result) : { age_hours: null, within_slo: null };

  if (loading && !result) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-10 text-sm text-slate-600" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-10">
        <h1 className="text-xl font-black text-slate-900">{t('alerts.detail.title')}</h1>
        <p className="mt-2 text-sm text-slate-700">{t('alerts.detail.notFound')}</p>
        <p className="mt-1 font-mono text-[11px] text-slate-500">{id}</p>
        <Link
          to="/alerts"
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
        >
          <MaterialIcon name="arrow_back" className="text-base" aria-hidden="true" />
          {t('alerts.page.listTitle')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-16 pt-6">
      <nav aria-label={t('alerts.detail.title')} className="no-print mb-3 flex items-center justify-between gap-2">
        <Link
          to="/alerts"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-amber-800"
        >
          <MaterialIcon name="arrow_back" className="text-base" aria-hidden="true" />
          {t('alerts.page.listTitle')}
        </Link>
        <LanguageToggle variant="switch" />
      </nav>

      <div className="no-print mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 sm:text-2xl">{t('alerts.detail.title')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <AlertLevelBadge
              level={alert.level}
              label={t(`alerts.level.${alert.level}`)}
              description={t(`alerts.level.${alert.level}.desc`)}
              size="sm"
              srPrefix={t('alerts.levelLabel')}
            />
            <span className="font-mono">{alert.id}</span>
          </p>
        </div>
        <EvidenceCardExportButton alert={alert} />
      </div>

      <DataSourceBanner
        className="mb-3 no-print"
        source={result?.source || 'none'}
        generatedAt={result?.generated_at || null}
        ageHours={freshness.age_hours}
        withinSlo={freshness.within_slo}
        offline={typeof navigator !== 'undefined' && navigator.onLine === false}
      />

      <EvidenceCard alert={alert} disclaimer={alert.disclaimer} />

      <section className="mt-4 no-print" aria-labelledby="alert-summary-heading">
        <h2 id="alert-summary-heading" className="mb-2 text-sm font-bold text-slate-900">
          {t('alerts.page.listTitle')}
        </h2>
        <AlertCard alert={alert} variant="compact" />
      </section>

      {alert.reasons && alert.reasons.length > 0 && (
        <section className="mt-4" aria-labelledby="alert-reasons-heading">
          <h2 id="alert-reasons-heading" className="text-sm font-bold text-slate-900">
            {t('alerts.detail.audit')}
          </h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {alert.reasons.map((reason, index) => (
              <li
                key={`${reason.rule || 'reason'}-${index}`}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <span className="font-mono font-semibold text-slate-900">{reason.rule || 'rule'}</span>
                {reason.track && (
                  <span className="ml-2 rounded border border-slate-300 px-1 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    {reason.track}
                  </span>
                )}
                {reason.detail && <p className="mt-0.5 text-[11px] text-slate-600">{reason.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Disclaimer className="mt-4 no-print" variant="banner" text={alert.disclaimer} />

      {lowBandwidth && (
        <p className="mt-3 text-[11px] text-slate-500">{t('bandwidth.on')}</p>
      )}
    </div>
  );
};

export default AlertDetailPage;
