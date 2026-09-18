/**
 * @jest-environment node
 *
 * The §1.3 warning-level table, row by row:
 *
 *   NO_ALERT  nothing above the watch band
 *   WATCH     probability ≥ watch, or severity ≥ band, or divergence > 0.30,
 *             or an elevated official bulletin
 *   WARNING   calibrated probability ≥ warning AND both tracks agree
 *   SEVERE    WARNING-level evidence + duty-officer review, or an official
 *             bulletin at maximum severity
 *
 * plus the honest failure modes the engine reports instead of guessing: a
 * softmax score can never reach WARNING by default, and a missing physics track
 * is "unknown", not "no divergence".
 */
import { assessBatch, assessRow, readEvidence, HAZARD_CLASSES, isModelledHazard }
  from '../../backend/alerts/assess.js';
import { getPolicy } from '../../backend/alerts/policy.js';
import { VALID_HAZARDS } from '../../backend/utils/forecastRow.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const NOW = new Date('2026-09-17T06:00:00Z');
const policy = getPolicy({});

const row = (over = {}) => ({
  district_id: 19,
  district_name: 'Dhaka',
  division: 'Dhaka',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.42,
  confidence: 0.22,
  confidence_kind: 'model_softmax_top_class',
  model_severity: 0.42,
  physics_severity: 0.39,
  prediction_date: '2026-09-16',
  target_date: '2026-09-23',
  model_version: '2.1.9+model.d7b1a5b48aa6',
  dataset_version: 'ds1.0123456789abcdef',
  pipeline_version: 'v2.3.0',
  run_id: 'run-1',
  ...over,
});

