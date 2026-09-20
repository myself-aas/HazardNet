import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import StoredForecastPanel from '../components/StoredForecastPanel';
import { usePrediction } from '../hooks/usePrediction';
import { useI18n } from '../hooks/useI18n';
import {
  forecastViewStateFromQuery,
  isHorizon,
  parseLookupParams,
  type Horizon,
  type Selection,
} from '../lib/forecastView';

const districtIds = new Set(ALL_64_DISTRICTS.map((item) => item.id));

function writeLookupParams(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  districtId: string,
  horizon: Horizon,
) {
  setSearchParams(
    (previous) => {
      const next = new URLSearchParams(previous);
      next.set('district', districtId);
      next.set('horizon', horizon);
      return next;
    },
    { replace: true },
  );
}

export default function UploadPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();
  const fromUrl = parseLookupParams(searchParams);
  const initialDistrict =
    fromUrl.districtId && districtIds.has(fromUrl.districtId) ? fromUrl.districtId : 'dhaka';
  const initialHorizon: Horizon = fromUrl.horizon ?? '7_days';

  const [district, setDistrict] = useState(initialDistrict);
  const [horizon, setHorizon] = useState<Horizon>(initialHorizon);
  const [submitted, setSubmitted] = useState<Selection | null>(
    fromUrl.districtId && districtIds.has(fromUrl.districtId) && fromUrl.horizon
      ? { districtId: fromUrl.districtId, horizon: fromUrl.horizon }
      : null,
  );

  const query = usePrediction(submitted);
  const state = useMemo(
    () => forecastViewStateFromQuery({ selection: submitted, query }),
    [submitted, query],
  );

  const load = (selection: Selection) => {
    setSubmitted(selection);
    writeLookupParams(setSearchParams, selection.districtId, selection.horizon);
  };

  const onDistrictChange = (value: string) => {
    setDistrict(value);
    setSubmitted(null);
    writeLookupParams(setSearchParams, value, horizon);
  };

  const onHorizonChange = (value: string) => {
    const next = isHorizon(value) ? value : '7_days';
    setHorizon(next);
    setSubmitted(null);
    writeLookupParams(setSearchParams, district, next);
  };

  return (
    <section className="w-full max-w-3xl space-y-6" aria-labelledby="lookup-heading">
      <header>
        <h1 id="lookup-heading" className="text-[28px] font-bold tracking-tight text-carbon-90 sm:text-[32px]">
          {t('lookup.title')}
        </h1>
        <p className="mt-4 max-w-prose text-base leading-[1.62] text-carbon-70">{t('lookup.standfirst')}</p>
      </header>
      <form
        className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          load({ districtId: district, horizon });
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-[13px] font-medium text-carbon-90" htmlFor="lookup-district">
          {t('lookup.district')}
          <select
            id="lookup-district"
            name="district"
            value={district}
            onChange={(event) => onDistrictChange(event.target.value)}
            className="h-12 min-h-12 w-full rounded-control border border-carbon-20 bg-white px-4 text-base text-carbon-90 focus-visible:outline focus-visible:outline-offset-2"
          >
            {ALL_64_DISTRICTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-[13px] font-medium text-carbon-90" htmlFor="lookup-horizon">
          {t('lookup.horizon')}
          <select
            id="lookup-horizon"
            name="horizon"
            value={horizon}
            onChange={(event) => onHorizonChange(event.target.value)}
            className="h-12 min-h-12 w-full min-w-[200px] rounded-control border border-carbon-20 bg-white px-4 text-base text-carbon-90 focus-visible:outline focus-visible:outline-offset-2"
          >
            <option value="7_days">{t('lookup.horizon.7_days')}</option>
            <option value="15_days">{t('lookup.horizon.15_days')}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={state.kind === 'loading'}
          className="inline-flex min-h-11 items-center justify-center bg-nasa-blue px-6 py-3 text-base font-semibold text-white hover:bg-nasa-blue-shade disabled:opacity-50"
        >
          {state.kind === 'loading' ? t('lookup.submitting') : t('lookup.submit')}
        </button>
      </form>
      <div aria-live="polite" aria-atomic="true">
        <StoredForecastPanel
          state={state}
          onRetry={submitted ? () => load(submitted) : undefined}
        />
      </div>
    </section>
  );
}
