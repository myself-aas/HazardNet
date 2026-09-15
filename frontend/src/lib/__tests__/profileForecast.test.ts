import { isVerifiedForecastFresh, selectProfileForecast } from '../profileForecast';
import { parseForecastRow, type ForecastRow } from '../forecasts';
const row: ForecastRow = { district_id: 1, district_name: 'Chittagong', horizon: '7_days',
  hazard_type: 'Flood', severity_score: .5, confidence: .8, target_date: '2026-09-21', prediction_date: '2026-09-14' };
it('matches aliases, not notebook ordinal IDs; prefers primary district', () => {
  expect(selectProfileForecast([row], { primaryDistrict: 'Chattogram', district: 'Dhaka' })).toBe(row);
  expect(selectProfileForecast([row], { district: 'Chattogram' })).toBe(row);
  expect(selectProfileForecast([row], { primaryDistrict: 'Dhaka' })).toBeNull();
  expect(selectProfileForecast([row], null)).toBeNull();
});
it('never claims legacy or stale rows are fresh verified output', () => {
  const now = Date.parse('2026-09-14T09:00:00Z');
  expect(isVerifiedForecastFresh(row, now)).toBe(false);
  const verified = { ...row, generated_at: '2026-09-14T08:00:00Z', forecast_run_id: 'run1', contract_version: 'hazardnet-si-v1' };
  expect(isVerifiedForecastFresh(verified, now)).toBe(true);
  expect(isVerifiedForecastFresh(verified, now + 6 * 3600000)).toBe(false);
  expect(isVerifiedForecastFresh(verified, now - 2 * 3600000)).toBe(false);
  expect(parseForecastRow(verified)?.forecast_run_id).toBe('run1');
});
