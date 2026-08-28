// Cross-platform build-output copy: frontend/dist -> dist (repo root).
// Vercel's Output Directory is configured as "dist", while Vite (and the
// backend static server / Firebase hosting) use "frontend/dist". This keeps
// both locations in sync without platform-specific shell commands.
import { cpSync, existsSync, rmSync } from 'node:fs';
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
