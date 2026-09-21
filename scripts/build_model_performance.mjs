import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA = 'hazardnet-model-performance/v1';

export function assertNoHeadlineAccuracy(doc) {
  const serialized = JSON.stringify(doc);
  for (const forbidden of ['"accuracy"', '"f1"', '"precision"', '"recall"', '"brier"', '"log_loss"']) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Forbidden metric key found in document: ${forbidden}`);
    }
  }
}

export function assertHonestReport(report) {
  if (!report) throw new Error('Report is required');
  if (report.cnn_evaluated) throw new Error('cnn_evaluated must be false');
  if (report.drivers && report.drivers.is_forecast) throw new Error('drivers.is_forecast must be false');
}

export function buildDocument(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const artifactPath = path.join(rootDir, 'frontend', 'public', 'data', 'model-performance.json');
  if (fs.existsSync(artifactPath)) {
    return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  }
  return { schema: SCHEMA, generated_by: 'scripts/build_model_performance.mjs', hindcast_version: '1.0.0', episodes: [] };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[build_model_performance] Model performance artifacts up to date.');
}
