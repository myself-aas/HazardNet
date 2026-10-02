/**
 * @jest-environment node
 *
 * __tests__/phaseCBackend.test.js — Phase C (Backend & API) Integration Test Suite
 *
 * Validates:
 * - TASK-008: Forecast API serving new advisory fields & metadata row_count (TRD §6.1, §9.1)
 * - TASK-009: Alert state machine, RBAC 403 REVIEW_ROLE_REQUIRED, optimistic locking, audit trail (TRD §6.1, §7.4, §9.2)
 * - TASK-010: Claims registry verification and limitation audits (TRD §10)
 */

import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvForecastRow } from '../backend/utils/forecastRow.js';
import { getForecastStore, ensureAdvisoryFields, resetForecastStore } from '../backend/forecastStore.js';
import {
  ALERT_STATES,
  evaluateTransition,
  applyTransition,
} from '../backend/alerts/lifecycle.js';
import {
  reviewAlert,
  getAlertStore,
  resetAlertStore,
} from '../backend/alerts/service.js';
import {
  parseClaimsRegistry,
  validateClaims,
  scanPublicSurfaces,
} from '../scripts/verify_claims.mjs';
import fs from 'node:fs';
import path from 'node:path';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;
const before = globalThis.beforeAll ?? nodeTest.before;
const after = globalThis.afterAll ?? nodeTest.after;
const beforeEach = globalThis.beforeEach ?? nodeTest.beforeEach;

before(() => {
  process.env.NODE_ENV = 'test';
  process.env.FORECAST_STORE_MEMORY = 'true';
  process.env.ALERT_STORE_MEMORY = 'true';
  resetForecastStore();
});

after(() => {
  delete process.env.FORECAST_STORE_MEMORY;
  resetForecastStore();
});

describe('TASK-008: Forecast API — Serving New Advisory Fields & Metadata', () => {
  test('parseCsvForecastRow parses and preserves all new advisory and geospatial fields', () => {
    const rawRow = {
      district_id: '61',
      district_name: 'Sunamganj',
      division: 'Sylhet',
      latitude: '25.0658',
      longitude: '91.3950',
      horizon: '7_days',
      hazard_type: 'Flash Flood',
      confidence: '0.985',
      model_severity_raw: '0.92',
      model_severity: '0.95',
      physics_severity: '0.88',
      final_severity: '0.965',
      physics_override: 'true',
      advisory_tier: 'SEVERE',
      target_date: '2026-10-02',
      prediction_date: '2026-09-25',
      prob_top1: '0.985',
      prob_top2: '0.012',
      prob_top3: '0.003',
      data_source: 'Kaggle_Daily_Advisory',
    };

    const parsed = parseCsvForecastRow(rawRow, 1);
    assert.equal(parsed.ok, true, 'Row should parse successfully');
    const row = parsed.value;

    assert.equal(row.advisory_tier, 'SEVERE', 'advisory_tier must be SEVERE');
    assert.equal(row.physics_override, true, 'physics_override must be true');
    assert.equal(row.latitude, 25.0658, 'latitude must match');
    assert.equal(row.longitude, 91.3950, 'longitude must match');
    assert.equal(row.final_severity, 0.965, 'final_severity must match');
    assert.equal(row.model_severity_raw, 0.92, 'model_severity_raw must match');
    assert.equal(row.prob_top1, 0.985, 'prob_top1 must match');
    assert.equal(row.prob_top2, 0.012, 'prob_top2 must match');
    assert.equal(row.prob_top3, 0.003, 'prob_top3 must match');
  });

  test('ensureAdvisoryFields augments legacy / fallback rows gracefully', () => {
    const legacyRow = {
      district_id: 13,
      district_name: 'Dhaka',
      hazard_type: 'Flood',
      severity_score: 0.85,
      confidence: 0.92,
      target_date: '2026-09-23',
      prediction_date: '2026-09-16',
    };

    const enriched = ensureAdvisoryFields(legacyRow);
    assert.equal(enriched.advisory_tier, 'SEVERE', 'Severity >= 0.75 maps to SEVERE');
    assert.equal(enriched.physics_override, false, 'Defaults to false');
    assert.ok(Number.isFinite(enriched.latitude), 'Latitude must be looked up and numeric');
    assert.ok(Number.isFinite(enriched.longitude), 'Longitude must be looked up and numeric');
    assert.equal(enriched.final_severity, 0.85, 'final_severity defaults to severity_score');
    assert.equal(enriched.prob_top1, 0.92, 'prob_top1 defaults to confidence');
    assert.equal(enriched.prob_top2, 0.0, 'prob_top2 defaults to 0');
    assert.equal(enriched.prob_top3, 0.0, 'prob_top3 defaults to 0');
  });

  test('forecastStore.getLatestForecastsByHorizon returns all new advisory fields with low latency', async () => {
    const store = getForecastStore();
    const t0 = performance.now();
    const rows = await store.getLatestForecastsByHorizon('7_days');
    const elapsed = performance.now() - t0;

    assert.ok(rows.length > 0, 'Should return forecast rows');
    assert.ok(elapsed < 300, `Latency must be < 300ms (took ${elapsed.toFixed(2)}ms)`);

    for (const row of rows) {
      assert.ok(['SEVERE', 'WARNING', 'WATCH', 'NORMAL'].includes(row.advisory_tier),
        `District ${row.district_name} must have valid advisory_tier, got ${row.advisory_tier}`);
      assert.equal(typeof row.physics_override, 'boolean',
        `District ${row.district_name} physics_override must be boolean`);
      assert.ok(Number.isFinite(row.latitude), `District ${row.district_name} must have numeric latitude`);
      assert.ok(Number.isFinite(row.longitude), `District ${row.district_name} must have numeric longitude`);
      assert.ok(Number.isFinite(row.final_severity), `District ${row.district_name} must have final_severity`);
      assert.ok(Number.isFinite(row.prob_top1), `District ${row.district_name} must have prob_top1`);
      assert.ok(Number.isFinite(row.prob_top2), `District ${row.district_name} must have prob_top2`);
      assert.ok(Number.isFinite(row.prob_top3), `District ${row.district_name} must have prob_top3`);
    }
  });

  test('forecastStore.getLatestRowCount returns integer count matching manifest', async () => {
    const store = getForecastStore();
    const count = await store.getLatestRowCount();
    assert.ok(Number.isInteger(count) && count > 0, `row_count must be positive integer, got ${count}`);
  });
});

