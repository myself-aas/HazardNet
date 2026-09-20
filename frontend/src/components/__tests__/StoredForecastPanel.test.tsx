import { render, screen } from '@testing-library/react';
import StoredForecastPanel from '../StoredForecastPanel';
import type { StoredPrediction } from '../../lib/storedPrediction';

const forecast: StoredPrediction = {
  prediction: { hazard: 'Flood', severity_score: 0.7, confidence: 0.9, confidence_kind: 'model_softmax_top_class' },
  provenance: { district_name: 'Dhaka', prediction_date: '2026-09-20', target_date: '2026-09-27', horizon: '7_days' },
  inference: { served_from: 'stored-forecast', model_version: null, latency_ms: null },
};
test('renders stored provenance, uncalibrated score and missing-field disclosures', () => {
  render(<StoredForecastPanel forecast={forecast} />);
  expect(screen.getByRole('heading')).toHaveTextContent('Stored forecast: Flood');
  expect(screen.getByText(/As of 2026-09-20/)).toBeInTheDocument();
  expect(screen.getByText(/Uncalibrated top-class score/)).toBeInTheDocument();
  expect(screen.getByText(/No inference was run/)).toBeInTheDocument();
  expect(screen.getByText(/Not recorded for this row/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
test('unavailable results do not invent a primary hazard or score', () => {
  render(<StoredForecastPanel forecast={null} />);
  expect(screen.getByRole('status')).toHaveTextContent('Stored forecast unavailable');
  expect(screen.queryByText(/Stored forecast: Flood/)).not.toBeInTheDocument();
});
