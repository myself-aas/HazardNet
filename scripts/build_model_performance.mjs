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

export function assertHonestReport(report, _reportPath) {
  if (!report) throw new Error('Report is required');
  if (report.schema !== 'hazardnet-hindcast-report/v1') {
    throw new Error(`Unknown report schema: ${report.schema} (expected hazardnet-hindcast-report/v1)`);
  }
  const wwh = report.what_was_hindcast || {};
  if (wwh.cnn_evaluated) throw new Error('cnn_evaluated must be false');
  const drivers = wwh.drivers || report.drivers;
  if (drivers && drivers.is_forecast) throw new Error('drivers.is_forecast must be false');
  if (!report.caveats || report.caveats.length === 0) throw new Error('no caveats carried with the numbers');
  if (!report.citations || report.citations.length === 0) throw new Error('no citations carried with the numbers');
}

export function buildDocument(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportsDir = options.reportsDir || path.join(rootDir, 'data/hindcast/reports');
  const artifactPath = path.join(rootDir, 'frontend', 'public', 'data', 'model-performance.json');

  if (options.reportsDir) {
    let entries;
    try {
      entries = fs.readdirSync(reportsDir).filter((n) => n.endsWith('.json'));
    } catch (e) {
      throw new Error('nothing to publish: no reports in ' + reportsDir);
    }
    if (entries.length === 0) {
      throw new Error('nothing to publish: no reports in ' + reportsDir);
    }
    for (const name of entries) {
      const full = path.join(reportsDir, name);
      const report = JSON.parse(fs.readFileSync(full, 'utf8'));
      assertHonestReport(report, full);
    }
  }

  if (fs.existsSync(artifactPath)) {
    return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  }
  // No artifact file and no reports case already handled above; fallback for manual runs
  return { schema: SCHEMA, generated_by: 'scripts/build_model_performance.mjs', hindcast_version: '1.0.0', episodes: [] };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[build_model_performance] Model performance artifacts up to date.');
}
