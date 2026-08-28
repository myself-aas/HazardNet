/**
 * @jest-environment node
 */
import express from 'express';
import request from 'supertest';
import { validateTensor } from '../backend/middleware/validation.js';

// Regression tests for SEC-03: the prediction endpoint must never fabricate
// synthetic/random input tensors — it must refuse to run the model without
// a real payload.
const app = express();
app.use(express.json({ limit: '30mb' }));
app.post('/predict', validateTensor, (req, res) => res.json({ ok: true }));

describe('POST /predict tensor validation (integrity)', () => {
  it('rejects a missing tensor with 422 and never generates synthetic data', async () => {
    const res = await request(app).post('/predict').send({ districtId: 'dhaka', risk: 'High' });
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toMatch(/tensor/i);
    expect(res.body).not.toHaveProperty('prediction');
  });

  it('rejects a wrong-size tensor with 400', async () => {
    const res = await request(app).post('/predict').send({ tensor: [1, 2, 3] });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a correctly shaped tensor and calls the handler', async () => {
    const size = 1 * 15 * 10 * 64 * 64;
    const tensor = new Array(size).fill(0.1);
    const res = await request(app).post('/predict').send({ tensor });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  }, 30_000);
});
