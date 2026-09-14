import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useForecasts } from '../../../hooks/useForecasts';
import type { ForecastHorizon } from '../../../lib/forecasts';
import { isVerifiedForecastFresh, selectProfileForecast } from '../../../lib/profileForecast';
import { Card } from './ui';

export function ProfileForecastCard() {
  const { userProfile } = useAuth();
  const [horizon, setHorizon] = useState<ForecastHorizon>('7_days');
  const forecasts = useForecasts(horizon);
  const district = userProfile?.primaryDistrict?.trim() || userProfile?.district?.trim();
  const row = selectProfileForecast(forecasts.data ?? [], userProfile);
  const fresh = row ? isVerifiedForecastFresh(row) : false;
  return <Card title="Your district forecast" subtitle="Selected from your profile location; refreshed every three hours.">
    <label className="mb-3 block text-sm">Forecast horizon{' '}
      <select aria-label="Forecast horizon" value={horizon} onChange={(e) => setHorizon(e.target.value as ForecastHorizon)} className="rounded border p-2">
        <option value="7_days">7 days</option><option value="15_days">15 days</option>
      </select>
    </label>
    {!district ? <p>Set your primary district in Edit Profile to see your forecast.</p>
      : forecasts.isPending ? <p role="status">Loading forecast for {district}…</p>
        : !row ? <p role="status">No forecast available for {district}. Try again later.</p>
          : <div className="space-y-2 text-sm">
            <p className="font-bold">{row.district_name} · {row.hazard_type}</p>
            <p>Model severity: {(row.severity_score * 100).toFixed(0)} / 100</p>
            {row.physics_severity !== undefined && <p>Physics severity: {(row.physics_severity * 100).toFixed(0)} / 100</p>}
            <p>Model confidence: {(row.confidence * 100).toFixed(0)}% — not a probability of harm.</p>
            <p>Prediction: {row.prediction_date} · Target: {row.target_date}</p>
            {row.generated_at && <p>Generated: {new Date(row.generated_at).toLocaleString()}</p>}
            <p role="status" className={fresh ? 'text-emerald-700' : 'text-amber-800'}>
              {fresh ? 'Fresh, run-verified forecast' : 'Stale or unverified fallback — not a current forecast.'}
            </p>
            <p className="text-xs text-slate-500">Experimental model guidance. Check official warnings before making safety decisions.</p>
          </div>}
  </Card>;
}
