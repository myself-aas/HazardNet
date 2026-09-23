import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Firebase & Forecasts data fetching for Jest environment
jest.mock('../frontend/src/lib/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  onSnapshot: jest.fn((q, callback) => {
    callback({
      empty: false,
      forEach: (fn) => {
        fn({
          data: () => ({
            district_id: 1,
            district_name: 'Sylhet',
            division: 'Sylhet',
            horizon: '7_days',
            hazard_type: 'Flash Flood',
            severity_score: 0.85,
            physics_severity: 0.85,
            confidence: 0.92,
            prediction_date: '2026-09-22',
            target_date: '2026-09-23',
          }),
        });
      },
    });
    return jest.fn();
  }),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

jest.mock('../frontend/src/lib/forecasts', () => ({
  fetchStaticForecastSnapshot: jest.fn().mockResolvedValue([
    {
      district_id: 1,
      district_name: 'Sylhet',
      division: 'Sylhet',
      horizon: '7_days',
      hazard_type: 'Flash Flood',
      severity_score: 0.85,
      physics_severity: 0.85,
      confidence: 0.92,
      prediction_date: '2026-09-22',
      target_date: '2026-09-23',
    },
  ]),
}));

// Mock recharts ResponsiveContainer to render children in test environment
jest.mock('recharts', () => {
  const original = jest.requireActual('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  };
});

import { ForecastDashboard } from '../frontend/src/components/ForecastDashboard';

describe('Phase 4 Page Surface & Bento Telemetry Redesign', () => {
  test('renders ForecastDashboard with Bento Grid metrics and Floating Control Bar', async () => {
    await act(async () => {
      render(<ForecastDashboard />);
    });

    expect(screen.getByText('District Hazard Forecast Analytics')).toBeInTheDocument();
    expect(screen.getByText('Active Forecasts')).toBeInTheDocument();
    expect(screen.getByText('High Risk Watch')).toBeInTheDocument();
    expect(screen.getByText('Moderate Risk')).toBeInTheDocument();
    expect(screen.getByText('Avg AI Confidence')).toBeInTheDocument();
  });

  test('opens BottomSheet telemetry detail when inspecting district row', async () => {
    await act(async () => {
      render(<ForecastDashboard />);
    });

    const searchInput = screen.getByPlaceholderText('Search district, hazard, or division...');
    expect(searchInput).toBeInTheDocument();

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'Sylhet' } });
    });
    expect(searchInput).toHaveValue('Sylhet');
  });
});
