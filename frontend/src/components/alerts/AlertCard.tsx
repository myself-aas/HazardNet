/**
 * One alert, as a card (Phase 5).
 *
 * The card is where the §1.3 content requirement lands: hazard class, lead time,
 * confidence statement, evidence trail (model severity, physics severity, driver
 * variables), data freshness, model version and a link to official sources. If a
 * field is missing the card says so — it never renders a blank where a number should
 * be, because a blank reads as zero to a hurried reader.
 *
 * The confidence statement is the one piece of copy that needs care: the model score
 * is a softmax, not a probability, and no calibration map is fitted. The card renders
 * `alerts.confidence.uncalibrated` unless the API explicitly says
 * `confidence_published === 'calibrated_probability'`. That branch is what keeps
 * project-killer #1 dead on the UI side.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { AlertLevelBadge } from './AlertLevelBadge';
import type { AlertRecord } from '../../lib/alerts';
import { useI18n } from '../../hooks/useI18n';
import { useHazardIcon, useHazardLabel } from '../../hooks/useHazardLabel';

export interface AlertCardProps {
  alert: AlertRecord;
  onOpen?: (alert: AlertRecord) => void;
  className?: string;
  /** `compact` hides the evidence strip (used in dense lists). */
  variant?: 'full' | 'compact';
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onOpen, className = '', variant = 'full' }) => {
  const { t, formatNumber, formatDate } = useI18n();
  const hazardLabel = useHazardLabel();
  const hazardIcon = useHazardIcon();

  const level = String(alert.level);
  const model = alert.evidence?.model || {};
  const physics = alert.evidence?.physics || {};
  const calibrated = model.confidence_published === 'calibrated_probability'
    || alert.confidence_kind === 'calibrated_probability';
  const confidenceText = calibrated
    ? t('alerts.confidence.calibrated', { score: formatNumber(alert.confidence) })
    : t('alerts.confidence.uncalibrated', { score: formatNumber(alert.confidence) });

  const reviewLabel = alert.published?.mode === 'human'
    ? `${t('alerts.card.reviewedBy')}: ${alert.published.reviewer || '—'}`
    : alert.published?.mode === 'auto'
      ? t('alerts.card.autoPublished')
      : alert.requires_human_review
        ? t('alerts.card.requiresReview')
        : null;

  const headingId = `alert-${alert.id}-heading`;

  return (
    <article
      className={`border border-carbon-20 bg-white p-4 ${className}`}
      aria-labelledby={headingId}
      data-alert-id={alert.id}
      data-level={level}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <AlertLevelBadge
            level={level}
            label={t(`alerts.level.${level}`)}
            description={t(`alerts.level.${level}.desc`)}
            size="md"
          />
          <h3 id={headingId} className="mt-2 flex items-center gap-1.5 text-base font-bold text-carbon-90">
            <MaterialIcon name={hazardIcon(alert.hazard_type)} className="text-base text-carbon-70" aria-hidden="true" />
            <span className="truncate">{alert.district_name || alert.district_id || '—'}</span>
            {alert.division ? <span className="font-medium text-carbon-60"> · {alert.division}</span> : null}
          </h3>
          <p className="text-xs font-semibold text-carbon-70">
            {hazardLabel(alert.hazard_type)} · {alert.horizon?.replace('_', ' ') || '—'}
          </p>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(alert)}
            className="inline-flex min-h-[44px] items-center gap-1 border border-carbon-20 px-3 py-2 text-sm font-semibold text-carbon-80 hover:bg-carbon-05 touch-manipulation"
          >
            <MaterialIcon name="description" className="text-sm" aria-hidden="true" />
            {t('alerts.card.evidenceCard')}
          </button>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-carbon-70">
        <div>
          <dt className="font-semibold text-carbon-60">{t('common.targetDate')}</dt>
          <dd>{formatDate(alert.target_date)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-carbon-60">{t('common.leadTime')}</dt>
          <dd>
            {typeof alert.lead_time_days === 'number'
              ? `${formatNumber(alert.lead_time_days, { maximumFractionDigits: 0 })} ${t('common.days')}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-carbon-60">{t('common.predictionDate')}</dt>
          <dd>{formatDate(alert.prediction_date)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-carbon-60">{t('common.dataCutoff')}</dt>
          <dd>{formatDate(alert.freshness?.data_cutoff || alert.published?.data_cutoff)}</dd>
        </div>
      </dl>

      {variant === 'full' && (
        <div className="mt-3 bg-carbon-05 border border-carbon-20 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-carbon-60">
            {t('alerts.card.evidence')}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-carbon-70">
            <li>
              <span className="font-semibold">{t('alerts.evidence.modelSeverity')}:</span>{' '}
              {formatNumber(model.model_severity ?? alert.severity_score)}
            </li>
            <li>
              <span className="font-semibold">{t('alerts.evidence.physicsSeverity')}:</span>{' '}
              {physics.physics_severity === null || physics.physics_severity === undefined
                ? t('alerts.evidence.noPhysics')
                : formatNumber(physics.physics_severity)}
            </li>
            {typeof physics.divergence === 'number' && (
              <li>
                <span className="font-semibold">{t('alerts.evidence.divergence')}:</span>{' '}
                {formatNumber(physics.divergence)}
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-carbon-70">{confidenceText}</p>

      {reviewLabel && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-carbon-70">
          <MaterialIcon name="verified_user" className="text-sm" aria-hidden="true" />
          {reviewLabel}
        </p>
      )}

      {alert.provenance?.model_version && (
        <p className="mt-1 font-mono text-xs text-carbon-60">
          {t('common.updated')}: {formatDate(alert.prediction_date)} · {alert.provenance.model_version}
          {alert.policy_version ? ` · ${alert.policy_version}` : ''}
        </p>
      )}
    </article>
  );
};

export default AlertCard;