describe('level mapping', () => {
  test('NO_ALERT when nothing crosses a threshold', () => {
    const alert = assessRow(row(), { policy, now: NOW });
    expect(alert.level).toBe('NO_ALERT');
    expect(alert.reasons).toHaveLength(0);
    expect(alert.auto_publishable).toBe(true);
  });

  test('WATCH when the model score crosses the watch threshold', () => {
    const alert = assessRow(row({ confidence: 0.55 }), { policy, now: NOW });
    expect(alert.level).toBe('WATCH');
    expect(alert.reasons.map((r) => r.rule)).toContain('watch_softmax_proxy');
    expect(alert.reasons[0].detail).toMatch(/not as a calibrated probability/);
  });

  test('WATCH when model/physics divergence exceeds 0.30', () => {
    const alert = assessRow(row({
      model_severity: 0.95, physics_severity: 0.30,
    }), { policy, now: NOW });
    expect(alert.level).toBe('WATCH');
    expect(alert.reasons.map((r) => r.rule)).toContain('watch_divergence');
    expect(alert.reasons.find((r) => r.rule === 'watch_divergence').detail)
      .toMatch(/0.65 > 0.3/);
  });

  test('divergence computed from the two tracks is recorded with its source', () => {
    const evidence = readEvidence(row({ model_severity: 0.9, physics_severity: 0.2 }));
    expect(evidence.track_divergence).toBeCloseTo(0.7, 6);
    expect(evidence.divergence_source).toBe('abs(model_severity - physics_severity)');
  });

  test('a row-provided track_divergence wins over the computed gap', () => {
    const alert = assessRow(row({
      model_severity: 0.9, physics_severity: 0.2, track_divergence: 0.05,
    }), { policy, now: NOW });
    expect(alert.evidence.physics.divergence).toBe(0.05);
    expect(alert.level).toBe('NO_ALERT');
  });

  test('an uncalibrated score above the warning threshold stops at WATCH with a blocker', () => {
    const alert = assessRow(row({
      confidence: 0.97, severity_score: 0.9, model_severity: 0.9, physics_severity: 0.9,
    }), { policy, now: NOW });
    expect(alert.level).toBe('WATCH');
    expect(alert.blockers.map((b) => b.rule)).toContain('warning_requires_calibration');
    expect(alert.blockers[0].detail).toMatch(/no calibration map is fitted/);
  });

  test('WARNING needs both a calibrated probability and agreeing tracks', () => {
    const agreeing = assessRow(row({
      confidence: 0.71, confidence_kind: 'calibrated_probability',
      model_severity: 0.71, physics_severity: 0.71,
    }), { policy, now: NOW });
    expect(agreeing.level).toBe('WARNING');
    expect(agreeing.reasons.map((r) => r.rule)).toContain('warning_probability_and_agreement');
    expect(agreeing.requires_human_review).toBe(true);
    expect(agreeing.auto_publishable).toBe(false);
  });

  test('a calibrated probability without agreement is blocked, not warned', () => {
    const disagreeing = assessRow(row({
      confidence: 0.71, confidence_kind: 'calibrated_probability',
      model_severity: 0.71, physics_severity: 0.20,
    }), { policy, now: NOW });
    expect(disagreeing.level).toBe('WATCH');
    expect(disagreeing.blockers.map((b) => b.rule)).toContain('warning_agreement');
  });

  test('SEVERE from an official bulletin at maximum severity', () => {
    const alert = assessRow(row({
      bulletin_score: 1, bulletin_source: 'FFWC',
    }), { policy, now: NOW });
    expect(alert.level).toBe('SEVERE');
    expect(alert.reasons.map((r) => r.rule)).toContain('severe_official_bulletin');
  });

  test('a mid-range bulletin is WATCH, and the 0–10 scale is normalised', () => {
    const alert = assessRow(row({ bulletin_score: 6, bulletin_source: 'FFWC' }),
      { policy, now: NOW });
    expect(alert.evidence.official.bulletin_score).toBeCloseTo(0.6, 6);
    expect(alert.level).toBe('WATCH');
    expect(alert.reasons.map((r) => r.rule)).toContain('watch_official_bulletin');
  });

  test('SEVERE is reachable from a reviewed WARNING but never on its own', () => {
    const warned = assessRow(row({
      confidence: 0.8, confidence_kind: 'calibrated_probability',
      model_severity: 0.8, physics_severity: 0.8,
    }), { policy, now: NOW });
    expect(warned.level).toBe('WARNING');
    expect(warned.blockers.map((b) => b.rule)).toContain('severe_requires_review_or_official');
    const reviewed = assessRow(row({
      confidence: 0.8, confidence_kind: 'calibrated_probability',
      model_severity: 0.8, physics_severity: 0.8, duty_officer_approval: true,
    }), { policy, now: NOW });
    expect(reviewed.level).toBe('SEVERE');
    expect(reviewed.reasons.map((r) => r.rule)).toContain('severe_duty_officer_review');
  });

  test('with the override enabled, an uncalibrated score can reach WARNING', () => {
    const permissive = getPolicy({ ALERT_ALLOW_UNCALIBRATED_WARNING: 'true' });
    const alert = assessRow(row({
      confidence: 0.9, model_severity: 0.9, physics_severity: 0.9,
    }), { policy: permissive, now: NOW });
    expect(alert.level).toBe('WARNING');
  });

  test('a missing physics track is unknown agreement, not disagreement', () => {
    const alert = assessRow(row({ physics_severity: null, model_severity: 0.6 }),
      { policy, now: NOW });
    expect(alert.evidence.physics.physics_agreement).toBe('unknown');
    expect(alert.evidence.physics.divergence).toBeNull();
    expect(alert.evidence.physics.note).toMatch(/no independent physics score/);
  });
});

