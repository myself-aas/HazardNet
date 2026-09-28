#!/usr/bin/env node
/** Fail closed if checked-in web fonts exceed the 50 KiB edge budget. */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'frontend', 'public', 'fonts');
const files = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.woff2'))
  .map((entry) => ({ name: entry.name, bytes: statSync(join(root, entry.name)).size }));
const total = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(`[fonts] ${files.length} WOFF2 file(s), ${(total / 1024).toFixed(2)} KiB`);
if (total > 50 * 1024) {
  console.error('[fonts] ABORT: payload exceeds the 50 KiB edge budget.');
  process.exit(1);
}
