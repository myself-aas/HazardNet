/**
 * @jest-environment node
 *
 * Channel digests: the §1.3 alert content (level, hazard, lead time, confidence
 * statement, freshness) and the §1.7 disclaimer, in English and Bengali, at SMS
 * length. The disclaimer tests are the important ones — §1.7 names SMS explicitly,
 * and an SMS cannot carry the full paragraph, so the short form is checked to keep
 * every substantive element.
 */
import {
  HAZARD_LABELS, LEVEL_LABELS, SHORT_DISCLAIMER, buildDigest, buildDigests,
  disclaimerIsComplete, formatDate, formatHorizon, formatLeadTime, toBengaliDigits,
} from '../../backend/alerts/digest.js';
import { REQUIRED_DISCLAIMER } from '../../backend/alerts/policy.js';

const WATCH_ALERT = {
  id: '2026-09-23__7_days__19__flood',
  state: 'PUBLISHED',
  level: 'WATCH',
  district_id: 19,
  district_name: 'Dhaka',
  hazard_type: 'Flood',
  horizon: '7_days',
  target_date: '2026-09-23',
  lead_time_days: 7,
  severity_score: 0.94,
  confidence: 0.55,
  confidence_kind: 'model_softmax_top_class',
  evidence: { physics: { physics_severity: 0.42, divergence: 0.13 } },
  freshness: { age_hours: 12.4 },
};

const CALIBRATED_ALERT = {
  ...WATCH_ALERT,
  confidence: 0.71,
  confidence_kind: 'calibrated_probability',
  evidence: { physics: { physics_severity: 0.7, divergence: 0.01 } },
};

describe('formatting helpers', () => {
  test('dates and horizons render for both languages', () => {
    expect(formatDate('2026-09-23')).toBe('23 September 2026');
    expect(formatDate('2026-09-23', 'bn')).toBe('২৩ সেপ্টেম্বর ২০২৬');
    expect(formatDate('nonsense')).toBe('nonsense');
    expect(formatDate(null)).toBeNull();
    expect(formatHorizon('7_days')).toBe('7 days');
    expect(formatHorizon('15_days', 'bn')).toBe('১৫ দিন');
    expect(formatLeadTime(7)).toBe('7-day');
    expect(formatLeadTime(15, 'bn')).toBe('১৫ দিনের');
    expect(formatLeadTime(null)).toBeNull();
    expect(toBengaliDigits('999')).toBe('৯৯৯');
  });

  test('every modelled hazard has a Bengali label', () => {
    const hazards = ['Flood', 'Flash Flood', 'Tropical Cyclone', 'Storm Surge', 'River Erosion',
      'Landslide', 'Drought', 'Heatwave'];
    for (const hazard of hazards) expect(HAZARD_LABELS[hazard]).toBeTruthy();
    expect(Object.values(LEVEL_LABELS)).toHaveLength(4);
  });
});

describe('English digest', () => {
  test('carries the level, hazard, district, timing, evidence and disclaimer', () => {
    const digest = buildDigest(WATCH_ALERT, { channel: 'telegram', language: 'en' });
    expect(digest.text).toContain('[WATCH] HazardNet — Flood risk in Dhaka');
    expect(digest.text).toContain('horizon 7 days');
    expect(digest.text).toContain('7-day');
    expect(digest.text).toContain('target 23 September 2026');
    expect(digest.text).toContain('model score 0.55 (uncalibrated)');
    expect(digest.text).toContain('independent physics 0.42');
    expect(digest.text).toContain('data 12 h old');
    expect(digest.text).toContain(REQUIRED_DISCLAIMER);
    expect(digest.contains_required_disclaimer).toBe(true);
    expect(digest.bengali_script).toBe(false);
  });

  test('never calls an uncalibrated score a probability', () => {
    const digest = buildDigest(WATCH_ALERT, { channel: 'telegram', language: 'en' });
    expect(digest.text).not.toMatch(/probability/);
    const calibrated = buildDigest(CALIBRATED_ALERT, { channel: 'telegram', language: 'en' });
    expect(calibrated.text).toContain('calibrated probability 0.71');
  });

  test('a missing physics track says so instead of inventing agreement', () => {
    const digest = buildDigest({ ...WATCH_ALERT, evidence: {} }, { channel: 'telegram' });
    expect(digest.text).not.toContain('independent physics');
    expect(digest.text).toContain('model score 0.55 (uncalibrated)');
  });

  test('a missing freshness age drops the line rather than printing NaN', () => {
    const digest = buildDigest({ ...WATCH_ALERT, freshness: {} }, { channel: 'telegram' });
    expect(digest.text).not.toMatch(/NaN/);
    expect(digest.text).not.toMatch(/data .* h old/);
  });
});

describe('Bengali digest', () => {
  test('renders level, hazard and date in Bengali with the disclaimer', () => {
    const digest = buildDigest(WATCH_ALERT, { channel: 'telegram', language: 'bn' });
    expect(digest.text).toContain('সতর্ক দৃষ্টি');
    expect(digest.text).toContain('বন্যা');
    expect(digest.text).toContain('২৩ সেপ্টেম্বর ২০২৬');
    expect(digest.text).toContain('৭ দিনের');
    expect(digest.text).toContain('মডেল স্কোর ০.৫৫');
    expect(digest.text).toContain('ক্রমাঙ্কিত সম্ভাবনা নয়');
    expect(digest.contains_required_disclaimer).toBe(true);
    expect(digest.bengali_script).toBe(true);
  });

  test('an unknown hazard falls back to its English name', () => {
    const digest = buildDigest({ ...WATCH_ALERT, hazard_type: 'Locust Swarm' },
      { channel: 'telegram', language: 'bn' });
    expect(digest.text).toContain('Locust Swarm');
  });
});

describe('SMS constraints', () => {
  test('the SMS digest carries a conforming short disclaimer', () => {
    const digest = buildDigest(WATCH_ALERT, { channel: 'sms', language: 'en' });
    expect(digest.text).toContain(SHORT_DISCLAIMER);
    expect(digest.contains_required_disclaimer).toBe(true);
    expect(digest.sms_encoding).toBe('GSM-7');
    expect(digest.sms_segments).toBeGreaterThanOrEqual(1);
  });

  test('the short disclaimer keeps every §1.7 element', () => {
    expect(disclaimerIsComplete(SHORT_DISCLAIMER)).toBe(true);
    expect(disclaimerIsComplete('HazardNet alert')).toBe(false);
    for (const number of ['999', '1090', '16123']) {
      expect(disclaimerIsComplete(SHORT_DISCLAIMER.replace(number, '12345'))).toBe(false);
    }
    expect(disclaimerIsComplete(SHORT_DISCLAIMER.replace('BMD', 'some agency'))).toBe(false);
  });

  test('a Bengali SMS is reported as UCS-2 with its real segment count', () => {
    const digest = buildDigest(WATCH_ALERT, { channel: 'sms', language: 'bn' });
    expect(digest.sms_encoding).toBe('UCS-2');
    expect(digest.sms_segments).toBeGreaterThan(1);
    // 70 characters per UCS-2 segment — the operator's bill, made visible.
    expect(digest.sms_segments).toBe(Math.ceil(digest.text.length / 70));
  });

  test('buildDigests returns both channels in both languages', () => {
    const digests = buildDigests(WATCH_ALERT);
    expect(Object.keys(digests)).toEqual(['en', 'bn']);
    for (const language of ['en', 'bn']) {
      expect(digests[language].sms.contains_required_disclaimer).toBe(true);
      expect(digests[language].telegram.contains_required_disclaimer).toBe(true);
    }
  });
});
