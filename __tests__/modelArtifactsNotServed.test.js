/**
 * @jest-environment node
 *
 * Model artifacts must never be reachable from a public deployment.
 *
 * `Models/` holds trained weights and preprocessing assets that the README and
 * the publication policy keep in the repository but deliberately unadvertised
 * and unserved. `backend/server.js` already answers 404 for them (two independent
 * guards, covered by `__tests__/api/security.test.js`), but the *deployment*
 * configs were only protected by convention: nothing failed if a rewrite,
 * redirect or hosting root started pointing at the artifacts. This suite is that
 * assertion (docs/codebase/CONCERNS.md §2, "Model artifacts retained in-repo").
 *
 * It checks configuration, not the live deployment — the site-health probe and
 * `__tests__/api/security.test.js` cover the running surfaces.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const readText = (rel) => readFileSync(join(root, rel), 'utf8');

/** Anything that would name a model artifact or the unpublished directory. */
const ARTIFACT = /(^|\/)(Models|models)(\/|$)|\b\w[\w.-]*\.(tflite|onnx|h5|keras|pt|pth|bin)\b/;

const routeStrings = (config) => {
  const out = [];
  for (const key of ['rewrites', 'redirects', 'routes', 'headers']) {
    for (const rule of config[key] || []) {
      for (const value of [rule.source, rule.destination, rule.has, rule.missing]) {
        if (typeof value === 'string') out.push(`${key}: ${value}`);
      }
    }
  }
  return out;
};

describe('the Cloudflare Pages deployment never serves model artifacts', () => {
  /* `vercel.json` used to keep the deployed tree scoped to a build output. On Cloudflare
     Pages the equivalent guarantee is that the asset root is the build output — `dist`, into
     which `frontend/dist` is copied — and that no redirect or header rule names `Models/`.
     Both are asserted here rather than assumed, because publishing the repository root would
     ship the model artifacts with the site. */
  test('no redirect rule names a model artifact, and the asset root is the build output', () => {
    const redirects = readText('frontend/public/_redirects');
    for (const line of redirects.split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      expect(line).not.toMatch(ARTIFACT);
    }

    const rootPkg = readJson('package.json');
    // `npm run build` writes frontend/dist AND mirrors it to dist/; Cloudflare Pages publishes
    // `dist`. The copy step is what keeps the two locations identical (scripts/copy-dist.mjs).
    expect(rootPkg.scripts.build).toContain('scripts/copy-dist.mjs');
    expect(existsSync(join(process.cwd(), 'scripts/copy-dist.mjs'))).toBe(true);
  });

  test('the build output is what Pages publishes, not the repository root', () => {
    const raw = readText('.github/workflows/site-health.yml');
    // The probe asserts the deployment serves prerendered files; a root-scoped deployment
    // would serve `Models/` and `data/` alongside the site.
    expect(raw).toContain('frontend/scripts/prerender.mjs');
  });
});

describe('no second static-host config can serve model artifacts', () => {
  /* Firebase Hosting used to be the second root, and this suite pinned its `public` field.
     The block was retired on 2026-10-26 (`firebase.json` keeps only `firestore`), so the
     invariant inverts: there must be exactly one static-host declaration in the repository —
     Cloudflare's `_headers`/`_redirects`/build output — and `firebase.json` must not name a
     document root at all. If a hosting block ever comes back, it has to come back with a
     root assertion here, and that is the point. */
  test('firebase.json declares no hosting block', () => {
    const config = readJson('firebase.json');
    expect(config).not.toHaveProperty('hosting');
    // The rest of the file is still live: Firestore rules are deployed from it.
    expect(config).toHaveProperty('firestore');
  });

  test('no json config in the repository names a document root other than the build output', () => {
    for (const rel of ['firebase.json']) {
      const raw = readText(rel);
      expect(raw).not.toMatch(/"public"\s*:/);
    }
  });
});

describe('backend/server.js keeps both model-artifact guards', () => {
  const server = readText('backend/server.js');

  test('the explicit artifact 404 middleware is present', () => {
    expect(server).toMatch(/app\.use\(\s*\[\s*'\/Models'/);
    expect(server).toMatch(/hazardnet_fp32\.tflite/);
  });

  test('the SPA fallback still refuses artifact extensions and directories', () => {
    expect(server).toMatch(/tflite\|onnx\|bin\|h5\|keras\|pt\|pth/);
    expect(server).toMatch(/\(\^\|\\\/\)models\?\\\//);
  });
});
