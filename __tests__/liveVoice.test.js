/**
 * @jest-environment node
 */
/**
 * Tests for Live Voice API (gemini-3.8-live) + RAG Skills Pipeline integration
 */

import request from 'supertest';
import app from '../backend/server.js';
import { setupLiveVoiceWebSocket } from '../backend/routes/liveVoice.js';
import http from 'http';
import { WebSocket } from 'ws';

describe('Live Voice API — gemini-3.8-live REST & WebSocket endpoints', () => {
  test('GET /api/live-voice/status returns gemini-3.8-live model configuration and RAG status', async () => {
    const res = await request(app).get('/api/live-voice/status');
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('gemini-3.8-live');
    expect(res.body.ragIntegrated).toBe(true);
    expect(res.body.skillsRouted).toBe(true);
    expect(Array.isArray(res.body.voices)).toBe(true);
    expect(res.body.defaultVoice).toBe('Aoede');
    expect(res.body.defaultSampleRateInput).toBe(16000);
    expect(res.body.defaultSampleRateOutput).toBe(24000);
  });

  test('POST /api/live-voice/context builds grounded context for requested district', async () => {
    const res = await request(app)
      .post('/api/live-voice/context')
      .send({ district: 'Sunamganj', hazard: 'Flood' });

    expect(res.status).toBe(200);
    expect(res.body.district).toBe('Sunamganj');
    expect(res.body.hazard).toBe('Flood');
    expect(res.body.districtBaseline).toBeTruthy();
    expect(res.body.routedSkillsLength).toBeGreaterThan(0);
    expect(res.body.protocolsSummary).toContain('BRRI');
    expect(res.body.protocolsSummary).toContain('DAE');
  });

  test('WebSocket server on /api/live-voice sends connection_established handshake', (done) => {
    const server = http.createServer(app);
    setupLiveVoiceWebSocket(server);

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/live-voice`);

      ws.on('open', () => {
        // ws opened
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'connection_established') {
            expect(msg.model).toBe('gemini-3.8-live');
            expect(msg.sampleRateInput).toBe(16000);
            expect(msg.sampleRateOutput).toBe(24000);
            ws.close();
            server.close(done);
          }
        } catch (err) {
          ws.close();
          server.close(() => done(err));
        }
      });

      ws.on('error', (err) => {
        server.close(() => done(err));
      });
    });
  });
});
