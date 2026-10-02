/**
 * __tests__/phaseDHardening.test.js — Phase D (Hardening & Launch) Integration Test Suite
 *
 * Validates:
 * - TASK-011: Security P0 Checklist & Headers Hardening (TRD §9.2)
 * - TASK-012: Accessibility + Performance Pass (TRD §7.5, §9.1, §13)
 * - TASK-013: SEO Foundations + Structured Data (TRD §7.8)
 * - TASK-014: Operational Monitoring & Slack Alerts (TRD §8.3, §11)
 */

import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;

import { CSP, cspDirectivesFromString } from '../backend/security/csp.js';
import { apiLimiter, predictLimiter, alertLimiter } from '../backend/middleware/rateLimit.js';
import {
  extractPipelineMetrics,
  buildSlackPayload,
  parseArgs,
} from '../scripts/notify_ops.mjs';

describe('TASK-011: Security P0 Checklist & Headers Hardening (TRD §9.2)', () => {
  test('CSP defines strict policy without unsafe-inline in script-src', () => {
    assert.ok(CSP.includes("default-src 'self'"), 'CSP must specify default-src self');
    assert.ok(CSP.includes("object-src 'none'"), 'CSP must specify object-src none');
    assert.ok(CSP.includes("frame-ancestors 'none'"), 'CSP must specify frame-ancestors none');

    // script-src must not permit unsafe-inline
    const directives = cspDirectivesFromString(CSP);
    const scriptSrc = directives.scriptSrc || [];
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'script-src must NOT contain unsafe-inline');
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), 'script-src must NOT contain unsafe-eval');
  });

  test('RFC 9116 security.txt exists and specifies canonical contact and policy', () => {
    const securityTxtPath = path.resolve(process.cwd(), 'frontend', 'public', '.well-known', 'security.txt');
    assert.ok(fs.existsSync(securityTxtPath), 'frontend/public/.well-known/security.txt must exist');

    const content = fs.readFileSync(securityTxtPath, 'utf8');
    assert.ok(content.includes('Contact:'), 'security.txt must include Contact:');
    assert.ok(content.includes('Expires:'), 'security.txt must include Expires:');
    assert.ok(content.includes('Canonical:'), 'security.txt must include Canonical:');
    assert.ok(content.includes('https://www.hazardnet.live/.well-known/security.txt'), 'Canonical URL must point to production domain');
  });

  test('backend/server.js sets strict HSTS and serves security.txt endpoint', () => {
    const serverCode = fs.readFileSync(path.resolve(process.cwd(), 'backend', 'server.js'), 'utf8');
    assert.ok(serverCode.includes('Strict-Transport-Security'), 'server.js must set Strict-Transport-Security header');
    assert.ok(serverCode.includes('includeSubDomains'), 'HSTS must includeSubDomains');
    assert.ok(serverCode.includes('preload'), 'HSTS must specify preload');
    assert.ok(serverCode.includes('/.well-known/security.txt'), 'server.js must serve /.well-known/security.txt');
  });

  test('Rate limiting middleware is configured for public and API endpoints', () => {
    assert.ok(typeof apiLimiter === 'function', 'apiLimiter middleware must exist');
    assert.ok(typeof predictLimiter === 'function', 'predictLimiter middleware must exist');
    assert.ok(typeof alertLimiter === 'function', 'alertLimiter middleware must exist');
  });
});

describe('TASK-012: Accessibility + Performance Pass (TRD §7.5, §9.1, §13)', () => {
  test('AlertLevelBadge defines WCAG 2.2 AA compliant contrast colors and role="status"', () => {
    const badgeCode = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'alerts', 'AlertLevelBadge.tsx'), 'utf8');
    assert.ok(badgeCode.includes('role="status"'), 'AlertLevelBadge must render role="status"');
    // High-contrast tokens
    assert.ok(badgeCode.includes('#15803D') || badgeCode.includes('text-[#15803D]'), 'NORMAL tier uses accessible dark green');
    assert.ok(badgeCode.includes('#854D0E') || badgeCode.includes('text-[#854D0E]'), 'WATCH tier uses accessible dark yellow');
    assert.ok(badgeCode.includes('#9A3412') || badgeCode.includes('text-[#9A3412]'), 'WARNING tier uses accessible dark amber');
    assert.ok(badgeCode.includes('#991B1B') || badgeCode.includes('text-[#991B1B]'), 'SEVERE tier uses accessible dark crimson');
  });

  test('DistrictDetailPanel includes accessible dialog/region and ARIA labeling', () => {
    const panelCode = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'DistrictDetailPanel.tsx'), 'utf8');
    assert.ok(panelCode.includes('role={isModal ? \'dialog\' : \'region\'}'), 'DistrictDetailPanel must have dynamic role dialog/region');
    assert.ok(panelCode.includes('aria-label='), 'DistrictDetailPanel must declare aria-label');
    assert.ok(panelCode.includes('aria-label="Close detail panel"'), 'Close button must have aria-label');
  });

  test('StatusStrip declares live region attributes for screen readers', () => {
    const stripCode = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'StatusStrip.tsx'), 'utf8');
    assert.ok(stripCode.includes('role="status"'), 'StatusStrip must have role="status"');
    assert.ok(stripCode.includes('aria-live="polite"'), 'StatusStrip must have aria-live="polite"');
  });
});

