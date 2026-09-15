import rateLimit from 'express-rate-limit';
import { getAdminAuth } from '../admin.js';

/**
 * Firebase Auth identity middleware for AI and protected backend routes.
 *
 * Attaches `req.user` on a valid Bearer token. Enforcement happens in the
 * dynamic rate limiter.
 */

const buildLimiter = (limit) =>
  rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    message: { error: 'AI request rate limit exceeded. Sign in for a higher allowance, or wait a minute.' },
  });

const authedLimiter = buildLimiter(60);
const anonymousLimiter = buildLimiter(10);

export async function attachFirebaseAuthUser(req, _res, next) {
  req.user = null;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (token) {
    try {
      {
        const decodedToken = await getAdminAuth().verifyIdToken(token);
        if (decodedToken && decodedToken.uid) {
          req.user = { id: decodedToken.uid, email: decodedToken.email ?? null, role: 'user' };
        }
      }
    } catch {
      // Invalid/expired token → treat as anonymous; never leak why upstream.
    }
  }
  next();
}

// Alias for backwards compatibility
export const attachSupabaseUser = attachFirebaseAuthUser;

/** Picks the correct rate-limit bucket based on identity. */
export function dynamicAiLimiter(req, res, next) {
  return (req.user ? authedLimiter : anonymousLimiter)(req, res, next);
}
