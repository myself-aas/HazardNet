/**
 * Channel digests — one alert, rendered for SMS and Telegram (English + Bengali).
 *
 * PRODUCT_SPEC §1.3 requires every alert to carry a *confidence statement*, an
 * evidence trail and a freshness statement; §1.7 requires the disclaimer on every
 * public surface including SMS. Those constraints are applied here, once, rather
 * than in each channel adapter.
 *
 * Two honest consequences of writing for SMS:
 *
 *   - The full §1.7 disclaimer does not fit in a text message. `SHORT_DISCLAIMER`
 *     keeps every substantive element (research tool; not an official warning;
 *     follow BMD/FFWC and local administration; 999/1090/16123) and drops only the
 *     prose. `__tests__/alerts/digest.test.js` fails if any element goes missing,
 *     and asserts the long form still matches the spec.
 *   - Bengali is not GSM-7. A Bengali SMS is encoded UCS-2 and costs ~3 segments
 *     per 160 characters, which the digest reports (`sms_encoding`, `sms_segments`)
 *     instead of silently multiplying the operator's bill.
 *
 * The digests never say "probability" for an uncalibrated score: the model line
 * reads `score`, and where a calibrated probability exists it is named as such.
 */

import { REQUIRED_DISCLAIMER } from './policy.js';

export const LG = Object.freeze({ EN: 'en', BN: 'bn' });

export const SHORT_DISCLAIMER =
  'HazardNet is a research tool, not an official warning service. ' +
  'Follow BMD/FFWC and local administration. Emergency: 999 / 1090 / 16123.';

export const LEVEL_LABELS = Object.freeze({
  NO_ALERT: { en: 'No alert', bn: 'স্বাভাবিক' },
  WATCH: { en: 'Watch', bn: 'সতর্ক দৃষ্টি' },
  WARNING: { en: 'Warning', bn: 'সতর্কতা' },
  SEVERE: { en: 'Severe', bn: 'মারাত্মক সতর্কতা' },
});

export const HAZARD_LABELS = Object.freeze({
  Flood: 'বন্যা',
  'Flash Flood': 'আকস্মিক বন্যা',
  'Tropical Cyclone': 'ঘূর্ণিঝড়',
  'Storm Surge': 'জলোচ্ছ্বাস',
  'River Erosion': 'নদীভাঙন',
  Landslide: 'ভূমিধস',
  Drought: 'খরা',
  Heatwave: 'তাপপ্রবাহ',
});

