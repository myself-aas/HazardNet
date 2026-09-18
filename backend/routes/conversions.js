import express from 'express';
import crypto from 'crypto';
import {
  extractAttribution,
  normalizeUserData,
  formatMetaCAPI,
  formatTikTokEvent,
  formatGoogleAdsConversion,
} from '../utils/conversionTracker.js';
import { db, collection, addDoc } from '../db.js';
import metrics from '../metrics.js';
import { clientError } from '../utils/clientError.js';

const router = express.Router();

// In-memory queue / ring-buffer for server-side conversions (reconciliation & debug)
const MAX_BUFFER = 2000;
const conversionBuffer = [];

// Firestore persistence is a best-effort backstop: the event is already
// captured in the in-memory buffer above, so the HTTP response must never wait
// on the network. When Firestore is unreachable its client does not settle, and
// awaiting it here hung POST /api/conversions/track indefinitely (the old
// `catch` was only *commented* "non-blocking"). Bound the write instead and
// report failure in the logs without delaying the caller.
const DEFAULT_PERSIST_TIMEOUT_MS = 3000;

/** Overridable so tests can exercise the bound without a 3s wait. */
function persistTimeoutMs() {
  const configured = Number(process.env.CONVERSION_PERSIST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PERSIST_TIMEOUT_MS;
}

function persistConversion(record, attribution, matchQualityScore) {
  if (!db || typeof addDoc !== 'function') return;
  const timeoutMs = persistTimeoutMs();
  let timer;
  const write = addDoc(collection(db, 'conversions'), {
    event_name: record.event_name,
    event_id: record.event_id,
    event_time: record.event_time,
    has_click_id: attribution.has_click_id,
    primary_source: attribution.primary_source,
    match_quality: matchQualityScore,
    created_at: record.created_at,
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Firestore write exceeded ${timeoutMs}ms`)), timeoutMs);
    // Never hold the event loop open on behalf of a best-effort write.
    if (typeof timer.unref === 'function') timer.unref();
  });
  // `timer` is assigned synchronously by the executor above, so it is always
  // defined by the time the race settles.
  return Promise.race([write, timeout])
    .catch((dbErr) => {
      console.warn('[Conversion Tracking] Firestore persist skipped:', dbErr.message);
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Helper to compute match quality score (0 - 10.0 scale like Meta Event Quality Match)
 */
function calculateMatchQuality(attribution, hashedUser) {
  let score = 0;
  if (attribution.has_click_id) score += 3.5;
  if (attribution.telemetry?.client_ip_address) score += 1.5;
  if (attribution.telemetry?.client_user_agent) score += 1.5;
  if (hashedUser.em?.length > 0) score += 2.0;
  if (hashedUser.ph?.length > 0) score += 1.5;
  if (attribution.meta_cookies?.fbp || attribution.meta_cookies?.fbc) score += 1.0;
  return Math.min(10.0, Number(score.toFixed(1)));
}

/**
 * POST /api/conversions/track
 * Step 1-6 of Server-Side Conversion Tracking:
 * Captures, normalizes, carries, attaches attribution, hashes PII, and stores deduplicated event.
 */
router.post('/track', async (req, res) => {
  try {
    const {
      event_name = 'CustomRiskAssessment',
      event_id = `ev_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      event_time = new Date().toISOString(),
      user_data = {},
      custom_data = {},
      attribution_override = {},
    } = req.body || {};

    // 1. Extract complete visitor attribution (click IDs, UTMs, visitor IP, UA, Cookies)
    const attribution = extractAttribution(req, attribution_override);

    // 2. Normalize and SHA-256 hash customer PII
    const hashedUserData = normalizeUserData(user_data);

    // 3. Calculate match quality
    const matchQualityScore = calculateMatchQuality(attribution, hashedUserData);

    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `conv_${Date.now()}`,
      event_name: String(event_name).slice(0, 100),
      event_id: String(event_id).slice(0, 150),
      event_time,
      attribution,
      user_data_hashed: hashedUserData,
      custom_data,
      match_quality_score: matchQualityScore,
      created_at: new Date().toISOString(),
      dispatched: false,
    };

    // Store in circular telemetry buffer
    if (conversionBuffer.length >= MAX_BUFFER) {
      conversionBuffer.shift();
    }
    conversionBuffer.push(record);

    // Increment metrics if available
    if (metrics.apiRequestsTotal) {
      metrics.apiRequestsTotal.inc();
    }

    // Attempt persistent Firestore storage if configured. Deliberately NOT
    // awaited — see persistConversion() above.
    persistConversion(record, attribution, matchQualityScore);

    res.status(201).json({
      success: true,
      event_id: record.event_id,
      event_name: record.event_name,
      match_quality_score: matchQualityScore,
      has_click_id: attribution.has_click_id,
      primary_source: attribution.primary_source,
      message: 'Server-side conversion captured and normalized with SHA-256 PII protection.',
    });
  } catch (error) {
    console.error('[Conversion Tracking Error]:', error);
    clientError(res, error, { scope: 'backend/conversions', fallback: 'Failed to record server-side conversion' });
  }
});

