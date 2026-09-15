import { loadForecasts } from '../useForecasts';
import { fetchStaticForecastSnapshot } from '../../lib/forecasts';
jest.mock('../../lib/forecasts', () => ({ ...jest.requireActual('../../lib/forecasts'), fetchStaticForecastSnapshot: jest.fn() }));
const row = { district_id: 1, district_name: 'Gazipur', horizon: '7_days', hazard_type: 'Flood', severity_score: .72, confidence: .8, prediction_date: '2026-09-15', target_date: '2026-09-22', generated_at: new Date().toISOString(), forecast_run_id: 'r1', contract_version: 'hazardnet-si-v1' };
beforeEach(() => { global.fetch = jest.fn(); (fetchStaticForecastSnapshot as jest.Mock).mockReset(); });
it('marks snapshot fallback even when rows have run metadata', async () => {
  (fetch as jest.Mock).mockRejectedValue(new Error('offline'));
  (fetchStaticForecastSnapshot as jest.Mock).mockResolvedValue([row]);
  expect((await loadForecasts('7_days'))[0].source_kind).toBe('snapshot');
});
it('rejects mixed-run API publications instead of presenting a coherent live dataset', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ forecasts: [row, { ...row, district_name: 'Dhaka', district_id: 2, forecast_run_id: 'r2' }] }) });
  (fetchStaticForecastSnapshot as jest.Mock).mockResolvedValue([row]);
  expect((await loadForecasts('7_days'))[0].source_kind).toBe('snapshot');
});
it('marks coherent API results without falling back', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ forecasts: [row] }) });
  expect((await loadForecasts('7_days'))[0].source_kind).toBe('api');
  expect(fetchStaticForecastSnapshot).not.toHaveBeenCalled();
});
it('throws when neither source has usable rows', async () => {
  (fetch as jest.Mock).mockRejectedValue(new Error('offline'));
  (fetchStaticForecastSnapshot as jest.Mock).mockResolvedValue([]);
  await expect(loadForecasts('7_days')).rejects.toThrow('unavailable');
});
