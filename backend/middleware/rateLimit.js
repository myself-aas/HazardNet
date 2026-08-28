import rateLimit from 'express-rate-limit';

/**
 * Per-route request rate limiters (SEC-01).
 *
 * The AI routes proxy paid Gemini API calls and /api/predict runs CPU-bound
 * TensorFlow inference, so abuse has direct cost/availability impact.
 * Layered limits: a base limiter on all /api routes plus tighter buckets
 * for the expensive ones.
 *
 * `app.set('trust proxy', 1)` is set in server.js so clients behind the
 * proxy/edge get correct IPs instead of the proxy address.
 */
const buildLimiter = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7', // RateLimit-* headers
    legacyHeaders: false,
    message: { error: message },
  });

/** Expensive AI-generation routes (Gemini / RAG chat / agent). 20 req/min/IP. */
export const aiLimiter = buildLimiter({
  windowMs: 60_000,
  limit: 20,
  message: 'Too many AI requests from this address. Please wait a minute and try again.',
});

/** CPU-bound TensorFlow inference. 60 req/min/IP. */
export const predictLimiter = buildLimiter({
  windowMs: 60_000,
  limit: 60,
  message: 'Prediction rate limit exceeded. Please slow down.',
});

/** Baseline limiter for every other /api route. 120 req/min/IP. */
export const apiLimiter = buildLimiter({
  windowMs: 60_000,
  limit: 120,
  message: 'API rate limit exceeded. Please slow down.',
});
