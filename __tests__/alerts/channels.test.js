/**
 * @jest-environment node
 *
 * Transports. The property under test is honesty about delivery: an unconfigured
 * deployment reports `degraded`, a dry run reports `sent: false`, a failed gateway
 * reports the failure, credentials never appear in a returned URL, and an SMS
 * without the §1.7 disclaimer is refused before any request is built.
 */
import {
  SMS_PROVIDERS, buildSmsRequest, describeSmsTransport, getSmsConfig, redactSmsUrl, sendSms,
} from '../../backend/alerts/channels/sms.js';
import {
  buildTelegramRequest, getTelegramConfig, redactTelegramUrl, sendTelegramMessage,
} from '../../backend/alerts/channels/telegram.js';
import { REQUIRED_DISCLAIMER } from '../../backend/alerts/policy.js';

const MESSAGE = `[WATCH] HazardNet — Flood risk in Dhaka\n${REQUIRED_DISCLAIMER}`;

const okFetch = (body = { ok: true, result: { message_id: 42 } }, status = 200) =>
  jest.fn(async () => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }));

describe('telegram transport', () => {
  test('is unconfigured without both credentials', () => {
    const config = getTelegramConfig({});
    expect(config.configured).toBe(false);
    expect(getTelegramConfig({ TELEGRAM_BOT_TOKEN: 'x' }).configured).toBe(false);
    expect(getTelegramConfig({ TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_ALERT_CHAT_ID: '1' }).configured)
      .toBe(true);
  });

  test('reports "not sent" when unconfigured instead of pretending', async () => {
    const result = await sendTelegramMessage({ text: MESSAGE, config: getTelegramConfig({}) });
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.reason).toMatch(/TELEGRAM_BOT_TOKEN/);
  });

  test('posts to the configured chat and asserts the token is redacted', async () => {
    const config = getTelegramConfig({
      TELEGRAM_BOT_TOKEN: 'secret-token', TELEGRAM_ALERT_CHAT_ID: '-100123', TELEGRAM_API_BASE: 'http://local.test',
    });
    const request = buildTelegramRequest({ text: MESSAGE, config });
    expect(request.url).toBe('http://local.test/botsecret-token/sendMessage');
    expect(request.redacted_url).toBe('http://local.test/bot<redacted>/sendMessage');
    expect(redactTelegramUrl(request.url)).not.toContain('secret-token');
    expect(JSON.parse(request.body)).toMatchObject({
      chat_id: '-100123', text: MESSAGE, disable_web_page_preview: true,
    });
  });

  test('a 200 with ok:true is a delivery; a 4xx is not', async () => {
    const config = getTelegramConfig({
      TELEGRAM_BOT_TOKEN: 't', TELEGRAM_ALERT_CHAT_ID: '1', TELEGRAM_API_BASE: 'http://local.test',
    });
    const sent = await sendTelegramMessage({ text: MESSAGE, config, fetchImpl: okFetch() });
    expect(sent.ok).toBe(true);
    expect(sent.message_id).toBe(42);

    const failed = await sendTelegramMessage({
      text: MESSAGE, config,
      fetchImpl: okFetch({ ok: false, description: 'chat not found' }, 400),
    });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe('chat not found');
  });

  test('a thrown error (DNS, timeout) is returned, never rethrown', async () => {
    const config = getTelegramConfig({
      TELEGRAM_BOT_TOKEN: 't', TELEGRAM_ALERT_CHAT_ID: '1', TELEGRAM_API_BASE: 'http://local.test',
    });
    const boom = jest.fn(async () => { throw new Error('ECONNREFUSED'); });
    const result = await sendTelegramMessage({ text: MESSAGE, config, fetchImpl: boom });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });
});

