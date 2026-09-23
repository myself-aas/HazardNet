import type { ForecastFetchReason, StoredPrediction } from '../lib/storedPrediction';
import {
  forecastViewStateFromLegacy,
  type ForecastViewState,
  type Horizon,
  type Selection,
} from '../lib/forecastView';
import { useI18n } from '../hooks/useI18n';

export interface StoredForecastPanelProps {
  state?: ForecastViewState;
  forecast?: StoredPrediction | null;
  loading?: boolean;
  requested?: boolean;
  selection?: Selection | null;
  onRetry?: () => void;
}

const horizonKey = (horizon: string | null | undefined): '7_days' | '15_days' | null =>
  horizon === '7_days' || horizon === '15_days' ? horizon : null;

function ErrorCopy({
  reason,
  t,
}: {
  reason: ForecastFetchReason;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (reason === 'offline') {
    return (
      <>
        <h2 className="text-[22px] font-bold tracking-tight text-carbon-90">{t('lookup.error.offline.title')}</h2>
        <p className="mt-3 text-base leading-[1.62] text-carbon-70">{t('lookup.error.offline.body')}</p>
      </>
    );
  }
  if (reason === 'rate-limited') {
    return (
      <>
        <h2 className="text-[22px] font-bold tracking-tight text-carbon-90">{t('lookup.error.rateLimited.title')}</h2>
        <p className="mt-3 text-base leading-[1.62] text-carbon-70">{t('lookup.error.rateLimited.body')}</p>
      </>
    );
  }
  if (reason === 'invalid-data') {
    return (
      <>
        <h2 className="text-[22px] font-bold tracking-tight text-carbon-90">{t('lookup.error.invalid.title')}</h2>
        <p className="mt-3 text-base leading-[1.62] text-carbon-70">{t('lookup.error.invalid.body')}</p>
      </>
    );
  }
  return (
    <>
      <h2 className="text-[22px] font-bold tracking-tight text-carbon-90">{t('lookup.error.server.title')}</h2>
      <p className="mt-3 text-base leading-[1.62] text-carbon-70">{t('lookup.error.server.body')}</p>
    </>
  );
}

function HorizonLabel({
  horizon,
  t,
}: {
  horizon: string | null | undefined;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const key = horizonKey(horizon);
  if (key) return <>{t(`lookup.horizon.${key}`)}</>;
  return <>{t('lookup.horizon.unknown')}</>;
}

function ReadyForecast({
  data,
  t,
  formatDate,
  formatNumber,
}: {
  data: StoredPrediction;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (value: string | null | undefined) => string;
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
}) {
  const { prediction, provenance, inference } = data;
  const issued = provenance.prediction_date ? formatDate(provenance.prediction_date) : t('lookup.freshness.unknown');
  const target = provenance.target_date ? formatDate(provenance.target_date) : t('lookup.target.unknown');
  const calibrated = prediction.confidence_kind === 'calibrated_probability';
  const scoreOptions: Intl.NumberFormatOptions = { minimumFractionDigits: 3, maximumFractionDigits: 3 };

  return (
    <section className="border border-carbon-20 bg-white p-6" data-testid="stored-forecast-ready">
      <p className="text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">{t('lookup.source.stored')}</p>
      <h2 className="mt-2 text-[22px] font-bold tracking-tight text-carbon-90">
        {t('lookup.ready.title', { hazard: prediction.hazard })}
      </h2>
      <p className="mt-3 text-base leading-[1.62] text-carbon-70">
        {provenance.district_name ?? t('lookup.districtUnknown')}
        {' · '}
        {t('lookup.freshness.label')} {issued}
      </p>
      <p className="mt-1 text-base leading-[1.62] text-carbon-70">
        {t('lookup.target')}: {target}
        {' · '}
        {t('lookup.horizonLabel')}: <HorizonLabel horizon={provenance.horizon} t={t} />
      </p>
      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">{t('lookup.severity')}</dt>
          <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-carbon-90">
            {formatNumber(prediction.severity_score, scoreOptions)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">
            {calibrated ? t('lookup.confidence.calibrated') : t('lookup.confidence.uncalibrated')}
          </dt>
          <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-carbon-90">
            {formatNumber(prediction.confidence, scoreOptions)}
          </dd>
        </div>
      </dl>
      <details className="mt-6 border-t border-carbon-10 pt-4">
        <summary className="min-h-11 cursor-pointer text-base font-semibold text-carbon-90">
          {t('lookup.evidence.summary')}
        </summary>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">{t('lookup.modelVersion')}</dt>
            <dd className="mt-1 font-mono text-base text-carbon-90">
              {inference.model_version ?? t('lookup.modelVersion.missing')}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-base leading-[1.62] text-carbon-70">{t('lookup.evidence.missingDrivers')}</p>
      </details>
      <p className="mt-6 border-t border-carbon-10 pt-4 text-base leading-[1.62] text-carbon-70">{t('lookup.disclaimer')}</p>
    </section>
  );
}

export default function StoredForecastPanel({
  state,
  forecast,
  loading,
  requested,
  selection,
  onRetry,
}: StoredForecastPanelProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const view = state ?? forecastViewStateFromLegacy({ forecast, loading, requested, selection });

  if (view.kind === 'idle') {
    return (
      <section className="border border-carbon-20 bg-white p-6" role="status" data-testid="stored-forecast-idle">
        <h2 className="text-[22px] font-bold tracking-tight text-carbon-90">{t('lookup.idle.title')}</h2>
        <p className="mt-3 text-base leading-[1.62] text-carbon-70">{t('lookup.idle.body')}</p>
      </section>
    );
  }

  if (view.kind === 'loading') {
    return (
      <section className="border border-carbon-20 bg-white p-6" role="status" aria-live="polite" data-testid="stored-forecast-loading">
        <p className="text-base text-carbon-70">{t('lookup.loading')}</p>
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-8 w-2/3 bg-carbon-10" />
          <div className="h-4 w-full bg-carbon-10" />
          <div className="h-4 w-5/6 bg-carbon-10" />
        </div>
      </section>
    );
  }

  if (view.kind === 'uncovered') {
    const horizon = view.selection.horizon as Horizon;
    return (
      <section className="border border-carbon-20 bg-white p-6" role="status" data-testid="stored-forecast-uncovered">
        <h2 className="text-[22px] font-bold tracking-tight text-carbon-90">{t('lookup.uncovered.title')}</h2>
        <p className="mt-3 text-base leading-[1.62] text-carbon-70">
          {t('lookup.uncovered.body', {
            district: view.selection.districtId,
            horizon: t(`lookup.horizon.${horizon}`),
          })}
        </p>
      </section>
    );
  }

  if (view.kind === 'error') {
    return (
      <section className="border border-carbon-20 bg-white p-6" role="alert" data-testid="stored-forecast-error">
        <ErrorCopy reason={view.reason} t={t} />
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex min-h-11 items-center justify-center bg-nasa-blue px-6 py-3 text-base font-semibold text-white hover:bg-nasa-blue-shade focus-visible:outline focus-visible:outline-offset-2"
          >
            {t('common.retry')}
          </button>
        )}
      </section>
    );
  }

  return <ReadyForecast data={view.data} t={t} formatDate={formatDate} formatNumber={formatNumber} />;
}
