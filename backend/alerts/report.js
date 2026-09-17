/**
 * Report and export surfaces for alerts (PRODUCT_SPEC §1.6/§1.7, Phase 4 scope:
 * "report export").
 *
 * Three exports, all built from the same stored alert records:
 *
 *   - `buildEvidenceCard(alert)` — the artefact a duty officer reviews and signs.
 *     Structured sections (level, evidence, confidence statement, freshness,
 *     provenance, review history) plus a markdown rendering, so the same object
 *     feeds the API, the PDF/print view and the audit trail. §1.6 makes the card
 *     the unit of review, so it is generated the same way whether a human or a
 *     test asked for it.
 *   - `alertsToCsv(alerts, {includeDisclaimer})` — the machine-readable export.
 *     §1.7 requires the disclaimer on every public surface *including exports*, so
 *     the last column carries it and the header row names it; the frontend
 *     download path (frontend/src/utils/pdfExport.ts) and the CSV path therefore
 *     carry the same text.
 *   - `buildReportMarkdown(...)` — a human-readable run report, with the level
 *     counts, the review queue and the rejection log (the labels §1.6 asks for).
 */

import { REQUIRED_DISCLAIMER } from './policy.js';

export const EVIDENCE_CARD_VERSION = 'evidence-card/1.0.0';

