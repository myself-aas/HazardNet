/**
 * @jest-environment node
 *
 * Phase 6 (SEC-10): the four places that describe the same security policy must agree.
 *
 * The headers are declared four times — the root `vercel.json` (the deployed a-facing
 * surface), `frontend/vercel.json` (frontend-project scope), `firebase.json` (the surface
 * that actually answers `hazardnet.live` since the deployment moved to Firebase Hosting) and
 * `backend/server.js` (helmet, for the self-hosted/Docker deployment). They drifted before:
 * the CSP was added to a config that was not the one serving production.
 *
 * The Firebase copy is the one that drifted silently for real. On 2026-10-04 the live site
 * answered with only `Referrer-Policy`, `X-Content-Type-Options` and `X-Frame-Options`; the
 * `site-health.yml` security-header probe had been red on every scheduled run because
 * `Strict-Transport-Security` carried no `includeSubDomains` and there was no
 * `Content-Security-Policy` and no `Permissions-Policy` — all three present in both Vercel
 * configs, none of them present in `firebase.json`, which was not covered here. This suite
 * makes that drift visible in CI instead of only in a live-header probe.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const headerMap = (config, source = '/(.*)') => {
  const entry = (config.headers || []).find((h) => h.source === source);
  if (!entry) return {};
  return Object.fromEntries(entry.headers.map(({ key, value }) => [key, value]));
};

describe('redirect parity', () => {
  const rootCfg = readJson('vercel.json');
  const frontendCfg = readJson('frontend/vercel.json');
  const apexRedirect = (config) =>
    (config.redirects || []).find(
      (rule) =>
        rule.destination === 'https://www.hazardnet.live/:path*' &&
        (rule.has || []).some((condition) => condition.type === 'host' && condition.value === 'hazardnet.live')
    );

  // Phase 8: the canonical host is www. The apex answered 308 → www before this change only
  // because of a dashboard-level domain setting, which is not in the repository and not
  // reviewable; both configs now state the redirect. A canonical tag pointing at www while the
  // apex serves the same page under its own URL is the duplicate-content case this closes.
  it('redirects the apex host to www in both configs', () => {
    expect(apexRedirect(rootCfg)).toBeDefined();
    expect(apexRedirect(frontendCfg)).toBeDefined();
    expect(apexRedirect(rootCfg).permanent).toBe(true);
    expect(apexRedirect(frontendCfg).permanent).toBe(true);
  });

  it('keeps the legacy /documentation redirect in both configs', () => {
    for (const config of [rootCfg, frontendCfg]) {
      expect(
        (config.redirects || []).some(
          (rule) => rule.source === '/documentation' && rule.destination === '/docs' && rule.permanent
        )
      ).toBe(true);
    }
  });
});

describe('security header parity', () => {
  const rootCfg = readJson('vercel.json');
  const frontendCfg = readJson('frontend/vercel.json');
  const rootHeaders = headerMap(rootCfg);
  const frontendHeaders = headerMap(frontendCfg);
  // Firebase Hosting wraps its config in `hosting`, and its source patterns are globs (`**`)
  // rather than the `/(.*)` both Vercel configs use.
  const firebaseHeaders = headerMap(readJson('firebase.json').hosting, '**');
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

  it('the Firebase Hosting config sets every expected header for all paths', () => {
    // This is the config that serves production, so a missing header here is a live gap no
    // matter what the Vercel configs say — which is exactly how the 2026-10-04 probe failed.
    for (const header of EXPECTED) {
      expect(firebaseHeaders[header]).toBeTruthy();
    }
  });

  it('serves an identical browser policy from all three hosts', () => {
    for (const header of EXPECTED) {
      expect(frontendHeaders[header]).toBe(rootHeaders[header]);
      // Firebase Hosting cannot interpolate or share a value, so it must carry the same
      // literal string; `csp.js` equality below pins the absolute truth for the CSP itself.
      expect(firebaseHeaders[header]).toBe(rootHeaders[header]);
    }
  });

  it('keeps HSTS preload-eligible (includeSubDomains + preload + long max-age)', () => {
    for (const value of [
      rootHeaders['Strict-Transport-Security'],
      frontendHeaders['Strict-Transport-Security'],
      firebaseHeaders['Strict-Transport-Security'],
    ]) {
      expect(value).toMatch(/includeSubDomains/);
      expect(value).toMatch(/preload/);
      const maxAge = Number(/max-age=(\d+)/.exec(value)[1]);
      expect(maxAge).toBeGreaterThanOrEqual(63_072_000);
    }
  });

  it('keeps the CSP enforcing, and locks down the dangerous directives', () => {
    for (const value of [
      rootHeaders['Content-Security-Policy'],
      frontendHeaders['Content-Security-Policy'],
      firebaseHeaders['Content-Security-Policy'],
    ]) {
      expect(value).not.toMatch(/Content-Security-Policy-Report-Only/i);
      expect(value).toContain("default-src 'self'");
      expect(value).toContain("object-src 'none'");
      expect(value).toContain("frame-ancestors 'none'");
      expect(value).toContain("base-uri 'self'");
      // form-action must contain 'self' (may also contain auth origins)
      expect(value).toMatch(/form-action[^;]*'self'/);
      expect(value).toContain('upgrade-insecure-requests');
      // No data: or unsafe-eval in script-src — those turn policy into decoration
      const scriptSrc = /script-src([^;]*)/.exec(value)[1];
      expect(scriptSrc).not.toMatch(/data:/);
      expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
      // No bare wildcard token
      expect(scriptSrc.split(/\s+/)).not.toContain('*');
    }
  });

  it('allows no ad-network script origins', () => {
    // The site carries no advertising (2026-09-30). An allowlist that outlives the
    // thing it allowed is how these three configs drifted apart the first time, so
    // the absence is asserted rather than assumed.
    const scriptSrc = /script-src([^;]*)/.exec(rootHeaders['Content-Security-Policy'])[1];
    for (const origin of [
      'https://pagead2.googlesyndication.com',
      'https://partner.googleadservices.com',
      'https://tpc.googlesyndication.com',
      'https://www.googletagservices.com',
      'https://adservice.google.com',
      'googlesyndication.com',
    ]) {
      expect(scriptSrc).not.toContain(origin);
    }
    // Every allowlisted script origin that contains a dot should be https or a keyword
    for (const token of scriptSrc.split(/\s+/).filter((t) => t.includes('.'))) {
      if (token.startsWith("'")) continue;
      if (token.startsWith('https://')) continue;
      // Allow wildcard subdomains for auth (https://*.googleapis.com) — still https
      if (token.startsWith('https://*.')) continue;
      // Otherwise fail
      if (token.includes('.')) {
        // eslint-disable-next-line no-console
        console.log('Unexpected token in script-src:', token);
        expect(token.startsWith('https://')).toBe(true);
      }
    }
  });

  it('allows Firebase Auth origins for Google/GitHub sign-in', () => {
    const csp = rootHeaders['Content-Security-Policy'];
    // Auth script origins
    expect(csp).toContain('https://www.gstatic.com');
    expect(csp).toContain('https://apis.google.com');
    // Auth connect origins
    expect(csp).toContain('https://*.googleapis.com');
    expect(csp).toContain('https://*.firebaseapp.com');
    expect(csp).toContain('https://*.github.com');
    // Auth frame origins
    expect(csp).toContain('https://accounts.google.com');
    expect(csp).toContain('https://github.com');
  });

  it('is the same string in the shared module, both configs and helmet', async () => {
    const {
      CSP,
      cspDirectivesFromString,
      AUTH_SCRIPT_ORIGINS,
      ANALYTICS_SCRIPT_ORIGINS,
      INLINE_THEME_SCRIPT_HASH,
    } = await import('../backend/security/csp.js');

    // One source of truth: every host config carries exactly the canonical string.
    expect(rootHeaders['Content-Security-Policy']).toBe(CSP);
    expect(frontendHeaders['Content-Security-Policy']).toBe(CSP);
    expect(firebaseHeaders['Content-Security-Policy']).toBe(CSP);

    // helmet runs the parsed canonical policy, so the self-hosted deployment cannot drift.
    const directives = cspDirectivesFromString();
    expect(directives.objectSrc).toEqual(["'none'"]);
    expect(directives.frameAncestors).toEqual(["'none'"]);
    expect(directives.baseUri).toEqual(["'self'"]);
    // form-action now contains self plus auth origins
    expect(directives.formAction).toEqual(expect.arrayContaining(["'self'"]));
    expect(directives.formAction.join(' ')).toContain('firebaseapp.com');
    expect(directives.upgradeInsecureRequests).toEqual([]);
    // script-src is exactly 'self', the one inline-script hash, the auth origins and the
    // Cloudflare beacon host — nothing else. In particular still no 'unsafe-inline'.
    expect(directives.scriptSrc).toEqual([
      "'self'",
      INLINE_THEME_SCRIPT_HASH,
      ...AUTH_SCRIPT_ORIGINS,
      ...ANALYTICS_SCRIPT_ORIGINS,
    ]);
    expect(directives.scriptSrc).not.toContain("'unsafe-inline'");
    expect(server).toContain("from './security/csp.js'");
    expect(server).toContain('cspDirectivesFromString()');
    // No third-party script origin may be re-typed inline in server.js.
    expect(server).not.toContain('googlesyndication.com');
  });

  /**
   * `INLINE_THEME_SCRIPT_HASH` is the only thing standing between the theme-boot script in
   * `frontend/index.html` and being blocked at runtime: `script-src` carries no
   * `'unsafe-inline'` and no nonce, so an inline script is allowed by hash or not at all.
   *
   * The hash is over the verbatim text node between the tags, leading newline and trailing
   * indentation included. That makes it correct and brittle at the same time — reindenting
   * the script, or running a formatter over the HTML, changes the digest and silently
   * reinstates the dark/light flash the script exists to prevent. Nothing else in the build
   * would notice: Vite copies the script through byte-for-byte (verified — the digest of
   * `frontend/index.html`'s script and of the built `dist/index.html`'s are identical).
   *
   * So this recomputes the digest from the HTML instead of trusting the literal. If it
   * fails, the fix is to update the constant in `backend/security/csp.js` and re-run the
   * propagation to the three host configs above — not to loosen the policy.
   */
  it("hashes frontend/index.html's inline theme script, and the policy still carries it", async () => {
    const { INLINE_THEME_SCRIPT_HASH, cspDirectivesFromString } = await import(
      '../backend/security/csp.js'
    );
    const html = readFileSync(join(root, 'frontend/index.html'), 'utf8');

    // Only executable inline scripts are gated by script-src. The built page also carries
    // a `<script type="application/ld+json">` data block; browsers never run it, so it
    // needs no hash and must not be counted here.
    const inline = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attrs]) => !/\bsrc\s*=/.test(attrs))
      .filter(([, attrs]) => !/\btype\s*=\s*["']?application\/(ld\+)?json["']?/i.test(attrs))
      .map(([, , body]) => body);

    expect(inline).toHaveLength(1);
    expect(inline[0]).toContain('hazardnet.theme');

    const digest = createHash('sha256').update(inline[0], 'utf8').digest('base64');
    expect(INLINE_THEME_SCRIPT_HASH).toBe(`'sha256-${digest}'`);

    // A correct constant that no surface ships is still a blocked script.
    for (const headers of [rootHeaders, frontendHeaders, firebaseHeaders]) {
      expect(headers['Content-Security-Policy']).toContain(INLINE_THEME_SCRIPT_HASH);
    }
    expect(cspDirectivesFromString().scriptSrc).toContain(INLINE_THEME_SCRIPT_HASH);
  });

  /**
   * Cloudflare injects its Web Analytics beacon at the edge, so it is not in the
   * repository and cannot be reviewed here — but it is on every page of the live site and
   * was being blocked. Pin the origin so it cannot be dropped by accident, and so the
   * reason it is allowlisted stays next to the allowlist.
   */
  it('allows the Cloudflare Web Analytics beacon host', async () => {
    const { ANALYTICS_SCRIPT_ORIGINS, CSP } = await import('../backend/security/csp.js');
    expect(ANALYTICS_SCRIPT_ORIGINS).toContain('https://static.cloudflareinsights.com');
    expect(CSP).toContain('https://static.cloudflareinsights.com');
  });
});
