import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ForecastSummary } from '../components/ForecastSummary';
import { PrintQrCode } from '../components/PrintQrCode';
import { useHazardContext } from '../hooks/useHazardContext';
import { useSavedDistricts } from '../hooks/useSavedDistricts';
import { districtFor, districtPath, downloadDraft } from '../lib/hazardUx';
export function DistrictDetailPage() {
  const { id = '' } = useParams();
  const district = districtFor(id);
  const { horizon } = useHazardContext();
  const { savedDistricts, toggleSaveDistrict } = useSavedDistricts();
  const [message, setMessage] = useState('');
  if (!district) return <section className="hn-panel"><h1>District not found</h1><Link to="/">Choose a district on the map</Link></section>;
  const url = new URL(districtPath(district.id, horizon), window.location.origin).href;
  const saved = savedDistricts.some(d => d.id === district.id);
  const draft = `UNSENT DRAFT — no notifications have been sent.\nDistrict: ${district.name}\nForecast period: ${horizon}\nReview current forecast and official warnings: ${url}\nObserved impacts: Unknown / not assessed\nPrepared by: [Your name]\nThis is not a government directive.`;
  return <article className="space-y-6">
    <nav aria-label="District navigation"><Link to={`/?district=${district.id}&horizon=${horizon}`}>← Map</Link> · <Link to="/forecast/my-districts">My Districts</Link></nav>
    <h1>{district.name} district forecast</h1>
    <ForecastSummary district={district.name} />
    <section className="hn-panel space-y-3"><h2>Save and share</h2><p>Saved districts are stored on this device, not your account. They remain here after sign-out.</p>
      <button className="hn-button" aria-pressed={saved} onClick={() => toggleSaveDistrict(district)}>{saved ? 'Remove saved district' : 'Save district'}</button>{' '}
      <button className="hn-button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage('Link copied.'); } catch { setMessage('Could not copy. Select and copy the link below.'); } }}>Copy report link</button>{' '}
      <button className="hn-button" onClick={() => window.print()}>Print forecast</button>
      <p role="status">{message}</p><label className="block">Report link<input className="hn-input w-full" readOnly value={url} onFocus={e => e.target.select()} /></label>
      <PrintQrCode url={url} title="District forecast" subtitle="Check source and freshness" districtOrSector={district.name} size={96} />
    </section>
    <section className="hn-panel space-y-3"><h2>Prepare an assistance request</h2><p role="note">Emergency dispatch is unavailable. HazardNet does not send SMS, radio bulletins or shelter commands. No recipients have been notified.</p>
      <p>Observed population impacts, operational shelter capacity, relief stock and live telemetry are unavailable; this report does not estimate them.</p>
      <textarea className="hn-input w-full" aria-label="Unsent assistance draft" rows={7} readOnly value={draft} />
      <button className="hn-button" onClick={() => downloadDraft(draft)}>Download unsent draft</button>
      <Link className="hn-button inline-block" to={`/advisories/crops?district=${district.id}&horizon=${horizon}`}>Review guidance and prepare email</Link>
    </section>
  </article>;
}
