/**
 * @jest-environment node
 *
 * Phase 6 (SEC-15): the disclosure surface.
 *
 * `frontend/public/.well-known/security.txt` is the one security artefact a stranger can
 * read without a repository account, and it is easy for it to rot silently: an `Expires`
 * date that has passed makes the file non-conformant (RFC 9116 requires removal or
 * renewal), and a contact that exists in the file but not in `SECURITY.md` means a
 * reporter gets two different answers. Both are checked here, along with the routing rule
 * that decides whether the file is even served.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SECURITY_TXT = join(ROOT, 'frontend/public/.well-known/security.txt');
const DIST_SECURITY_TXT = join(ROOT, 'frontend/dist/.well-known/security.txt');
const SECURITY_MD = join(ROOT, 'SECURITY.md');

const parse = (text) => text
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const index = line.indexOf(':');
    return { field: line.slice(0, index), value: line.slice(index + 1).trim() };
  });

const valuesOf = (entries, field) => entries.filter((e) => e.field === field).map((e) => e.value);

describe('security.txt (RFC 9116)', () => {
  const raw = readFileSync(SECURITY_TXT, 'utf8');
  const entries = parse(raw);

  it('declares the required fields', () => {
    expect(valuesOf(entries, 'Contact').length).toBeGreaterThan(0);
    expect(valuesOf(entries, 'Expires')).toHaveLength(1);
  });

  it('points at a reachable kind of contact', () => {
    for (const contact of valuesOf(entries, 'Contact')) {
      expect(contact).toMatch(/^mailto:[^@\s]+@[^@\s]+$|^https:\/\//);
    }
  });

  it('has not expired, and is not dated absurdly far out', () => {
    const expires = new Date(valuesOf(entries, 'Expires')[0]);
    expect(Number.isNaN(expires.getTime())).toBe(false);
    const now = Date.now();
    expect(expires.getTime()).toBeGreaterThan(now);
    // RFC 9116 asks for less than a year; a decade-long expiry is the file being abandoned.
    expect(expires.getTime() - now).toBeLessThan(366 * 24 * 60 * 60 * 1000);
  });

  it('names this deployment as canonical, and a policy page that exists in the app', () => {
    expect(valuesOf(entries, 'Canonical')).toEqual(['https://www.hazardnet.live/.well-known/security.txt']);
    const policy = valuesOf(entries, 'Policy');
    expect(policy).toHaveLength(1);
    expect(policy[0]).toMatch(/^https:\/\/www\.hazardnet\.live\//);
    // The public route it points at has to be one the router actually serves.
    const routes = JSON.parse(readFileSync(join(ROOT, 'frontend/src/content/site-routes.json'), 'utf8'));
    const path = new URL(policy[0]).pathname.replace(/\/$/, '') || '/';
    const known = routes.routes.some((route) => (route.path.replace(/\/$/, '') || '/') === path);
    expect(known).toBe(true);
  });

  it('declares the languages the site is actually written in', () => {
    const languages = valuesOf(entries, 'Preferred-Languages').join(',');
    expect(languages).toMatch(/\ben\b/);
    expect(languages).toMatch(/\bbn\b/);
  });
});

describe('disclosure documents agree with each other', () => {
  it('SECURITY.md exists and carries the same two reporting channels', () => {
    expect(existsSync(SECURITY_MD)).toBe(true);
    const md = readFileSync(SECURITY_MD, 'utf8');
    const entries = parse(readFileSync(SECURITY_TXT, 'utf8'));
    for (const contact of valuesOf(entries, 'Contact')) {
      const needle = contact.replace(/^mailto:/, '');
      expect(md).toContain(needle);
    }
  });

  it('is copied into the build output when a build exists', () => {
    if (!existsSync(join(ROOT, 'frontend/dist'))) return; // no build in this checkout
    expect(existsSync(DIST_SECURITY_TXT)).toBe(true);
  });
});

describe('routing', () => {
  const rootConfig = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

  it('the SPA rewrite leaves dotted paths (so /.well-known/security.txt) alone', () => {
    const rewrites = rootConfig.rewrites || [];
    expect(rewrites.length).toBeGreaterThan(0);
    // Every catch-all rewrite must exclude paths containing a dot; otherwise the static
    // file is never reached and a request for it returns index.html instead.
    for (const rewrite of rewrites) {
      expect(rewrite.destination).toBe('/index.html');
      expect(rewrite.source).toContain('.*\\.[a-zA-Z0-9]+$');
    }
  });

  it('the security.txt path is not overridden by a redirect', () => {
    for (const redirect of rootConfig.redirects || []) {
      expect(redirect.source).not.toContain('.well-known');
    }
  });
});