const num = (value, digits = 4) =>
  (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

const cell = (value) => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const when = (value) => (value ? String(value).slice(0, 19).replace('T', ' ') + 'Z' : '—');

/**
 * The evidence card. Accepts a stored alert (with `assessment`, `review`,
 * `published`, `history`) or a bare assessment.
 */
export function buildEvidenceCard(alert = {}) {
  const assessment = alert.assessment || alert;
  const evidence = alert.evidence || assessment.evidence || {};
  const model = evidence.model || {};
  const physics = evidence.physics || {};
  const freshness = alert.freshness || assessment.freshness || {};
  const provenance = alert.provenance || assessment.provenance || {};
  const review = alert.review || null;
  const published = alert.published || null;

  const sections = [
    {
      id: 'level',
      title: 'Level and rule',
      lines: [
        `Level: ${alert.level || assessment.level || 'unassessed'}` +
          (alert.state ? ` (state ${alert.state})` : ''),
        ...(assessment.reasons || []).map((r) => `Fired: ${r.rule} — ${r.detail}`),
        ...(assessment.blockers || []).map((b) => `Blocked: ${b.rule} — ${b.detail}`),
        `Auto-publish ceiling: ${assessment.review_rule || 'see policy'}`,
      ],
    },
    {
      id: 'evidence',
      title: 'Evidence trail',
      lines: [
        `Hazard class: ${assessment.hazard_type || '—'}`,
        `Model severity: ${num(model.model_severity) ?? '—'} · severity index: ` +
          `${num(assessment.severity_score) ?? '—'}`,
        `Model score: ${num(model.confidence) ?? '—'} ` +
          `(${model.confidence_kind || 'kind not stated'}; published as ` +
          `${model.confidence_published || 'unknown'})`,
        `Independent physics severity: ${num(physics.physics_severity) ?? '—'}` +
          (physics.physics_severity === null || physics.physics_severity === undefined
            ? ' (no independent track on this row)'
            : ` · divergence ${num(physics.divergence) ?? '—'} (${physics.divergence_source || 'row'})`),
        `Track agreement: ${physics.physics_agreement || 'unknown'}`,
        ...(physics.note ? [`Physics note: ${physics.note}`] : []),
        `Official bulletin: ${evidence.official && evidence.official.source
          ? `${evidence.official.source} at ${num(evidence.official.bulletin_score)}`
          : 'none attached to this row'}`,
        ...(evidence.line || []),
      ],
    },
    {
      id: 'confidence',
      title: 'Confidence statement',
      lines: [
        model.confidence_published === 'calibrated_probability'
          ? 'The number published with this alert is a calibrated probability ' +
            '(fit map present; see docs/mlops/CALIBRATION.md).'
          : 'The number published with this alert is an uncalibrated model score, not a ' +
            'probability of the hazard occurring (docs/mlops/CALIBRATION.md; MODEL_CARD §6).',
        `Confidence kind: ${alert.confidence_kind || model.confidence_kind || 'not stated'}`,
      ],
    },
    {
      id: 'freshness',
      title: 'Freshness',
      lines: [
        `Prediction date: ${freshness.prediction_date || assessment.prediction_date || '—'}`,
        `Data cutoff: ${when(freshness.data_cutoff)} ` +
          `(source: ${freshness.data_cutoff_source || '—'})`,
        `Age at assessment: ${num(freshness.age_hours, 2) ?? '—'} h ` +
          `(SLO ${freshness.slo_hours ?? '—'} h, within SLO: ${String(freshness.within_slo)})`,
        `Lead time: ${assessment.lead_time_days ?? '—'} d → target ${assessment.target_date || '—'}`,
      ],
    },
    {
      id: 'provenance',
      title: 'Provenance',
      lines: [
        `Model version: ${provenance.model_version || 'NOT STATED'}`,
        `Dataset version: ${provenance.dataset_version || 'not stamped on this row'}`,
        `Pipeline version: ${provenance.pipeline_version || '—'} · run ${provenance.run_id || '—'}`,
        `Policy version: ${alert.policy_version || assessment.policy_version || '—'}`,
      ],
    },
    {
      id: 'review',
      title: 'Human review (§1.6)',
      lines: review
        ? [
          `Decision: ${review.decision} by ${review.reviewer || 'unnamed'} at ${when(review.at)}`,
          `Reason: ${review.reason || '—'}`,
          `Evidence snapshot digest: ${review.evidence_snapshot
            ? review.evidence_snapshot.digest_source : '—'}`,
        ]
        : [
          assessment.requires_human_review
            ? `Review required: ${assessment.review_rule || 'levels above the auto-publish ceiling ' +
              'need a named duty officer before publication'}.`
            : 'No review required at this level (WATCH or below may be published automatically).',
          `Publisher: ${published
            ? `${published.reviewer || 'alert-pipeline'} (${published.mode}) at ${when(published.at)}`
            : 'not yet published'}`,
        ],
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer',
      lines: [alert.disclaimer || REQUIRED_DISCLAIMER],
    },
  ];

  const markdown = [
    `### Evidence card — ${alert.level || assessment.level || 'unassessed'} · ` +
      `${assessment.district_name || alert.district_name || alert.district_id || '—'} · ` +
      `${assessment.hazard_type || '—'} · ${assessment.horizon || '—'}`,
    '',
    ...sections.flatMap((section) => [
      `**${section.title}**`,
      ...section.lines.map((line) => `- ${line}`),
      '',
    ]),
  ].join('\n');

  return {
    kind: EVIDENCE_CARD_VERSION,
    alert_id: alert.id || assessment.alert_id || null,
    state: alert.state || null,
    level: alert.level || assessment.level || null,
    district_id: alert.district_id ?? assessment.district_id ?? null,
    district_name: alert.district_name || assessment.district_name || null,
    hazard_type: alert.hazard_type || assessment.hazard_type || null,
    horizon: alert.horizon || assessment.horizon || null,
    target_date: alert.target_date || assessment.target_date || null,
    reviewed: Boolean(review),
    published: Boolean(published),
    required_for_review: Boolean(alert.requires_human_review || assessment.requires_human_review),
    disclaimer: alert.disclaimer || REQUIRED_DISCLAIMER,
    sections,
    markdown,
  };
}

export const CSV_COLUMNS = Object.freeze([
  'alert_id', 'state', 'level', 'district_id', 'district_name', 'division', 'pcode',
  'horizon', 'hazard_type', 'target_date', 'prediction_date', 'lead_time_days',
  'severity_score', 'confidence', 'confidence_kind', 'track_divergence',
  'physics_severity', 'track_agreement', 'policy_version', 'requires_human_review',
  'auto_publishable', 'published_at', 'published_mode', 'reviewer_id', 'reviewer_email',
  'reviewed_at', 'rejection_reason', 'model_version', 'dataset_version', 'data_cutoff',
  'evidence_snapshot_at', 'disclaimer',
]);

/**
 * CSV export. `includeDisclaimer` defaults to true and is not meant to be turned
 * off for a public surface — §1.7 names exports explicitly. It exists so an
 * internal audit tool can drop the repeated column.
 */
export function alertsToCsv(alerts = [], { includeDisclaimer = true } = {}) {
  const columns = includeDisclaimer
    ? CSV_COLUMNS
    : CSV_COLUMNS.filter((column) => column !== 'disclaimer');
  const lines = [columns.join(',')];
  for (const alert of alerts) {
    const assessment = alert.assessment || alert;
    const evidence = alert.evidence || assessment.evidence || {};
    const physics = evidence.physics || {};
    const published = alert.published || null;
    const review = alert.review || null;
    const record = {
      alert_id: alert.id,
      state: alert.state,
      level: alert.level,
      district_id: alert.district_id,
      district_name: alert.district_name,
      division: alert.division,
      pcode: alert.pcode,
      horizon: alert.horizon,
      hazard_type: alert.hazard_type,
      target_date: alert.target_date,
      prediction_date: alert.prediction_date,
      lead_time_days: assessment.lead_time_days,
      severity_score: assessment.severity_score,
      confidence: alert.confidence,
      confidence_kind: alert.confidence_kind,
      track_divergence: physics.divergence,
      physics_severity: physics.physics_severity,
      track_agreement: physics.physics_agreement,
      policy_version: alert.policy_version || assessment.policy_version,
      requires_human_review: alert.requires_human_review === true,
      auto_publishable: alert.auto_publishable === true,
      published_at: published ? published.at : null,
      published_mode: published ? published.mode : null,
      reviewer_id: (published && published.reviewer) || (review && review.reviewer) || null,
      reviewer_email: published && published.reviewer_identity
        ? published.reviewer_identity.email : null,
      reviewed_at: published ? published.at : (review ? review.at : null),
      rejection_reason: review && review.decision === 'rejected' ? review.reason : null,
      model_version: (alert.provenance || assessment.provenance || {}).model_version,
      dataset_version: (alert.provenance || assessment.provenance || {}).dataset_version,
      data_cutoff: (alert.freshness || assessment.freshness || {}).data_cutoff,
      evidence_snapshot_at: published && published.evidence_snapshot
        ? published.evidence_snapshot.captured_at : (review && review.evidence_snapshot
          ? review.evidence_snapshot.captured_at : null),
      disclaimer: alert.disclaimer || REQUIRED_DISCLAIMER,
    };
    lines.push(columns.map((column) => cell(record[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Human-readable run report: what fired, what is queued, what was rejected. */
export function buildReportMarkdown(batch = {}, { limit = 20 } = {}) {
  const alerts = batch.alerts || [];
  const counts = batch.counts || {};
  const queue = alerts.filter((alert) => alert.requires_human_review);
  const rejected = alerts.filter((alert) => alert.state === 'REJECTED');
  const published = alerts.filter((alert) => alert.state === 'PUBLISHED');
  const lines = [
    '# HazardNet alert report',
    '',
    `Generated: ${batch.generated_at || '—'} · policy ${batch.policy_version || '—'}`,
    '',
    REQUIRED_DISCLAIMER,
    '',
    '## Counts',
    '',
    '| Level | Alerts |',
    '| ----- | ------ |',
    ...['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE'].map(
      (level) => `| ${level} | ${counts[level] ?? 0} |`
    ),
    `| skipped | ${counts.skipped ?? 0} |`,
    '',
    `Rows assessed: ${batch.assessed ?? alerts.length} of ${batch.rows_total ?? alerts.length}. ` +
      `Awaiting review: ${queue.length}. Published: ${published.length}. Rejected: ${rejected.length}.`,
    '',
  ];
  if (batch.saturation && batch.saturation.note) {
    lines.push(`> ${batch.saturation.note}`, '');
  }
  lines.push('## Highest-level alerts', '');
  for (const alert of alerts.slice(0, limit)) {
    lines.push(
      `- **${alert.level}** ${alert.district_name || alert.district_id} · ${alert.hazard_type} · ` +
      `${alert.horizon} · target ${alert.target_date || '—'} · score ` +
      `${alert.confidence ?? '—'} (${alert.confidence_kind || 'no kind'}) · ` +
      `${alert.state || 'assessed'}`
    );
  }
  lines.push('', '## Review queue', '');
  lines.push(queue.length === 0
    ? 'Empty.'
    : queue.slice(0, limit).map((alert) => `- ${alert.district_name || alert.district_id} · ` +
        `${alert.level} · ${alert.hazard_type} · blockers: ` +
        `${(alert.blockers || []).map((b) => b.rule).join(', ') || 'none'}`).join('\n'));
  lines.push('', '## Rejection labels', '');
  lines.push(rejected.length === 0
    ? 'None recorded.'
    : rejected.slice(0, limit).map((alert) => `- ${alert.district_name || alert.district_id} · ` +
        `${alert.hazard_type} · ${alert.last_rejection ? alert.last_rejection.reason : 'no reason'}`)
      .join('\n'));
  lines.push('');
  return `${lines.join('\n')}\n`;
}
