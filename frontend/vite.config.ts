import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Strips the retired stock hero `.mp4` videos from the production `dist/` output after Vite
 * copies `public/` (`[P0] PERF-01`), keeping the deployed bundle lean without touching the
 * tracked working-tree binaries.
 *
 * Five clips, 113 MB (`public/hero-section/`), and a byte-for-byte duplicate tree in
 * `frontend/assets/hero-section/` — same five files, same sha256s, verified 2026-10-06; the
 * `assets/` directory holds nothing else. Nothing in `src/` fetches them: the hero is a
 * CSS-background carousel, and the five `EARTH_HERO_VIDEO_*` constants in `lib/heroMedia.ts` are
 * retained-but-unreferenced (they are back with `main`'s hero, which owns that file). The files
 * stay on disk on purpose (the audit trail records the same decision), so the exclusion happens at
 * build time, where it cannot be forgotten by a deployment that adds `public/` wholesale.
 *
 * The other half of the leak is the service worker's precache manifest, which walks `public/`
 * before this plugin runs — see `globIgnores` in the `VitePWA` options below.
 *
 * Deliberately NOT addressed here: the 226 MB those two trees occupy in git. The blobs are
 * already in history, so deleting the files at the tip would not make a clone any smaller;
 * reclaiming that space needs a history rewrite, which belongs to the repository owner rather
 * than to a build config.
 */
function excludeUnreferencedHeroVideos(): PluginOption {
  let outDir = 'dist';
  return {
    name: 'hazardnet:exclude-unreferenced-hero-videos',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      rmSync(join(outDir, 'hero-section'), { recursive: true, force: true });
    },
  };
}

/**
 * Rolldown interop shim for the pre-ESM Leaflet plugins (production
 * white-screen fix — `/` rendered the root ErrorBoundary fallback in every
 * production build).
 *
 * `leaflet.heat` and `leaflet.markercluster` are pre-ESM builds that mutate the
 * **global** `L` while their module body runs:
 *
 *   L.HeatLayer = (L.Layer ? L.Layer : L.Class).extend({ ... })        // leaflet.heat
 *   var t = L.MarkerClusterGroup = L.FeatureGroup.extend({ ... })      // markercluster
 *
 * Rolldown (Vite 8) wraps the `leaflet` package in a *lazily initialised*
 * CommonJS factory and emits those plugin bodies as plain top-level chunk code,
 * so `window.L` is still `undefined` when they evaluate. The `vendor-leaflet`
 * chunk throws `ReferenceError: L is not defined`, the lazy `Dashboard` import
 * rejects, and the root ErrorBoundary replaces the entire app with
 * "Something went wrong".
 *
 * Prepending a leaflet import + global publication to each plugin module pins
 * the initialisation order *inside* that module — Rolldown always emits the
 * CommonJS init call at the top of an importer's body. The wrapper is a call
 * expression so it cannot be tree-shaken away.
 *
 * Build-only (`apply: 'build'`): Vite's dev pre-bundler (esbuild) already
 * initialises `leaflet` eagerly, so dev mode is unaffected either way.
 */
function leafletGlobalShim(): PluginOption {
  const PLUGIN_PACKAGE = /node_modules[\\/](?:leaflet\.heat|leaflet\.markercluster)[\\/]/;
  const preamble = [
    "import __hazardnetLeaflet from 'leaflet';",
    'void (function (scope) {',
    '  if (!scope.L) { scope.L = __hazardnetLeaflet; }',
    '})(globalThis);',
  ].join('\n');

  return {
    name: 'hazardnet:leaflet-global-shim',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.js') || !PLUGIN_PACKAGE.test(file)) return null;
      return { code: `${preamble}\n${code}`, map: null };
    },
  };
}

process.env.NODE_ENV = 'production';

export default defineConfig(({ mode }) => {
  process.env.NODE_ENV = 'production';
  const env = loadEnv('production', '..', '');

  return {
  plugins: [
    leafletGlobalShim(),
    excludeUnreferencedHeroVideos(),
    react({
      babel: {
        configFile: false,
        babelrc: false,
      },
    }),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'serviceWorker.js',
      // The default (`'auto'`) injected
      // `<script id="vite-plugin-pwa:register-sw" src="/registerSW.js">` into <head>
      // with no `defer`, so the browser had to fetch and execute the registration
      // before first paint — Lighthouse measured it on the render-blocking path
      // (376 ms in the critical chain) on a page where the service worker does
      // nothing until after load. `script-defer` emits the same tag with `defer`:
      // registration still happens, just after parsing, which is soon enough for
      // the `prompt` update flow this app uses.
      injectRegister: 'script-defer',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        globIgnores: ['**/hero-section/*.mp4'],
      },
    }),
  ],
  resolve: {
    // Mirrors the `@/*` -> `src/*` mapping in frontend/tsconfig.json. Vite does
    // not read tsconfig `paths`, so without this alias the build fails with
    // "Rollup failed to resolve import '@/...'" on aliased imports.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@hazardnet/design-system': fileURLToPath(new URL('../packages/design-system/src/index.ts', import.meta.url)),
      '@hazardnet/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
      '@hazardnet/analytics': fileURLToPath(new URL('../packages/analytics/src/index.ts', import.meta.url)),
      '@hazardnet/api': fileURLToPath(new URL('../packages/api/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    open: false,
    // Allow the sandbox preview host (e2b.app) in addition to localhost
    allowedHosts: ['.e2b.app'],
    proxy: {
      // Backend (backend/server.js) must run on 3001 in dev — start it with
      // `PORT=3001 npm run dev:api` (see the 2026-08-28 audit: both sides used
      // to claim 3000, so this proxy looped /api straight back into Vite itself
      // and every /api/chat/* call in dev died on Vite's SPA-fallback
      // index.html ("There was an error communicating with the AI"). The
      // server now honours PORT and keeps 3000 as its deployment default.
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Gateway: backend runtime not available' }));
            }
          });
        },
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Gateway: backend runtime not available' }));
            }
          });
        },
      }
    }
  },
  /*
   * `vite preview` serves the built app for the E2E suite and for anyone reviewing a
   * production bundle, but it applies the same host allow-list as the dev server: without
   * this it answers 403 "Blocked request. This host is not allowed" to a sandbox preview
   * URL, i.e. the reviewer gets a blank page while `curl 127.0.0.1:3000` looks fine.
   * Same list as `server.allowedHosts` above, for the same reason.
   */
  preview: {
    allowedHosts: ['.e2b.app'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Gateway: backend runtime not available' }));
            }
          });
        },
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Gateway: backend runtime not available' }));
            }
          });
        },
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
};
});

