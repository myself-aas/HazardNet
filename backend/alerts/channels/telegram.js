/**
 * Telegram transport (Phase 4 scope: "SMS/Telegram").
 *
 * Deliberately tiny and injectable: the bot token and chat id come from the
 * environment, the fetch implementation is a parameter, and an unconfigured
 * deployment gets `{ok: false, degraded: true}` with the reason — never a throw and
 * never a silent success. A delivery that did not happen must not be recorded as
 * one: these results are counted in `notifyAlert` and surfaced in the run summary,
 * so a beta deployment on a machine with no Telegram credentials reports
 * `transports.telegram.configured === false` instead of pretending.
 *
 * `TELEGRAM_API_BASE` exists so a test (or a proxy-restricted deployment, like the
 * one this was written in) can point the transport at a local stub.
 */

export function getTelegramConfig(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN || '';
  const chatId = env.TELEGRAM_ALERT_CHAT_ID || env.TELEGRAM_CHAT_ID || '';
  return {
    channel: 'telegram',
    configured: Boolean(token && chatId),
    hasToken: Boolean(token),
    hasChatId: Boolean(chatId),
    apiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
    defaultChatId: chatId || null,
    token,
    timeoutMs: Number(env.TELEGRAM_TIMEOUT_MS) > 0 ? Number(env.TELEGRAM_TIMEOUT_MS) : 8000,
  };
}

/** Never log or return the token. */
export function redactTelegramUrl(url) {
  return String(url).replace(/\/bot[^/]+\//, '/bot<redacted>/');
}

export function buildTelegramRequest({ text, chatId, config }) {
  const target = chatId || config.defaultChatId;
  return {
    url: `${config.apiBase}/bot${config.token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: target,
      text,
      disable_web_page_preview: true,
    }),
    redacted_url: redactTelegramUrl(`${config.apiBase}/bot${config.token}/sendMessage`),
  };
}

export async function sendTelegramMessage({
  text, chatId, config = getTelegramConfig(), fetchImpl = fetch,
} = {}) {
  if (!config.configured) {
    return {
      ok: false,
      sent: false,
      degraded: true,
      channel: 'telegram',
      reason: 'TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID are not both set in this deployment',
    };
  }
  const request = buildTelegramRequest({ text, chatId, config });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || (payload && payload.ok === false)) {
      return {
        ok: false,
        sent: false,
        channel: 'telegram',
        status: response.status,
        error: (payload && payload.description) || `HTTP ${response.status}`,
        url: request.redacted_url,
      };
    }
    return {
      ok: true,
      sent: true,
      channel: 'telegram',
      status: response.status,
      message_id: payload && payload.result ? payload.result.message_id : null,
      url: request.redacted_url,
    };
  } catch (error) {
    return {
      ok: false,
      sent: false,
      channel: 'telegram',
      error: error.name === 'AbortError' ? `timeout after ${config.timeoutMs} ms` : error.message,
      url: request.redacted_url,
    };
  } finally {
    clearTimeout(timer);
  }
}
