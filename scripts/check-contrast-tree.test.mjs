import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const scanner = fileURLToPath(new URL('./check-contrast-tree.mjs', import.meta.url));
const report = JSON.parse(execFileSync(process.execPath, [scanner, '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
}));

const VERIFIED_ROOTS = [
  ['components/ArticlePage.tsx', '--ap-bg-canvas'],
  ['components/Breadcrumbs.tsx', '--ap-bg-canvas'],
  ['components/DataProcessingSkeleton.tsx', '--ap-bg-canvas'],
  ['components/EmdatComparisonChart.tsx', '--ap-bg-card'],
  ['components/FirebaseRealtimeStatus.tsx', '--ap-bg-card'],
  ['components/IdentityConnections.tsx', '--ap-bg-card'],
  ['components/ReportTemplate.tsx', '--ap-bg-canvas'],
  ['components/RiskAnalytics.tsx', '--ap-bg-canvas'],
  ['components/StoredForecastPanel.tsx', '--ap-bg-canvas'],
  ['components/WeatherPanel.tsx', '--ap-bg-canvas'],
  ['components/alerts/AlertFilters.tsx', '--ap-bg-canvas'],
  ['components/alerts/AlertLevelBadge.tsx', '--ap-bg-canvas'],
  ['components/alerts/DataSourceBanner.tsx', '--ap-bg-canvas'],
  ['components/alerts/DistrictAlertTable.tsx', '--ap-bg-canvas'],
  ['components/alerts/EvidenceCard.tsx', '--ap-bg-canvas'],
  ['components/auth/AuthLayout.tsx', '--ap-bg-canvas'],
  ['components/auth/AuthSocialButtons.tsx', '--ap-bg-canvas'],
  ['components/blog/RequireSuperAdmin.tsx', '--ap-bg-canvas'],
  ['components/docs/DocsVisuals.tsx', '--ap-bg-canvas'],
  ['components/district/DistrictBriefBody.tsx', '--ap-bg-canvas'],
  ['components/frontdoor/HazardIndex.tsx', '--ap-bg-canvas'],
  ['components/frontdoor/RunVisual.tsx', '--ap-bg-canvas'],
  ['components/map/DistrictForecastCard.tsx', '--ap-bg-elevated'],
  ['components/ui/FloatingControlBar.tsx', '--ap-bg-canvas'],
  ['components/ui/KeyFigures.tsx', '--ap-bg-canvas'],
  ['components/user/UserAvatarField.tsx', '--ap-bg-card'],
  ['components/user/dashboard/AccountSection.tsx', '--ap-bg-card'],
  ['components/user/dashboard/OverviewSection.tsx', '--ap-bg-card'],
  ['components/user/dashboard/ProfileDetails.tsx', '--ap-bg-canvas'],
  ['components/user/dashboard/ui.tsx', '--ap-bg-card'],
];

test('ancestor-aware contrast scan has no measured AA failures', () => {
  assert.equal(report.total, 0, JSON.stringify(report.problems, null, 2));
});

test('JSON audit examples remain capped at 100 skipped pairs', () => {
  assert.equal(report.skippedExamples.length, Math.min(report.skippedUnknown, 100));
});

test('each call-site-verified component surface is exercised by visible text pairs', () => {
  for (const [file, token] of VERIFIED_ROOTS) {
    const key = `${file}|${token}`;
    assert.ok(
      report.rootSurfaceUsage[key] > 0,
      `${key} should be used by at least one foreground/background pair; update this audit if its call sites or surface change`,
    );
  }
});
