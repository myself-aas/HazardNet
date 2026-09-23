/**
 * @jest-environment node
 *
 * Export surfaces. §1.7 requires the disclaimer on every public surface *including
 * exports*, so the CSV writer is tested for the disclaimer column specifically, and
 * the evidence card is tested for the fields a duty officer must see before they
 * can sign an alert (§1.6).
 */
import { assessRow } from '../../backend/alerts/assess.js';
import { getPolicy, REQUIRED_DISCLAIMER } from '../../backend/alerts/policy.js';
import { buildEvidenceCard, alertsToCsv, CSV_COLUMNS, buildReportMarkdown } from '../../backend/alerts/report.js';

const NOW = new Date('2026-09-17T06:00:00Z');
const policy = getPolicy({});

const assessment = assessRow({
  district_id: 19,
  district_name: 'Dhaka',
  division: 'Dhaka',
  pcode: '3037',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.94,
  confidence: 0.9,
  confidence_kind: 'model_softmax_top_class',
  model_severity: 0.94,
  physics_severity: 0.61,
  track_divergence: 0.33,
  prediction_date: '2026-09-16',
  target_date: '2026-09-23',
  model_version: '2.1.9+model.d7b1a5b48aa6',
  dataset_version: 'ds1.0123456789abcdef',
  pipeline_version: 'v2.3.0',
  run_id: 'run-7',
}, { policy, now: NOW });

const storedAlert = {
  ...assessment,
  id: '2026-09-23__7_days__19__flood',
  state: 'DRAFT',
  created_at: NOW.toISOString(),
};

const publishedAlert = {
  ...storedAlert,
  state: 'PUBLISHED',
  published: {
    at: NOW.toISOString(),
    level: 'WATCH',
    reviewer: null,
    mode: 'auto',
    model_version: '2.1.9+model.d7b1a5b48aa6',
    dataset_version: 'ds1.0123456789abcdef',
    data_cutoff: '2026-09-16T00:00:00.000Z',
    evidence_snapshot: { captured_at: NOW.toISOString(), digest_source: '19|7_days|2026-09-23|WATCH|alert-policy/1.0.0' },
  },
};

describe('evidence card', () => {
  test('contains every section a reviewer signs off on', () => {
    const card = buildEvidenceCard(storedAlert);
    const ids = card.sections.map((section) => section.id);
    expect(ids).toEqual(['level', 'evidence', 'confidence', 'freshness', 'provenance', 'review', 'disclaimer']);
    const level = card.sections.find((section) => section.id === 'level').lines.join('\n');
    expect(level).toContain('Level: WATCH (state DRAFT)');
    expect(level).toContain('Fired:');
    expect(level).toContain('Blocked: warning_requires_calibration');
    const confidence = card.sections.find((section) => section.id === 'confidence').lines.join('\n');
    expect(confidence).toContain('uncalibrated model score, not a probability');
  });

  test('states the provenance, data cutoff and disclaimer verbatim', () => {
    const card = buildEvidenceCard(publishedAlert);
    const text = card.markdown;
    expect(text).toContain('Model version: 2.1.9+model.d7b1a5b48aa6');
    expect(text).toContain('Dataset version: ds1.0123456789abcdef');
    expect(text).toContain('Data cutoff: 2026-09-16 00:00:00Z');
    expect(text).toContain('Publisher: alert-pipeline (auto)');
    expect(text).toContain(REQUIRED_DISCLAIMER);
    expect(card.published).toBe(true);
    expect(card.kind).toBe('evidence-card/1.0.0');
  });

  test('a review section records the decision, the reviewer and the snapshot', () => {
    const card = buildEvidenceCard({
      ...storedAlert,
      state: 'REJECTED',
      review: {
        decision: 'rejected',
        reviewer: 'u-shourav',
        at: NOW.toISOString(),
        reason: 'upazila office reports no waterlogging',
        evidence_snapshot: { digest_source: '19|7_days|2026-09-23|WATCH|alert-policy/1.0.0' },
      },
    });
    const review = card.sections.find((section) => section.id === 'review').lines.join('\n');
    expect(review).toContain('Decision: rejected by u-shourav');
    expect(review).toContain('upazila office reports no waterlogging');
    expect(card.reviewed).toBe(true);
  });
});

describe('CSV export', () => {
  const csv = alertsToCsv([publishedAlert, { ...storedAlert, id: 'second' }]);

  test('has a stable header and one row per alert', () => {
    const [header, ...rows] = csv.trim().split('\n');
    expect(header.split(',')).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(2);
    expect(header).toContain('disclaimer');
  });

  test('carries the §1.7 disclaimer in every row (§1.7 names exports)', () => {
    const rows = csv.trim().split('\n').slice(1);
    for (const row of rows) {
      expect(row).toContain('not an official warning service');
      expect(row).toContain('999');
      expect(row).toContain('1090');
      expect(row).toContain('16123');
    }
  });

  test('records the review fields and quotes embedded commas', () => {
    const withComma = alertsToCsv([{
      ...storedAlert,
      assessment: { ...storedAlert, district_name: 'Cox\'s Bazar, Teknaf' },
      district_name: 'Cox\'s Bazar, Teknaf',
    }]);
    expect(withComma).toContain('"Cox\'s Bazar, Teknaf"');
  });

  test('the disclaimer column can be dropped only explicitly (internal tools)', () => {
    const internal = alertsToCsv([publishedAlert], { includeDisclaimer: false });
    expect(internal.split('\n')[0]).not.toContain('disclaimer');
    expect(internal).not.toContain('not an official warning service');
  });
});

describe('run report', () => {
  const batch = {
    generated_at: NOW.toISOString(),
    policy_version: policy.version,
    rows_total: 3,
    assessed: 3,
    counts: { NO_ALERT: 1, WATCH: 2, WARNING: 0, SEVERE: 0, skipped: 0 },
    saturation: { note: 'more than a quarter of rows sit at the maximum severity' },
    alerts: [
      storedAlert,
      { ...publishedAlert, id: 'b', district_name: 'Kurigram', hazard_type: 'Flash Flood' },
      {
        ...storedAlert,
        id: 'c',
        district_name: 'Sylhet',
        state: 'REJECTED',
        last_rejection: { reason: 'no waterlogging reported' },
      },
    ],
  };

  test('summarises counts, the queue and the rejection labels', () => {
    const markdown = buildReportMarkdown(batch);
    expect(markdown).toContain('| WATCH | 2 |');
    expect(markdown).toContain(REQUIRED_DISCLAIMER);
    expect(markdown).toContain('> more than a quarter of rows sit at the maximum severity');
    expect(markdown).toContain('## Review queue');
    expect(markdown).toContain('## Rejection labels');
    expect(markdown).toContain('no waterlogging reported');
    expect(markdown).toContain('Flash Flood');
  });

  test('an empty queue and no rejections say so', () => {
    const markdown = buildReportMarkdown({
      ...batch,
      alerts: [{ ...storedAlert, requires_human_review: false }],
    });
    expect(markdown).toContain('Empty.');
    expect(markdown).toContain('None recorded.');
  });
});
