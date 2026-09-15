/** @jest-environment node */
import request from 'supertest';
import app from '../backend/server.js';
import serverless from '../api/[...path].js';
jest.mock('../backend/db.js', () => ({}));
test('Vercel catch-all is the same guarded Express application', () => expect(serverless).toBe(app));
test.each(['/api/predict', '/api/chat/query', '/api/agent/advisory', '/api/advisory'])('feature %s reaches its handler, not a 404', async (path) => {
  const response = await request(serverless).post(path).send({});
  expect(response.status).not.toBe(404);
  expect(response.headers['content-type']).toContain('application/json');
});
test('Vercel health alias preserves the health contract', async () => {
  expect((await request(serverless).get('/api/health')).body.status).toBe('healthy');
});
