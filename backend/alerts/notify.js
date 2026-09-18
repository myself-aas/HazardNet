/**
 * Alert fan-out (Phase 4 scope: "SMS/Telegram").
 *
 * Turns one published alert into per-subscriber messages, dispatching through the
 * transports in `./channels/`. The rules that matter:
 *
 *   - **Only published alerts are dispatched.** `notifyAlert` refuses an
 *     assessment that is not in state PUBLISHED — a WARNING that is still waiting
 *     for a duty officer must not leak to subscribers by calling the wrong helper.
 *   - **A subscriber list is data, not a hard-coded channel.** Subscribers live in
 *     the `alertSubscriptions` Firestore collection (channel, destination,
 *     district, hazards, minimum level, language). No list, no messages — which is
 *     exactly the state of a fresh deployment, and it reports as such.
 *   - **Partial failure is normal.** One bad number must not stop the other 40, so
 *     every send is individually caught and reported by masked destination.
 *   - **Budget.** SMS is metered by the gateway; `SMS_MAX_PER_RUN` caps how many
 *     are attempted per run and the overflow is counted (`over_budget`), not
 *     silently dropped.
 */

import { db, collection, getDocs, query, where } from '../db.js';
import { levelRank } from './policy.js';
import { buildDigest, LG } from './digest.js';
import { sendSms, getSmsConfig, describeSmsTransport } from './channels/sms.js';
import { sendTelegramMessage, getTelegramConfig } from './channels/telegram.js';

export const SUBSCRIPTION_COLLECTION = 'alertSubscriptions';

const maskNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 5) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
};

const maskDestination = (subscriber) => (subscriber.channel === 'sms'
  ? maskNumber(subscriber.destination)
  : subscriber.destination
    ? `chat:${String(subscriber.destination).slice(0, 4)}…`
    : 'default-chat');

/** Normalise one subscription document; invalid entries are dropped by the caller. */
export function normalizeSubscriber(raw = {}) {
  const channel = String(raw.channel || '').toLowerCase();
  if (channel !== 'sms' && channel !== 'telegram') return { valid: false, reason: 'channel must be sms or telegram' };
  if (channel === 'sms' && !raw.destination) return { valid: false, reason: 'sms subscriber without a destination number' };
  const hazards = Array.isArray(raw.hazards)
    ? raw.hazards.filter(Boolean)
    : String(raw.hazards || '').split(',').map((h) => h.trim()).filter(Boolean);
  return {
    valid: true,
    id: raw.id || raw.uid || null,
    channel,
    destination: raw.destination ? String(raw.destination) : null,
    district_id: raw.district_id ?? raw.districtId ?? null,
    district_name: raw.district_name || raw.districtName || null,
    pcode: raw.pcode || raw.adm2_pcode || null,
    all_districts: raw.all_districts === true || raw.district_id === '*',
    hazards,
    min_level: String(raw.min_level || raw.minLevel || 'WATCH').toUpperCase(),
    language: String(raw.language || 'en').toLowerCase().startsWith('bn') ? LG.BN : LG.EN,
    active: raw.active !== false,
  };
}

/** Does this subscriber want this alert? District AND hazard AND minimum level. */
export function subscriberMatches(subscriber, alert) {
  if (!subscriber.active) return false;
  if (levelRank(alert.level) < levelRank(subscriber.min_level || 'WATCH')) return false;
  if (subscriber.hazards.length > 0 && !subscriber.hazards.includes(alert.hazard_type)) return false;
  if (subscriber.all_districts) return true;
  const sameId = subscriber.district_id !== null && subscriber.district_id !== undefined
    && String(subscriber.district_id) === String(alert.district_id);
  const samePcode = subscriber.pcode && alert.pcode
    && String(subscriber.pcode) === String(alert.pcode);
  const sameName = subscriber.district_name && alert.district_name
    && subscriber.district_name.toLowerCase() === String(alert.district_name).toLowerCase();
  return Boolean(sameId || samePcode || sameName);
}