describe('TASK-013: SEO Foundations + Structured Data (TRD §7.8)', () => {
  test('sitemap.xml includes permalinks for all 64 Bangladesh districts and archives', () => {
    const sitemapPath = path.resolve(process.cwd(), 'frontend', 'public', 'sitemap.xml');
    assert.ok(fs.existsSync(sitemapPath), 'sitemap.xml must exist');

    const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
    assert.ok(sitemapContent.includes('<loc>https://www.hazardnet.live/archive</loc>'), 'Sitemap must include /archive');
    assert.ok(sitemapContent.includes('<loc>https://www.hazardnet.live/district/kurigram</loc>'), 'Sitemap must include /district/kurigram');
    assert.ok(sitemapContent.includes('<loc>https://www.hazardnet.live/district/sunamganj</loc>'), 'Sitemap must include /district/sunamganj');
    assert.ok(sitemapContent.includes('<loc>https://www.hazardnet.live/district/dhaka</loc>'), 'Sitemap must include /district/dhaka');
    assert.ok(sitemapContent.includes('<loc>https://www.hazardnet.live/district/bandarban</loc>'), 'Sitemap must include /district/bandarban');

    const districtCount = (sitemapContent.match(/<loc>https:\/\/www\.hazardnet\.live\/district\/[a-z0-9_-]+<\/loc>/g) || []).length;
    assert.equal(districtCount, 64, `Sitemap must contain exactly 64 district permalinks, found ${districtCount}`);
  });

  test('robots.txt points to canonical sitemap and disallows private routes', () => {
    const robotsPath = path.resolve(process.cwd(), 'frontend', 'public', 'robots.txt');
    assert.ok(fs.existsSync(robotsPath), 'robots.txt must exist');
    const robotsContent = fs.readFileSync(robotsPath, 'utf8');
    assert.ok(robotsContent.includes('Sitemap: https://www.hazardnet.live/sitemap.xml'), 'robots.txt must link canonical sitemap.xml');
    assert.ok(robotsContent.includes('Disallow: /dashboard'), 'robots.txt must disallow /dashboard');
  });

  test('SEOHead component defines Dataset, GovernmentOrganization, and FAQPage schemas', () => {
    const seoHeadCode = fs.readFileSync(path.resolve(process.cwd(), 'frontend', 'src', 'components', 'SEOHead.tsx'), 'utf8');
    assert.ok(seoHeadCode.includes('@type\': \'GovernmentOrganization\''), 'SEOHead must define GovernmentOrganization schema');
    assert.ok(seoHeadCode.includes('@type\': \'Dataset\''), 'SEOHead must define Dataset schema');
    assert.ok(seoHeadCode.includes('@type\': \'FAQPage\''), 'SEOHead must define FAQPage schema');
    assert.ok(seoHeadCode.includes('og:locale'), 'SEOHead must include og:locale');
    assert.ok(seoHeadCode.includes('twitter:card'), 'SEOHead must include twitter:card');
  });
});

describe('TASK-014: Operational Monitoring & Slack Alerts (TRD §8.3, §11)', () => {
  test('extractPipelineMetrics reads manifest and calculates age & metrics', () => {
    const metrics = extractPipelineMetrics({
      manifestPath: 'backend/data/forecasts/manifest.json',
      snapshotPath: 'frontend/public/data/forecasts-latest.json',
    });

    assert.ok(metrics.rowCount > 0, `Row count must be positive, got ${metrics.rowCount}`);
    assert.ok(metrics.predictionDate, 'Prediction date must be defined');
    assert.equal(typeof metrics.ageHours, 'number', 'ageHours must be number');
    assert.equal(typeof metrics.tierCounts, 'object', 'tierCounts must be object');
  });

  test('buildSlackPayload creates Block Kit payload for success and failure', () => {
    const successMetrics = {
      predictionDate: '2026-09-30',
      generatedAt: new Date().toISOString(),
      rowCount: 128,
      tierCounts: { SEVERE: 4, WARNING: 12, WATCH: 20, NORMAL: 28 },
      isStale: false,
      ageHours: 1.5,
    };

    const payload = buildSlackPayload({
      status: 'success',
      metrics: successMetrics,
      duration: '3m 15s',
      channel: '#hazardnet-ops',
      runUrl: 'https://github.com/myself-aas/HazardNet/actions/runs/12345',
    });

    assert.equal(payload.channel, '#hazardnet-ops', 'Channel must match');
    assert.equal(payload.attachments[0].color, '#16a34a', 'Success color must be green');
    const headerBlock = payload.attachments[0].blocks.find((b) => b.type === 'header');
    assert.ok(headerBlock.text.text.includes('Succeeded'), 'Header text must indicate success');

    // Failure payload
    const failPayload = buildSlackPayload({
      status: 'failure',
      metrics: successMetrics,
      error: 'Connection timeout fetching Kaggle advisory',
      channel: '#hazardnet-ops',
      runUrl: 'https://github.com/myself-aas/HazardNet/actions/runs/12345',
    });

    assert.equal(failPayload.attachments[0].color, '#dc2626', 'Failure color must be red');
    const failHeader = failPayload.attachments[0].blocks.find((b) => b.type === 'header');
    assert.ok(failHeader.text.text.includes('Incident'), 'Header text must indicate incident');
  });

  test('daily_advisory_ingest.yml invokes scripts/notify_ops.mjs for Slack alert', () => {
    const workflowPath = path.resolve(process.cwd(), '.github', 'workflows', 'daily_advisory_ingest.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(workflowContent.includes('scripts/notify_ops.mjs'), 'Workflow must execute scripts/notify_ops.mjs');
    assert.ok(workflowContent.includes('--channel="#hazardnet-ops"'), 'Workflow must target #hazardnet-ops');
  });
});