describe('contract fields', () => {
  test('every alert carries hazard class, lead time, confidence statement, evidence, freshness and version', () => {
    const alert = assessRow(row({ confidence: 0.55 }), { policy, now: NOW });
    expect(alert.hazard_type).toBe('Flood');
    expect(alert.lead_time_days).toBe(7);
    expect(alert.confidence).toBe(0.55);
    expect(alert.confidence_kind).toBe('model_softmax_top_class');
    expect(alert.evidence.model.confidence_published).toBe('uncalibrated_model_softmax');
    expect(alert.evidence.line.join(' ')).toMatch(/uncalibrated score 0.55/);
    expect(alert.freshness.within_slo).toBe(true);
    expect(alert.freshness.data_cutoff).toBe('2026-09-16T00:00:00.000Z');
    expect(alert.provenance.model_version).toBe('2.1.9+model.d7b1a5b48aa6');
    expect(alert.disclaimer).toMatch(/not an official warning service/);
    expect(alert.policy_version).toBe(policy.version);
  });

  test('a stale prediction is reported against the 48 h SLO', () => {
    const alert = assessRow(row({ prediction_date: '2026-09-10' }), { policy, now: NOW });
    expect(alert.freshness.within_slo).toBe(false);
    expect(alert.freshness.age_hours).toBeGreaterThan(48);
  });

  test('the vocabulary is the model vocabulary, not the site vocabulary', () => {
    // The trap this pins: the frontend display set (Storm Surge, River Erosion,
    // Landslide, Heatwave) is *not* the model's label set, and an engine built on
    // it silently skips Cold Wave / Fire / Heat Wave / Severe Local Storm rows.
    const labels = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../Models/labels.json'), 'utf8'),
    );
    const modelled = Object.keys(labels).sort((a, b) => Number(a) - Number(b))
      .map((key) => labels[key]);
    expect([...HAZARD_CLASSES]).toEqual(modelled);
    expect(HAZARD_CLASSES).toEqual(VALID_HAZARDS);
    for (const hazard of modelled) expect(isModelledHazard(hazard)).toBe(true);
    for (const displayed of ['Storm Surge', 'River Erosion', 'Landslide', 'Heatwave']) {
      expect(isModelledHazard(displayed)).toBe(false);
    }
  });

  test('every modelled class is assessed, not skipped', () => {
    // Regression: these four were skipped by the display-vocabulary revision.
    for (const hazard of ['Cold Wave', 'Fire', 'Heat Wave', 'Severe Local Storm']) {
      const assessed = assessRow(row({ hazard_type: hazard, confidence: 0.55 }),
        { policy, now: NOW });
      expect(assessed.status).toBe('assessed');
      expect(assessed.level).toBe('WATCH');
      expect(assessed.hazard_type).toBe(hazard);
    }
  });

  test('skips rows it cannot judge instead of inventing a level', () => {
    const noHazard = assessRow(row({ hazard_type: null }), { policy, now: NOW });
    expect(noHazard.status).toBe('skipped');
    expect(noHazard.skip_reason).toMatch(/no hazard_type/);
    const badHazard = assessRow(row({ hazard_type: 'Locust Swarm' }), { policy, now: NOW });
    expect(badHazard.skip_reason).toMatch(/not one of the eight modelled classes/);
    const noSeverity = assessRow(row({ severity_score: undefined }), { policy, now: NOW });
    expect(noSeverity.skip_reason).toMatch(/no severity_score/);
  });
});

describe('batch assessment', () => {
  const rows = [
    row({ district_id: 1, district_name: 'Dhaka', confidence: 0.9, severity_score: 0.9,
      model_severity: 0.9, physics_severity: 0.9 }),
    row({ district_id: 2, district_name: 'Khulna', severity_score: 0.2, confidence: 0.1,
      model_severity: 0.2, physics_severity: 0.2 }),
    row({ district_id: 3, district_name: 'Sylhet', hazard_type: 'Flash Flood',
      severity_score: 1.0, confidence: 1.0, model_severity: 1.0, physics_severity: 0.2 }),
    row({ district_id: 4, district_name: 'Bogura', hazard_type: 'Locust Swarm' }),
  ];

  test('counts by level, skips the unjudgeable, and sorts highest first', () => {
    const batch = assessBatch(rows, { policy, now: NOW });
    expect(batch.rows_total).toBe(4);
    expect(batch.assessed).toBe(3);
    expect(batch.counts.skipped).toBe(1);
    expect(batch.counts.WATCH).toBe(2);
    expect(batch.counts.NO_ALERT).toBe(1);
    expect(batch.counts.SEVERE).toBe(0);
    expect(batch.alerts[0].district_name).toBe('Sylhet');
    expect(batch.alerts.map((a) => a.district_name)).toEqual(['Sylhet', 'Dhaka', 'Khulna']);
  });

  test('flags a saturated severity distribution instead of quietly warning everyone', () => {
    const batch = assessBatch(rows, { policy, now: NOW });
    expect(batch.saturation.severity_at_max).toBe(1);
    expect(batch.saturation.uncalibrated_scores).toBe(3);
    expect(batch.saturation.note).toMatch(/degenerate/);
  });

  test('an all-calm batch carries no saturation note', () => {
    const calm = assessBatch([row({ severity_score: 0.1, confidence: 0.05,
      model_severity: 0.1, physics_severity: 0.1 })], { policy, now: NOW });
    expect(calm.saturation.note).toBeNull();
    expect(calm.counts.NO_ALERT).toBe(1);
  });
});
