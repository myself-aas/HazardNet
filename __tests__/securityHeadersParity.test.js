/**
 * @jest-environment node
 *
 * The places that describe the same security policy must agree.
 *
 * Since 2026-10-26 there are two, and the deployment target is Cloudflare Pages:
 *
 *   · `frontend/public/_headers` — the ONLY copy read by the deployment (Pages serves it
 *     from the asset root), pinned to `backend/security/csp.js` and to helmet;
 *   · `backend/server.js` — helmet, for the self-hosted/Docker deployment.
 *
 * They used to be four. The root/frontend `vercel.json` pair was deleted with the rest of
 * the Vercel deployment, and the Firebase Hosting block was retired the same day: the
 * `hazardnet-aas48424.web.app` origin was measured still serving the **2026-09-24** build
 * (`data/freshness.json` `built_at 2026-09-24T20:35:20Z`, 0 published alerts, 7/7 probe
 * checks failing), so keeping a second hosting policy "correct" was maintaining drift for a
 * deployment nobody wanted. `docs/ops/owner-actions.md` Action 22 tracks disabling it in the
 * console. The copies
 * drifted for real before: on 2026-10-04 the live site answered with only `Referrer-Policy`,
 * `X-Content-Type-Options` and `X-Frame-Options`, because the config serving production was
 * the one nobody had updated. This suite makes that drift visible in CI rather than only in a
 * live-header probe.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSP } from '../backend/security/csp.js';

const root = process.cwd();
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const readText = (rel) => readFileSync(join(root, rel), 'utf8');

const headerMap = (config, source = '**') => {
  const entry = (config.headers || []).find((h) => h.source === source);
  if (!entry) return {};
  return Object.fromEntries(entry.headers.map(({ key, value }) => [key, value]));
};

/**
 * Parse a Cloudflare `_headers` file into `matcher -> { header: value }`, ignoring `#`
 * comments and blank lines. Parsed rather than eyeballed because a header file Cloudflare
 * cannot read fails silently: the deployment then serves the origin's headers, which is the
 * state this suite exists to end.
 */
const parseHeadersFile = (text) => {
  const rules = {};
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      rules[current] = {};
      continue;
    }
    const match = /^\s+([A-Za-z0-9-]+):\s*(.+)$/.exec(line);
    expect(current).not.toBeNull();
    expect(match).not.toBeNull();
    rules[current][match[1]] = match[2].trim();
  }
  return rules;
};

const cfRules = parseHeadersFile(readText('frontend/public/_headers'));
const cloudflareHeaders = cfRules['/*'] || {};

