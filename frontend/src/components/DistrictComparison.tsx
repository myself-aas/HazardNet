import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { useHazardContext } from '../hooks/useHazardContext';
import { ForecastSummary } from './ForecastSummary';
export function DistrictComparison() {
  const { params, setParams } = useHazardContext();
  const slots = [params.get('compare1') || '', params.get('compare2') || '', params.get('compare3') || ''];
  return <section className="space-y-4"><h1>Compare districts</h1><p>Choose up to three districts. The period and selections are preserved in this page’s URL; copy it to share. Each card discloses its source and run.</p><div className="grid gap-4 lg:grid-cols-3">{slots.map((id, index) => <div key={index}><label>District {index + 1}<select className="hn-input w-full" value={id} onChange={e => setParams(prev => { const next = new URLSearchParams(prev); next.set(`compare${index + 1}`, e.target.value); return next; })}><option value="">Choose district / remove</option>{ALL_64_DISTRICTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{id && <ForecastSummary district={ALL_64_DISTRICTS.find(d => d.id === id)?.name || id} />}</div>)}</div></section>;
}