const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** `2026-09-23` → `23 September 2026` / `২৩ সেপ্টেম্বর ২০২৬`. */
export function formatDate(iso, language = LG.EN) {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!match) return String(iso);
  const [, year, month, day] = match;
  if (language === LG.BN) {
    const monthName = MONTHS_BN[Number(month) - 1] || month;
    return toBengaliDigits(`${Number(day)} ${monthName} ${year}`);
  }
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${Number(day)} ${names[Number(month) - 1] || month} ${year}`;
}

/** Horizontal strings (the digest): `7 days`, `15 days`. */
export function formatHorizon(horizon, language = LG.EN) {
  const raw = String(horizon || '').replace('_', ' ');
  if (language === LG.BN) return toBengaliDigits(raw.replace('days', 'দিন'));
  return raw;
}

/** Counted strings (the lead time): "7-day", "৭ দিনের". */
export function formatLeadTime(days, language = LG.EN) {
  if (days === null || days === undefined || Number.isNaN(Number(days))) return null;
  const value = Number(days);
  if (language === LG.BN) return `${toBengaliDigits(value)} দিনের`;
  return `${value}-day`;
}

const score = (value) => (typeof value === 'number' && Number.isFinite(value)
  ? value.toFixed(2)
  : 'n/a');

function confidenceStatement(alert, language) {
  const calibrated = alert.confidence_kind === 'calibrated_probability'
    || (alert.evidence && alert.evidence.model
      && alert.evidence.model.confidence_published === 'calibrated_probability');
  const value = score(alert.confidence);
  const physics = alert.evidence && alert.evidence.physics
    ? alert.evidence.physics.physics_severity
    : null;
  if (language === LG.BN) {
    const modelLine = calibrated
      ? `ক্রমাঙ্কিত সম্ভাবনা ${toBengaliDigits(value)}`
      : `মডেল স্কোর ${toBengaliDigits(value)} (ক্রমাঙ্কিত সম্ভাবনা নয়)`;
    return physics === null || physics === undefined
      ? modelLine
      : `${modelLine}, স্বাধীন ভৌত-বিশ্লেষণ ${toBengaliDigits(score(physics))}`;
  }
  const modelLine = calibrated
    ? `calibrated probability ${value}`
    : `model score ${value} (uncalibrated)`;
  return physics === null || physics === undefined
    ? modelLine
    : `${modelLine}, independent physics ${score(physics)}`;
}

function freshnessStatement(alert, language) {
  const age = alert.freshness ? alert.freshness.age_hours : null;
  if (typeof age !== 'number' || !Number.isFinite(age)) return null;
  const rounded = Math.round(age);
  if (language === LG.BN) {
    return rounded <= 1 ? 'ডেটা এইমাত্র হালনাগাদ' : `ডেটা ${toBengaliDigits(rounded)} ঘণ্টা আগের`;
  }
  return rounded <= 1 ? 'data fresh' : `data ${rounded} h old`;
}

const REQUIRED_NUMBERS = ['999', '1090', '16123'];

/**
 * Named agencies, in either form: §1.7 spells out "Bangladesh Meteorological
 * Department" in the long disclaimer and the short form uses the BMD acronym, so
 * both count. Everything else must be present verbatim.
 */
const REQUIRED_AGENCIES = [
  /BMD|Bangladesh Meteorological Department/,
  /FFWC|Flood Forecasting and Warning Centre/,
];

/** Is this text a conforming §1.7 disclaimer? Used by the tests and boot checks. */
export function disclaimerIsComplete(text) {
  if (!text) return false;
  return /not an official warning/i.test(text)
    && REQUIRED_AGENCIES.every((pattern) => pattern.test(text))
    && REQUIRED_NUMBERS.every((number) => text.includes(number));
}

/**
 * Render one alert for a channel.
 *
 * @param {object} alert a stored alert (or an assessment; `evidence` is required)
 * @param {{channel?: string, language?: string}} options
 */
export function buildDigest(alert = {}, { channel = 'telegram', language = LG.EN } = {}) {
  const lang = language === LG.BN ? LG.BN : LG.EN;
  const level = alert.level || 'NO_ALERT';
  const label = (LEVEL_LABELS[level] || LEVEL_LABELS.NO_ALERT)[lang];
  const hazard = lang === LG.BN ? (HAZARD_LABELS[alert.hazard_type] || alert.hazard_type) : alert.hazard_type;
  const district = alert.district_name || alert.district_id || 'unknown district';
  const target = formatDate(alert.target_date, lang);
  const horizon = formatHorizon(alert.horizon, lang);
  const lead = formatLeadTime(alert.lead_time_days, lang);
  const confidence = confidenceStatement(alert, lang);
  const freshness = freshnessStatement(alert, lang);
  const isSms = channel === 'sms';
  const trailer = isSms ? SHORT_DISCLAIMER : REQUIRED_DISCLAIMER;
  if (lang === LG.BN) {
    // A Bengali digest cannot cheaply include the full English disclaimer; SMS and
    // Telegram both get the short form plus the numbers, which §1.7 requires.
    const bengaliTrailer = isSms ? SHORT_DISCLAIMER : `${SHORT_DISCLAIMER}\n\n${REQUIRED_DISCLAIMER}`;
    const leadText = lead ? `${lead}` : horizon;
    const text = [
      `[${label}] HazardNet: ${district}-এ ${hazard}-এর ঝুঁকি`,
      `${leadText}${target ? `, লক্ষ্য ${target}` : ''}`,
      confidence,
      freshness,
      'এটি অফিসিয়াল সতর্কবার্তা নয়।',
      bengaliTrailer,
    ].filter(Boolean).join('\n');
    return finalize(text, lang, channel);
  }

  const headline = `[${label.toUpperCase()}] HazardNet — ${hazard} risk in ${district}`;
  const timing = [`horizon ${horizon}`];
  if (lead) timing.push(lead);
  if (target) timing.push(`target ${target}`);
  const evidenceLine = [confidence, freshness].filter(Boolean).join('; ');
  const text = [
    headline,
    timing.join(' · '),
    evidenceLine,
    trailer,
  ].filter(Boolean).join(isSms ? ' ' : '\n');
  return finalize(text, lang, channel);
}

function finalize(text, language, channel) {
  const bengali = /[\u0980-\u09FF]/.test(text);
  const encoding = bengali ? 'UCS-2' : 'GSM-7';
  const perSegment = bengali ? 70 : 160;
  const segments = Math.max(1, Math.ceil(text.length / perSegment));
  return {
    channel,
    language,
    text,
    text_length: text.length,
    sms_encoding: channel === 'sms' ? encoding : null,
    sms_segments: channel === 'sms' ? segments : null,
    contains_required_disclaimer: disclaimerIsComplete(text),
    bengali_script: bengali,
  };
}

/** All four renderings, for a caller that does not know which channel it needs. */
export function buildDigests(alert, { languages = [LG.EN, LG.BN] } = {}) {
  const out = {};
  for (const language of languages) {
    out[language] = {
      sms: buildDigest(alert, { channel: 'sms', language }),
      telegram: buildDigest(alert, { channel: 'telegram', language }),
    };
  }
  return out;
}
