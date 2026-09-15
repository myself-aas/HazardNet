import { useSearchParams } from 'react-router-dom';
import { isForecastHorizon, type ForecastHorizon } from '../lib/forecasts';
export function useHazardContext() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('horizon');
  const horizon: ForecastHorizon = isForecastHorizon(raw) ? raw : '7_days';
  const setHorizon = (value: ForecastHorizon) => setParams(prev => { const next = new URLSearchParams(prev); next.set('horizon', value); return next; });
  return { horizon, setHorizon, district: params.get('district') ?? '', params, setParams };
}
