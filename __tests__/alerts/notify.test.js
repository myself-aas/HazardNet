/**
 * @jest-environment node
 *
 * Fan-out. The two rules worth protecting: only PUBLISHED alerts are dispatched
 * (an unreviewed WARNING must not leak through the notification path), and a
 * subscriber list is the only thing that produces messages — no list, no sends,
 * reported as such.
 */
import { loadSubscribers, normalizeSubscriber, notifyAlert, subscriberMatches }
  from '../../backend/alerts/notify.js';
import { REQUIRED_DISCLAIMER } from '../../backend/alerts/policy.js';
import { getSmsConfig } from '../../backend/alerts/channels/sms.js';
import { getTelegramConfig } from '../../backend/alerts/channels/telegram.js';

const published = {
  id: 'alert-1',
  state: 'PUBLISHED',
  level: 'WATCH',
  district_id: 19,
  district_name: 'Dhaka',
  pcode: '3037',
  hazard_type: 'Flood',
  horizon: '7_days',
  target_date: '2026-09-23',
  lead_time_days: 7,
  confidence: 0.55,
  confidence_kind: 'model_softmax_top_class',
  evidence: { physics: { physics_severity: 0.4 } },
  freshness: { age_hours: 6 },
};

const subscribers = [
  { id: 's1', channel: 'sms', destination: '8801700000001', district_id: 19, language: 'en' },
  { id: 's2', channel: 'telegram', destination: '-100999', district_id: 19, language: 'bn' },
  { id: 's3', channel: 'sms', destination: '8801700000003', district_name: 'Kurigram' },
  { id: 's4', channel: 'sms', destination: '8801700000004', all_districts: true, hazards: ['Flash Flood'] },
  { id: 's5', channel: 'sms', destination: '8801700000005', all_districts: true, min_level: 'WARNING' },
  { id: 's6', channel: 'email', destination: 'someone@example.org' },
];

describe('subscriber normalisation and matching', () => {
  test('invalid entries are rejected with a reason, valid ones carry defaults', () => {
    expect(normalizeSubscriber({ channel: 'email' }).valid).toBe(false);
    expect(normalizeSubscriber({ channel: 'sms' }).reason).toMatch(/without a destination/);
    const ok = normalizeSubscriber({ id: 'x', channel: 'SMS', destination: '8801', hazards: 'Flood, Drought' });
    expect(ok).toMatchObject({ valid: true, channel: 'sms', min_level: 'WATCH', language: 'en' });
    expect(ok.hazards).toEqual(['Flood', 'Drought']);
    expect(normalizeSubscriber({ channel: 'telegram', language: 'bn-BD' }).language).toBe('bn');
  });

  test('district, hazard and level filters all apply', () => {
    const list = subscribers.map(normalizeSubscriber).filter((s) => s.valid);
    expect(subscriberMatches(list[0], published)).toBe(true);       // district id
    expect(subscriberMatches(list[2], published)).toBe(false);      // different name
    expect(subscriberMatches(list[3], published)).toBe(false);      // hazard filter
    expect(subscriberMatches(list[4], published)).toBe(false);      // level floor
    expect(subscriberMatches({ ...list[4], min_level: 'WATCH' }, published)).toBe(true);
    expect(subscriberMatches({ ...list[0], active: false }, published)).toBe(false);
    const byName = normalizeSubscriber({ channel: 'sms', destination: '8801', district_name: 'dhaka' });
    expect(subscriberMatches(byName, published)).toBe(true);
    const byPcode = normalizeSubscriber({ channel: 'sms', destination: '8801', pcode: '3037' });
    expect(subscriberMatches(byPcode, published)).toBe(true);
  });

  test('a hazard and district allow-list of all districts works for any district', () => {
    const anyDistrict = normalizeSubscriber({
      channel: 'sms', destination: '8801', district_id: '*', hazards: ['Flood'],
    });
    expect(anyDistrict.all_districts).toBe(true);
    expect(subscriberMatches(anyDistrict, published)).toBe(true);
  });

  test('an injected list wins and is normalised, invalid entries dropped', async () => {
    const loaded = await loadSubscribers({ subscribers });
    expect(loaded.ok).toBe(true);
    expect(loaded.subscribers).toHaveLength(5); // s6 (email) dropped
  });
});

