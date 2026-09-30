/**
 * scripts/notify_ops.mjs — Operational Monitoring & Slack Alert Dispatcher
 *
 * Implements TASK-014 (TRD §8.3, §11, PRD REQ-008):
 * 1. Dispatches pipeline success summary (row count, tier distribution, duration) to Slack #hazardnet-ops.
 * 2. Formats incident alerts on pipeline failure or staleness > 36h.
 * 3. Gracefully mocks/logs payload when SLACK_WEBHOOK_URL is unset.
 */

import fs from 'node:fs';
import path from 'node:path';

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    status: 'success',
    channel: '#hazardnet-ops',
    manifest: 'backend/data/forecasts/manifest.json',
    snapshot: 'frontend/public/data/forecasts-latest.json',
    duration: '',
    error: '',
    runUrl: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY || 'myself-aas/HazardNet'}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : 'https://github.com/myself-aas/HazardNet/actions',
  };

  for (const arg of argv) {
    if (arg.startsWith('--status=')) args.status = arg.slice(9);
    else if (arg.startsWith('--channel=')) args.channel = arg.slice(10);
    else if (arg.startsWith('--manifest=')) args.manifest = arg.slice(11);
    else if (arg.startsWith('--snapshot=')) args.snapshot = arg.slice(11);
    else if (arg.startsWith('--duration=')) args.duration = arg.slice(11);
    else if (arg.startsWith('--error=')) args.error = arg.slice(8);
    else if (arg.startsWith('--run-url=')) args.runUrl = arg.slice(10);
  }

  return args;
}

export function extractPipelineMetrics(options = {}) {
  const { manifestPath, snapshotPath } = options;
  const metrics = {
    predictionDate: null,
    generatedAt: null,
    rowCount: 0,
    tierCounts: { SEVERE: 0, WARNING: 0, WATCH: 0, NORMAL: 0 },
    isStale: false,
    ageHours: 0,
  };

  const resolvedManifest = manifestPath
    ? path.resolve(process.cwd(), manifestPath)
    : path.resolve(process.cwd(), 'backend', 'data', 'forecasts', 'manifest.json');

  if (fs.existsSync(resolvedManifest)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'));
      metrics.predictionDate = manifest.prediction_date || null;
      metrics.generatedAt = manifest.generated_at || null;
      metrics.rowCount = Number(manifest.row_count || 0);
    } catch {}
  }

  const resolvedSnapshot = snapshotPath
    ? path.resolve(process.cwd(), snapshotPath)
    : path.resolve(process.cwd(), 'frontend', 'public', 'data', 'forecasts-latest.json');

  if (fs.existsSync(resolvedSnapshot)) {
    try {
      const snapshot = JSON.parse(fs.readFileSync(resolvedSnapshot, 'utf8'));
      if (!metrics.predictionDate) metrics.predictionDate = snapshot.predictionDate || null;
      if (!metrics.generatedAt) metrics.generatedAt = snapshot.generatedAt || null;

      const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
      if (!metrics.rowCount && rows.length > 0) metrics.rowCount = rows.length;

      for (const row of rows) {
        const tier = String(row.advisory_tier || '').toUpperCase();
        if (tier in metrics.tierCounts) {
          metrics.tierCounts[tier]++;
        } else if (Number(row.severity_score) >= 0.75) {
          metrics.tierCounts.SEVERE++;
        } else if (Number(row.severity_score) >= 0.50) {
          metrics.tierCounts.WARNING++;
        } else if (Number(row.severity_score) >= 0.25) {
          metrics.tierCounts.WATCH++;
        } else {
          metrics.tierCounts.NORMAL++;
        }
      }
    } catch {}
  }

  if (metrics.generatedAt) {
    const ageMs = Date.now() - new Date(metrics.generatedAt).getTime();
    metrics.ageHours = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
    if (metrics.ageHours > 36) {
      metrics.isStale = true;
    }
  }

  return metrics;
}

export function buildSlackPayload(params) {
  const { status, metrics, duration, error, runUrl, channel } = params;
  const isSuccess = status === 'success' && !metrics.isStale;
  const isStale = status === 'stale' || metrics.isStale;

  let emoji = '✅';
  let title = 'HazardNet Advisory Pipeline Succeeded';
  let color = '#16a34a';

  if (!isSuccess) {
    if (isStale) {
      emoji = '⚠️';
      title = 'HazardNet Advisory Staleness Warning (> 36h)';
      color = '#d97706';
    } else {
      emoji = '🚨';
      title = 'HazardNet Advisory Ingestion Incident';
      color = '#dc2626';
    }
  }

  const tierSummary = `${metrics.tierCounts.SEVERE} SEVERE · ${metrics.tierCounts.WARNING} WARNING · ${metrics.tierCounts.WATCH} WATCH · ${metrics.tierCounts.NORMAL} NORMAL`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Status:*\n${isSuccess ? 'Operational' : isStale ? 'Stale Data' : 'Failed'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Prediction Date:*\n${metrics.predictionDate || 'N/A'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Row Count:*\n${metrics.rowCount} records (64 districts × 2 horizons)`,
        },
        {
          type: 'mrkdwn',
          text: `*Data Age:*\n${metrics.ageHours} h ${metrics.isStale ? '(Past 36h SLO)' : '(Within SLO)'}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Tier Distribution:*\n${tierSummary}`,
        },
        {
          type: 'mrkdwn',
          text: `*Execution Duration:*\n${duration || 'N/A'}`,
        },
      ],
    },
  ];

  if (error) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error Detail:*\n\`\`\`${error.slice(0, 1000)}\`\`\``,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Channel: *${channel || '#hazardnet-ops'}* · <${runUrl}|View GitHub Actions Run>`,
      },
    ],
  });

  return {
    channel: channel || '#hazardnet-ops',
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
}

export async function dispatchNotification(payload, webhookUrl = process.env.SLACK_WEBHOOK_URL) {
  if (!webhookUrl) {
    console.log('[notify_ops] SLACK_WEBHOOK_URL not set — logging notification payload to stdout:');
    console.log(JSON.stringify(payload, null, 2));
    return { ok: true, mocked: true };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[notify_ops] Slack webhook failed with HTTP ${res.status}: ${text}`);
      return { ok: false, status: res.status, text };
    }

    console.log('[notify_ops] Slack notification sent successfully.');
    return { ok: true, mocked: false };
  } catch (err) {
    console.warn(`[notify_ops] Slack dispatch network error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const args = parseArgs();
  const metrics = extractPipelineMetrics({
    manifestPath: args.manifest,
    snapshotPath: args.snapshot,
  });

  const payload = buildSlackPayload({
    status: args.status,
    metrics,
    duration: args.duration,
    error: args.error,
    runUrl: args.runUrl,
    channel: args.channel,
  });

  dispatchNotification(payload).then((result) => {
    process.exit(result.ok ? 0 : 1);
  });
}
