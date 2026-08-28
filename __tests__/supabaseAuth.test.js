/**
 * @jest-environment node
 */
import jwt from 'jsonwebtoken';
import { attachSupabaseUser } from '../backend/middleware/supabaseAuth.js';

const SECRET = 'test-jwt-secret';
const OLD_ENV = process.env;

function run(req) {
  return new Promise((resolve) => {
    attachSupabaseUser(req, {}, () => resolve(req));
  });
}

describe('attachSupabaseUser (P3-6)', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: SECRET };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('attaches the user for a valid Supabase-style HS256 token', async () => {
    const token = jwt.sign({ sub: 'user-123', email: 'f@b.bd', role: 'authenticated' }, SECRET, { algorithm: 'HS256' });
    const req = await run({ headers: { authorization: `Bearer ${token}` } });
    expect(req.user).toEqual({ id: 'user-123', email: 'f@b.bd', role: 'authenticated' });
  });

  it('stays anonymous when no Authorization header is present', async () => {
    const req = await run({ headers: {} });
    expect(req.user).toBeNull();
  });

  it('stays anonymous on a tampered token (never throws)', async () => {
    const token = jwt.sign({ sub: 'user-123' }, 'wrong-secret', { algorithm: 'HS256' });
    const req = await run({ headers: { authorization: `Bearer ${token}` } });
    expect(req.user).toBeNull();
  });

  it('stays anonymous on an expired token', async () => {
    const token = jwt.sign({ sub: 'user-123' }, SECRET, { algorithm: 'HS256', expiresIn: '-10s' });
    const req = await run({ headers: { authorization: `Bearer ${token}` } });
    expect(req.user).toBeNull();
  });

  it('stays anonymous when the secret is not configured (env unset)', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const token = jwt.sign({ sub: 'user-123' }, SECRET, { algorithm: 'HS256' });
    const req = await run({ headers: { authorization: `Bearer ${token}` } });
    expect(req.user).toBeNull();
  });
});
