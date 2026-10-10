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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');

  /**
   * Vercel Web Analytics gate (2026-09-13 E2E fix — see
   * frontend/src/lib/vercelAnalytics.ts for the full failure story).
   *
   * `@vercel/analytics` ships no loader of its own: at mount `<Analytics />`
   * injects a *classic* `<script src="/_vercel/insights/script.js">`, and that
   * namespace is a Vercel system route (only served when Web Analytics is on
   * for the project). Everywhere else the path falls through to the SPA
   * rewrite and comes back as `index.html` with `text/html`, so the browser
   * parses the app shell as JavaScript and throws
   * `SyntaxError: Unexpected token '<'` once per page load — which is exactly
   * what failed `Performance › no JavaScript errors on critical pages` in
   * e2e/critical-paths.spec.ts (42/44 passing, one pageerror per navigation).
   *
   * `VERCEL=1` is set by Vercel's build image for every deployment it builds —
   * production, preview, and custom domains such as hazardnet.live — so the
   * loader is wired in exactly where it can be served. `VITE_VERCEL_ANALYTICS`
   * (any of `.env`, `.env.local`, the CI environment) overrides the guess:
   * `true` forces the loader on, `false` forces it off, empty/unset keeps the
   * automatic guess.
   */
  const vercelAnalyticsOverride = env.VITE_VERCEL_ANALYTICS?.trim();
  const vercelAnalyticsEnabled = vercelAnalyticsOverride
    ? vercelAnalyticsOverride === 'true'
    : env.VERCEL === '1';

  return {
  plugins: [
    leafletGlobalShim(),
    excludeUnreferencedHeroVideos(),
    react(),
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
      },
      '/metrics': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
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
  },
  build: {
    chunkSizeWarningLimit: 1000, // increase limit (KB) if needed
    // `build.rollupOptions` is deprecated under Vite 8's Rolldown bundler, and
    // so is the `manualChunks` function it used to carry. That mattered here:
    // Rolldown ignores the chunk name `manualChunks` returns for virtual
    // modules, so the preload helper could not be relocated that way.
    // `codeSplitting.groups` is the supported replacement.
    rolldownOptions: {
      output: {
        // Vendor splitting: the heaviest third-party stacks get their own
        // long-cacheable chunks so the root chunk stays lean and repeat
        // visits only re-download what changed. (jspdf/html2canvas power the
        // PDF export buttons; leaflet the maps; firebase auth/data;
        // recharts the charts. The design system ships no vendor chunk — it
        // is CSS custom properties plus Tailwind utilities, no runtime.)
        //
        // `includeDependenciesRecursively` defaults to true, which would make
        // each vendor group swallow its whole dependency tree; the old
        // `manualChunks` matched only the package itself, so it is turned off
        // globally to keep the split equivalent.
        //
        // Priority then does the work that ordering used to. Two small groups
        // outrank every vendor group, because any module the entry chunk
        // needs drags its whole chunk onto the landing page:
        //
        //   · `vendor-runtime` — Vite's modulepreload helper
        //     (`\0vite/preload-helper.js`) wraps every
        //     `React.lazy(() => import(...))` in App.tsx. Left unclaimed it was
        //     merged into `vendor-pdf`, so the front door downloaded 862 KiB
        //     (244 KiB gzip) of jspdf + html2canvas before it could lazy-load
        //     a single route.
        //   · `vendor-shared` — `clsx` and `tailwind-merge`, the two halves of
        //     `lib/utils.ts`' `cn()` (`twMerge(clsx(inputs))`), called by
        //     App.tsx and nearly every component. clsx was merged into
        //     `vendor-recharts`, so `/` — a page with no charts at all —
        //     pulled 402 KiB (103 KiB gzip) of recharts to join class names.
        //
        // Those two were ~340 KiB gzip of the 587 KiB of unused JavaScript
        // Lighthouse measured on the landing page, sitting on the critical
        // path ahead of the LCP text (13.1 s LCP against a 7.0 s FCP).
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-runtime',
              test: /vite\/(preload-helper|modulepreload-polyfill)/,
              priority: 100,
            },
            {
              name: 'vendor-shared',
              test: /node_modules\/(clsx|tailwind-merge)\//,
              priority: 90,
            },
            { name: 'vendor-recharts', test: /node_modules\/recharts/, priority: 10 },
            {
              name: 'vendor-pdf',
              test: /node_modules\/(jspdf|html2canvas)/,
              priority: 10,
            },
            { name: 'vendor-leaflet', test: /node_modules\/leaflet/, priority: 10 },
            {
              name: 'vendor-firebase',
              test: /node_modules\/@?firebase/,
              priority: 10,
            },
            {
              name: 'vendor-react',
              test: /node_modules\/(react|react-dom|react-router|@tanstack|framer-motion)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  define: {
    // Boolean literal (not a string) so the client can do a plain
    // `=== true` check — see lib/vercelAnalytics.ts.
    'import.meta.env.VITE_VERCEL_ANALYTICS': JSON.stringify(vercelAnalyticsEnabled),
  },
  };
});
