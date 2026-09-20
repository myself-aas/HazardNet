import { fireEvent, render, screen } from '@testing-library/react';
import StoredForecastPanel from '../StoredForecastPanel';
import { VALID_STORED_FORECAST } from '../../lib/__tests__/fixtures/storedForecast';
import { resetLanguageForTests } from '../../lib/i18n';

beforeEach(() => {
  resetLanguageForTests('en');
});

test('renders stored provenance, uncalibrated score and missing-field disclosures', () => {
  render(<StoredForecastPanel forecast={VALID_STORED_FORECAST} />);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Stored forecast: Flood');
  expect(screen.getByText(/As of 20 September 2026/)).toBeInTheDocument();
  expect(screen.getByText(/Uncalibrated top-class score/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Evidence notes/));
  expect(screen.getByText(/No inference was run/)).toBeInTheDocument();
  expect(screen.getByText(/Not recorded for this row/)).toBeInTheDocument();
});

test('idle results do not invent a primary hazard or score', () => {
  render(<StoredForecastPanel forecast={null} />);
  expect(screen.getByRole('status')).toHaveTextContent('Choose a district and horizon');
  expect(screen.queryByText(/Stored forecast: Flood/)).not.toBeInTheDocument();
  expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
});

test('uncovered is distinct from error and idle', () => {
  render(
    <StoredForecastPanel
      state={{ kind: 'uncovered', selection: { districtId: 'bandarban', horizon: '15_days' } }}
    />,
  );
  expect(screen.getByTestId('stored-forecast-uncovered')).toHaveTextContent('No stored coverage');
  expect(screen.getByText(/bandarban/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
});

test('error offers retry and does not fill scores', () => {
  const onRetry = jest.fn();
  render(
    <StoredForecastPanel
      state={{ kind: 'error', selection: { districtId: 'dhaka', horizon: '7_days' }, reason: 'offline' }}
      onRetry={onRetry}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(/offline/i);
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Severity score/)).not.toBeInTheDocument();
});

test('Bengali ready state uses locale dates and does not show English-only unavailable', () => {
  resetLanguageForTests('bn');
  render(<StoredForecastPanel forecast={VALID_STORED_FORECAST} />);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('সংরক্ষিত পূর্বাভাস: Flood');
  expect(screen.getByText(/২০ সেপ্টেম্বর ২০২৬/)).toBeInTheDocument();
});
