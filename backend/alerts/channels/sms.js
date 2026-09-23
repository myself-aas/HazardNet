/**
 * SMS transport (Phase 4 scope: "SMS/Telegram").
 *
 * Bangladesh gateway reality, encoded as configuration rather than hard-coded
 * vendor calls: a *provider* describes how to build the request, and the send path
 * is shared. Two providers are implemented — BulkSMSBD's `sms/api` GET endpoint
 * and GreenWeb's `api/send-sms` POST — plus `none`.
 *
 * The property that matters most here is the same one as Telegram, only stricter:
 * **an SMS is a paid, one-shot, public surface.** So:
 *
 *   - Unconfigured ⇒ `{ok: false, degraded: true, sent: false}`. The message is
 *     *not* sent, and the summary says so. There is no fabricated success and no
 *     dry-run that looks like a delivery.
 *   - `SMS_DRY_RUN=true` returns the exact request that *would* have been sent
 *     (`request_preview`) with `sent: false`, so a duty officer can check the
 *     wording and the segment count before anyone enables the gateway.
 *   - Credentials are redacted out of every returned or logged URL.
 *   - §1.7's disclaimer is already inside the text by construction (see digest.js);
 *     `sendSms` refuses to send text that does not carry it, so a future caller
 *     cannot bypass the requirement by rendering its own message.
 */

import { disclaimerIsComplete } from '../digest.js';

export const SMS_PROVIDERS = Object.freeze(['bulksmsbd', 'greenweb', 'none']);

export function getSmsConfig(env = process.env) {
  const explicit = String(env.SMS_PROVIDER || '').toLowerCase();
  let provider = SMS_PROVIDERS.includes(explicit) ? explicit : 'none';
  if (!explicit) {
    if (env.BULKSMSBD_API_KEY) provider = 'bulksmsbd';
    else if (env.GREENWEB_API_KEY) provider = 'greenweb';
  }
  const config = {
    channel: 'sms',
    provider,
    senderId: env.SMS_SENDER_ID || env.BULKSMSBD_SENDER_ID || 'HazardNet',
    dryRun: /^(1|true|yes|on)$/i.test(String(env.SMS_DRY_RUN || '')),
    maxPerRun: Number(env.SMS_MAX_PER_RUN) > 0 ? Number(env.SMS_MAX_PER_RUN) : 25,
    timeoutMs: Number(env.SMS_TIMEOUT_MS) > 0 ? Number(env.SMS_TIMEOUT_MS) : 8000,
    bullSmsBd: {
      apiKey: env.BULKSMSBD_API_KEY || '',
      baseUrl: env.BULKSMSBD_API_BASE || 'https://bulksmsbd.net',
    },
    greenweb: {
      apiKey: env.GREENWEB_API_KEY || '',
      baseUrl: env.GREENWEB_API_BASE || 'https://api.greenweb.com.bd',
    },
  };
  config.configured = provider === 'bulksmsbd'
    ? Boolean(config.bullSmsBd.apiKey)
    : provider === 'greenweb' ? Boolean(config.greenweb.apiKey) : false;
  return config;
}

const maskNumber = (number) => {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length <= 5) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
};

/** Strip credentials from anything that might be logged or returned. */
export function redactSmsUrl(url, config, env = process.env) {
  let out = String(url);
  const secrets = [config.bullSmsBd.apiKey, config.greenweb.apiKey,
    env.BULKSMSBD_API_KEY, env.GREENWEB_API_KEY].filter(Boolean);
  for (const secret of secrets) {
    out = out.split(secret).join('<redacted>');
  }
  return out.replace(/(api_key|token|apiKey)=([^&]+)/gi, '$1=<redacted>');
}

/** The request as data, so tests can assert the shape without a network. */
export function buildSmsRequest({ to, text, config }) {
  if (config.provider === 'bulksmsbd') {
    const url = `${config.bullSmsBd.baseUrl}/sms/api` +
      `?api_key=${encodeURIComponent(config.bullSmsBd.apiKey)}` +
      '&type=text' +
      `&number=${encodeURIComponent(to)}` +
      `&senderid=${encodeURIComponent(config.senderId)}` +
      `&message=${encodeURIComponent(text)}`;
    return {
      provider: 'bulksmsbd',
      method: 'GET',
      url,
      headers: {},
      body: null,
      redacted_url: redactSmsUrl(url, config),
      to_masked: maskNumber(to),
    };
  }
  if (config.provider === 'greenweb') {
    const body = new URLSearchParams({
      token: config.greenweb.apiKey,
      to,
      message: text,
      senderid: config.senderId,
    }).toString();
    const url = `${config.greenweb.baseUrl}/api/send-sms`;
    return {
      provider: 'greenweb',
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redacted_url: redactSmsUrl(url, config),
      body_preview: `token=<redacted>&to=${maskNumber(to)}&message=<text:${text.length} chars>`,
      to_masked: maskNumber(to),
    };
  }
  return null;
}

