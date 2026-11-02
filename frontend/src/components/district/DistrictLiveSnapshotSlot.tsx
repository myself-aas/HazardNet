import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDistrictById } from '../../data/bangladeshDistricts';
import { useKaggleAdvisories } from '../../hooks/useKaggleAdvisories';
import { AlertLevelBadge } from '../alerts/AlertLevelBadge';
import { DailyOutlookEntry } from '../DailyOutlookEntry';

/**
 * Live Kaggle advisory, weather values, and model/physics metrics slot injected into
 * `/districts/:id` (`GeneratedContentPage` -> `ArticlePage` `introSlot`).
 */
export const DistrictLiveSnapshotSlot: React.FC<{ districtId: string }> = ({ districtId }) => {
  const district = getDistrictById(districtId);
  const [horizon, setHorizon] = useState<'7_days' | '15_days'>('7_days');
  const { data: snapshot, isLoading: loading } = useKaggleAdvisories(horizon);

  if (!district) return null;

  const targetName = district.name.toLowerCase();
  const row = snapshot?.rows.find((item) => item.district_name.toLowerCase() === targetName) ?? null;
  const severityVal = row ? (row.severity_score ?? row.final_severity) : null;

  return (
    <section
      aria-label={`${district.name} live Kaggle advisory and metrics`}
      className="rounded-xl border border-carbon-20 bg-carbon-05/60 p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-carbon-60">
            Kaggle Forecast &amp; Daily Advisory Run
          </span>
          <h2 className="text-base sm:text-lg font-bold text-carbon-90">
            {district.name}: Tier, Weather &amp; Forecast Metrics
          </h2>
          <p className="text-xs text-carbon-60 mt-0.5">
            Research model output (not an official warning; check BMD, FFWC, and DDM or call 999 in emergencies).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Forecast horizon">
          <button
            type="button"
            onClick={() => setHorizon('7_days')}
            aria-pressed={horizon === '7_days'}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              horizon === '7_days'
                ? 'bg-carbon-90 text-white'
                : 'bg-white text-carbon-70 border border-carbon-20 hover:bg-carbon-10'
            }`}
          >
            7-Day Window
          </button>
          <button
            type="button"
            onClick={() => setHorizon('15_days')}
            aria-pressed={horizon === '15_days'}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              horizon === '15_days'
                ? 'bg-carbon-90 text-white'
                : 'bg-white text-carbon-70 border border-carbon-20 hover:bg-carbon-10'
            }`}
          >
            15-Day Window
          </button>
        </div>
      </div>

      {loading && !row ? (
        <p role="status" className="text-xs text-carbon-60">
          Loading latest forecast snapshot...
        </p>
      ) : row ? (
        <div className="rounded-lg border border-carbon-20 bg-white p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-carbon-60">
                Run: <span className="font-mono">{row.prediction_date || (snapshot?.generatedAt ? snapshot.generatedAt.slice(0, 10) : 'n/a')}</span>
                {' · '}Target: <span className="font-mono">{row.target_date || 'n/a'}</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-carbon-90 mt-0.5">
                {row.hazard_type}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {row.advisory_tier && (
                <AlertLevelBadge level={row.advisory_tier} label={row.advisory_tier} size="md" />
              )}
              {severityVal !== null && Number.isFinite(severityVal) && (
                <div className="text-right">
                  <div className="text-xs text-carbon-60">Severity score</div>
                  <div className="text-sm font-black font-mono tabular-nums text-carbon-90">
                    {Math.round(severityVal * 100)}% ({severityVal.toFixed(2)})
                  </div>
                </div>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-carbon-10 text-xs">
            <div className="rounded bg-carbon-05 px-2.5 py-1.5">
              <dt className="text-carbon-60">Confidence</dt>
              <dd className="font-bold font-mono tabular-nums text-carbon-90">
                {row.confidence !== null && row.confidence !== undefined ? `${Math.round(row.confidence * 100)}%` : 'n/a'}
              </dd>
            </div>
            <div className="rounded bg-carbon-05 px-2.5 py-1.5">
              <dt className="text-carbon-60">Model / Physics</dt>
              <dd className="font-bold font-mono tabular-nums text-carbon-90">
                {row.model_severity !== null && row.model_severity !== undefined ? `${Math.round(row.model_severity * 100)}%` : 'n/a'}
                {' / '}
                {row.physics_severity !== null && row.physics_severity !== undefined ? `${Math.round(row.physics_severity * 100)}%` : 'n/a'}
              </dd>
            </div>
            <div className="rounded bg-carbon-05 px-2.5 py-1.5">
              <dt className="text-carbon-60">Temp (max / min)</dt>
              <dd className="font-bold font-mono tabular-nums text-carbon-90">
                {row.temperature_max !== null && row.temperature_max !== undefined ? `${row.temperature_max.toFixed(1)}°` : 'n/a'}
                {' / '}
                {row.temperature_min !== null && row.temperature_min !== undefined ? `${row.temperature_min.toFixed(1)}°C` : 'n/a'}
              </dd>
            </div>
            <div className="rounded bg-carbon-05 px-2.5 py-1.5">
              <dt className="text-carbon-60">Rain / Wind</dt>
              <dd className="font-bold font-mono tabular-nums text-carbon-90">
                {row.precipitation_mm !== null && row.precipitation_mm !== undefined ? `${row.precipitation_mm.toFixed(1)} mm` : 'n/a'}
                {' · '}
                {row.wind_max_kmh !== null && row.wind_max_kmh !== undefined ? `${row.wind_max_kmh.toFixed(1)} km/h` : 'n/a'}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
            <Link
              to={`/forecast/district/${district.id}`}
              className="font-bold text-ap-link underline underline-offset-4"
            >
              Open 15-day daily timeline
            </Link>
            <Link
              to={`/forecast/district/${district.id}?view=published-records`}
              className="font-bold text-ap-link underline underline-offset-4"
            >
              Open district brief &amp; trend chart
            </Link>
          </div>
        </div>
      ) : null}

      <DailyOutlookEntry districtId={district.id} />
    </section>
  );
};

export default DistrictLiveSnapshotSlot;
