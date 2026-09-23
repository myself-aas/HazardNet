import rateLimit from 'express-rate-limit';
import * as adminModule from 'firebase-admin';

const admin = adminModule.default || adminModule;

const getAppsList = () => {
  if (admin && Array.isArray(admin.apps)) return admin.apps;
  if (typeof adminModule.getApps === 'function') return adminModule.getApps();
  return [];
};

if (getAppsList().length === 0 && admin && typeof admin.initializeApp === 'function') {
  try {
    admin.initializeApp();
  } catch (err) {
    console.warn('[firebaseAuth] Admin initialization deferred or running in client mode:', err.message);
  }
}

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

export function bearerToken(headers = {}) {
  const authHeader = headers['authorization'] || headers.Authorization || '';
  return String(authHeader).replace(/^Bearer\s+/i, '');
}

/**
 * Verify a Firebase ID token independently of Express, so serverless handlers
 * (api/v1/alerts/*) can authenticate the same way the middleware does.
 *
 * Role comes from the token's claims, which only the Admin SDK can set — a client
 * cannot promote itself by editing its profile document. Absent a claim the role
 * is 'user', which is what every existing route assumed.
 *
 * @returns {Promise<{id:string,email:string|null,role:string}|null>} null when the
 *          token is missing, malformed, expired, or Admin is unavailable.
 *
 * A Firebase ID token is a JWT: three dot-separated base64url segments. The shape is
 * checked first, so a garbage `Authorization: Bearer <api-key>` header never causes an
 * outbound call to the identity provider — that is both wasted latency on every
 * pipeline request and a way to make the alert API wait on a third party.
 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Upper bound on token verification: an unreachable identity provider must not
 *  hold a request open (this endpoint decides whether an alert goes public). */
const VERIFY_TIMEOUT_MS = Number(process.env.FIREBASE_VERIFY_TIMEOUT_MS) > 0
  ? Number(process.env.FIREBASE_VERIFY_TIMEOUT_MS) : 2500;

export async function verifyFirebaseIdToken(token) {
  if (!token || !JWT_SHAPE.test(String(token))) return null;
  try {
    if (getAppsList().length > 0 && admin && typeof admin.auth === 'function') {
      const pending = admin.auth().verifyIdToken(token);
      pending.catch(() => null); // handled below; never an unhandled rejection
      const decodedToken = await Promise.race([
        pending,
        new Promise((resolve) => { setTimeout(() => resolve(null), VERIFY_TIMEOUT_MS).unref?.(); }),
      ]);
      if (!decodedToken) return null;
      if (decodedToken && decodedToken.uid) {
        const claimed = decodedToken.role || decodedToken.userRole
          || (decodedToken.admin === true ? 'admin' : null)
          || (decodedToken.dutyOfficer === true || decodedToken.duty_officer === true
            ? 'duty_officer' : null);
        return {
          id: decodedToken.uid,
          email: decodedToken.email ?? null,
          role: claimed ? String(claimed) : 'user',
        };
      }
    }
  } catch {
    // Invalid/expired token → treat as anonymous; never leak why upstream.
  }
  return null;
}

export async function attachFirebaseAuthUser(req, _res, next) {
  req.user = await verifyFirebaseIdToken(bearerToken(req.headers));
  next();
}

/** Picks the correct rate-limit bucket based on identity. */
export function dynamicAiLimiter(req, res, next) {
  return (req.user ? authedLimiter : anonymousLimiter)(req, res, next);
}
