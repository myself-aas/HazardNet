import { canonicalKey, type ForecastHorizon, type ForecastRow, severityBin } from './forecasts';
import { isVerifiedForecastFresh } from './profileForecast';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';

export const districtPath = (id: string, horizon: ForecastHorizon = '7_days') => `/forecast/district/${encodeURIComponent(id)}?horizon=${horizon}`;
export const districtFor = (name: string) => ALL_64_DISTRICTS.find(d => canonicalKey(d.id) === canonicalKey(name) || canonicalKey(d.name) === canonicalKey(name));
export const forecastStatus = (row?: ForecastRow) => !row ? 'Unavailable — reference geography only' : row.source_kind === 'snapshot' ? 'Offline reference copy — not current' : isVerifiedForecastFresh(row) ? 'Fresh, run-verified forecast' : 'Stale or unverified — not current';
export const dhakaTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? `${new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })} · Asia/Dhaka (UTC+6)` : 'Timestamp unavailable';
export const riskClass = (severity: number) => severityBin(severity) === 'High' ? 'bg-rose-100 text-rose-900' : severityBin(severity) === 'Moderate' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
export function downloadDraft(text: string, name = 'hazardnet-unsent-draft.txt') {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
