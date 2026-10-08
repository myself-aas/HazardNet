import React from 'react';
import { Activity, Crosshair, Layers, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { advisorySignalOf, advisoryTierOf, type ForecastRow } from '../../lib/forecasts';

/**
 * Advisory signal — the fields the daily advisory CSV publishes that the district table
 * used to throw away.
 *
 * The pipeline emits four severities (raw model output, calibrated model score, physics
 * prior, and the blended `final_severity` the tier is cut from), a top-3 hazard
 * distribution, a physics-override flag and the row's provenance. Until 2026-10-02
 * `parseForecastRow` dropped all of them, so the UI re-derived a tier from
 * `severity_score` and showed one number where the pipeline publishes four.
 *
 * Everything here is optional at runtime: rows that predate the advisory columns render
 * the tracks they have, and a row with no tier at all says so rather than inventing one.
 */

interface AdvisorySignalCardProps {
  /** Rows for a single district and a single horizon (7-day or 15-day). */
  rows: ForecastRow[];
  /** `7_days` / `15_days` — used for the heading only. */
  horizon: string;
  districtName?: string;
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const TIER_STYLES: Record<string, string> = {
  SEVERE: 'bg-red-100 text-red-800 border-red-300',
  WARNING: 'bg-amber-100 text-amber-800 border-amber-300',
  WATCH: 'bg-sky-100 text-sky-800 border-sky-300',
  NORMAL: 'bg-carbon-10 text-carbon-80 border-carbon-20',
};

export const AdvisorySignalCard: React.FC<AdvisorySignalCardProps> = ({ rows, horizon, districtName }) => {
  const { t, formatNumber } = useI18n();

  if (!rows || rows.length === 0) return null;

  // The most recent target date wins: the card describes the advisory that is current.
  const row = rows.reduce(
    (latest, candidate) => (candidate.target_date > latest.target_date ? candidate : latest),
    rows[0],
  );

  const tier = advisoryTierOf(row);
  const signal = advisorySignalOf(row);
  const published = typeof row.advisory_tier === 'string' && row.advisory_tier.length > 0;

  const tracks = [
    { key: 'advisory.track.modelRaw', value: signal.raw, tone: 'bg-ap-primary/30' },
    { key: 'advisory.track.modelCalibrated', value: signal.calibrated, tone: 'bg-ap-primary' },
    { key: 'advisory.track.physics', value: signal.physics, tone: 'bg-amber-500' },
    { key: 'advisory.track.final', value: signal.final, tone: 'bg-carbon-90' },
  ].filter((track) => track.value !== null);

  return (
    <section
      aria-label="Advisory signal"
      data-testid="advisory-signal-card"
      className="rounded-xl bg-carbon-05 border border-carbon-20/80 p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            <span>{t('advisory.signal.title')}</span>
            <span aria-hidden="true">•</span>
            <span>{horizon === '15_days' ? '15-Day' : '7-Day'} horizon</span>
          </div>
          <p className="mt-1 text-sm text-carbon-60">
            {districtName ? `${districtName}: ` : ''}
            {t('advisory.signal.hint')}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            data-testid="advisory-tier"
            className={`inline-flex items-center px-2.5 py-1 border text-sm font-black tracking-wide ${
              TIER_STYLES[tier ?? 'NORMAL'] ?? TIER_STYLES.NORMAL
            }`}
          >
            {t(`alerts.tier.${tier ?? 'NORMAL'}`)}
          </span>
          <span className="text-xs font-mono uppercase tracking-wider text-carbon-60">
            {published ? t('advisory.tier.published') : t('advisory.tier.derived')}
          </span>
        </div>
      </div>

      {/* Severity tracks — the four numbers the pipeline actually publishes. */}
      <div className="space-y-2">
        {tracks.map((track) => (
          <div key={track.key} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs font-mono uppercase tracking-wider text-carbon-70">
              {t(track.key)}
            </span>
            <div className="flex-1 h-2.5 bg-carbon-10 overflow-hidden">
              <div className={`h-full ${track.tone}`} style={{ width: `${Math.round((track.value ?? 0) * 100)}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-mono font-bold text-carbon-90">
              {pct(track.value ?? 0)}
            </span>
          </div>
        ))}
        {tracks.length === 0 && <p className="text-xs text-carbon-60">{t('advisory.noSignal')}</p>}
      </div>

      {signal.override && (
        <div className="rounded-full inline-flex items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{t('advisory.physicsOverride')}</span>
        </div>
      )}

      {/* Top-3 distribution — the model's ranked hazard probabilities. */}
      {signal.probabilities.length > 0 && (
        <div className="border-t border-carbon-20 pt-3 space-y-2">
          <div className="text-xs font-mono font-bold text-carbon-70 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>{t('advisory.distribution')}</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {signal.probabilities.map((probability) => (
              <span key={probability.label} className="text-xs font-mono text-carbon-80">
                {probability.label.replace('Top-', `${t('advisory.rank')} `)}
                {' · '}
                <strong className="text-carbon-90">
                  {formatNumber(probability.value, { style: 'percent', maximumFractionDigits: 1 })}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provenance — which pipeline run produced this row, and where. */}
      {(row.data_source || row.model_version || (row.latitude !== undefined && row.longitude !== undefined)) && (
        <div className="border-t border-carbon-20 pt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-carbon-60">
          {row.data_source && (
            <span>
              {t('advisory.source')}: {row.data_source}
            </span>
          )}
          {row.model_version && (
            <span>
              {t('advisory.modelVersion')}: {row.model_version}
            </span>
          )}
          {row.latitude !== undefined && row.longitude !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Crosshair className="w-3 h-3" aria-hidden="true" />
              {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </section>
  );
};

export default AdvisorySignalCard;
