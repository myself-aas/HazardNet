/**
 * "How are these levels decided?" (Phase 5).
 *
 * The alert page publishes levels, so it has to publish the rule that produced them.
 * This panel renders the policy **as the API reports it** — thresholds, the automatic
 * publication ceiling, the calibration requirement and any environment overrides —
 * rather than hard-coding numbers that would silently diverge from
 * `backend/config/alert-policy.json`.
 *
 * The panel is deliberately explicit about the calibration gap: the engine requires a
 * calibrated probability before a `WARNING`, and no calibration accuracy is claimed, so
 * a watch is currently the highest level the pipeline can reach on its own. Saying so
 * on the public page is the honest alternative to rendering a warning that could not
 * be issued (project-killer #1: uncalibrated confidence).
 */

import React from 'react';
import { Link } from 'react-router-dom';
import MaterialIcon from '../MaterialIcon';
import { AlertLevelBadge } from './AlertLevelBadge';
import { ALERT_LEVELS, type AlertLevel, type AlertPolicyView } from '../../lib/alerts';
import { useI18n } from '../../hooks/useI18n';

export interface PolicyPanelProps {
  policy: AlertPolicyView | null;
  className?: string;
}

const percent = (value: unknown): string =>
  typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';

export const PolicyPanel: React.FC<PolicyPanelProps> = ({ policy, className = '' }) => {
  const { t } = useI18n();
  const thresholds = policy?.thresholds || {};
  const ceiling = policy?.human_in_the_loop?.max_auto_publish_level || 'WATCH';

  return (
    <section
      className={`border border-carbon-20 bg-white p-4 ${className}`}
      aria-labelledby="alert-policy-heading"
    >
      <h2 id="alert-policy-heading" className="flex items-center gap-1.5 text-base font-bold text-carbon-90">
        <MaterialIcon name="balance" className="text-base text-carbon-60" aria-hidden="true" />
        {t('alerts.policy.title')}
      </h2>
      <p className="mt-1 text-xs font-mono text-carbon-60">
        {policy?.version ? `${policy.version}${policy.source ? ` · ${policy.source}` : ''}` : t('common.none')}
      </p>

      <p className="mt-2 text-base leading-[1.62] text-carbon-70">
        {t('alerts.policy.ceiling', { ceiling })}
      </p>

      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-carbon-60">
        {t('alerts.policy.thresholds')}
      </h3>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-carbon-70">
        <div>
          <dt className="font-semibold">{t('alerts.level.WATCH')}</dt>
          <dd className="font-mono">
            ≥ {percent(thresholds.watch_probability)} · sev ≥ {percent(thresholds.watch_severity)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t('alerts.level.WARNING')}</dt>
          <dd className="font-mono">≥ {percent(thresholds.warning_probability)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-semibold">{t('alerts.evidence.divergence')}</dt>
          <dd className="font-mono">
            {t('alerts.policy.divergence', { value: percent(thresholds.divergence_watch) })}
          </dd>
        </div>
      </dl>

      <p className="mt-3 border border-carbon-20 border-l-[2px] border-l-[#ea6f24] bg-white p-4 text-base leading-[1.62] text-carbon-70">
        {t('alerts.policy.calibration')}
      </p>

      {Array.isArray(policy?.overridden) && policy.overridden.length > 0 && (
        <details className="mt-2 text-xs text-carbon-60">
          <summary className="min-h-[44px] cursor-pointer font-semibold">overrides</summary>
          <ul className="mt-1 list-disc pl-4 font-mono">
            {policy.overridden.map((entry) => (
              <li key={entry.key}>{entry.env} = {String(entry.value)}</li>
            ))}
          </ul>
        </details>
      )}

      {Array.isArray(policy?.warnings) && policy.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-sm text-carbon-70">
          {policy.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <p className="mt-3 text-sm">
        <Link to="/methodology" className="font-semibold underline decoration-dotted underline-offset-2">
          {t('alerts.policy.readFull')}
        </Link>
      </p>
    </section>
  );
};

/**
 * The four levels, what each one asks of the reader, and what the engine needs before it
 * will publish one. Kept next to the policy panel because the two answer the same
 * question from different directions ("what does the level mean" / "how was it set").
 */
export const AlertLevelLadder: React.FC<{ maxAutoLevel?: string | null; className?: string }> = ({
  maxAutoLevel = null,
  className = '',
}) => {
  const { t } = useI18n();
  const autoRank: Record<string, number> = { NO_ALERT: 0, WATCH: 1, WARNING: 2, SEVERE: 3 };
  const ceiling = autoRank[maxAutoLevel || 'WATCH'] ?? 1;

  return (
    <section
      className={`border border-carbon-20 bg-white p-4 ${className}`}
      aria-labelledby="alert-ladder-heading"
    >
      <h2 id="alert-ladder-heading" className="text-base font-bold text-carbon-90">
        {t('alerts.legend.title')}
      </h2>
      <ul className="mt-2 space-y-2">
        {ALERT_LEVELS.map((level: AlertLevel) => {
          const canAuto = (autoRank[level] ?? 0) <= ceiling;
          return (
            <li key={level} className="flex items-start gap-2">
              <AlertLevelBadge
                level={level}
                label={t(`alerts.level.${level}`)}
                description={t(`alerts.level.${level}.desc`)}
                size="sm"
              />
              <span className="flex-1 text-xs leading-snug text-carbon-70">
                {t(`alerts.level.${level}.desc`)}
                {level !== 'NO_ALERT' && (
                  <span className="ml-1 font-semibold text-carbon-60">
                    {canAuto ? `· ${t('alerts.card.autoPublished')}` : `· ${t('alerts.card.requiresReview')}`}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PolicyPanel;
