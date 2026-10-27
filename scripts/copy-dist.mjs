// Cross-platform build-output copy: frontend/dist -> dist (repo root).
// Cloudflare Pages publishes the root "dist" (see docs/ops/deployment.md), while
// Vite, the backend static server and Firebase hosting use "frontend/dist".
// This keeps both locations in sync without platform-specific shell commands.
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'frontend', 'dist');
const dest = path.join(root, 'dist');

if (!existsSync(src)) {
  console.error(
    `[copy-dist] Build output not found at ${path.relative(root, src)}. Run "npm run build:frontend" first.`
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-dist] Copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);

// Phase 5 — make the probe record a real URL. `data/site-health/latest.json` lives in the
// repo root, which Cloudflare Pages never publishes, so
//   /data/site-health/latest.json
// used to answer 404 (or, worse, the SPA shell). The probe commits it with `[skip ci]`
// and the Pages build watch paths exclude `data/site-health/**` — deliberately, so a
// monitor cannot trigger a deploy loop. That means the CDN copy is refreshed at the next
// ordinary build, not by the probe itself: copy the committed record into the deploy
// output here. The canonical record is still the repo file (and the run artifact); the
// served copy can lag by up to one deploy, which docs/ops/deployment.md §2 states.
const probeSrc = path.join(root, 'data', 'site-health', 'latest.json');
const probeRelative = path.join('data', 'site-health', 'latest.json');
if (existsSync(probeSrc)) {
  for (const base of [path.join(root, 'frontend', 'dist'), dest]) {
    const target = path.join(base, probeRelative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(probeSrc, target);
    console.log(`[copy-dist] Published ${probeRelative} -> ${path.relative(root, target)}`);
  }
} else {
  console.warn(`[copy-dist] Warning: ${path.relative(root, probeSrc)} is missing — /data/site-health/latest.json will not be served.`);
}
