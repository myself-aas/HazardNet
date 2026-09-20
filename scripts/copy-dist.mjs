import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('frontend', 'dist');
const dest = path.resolve('dist');

if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true });
}
