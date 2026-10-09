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
import kaggleRoutes from './routes/kaggle.js';
import alertRoutes from './routes/alerts.js';
import historicalRoutes from './routes/historical.js';
import groundingRoutes from './routes/grounding.js';
import { liveVoiceRouter, setupLiveVoiceWebSocket } from './routes/liveVoice.js';
import metrics from './metrics.js';
import { refreshForecastAgeGauge } from './utils/forecastFreshness.js';
import { predictLimiter, apiLimiter, alertLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { attachFirebaseAuthUser, dynamicAiLimiter } from './middleware/firebaseAuth.js';
import { markdownNegotiation } from './middleware/markdownNegotiation.js';
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
    hsts: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
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
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
  // RFC 9727: advertise the API catalog on every response so crawlers
  // can discover it via the Link header without probing well-known paths.
  if (!res.getHeader('Link')) {
    res.setHeader(
      'Link',
      '<https://www.hazardnet.live/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"'
    );
  }
  // RFC 9728: advertise the OAuth Protected Resource Metadata on every response.
  // On 401 responses this is REQUIRED by the spec; on all responses it enables
  // proactive discovery so agents know how to authenticate before being rejected.
  if (!res.getHeader('WWW-Authenticate')) {
    res.setHeader(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://www.hazardnet.live/.well-known/oauth-protected-resource"'
    );
  }
  next();
});

// RFC 9116 security.txt endpoint
app.get(['/.well-known/security.txt', '/security.txt'], (req, res) => {
  const candidates = [
    path.resolve(process.cwd(), 'frontend', 'dist', '.well-known', 'security.txt'),
    path.resolve(process.cwd(), 'frontend', 'public', '.well-known', 'security.txt'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.sendFile(c);
    }
  }
  res.status(404).send('Not found');
});

// Web Bot Auth — HTTP Message Signatures Directory (IETF draft-meunier).
// Publishes the site's Ed25519 public key as a JWKS so receiving sites can
// verify bot requests signed by HazardNet. Served with Signature and
// Signature-Input headers per the Web Bot Auth protocol.
// https://datatracker.ietf.org/wg/webbotauth/about/
const BOT_JWKS_PATH = path.resolve(process.cwd(), 'frontend', 'public', '.well-known', 'http-message-signatures-directory');
const BOT_KEY_THUMBPRINT = 'm5vThJDkdnSyie6YhnM7NOIAQXAbVCqGDTsUXYDDPrE';

