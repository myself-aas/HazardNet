import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
  plugins: [react(), tailwindcss()],
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
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    'import.meta.env.VITE_SUPABASE_REDIRECT_URL': JSON.stringify(env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL),
  },
  };
});