/** Does the provider answer look like a success? Vendors disagree; be explicit. */
function interpretResponse(provider, status, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);
  if (!status || status < 200 || status >= 300) {
    return { ok: false, error: `HTTP ${status}: ${text ? text.slice(0, 200) : 'no body'}` };
  }
  if (provider === 'bulksmsbd') {
    // BulkSMSBD answers `{"response_code":202,"success_message":"SMS Submitted Successfully"}`
    // on success and 10xx/1029-style codes otherwise; a plain numeric body also appears.
    const code = payload && (payload.response_code ?? payload.status);
    if (typeof code === 'number') {
      return code >= 200 && code < 300
        ? { ok: true }
        : { ok: false, error: `provider code ${code}: ${(payload && payload.error_message) || text}` };
    }
    const numeric = /^\s*(\d{3,4})\s*$/.exec(String(text));
    if (numeric) {
      const value = Number(numeric[1]);
      return value >= 200 && value < 300
        ? { ok: true }
        : { ok: false, error: `provider code ${value}` };
    }
  }
  if (provider === 'greenweb') {
    const value = payload && (payload.status ?? payload.response_code);
    if (value !== undefined && value !== null) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric >= 200 && numeric < 300
          ? { ok: true }
          : { ok: false, error: `provider code ${numeric}: ${text.slice(0, 200)}` };
      }
    }
    if (/error|invalid|fail/i.test(text)) return { ok: false, error: text.slice(0, 200) };
  }
  return { ok: true };
}

/**
 * Send one SMS. Never throws. Refuses to send text without the §1.7 disclaimer.
 */
export async function sendSms({
  to, text, config = getSmsConfig(), fetchImpl = fetch,
} = {}) {
  if (!to) {
    return { ok: false, channel: 'sms', sent: false, error: 'no destination number' };
  }
  if (!disclaimerIsComplete(text)) {
    return {
      ok: false,
      channel: 'sms',
      sent: false,
      error: 'refusing to send: message does not carry the §1.7 disclaimer (BMD/FFWC + 999/1090/16123)',
    };
  }
  if (config.provider === 'none' || !config.configured) {
    return {
      ok: false,
      degraded: true,
      channel: 'sms',
      sent: false,
      provider: 'none',
      to_masked: maskNumber(to),
      reason: 'no SMS provider configured (SMS_PROVIDER / BULKSMSBD_API_KEY / GREENWEB_API_KEY)',
    };
  }
  const request = buildSmsRequest({ to, text, config });
  if (config.dryRun) {
    return {
      ok: true,
      dry_run: true,
      channel: 'sms',
      sent: false,
      provider: request.provider,
      to_masked: request.to_masked,
      request_preview: {
        method: request.method,
        url: request.redacted_url,
        body_preview: request.body_preview || null,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body || undefined,
      signal: controller.signal,
    });
    const raw = await response.text().catch(() => '');
    let payload = raw;
    try {
      payload = JSON.parse(raw);
    } catch {
      /* vendor returns plain text or a bare code — interpretResponse handles it */
    }
    const verdict = interpretResponse(request.provider, response.status, payload);
    return {
      ok: verdict.ok,
      sent: verdict.ok,
      channel: 'sms',
      provider: request.provider,
      status: response.status,
      to_masked: request.to_masked,
      url: request.redacted_url,
      ...(verdict.ok ? {} : { error: verdict.error }),
    };
  } catch (error) {
    return {
      ok: false,
      sent: false,
      channel: 'sms',
      provider: request.provider,
      to_masked: maskNumber(to),
      error: error.name === 'AbortError' ? `timeout after ${config.timeoutMs} ms` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Status for the API/run report — never includes a credential. */
export function describeSmsTransport(config = getSmsConfig()) {
  return {
    channel: 'sms',
    provider: config.provider,
    configured: config.configured,
    dry_run: config.dryRun,
    sender_id: config.senderId,
    max_per_run: config.maxPerRun,
    base_url: config.provider === 'bulksmsbd' ? config.bullSmsBd.baseUrl
      : config.provider === 'greenweb' ? config.greenweb.baseUrl : null,
  };
}
