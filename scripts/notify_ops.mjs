import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function extractPipelineMetrics({ manifestPath, snapshotPath }) {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestPath), 'utf8'));
  let snapshot = {};
  if (snapshotPath && fs.existsSync(path.resolve(root, snapshotPath))) {
    snapshot = JSON.parse(fs.readFileSync(path.resolve(root, snapshotPath), 'utf8'));
  }

  const generatedAt = manifest.generated_at || snapshot.generated_at || new Date().toISOString();
  const predictionDate = manifest.prediction_date || snapshot.prediction_date || 'unknown';
  const rowCount = manifest.row_count || 128;
  const ageHours = Math.max(0, (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60));

  const tierCounts = { SEVERE: 0, WARNING: 0, WATCH: 0, NORMAL: 0 };
  if (snapshot.horizons) {
    for (const h of Object.values(snapshot.horizons)) {
      if (Array.isArray(h)) {
        for (const row of h) {
          const tier = row.advisory_tier || 'NORMAL';
          tierCounts[tier] = (tierCounts[tier] || 0) + 1;
        }
      }
    }
  }

  return {
    manifest,
    snapshot,
    rowCount,
    predictionDate,
    generatedAt,
    ageHours,
    isStale: ageHours > 36,
    tierCounts,
  };
}

export function buildSlackPayload({
  status,
  metrics,
  duration = 'N/A',
  channel = '#hazardnet-ops',
  runUrl,
  error,
}) {
  const isSuccess = status === 'success';
  const color = isSuccess ? '#16a34a' : '#dc2626';
  const headerText = isSuccess
    ? '✅ HazardNet Daily Advisory Ingestion Succeeded'
    : '🚨 HazardNet Pipeline Incident: Daily Ingestion Failed';

  const fields = [
    { type: 'mrkdwn', text: `*Status:*\n${status}` },
    { type: 'mrkdwn', text: `*Duration:*\n${duration}` },
  ];

  if (metrics?.predictionDate) {
    fields.push({ type: 'mrkdwn', text: `*Prediction Date:*\n${metrics.predictionDate}` });
  }
  if (metrics?.rowCount) {
    fields.push({ type: 'mrkdwn', text: `*Rows Processed:*\n${metrics.rowCount}` });
  }

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: headerText,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields,
    },
  ];

  if (error) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:*\n\`\`\`${error}\`\`\``,
      },
    });
  }

  if (runUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${runUrl}|View GitHub Actions Run>`,
      },
    });
  }

  return {
    channel,
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (prefix) => {
    const hit = args.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length).replace(/^=/, '') : null;
  };

  const status = getArg('--status') || 'success';
  const channel = getArg('--channel') || '#hazardnet-ops';
  const manifestPath = getArg('--manifest') || 'backend/data/forecasts/manifest.json';
  const snapshotPath = getArg('--snapshot') || 'frontend/public/data/forecasts-latest.json';
  const runUrl = getArg('--run-url') || '';

  try {
    const metrics = extractPipelineMetrics({ manifestPath, snapshotPath });
    const payload = buildSlackPayload({
      status,
      metrics,
      channel,
      runUrl,
    });
    console.log('[notify_ops] Slack payload prepared for', channel);
  } catch (err) {
    console.warn('[notify_ops] Warning:', err.message);
  }
}