/** Load active subscriptions. A store failure is reported, not thrown. */
export async function loadSubscribers({ subscribers } = {}) {
  if (Array.isArray(subscribers)) {
    return { ok: true, subscribers: subscribers.map(normalizeSubscriber).filter((s) => s.valid) };
  }
  try {
    const snap = await getDocs(query(collection(db, SUBSCRIPTION_COLLECTION), where('active', '==', true)));
    const raw = [];
    snap.forEach((document) => raw.push({ id: document.id, ...document.data() }));
    const normalised = raw.map(normalizeSubscriber);
    return {
      ok: true,
      subscribers: normalised.filter((s) => s.valid),
      invalid: normalised.filter((s) => !s.valid).map((s) => s.reason),
    };
  } catch (error) {
    return {
      ok: false,
      subscribers: [],
      error: `could not read ${SUBSCRIPTION_COLLECTION}: ${error.message}`,
    };
  }
}

/**
 * Dispatch one published alert to its subscribers.
 *
 * @returns {{considered:number, matched:number, sent:number, failed:number,
 *            degraded:number, over_budget:number, transports:object, results:Array}}
 */
export async function notifyAlert(alert = {}, {
  subscribers, fetchImpl = fetch, env = process.env, now = new Date(),
  smsConfig = getSmsConfig(env), telegramConfig = getTelegramConfig(env),
} = {}) {
  const summary = {
    kind: 'alert_notification/1.0.0',
    alert_id: alert.id || null,
    level: alert.level || null,
    at: now.toISOString(),
    considered: 0,
    matched: 0,
    sent: 0,
    failed: 0,
    degraded: 0,
    over_budget: 0,
    transports: {
      sms: describeSmsTransport(smsConfig),
      telegram: { channel: 'telegram', configured: telegramConfig.configured },
    },
    results: [],
  };

  if (!alert || alert.state !== 'PUBLISHED') {
    return { ...summary, error: 'refusing to notify: alert is not PUBLISHED (§1.6)' };
  }

  const list = await loadSubscribers({ subscribers });
  if (!list.ok) return { ...summary, error: list.error };
  summary.considered = list.subscribers.length;
  if (Array.isArray(list.invalid) && list.invalid.length > 0) summary.invalid = list.invalid;

  const targets = list.subscribers.filter((subscriber) => subscriberMatches(subscriber, alert));
  summary.matched = targets.length;

  let smsAttempts = 0;
  for (const subscriber of targets) {
    const digest = buildDigest(alert, { channel: subscriber.channel, language: subscriber.language });
    let result;
    if (subscriber.channel === 'sms') {
      if (smsAttempts >= smsConfig.maxPerRun) {
        summary.over_budget += 1;
        summary.results.push({
          subscriber_id: subscriber.id,
          channel: 'sms',
          destination: maskDestination(subscriber),
          language: subscriber.language,
          sent: false,
          over_budget: true,
          error: `SMS budget exhausted (SMS_MAX_PER_RUN=${smsConfig.maxPerRun})`,
        });
        continue;
      }
      smsAttempts += 1;
      result = await sendSms({
        to: subscriber.destination, text: digest.text, config: smsConfig, fetchImpl,
      });
    } else {
      result = await sendTelegramMessage({
        text: digest.text, chatId: subscriber.destination, config: telegramConfig, fetchImpl,
      });
    }
    const entry = {
      subscriber_id: subscriber.id,
      channel: subscriber.channel,
      destination: maskDestination(subscriber),
      language: subscriber.language,
      level: alert.level,
      hazard_type: alert.hazard_type,
      digest_version: 'alert-digest/1.0.0',
      characters: digest.text_length,
      sms_segments: digest.sms_segments,
      sent: result.sent === true,
      ok: result.ok === true,
      degraded: result.degraded === true,
      dry_run: result.dry_run === true,
      ...(result.error ? { error: result.error } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    };
    if (entry.ok && !entry.degraded && !entry.dry_run) summary.sent += 1;
    else if (entry.degraded) summary.degraded += 1;
    else if (!entry.ok) summary.failed += 1;
    summary.results.push(entry);
  }

  return summary;
}