describe('sms transport', () => {
  const base = { SMS_SENDER_ID: 'HazardNet', SMS_DRY_RUN: 'true' };

  test('provider selection follows the env, and defaults to none', () => {
    expect(getSmsConfig({}).provider).toBe('none');
    expect(getSmsConfig({ SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'k' }).provider)
      .toBe('bulksmsbd');
    expect(getSmsConfig({ BULKSMSBD_API_KEY: 'k' }).provider).toBe('bulksmsbd');
    expect(getSmsConfig({ GREENWEB_API_KEY: 'k' }).provider).toBe('greenweb');
    expect(getSmsConfig({ SMS_PROVIDER: 'twilio' }).provider).toBe('none');
    expect(SMS_PROVIDERS).toContain('none');
  });

  test('reports "not sent" when no provider is configured', async () => {
    const result = await sendSms({ to: '8801700000000', text: MESSAGE, config: getSmsConfig({}) });
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/no SMS provider configured/);
  });

  test('refuses text without the §1.7 disclaimer (before any request exists)', async () => {
    const config = getSmsConfig({ ...base, SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'k' });
    const result = await sendSms({ to: '8801700000000', text: 'Flood risk in Dhaka', config });
    expect(result.ok).toBe(false);
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/§1.7 disclaimer/);
  });

  test('a dry run previews the request and reports sent: false', async () => {
    const config = getSmsConfig({ ...base, SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'k' });
    const fetchImpl = okFetch();
    const result = await sendSms({ to: '8801700000000', text: MESSAGE, config, fetchImpl });
    expect(result.dry_run).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.to_masked).toBe('880****00');
    expect(result.request_preview.url).toContain('/sms/api');
    expect(result.request_preview.url).not.toContain('k');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('builds each provider request with the credential kept out of the redaction-safe URL', () => {
    const bulk = buildSmsRequest({
      to: '8801700000000', text: MESSAGE,
      config: getSmsConfig({ ...base, SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'secret-key' }),
    });
    expect(bulk.method).toBe('GET');
    expect(bulk.url).toContain('api_key=secret-key');
    expect(bulk.redacted_url).not.toContain('secret-key');
    expect(bulk.redacted_url).toContain('api_key=<redacted>');
    expect(bulk.url).toContain(`message=${encodeURIComponent(MESSAGE)}`);

    const greenweb = buildSmsRequest({
      to: '8801700000000', text: MESSAGE,
      config: getSmsConfig({ ...base, SMS_PROVIDER: 'greenweb', GREENWEB_API_KEY: 'gw-token' }),
    });
    expect(greenweb.method).toBe('POST');
    expect(greenweb.body).toContain('token=gw-token');
    expect(greenweb.body_preview).not.toContain('gw-token');
    expect(greenweb.body_preview).toContain('to=880****00');
  });

  test('redacts every credential shape from a URL', () => {
    const config = getSmsConfig({ SMS_PROVIDER: 'greenweb', GREENWEB_API_KEY: 'gw-token' });
    expect(redactSmsUrl('https://x/y?token=gw-token&z=1', config)).toBe('https://x/y?token=<redacted>&z=1');
  });

  test('a real send is verified against the gateway response', async () => {
    const config = getSmsConfig({ ...base, SMS_DRY_RUN: 'false', SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'k' });
    const success = await sendSms({
      to: '8801700000000', text: MESSAGE, config,
      fetchImpl: okFetch({ response_code: 202, success_message: 'SMS Submitted Successfully' }),
    });
    expect(success.sent).toBe(true);
    expect(success.ok).toBe(true);

    const rejected = await sendSms({
      to: '8801700000000', text: MESSAGE, config,
      fetchImpl: okFetch({ response_code: 1032, error_message: 'Invalid number' }),
    });
    expect(rejected.sent).toBe(false);
    expect(rejected.error).toMatch(/provider code 1032/);

    const bare = await sendSms({
      to: '8801700000000', text: MESSAGE, config, fetchImpl: okFetch('202'),
    });
    expect(bare.sent).toBe(true);

    const httpError = await sendSms({
      to: '8801700000000', text: MESSAGE, config,
      fetchImpl: okFetch('Internal Error', 500),
    });
    expect(httpError.sent).toBe(false);
    expect(httpError.error).toMatch(/HTTP 500/);
  });

  test('a network failure is a failed send, not an exception', async () => {
    const config = getSmsConfig({ ...base, SMS_DRY_RUN: 'false', SMS_PROVIDER: 'greenweb', GREENWEB_API_KEY: 'k' });
    const boom = jest.fn(async () => { throw new Error('EAI_AGAIN'); });
    const result = await sendSms({ to: '8801700000000', text: MESSAGE, config, fetchImpl: boom });
    expect(result.sent).toBe(false);
    expect(result.error).toBe('EAI_AGAIN');
  });

  test('describeSmsTransport never leaks a credential', () => {
    const described = describeSmsTransport(getSmsConfig({
      SMS_PROVIDER: 'bulksmsbd', BULKSMSBD_API_KEY: 'super-secret',
    }));
    expect(JSON.stringify(described)).not.toContain('super-secret');
    expect(described).toMatchObject({ configured: true, provider: 'bulksmsbd', dry_run: false });
  });
});
