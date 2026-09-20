import { forecastViewStateFromQuery, parseLookupParams } from '../forecastView';
import { StoredPredictionError } from '../storedPrediction';
import { VALID_STORED_FORECAST } from '../fixtures/storedForecast';

const selection = { districtId: 'dhaka', horizon: '7_days' as const };

test('idle when nothing has been requested', () => {
  expect(
    forecastViewStateFromQuery({
      selection: null,
      query: { data: undefined, error: null, isFetching: false, isPending: false },
    }),
  ).toEqual({ kind: 'idle' });
});

test('loading does not reuse another district result', () => {
  expect(
    forecastViewStateFromQuery({
      selection,
      query: { data: undefined, error: null, isFetching: true, isPending: true },
    }),
  ).toEqual({ kind: 'loading', selection });
});

test('ready keeps producer dates and does not invent source identity', () => {
  const state = forecastViewStateFromQuery({
    selection,
    query: { data: VALID_STORED_FORECAST, error: null, isFetching: false, isPending: false },
  });
  expect(state).toMatchObject({
    kind: 'ready',
    data: VALID_STORED_FORECAST,
    refreshing: false,
  });
  if (state.kind === 'ready') {
    expect(state.data.inference.served_from).toBe('stored-forecast');
    expect(state.data.provenance.prediction_date).toBe('2026-09-20');
  }
});

test('404 maps to uncovered, not error', () => {
  expect(
    forecastViewStateFromQuery({
      selection,
      query: {
        data: undefined,
        error: new StoredPredictionError('uncovered', 'missing', 404),
        isFetching: false,
        isPending: false,
      },
    }),
  ).toEqual({ kind: 'uncovered', selection });
});

test('parseLookupParams ignores unknown horizons and unsafe district tokens', () => {
  expect(parseLookupParams(new URLSearchParams('district=dhaka&horizon=7_days'))).toEqual({
    districtId: 'dhaka',
    horizon: '7_days',
  });
  expect(parseLookupParams(new URLSearchParams('district=../etc&horizon=30_days'))).toEqual({
    districtId: null,
    horizon: null,
  });
});
