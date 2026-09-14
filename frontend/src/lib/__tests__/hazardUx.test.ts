import { dhakaTime, districtFor, districtPath, forecastStatus, riskClass } from '../hazardUx';
import { severityBin, type ForecastRow } from '../forecasts';
import { getSeverityColor } from '../../services/geolocationService';
const row: ForecastRow = { district_id: 1, district_name: 'Gazipur', horizon: '15_days', hazard_type: 'Flood', severity_score: .72, confidence: .8, prediction_date: '2026-09-15', target_date: '2026-09-30', generated_at: new Date().toISOString(), forecast_run_id: 'r1', contract_version: 'hazardnet-si-v1', source_kind: 'api' };
it('builds the actual district route with period and safely encoded ID', () => {
  expect(districtPath('gazipur', '15_days')).toBe('/forecast/district/gazipur?horizon=15_days');
  expect(districtPath('a/b')).toContain('a%2Fb');
  expect(districtFor('unknown')).toBeUndefined();
  expect(districtFor('Gazipur')?.id).toBe('gazipur');
});
it('does not call a fallback live even if it retains recent verification metadata', () => {
  expect(forecastStatus(row)).toContain('Fresh');
  expect(forecastStatus({ ...row, source_kind: 'snapshot' })).toContain('Offline reference');
  expect(forecastStatus({ ...row, generated_at: '2020-01-01' })).toContain('Stale');
  expect(forecastStatus({ ...row, forecast_run_id: undefined })).toContain('unverified');
  expect(forecastStatus()).toContain('Unavailable');
});
it.each([[.339, 'Low', '#16a34a', 'emerald'], [.34, 'Moderate', '#f59e0b', 'amber'], [.669, 'Moderate', '#f59e0b', 'amber'], [.67, 'High', '#dc2626', 'rose'], [.72, 'High', '#dc2626', 'rose']] as const)('shares boundary semantics for %s', (score, label, color, tone) => {
  expect(severityBin(score)).toBe(label); expect(getSeverityColor(score)).toBe(color); expect(riskClass(score)).toContain(tone);
});
it('uses Bangladesh time across a UTC date boundary without mislabeling London time', () => {
  expect(dhakaTime('2026-09-15T20:00:00Z')).toContain('16/09/2026');
  expect(dhakaTime('2026-09-15T20:00:00Z')).toContain('UTC+6');
  expect(dhakaTime('invalid')).toBe('Timestamp unavailable');
});
