/**
 * @jest-environment node
 *
 * Phase 3: Isotonic Probability Calibration (hazardnet-calibration/v1),
 * Lead-Time Backtest Verification, and Calibrated WARNING/SEVERE Unlock.
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  CALIBRATION_FORMAT,
  validateCalibrationMap,
  fitIsotonicCalibration,
  applyCalibrationToScore,
  applyCalibrationToRow,
  evaluateLeadTimeBacktest,
} from '../../backend/alerts/calibration.js';
import { assessRow } from '../../backend/alerts/assess.js';
import { getPolicy } from '../../backend/alerts/policy.js';
import {
  ADVISORY_CSV_COLUMNS,
  DISTRICT_REGISTRY,
  mapAdvisoryRows,
  forecastRowsToCsv,
} from '../../backend/utils/advisoryMapper.js';
import { rehearseAlertEngine } from '../../scripts/rehearse_alert_engine.mjs';

describe('Phase 3: hazardnet-calibration/v1 & Lead-Time Backtest Engine', () => {
  test('refuses the unfitted template map Models/calibration/confidence_map.template.json', () => {
    const templatePath = path.resolve(process.cwd(), 'Models/calibration/confidence_map.template.json');
    const templateDoc = JSON.parse(readFileSync(templatePath, 'utf8'));

    const validation = validateCalibrationMap(templateDoc);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/awaiting-outcomes|samples|pairs/i);

    expect(() => applyCalibrationToScore(0.8, templateDoc)).toThrow(/Invalid or unfitted calibration map/i);
  });

  test('fits a monotone isotonic calibration map via PAVA that improves Brier score and unlocks WARNING/SEVERE', () => {
    // Synthetic overconfident raw scores vs observed binary outcomes
    const trainingSamples = [
      { confidence: 0.15, outcome: 0, horizon: '7_days' },
      { confidence: 0.22, outcome: 0, horizon: '7_days' },
      { confidence: 0.35, outcome: 0, horizon: '15_days' },
      { confidence: 0.42, outcome: 1, horizon: '7_days' },
      { confidence: 0.48, outcome: 0, horizon: '15_days' },
      { confidence: 0.55, outcome: 1, horizon: '7_days' },
      { confidence: 0.62, outcome: 0, horizon: '15_days' },
      { confidence: 0.70, outcome: 1, horizon: '7_days' },
      { confidence: 0.78, outcome: 1, horizon: '7_days' },
      { confidence: 0.85, outcome: 1, horizon: '15_days' },
      { confidence: 0.92, outcome: 1, horizon: '7_days' },
      { confidence: 0.97, outcome: 1, horizon: '15_days' },
    ];

    const fitted = fitIsotonicCalibration(trainingSamples, {
      fit_period: '2020-01-01..2026-09-30',
      fitted_on: '2026-10-02',
      fit_source: 'historical-backtest-episodes',
      label_definition: 'district_hazard_impact_observed',
    });

    expect(fitted.format).toBe(CALIBRATION_FORMAT);
    expect(fitted.method).toBe('isotonic');
    expect(fitted.status).toBe('fitted');
    expect(fitted.samples).toBe(trainingSamples.length);
    expect(fitted.monotone).toBe(true);
    expect(fitted.converged).toBe(true);
    expect(fitted.brier).toBeLessThanOrEqual(fitted.brier_raw);
    expect(validateCalibrationMap(fitted).valid).toBe(true);

    // Apply calibration to a raw forecast row
    const rawRow = {
      district_id: 1,
      district_name: 'Kurigram',
      division: 'Rangpur',
      horizon: '7_days',
      hazard_type: 'Flood',
      severity_score: 0.78,
      model_severity: 0.78,
      physics_severity: 0.74,
      confidence: 0.88,
      prediction_date: '2026-10-02',
      target_date: '2026-10-09',
      model_version: '2.1.9+model.0bb5bdaf1789',
    };

    const calibratedRow = applyCalibrationToRow(rawRow, fitted);
    expect(calibratedRow.confidence_kind).toBe('calibrated_probability');
    expect(calibratedRow.confidence_raw).toBe(0.88);
    expect(calibratedRow.confidence).toBeGreaterThanOrEqual(0.65);

    // Assess row: should now reach WARNING because confidence is calibrated and |0.78 - 0.74| = 0.04 <= 0.10
    const policy = getPolicy({});
    const now = new Date('2026-10-02T06:00:00Z');
    const warningAssessment = assessRow(calibratedRow, { policy, now });
    expect(warningAssessment.level).toBe('WARNING');
    expect(warningAssessment.reasons.map((r) => r.rule)).toContain('warning_probability_and_agreement');

    // With duty officer approval, escalates to SEVERE
    const severeAssessment = assessRow(
      { ...calibratedRow, duty_officer_approval: true, reviewed_by: 'duty.officer@hazardnet.live' },
      { policy, now },
    );
    expect(severeAssessment.level).toBe('SEVERE');
    expect(severeAssessment.reasons.map((r) => r.rule)).toContain('severe_duty_officer_review');
  });

  test('evaluates lead-time backtest metrics (POD, FAR, CSI, Brier, ECE) across 7_days and 15_days horizons', () => {
    const backtestRecords = [
      { confidence: 0.82, outcome: 1, horizon: '7_days', lead_time_days: 7 },
      { confidence: 0.75, outcome: 1, horizon: '7_days', lead_time_days: 7 },
      { confidence: 0.20, outcome: 0, horizon: '7_days', lead_time_days: 7 },
      { confidence: 0.70, outcome: 0, horizon: '15_days', lead_time_days: 15 },
      { confidence: 0.80, outcome: 1, horizon: '15_days', lead_time_days: 15 },
      { confidence: 0.30, outcome: 1, horizon: '15_days', lead_time_days: 15 },
    ];

    const report = evaluateLeadTimeBacktest(backtestRecords, { threshold: 0.65 });
    expect(report.total).toBe(6);
    expect(report.hits).toBe(3);
    expect(report.misses).toBe(1);
    expect(report.false_alarms).toBe(1);
    expect(report.correct_negatives).toBe(1);
    expect(report.pod).toBeCloseTo(3 / 4, 4);
    expect(report.far).toBeCloseTo(1 / 4, 4);
    expect(report.csi).toBeCloseTo(3 / 5, 4);
    expect(report.per_horizon['7_days'].pod).toBeCloseTo(1.0, 4);
    expect(report.per_horizon['15_days'].pod).toBeCloseTo(0.5, 4);
  });

  test('propagates calibrated probabilities through advisoryMapper -> CSV -> build_forecast_snapshot -> rehearseAlertEngine', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'hazardnet-phase3-cal-'));
    try {
      const fitted = fitIsotonicCalibration([
        { confidence: 0.1, outcome: 0 },
        { confidence: 0.3, outcome: 0 },
        { confidence: 0.6, outcome: 1 },
        { confidence: 0.8, outcome: 1 },
        { confidence: 0.95, outcome: 1 },
      ], {
        fit_period: '2020..2026',
        fitted_on: '2026-10-02',
        fit_source: 'test-suite',
        label_definition: 'binary-impact',
      });

      const generatedAt = new Date(Date.now() - 3600 * 1000).toISOString();
      const rawRows = [];
      for (const d of DISTRICT_REGISTRY) {
        for (const horizon of ['7_days', '15_days']) {
          rawRows.push(Object.fromEntries(ADVISORY_CSV_COLUMNS.map((col) => {
            const map = {
              district: d.district_name,
              division: d.division,
              latitude: String(d.latitude),
              longitude: String(d.longitude),
              horizon,
              hazard: 'Flood',
              confidence: '0.88',
              cnn_severity_raw: '0.76',
              cnn_severity: '0.78',
              physics_severity: '0.75',
              final_severity: '0.77',
              physics_override: 'false',
              advisory_tier: 'WARNING',
              target_date: '2026-10-09',
              generated_at: generatedAt,
              om_max_temp_c: '32.0',
              om_min_temp_c: '24.0',
              om_precip_mm: '45.0',
              om_wind_kmh: '28.0',
              prob_top1: '0.88',
              prob_top2: '0.08',
              prob_top3: '0.04',
            };
            return [col, map[col]];
          })));
        }
      }

      const mapped = mapAdvisoryRows(rawRows, {
        modelVersion: '2.1.9+model.0bb5bdaf1789',
        calibrationMap: fitted,
      });
      expect(mapped[0].confidence_kind).toBe('calibrated_probability');
      expect(mapped[0].confidence_raw).toBe(0.88);
      expect(mapped[0].confidence_calibrated).toBeGreaterThanOrEqual(0.65);

      const csvPath = path.join(tempDir, 'calibrated.csv');
      const snapPath = path.join(tempDir, 'forecasts-latest.json');
      writeFileSync(csvPath, forecastRowsToCsv(mapped), 'utf8');

      execSync(`node scripts/build_forecast_snapshot.mjs "${csvPath}" "${snapPath}"`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      const snapshot = JSON.parse(readFileSync(snapPath, 'utf8'));
      const firstSnapRow = snapshot.horizons['7_days'][0];
      expect(firstSnapRow.confidence_kind).toBe('calibrated_probability');
      expect(firstSnapRow.confidence_raw).toBe(0.88);

      const rehearsal = await rehearseAlertEngine({
        snapshot,
        snapshotPath: snapPath,
        now: new Date(generatedAt),
      });
      expect(rehearsal.counts.WARNING).toBe(128);
      expect(rehearsal.persisted.pending_review).toBe(128);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
