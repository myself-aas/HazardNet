import { Link } from 'react-router-dom';
import { useForecasts } from '../hooks/useForecasts';
import { useHazardContext } from '../hooks/useHazardContext';
import { selectProfileForecast } from '../lib/profileForecast';
import { dhakaTime, forecastStatus, riskClass } from '../lib/hazardUx';
import { severityBin } from '../lib/forecasts';
export function ForecastSummary({ district }: { district: string }) {
  const { horizon, setHorizon } = useHazardContext();
  const query = useForecasts(horizon);
  const row = selectProfileForecast(query.data ?? [], { district });
  return <section className="hn-panel space-y-4" aria-label={`${district} forecast`}>
    <label>Forecast period <select className="hn-input" value={horizon} onChange={e => setHorizon(e.target.value as typeof horizon)}><option value="7_days">7 days</option><option value="15_days">15 days</option></select></label>
    <p role="status">{query.isPending ? 'Loading forecast…' : forecastStatus(row ?? undefined)}</p>
    {row && <>
      <h2>{row.district_name} · {row.hazard_type}</h2>
      <p><span className={`rounded px-3 py-2 ${riskClass(row.severity_score)}`}>{severityBin(row.severity_score)} severity</span> · Model severity {(row.severity_score * 100).toFixed(0)}/100</p>
      <p>Confidence {(row.confidence * 100).toFixed(0)}% — model confidence, not a probability of harm.</p>
      <p>Prediction date: {row.prediction_date} · Target date: {row.target_date} (date-only model horizon, not an incident time)</p>
      <p>Generated: {dhakaTime(row.generated_at)}</p>
      <details><summary>Source and interpretation</summary><p>Run: {row.forecast_run_id || 'Unverified'} · Contract: {row.contract_version || 'Legacy'} · Source: {row.source_kind || 'API'}</p><p>Severity categories: Low below 34, Moderate 34–66, High 67–100. These model indices are not calibrated event probabilities.</p></details>
    </>}
    <button className="hn-button" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh forecast</button>
    <p>Experimental guidance, not an official warning. Check <a className="underline" href="https://bmd.gov.bd/">Bangladesh Meteorological Department</a> warnings before safety decisions.</p>
    <Link className="hn-button inline-block" to={`/advisories/crops?district=${encodeURIComponent(district)}&horizon=${horizon}`}>What to do</Link>
  </section>;
}