describe('redirects', () => {
  const redirects = readText('frontend/public/_redirects');

  /* The legacy URL lived in each `vercel.json`'s `redirects` array until 2026-10-26. On
     Cloudflare Pages the equivalent is `_redirects`, which Vite copies into `dist/` from
     `frontend/public/`, so it is served from the asset root exactly as `_headers` is. */
  it('keeps the legacy /documentation redirect', () => {
    expect(redirects).toMatch(/^\/documentation\s+\/docs\s+301$/m);
  });

  /* Deliberately absent: a catch-all `/* /index.html 200`. The prerenderer emits a real file
     per route, and an unknown URL must reach Cloudflare's 404.html (the noindex shell that
     still boots the SPA) rather than answer 200 with the indexable homepage — the soft-404
     case __tests__/seoFoundations.test.js pins. */
  it('does not rewrite unknown URLs onto the indexable homepage', () => {
    expect(redirects).not.toMatch(/^\/\*\s+\/index\.html/m);
  });

  /* The site's primary read path is `/data/*.json` (ADR 0008) and `/api/*` belongs to a host
     this repository does not run. No rule may come between a request for either and its
     answer, and — because a `_redirects` rule that matches an existing asset can shadow it —
     no rule may name them at all. Asserted here rather than expressed as a `404` rule in the
     file itself, for the reason given in `_redirects`. */
  it('carries no rule that can intercept /api/ or /data/', () => {
    const rules = redirects
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    for (const rule of rules) {
      expect(rule).not.toMatch(/^\/(api|data)\//);
      expect(rule).not.toMatch(/\s\/(api|data)\//);
    }
  });
});

describe('security header parity', () => {
  const server = readText('backend/server.js');

  /* The five headers every public response must carry, with the exact value the policy
     requires. Written as a table rather than a list of names because "the header is present"
     was never the failure mode: on 2026-10-04 the live host answered with a weaker
     `Referrer-Policy` and no CSP at all, and a presence check would have passed. */
  const EXPECTED = {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
  };

  it('the Cloudflare _headers file sets every required header for all paths', () => {
    for (const [header, value] of Object.entries(EXPECTED)) {
      expect(`${header}: ${cloudflareHeaders[header]}`).toBe(`${header}: ${value}`);
    }
  });

  /* Cloudflare's parser is line-based: one rule per matcher, one `key: value` per line, a
     2,000-character limit per line and 100 rules per file. A CSP wrapped across two lines, or
     an overlong line, does not fail the deploy — the file simply stops applying, and the site
     serves the origin's headers. Both are silent failures, so both are asserted. */
  it('stays inside the limits Cloudflare Pages will actually parse', () => {
    const lines = readText('frontend/public/_headers').split('\n');
    expect(lines.length).toBeLessThanOrEqual(100);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(2000);
    }
    // One physical line per header: the CSP must not be folded.
    const cspLines = lines.filter((line) => line.includes('Content-Security-Policy:'));
    expect(cspLines).toHaveLength(1);
  });

  /* An all-origin source turns the policy into decoration. `https:` IS deliberately present —
     the client talks to several third-party APIs (Open-Meteo, ipapi.co, Firebase RTDB, the
     GitHub API) and a static CSP cannot know their hostnames at build time — but a bare `*`
     or a `data:`/`blob:` script source never appears. */
  it('never falls back to a bare wildcard source', () => {
    expect(cloudflareHeaders['Content-Security-Policy']).not.toMatch(/\s\*(\s|;|$)/);
    const scriptSrc = /script-src([^;]*)/.exec(cloudflareHeaders['Content-Security-Policy'])[1];
    expect(scriptSrc).not.toMatch(/https?:\s/);
  });

  /* The Firebase Hosting block was removed on 2026-10-26 (see the file comment). Pinned as a
     fact so nobody restores a second static-host policy by accident: with one deployment there
     is one place headers can be declared, and this suite is what keeps it honest. */
  it('declares no second static-host policy', () => {
    expect(readJson('firebase.json')).not.toHaveProperty('hosting');
  });

  it('keeps HSTS preload-eligible (includeSubDomains + preload + long max-age)', () => {
    for (const value of [cloudflareHeaders['Strict-Transport-Security']]) {
      expect(value).toMatch(/includeSubDomains/);
      expect(value).toMatch(/preload/);
      const maxAge = Number(/max-age=(\d+)/.exec(value)[1]);
      expect(maxAge).toBeGreaterThanOrEqual(63_072_000);
    }
  });

  it('keeps the CSP enforcing, and locks down the dangerous directives', () => {
    for (const value of [cloudflareHeaders['Content-Security-Policy']]) {
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
    const scriptSrc = /script-src([^;]*)/.exec(cloudflareHeaders['Content-Security-Policy'])[1];
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
    const csp = cloudflareHeaders['Content-Security-Policy'];
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

  it('is the same string in the shared module, the served file and helmet', async () => {
    const {
      cspDirectivesFromString,
      AUTH_SCRIPT_ORIGINS,
      ANALYTICS_SCRIPT_ORIGINS,
      INLINE_THEME_SCRIPT_HASH,
    } = await import('../backend/security/csp.js');

    // One source of truth: every host config carries exactly the canonical string.
    expect(cloudflareHeaders['Content-Security-Policy']).toBe(CSP);

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
    for (const headers of [cloudflareHeaders]) {
      expect(headers['Content-Security-Policy']).toContain(INLINE_THEME_SCRIPT_HASH);
    }
    expect(cspDirectivesFromString().scriptSrc).toContain(INLINE_THEME_SCRIPT_HASH);
  });

  /**
   * The Cloudflare file also carries the cache rules that used to live in `vercel.json`.
   * They are not security policy, but losing them silently would serve every visitor an
   * immutable cache header on `/data/*`, and the front door reads those artifacts on every
   * load.
   */
  it('carries the cache rules the old config supplied', () => {
    expect(cfRules['/assets/*']).toEqual(
      expect.objectContaining({ 'Cache-Control': 'public, max-age=31536000, immutable' })
    );
    expect(cfRules['/serviceWorker.js']).toEqual(expect.objectContaining({ 'Cache-Control': 'no-cache' }));
    expect(cfRules['/data/*']).toEqual(
      expect.objectContaining({ 'Cache-Control': 'public, max-age=0, must-revalidate' })
    );
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
