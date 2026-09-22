// Generates Models/VERSION.json — the model artifact handshake (ML-02).
// Run after any model artifact changes: node scripts/gen-model-version.mjs
// The weekly Kaggle pipeline should run this before committing new artifacts;
// the backend reads VERSION.json at boot and reports it via /health and
// /api/predict metadata, so stale model/code combinations are detectable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modelsDir = path.join(root, 'Models');
const artifacts = ['hazardnet_fp32.tflite', 'labels.json', 'normalization_stats.json', 'preprocessing_config.json'];

const entry = { generatedAt: new Date().toISOString(), artifacts: [] };

for (const name of artifacts) {
  const file = path.join(modelsDir, name);
  if (!fs.existsSync(file)) {
    console.warn(`[gen-model-version] missing artifact: ${name} (skipped)`);
    continue;
  }
  const buf = fs.readFileSync(file);
  entry.artifacts.push({
    name,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  });
}

// Version: derive from package.json + content hash so it changes with artifacts.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const combined = crypto.createHash('sha256').update(entry.artifacts.map((a) => a.sha256).join('')).digest('hex').slice(0, 12);
entry.version = `${pkg.version}+model.${combined}`;

// Deterministic regeneration (CI relies on it): the verify job runs this
// script and fails on `git diff`. A fresh `generatedAt` on every run would
// dirty the file unconditionally, so an unchanged handshake keeps the
// committed file byte-identical and `generatedAt` means "handshake last
// changed" rather than "script last ran".
const versionPath = path.join(modelsDir, 'VERSION.json');
const next = JSON.stringify(entry, null, 2) + '\n';
let prev = null;
try {
  prev = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
} catch {
  prev = null;
}
const same = prev
  && prev.version === entry.version
  && JSON.stringify(prev.artifacts) === JSON.stringify(entry.artifacts);
if (same) {
  console.log(`[gen-model-version] Models/VERSION.json unchanged: ${entry.version}`);
} else {
  fs.writeFileSync(versionPath, next);
  console.log(`[gen-model-version] Models/VERSION.json written: ${entry.version}`);
}
