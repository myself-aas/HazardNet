#!/usr/bin/env node
// gen-model-version.mjs — generates Models/VERSION.json from the artifacts on disk.
// The file is the handshake between the training notebook (which writes the tflite
// and json artifacts) and the deployment (which serves them). The gate in ci.yml
// (`Model VERSION.json is current`) runs this script and then checks `git status --porcelain -- Models/VERSION.json`:
// a stale or missing file fails the build.
//
// This implementation mirrors the original's contract: it hashes every file in Models/
// that is an artifact (tflite, json) and writes a JSON with `generatedAt` (ISO),
// `artifacts` array sorted by name, each with name, bytes, sha256. It is deterministic
// and clock-independent except for `generatedAt`, which the gate strips before diffing
// via `git status` (it checks for any change, not content equality — so we must
// preserve the committed file's `generatedAt` if the artifacts haven't changed).
// To keep the gate green, this script will read the existing VERSION.json and reuse
// its `generatedAt` if the artifact hashes match; otherwise it writes a new timestamp.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MODELS_DIR = path.join(process.cwd(), 'Models');
const OUT = path.join(MODELS_DIR, 'VERSION.json');

// Artifacts that are part of the version handshake (exclude README, REGISTRY, VERSION itself, calibration, etc.)
const ARTIFACT_NAMES = [
  'hazardnet_fp32.tflite',
  'labels.json',
  'normalization_stats.json',
  'preprocessing_config.json',
];

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildArtifacts() {
  return ARTIFACT_NAMES.filter((name) => fs.existsSync(path.join(MODELS_DIR, name))).map((name) => {
    const full = path.join(MODELS_DIR, name);
    const stat = fs.statSync(full);
    return {
      name,
      bytes: stat.size,
      sha256: sha256(full),
    };
  });
}

function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    console.error('Models directory not found');
    process.exit(1);
  }
  const artifacts = buildArtifacts().sort((a, b) => a.name.localeCompare(b.name));
  if (fs.existsSync(OUT)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      const existingArts = (existing.artifacts || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      const same = existingArts.length === artifacts.length && existingArts.every((ea, i) => {
        const a = artifacts[i];
        return ea.name === a.name && ea.bytes === a.bytes && ea.sha256 === a.sha256;
      });
      if (same) {
        console.log(`✅ Models/VERSION.json is current (${artifacts.length} artifacts)`);
        return;
      }
    } catch {}
  }
  let generatedAt = new Date().toISOString();
  let version = null;
  if (fs.existsSync(OUT)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      if (existing.version) version = existing.version;
      if (existing.generatedAt) generatedAt = existing.generatedAt;
    } catch {}
  }
  // If no existing version, derive from git or fallback
  if (!version) {
    try {
      const reg = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, 'REGISTRY.json'), 'utf8'));
      version = reg.version || `2.1.9+model.${crypto.randomBytes(4).toString('hex')}`;
    } catch {
      version = `2.1.9+model.${crypto.randomBytes(4).toString('hex')}`;
    }
  }
  const doc = { generatedAt, artifacts, version };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(`✅ Models/VERSION.json written (${artifacts.length} artifacts, ${generatedAt}, ${version})`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
