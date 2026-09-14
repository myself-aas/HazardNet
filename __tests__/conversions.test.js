/**
 * @jest-environment node
 */
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

jest.mock('../backend/db.js', () => ({
  db: {},
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn().mockResolvedValue({ id: 'mock_doc_id' }),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(true),
  })),
}));

import conversionRoutes from '../backend/routes/conversions.js';
import {
  hashSHA256,
  hashPhoneE164,
  extractClientIp,
  extractAttribution,
  normalizeUserData,
  formatMetaCAPI,
  formatTikTokEvent,
  formatGoogleAdsConversion,
} from '../backend/utils/conversionTracker.js';

const app = express();
app.use(express.json());
app.use('/api/conversions', conversionRoutes);

describe('Server-Side Conversion Tracking & Attribution Engine', () => {
  describe('Step 1 & 2: Click ID, UTM & Client IP Extraction', () => {
    it('should extract real visitor IP from x-forwarded-for header', () => {
      const mockReq = {
        headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      const ip = extractClientIp(mockReq);
      expect(ip).toBe('203.0.113.195');
    });

    it('should extract real visitor IP from cf-connecting-ip header', () => {
      const mockReq = {
        headers: { 'cf-connecting-ip': '198.51.100.42' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      const ip = extractClientIp(mockReq);
      expect(ip).toBe('198.51.100.42');
    });

    it('should extract all major platform click IDs (fbclid, gclid, ttclid, msclkid)', () => {
      const mockReq = {
        query: {
          fbclid: 'fb_click_123',
          gclid: 'g_click_456',
          ttclid: 'tt_click_789',
          msclkid: 'ms_click_999',
          utm_source: 'facebook',
          utm_campaign: 'flood_early_warning',
        },
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        },
      };

      const attribution = extractAttribution(mockReq);
      expect(attribution.has_click_id).toBe(true);
      expect(attribution.click_ids.fbclid).toBe('fb_click_123');
      expect(attribution.click_ids.gclid).toBe('g_click_456');
      expect(attribution.click_ids.ttclid).toBe('tt_click_789');
      expect(attribution.click_ids.msclkid).toBe('ms_click_999');
      expect(attribution.utms.utm_source).toBe('facebook');
      expect(attribution.utms.utm_campaign).toBe('flood_early_warning');
    });
  });

  describe('Step 5: PII Normalization & SHA-256 Hashing', () => {
    it('should trim, lowercase, and hash email addresses accurately', () => {
      const rawEmail = '  Farmer.Shuvo@BAU.edu.bd  ';
      const hashed = hashSHA256(rawEmail);
      const expected = crypto.createHash('sha256').update('farmer.shuvo@bau.edu.bd').digest('hex');
      expect(hashed).toBe(expected);
    });

    it('should format Bangladesh phone numbers to E.164 and hash accurately', () => {
      const rawPhone = '01712-345678';
      const hashed = hashPhoneE164(rawPhone);
      const expected = crypto.createHash('sha256').update('+8801712345678').digest('hex');
      expect(hashed).toBe(expected);
    });

    it('should normalize full customer profile objects', () => {
      const profile = {
        email: 'agri_user@domain.com',
        phone: '+8801812345678',
        firstName: 'Rahim',
        lastName: 'Uddin',
        city: 'Sylhet',
      };
      const normalized = normalizeUserData(profile);
      expect(normalized.em.length).toBe(1);
      expect(normalized.ph.length).toBe(1);
      expect(normalized.fn.length).toBe(1);
      expect(normalized.ln.length).toBe(1);
      expect(normalized.ct.length).toBe(1);
      expect(normalized.country).toEqual(['bd']);
    });
  });

  describe('Step 6: Deduplication & Format Payloads', () => {
    const sampleEvent = {
      event_name: 'CustomRiskAssessment',
      event_id: 'ev_dedupe_12345',
      event_time: '2026-08-15T07:00:00.000Z',
      attribution: {
        click_ids: { fbclid: 'fb_123', gclid: 'g_456', ttclid: 'tt_789' },
        telemetry: {
          client_ip_address: '103.205.180.1',
          client_user_agent: 'Mozilla/5.0 Mobile',
          landing_url: 'https://hazardnet.bd/forecast/overview',
        },
        meta_cookies: { fbp: 'fb.1.123', fbc: 'fb.1.123.fb_123' },
      },
      user_data_hashed: {
        em: ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        ph: ['c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2'],
      },
      custom_data: {
        value: 150.0,
        currency: 'BDT',
        content_name: 'Flood Risk Assessment',
        district: 'Sunamganj',
        hazard_type: 'Flash Flood',
      },
    };

    it('should build valid Meta Conversions API (CAPI) payload', () => {
      const capi = formatMetaCAPI(sampleEvent);
      expect(capi.event_name).toBe('CustomRiskAssessment');
      expect(capi.event_id).toBe('ev_dedupe_12345');
      expect(capi.action_source).toBe('website');
      expect(capi.user_data.client_ip_address).toBe('103.205.180.1');
      expect(capi.user_data.fbc).toBe('fb.1.123.fb_123');
      expect(capi.custom_data.district).toBe('Sunamganj');
    });

    it('should build valid TikTok Events API payload', () => {
      const tt = formatTikTokEvent(sampleEvent);
      expect(tt.event).toBe('CustomRiskAssessment');
      expect(tt.event_id).toBe('ev_dedupe_12345');
      expect(tt.user.ttclid).toBe('tt_789');
      expect(tt.user.ip).toBe('103.205.180.1');
    });

    it('should build valid Google Ads Enhanced Conversion Import payload', () => {
      const gads = formatGoogleAdsConversion(sampleEvent);
      expect(gads.conversion_action).toBe('CustomRiskAssessment');
      expect(gads.order_id).toBe('ev_dedupe_12345');
      expect(gads.gclid).toBe('g_456');
    });
  });

  describe('Step 4, 5, 7: API Endpoints (Track, Dispatch, Reconciliation)', () => {
    it('POST /api/conversions/track - should capture event and return match quality score', async () => {
      const res = await request(app)
        .post('/api/conversions/track')
        .set('x-forwarded-for', '103.205.180.10')
        .set('user-agent', 'Mozilla/5.0 Chrome')
        .send({
          event_name: 'CompleteRegistration',
          event_id: 'ev_test_1001',
          user_data: {
            email: 'farmer.sylhet@hazardnet.bd',
            phone: '01711223344',
            district: 'Sylhet',
          },
          custom_data: {
            district: 'Sylhet',
            farmSizeHectares: 2.5,
          },
          attribution_override: {
            fbclid: 'fb_test_click_abc',
            utm_source: 'facebook_ads',
            utm_campaign: 'boro_season_2026',
          },
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event_id).toBe('ev_test_1001');
      expect(res.body.has_click_id).toBe(true);
      expect(res.body.match_quality_score).toBeGreaterThanOrEqual(7.0);
    });

    it('POST /api/conversions/track - responds even when Firestore never settles', async () => {
      // Regression: the route used to `await addDoc(...)` on the response path.
      // When Firestore is unreachable its client does not resolve or reject, so
      // the endpoint hung forever (no response at 20s+). The event is already
      // captured in the in-memory buffer, so the response must not depend on it.
      const { addDoc } = await import('../backend/db.js');
      addDoc.mockImplementationOnce(() => new Promise(() => {})); // never settles

      const res = await request(app)
        .post('/api/conversions/track')
        .send({ event_name: 'NeverSettles', event_id: 'ev_hang_test' })
        .timeout({ deadline: 4000 });

      expect(res.statusCode).toBe(201);
      expect(res.body.event_id).toBe('ev_hang_test');

      // The conversion is still recorded locally, so the data is not lost.
      const debug = await request(app).get('/api/conversions/debug');
      expect(debug.body.recent_events.some((e) => e.event_id === 'ev_hang_test')).toBe(true);
    });

    it('POST /api/conversions/dispatch - should format CAPI dispatch payloads for targets', async () => {
      const res = await request(app)
        .post('/api/conversions/dispatch')
        .send({
          event_id: 'ev_test_1001',
          target_platforms: ['meta', 'tiktok', 'google_ads'],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payloads.meta_capi).toBeDefined();
      expect(res.body.payloads.tiktok_events_api).toBeDefined();
      expect(res.body.payloads.google_ads_enhanced).toBeDefined();
    });

    it('GET /api/conversions/reconciliation - should return 7-step verification audit report', async () => {
      const res = await request(app).get('/api/conversions/reconciliation');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.verification_metrics.total_ground_truth_conversions).toBeGreaterThanOrEqual(1);
      expect(res.body.verification_checklist['1_capture_first_hit']).toBeDefined();
      expect(res.body.verification_checklist['7_verify_reconciliation']).toBeDefined();
    });

    it('GET /api/conversions/debug - should return recent conversions buffer', async () => {
      const res = await request(app).get('/api/conversions/debug');
      expect(res.statusCode).toBe(200);
      expect(res.body.recent_events.length).toBeGreaterThanOrEqual(1);
    });
  });
});
