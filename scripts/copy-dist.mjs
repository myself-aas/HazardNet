import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'frontend', 'dist');
const destDir = path.join(rootDir, 'dist');

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
  console.log(`[copy-dist] Copied ${srcDir} to ${destDir}`);
} else {
  console.warn(`[copy-dist] Source directory ${srcDir} does not exist`);
}
