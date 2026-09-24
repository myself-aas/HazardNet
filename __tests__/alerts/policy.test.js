/**
 * @jest-environment node
 *
 * Alert policy (PRODUCT_SPEC §1.3/§1.6/§1.7) — the thresholds and, more
 * importantly, the two properties the rest of the engine relies on:
 * the auto-publish ceiling is WATCH, and WARNING cannot be reached without a
 * calibrated probability unless a deployment explicitly overrides it.
 */
import fs from 'fs';
import path from 'path';
import {
  ALERT_LEVELS, POLICY_DEFAULTS, POLICY_VERSION, REQUIRED_DISCLAIMER, describePolicy,
  getPolicy, levelRank, maxLevel,
} from '../../backend/alerts/policy.js';


describe('policy defaults', () => {
  test('the auto-publish ceiling is WATCH (nothing above it may be auto-published)', () => {
    expect(POLICY_DEFAULTS.max_auto_publish_level).toBe('WATCH');
    expect(getPolicy({}).max_auto_publish_level).toBe('WATCH');
  });

  test('WARNING requires a calibrated probability by default', () => {
    expect(POLICY_DEFAULTS.calibrated_probability_required_for_warning).toBe(true);
  });

  test('the divergence threshold matches §1.3 (0.30)', () => {
    expect(POLICY_DEFAULTS.divergence_watch).toBe(0.3);
  });

  test('the freshness SLO matches the data contract (48 h)', () => {
    expect(POLICY_DEFAULTS.max_prediction_age_hours).toBe(48);
  });

  test('levels are ordered as §1.3 lists them', () => {
    expect(ALERT_LEVELS).toEqual(['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE']);
    expect(levelRank('NO_ALERT')).toBeLessThan(levelRank('WATCH'));
    expect(levelRank('WATCH')).toBeLessThan(levelRank('WARNING'));
    expect(levelRank('WARNING')).toBeLessThan(levelRank('SEVERE'));
    expect(maxLevel('WATCH', 'SEVERE')).toBe('SEVERE');
    expect(maxLevel('NO_ALERT', 'WATCH')).toBe('WATCH');
  });
});

describe('disclaimer', () => {
  test('carries the required disclaimer', () => {
    expect(REQUIRED_DISCLAIMER.replace(/\s+/g, ' ')).toContain('not an official warning service');
  });

  test('is returned by describePolicy so every consumer can attach it', () => {
    expect(describePolicy(getPolicy({})).disclaimer).toBe(REQUIRED_DISCLAIMER);
  });
});

describe('environment overrides', () => {
  test('a valid override is applied and recorded', () => {
    const policy = getPolicy({ ALERT_WATCH_SEVERITY: '0.9' });
    expect(policy.watch_severity).toBe(0.9);
    expect(policy.source).toBe('environment');
    expect(policy.overridden).toContainEqual({
      key: 'watch_severity', env: 'ALERT_WATCH_SEVERITY', value: 0.9,
    });
  });

  test('an out-of-range value is ignored, not applied as NaN', () => {
    const policy = getPolicy({ ALERT_WATCH_SEVERITY: '17' });
    expect(policy.watch_severity).toBe(POLICY_DEFAULTS.watch_severity);
    expect(policy.ignored).toContainEqual({
      key: 'watch_severity', env: 'ALERT_WATCH_SEVERITY', value: '17',
    });
  });

  test('the calibration requirement can only be lifted explicitly', () => {
    expect(getPolicy({}).calibrated_probability_required_for_warning).toBe(true);
    expect(getPolicy({ ALERT_ALLOW_UNCALIBRATED_WARNING: 'true' })
      .calibrated_probability_required_for_warning).toBe(false);
    expect(getPolicy({ ALERT_ALLOW_UNCALIBRATED_WARNING: '0' })
      .calibrated_probability_required_for_warning).toBe(true);
  });

  test('an inverted threshold pair is reported rather than silently reordered', () => {
    const policy = getPolicy({ ALERT_WATCH_PROBABILITY: '0.9', ALERT_WARNING_PROBABILITY: '0.5' });
    expect(policy.watch_probability).toBe(0.9);
    expect(policy.warning_probability).toBe(0.5);
    expect(policy.warnings[0]).toMatch(/WARNING is unreachable/);
  });

  test('describePolicy states the calibration caveat and the HITL rule', () => {
    const described = describePolicy(getPolicy({}));
    expect(described.version).toBe(POLICY_VERSION);
    expect(described.human_in_the_loop.max_auto_publish_level).toBe('WATCH');
    expect(described.human_in_the_loop.requires_named_reviewer_above).toBe('WATCH');
    expect(described.calibration.calibrated_probability_required_for_warning).toBe(true);
    expect(described.calibration.note).toMatch(/model_softmax_top_class/);
    expect(described.calibration.note).toMatch(/No calibration accuracy is claimed/);
  });
});