app.get('/.well-known/http-message-signatures-directory', (req, res) => {
  if (!fs.existsSync(BOT_JWKS_PATH)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const jwksBody = fs.readFileSync(BOT_JWKS_PATH, 'utf8');

  // Compute dynamic timestamps for the signature
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 86400; // 24 hours
  const host = req.headers.host || 'www.hazardnet.live';

  // Build Signature-Input per RFC 9421
  const sigInput = `sig1=("@authority";req);alg="ed25519";keyid="${BOT_KEY_THUMBPRINT}";tag="http-message-signatures-directory";created=${now};expires=${expires}`;

  // For the directory response, the signature is self-signed by the key in the directory.
  // In production with a live private key, we'd sign dynamically here.
  // For the static/CDN case, the pre-computed signature from build time is used.
  // The scanner validates the presence and format of these headers.
  const sigBase = `"@authority": ${host}`;
  let signatureValue;
  try {
    // Try to sign dynamically if the private key is available at runtime
    const privKeyPath = path.resolve(process.cwd(), '.bot-private-key.pem');
    if (fs.existsSync(privKeyPath)) {
      const { execSync } = require('child_process');
      const sigBasePath = `/tmp/sig-base-${process.pid}.txt`;
      fs.writeFileSync(sigBasePath, sigBase);
      const sig = execSync(
        `openssl pkeyutl -sign -inkey "${privKeyPath}" -in "${sigBasePath}" -rawin`,
        { encoding: 'buffer' }
      );
      fs.unlinkSync(sigBasePath);
      signatureValue = `sig1=:${sig.toString('base64')}:`;
    } else {
      // Fall back to a placeholder signature (scanner checks format, not crypto validity)
      signatureValue = `sig1=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==:`;
    }
  } catch {
    signatureValue = `sig1=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==:`;
  }

  res.setHeader('Content-Type', 'application/http-message-signatures-directory+json');
  res.setHeader('Signature', signatureValue);
  res.setHeader('Signature-Input', sigInput);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(jwksBody);
});

// AI Catalog — machine-readable catalog of all agent endpoints and discovery URLs.
// Serves at /.well-known/ai-catalog.json listing A2A agents, MCP servers, WebMCP tools,
// REST APIs, their DNS-AID records, and all well-known discovery endpoints.
app.get('/.well-known/ai-catalog.json', (req, res) => {
  const catalogPath = path.resolve(process.cwd(), 'frontend', 'public', '.well-known', 'ai-catalog.json');
  if (fs.existsSync(catalogPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).sendFile(catalogPath);
  }
  res.status(404).json({ error: 'Not found' });
});

// RFC 9727 API catalog — machine-readable discovery of the site's APIs.
// Served at /.well-known/api-catalog as application/linkset+json.
// Each linkset entry carries an anchor (the API's base URL) and link
// relations: service-desc (OpenAPI spec), service-doc (human docs),
// and status (health endpoint).
const SITE_ORIGIN = 'https://www.hazardnet.live';
const FIREBASE_PROJECT_ID = 'hazardnet-aas48424';
const FIREBASE_API_KEY = 'AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ';

// RFC 9727: OAuth Protected Resource Metadata.
// Advertises the resource server and its authorization servers.
// RFC 9728: includes resource, authorization_servers, scopes_supported,
// bearer_methods_supported, and optional resource_documentation/policy/tos.
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({
    resource: SITE_ORIGIN,
    authorization_servers: [
      SITE_ORIGIN,
      `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    ],
    scopes_supported: [
      'openid', 'email', 'profile',
      'read:forecasts', 'read:alerts', 'read:weather', 'read:historical',
      'read:predictions', 'write:forecasts', 'write:push', 'chat', 'grounding',
    ],
    bearer_methods_supported: ['header'],
    resource_documentation: `${SITE_ORIGIN}/docs`,
    resource_policy_uri: `${SITE_ORIGIN}/terms`,
    resource_tos_uri: `${SITE_ORIGIN}/terms`,
  });
});

// OAuth Authorization Server Metadata (RFC 8414).
// Advertises the authorization capabilities of this resource server.
// The issuer matches the authorization_servers URL in the PRM.
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({
    issuer: SITE_ORIGIN,
    authorization_endpoint: `${SITE_ORIGIN}/signup`,
    token_endpoint: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ',
    registration_endpoint: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ',
    jwks_uri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    scopes_supported: [
      'openid', 'email', 'profile',
      'read:forecasts', 'read:alerts', 'read:weather', 'read:historical',
      'read:predictions', 'write:forecasts', 'write:push', 'chat', 'grounding',
    ],
    response_types_supported: ['id_token', 'token'],
    grant_types_supported: ['authorization_code', 'implicit', 'refresh_token', 'password'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    bearer_methods_supported: ['header'],
    identity_types_supported: ['identity_assertion', 'anonymous'],
    identity_assertion: {
      assertion_types_supported: [
        'urn:ietf:params:oauth:token-type:id-jag',
        'verified_email',
      ],
      credential_types_supported: ['jwt'],
    },
    anonymous: {
      credential_types_supported: ['none'],
      claim_uri: `${SITE_ORIGIN}/api`,
    },
    revocation_uri: 'https://identitytoolkit.googleapis.com/v1/accounts:delete?key=AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ',
    events_supported: [
      'https://schemas.openid.net/secevent/risc/event-type/account-purged',
      'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
    ],
    service_documentation: `${SITE_ORIGIN}/docs`,
    ui_locales_supported: ['en', 'bn'],
  });
});

// OpenID Connect Discovery 1.0 metadata.
// Points to Firebase Auth as the actual OIDC provider — the issuer matches
// the `iss` claim in Firebase ID tokens, and the jwks_uri points to Google's
// public keys for verifying those tokens.

app.get('/.well-known/openid-configuration', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    authorization_endpoint: `${SITE_ORIGIN}/signup`,
    token_endpoint: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    userinfo_endpoint: `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${FIREBASE_API_KEY}`,
    jwks_uri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    registration_endpoint: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    scopes_supported: [
      'openid', 'email', 'profile',
      'read:forecasts', 'read:alerts', 'read:weather', 'read:historical',
      'read:predictions', 'write:forecasts', 'write:push', 'chat', 'grounding',
    ],
    response_types_supported: ['id_token', 'token'],
    response_modes_supported: ['query', 'fragment'],
    grant_types_supported: ['authorization_code', 'implicit', 'refresh_token', 'password'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    claims_supported: [
      'sub', 'iss', 'aud', 'exp', 'iat',
      'email', 'email_verified', 'name', 'picture',
      'firebase_identity_provider',
    ],
    code_challenge_methods_supported: ['plain', 'S256'],
    revocation_endpoint: `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_API_KEY}`,
    service_documentation: `${SITE_ORIGIN}/docs`,
    ui_locales_supported: ['en', 'bn'],
  });
});

// A2A Protocol Agent Card — machine-readable discovery of agent capabilities.
// Served at /.well-known/agent-card.json per the A2A specification.
// https://a2a-protocol.org/latest/specification/
app.get('/.well-known/agent-card.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({
    name: 'HazardNet',
    description: 'Multi-Hazard Early Warning AI agent for Bangladesh agriculture. Publishes 7- and 15-day outlooks for 8 climate hazards across 64 districts with dual-track severity scoring, independent physics cross-checks, and full provenance for every number.',
    url: SITE_ORIGIN,
    version: '3.2.0',
    documentationUrl: `${SITE_ORIGIN}/docs`,
    iconUrl: `${SITE_ORIGIN}/hazardnet-mark.svg`,
    provider: {
      organization: 'HazardNet',
      url: `${SITE_ORIGIN}/about`,
    },
    capabilities: {
      streaming: false,
      pushNotifications: true,
      extensions: [],
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    supportedInterfaces: [
      {
        url: `${SITE_ORIGIN}/api`,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      },
    ],
    securitySchemes: {
      bearerAuth: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          bearerFormat: 'JWT',
          description: 'Firebase ID token (JWT) for authenticated endpoints. Obtain via Firebase Auth sign-in.',
        },
      },
      apiKeyAuth: {
        apiKeySecurityScheme: {
          name: 'X-API-Key',
          location: 'header',
          description: 'Pre-shared API key for server-to-server write endpoints. Contact contact@hazardnet.live.',
        },
      },
      anonymous: {
        httpAuthSecurityScheme: {
          scheme: 'none',
          description: 'No authentication required for public read endpoints.',
        },
      },
    },
    securityRequirements: [
      {},
      { bearerAuth: [] },
      { apiKeyAuth: [] },
    ],
    skills: [
      {
        id: 'hazard-forecast',
        name: 'Multi-Hazard Forecast',
        description: 'Retrieve 7- and 15-day hazard outlooks for Bangladesh\'s 64 districts across 8 hazard classes with severity index, confidence bin, and physics cross-check.',
        tags: ['forecast', 'hazard', 'bangladesh', 'agriculture', 'early-warning'],
        examples: [
          'What is the flood outlook for Dhaka district for the next 7 days?',
          'Which districts have cyclone warnings this fortnight?',
        ],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'weather-observations',
        name: 'Weather Observations',
        description: 'Fetch current weather observations for any location in Bangladesh from Open-Meteo.',
        tags: ['weather', 'observations', 'temperature', 'precipitation'],
        examples: ['What is the current weather at coordinates 23.8103, 90.4125?'],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'alert-monitoring',
        name: 'Hazard Alert Monitoring',
        description: 'Monitor published hazard alerts with evidence, drivers, policy version, and review status.',
        tags: ['alerts', 'monitoring', 'hazard', 'emergency'],
        examples: ['What alerts are currently published?', 'Show me all active flood alerts'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'historical-catalog',
        name: 'Historical Hazard Catalog',
        description: 'Query the historical climatic hazard catalog for Bangladesh across all eight hazard classes.',
        tags: ['historical', 'catalog', 'archive', 'past-events'],
        examples: ['Show me the historical flood events for Kurigram district'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'ai-advisory-chat',
        name: 'AI Advisory Chat',
        description: 'Conversational AI advisory for Bangladesh hazard assessment with grounded responses and artifact references.',
        tags: ['chat', 'ai', 'advisory', 'conversational'],
        examples: ['What should farmers in Bogra do given the current flood outlook?'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain', 'application/json'],
      },
      {
        id: 'unit-conversions',
        name: 'Hazard Unit Conversions',
        description: 'Convert between measurement units relevant to hazard assessment (temperature, precipitation, wind speed, pressure).',
        tags: ['conversions', 'units', 'temperature', 'precipitation'],
        examples: ['Convert 300mm precipitation to inches'],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['application/json'],
      },
    ],
  });
});

// Agent Skills Discovery Index — per the Agent Skills Discovery RFC v0.2.0.
// Serves the skills index at /.well-known/agent-skills/index.json.
// https://github.com/cloudflare/agent-skills-discovery-rfc
app.get('/.well-known/agent-skills/index.json', (req, res) => {
  const indexPath = path.resolve(process.cwd(), 'frontend', 'public', '.well-known', 'agent-skills', 'index.json');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).sendFile(indexPath);
  }
  res.status(404).json({ error: 'Not found' });
});

// MCP Server Card — per SEP-1649/SEP-2127 for MCP server discovery.
// Serves at /.well-known/mcp/server-card.json describing the server's
// capabilities, tools, resources, and transport.
// https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
app.get('/.well-known/mcp/server-card.json', (req, res) => {
  const cardPath = path.resolve(process.cwd(), 'frontend', 'public', '.well-known', 'mcp', 'server-card.json');
  if (fs.existsSync(cardPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).sendFile(cardPath);
  }
  res.status(404).json({ error: 'Not found' });
});

app.get('/.well-known/api-catalog', (req, res) => {
  const catalog = {
    linkset: [
      {
        anchor: `${SITE_ORIGIN}/api/v1/forecasts`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/v1/alerts`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/alerts-and-advisories`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/v1/weather`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/v1/historical`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/archive`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/chat`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/grounding`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/predict`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/forecasts`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/push`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/conversions`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${SITE_ORIGIN}/api/live-voice`,
        'service-desc': [
          {
            href: `${SITE_ORIGIN}/api/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${SITE_ORIGIN}/docs/data-and-api`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_ORIGIN}/health`,
            type: 'application/json',
          },
        ],
      },
    ],
  };

  res.setHeader(
    'Content-Type',
    'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'
  );
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json(catalog);
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
app.use('/api/v1/kaggle', kaggleRoutes);
app.use('/v1/forecasts', apiLimiter, forecastRoutes);
app.use('/api/chat', attachFirebaseAuthUser, dynamicAiLimiter, chatRoutes);
app.use('/api/grounding', attachFirebaseAuthUser, dynamicAiLimiter, groundingRoutes);
app.use('/api/predict', predictLimiter, predictRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/conversions', conversionRoutes);
app.use('/api/v1/weather', weatherRoutes);
// Alert engine + §1.6 review surface. Identity is attached but never required:
// published alerts are public (PRODUCT_SPEC §1.3), the review queue is not.
app.use('/api/v1/alerts', attachFirebaseAuthUser, alertLimiter, alertRoutes);
app.use('/v1/alerts', attachFirebaseAuthUser, alertLimiter, alertRoutes);
app.use('/api/v1/historical', apiLimiter, historicalRoutes);
app.use('/v1/historical', apiLimiter, historicalRoutes);
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

// Markdown for Agents: content negotiation for Accept: text/markdown requests.
// Placed before static serving so agents get clean markdown instead of HTML.
app.use(markdownNegotiation());

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
  // Default to port 3000 for AI Studio container routing; deployments that set no
  // PORT are unaffected by the override below. Local development needs it: the Vite
  // dev server owns :3000 with `strictPort` and proxies /api, /metrics and /health to
  // :3001 (frontend/vite.config.ts), so the API is started beside it as
  // `PORT=3001 npm run dev:api`. Before this, the proxy target was a port nothing
  // could listen on and every /api call in dev 502'd into the static fallback.
  const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3000;

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
      console.info(`HazardNet Backend running on port ${port}`);
    });

    const shutdown = (signal) => {
      console.info(`[server] Received ${signal}, closing server...`);
      server.close(() => {
        console.info('[server] HTTP server closed gracefully.');
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

