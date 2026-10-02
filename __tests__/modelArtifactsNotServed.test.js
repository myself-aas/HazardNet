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

import { readFileSync } from 'node:fs';
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

describe('Vercel configurations never route to model artifacts', () => {
  for (const rel of ['vercel.json', 'frontend/vercel.json']) {
    test(`${rel} has no artifact route and builds from a scoped output directory`, () => {
      const config = readJson(rel);
      for (const rule of routeStrings(config)) {
        expect(rule).not.toMatch(ARTIFACT);
      }
      // The deployed tree must be a build output, never the repository root —
      // a root-scoped deployment would publish Models/ along with the site.
      const output = config.outputDirectory;
      expect(typeof output).toBe('string');
      expect(output).not.toBe('.');
      expect(output).not.toMatch(ARTIFACT);
    });
  }

  test('root and frontend vercel.json carry identical security headers, SPA fallback, and build-to-dist parity', () => {
    const rootConfig = readJson('vercel.json');
    const frontendConfig = readJson('frontend/vercel.json');
    const rootPkg = readJson('package.json');

    expect(rootConfig.headers).toEqual(frontendConfig.headers);
    expect(rootConfig.rewrites).toEqual(frontendConfig.rewrites);
    expect(rootConfig.outputDirectory).toBe('dist');
    expect(frontendConfig.outputDirectory).toBe('dist');
    expect(rootPkg.scripts.build).toContain('scripts/copy-dist.mjs');
  });
});

describe('Firebase Hosting never serves model artifacts', () => {
  test('hosting root is the built frontend and no rule names an artifact', () => {
    const config = readJson('firebase.json');
    const hosting = config.hosting;
    expect(hosting).toBeTruthy();
    const sites = Array.isArray(hosting) ? hosting : [hosting];

    for (const site of sites) {
      expect(site.public).toBe('frontend/dist');
      for (const rule of routeStrings(site)) {
        expect(rule).not.toMatch(ARTIFACT);
      }
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
