/** @jest-environment node */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import {
  PROTECTED_RESOURCE_PATH,
  PROTECTED_RESOURCE_METADATA,
  PROTECTED_RESOURCE_METADATA_URL,
  PROTECTED_RESOURCE_CACHE_CONTROL,
  RESOURCE_METADATA_CHALLENGE,
  FIREBASE_AUTH_ISSUER,
  applyResourceMetadataChallenge,
} from '../backend/security/oauthProtectedResource.js';
import { oauthResourceMetadataChallenge } from '../backend/middleware/oauthResourceMetadata.js';
import { onRequest as edgeMetadata } from '../functions/.well-known/oauth-protected-resource.ts';
import { onRequest as edgeMiddleware } from '../functions/_middleware.ts';

const root = process.cwd();
const origin = 'https://www.hazardnet.live';
const staticPath = join(root, 'frontend/public/.well-known/oauth-protected-resource');
const published = JSON.parse(readFileSync(staticPath, 'utf8'));
const app = require('../backend/server').default;
const { alertLimiter } = require('../backend/middleware/rateLimit.js');
const previousKey = process.env.BACKEND_API_KEY;

beforeAll(() => {
  // A dummy value makes the existing alert write guard return 401 rather than
  // its fail-closed 503. No credential is sent to Firebase or any other service.
  process.env.BACKEND_API_KEY = 'test-oauth-resource-key';
});

afterAll(() => {
  if (previousKey === undefined) delete process.env.BACKEND_API_KEY;
  else process.env.BACKEND_API_KEY = previousKey;
});

beforeEach(() => {
  for (const key of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) alertLimiter.resetKey(key);
});

function edgeRequest(method = 'GET') {
  return edgeMetadata({ request: new Request(`${origin}${PROTECTED_RESOURCE_PATH}`, { method }) });
}

function routeMatches(rule, pathname) {
  const escaped = rule.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.*')}$`).test(pathname);
}

describe('OAuth Protected Resource Metadata (RFC 9728)', () => {
  it('publishes one required-resource document with the owner-selected Firebase issuer', () => {
    expect(PROTECTED_RESOURCE_PATH).toBe('/.well-known/oauth-protected-resource');
    expect(published).toEqual(PROTECTED_RESOURCE_METADATA);
    expect(published.resource).toBe(origin);
    expect(new URL(published.resource).protocol).toBe('https:');
    expect(new URL(published.resource).search).toBe('');
    expect(new URL(published.resource).hash).toBe('');
    expect(published.authorization_servers).toEqual([FIREBASE_AUTH_ISSUER]);
    expect(published.authorization_servers).not.toContain(origin);
    expect(published.scopes_supported).toEqual(expect.arrayContaining([
      'openid', 'read:forecasts', 'read:historical', 'chat',
    ]));
    expect(new Set(published.scopes_supported).size).toBe(published.scopes_supported.length);
    expect(published.bearer_methods_supported).toEqual(['header']);
  });

  it('serves JSON from the Pages Function without requiring authentication', async () => {
    const response = await edgeRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe(PROTECTED_RESOURCE_CACHE_CONTROL);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(await response.json()).toEqual(published);
  });

  it('supports HEAD and explicitly rejects writes on the edge', async () => {
    const head = await edgeRequest('HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await edgeRequest(method);
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expect(await response.json()).toEqual({ error: 'method not allowed' });
    }
  });

  it('serves the same document and method contract from Express', async () => {
    const response = await request(app).get(PROTECTED_RESOURCE_PATH);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe(PROTECTED_RESOURCE_CACHE_CONTROL);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(response.body).toEqual(published);

    const head = await request(app).head(PROTECTED_RESOURCE_PATH);
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
    const post = await request(app).post(PROTECTED_RESOURCE_PATH).send({});
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET, HEAD');
    expect(post.body).toEqual({ error: 'method not allowed' });
  });

  it('keeps the extensionless static fallback typed and cache-consistent', () => {
    const text = readFileSync(join(root, 'frontend/public/_headers'), 'utf8');
    const rule = text.split('\n').find((line) => line === PROTECTED_RESOURCE_PATH);
    expect(rule).toBe(PROTECTED_RESOURCE_PATH);
    const section = text.slice(text.indexOf(`\n${rule}\n`)).split(/\n(?=\S)/).slice(0, 2).join('\n');
    expect(section).toContain('Content-Type: application/json; charset=utf-8');
    expect(section).toContain(`Cache-Control: ${PROTECTED_RESOURCE_CACHE_CONTROL}`);
    expect(section).toContain('Access-Control-Allow-Origin: *');
  });

  it('invokes the Function for PRM while keeping every other published well-known asset static', () => {
    const routes = JSON.parse(readFileSync(join(root, 'frontend/public/_routes.json'), 'utf8'));
    expect(routes.include.some((rule) => routeMatches(rule, PROTECTED_RESOURCE_PATH))).toBe(true);
    expect(routes.exclude.some((rule) => routeMatches(rule, PROTECTED_RESOURCE_PATH))).toBe(false);

    function walk(dir, prefix = '/.well-known') {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const pathname = `${prefix}/${entry.name}`;
        return entry.isDirectory() ? walk(join(dir, entry.name), pathname) : [pathname];
      });
    }
    const siblings = walk(join(root, 'frontend/public/.well-known'))
      .filter((pathname) => pathname !== PROTECTED_RESOURCE_PATH);
    expect(siblings.length).toBeGreaterThan(10);
    for (const pathname of siblings) {
      expect(routes.exclude.some((rule) => routeMatches(rule, pathname))).toBe(true);
    }
  });

  it('keeps the published skill descriptions and their SHA-256 digests current', () => {
    const base = join(root, 'frontend/public/.well-known/agent-skills');
    const index = JSON.parse(readFileSync(join(base, 'index.json'), 'utf8'));
    for (const skill of index.skills) {
      const pathname = join(root, 'frontend/public', skill.url);
      const digest = createHash('sha256').update(readFileSync(pathname)).digest('hex');
      expect(skill.digest).toBe(`sha256:${digest}`);
    }
    const skill = readFileSync(join(base, 'oauth-protected-resource/SKILL.md'), 'utf8');
    expect(skill).toContain(FIREBASE_AUTH_ISSUER);
    expect(skill).toContain('401');
    expect(skill).not.toContain('every HTTP response includes');
  });
});

