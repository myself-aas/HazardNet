/**
 * @jest-environment node
 */
import express from 'express';
import request from 'supertest';
import pushRoutes from '../backend/routes/push.js';
import { getVapidPublicKey } from '../backend/utils/vapid.js';

jest.mock('../backend/pushStore.js', () => {
  const rows = new Map();
  return { pushStore: { size: async () => rows.size, set: async (key, value) => rows.set(key, value),
    delete: async (key) => rows.delete(key), entries: async () => Array.from(rows.entries()) } };
});

const app = express();
app.use(express.json());
app.use('/api/push', pushRoutes);

describe('Web Push Certificates & VAPID API Routes', () => {
  describe('VAPID Configuration', () => {
    it('should return the configured VAPID public key', () => {
      const key = getVapidPublicKey();
      expect(key).toBe('BDiZRhvhtY3Dy6BMKXfM0_tE55WwoIx7r8UiYY1n8foTAOlv53WUMtKEx7VPvnnawvQ6H87KWLJkX81CdOFdmUU');
    });
  });

  describe('GET /api/push/vapid-key', () => {
    it('should return public key JSON payload', async () => {
      const res = await request(app).get('/api/push/vapid-key');
      expect(res.statusCode).toBe(200);
      expect(res.body.publicKey).toBe('BDiZRhvhtY3Dy6BMKXfM0_tE55WwoIx7r8UiYY1n8foTAOlv53WUMtKEx7VPvnnawvQ6H87KWLJkX81CdOFdmUU');
    });
  });

  describe('GET /api/push/status', () => {
    it('should return service status', async () => {
      const res = await request(app).get('/api/push/status');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.vapidPublicKey).toBe('BDiZRhvhtY3Dy6BMKXfM0_tE55WwoIx7r8UiYY1n8foTAOlv53WUMtKEx7VPvnnawvQ6H87KWLJkX81CdOFdmUU');
    });
  });

  describe('POST /api/push/subscribe', () => {
    it('should register a push subscription', async () => {
      const payload = {
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk...',
        keys: {
          p256dh: 'BIPcZw1601K',
          auth: 'authSecret123',
        },
      };

      const res = await request(app)
        .post('/api/push/subscribe')
        .send(payload);
        
      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.totalSubscriptions).toBeGreaterThanOrEqual(1);
    });
    
    it('should handle malformed push subscription payload', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .send({});
        
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/push/send', () => {
    it('should handle push broadcast payload when authorized', async () => {
      process.env.BACKEND_API_KEY = 'test_secret';
      const payload = {
        title: 'Emergency Surge Warning',
        body: 'Severe flash flood forecast in Sunamganj.',
      };

      const res = await request(app)
        .post('/api/push/send')
        .set('Authorization', 'Bearer test_secret')
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject broadcast when unauthorized token is provided', async () => {
      process.env.BACKEND_API_KEY = 'test_secret';
      const payload = {
        title: 'Emergency Surge Warning',
        body: 'Severe flash flood forecast in Sunamganj.',
      };

      const res = await request(app)
        .post('/api/push/send')
        .send(payload);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/push/unsubscribe', () => {
    it('should remove subscription', async () => {
      const payload = {
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk...',
      };

      const res = await request(app)
        .post('/api/push/unsubscribe')
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.unsubscribed).toBe(true);
    });
  });
});