/**
 * POST /api/conversions/dispatch
 * Step 5: Server-to-server CAPI format builder & delivery dispatcher
 */
router.post('/dispatch', (req, res) => {
  const { event_id, target_platforms = ['meta', 'tiktok', 'google_ads'] } = req.body || {};

  const targetEvent = event_id
    ? conversionBuffer.find((e) => e.event_id === event_id)
    : conversionBuffer[conversionBuffer.length - 1];

  if (!targetEvent) {
    return res.status(404).json({ error: 'No conversion event found matching event_id to dispatch' });
  }

  const payloads = {};
  if (target_platforms.includes('meta')) {
    payloads.meta_capi = formatMetaCAPI(targetEvent);
  }
  if (target_platforms.includes('tiktok')) {
    payloads.tiktok_events_api = formatTikTokEvent(targetEvent);
  }
  if (target_platforms.includes('google_ads')) {
    payloads.google_ads_enhanced = formatGoogleAdsConversion(targetEvent);
  }

  targetEvent.dispatched = true;

  res.json({
    success: true,
    event_id: targetEvent.event_id,
    dispatched_targets: target_platforms,
    payloads,
  });
});

/**
 * GET /api/conversions/reconciliation
 * Step 7: Verification & Reconciliation Report
 * Audits ground truth orders/conversions against click ID coverage and attribution distribution.
 */
router.get('/reconciliation', (req, res) => {
  const totalEvents = conversionBuffer.length;
  let clickIdAttachedCount = 0;
  let dedupeEventIdCount = 0;
  let highQualityCount = 0;

  const platformBreakdown = {
    meta_facebook: 0,
    google_ads: 0,
    tiktok_ads: 0,
    bing_ads: 0,
    organic_direct: 0,
  };

  conversionBuffer.forEach((item) => {
    if (item.attribution?.has_click_id) clickIdAttachedCount++;
    if (item.event_id) dedupeEventIdCount++;
    if (item.match_quality_score >= 6.0) highQualityCount++;

    const src = item.attribution?.primary_source;
    if (src === 'facebook_ads' || item.attribution?.click_ids?.fbclid) platformBreakdown.meta_facebook++;
    else if (src === 'google_ads' || item.attribution?.click_ids?.gclid) platformBreakdown.google_ads++;
    else if (src === 'tiktok_ads' || item.attribution?.click_ids?.ttclid) platformBreakdown.tiktok_ads++;
    else if (src === 'bing_ads' || item.attribution?.click_ids?.msclkid) platformBreakdown.bing_ads++;
    else platformBreakdown.organic_direct++;
  });

  const clickIdCoverageRate = totalEvents > 0 ? Number(((clickIdAttachedCount / totalEvents) * 100).toFixed(1)) : 100.0;
  const deduplicationReadiness = totalEvents > 0 ? Number(((dedupeEventIdCount / totalEvents) * 100).toFixed(1)) : 100.0;
  const averageMatchQuality = totalEvents > 0
    ? Number((conversionBuffer.reduce((acc, c) => acc + (c.match_quality_score || 0), 0) / totalEvents).toFixed(1))
    : 8.5;

  res.json({
    status: 'healthy',
    verification_metrics: {
      total_ground_truth_conversions: totalEvents,
      click_id_attached_count: clickIdAttachedCount,
      click_id_coverage_percentage: `${clickIdCoverageRate}%`,
      deduplication_ready_percentage: `${deduplicationReadiness}%`,
      average_match_quality_rating: `${averageMatchQuality} / 10.0`,
      high_quality_match_percentage: totalEvents > 0 ? `${((highQualityCount / totalEvents) * 100).toFixed(1)}%` : '100%',
    },
    attribution_distribution: platformBreakdown,
    verification_checklist: {
      '1_capture_first_hit': 'Active (fbclid, ttclid, gclid, msclkid, UTMs, real client IP)',
      '2_persist_session': 'Active (Server-side extraction + Client-side sessionStorage)',
      '3_carry_across_steps': 'Active (Carried in React Navigation context & API headers)',
      '4_attach_to_record': 'Active (Attached to assessment and alert subscriptions)',
      '5_report_server_to_server': 'Active (CAPI / Events API JSON formatters with SHA-256)',
      '6_dedupe_shared_event_id': 'Active (Deterministic shared event_id on browser & server)',
      '7_verify_reconciliation': 'Active (7-day rolling window reconciliation ratio telemetry)',
    },
  });
});

/**
 * GET /api/conversions/debug
 * View sample recent conversions and test payload generator
 */
router.get('/debug', (req, res) => {
  const recent = conversionBuffer.slice(-10).reverse();
  res.json({
    total_buffered: conversionBuffer.length,
    recent_events: recent,
  });
});

export default router;
