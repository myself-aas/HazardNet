import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { execSync } from 'child_process';
import { corsMiddleware } from './middleware/cors.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import forecastRoutes from './routes/forecasts.js';
import chatRoutes from './routes/chat.js';
import predictRoutes from './routes/predict.js';
import pushRoutes from './routes/push.js';
import conversionRoutes from './routes/conversions.js';
import weatherRoutes from './routes/weather.js';
import alertRoutes from './routes/alerts.js';
import groundingRoutes from './routes/grounding.js';
import { liveVoiceRouter, setupLiveVoiceWebSocket } from './routes/liveVoice.js';
import metrics from './metrics.js';
import { refreshForecastAgeGauge } from './utils/forecastFreshness.js';
import { predictLimiter, apiLimiter, alertLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { attachFirebaseAuthUser, dynamicAiLimiter } from './middleware/firebaseAuth.js';
import helmet from 'helmet';
import { cspDirectivesFromString } from './security/csp.js';

dotenv.config();

const __dirname = process.cwd();

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
    const msg = 'FRONTEND_ORIGIN unset - CORS allows any origin in development, but FAILS CLOSED in production. Set it in production.';
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      problems.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  for (const w of warnings) console.warn(`[config] ${w}`);
  for (const p of problems) console.error(`[config] ${p}`);
})();

const app = express();

// Don't advertise the framework in responses (SEC-05: minimize fingerprinting).
app.disable('x-powered-by');

// Rate limiters need the real client IP; we sit behind one proxy/edge hop.
app.set('trust proxy', 1);

// Security headers (SEC-05). The policy itself lives in backend/security/csp.js so the
// self-hosted deployment cannot drift from the two Vercel configs (Phase 6 fix: they had
// drifted — the ad-network allowlist existed in one edition only).
// CSP mode (ADR 0003): enforcing in production by default; Report-Only in
// development. Override explicitly per environment with CSP_ENFORCE=true|false.
// connect-src includes wss: for Firebase realtime channels.
const cspEnforce = process.env.CSP_ENFORCE !== undefined
  ? process.env.CSP_ENFORCE === 'true'
  : (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production');

app.use(
  helmet({
    // No framing use-case exists; DENY matches CSP frame-ancestors 'none'.
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      reportOnly: !cspEnforce,
      directives: cspDirectivesFromString(),
    },
  })
);

// Correlated request logging (BE-04).
app.use(requestId);

// CORS allowlist (SEC-04) — see middleware/cors.js. Production fails closed:
// with FRONTEND_ORIGIN unset in a production runtime, cross-origin browser
// requests are rejected instead of reflected.
app.use(corsMiddleware());
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
  res.json({ status: 'healthy', service: 'HazardNet Backend', timestamp: new Date() });
});

// Never serve model artifacts or preprocessing assets from the public server.
// NOTE: the int8 entry is deliberately kept — no true INT8 model exists
// (model CONV_3D constraint, ADR 0007), but the external production conversion
// bundle still emits a misnamed optimized-FP32 file under that filename, and
// model artifacts must never be publicly served regardless of precision.
app.use(['/Models', '/models', '/hazardnet_fp32.tflite', '/hazardnet_int8.tflite', '/normalization_stats.json', '/labels.json'], (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// API Routes — layered rate limiting (SEC-01): a baseline on all /api routes
// plus tighter buckets on the expensive AI/inference endpoints.
app.use('/api', apiLimiter);
app.use('/api/v1/forecasts', forecastRoutes);
app.use('/api/chat', attachFirebaseAuthUser, dynamicAiLimiter, chatRoutes);
app.use('/api/grounding', attachFirebaseAuthUser, dynamicAiLimiter, groundingRoutes);
app.use('/api/predict', predictLimiter, predictRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/conversions', conversionRoutes);
app.use('/api/v1/weather', weatherRoutes);
// Alert engine + §1.6 review surface. Identity is attached but never required:
// published alerts are public (PRODUCT_SPEC §1.3), the review queue is not.
app.use('/api/v1/alerts', attachFirebaseAuthUser, alertLimiter, alertRoutes);
app.use('/api/live-voice', liveVoiceRouter);

// Prometheus metrics endpoint. The forecast-age gauge is refreshed here
// (scrape-driven, 60s-cached store probe — see utils/forecastFreshness.js).
app.get('/metrics', async (req, res) => {
  try {
    await refreshForecastAgeGauge();
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

export default app;

// Bind a port only when executed directly (`node backend/server.js`) — never
// on import, so supertest suites can load the app without occupying a port
// (parallel suites would otherwise collide with EADDRINUSE).
const invokedAsScript = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  // Bind to port 3000 for AI Studio container routing (do NOT change or override)
  const PORT = 3000;

  const freePort = (targetPort) => {
    try {
      const ssOut = execSync(`ss -tulpn 2>/dev/null | grep :${targetPort} || true`, { encoding: 'utf8' });
      const pids = [...ssOut.matchAll(/pid=(\d+)/g)].map((m) => parseInt(m[1], 10));
      for (const pid of pids) {
        if (pid && pid !== process.pid && pid !== process.ppid) {
          console.warn(`[server] Freeing port ${targetPort}: terminating stale process ${pid}...`);
          try { process.kill(pid, 'SIGKILL'); } catch (_) {}
        }
      }
    } catch (_) {}
  };

  const startServer = (port, maxRetries = 5, retryDelayMs = 1000) => {
    let retries = 0;
    freePort(port);

    const server = http.createServer(app);
    setupLiveVoiceWebSocket(server);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        retries++;
        console.warn(`[server] Port ${port} is in use (EADDRINUSE). Attempting to clear stale socket (${retries}/${maxRetries})...`);
        freePort(port);
        if (retries <= maxRetries) {
          setTimeout(() => {
            try { server.close(); } catch (_) {}
            server.listen(port, '0.0.0.0');
          }, retryDelayMs);
        } else {
          console.error(`[server] Port ${port} remained in use after ${maxRetries} attempts.`);
          process.exit(1);
        }
      } else {
        console.error('[server] Fatal server error:', err);
        process.exit(1);
      }
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`HazardNet Backend running on port ${port}`);
    });

    const shutdown = (signal) => {
      console.log(`[server] Received ${signal}, closing server...`);
      server.close(() => {
        console.log('[server] HTTP server closed gracefully.');
        process.exit(0);
      });
      setTimeout(() => {
        console.warn('[server] Shutdown timeout expired, exiting.');
        process.exit(0);
      }, 3000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  startServer(PORT);
}

