import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProfileForecastCard } from '../ProfileForecastCard';
import { useAuth } from '../../../../context/AuthContext';
import { useForecasts } from '../../../../hooks/useForecasts';
jest.mock('../../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../hooks/useForecasts', () => ({ useForecasts: jest.fn() }));
const row = { district_id: 1, district_name: 'Gazipur', horizon: '7_days', hazard_type: 'Flood',
  severity_score: .5, physics_severity: .6, confidence: .8, prediction_date: '2026-09-14', target_date: '2026-09-21',
  generated_at: new Date().toISOString(), forecast_run_id: 'run1', contract_version: 'hazardnet-si-v1' };
beforeEach(() => {
  (useAuth as jest.Mock).mockReturnValue({ userProfile: { primaryDistrict: 'Gazipur' } });
  (useForecasts as jest.Mock).mockReturnValue({ data: [row], isPending: false });
});
it('shows hazard, severity and freshness for the profile district', () => {
  render(<ProfileForecastCard />);
  expect(screen.getByText('Gazipur · Flood')).toBeTruthy();
  expect(screen.getByText('Model severity: 50 / 100')).toBeTruthy();
  expect(screen.getByText('Fresh, run-verified forecast')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Forecast horizon'), { target: { value: '15_days' } });
  expect(useForecasts).toHaveBeenLastCalledWith('15_days');
});
it('requests a profile location instead of selecting an arbitrary district', () => {
  (useAuth as jest.Mock).mockReturnValue({ userProfile: {} });
  render(<ProfileForecastCard />);
  expect(screen.getByText(/Set your primary district/)).toBeTruthy();
});
it('shows missing district data without substituting another district', () => {
  (useForecasts as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: true });
  render(<ProfileForecastCard />);
  expect(screen.getByText(/No forecast available for Gazipur/)).toBeTruthy();
});
it('labels stale output and legacy fallback explicitly', () => {
  (useForecasts as jest.Mock).mockReturnValue({ data: [{ ...row, generated_at: '2020-01-01' }], isPending: false });
  render(<ProfileForecastCard />);
  expect(screen.getByText(/Stale or unverified/)).toBeTruthy();
});
it('shows loading state', () => {
  (useForecasts as jest.Mock).mockReturnValue({ isPending: true });
  render(<ProfileForecastCard />);
  expect(screen.getByText(/Loading forecast for Gazipur/)).toBeTruthy();
});
