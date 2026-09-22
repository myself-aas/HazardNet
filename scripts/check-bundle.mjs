// Bundle budget check (FE-01). Fails when any single JS chunk or the total
// exceeds gzip-size budgets, preventing the initial payload from creeping
// back up after code splitting. Run via `npm run check:bundle` (CI step).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = process.argv[2] || 'frontend/dist';
const assetsDir = path.join(dist, 'assets');

// Budgets (gzip bytes). Initial-shell target < 400 kB; single chunk < 800 kB
// (the lazy Dashboard/map chunk); whole app < 1.6 MB.
const BUDGETS = { singleChunk: 800 * 1024, total: 1600 * 1024 };

if (!fs.existsSync(assetsDir)) {
  console.error(`[check-bundle] ${assetsDir} not found — run the build first.`);
  process.exit(1);
}

const files = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const raw = fs.readFileSync(path.join(assetsDir, f));
    const gz = zlib.gzipSync(raw, { level: 9 }).length;
    return { file: f, raw: raw.length, gz };
  })
  .sort((a, b) => b.gz - a.gz);

const total = files.reduce((s, f) => s + f.gz, 0);
let failed = false;

console.log('file'.padEnd(44) + 'gzip'.padStart(12) + '   raw'.padStart(14));
for (const f of files) {
  console.log(`${f.file.padEnd(44)}${(f.gz / 1024).toFixed(1).padStart(10)} kB${(f.raw / 1024).toFixed(0).padStart(12)} kB`);
}
console.log('-'.repeat(70));
console.log(`${'TOTAL (gzip)'.padEnd(44)}${(total / 1024).toFixed(1).padStart(10)} kB`);

const worst = files[0];
if (worst && worst.gz > BUDGETS.singleChunk) {
  console.error(`\n[check-bundle] FAIL: largest chunk ${worst.file} = ${(worst.gz / 1024).toFixed(0)} kB gzip (budget ${BUDGETS.singleChunk / 1024} kB). Split it further.`);
  failed = true;
}
if (total > BUDGETS.total) {
  console.error(`\n[check-bundle] FAIL: total JS ${Math.round(total / 1024)} kB gzip (budget ${BUDGETS.total / 1024} kB).`);
  failed = true;
}

if (!failed) console.log('\n[check-bundle] PASS: within budget.');
process.exit(failed ? 1 : 0);
