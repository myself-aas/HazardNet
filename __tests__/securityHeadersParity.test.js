/**
 * @jest-environment node
 *
 * Phase 6 (SEC-10): the three places that describe the same security policy must agree.
 *
 * The headers are declared three times — the root `vercel.json` (the deployed a-facing
 * surface), `frontend/vercel.json` (frontend-project scope), and `backend/server.js`
 * (helmet, for the self-hosted/Docker deployment). They drifted before: the CSP was added
 * to a config that was not the one serving production. This suite makes the drift visible
 * in CI instead of only in a live-header probe.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const headerMap = (config, source = '/(.*)') => {
  const entry = (config.headers || []).find((h) => h.source === source);
  if (!entry) return {};
  return Object.fromEntries(entry.headers.map(({ key, value }) => [key, value]));
};

describe('security header parity', () => {
  const rootCfg = readJson('vercel.json');
  const frontendCfg = readJson('frontend/vercel.json');
  const rootHeaders = headerMap(rootCfg);
  const frontendHeaders = headerMap(frontendCfg);
  const server = readFileSync(join(root, 'backend/server.js'), 'utf8');

  const EXPECTED = [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ];

  it('both vercel configs set every expected header for all paths', () => {
    for (const config of [rootHeaders, frontendHeaders]) {
      for (const header of EXPECTED) {
        expect(config[header]).toBeTruthy();
      }
    }
  });

  it('serves an identical browser policy from both configs', () => {
    for (const header of EXPECTED) {
      expect(frontendHeaders[header]).toBe(rootHeaders[header]);
    }
  });

  it('keeps HSTS preload-eligible (includeSubDomains + preload + long max-age)', () => {
    for (const value of [rootHeaders['Strict-Transport-Security'], frontendHeaders['Strict-Transport-Security']]) {
      expect(value).toMatch(/includeSubDomains/);
      expect(value).toMatch(/preload/);
      const maxAge = Number(/max-age=(\d+)/.exec(value)[1]);
      expect(maxAge).toBeGreaterThanOrEqual(63_072_000);
    }
  });

  it('keeps the CSP enforcing, and locks down the dangerous directives', () => {
    for (const value of [rootHeaders['Content-Security-Policy'], frontendHeaders['Content-Security-Policy']]) {
      expect(value).not.toMatch(/Content-Security-Policy-Report-Only/i);
      expect(value).toContain("default-src 'self'");
      expect(value).toContain("object-src 'none'");
      expect(value).toContain("frame-ancestors 'none'");
      expect(value).toContain("base-uri 'self'");
      expect(value).toContain("form-action 'self'");
      expect(value).toContain('upgrade-insecure-requests');
      // No wildcard or data: script source — those two are what turn a policy into
      // decoration.
      const scriptSrc = /script-src([^;]*)/.exec(value)[1];
      expect(scriptSrc).not.toMatch(/\*/);
      expect(scriptSrc).not.toMatch(/data:/);
      expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
    }
  });

  it('keeps the ad-network allowlist explicit and minimal', () => {
    const scriptSrc = /script-src([^;]*)/.exec(rootHeaders['Content-Security-Policy'])[1];
    for (const origin of ['https://pagead2.googlesyndication.com', 'https://adservice.google.com']) {
      expect(scriptSrc).toContain(origin);
    }
    // Every allowlisted script origin is https and none is a bare scheme wildcard.
    for (const token of scriptSrc.split(/\s+/).filter((t) => t.includes('.'))) {
      expect(token.startsWith('https://')).toBe(true);
    }
  });

  it('is the same string in the shared module, both configs and helmet', async () => {
    const { CSP, cspDirectivesFromString, AD_SCRIPT_ORIGINS } = await import('../backend/security/csp.js');

    // One source of truth: the two Vercel configs carry exactly the canonical string.
    expect(rootHeaders['Content-Security-Policy']).toBe(CSP);
    expect(frontendHeaders['Content-Security-Policy']).toBe(CSP);

    // helmet runs the parsed canonical policy, so the Docker deployment cannot drift.
    const directives = cspDirectivesFromString();
    expect(directives.objectSrc).toEqual(["'none'"]);
    expect(directives.frameAncestors).toEqual(["'none'"]);
    expect(directives.baseUri).toEqual(["'self'"]);
    expect(directives.formAction).toEqual(["'self'"]);
    expect(directives.upgradeInsecureRequests).toEqual([]);
    expect(directives.scriptSrc).toEqual(expect.arrayContaining(AD_SCRIPT_ORIGINS));
    expect(server).toContain("from './security/csp.js'");
    expect(server).toContain('cspDirectivesFromString()');
    // The ad allowlist must not be re-typed inline in server.js.
    expect(server).not.toContain('pagead2.googlesyndication.com');
  });
});
