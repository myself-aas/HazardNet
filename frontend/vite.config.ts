import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  plugins: [leafletGlobalShim(), react(), tailwindcss()],
  resolve: {
    // Mirrors the `@/*` -> `src/*` mapping in frontend/tsconfig.json. Vite does
    // not read tsconfig `paths`, so without this alias the build fails with
    // "Rollup failed to resolve import '@/...'" on shadcn-generated components.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
      '/api': {
        target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/metrics': {
        target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/health': {
        target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000, // increase limit (KB) if needed
    rollupOptions: {
      output: {
        // Vendor splitting: the heaviest third-party stacks get their own
        // long-cacheable chunks so the root chunk stays lean and repeat
        // visits only re-download what changed. (jspdf/html2canvas power the
        // PDF export buttons; leaflet the maps; mui+emotion the design
        // system; firebase+supabase auth/data; recharts the charts.)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/recharts')) return 'vendor-recharts';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
            return 'vendor-pdf';
          }
          if (id.includes('node_modules/leaflet')) return 'vendor-leaflet';
          if (
            id.includes('node_modules/@mui') ||
            id.includes('node_modules/@emotion') ||
            id.includes('node_modules/@base-ui')
          ) {
            return 'vendor-mui';
          }
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/@tanstack') ||
            id.includes('node_modules/framer-motion')
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  define: {
    // Boolean literal (not a string) so the client can do a plain
    // `=== true` check — see lib/vercelAnalytics.ts.
    'import.meta.env.VITE_VERCEL_ANALYTICS': JSON.stringify(vercelAnalyticsEnabled),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    'import.meta.env.VITE_SUPABASE_REDIRECT_URL': JSON.stringify(env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL),
  },
  };
});
