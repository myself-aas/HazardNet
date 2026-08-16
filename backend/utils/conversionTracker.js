import crypto from 'crypto';

/**
 * Normalizes a string (trim, lowercase) and hashes it with SHA-256.
 * Essential for Meta CAPI, TikTok Events API, and Google Enhanced Conversions.
 * @param {string} val 
 * @returns {string|null}
 */
export function hashSHA256(val) {
  if (!val || typeof val !== 'string') return null;
  const cleaned = val.trim().toLowerCase();
  if (!cleaned) return null;
  return crypto.createHash('sha256').update(cleaned).digest('hex');
}

/**
 * Normalizes phone number into E.164 standard (e.g. +8801700000000) and hashes with SHA-256.
 * @param {string} phone 
 * @returns {string|null}
 */
export function hashPhoneE164(phone) {
  if (!phone || typeof phone !== 'string') return null;
  // Remove formatting characters, spaces, dashes, parentheses
  let digits = phone.replace(/[\s\-\(\)\.]/g, '');
  if (!digits) return null;
  // If Bangladesh local number (017... or 88017...), ensure international prefix
  if (digits.startsWith('01') && digits.length === 11) {
    digits = '+880' + digits.slice(1);
  } else if (digits.startsWith('8801') && !digits.startsWith('+')) {
    digits = '+' + digits;
  } else if (!digits.startsWith('+')) {
    digits = '+' + digits;
  }
  return crypto.createHash('sha256').update(digits).digest('hex');
}

/**
 * Extracts real client IP address respecting reverse proxies and CDNs (Cloudflare, Nginx, GCP Cloud Run).
 * @param {import('express').Request} req 
 * @returns {string}
 */
export function extractClientIp(req) {
  if (!req) return '127.0.0.1';
  
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for may contain multiple IPs (client, proxy1, proxy2); first one is client
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return cleanIp(firstIp);
  }

  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cleanIp(cfIp);

  const realIp = req.headers['x-real-ip'];
  if (realIp) return cleanIp(realIp);

  const socketIp = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  return cleanIp(socketIp);
}

function cleanIp(ip) {
  if (typeof ip !== 'string') return '127.0.0.1';
  // Remove IPv6 prefix to IPv4 mapping if present (e.g. ::ffff:192.168.1.1)
  return ip.replace(/^::ffff:/, '').trim();
}

/**
 * Extracts Click IDs and UTM parameters from request headers, query, or explicit body payload.
 * Follows Step 1-2 of Server-Side Conversion Tracking:
 * - fbclid (Facebook / Meta)
 * - ttclid (TikTok)
 * - gclid / wbraid / gbraid (Google Ads)
 * - msclkid (Microsoft / Bing)
 * - UTMs: utm_source, utm_medium, utm_campaign, utm_content, utm_term
 * @param {import('express').Request} req 
 * @param {Object} [overrideParams]
 * @returns {Object}
 */
export function extractAttribution(req, overrideParams = {}) {
  const query = req?.query || {};
  const body = req?.body || {};
  const headers = req?.headers || {};
  const cookies = req?.cookies || parseCookies(headers.cookie || '');

  // 1. Click IDs
  const fbclid = overrideParams.fbclid || body.fbclid || query.fbclid || cookies._fbc || null;
  const ttclid = overrideParams.ttclid || body.ttclid || query.ttclid || cookies.ttclid || null;
  const gclid = overrideParams.gclid || body.gclid || query.gclid || null;
  const wbraid = overrideParams.wbraid || body.wbraid || query.wbraid || null;
  const gbraid = overrideParams.gbraid || body.gbraid || query.gbraid || null;
  const msclkid = overrideParams.msclkid || body.msclkid || query.msclkid || null;

  // 2. UTM Parameters
  const utm_source = overrideParams.utm_source || body.utm_source || query.utm_source || null;
  const utm_medium = overrideParams.utm_medium || body.utm_medium || query.utm_medium || null;
  const utm_campaign = overrideParams.utm_campaign || body.utm_campaign || query.utm_campaign || null;
  const utm_content = overrideParams.utm_content || body.utm_content || query.utm_content || null;
  const utm_term = overrideParams.utm_term || body.utm_term || query.utm_term || null;

  // 3. Meta browser cookies (_fbp, _fbc)
  const fbp = overrideParams.fbp || body.fbp || cookies._fbp || null;
  const fbc = overrideParams.fbc || body.fbc || cookies._fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null);

  // 4. Client Telemetry
  const client_ip_address = overrideParams.client_ip_address || body.client_ip_address || extractClientIp(req);
  const client_user_agent = overrideParams.client_user_agent || body.client_user_agent || headers['user-agent'] || 'Mozilla/5.0';
  const referrer = overrideParams.referrer || body.referrer || headers['referer'] || null;
  const landing_url = overrideParams.landing_url || body.landing_url || headers['origin'] || req?.originalUrl || '/';

  const hasClickId = Boolean(fbclid || ttclid || gclid || wbraid || gbraid || msclkid);

  return {
    click_ids: {
      fbclid,
      ttclid,
      gclid,
      wbraid,
      gbraid,
      msclkid,
    },
    utms: {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    },
    meta_cookies: {
      fbp,
      fbc,
    },
    telemetry: {
      client_ip_address,
      client_user_agent,
      referrer,
      landing_url,
    },
    has_click_id: hasClickId,
    primary_source: utm_source || (gclid ? 'google_ads' : fbclid ? 'facebook_ads' : ttclid ? 'tiktok_ads' : msclkid ? 'bing_ads' : 'organic_direct'),
  };
}

