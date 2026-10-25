import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distIndex = path.join(root, 'frontend', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.log('[ensure-frontend] Building frontend assets...');
  execSync('npm run build:frontend', { stdio: 'inherit', cwd: root });
  console.log('[ensure-frontend] Frontend built successfully.');
} else {
  console.log('[ensure-frontend] Frontend assets are present.');
}