describe('RFC 9728 resource_metadata discovery challenge', () => {
  it('adds the canonical metadata URL only to an unchallenged Web 401', () => {
    for (const status of [200, 400, 403, 404, 503]) {
      const headers = applyResourceMetadataChallenge(new Headers(), status);
      expect(headers.get('WWW-Authenticate')).toBeNull();
    }
    const headers = applyResourceMetadataChallenge(new Headers(), 401);
    expect(headers.get('WWW-Authenticate')).toBe(RESOURCE_METADATA_CHALLENGE);
    expect(headers.get('WWW-Authenticate')).toBe(`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`);
    const existing = new Headers({ 'WWW-Authenticate': 'Bearer realm="review", error="invalid_token"' });
    expect(applyResourceMetadataChallenge(existing, 401).get('WWW-Authenticate'))
      .toBe('Bearer realm="review", error="invalid_token"');
  });

  it('applies the challenge through the real Pages middleware without changing the body', async () => {
    const response = await edgeMiddleware({
      request: new Request(`${origin}/api/v1/alerts/review`),
      next: async () => Response.json({ error: 'sign in' }, { status: 401 }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(RESOURCE_METADATA_CHALLENGE);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual({ error: 'sign in' });
  });

  it('does not replace a route-specific Pages challenge or challenge a public response', async () => {
    const challenge = 'Bearer realm="review", error="invalid_token"';
    const unauthorized = await edgeMiddleware({
      request: new Request(`${origin}/api/v1/alerts/review`),
      next: async () => new Response(null, { status: 401, headers: { 'WWW-Authenticate': challenge } }),
    });
    expect(unauthorized.headers.get('www-authenticate')).toBe(challenge);
    expect(unauthorized.body).toBeNull();
    const ok = await edgeMiddleware({
      request: new Request(`${origin}${PROTECTED_RESOURCE_PATH}`),
      next: async () => edgeRequest(),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('www-authenticate')).toBeNull();
    expect(await ok.json()).toEqual(published);
  });

  it('adds the hint at Express final-header time and preserves explicit challenges', async () => {
    const challenge = 'Bearer realm="review", error="invalid_token"';
    const sample = express();
    sample.use(oauthResourceMetadataChallenge);
    sample.get('/unauthorized', (_req, res) => res.status(401).json({ error: 'sign in' }));
    sample.get('/forbidden', (_req, res) => res.sendStatus(403));
    sample.get('/custom', (_req, res) => res.set('WWW-Authenticate', challenge).sendStatus(401));
    sample.get('/raw', (_req, res) => {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="operations"' });
      res.end();
    });

    const unauthorized = await request(sample).get('/unauthorized');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers['www-authenticate']).toBe(RESOURCE_METADATA_CHALLENGE);
    const forbidden = await request(sample).get('/forbidden');
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers['www-authenticate']).toBeUndefined();
    expect((await request(sample).get('/custom')).headers['www-authenticate']).toBe(challenge);
    expect((await request(sample).get('/raw')).headers['www-authenticate']).toBe('Basic realm="operations"');
  });

  it('works on a real existing Express 401 without changing its authorization decision', async () => {
    const response = await request(app).get('/api/v1/alerts/transports');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized: Missing API key');
    expect(response.headers['www-authenticate']).toBe(RESOURCE_METADATA_CHALLENGE);
    const publicResponse = await request(app).get('/api/v1/alerts/policy');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers['www-authenticate']).toBeUndefined();
  });
});