describe('dispatch', () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 't', TELEGRAM_ALERT_CHAT_ID: '-100', TELEGRAM_API_BASE: 'http://local.test',
    SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'k', SMS_DRY_RUN: 'true',
  };
  const deps = {
    subscribers,
    env,
    smsConfig: getSmsConfig(env),
    telegramConfig: getTelegramConfig(env),
    fetchImpl: jest.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
      text: async () => JSON.stringify({ ok: true }),
    })),
  };

  test('refuses to notify anything that is not published (§1.6)', async () => {
    const summary = await notifyAlert({ ...published, state: 'PENDING_REVIEW' }, deps);
    expect(summary.error).toMatch(/not PUBLISHED/);
    expect(summary.sent).toBe(0);
  });

  test('matches the right subscribers and reports each channel honestly', async () => {
    const summary = await notifyAlert(published, deps);
    expect(summary.considered).toBe(5);
    expect(summary.matched).toBe(2);            // s1 (sms) + s2 (telegram)
    expect(summary.results).toHaveLength(2);
    const sms = summary.results.find((r) => r.channel === 'sms');
    const telegram = summary.results.find((r) => r.channel === 'telegram');
    expect(sms).toMatchObject({ subscriber_id: 's1', dry_run: true, sent: false, language: 'en' });
    expect(sms.destination).toBe('880****01');
    expect(telegram).toMatchObject({ subscriber_id: 's2', sent: true, ok: true, language: 'bn' });
    expect(telegram.sms_segments).toBeNull();
    expect(summary.sent).toBe(1);
    expect(summary.transports.telegram.configured).toBe(true);
    expect(summary.transports.sms.provider).toBe('bulksmsbd');
  });

  test('an unconfigured deployment reports degraded, not sent', async () => {
    const summary = await notifyAlert(published, {
      subscribers,
      env: {},
      smsConfig: getSmsConfig({}),
      telegramConfig: getTelegramConfig({}),
    });
    expect(summary.sent).toBe(0);
    expect(summary.degraded).toBe(2);
    for (const result of summary.results) {
      expect(result.degraded).toBe(true);
      expect(result.sent).toBe(false);
    }
  });

  test('the SMS budget caps attempts and counts the overflow', async () => {
    const many = Array.from({ length: 4 }, (_, index) => ({
      id: `s${index}`, channel: 'sms', destination: `88017000000${index}`, all_districts: true,
    }));
    const summary = await notifyAlert(published, {
      ...deps,
      subscribers: many,
      smsConfig: getSmsConfig({ ...env, SMS_MAX_PER_RUN: '2', SMS_DRY_RUN: 'false' }),
    });
    expect(summary.matched).toBe(4);
    expect(summary.over_budget).toBe(2);
    expect(summary.results.filter((r) => r.over_budget)).toHaveLength(2);
  });

  test('one failing subscriber does not stop the others', async () => {
    const flaky = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 9 } }),
        text: async () => '202',
      }));
    const summary = await notifyAlert(published, {
      ...deps,
      subscribers: subscribers.slice(0, 2),
      smsConfig: getSmsConfig({ ...env, SMS_DRY_RUN: 'false' }),
      fetchImpl: flaky,
    });
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(1);
    expect(summary.results.find((r) => r.error).error).toBe('ECONNRESET');
  });

  test('every dispatched message carries the disclaimer', async () => {
    const summary = await notifyAlert(published, deps);
    const telegramText = deps.fetchImpl.mock.calls[0][1].body;
    expect(JSON.parse(telegramText).text).toContain('not an official warning service');
    expect(JSON.parse(telegramText).text).toContain('999');
    expect(summary.results.every((r) => r.characters > 0)).toBe(true);
  });
});
