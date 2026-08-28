import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

/**
 * Supabase identity for AI routes (P3-6, closes the SEC-01 remainder).
 *
 * Supabase issues HS256 access tokens signed with the project JWT secret
 * (SUPABASE_JWT_SECRET). The middleware never blocks a request: it only
 * attaches `req.user` on a valid token. Enforcement happens in the
 * dynamic rate limiter below:
 *
 *   authenticated  →  60 req/min  (normal product usage)
 *   anonymous      →  10 req/min  (tight lane; AI calls cost real money)
 *   secret unset   →  20 req/min flat (legacy behavior until configured)
 *
 * This keeps the public demo usable while making abuse of the paid
 * Gemini pipeline expensive for drive-by traffic, and ties heavy usage
 * to a real identity once SUPABASE_JWT_SECRET is configured.
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

export function attachSupabaseUser(req, _res, next) {
  req.user = null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (secret && token) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (payload && payload.sub) {
        req.user = { id: payload.sub, email: payload.email ?? null, role: payload.role ?? null };
      }
    } catch {
      // Invalid/expired token → treat as anonymous; never leak why upstream.
    }
  }
  next();
}

/** Picks the correct rate-limit bucket based on identity. */
export function dynamicAiLimiter(req, res, next) {
  if (!process.env.SUPABASE_JWT_SECRET) {
    // Not configured: legacy flat lane (matches the P0 aiLimiter budget).
    return aiLimiterFallback(req, res, next);
  }
  return (req.user ? authedLimiter : anonymousLimiter)(req, res, next);
}

// Flat 20/min fallback — same budget as the P0 aiLimiter.
const aiLimiterFallback = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'AI request rate limit exceeded. Please wait a minute and try again.' },
});
