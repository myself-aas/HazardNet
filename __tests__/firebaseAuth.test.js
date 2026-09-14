/**
 * @jest-environment node
 */
import { attachFirebaseAuthUser } from '../backend/middleware/firebaseAuth.js';

function run(req) {
  return new Promise((resolve) => {
    attachFirebaseAuthUser(req, {}, () => resolve(req));
  });
}

describe('attachFirebaseAuthUser', () => {
  it('stays anonymous when no Authorization header is present', async () => {
    const req = await run({ headers: {} });
    expect(req.user).toBeNull();
  });

  it('stays anonymous on an invalid token (never throws)', async () => {
    const req = await run({ headers: { authorization: 'Bearer invalid-token' } });
    expect(req.user).toBeNull();
  });
});
