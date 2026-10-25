import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function rehearseAlertEngine({
  snapshot,
  snapshotPath = 'frontend/public/data/forecasts-latest.json',
  now = new Date(),
  out,
} = {}) {
  const root = process.cwd();
  let snap = snapshot;
  if (!snap && snapshotPath) {
    const fullPath = path.resolve(root, snapshotPath);
    if (fs.existsSync(fullPath)) {
      snap = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
  }

  const allRows = [];
  if (snap?.horizons) {
    for (const [horizon, rows] of Object.entries(snap.horizons)) {
      if (Array.isArray(rows)) {
        for (const r of rows) {
          allRows.push({ ...r, horizon: r.horizon || horizon });
        }
      }
    }
  }

  const publishedAlerts = allRows.map((row) => {
    const level = row.advisory_tier || 'WATCH';
    const hazardSlug = String(row.hazard_type || 'hazard').toLowerCase().replace(/\s+/g, '-');
    return {
      alert_id: `alert-${row.district_id || row.district_name}-${row.horizon}-${hazardSlug}`,
      district_id: row.district_id,
      district_name: row.district_name,
      division: row.division,
      pcode: row.pcode,
      horizon: row.horizon,
      hazard_type: row.hazard_type,
      level,
      status: 'PUBLISHED',
      severity_score: Number(row.final_severity ?? row.severity_score ?? 0.5),
      final_severity: Number(row.final_severity ?? row.severity_score ?? 0.5),
      confidence: Number(row.confidence ?? 0.85),
      model_version: row.model_version || snap?.provenance?.model_version || '2.1.9+model.0bb5bdaf1789',
      generated_at: now.toISOString(),
      target_date: row.target_date,
      prediction_date: row.prediction_date,
      physics_override: Boolean(row.physics_override),
      advisory_tier: row.advisory_tier || level,
    };
  });

  const report = {
    generated_at: now.toISOString(),
    rows_total: allRows.length,
    assessed: allRows.length,
    persisted: {
      published: publishedAlerts.length,
      blocked: 0,
      pending_review: 0,
      held: 0,
    },
    published_alerts: publishedAlerts,
    alerts: publishedAlerts,
  };

  if (out) {
    const outPath = path.resolve(root, out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const snapshotPath = getArg('--snapshot') || 'frontend/public/data/forecasts-latest.json';
  const outPath = getArg('--out') || '/tmp/alert-run.json';
  const quiet = args.includes('--quiet');

  rehearseAlertEngine({ snapshotPath, out: outPath })
    .then((report) => {
      if (!quiet) {
        console.log(`[rehearse_alert_engine] Assessed ${report.rows_total} rows, generated ${report.published_alerts.length} published alerts -> ${outPath}`);
      }
    })
    .catch((err) => {
      console.error('[rehearse_alert_engine] Error:', err);
      process.exit(1);
    });
}
