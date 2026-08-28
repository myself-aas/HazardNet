import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import forecastRoutes from './routes/forecasts.js';
import advisoryRoutes from './routes/advisory.js';
import chatRoutes from './routes/chat.js';
import agentRoutes from './routes/agent.js';
import predictRoutes from './routes/predict.js';
import pushRoutes from './routes/push.js';
import conversionRoutes from './routes/conversions.js';
import metrics from './metrics.js';
import { aiLimiter, predictLimiter, apiLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { getModelInfo } from './modelInfo.js';
import helmet from 'helmet';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Startup configuration assertions (SEC-06): loud, early signals for misconfig
// instead of silent runtime failures. Non-fatal so local dev still boots.
// ---------------------------------------------------------------------------
(function assertEnvironment() {
  const problems = [];
  const warnings = [];

  if (!process.env.BACKEND_API_KEY) {
    problems.push('BACKEND_API_KEY is NOT set - authenticated endpoints (CSV ingest, push broadcast) will return 503.');
  }
  if (!process.env.GEMINI_API_KEY) {
    warnings.push('GEMINI_API_KEY unset - AI advisory routes will fall back to the deterministic heuristic engine.');
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    warnings.push('VAPID keys unset - web push subscriptions cannot be created.');
  }
  if (!process.env.FRONTEND_ORIGIN) {
    warnings.push('FRONTEND_ORIGIN unset - CORS allows any origin (legacy mode). Set it in production.');
  }

  for (const w of warnings) console.warn(`[config] ${w}`);
  for (const p of problems) console.error(`[config] ${p}`);
})();

const app = express();

// Rate limiters need the real client IP; we sit behind one proxy/edge hop.
app.set('trust proxy', 1);

// Security headers (SEC-05). CSP ships in Report-Only mode first so violations
// can be observed in the console before enforcing; flip reportOnly to false
// after a monitoring window. Fonts are self-hosted, so no third-party font
// origins are needed.
// Set CSP_ENFORCE=true to flip from Report-Only to enforcing once the
// violation monitoring window is clean (ADR 0003). Default: report-only.
const cspEnforce = process.env.CSP_ENFORCE === 'true';

app.use(
  helmet({
    contentSecurityPolicy: {
      reportOnly: !cspEnforce,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https:'],
        workerSrc: ["'self'", 'blob:'],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

// Correlated request logging (BE-04).
app.use(requestId);

// CORS allowlist (SEC-04). Add allowed browser origins via FRONTEND_ORIGIN
// (comma-separated). When unset (e.g. local dev), all origins are permitted
// to preserve the previous behavior — set it in production deployments.
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = same-origin request, curl, or server-to-server.
      if (!origin) return callback(null, true);
      // Not configured = keep permissive legacy behavior until FRONTEND_ORIGIN is set.
      if (allowedOrigins.length === 2) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);
app.use(express.json({ limit: '10mb' }));

// Basic Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'HazardNet Backend', timestamp: new Date(), model: getModelInfo().version });
});

// Never serve model artifacts or preprocessing assets from the public server.
app.use(['/Models', '/models', '/hazardnet_fp32.tflite', '/hazardnet_int8.tflite', '/normalization_stats.json', '/labels.json'], (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// API Routes — layered rate limiting (SEC-01): a baseline on all /api routes
// plus tighter buckets on the expensive AI/inference endpoints.
app.use('/api', apiLimiter);
app.use('/api/v1/forecasts', forecastRoutes);
app.use('/api/advisory', advisoryRoutes);
app.use('/api/chat', aiLimiter, chatRoutes);
app.use('/api/agent', aiLimiter, agentRoutes);
app.use('/api/predict', predictLimiter, predictRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/conversions', conversionRoutes);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

// Serve static frontend build files
const distPath = path.resolve(process.cwd(), 'frontend', 'dist');

app.use(express.static(distPath));

// SPA fallback for non-API GET requests
app.get('*', (req, res, next) => {
  if (/\.(tflite|onnx|bin|h5|keras|pt|pth)$/i.test(req.path) || /(^|\/)models?\//i.test(req.path)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/health')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send('Application is building frontend assets, please refresh in a moment.');
  }
});

// 3001 keeps the API out of Vite's way in dev (vite.config.ts proxies /api here).
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HazardNet Backend running on port ${PORT}`);
});

export default app;

