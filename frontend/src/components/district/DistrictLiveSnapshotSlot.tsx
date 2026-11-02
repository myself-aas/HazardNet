import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getDistrictById } from '../../data/bangladeshDistricts';
import { useI18n } from '../../hooks/useI18n';
import { useKaggleAdvisories } from '../../hooks/useKaggleAdvisories';
import { AlertLevelBadge } from '../alerts/AlertLevelBadge';
import { HazardGlyph } from '../apple/HazardGlyph';

/**
 * Editorial-track live forecast ledger injected into `/districts/:id` (`ArticlePage` `introSlot`).
 * Uses a single recessed ground surface with 1px hairline divisions — no nested cards,
 * no ALL-CAPS kickers, and 44px minimum touch targets throughout.
 */
export const DistrictLiveSnapshotSlot: React.FC<{ districtId: string }> = ({ districtId }) => {
  const district = getDistrictById(districtId);
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatDate, formatNumber } = useI18n();
  const horizon: '7_days' | '15_days' = searchParams.get('horizon') === '15_days' ? '15_days' : '7_days';
  const setHorizon = (nextHorizon: '7_days' | '15_days') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextHorizon === '7_days') next.delete('horizon');
      else next.set('horizon', nextHorizon);
      return next;
    }, { replace: true });
  };
  const { data: snapshot, isLoading: loading } = useKaggleAdvisories(horizon);

  if (!district) return null;

  const targetName = district.name.toLowerCase();
  const row = snapshot?.rows.find((item) => item.district_name.toLowerCase() === targetName) ?? null;
  const severityVal = row ? (row.severity_score ?? row.final_severity) : null;
  const runDateRaw = row?.prediction_date || (snapshot?.generatedAt ? snapshot.generatedAt.slice(0, 10) : null);
  const fmt1 = (val: number) => formatNumber(val, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = (val: number) => formatNumber(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section
      aria-label={`${district.name} live Kaggle advisory and metrics`}
      className="rounded-xl border border-[var(--ap-separator-opaque)] bg-[var(--ap-bg-grouped)] p-5 sm:p-6 space-y-4 text-[var(--ap-label)]"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 max-w-[54ch]">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--ap-label)]">
            Current model outlook for {district.name}
          </h2>
          <p className="text-xs leading-relaxed text-[var(--ap-label-secondary)]">
            Research model run, not an official warning service. Check BMD, FFWC, and DDM for official warnings; call 999 in an emergency.
          </p>
        </div>

        <div
          className="inline-flex shrink-0 self-start rounded-full border border-[var(--ap-separator-opaque)] bg-[var(--ap-canvas)] p-1"
          role="group"
          aria-label="Forecast horizon"
        >
          <button
            type="button"
            onClick={() => setHorizon('7_days')}
            aria-pressed={horizon === '7_days'}
            className={`ap-focusable min-h-[44px] px-4 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              horizon === '7_days'
                ? 'bg-[var(--ap-bg-grouped)] text-[var(--ap-label)] border border-[var(--ap-separator-opaque)]'
                : 'text-[var(--ap-label-secondary)] hover:text-[var(--ap-label)]'
            }`}
          >
            7-day window
          </button>
          <button
            type="button"
            onClick={() => setHorizon('15_days')}
            aria-pressed={horizon === '15_days'}
            className={`ap-focusable min-h-[44px] px-4 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              horizon === '15_days'
                ? 'bg-[var(--ap-bg-grouped)] text-[var(--ap-label)] border border-[var(--ap-separator-opaque)]'
                : 'text-[var(--ap-label-secondary)] hover:text-[var(--ap-label)]'
            }`}
          >
            15-day window
          </button>
        </div>
      </div>

      {loading && !row ? (
        <p role="status" className="border-t border-[var(--ap-separator-opaque)] pt-4 text-sm text-[var(--ap-label-secondary)]">
          Loading latest forecast run for {district.name}…
        </p>
      ) : row ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--ap-separator-opaque)] pt-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-base sm:text-lg font-semibold text-[var(--ap-label)]">
                <HazardGlyph hazard={row.hazard_type} size={20} />
                <span>{row.hazard_type}</span>
              </div>
              <p className="text-xs tabular-nums text-[var(--ap-label-secondary)]">
                Issued {runDateRaw ? <time dateTime={runDateRaw}>{formatDate(runDateRaw)}</time> : 'n/a'}, peak target{' '}
                {row.target_date ? <time dateTime={row.target_date}>{formatDate(row.target_date)}</time> : 'n/a'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {row.advisory_tier && (
                <AlertLevelBadge level={row.advisory_tier} label={row.advisory_tier} size="md" />
              )}
              {severityVal !== null && Number.isFinite(severityVal) && (
                <div className="text-right tabular-nums">
                  <div className="text-xs text-[var(--ap-label-secondary)]">Severity score</div>
                  <div className="text-sm sm:text-base font-bold text-[var(--ap-label)]">
                    {formatNumber(Math.round(severityVal * 100))}% ({fmt2(severityVal)})
                  </div>
                </div>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 border-t border-[var(--ap-separator-opaque)] pt-4 text-xs">
            <div>
              <dt className="text-[var(--ap-label-secondary)]">Model confidence</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ap-label)]">
                {row.confidence !== null && row.confidence !== undefined ? `${formatNumber(Math.round(row.confidence * 100))}%` : 'n/a'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ap-label-secondary)]">Model / physics track</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ap-label)]">
                {row.model_severity !== null && row.model_severity !== undefined ? `${formatNumber(Math.round(row.model_severity * 100))}%` : 'n/a'}
                {' / '}
                {row.physics_severity !== null && row.physics_severity !== undefined ? `${formatNumber(Math.round(row.physics_severity * 100))}%` : 'n/a'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ap-label-secondary)]">Temperature range</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ap-label)]">
                {row.temperature_min !== null && row.temperature_min !== undefined && row.temperature_max !== null && row.temperature_max !== undefined
                  ? `${fmt1(row.temperature_min)} to ${fmt1(row.temperature_max)}\u00A0°C`
                  : row.temperature_max !== null && row.temperature_max !== undefined
                    ? `${fmt1(row.temperature_max)}\u00A0°C`
                    : 'n/a'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ap-label-secondary)]">Rain and max wind</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ap-label)]">
                {row.precipitation_mm !== null && row.precipitation_mm !== undefined ? `${fmt1(row.precipitation_mm)}\u00A0mm` : 'n/a'}
                {', '}
                {row.wind_max_kmh !== null && row.wind_max_kmh !== undefined ? `${fmt1(row.wind_max_kmh)}\u00A0km/h` : 'n/a'}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="border-t border-[var(--ap-separator-opaque)] pt-4 text-sm text-[var(--ap-label-secondary)]">
          No forecast row is published for {district.name} in this horizon window. Unknown does not mean safe.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--ap-separator-opaque)] pt-2 text-sm">
        <Link
          to={`/forecast/district/${district.id}`}
          className="ap-focusable inline-flex min-h-[44px] items-center font-semibold text-[var(--ap-link)] underline underline-offset-4"
        >
          Open 15-day daily outlook: {district.name}
        </Link>
        <Link
          to={`/forecast/district/${district.id}?view=published-records`}
          className="ap-focusable inline-flex min-h-[44px] items-center font-medium text-[var(--ap-link)] underline underline-offset-4"
        >
          View published two-horizon records
        </Link>
      </div>
    </section>
  );
};

export default DistrictLiveSnapshotSlot;
