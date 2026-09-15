import { canonicalKey, type ForecastRow } from './forecasts';

export function selectProfileForecast(rows: ForecastRow[], profile: { primaryDistrict?: string; district?: string } | null) {
  const district = profile?.primaryDistrict?.trim() || profile?.district?.trim();
  if (!district) return null;
  return rows.find((row) => canonicalKey(row.district_name) === canonicalKey(district)) ?? null;
}

export function isVerifiedForecastFresh(row: ForecastRow, now = Date.now()) {
  const generated = Date.parse(row.generated_at ?? '');
  return Boolean(row.forecast_run_id) && row.contract_version === 'hazardnet-si-v1'
    && Number.isFinite(generated) && generated <= now + 300000 && now - generated <= 6 * 3600000;
}