/**
 * Parses cookie string into key-value pairs
 * @param {string} cookieHeader 
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  const list = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

/**
 * Normalizes customer user data and produces SHA-256 hashed objects ready for CAPI/Events API postbacks.
 * @param {Object} userData 
 * @returns {Object}
 */
export function normalizeUserData(userData = {}) {
  const emailHashed = hashSHA256(userData.email || userData.em);
  const phoneHashed = hashPhoneE164(userData.phone || userData.ph);
  const firstNameHashed = hashSHA256(userData.firstName || userData.first_name || userData.fn);
  const lastNameHashed = hashSHA256(userData.lastName || userData.last_name || userData.ln);
  const cityHashed = hashSHA256(userData.city || userData.ct || userData.district);
  const externalIdHashed = hashSHA256(userData.externalId || userData.userId || userData.uid || userData.external_id);

  return {
    em: emailHashed ? [emailHashed] : [],
    ph: phoneHashed ? [phoneHashed] : [],
    fn: firstNameHashed ? [firstNameHashed] : [],
    ln: lastNameHashed ? [lastNameHashed] : [],
    ct: cityHashed ? [cityHashed] : [],
    external_id: externalIdHashed ? [externalIdHashed] : [],
    country: ['bd'], // ISO country code lowercase
  };
}

/**
 * Builds standard Meta Conversions API (CAPI) payload
 */
export function formatMetaCAPI(event) {
  return {
    event_name: event.event_name,
    event_time: Math.floor(new Date(event.event_time || Date.now()).getTime() / 1000),
    event_id: event.event_id,
    event_source_url: event.attribution?.telemetry?.landing_url || 'https://hazardnet.bd',
    action_source: 'website',
    user_data: {
      client_ip_address: event.attribution?.telemetry?.client_ip_address,
      client_user_agent: event.attribution?.telemetry?.client_user_agent,
      fbc: event.attribution?.meta_cookies?.fbc,
      fbp: event.attribution?.meta_cookies?.fbp,
      ...event.user_data_hashed,
    },
    custom_data: {
      currency: event.custom_data?.currency || 'BDT',
      value: event.custom_data?.value || 0,
      content_name: event.custom_data?.content_name || 'Hazard Alert / Assessment',
      hazard_type: event.custom_data?.hazard_type,
      district: event.custom_data?.district,
      severity_score: event.custom_data?.severity_score,
    },
  };
}

/**
 * Builds TikTok Events API payload
 */
export function formatTikTokEvent(event) {
  return {
    event: event.event_name,
    event_time: Math.floor(new Date(event.event_time || Date.now()).getTime() / 1000),
    event_id: event.event_id,
    user: {
      ttclid: event.attribution?.click_ids?.ttclid,
      ip: event.attribution?.telemetry?.client_ip_address,
      user_agent: event.attribution?.telemetry?.client_user_agent,
      email: event.user_data_hashed?.em?.[0],
      phone: event.user_data_hashed?.ph?.[0],
    },
    properties: {
      currency: event.custom_data?.currency || 'BDT',
      value: event.custom_data?.value || 0,
      description: event.custom_data?.content_name,
    },
  };
}

/**
 * Builds Google Ads Enhanced Conversion Import payload (keyed to gclid / wbraid)
 */
export function formatGoogleAdsConversion(event) {
  return {
    conversion_action: event.event_name,
    conversion_date_time: new Date(event.event_time || Date.now()).toISOString(),
    gclid: event.attribution?.click_ids?.gclid,
    gbraid: event.attribution?.click_ids?.gbraid,
    wbraid: event.attribution?.click_ids?.wbraid,
    order_id: event.event_id,
    conversion_value: event.custom_data?.value || 0,
    currency_code: event.custom_data?.currency || 'BDT',
    user_identifiers: [
      event.user_data_hashed?.em?.[0] ? { hashed_email: event.user_data_hashed.em[0] } : null,
      event.user_data_hashed?.ph?.[0] ? { hashed_phone_number: event.user_data_hashed.ph[0] } : null,
    ].filter(Boolean),
  };
}
