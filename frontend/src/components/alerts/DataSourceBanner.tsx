/**
 * "Where did this come from, and how old is it?" (Phase 5).
 *
 * A hazard dashboard that renders a cached snapshot identically to a live forecast is
 * lying by omission, and PRODUCT_SPEC §1.3 requires a freshness statement on every
 * alert surface. This banner states three things plainly:
 *
 *   1. the source — live API or the snapshot committed with the deployment;
 *   2. when the data was generated, and how old that is against the 48 h freshness SLO;
 *   3. whether the user is offline, in which case the numbers are whatever the device
 *      downloaded last, not necessarily today's.
 *
 * The staleness rule is deliberately blunt: past the SLO the banner turns amber and
 * says so, because a 72-hour-old "live" forecast is the failure mode this phase exists
 * to prevent (PRODUCT_SPEC §5.1).
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import type { AlertsSource } from '../../lib/alerts';
import { useI18n } from '../../hooks/useI18n';

export interface DataSourceBannerProps {
  source: AlertsSource;
  generatedAt?: string | null;
  ageHours?: number | null;
  withinSlo?: boolean | null;
  offline?: boolean;
  /** True when the snapshot's own lineage block reports partial provenance. */
  lineagePartial?: boolean;
  className?: string;
}

export const DataSourceBanner: React.FC<DataSourceBannerProps> = ({
  source,
  generatedAt,
  ageHours,
  withinSlo,
  offline = false,
  lineagePartial = false,
  className = '',
}) => {
  const { t, formatDate, formatNumber } = useI18n();

  const sourceLabel = source === 'api' ? t('source.live')
    : source === 'cache' ? t('source.cache')
      : source === 'snapshot' ? t('source.snapshot')
        : t('source.none');

  const stale = withinSlo === false || source === 'cache';
  const tone = source === 'none' || stale
    ? 'border-carbon-20 border-l-[2px] border-l-[#ea6f24] bg-white text-carbon-90'
    : 'border-carbon-20 bg-white text-carbon-70';

  const ageText = typeof ageHours === 'number' && Number.isFinite(ageHours)
    ? t('source.staleNote', { hours: formatNumber(Math.round(ageHours), { maximumFractionDigits: 0 }) })
    : null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border p-4 text-base font-medium ${tone} ${className}`}
      role="status"
      data-testid="data-source-banner"
      data-source={source}
    >
      <span className="inline-flex items-center gap-1.5">
        <MaterialIcon
          name={source === 'api' ? 'cloud_sync' : source === 'cache' ? 'cloud_download' : source === 'snapshot' ? 'save' : 'error_outline'}
          className="text-sm"
          aria-hidden="true"
        />
        <span className="font-bold uppercase tracking-wide">{sourceLabel}</span>
      </span>

      {generatedAt && (
        <span>
          {t('common.updated')}: {formatDate(generatedAt, { withTime: true })}
        </span>
      )}

      {ageText && <span className={stale ? 'font-bold' : ''}>{ageText}</span>}

      {offline && <span className="font-bold">{t('source.offlineNote')}</span>}

      {source === 'snapshot' && !offline && generatedAt && (
        <span className="text-carbon-60">{t('source.snapshotNote', { when: formatDate(generatedAt) })}</span>
      )}

      {source === 'cache' && generatedAt && (
        <span className="text-carbon-60">{t('source.cacheNote', { when: formatDate(generatedAt) })}</span>
      )}

      {lineagePartial && (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-900">
          <MaterialIcon name="warning" className="text-sm" aria-hidden="true" />
          {t('coverage.lineagePartial')}
        </span>
      )}
    </div>
  );
};

export default DataSourceBanner;
