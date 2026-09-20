/**
 * The published alert for one district, as a strip on the district page (Phase 5).
 *
 * The district page is where a user lands from search or from the map, and it already
 * shows a district's forecast. What it could not say until now is whether an *alert*
 * exists for it — the difference between "the model scores this 0.81" and "the
 * pipeline published a watch for this district, on this date, from this model
 * version".
 *
 * When there is no published alert the strip says exactly that, and links to the full
 * list: silence on a hazard page is easily read as "nothing to worry about", so the
 * copy distinguishes "no alert published" from "no data". It also labels the
 * baseline-only case, which is the honest reading when the run has no row for this
 * district at all.
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import MaterialIcon from '../MaterialIcon';
import { AlertLevelBadge } from './AlertLevelBadge';
import { alertsForDistrict } from '../../lib/alerts';
import { useAlertsData } from '../../hooks/useAlertsData';
import { useI18n } from '../../hooks/useI18n';
import { useHazardLabel } from '../../hooks/useHazardLabel';

export interface DistrictAlertStripProps {
  /** District name, id or slug — matched the same way the alert list matches. */
  district: string | null | undefined;
  /** True when this district has no row in the current forecast run. */
  baselineOnly?: boolean;
  className?: string;
}

export const DistrictAlertStrip: React.FC<DistrictAlertStripProps> = ({
  district,
  baselineOnly = false,
  className = '',
}) => {
  const { t, formatNumber, formatDate } = useI18n();
  const hazardLabel = useHazardLabel();
  const { alerts, source, loading } = useAlertsData();

  const alert = useMemo(() => alertsForDistrict(alerts, district), [alerts, district]);

  if (loading && alerts.length === 0) {
    return (
      <div className={`border border-carbon-20 bg-white p-4 text-sm text-carbon-60 ${className}`} role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (!alert) {
    return (
      <div className={`border border-carbon-20 bg-white p-4 ${className}`}>
        <h2 className="text-base font-bold text-carbon-90">
          {t('district.alerts', { district: district || '—' })}
        </h2>
        <p className="mt-1 text-base leading-[1.62] text-carbon-70">
          {t('district.noAlert')}
          {source === 'none' ? ` ${t('alerts.empty.unavailable')}` : ''}
        </p>
        {baselineOnly && <p className="mt-1 text-xs text-carbon-70">{t('district.baselineOnly')}</p>}
        <Link
          to="/alerts"
          className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-nasa-blue-shade underline decoration-dotted underline-offset-4"
        >
          <MaterialIcon name="notifications_active" className="text-sm" aria-hidden="true" />
          {t('alerts.page.listTitle')}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`border border-carbon-20 border-l-[2px] border-l-[#ea6f24] bg-white p-4 ${className}`}
      data-alert-id={alert.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-carbon-90">
          {t('district.alerts', { district: alert.district_name || district || '—' })}
        </h2>
        <AlertLevelBadge
          level={alert.level}
          label={t(`alerts.level.${alert.level}`)}
          description={t(`alerts.level.${alert.level}.desc`)}
          size="sm"
          srPrefix={t('alerts.levelLabel')}
        />
      </div>
      <p className="mt-1.5 text-sm text-carbon-80">
        {hazardLabel(alert.hazard_type)} · {alert.horizon?.replace('_', ' ') || '—'} ·{' '}
        {t('common.targetDate')} {formatDate(alert.target_date)}
        {typeof alert.severity_score === 'number' && (
          <> · {t('alerts.evidence.modelSeverity')} {formatNumber(alert.severity_score)}</>
        )}
      </p>
      <Link
        to={`/alerts/${encodeURIComponent(alert.id)}`}
        className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-nasa-blue-shade underline decoration-dotted underline-offset-4"
      >
        <MaterialIcon name="description" className="text-sm" aria-hidden="true" />
        {t('alerts.card.evidenceCard')}
      </Link>
    </div>
  );
};

export default DistrictAlertStrip;
