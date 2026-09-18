/**
 * The evidence card — what an alert is *made of* (Phase 5).
 *
 * PRODUCT_SPEC §1.3 requires that any published alert be traceable: which model
 * version, which policy version, what the physics engine said, what the model said,
 * how far apart they were, when the data was cut off, and who (or what) published it.
 * The card is that trace, rendered once and reused in two places:
 *
 *   - on screen at `/alerts/:id`, where a district officer or journalist reads it;
 *   - as the PDF export target (`id="hn-evidence-card"` + `EvidenceCardExportButton`),
 *     where it becomes the thing that gets printed and pinned to a notice board.
 *
 * The export path is the reason the markup is deliberately plain: `exportElementToPdf`
 * rasterises this node through html2canvas-pro, so no canvas-only charts, no
 * `position: fixed` decorations, and the disclaimer is a real DOM node with
 * `.print-only` on the print variant. Everything the PDF shows is text that was on
 * the page — the print never invents content the screen did not have.
 */

import React, { useRef, useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { AlertLevelBadge } from './AlertLevelBadge';
import { Disclaimer } from './Disclaimer';
import type { AlertRecord } from '../../lib/alerts';
import { useI18n } from '../../hooks/useI18n';
import { useHazardLabel } from '../../hooks/useHazardLabel';
import { exportElementToPdf } from '../../utils/pdfExport';

export const EVIDENCE_CARD_ID = 'hn-evidence-card';

export interface EvidenceCardProps {
  alert: AlertRecord;
  /** Canonical §1.7 text from the API, when it supplies one. */
  disclaimer?: string | null;
  className?: string;
}

interface FieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, mono = false }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={`text-xs text-slate-900 break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
  </div>
);

const dash = (value: unknown): React.ReactNode =>
  value === null || value === undefined || value === '' ? '—' : String(value);

export const EvidenceCard: React.FC<EvidenceCardProps> = ({ alert, disclaimer, className = '' }) => {
  const { t, language, formatNumber, formatDate } = useI18n();
  const hazardLabel = useHazardLabel();

  const model = alert.evidence?.model || {};
  const physics = alert.evidence?.physics || {};
  const evidenceLine = Array.isArray(alert.evidence?.line) ? alert.evidence!.line! : [];
  const calibrated = model.confidence_published === 'calibrated_probability'
    || alert.confidence_kind === 'calibrated_probability';

  return (
    <section
      id={EVIDENCE_CARD_ID}
      className={`rounded-2xl border border-slate-300 bg-white p-4 sm:p-6 ${className}`}
      aria-labelledby="evidence-card-title"
    >
      <header className="border-b border-slate-200 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {t('alerts.card.evidenceCard')} · HazardNet {t('nav.alerts')}
        </p>
        <h2 id="evidence-card-title" className="mt-1 text-lg font-black text-slate-900">
          {hazardLabel(alert.hazard_type)} — {alert.district_name || alert.district_id || '—'}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AlertLevelBadge
            level={alert.level}
            label={t(`alerts.level.${alert.level}`)}
            description={t(`alerts.level.${alert.level}.desc`)}
            size="lg"
            srPrefix={t('alerts.levelLabel')}
          />
          <span className="text-xs font-semibold text-slate-700">
            {alert.division || '—'} · {alert.horizon?.replace('_', ' ') || '—'}
          </span>
          {alert.requires_human_review && (
            <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-950">
              {t('alerts.card.requiresReview')}
            </span>
          )}
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label={t('common.targetDate')} value={formatDate(alert.target_date)} />
        <Field label={t('common.leadTime')} value={
          typeof alert.lead_time_days === 'number'
            ? `${formatNumber(alert.lead_time_days, { maximumFractionDigits: 0 })} ${t('common.days')}`
            : '—'
        } />
        <Field label={t('common.predictionDate')} value={formatDate(alert.prediction_date)} />
        <Field label={t('common.dataCutoff')} value={formatDate(alert.freshness?.data_cutoff || alert.published?.data_cutoff)} />
        <Field label={t('evidence.alertId')} value={alert.id} mono />
        <Field label={t('evidence.alertKey')} value={dash(alert.id.replace(/__p\d{4}-\d{2}-\d{2}$/, ''))} mono />
      </dl>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            {t('alerts.evidence.modelSeverity')}
          </h3>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
            {formatNumber(model.model_severity ?? alert.severity_score)}
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
            <li>
              <span className="font-semibold">{t('evidence.confidence')}:</span>{' '}
              {formatNumber(alert.confidence)}
            </li>
            <li>
              <span className="font-semibold">{t('evidence.modelVersion')}:</span>{' '}
              <span className="font-mono">{dash(alert.provenance?.model_version || alert.published?.model_version)}</span>
            </li>
            <li>
              <span className="font-semibold">{t('evidence.dataCutoff')}:</span>{' '}
              {formatDate(alert.freshness?.data_cutoff || alert.published?.data_cutoff)}
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            {t('alerts.evidence.physicsSeverity')}
          </h3>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
            {physics.physics_severity === null || physics.physics_severity === undefined
              ? '—'
              : formatNumber(physics.physics_severity)}
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
            <li>
              <span className="font-semibold">{t('alerts.evidence.divergence')}:</span>{' '}
              {physics.divergence === null || physics.divergence === undefined
                ? '—'
                : formatNumber(physics.divergence)}
            </li>
            <li>
              <span className="font-semibold">{t('evidence.agreement')}:</span>{' '}
              {dash(physics.physics_agreement)}
            </li>
            <li>
              <span className="font-semibold">{t('evidence.engine')}:</span>{' '}
              {dash(physics.note || physics.divergence_source)}
            </li>
          </ul>
          {(physics.physics_severity === null || physics.physics_severity === undefined) && (
            <p className="mt-2 text-[11px] leading-snug text-amber-900">{t('alerts.evidence.noPhysics')}</p>
          )}
        </div>
      </div>

      {evidenceLine.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            {t('evidence.drivers')}
          </h3>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-800">
            {evidenceLine.map((item) => (
              <li key={item} className="font-mono">{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {t('evidence.publicationTrail')}
        </h3>
        <ul className="mt-1.5 space-y-1 text-[11px] text-slate-700">
          <li>
            <span className="font-semibold">{t('evidence.publishedAt')}:</span>{' '}
            {formatDate(alert.published?.at, { withTime: true })}
          </li>
          <li>
            <span className="font-semibold">{t('alerts.card.reviewedBy')}:</span>{' '}
            {dash(alert.published?.reviewer)}
          </li>
          <li>
            <span className="font-semibold">{t('evidence.policyVersion')}:</span>{' '}
            <span className="font-mono">{dash(alert.policy_version)}</span>
          </li>
          <li>
            <span className="font-semibold">{t('evidence.publishMode')}:</span>{' '}
            {dash(alert.published?.mode)}
          </li>
        </ul>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-700">
        {calibrated
          ? t('alerts.confidence.calibratedLong', { score: formatNumber(alert.confidence) })
          : t('alerts.confidence.uncalibratedLong', { score: formatNumber(alert.confidence) })}
      </p>

      {/* Screen: full disclaimer block. Print/PDF: the compact §1.7 footer. */}
      <Disclaimer className="mt-4 no-print" text={disclaimer} variant="inline" />
      <Disclaimer className="mt-4 hidden print:block" text={disclaimer} variant="print" showNumbers={false} />

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
        <span className="font-mono">
          HazardNet · {alert.horizon?.replace('_', ' ') || '—'} · {alert.district_id || '—'}
        </span>
        <span>
          {t('evidence.generated')}: {formatDate(new Date().toISOString(), { withTime: true })}
          {language === 'bn' ? ' (BN)' : ''}
        </span>
      </footer>
    </section>
  );
};

export interface EvidenceCardExportButtonProps {
  alert: AlertRecord;
  className?: string;
}

/** PDF export for one evidence card. Uses the shared exporter (jsPDF + html2canvas-pro). */
export const EvidenceCardExportButton: React.FC<EvidenceCardExportButtonProps> = ({ alert, className = '' }) => {
  const { t } = useI18n();
  const busy = useRef(false);
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');

  const onExport = async () => {
    if (busy.current) return;
    busy.current = true;
    setState('working');
    try {
      await exportElementToPdf({
        elementId: EVIDENCE_CARD_ID,
        title: `${alert.hazard_type} — ${alert.district_name || alert.district_id || ''}`,
        documentType: 'HazardNet Evidence Card',
        orientation: 'portrait',
        filenameTemplate: 'HazardNet_Evidence_{district}_{date}',
        filenameContext: {
          district: String(alert.district_name || alert.district_id || 'district').replace(/\s+/g, ''),
          date: String(alert.target_date || '').slice(0, 10),
        },
      });
      setState('idle');
    } catch {
      setState('error');
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={onExport}
        disabled={state === 'working'}
        aria-busy={state === 'working'}
        className="no-print inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        <MaterialIcon name="download" className="text-base" aria-hidden="true" />
        {state === 'working' ? t('evidence.exporting') : t('evidence.exportPdf')}
      </button>
      {state === 'error' && (
        <p role="alert" className="max-w-xs text-right text-[11px] font-semibold text-red-700">
          {t('evidence.exportFailed')}
        </p>
      )}
    </div>
  );
};

export default EvidenceCard;