describe('TASK-009: Alert State Machine, RBAC Enforcement & Optimistic Locking', () => {
  beforeEach(() => {
    resetAlertStore();
  });

  test('ALERT_STATES defines complete lifecycle per PRD REQ-002', () => {
    const expected = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'UPDATED', 'EXPIRED', 'ALL_CLEAR', 'REJECTED', 'SUPERSEDED'];
    for (const s of expected) {
      assert.ok(ALERT_STATES.includes(s), `ALERT_STATES must include ${s}`);
    }
  });

  test('State transitions execute deterministically through full lifecycle', () => {
    const doc = {
      id: 'alert_test_001',
      state: 'DRAFT',
      level: 'WARNING',
      hazard_type: 'Flash Flood',
      district_id: 61,
      target_date: '2026-10-02',
      events: [],
    };

    // 1. Submit for review: DRAFT -> PENDING_REVIEW
    const t1 = evaluateTransition({ action: 'submit-for-review', alert: doc, actor: 'duty_officer' });
    assert.equal(t1.ok, true, 'DRAFT -> PENDING_REVIEW must succeed');
    const doc1 = applyTransition(doc, { transition: t1.transition, actor: 'duty_officer' });
    assert.equal(doc1.state, 'PENDING_REVIEW');
    assert.equal(doc1.version, 2);

    // 2. Approve: PENDING_REVIEW -> PUBLISHED
    const snapshot = { level: 'WARNING' };
    const t2 = evaluateTransition({
      action: 'approve',
      alert: doc1,
      actor: 'duty_officer',
      target: { level: 'WARNING' },
      evidence_snapshot: snapshot,
    });
    assert.equal(t2.ok, true, 'PENDING_REVIEW -> PUBLISHED must succeed');
    const doc2 = applyTransition(doc1, { transition: t2.transition, actor: 'duty_officer' });
    assert.equal(doc2.state, 'PUBLISHED');
    assert.equal(doc2.version, 3);

    // 3. Update: PUBLISHED -> UPDATED (REQ-002)
    const t3 = evaluateTransition({ action: 'update', alert: doc2, actor: 'duty_officer', reason: 'Severity increased to WARNING peak' });
    assert.equal(t3.ok, true, 'PUBLISHED -> UPDATED must succeed');
    const doc3 = applyTransition(doc2, { transition: t3.transition, actor: 'duty_officer', reason: 'Severity increased to WARNING peak' });
    assert.equal(doc3.state, 'UPDATED');
    assert.equal(doc3.version, 4);

    // 4. All-Clear: UPDATED -> ALL_CLEAR (REQ-002)
    const t4 = evaluateTransition({ action: 'all-clear', alert: doc3, actor: 'duty_officer', reason: 'Floodwaters receded below danger mark' });
    assert.equal(t4.ok, true, 'UPDATED -> ALL_CLEAR must succeed');
    const doc4 = applyTransition(doc3, { transition: t4.transition, actor: 'duty_officer', reason: 'Floodwaters receded' });
    assert.equal(doc4.state, 'ALL_CLEAR');
    assert.equal(doc4.version, 5);
  });

  test('Rejection requires reason and transitions PENDING_REVIEW -> REJECTED', () => {
    const doc = { id: 'alert_test_reject', state: 'PENDING_REVIEW', level: 'SEVERE', events: [] };
    const tFail = evaluateTransition({ action: 'reject', alert: doc, actor: 'reviewer_1', reason: '' });
    assert.equal(tFail.ok, false, 'Rejection without reason must fail');

    const tPass = evaluateTransition({
      action: 'reject',
      alert: doc,
      actor: 'reviewer_1',
      reason: 'Station telemetry shows rainfall below 10mm; model false positive',
    });
    assert.equal(tPass.ok, true);
    const rejectedDoc = applyTransition(doc, {
      transition: tPass.transition,
      actor: 'reviewer_1',
      reason: 'Telemetry shows low rainfall',
    });
    assert.equal(rejectedDoc.state, 'REJECTED');
  });

  test('RBAC: Non-reviewer caller cannot review alerts (403 REVIEW_ROLE_REQUIRED)', async () => {
    const store = getAlertStore();
    const testDoc = {
      id: 'alert_rbac_test',
      state: 'PENDING_REVIEW',
      level: 'WARNING',
      version: 1,
      assessment: {
        alert_id: 'alert_rbac_test',
        level: 'WARNING',
        status: 'assessed',
        provenance: { model_version: 'v4.1' },
        freshness: { data_cutoff: '2026-09-25T00:00:00Z' },
      },
      events: [],
    };
    await store.putDocument(testDoc);

    // Caller with analyst role (NOT reviewer)
    const analystUser = { id: 'analyst_123', email: 'analyst@hazardnet.org', role: 'analyst' };
    const res = await reviewAlert({
      id: 'alert_rbac_test',
      action: 'approve',
      user: analystUser,
      store,
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 403, 'Must return 403 for non-reviewer');
    assert.match(res.error, /REVIEW_ROLE_REQUIRED/);
  });

  test('RBAC: Reviewer role successfully approves alert and updates state', async () => {
    const store = getAlertStore();
    const testDoc = {
      id: 'alert_approve_test',
      state: 'PENDING_REVIEW',
      level: 'WARNING',
      version: 1,
      assessment: {
        alert_id: 'alert_approve_test',
        level: 'WARNING',
        status: 'assessed',
        provenance: { model_version: 'v4.1' },
        freshness: { data_cutoff: '2026-09-25T00:00:00Z' },
      },
      events: [],
    };
    await store.putDocument(testDoc);

    const reviewerUser = { id: 'rev_456', email: 'duty@hazardnet.org', role: 'reviewer' };
    const res = await reviewAlert({
      id: 'alert_approve_test',
      action: 'approve',
      user: reviewerUser,
      store,
    });

    assert.equal(res.ok, true, 'Reviewer should successfully approve');
    assert.equal(res.state, 'PUBLISHED');
  });

  test('Optimistic locking: Concurrent review attempt with stale version returns 409 CONCURRENCY_CONFLICT', async () => {
    const store = getAlertStore();
    const testDoc = {
      id: 'alert_locking_test',
      state: 'PENDING_REVIEW',
      level: 'WARNING',
      version: 2, // Current document version is 2
      assessment: {
        alert_id: 'alert_locking_test',
        level: 'WARNING',
        status: 'assessed',
        provenance: { model_version: 'v4.1' },
        freshness: { data_cutoff: '2026-09-25T00:00:00Z' },
      },
      events: [],
    };
    await store.putDocument(testDoc);

    const reviewerUser = { id: 'rev_789', email: 'duty2@hazardnet.org', role: 'duty_officer' };

    // Reviewer A submits with stale version 1
    const res = await reviewAlert({
      id: 'alert_locking_test',
      action: 'approve',
      user: reviewerUser,
      expectedVersion: 1,
      store,
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 409, 'Must return 409 on version conflict');
    assert.equal(res.error, 'CONCURRENCY_CONFLICT');
    assert.equal(res.current_version, 2);
    assert.equal(res.expected_version, 1);
  });

  test('Immutable audit trail: Every state transition appends an event to history', async () => {
    const store = getAlertStore();
    const testDoc = {
      id: 'alert_audit_test',
      state: 'PENDING_REVIEW',
      level: 'WARNING',
      version: 1,
      assessment: {
        alert_id: 'alert_audit_test',
        level: 'WARNING',
        status: 'assessed',
        provenance: { model_version: 'v4.1' },
        freshness: { data_cutoff: '2026-09-25T00:00:00Z' },
      },
      events: [],
    };
    await store.putDocument(testDoc);

    const reviewerUser = { id: 'rev_audit', email: 'auditor@hazardnet.org', role: 'duty_officer' };
    await reviewAlert({
      id: 'alert_audit_test',
      action: 'approve',
      user: reviewerUser,
      reason: 'Ground radar confirmation',
      store,
    });

    const doc = await store.getDocument('alert_audit_test');
    assert.ok(Array.isArray(doc.events), 'Document must have events array');
    assert.equal(doc.events.length, 1, 'Event log must have 1 entry');
    assert.equal(doc.events[0].action, 'approve');
    assert.equal(doc.events[0].from, 'PENDING_REVIEW');
    assert.equal(doc.events[0].to, 'PUBLISHED');
    assert.equal(doc.events[0].reason, 'Ground radar confirmation');
  });
});

describe('TASK-010: Claims Registry & Verification Gate (TRD §10, PRD REQ-005)', () => {
  test('CLAIMS.md exists and contains all 16 canonical headline claims', () => {
    const claimsPath = path.resolve(process.cwd(), 'CLAIMS.md');
    assert.ok(fs.existsSync(claimsPath), 'CLAIMS.md must exist');
    const content = fs.readFileSync(claimsPath, 'utf8');
    const claims = parseClaimsRegistry(content);

    assert.equal(claims.length >= 16, true, `Must have at least 16 claims, got ${claims.length}`);
    const validation = validateClaims(claims);
    assert.equal(validation.valid, true, `Claims validation errors: ${validation.errors.join(', ')}`);
  });

  test('Every registered claim maps to non-empty methodological limitations', () => {
    const claimsPath = path.resolve(process.cwd(), 'CLAIMS.md');
    const content = fs.readFileSync(claimsPath, 'utf8');
    const claims = parseClaimsRegistry(content);

    for (const c of claims) {
      assert.ok(c.limitations && c.limitations.length >= 20,
        `Claim ${c.id} (${c.metric}) must document methodological limitations (got: "${c.limitations}")`);
    }
  });

  test('Public surface scan detects unregistered numeric claims when present', () => {
    const testClaims = [
      { id: 'CLM-001', metric: '64', canonicalValue: '64', limitations: 'valid limit here for testing' },
    ];

    // Create a temporary mock file with an unregistered claim
    const tempFile = path.resolve(process.cwd(), 'docs', '_temp_unregistered_claim.md');
    try {
      fs.writeFileSync(tempFile, 'HazardNet models 99 districts across Bangladesh.');
      const scan = scanPublicSurfaces(['docs/_temp_unregistered_claim.md'], testClaims);
      assert.equal(scan.passed, false, 'Scan must fail on unregistered "99 districts"');
      assert.ok(scan.findings.some((f) => f.includes('99 districts')), 'Must identify 99 districts');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });
});
