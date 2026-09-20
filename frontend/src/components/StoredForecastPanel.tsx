import type { StoredPrediction } from '../lib/storedPrediction';

export default function StoredForecastPanel({ forecast }: { forecast: StoredPrediction | null }) {
  if (!forecast)
    return (
      <section className="border border-carbon-20 bg-white p-6" role="status">
        <h2 className="text-xl font-bold">Stored forecast unavailable</h2>
        <p>No model result is available here. Any district baseline shown elsewhere is not a new prediction.</p>
      </section>
    );
  const { prediction, provenance, inference } = forecast;
  return (
    <section className="border border-carbon-20 bg-white p-6 space-y-3">
      <h2 className="text-xl font-bold">Stored forecast: {prediction.hazard}</h2>
      <p>
        {provenance.district_name ?? 'District not recorded'} · As of{' '}
        {provenance.prediction_date ?? 'date not recorded'}
      </p>
      <p>
        Target: {provenance.target_date ?? 'not recorded'} · Horizon:{' '}
        {provenance.horizon?.replace('_', ' ') ?? 'not recorded'}
      </p>
      <dl>
        <dt>Severity score</dt>
        <dd>{prediction.severity_score.toFixed(3)}</dd>
        <dt>
          {prediction.confidence_kind === 'calibrated_probability'
            ? 'Calibrated probability'
            : 'Uncalibrated top-class score (not an event probability)'}
        </dt>
        <dd>{prediction.confidence.toFixed(3)}</dd>
        <dt>Model version</dt>
        <dd>{inference.model_version ?? 'Not recorded for this row'}</dd>
      </dl>
      <p>
        No inference was run for this request. Per-class probabilities, top-three classes and satellite drivers are not
        recorded for this row.
      </p>
      <p>Decision support only. Follow official BMD, FFWC and DDM instructions.</p>
    </section>
  );
}
