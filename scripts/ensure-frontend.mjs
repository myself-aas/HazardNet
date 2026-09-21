import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const distIndex = path.resolve(process.cwd(), 'frontend', 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
  console.log('[dev] Frontend build missing. Building assets...');
  execSync('npm run build:frontend', { stdio: 'inherit' });
} else {
  console.log('[dev] Frontend assets ready in frontend/dist');
}
