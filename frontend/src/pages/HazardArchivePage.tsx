/**
 * `/archive` — the historical hazard archive, read from one committed artifact.
 *
 * Every figure on this page comes from `/data/hazard-archive.json`
 * (`scripts/build_hazard_archive.mjs`), which is derived from the **validated** ETL
 * export. Nothing is estimated, rounded up, or filled in when it is missing: an absent
 * value renders as an em dash or as the sentence saying it is missing.
 *
 * Four rules this page follows deliberately:
 *
 *  1. **The unit is stated before the first number.** The archive is event-*district*
 *     observations: 2,931 rows are 251 physical episodes, because a national event
 *     carries one row per district. A reader who takes 2,931 for a disaster count has
 *     been misled by omission, so the distinction is in the standfirst, not a footnote.
 *  2. **Severity is reported, not computed.** The distribution charts use the archive's
 *     own `Severity_Index` column and say so. A derived index is under publication
 *     embargo and the page states the omission (`artifact.embargo`).
 *  3. **No casualty figure is ever shown.** The source's affected column was `0.0` on
 *     every row, which means "not recorded", not "nobody affected" — so the field is
 *     absent and this page never prints a death toll.
 *  4. **Quality is on the page, not in a drawer.** The GLIDE/hazard disagreement rate
 *     and the missing year are shown to the reader, because they are what a
 *     careful reader would otherwise discover alone and distrust.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Breadcrumbs from '../components/Breadcrumbs';
// Per-route title/description/canonical/JSON-LD. Without it this page inherits the
// generic shell metadata in index.html, which is a real defect for a page whose
// whole purpose is to be found and cited.
import { usePageSeo } from '../hooks/usePageSeo';
import {
  ABSENT,
  formatMaybe,
  formatPercent,
  fetchHazardArchive,
  hazardColor,
  plural,
  ranked,
  SEVERITY_FIELD_LABEL,
  type HazardArchive,
} from '../lib/hazardArchive';

const MONTH_SHORT: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
  July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

function Panel({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-carbon-20 rounded-3xl p-5 shadow-xs space-y-3">
      <header className="space-y-1">
        <h3 className="text-xs font-mono font-bold text-sky-800 uppercase tracking-wider">{title}</h3>
        {caption ? <p className="text-xs text-carbon-60 leading-relaxed">{caption}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-carbon-05 border border-carbon-20 rounded-2xl p-4">
      <div className="text-[11px] font-mono uppercase tracking-wider text-carbon-60">{label}</div>
      <div className="text-2xl font-bold text-carbon-90 mt-1 tabular-nums">{value}</div>
      {note ? <div className="text-[11px] text-carbon-60 mt-1 leading-snug">{note}</div> : null}
    </div>
  );
}

export default function HazardArchivePage() {
  // `/archive` is the canonical address; `/history` and `/events` are aliases kept
  // for deep links. All three resolve their metadata from the same `/archive` entry
  // in src/content/site-routes.json, so the canonical tag points at one URL rather
  // than three — otherwise the alias pages compete with the real one in search.
  usePageSeo('/archive');

  const [archive, setArchive] = useState<HazardArchive | null>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'absent' | 'unreadable'>('loading');
  const [hazardFilter, setHazardFilter] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHazardArchive().then((result) => {
      if (!active) return;
      setArchive(result);
      setState(result ? 'loaded' : 'absent');
    });
    return () => {
      active = false;
    };
  }, []);

  const episodes = useMemo(() => {
    if (!archive) return [];
    return hazardFilter ? archive.episodes.filter((e) => e.hazard_type === hazardFilter) : archive.episodes;
  }, [archive, hazardFilter]);

  if (state === 'loading') {
    return <div className="max-w-6xl mx-auto px-4 py-16 text-sm text-carbon-60 font-mono">Loading archive artifact…</div>;
  }

  if (!archive) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        <Breadcrumbs customItems={[{ label: 'Home', path: '/' }, { label: 'Hazard archive' }]} />
        <h1 className="text-3xl font-bold text-carbon-90">Historical hazard archive</h1>
        <p className="text-carbon-60 leading-relaxed">
          This deployment has <strong>no hazard archive artifact loaded</strong>, so this page states no
          historical count. The archive is not redistributed with the repository.
        </p>
        {/* The loader and builder commands that used to be printed here live in the archive's
            quality record under docs/ops/, where an operator has a shell to run them in. A
            visitor to this page does not, and a command they cannot run is not provenance. */}
        <p className="text-xs text-carbon-60">
          This page renders an absence rather than a zero, on purpose: a chart drawn at zero would read
          as &ldquo;no hazards were recorded&rdquo;, which is a different and false claim.
        </p>
      </div>
    );
  }

  const t = archive.totals;
  const years = Object.entries(archive.by_year).map(([year, count]) => ({ year, count }));
  const months = Object.entries(archive.by_month).map(([month, count]) => ({
    month: MONTH_SHORT[month] ?? month,
    count,
  }));
  const hazardRows = ranked(archive.by_hazard).map(([hazard, count], i) => ({
    hazard,
    count,
    fill: hazardColor(hazard, i),
  }));
  const divisionRows = ranked(archive.by_division).map(([division, count]) => ({ division, count }));
  const districtRows = ranked(archive.by_district);
  const topDistricts = districtRows.slice(0, 15).map(([district, count]) => ({ district, count }));
  const severityRows = ranked(archive.by_hazard).map(([hazard]) => ({
    hazard,
    median: archive.severity_by_hazard[hazard]?.median ?? 0,
    p25: archive.severity_by_hazard[hazard]?.p25 ?? 0,
    p75: archive.severity_by_hazard[hazard]?.p75 ?? 0,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <Breadcrumbs customItems={[{ label: 'Home', path: '/' }, { label: 'Hazard archive' }]} />

      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-carbon-90">Historical hazard archive</h1>
        <p className="text-carbon-60 leading-relaxed max-w-3xl">
          {plural(t.rows, 'recorded event-district observation')} from{' '}
          {t.year_range ? `${t.year_range[0]} to ${t.year_range[1]}` : 'the archive range'}, covering{' '}
          {plural(t.districts, 'district')} and {plural(t.divisions, 'division')}. Those rows describe{' '}
          <strong>{plural(t.episodes, 'distinct physical episode')}</strong> — the archive records a
          national event once per district, so the row count is not a count of disasters.
        </p>
      </header>

      {/* Provenance first: a reader should be able to check the numbers before reading them. */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs font-mono text-sky-900 space-y-1">
        <div className="font-bold text-carbon-90">Provenance</div>
        <div>loader: {archive.provenance.loader}</div>
        <div>
          ingested {archive.provenance.ingested.toLocaleString('en-US')} rows · claimed{' '}
          {archive.provenance.claimed_total ?? ABSENT} · drift {archive.provenance.drift ?? ABSENT}
        </div>
        <div>artifact generated: {new Date(archive.generated_at).toISOString()}</div>
        <div className="text-sky-800/80">{archive.provenance.note}</div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Observations" value={t.rows.toLocaleString('en-US')} note="event × district rows" />
        <Stat label="Episodes" value={t.episodes.toLocaleString('en-US')} note={`${t.national_episodes} national · ${t.partial_episodes} partial`} />
        <Stat label="Districts" value={t.districts.toLocaleString('en-US')} note="of 64" />
        <Stat label="Hazard classes" value={t.hazards.toLocaleString('en-US')} note="of 8 modelled" />
      </div>

      <Panel
        title="Timeline — observations per year"
        caption="Counts follow reporting as much as hazard: a year with better third-party coverage reports more of the same physics. The gap is a coverage gap, not a quiet year."
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={years} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d1d1d1" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [value.toLocaleString('en-US'), 'observations']} />
              <Line type="monotone" dataKey="count" stroke="#0369a1" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {archive.quality.missing_years.length ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <strong>No records at all for {archive.quality.missing_years.join(', ')}.</strong> The archive
            runs {t.year_range?.[0]}–{t.year_range?.[1]} with this gap; it is stated rather than smoothed,
            because a zero plotted as a data point would read as a hazard-free year.
          </p>
        ) : null}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel
          title="Hazard mix"
          caption="Select a class to filter the episode list below."
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={hazardRows}
                  dataKey="count"
                  nameKey="hazard"
                  innerRadius={45}
                  outerRadius={95}
                  paddingAngle={1}
                  onClick={(entry: { hazard?: string }) =>
                    setHazardFilter((current) => (current === entry?.hazard ? null : entry?.hazard ?? null))
                  }
                >
                  {hazardRows.map((row) => (
                    <Cell key={row.hazard} fill={row.fill} opacity={hazardFilter && hazardFilter !== row.hazard ? 0.3 : 1} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => value.toLocaleString('en-US')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Severity distribution by class"
          caption={`Median and interquartile range of the ${SEVERITY_FIELD_LABEL}. This is an archive field, reproduced as recorded — it is not a HazardNet computation.`}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityRows} margin={{ top: 10, right: 20, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d1d1" />
                <XAxis dataKey="hazard" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="median" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Seasonality — observations by month" caption="Aggregated across all archive years. Monsoon concentration is visible; it also reflects when third-party reporting is densest.">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d1d1d1" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [value.toLocaleString('en-US'), 'observations']} />
              <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="By division" caption={archive.quality.division_vintage}>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={divisionRows} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d1d1" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="division" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(value: number) => [value.toLocaleString('en-US'), 'observations']} />
                <Bar dataKey="count" fill="#0369a1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Districts with the most records" caption="Top 15 of 64. Exposure and reporting density both feed this, so it is not a vulnerability ranking.">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDistricts} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d1d1" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="district" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(value: number) => [value.toLocaleString('en-US'), 'observations']} />
                <Bar dataKey="count" fill="#0891b2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title={`Episodes${hazardFilter ? ` — ${hazardFilter}` : ''}`}
        caption={`${episodes.length} of ${t.episodes}. An episode groups the district-level observations of one physical event; ${t.episodes_without_glide} rows carry no GLIDE event id and therefore cannot be grouped.`}
      >
        {hazardFilter ? (
          <button
            type="button"
            onClick={() => setHazardFilter(null)}
            className="text-xs font-mono text-sky-700 hover:text-sky-900 underline"
          >
            clear filter
          </button>
        ) : null}
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-carbon-60 font-mono uppercase tracking-wider border-b border-carbon-20">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">GLIDE</th>
                <th className="py-2 pr-3">Hazard</th>
                <th className="py-2 pr-3 text-right">Districts</th>
                <th className="py-2 pr-3 text-right">Median severity</th>
                <th className="py-2 pr-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {episodes.slice(0, 120).map((episode) => (
                <tr key={episode.id} className="border-b border-carbon-10 hover:bg-carbon-05">
                  <td className="py-1.5 pr-3 font-mono text-carbon-70 whitespace-nowrap">{episode.start_date}</td>
                  <td className="py-1.5 pr-3 font-mono text-carbon-60 whitespace-nowrap">
                    {episode.glide ?? <span className="text-carbon-60">not tagged</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-carbon-80">{episode.hazard_type}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-carbon-70">
                    {episode.district_count}
                    {episode.national ? <span className="text-carbon-60"> · national</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-carbon-70">
                    {formatMaybe(episode.severity.median)}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-carbon-60">{episode.data_sources.join(', ') || ABSENT}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {episodes.length > 120 ? (
          <p className="text-xs text-carbon-60">
            Showing the first 120 of {episodes.length} episodes. The full list is served at{' '}
            <code>/data/hazard-archive.json</code> — a URL on this site, which is the difference
            between a pointer a reader can follow and one they cannot.
          </p>
        ) : null}
      </Panel>

      {/* Quality and embargo are on the page: a reader who finds these alone would distrust the rest. */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="What this archive does not tell you" caption="Reported rather than repaired — these are properties of the source data.">
          <ul className="text-xs text-carbon-70 space-y-2 leading-relaxed">
            <li>
              <strong>No casualty figures.</strong> {archive.quality.casualties_note}
            </li>
            <li>
              <strong>
                {archive.quality.glide_disagreement_rows.toLocaleString('en-US')} of{' '}
                {archive.quality.glide_checked_rows.toLocaleString('en-US')} rows (
                {formatPercent(archive.quality.glide_disagreement_rate)}) where the GLIDE prefix names a
                different hazard class than the archive&rsquo;s own label.
              </strong>{' '}
              Neither is treated as authoritative here; the divergence is counted so a reader
              cross-checking against GLIDE is not surprised.
            </li>
            <li>
              <strong>{archive.quality.review_flagged_rows.toLocaleString('en-US')} rows</strong> are
              flagged <code>Requires_Manual_Review</code> in the source. The flag is surfaced.
            </li>
            <li>
              <strong>Constant columns excluded.</strong>{' '}
              {Object.entries(archive.quality.excluded_constant_columns)
                .map(([column, why]) => `${column} (${why})`)
                .join('; ')}
              .
            </li>
          </ul>
        </Panel>

        <Panel title="Publication status" caption="What is withheld from this page, and why.">
          {archive.embargo.active ? (
            <div className="text-xs text-carbon-70 space-y-3 leading-relaxed">
              <p>
                <span className="inline-block text-[10px] font-mono uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-2 py-0.5">
                  withheld
                </span>
              </p>
              <p>{archive.embargo.reason}</p>
              <p className="text-carbon-60">
                Withheld: {archive.embargo.withheld.join(', ')}.
              </p>
              <p className="text-carbon-60">{archive.embargo.disclosed_field}</p>
            </div>
          ) : (
            <p className="text-xs text-carbon-70 leading-relaxed">
              No embargoed material is withheld from this page. {archive.embargo.disclosed_field}
            </p>
          )}
        </Panel>
      </div>

      <footer className="text-xs text-carbon-60 space-y-2 border-t border-carbon-20 pt-4">
        {/* The measured quality of this archive, including every known defect, and the
            column mapping, are recorded in the archive's quality document under docs/ops/.
            Both were printed here as file names, which a visitor cannot open. */}
        <p>
          Related: <Link className="text-sky-700 hover:text-sky-900 underline" to="/districts">district pages</Link>{' '}
          carry their own history once an export is loaded ·{' '}
          <Link className="text-sky-700 hover:text-sky-900 underline" to="/retrospectives">season retrospectives</Link>{' '}
          aggregate by year ·{' '}
          <Link className="text-sky-700 hover:text-sky-900 underline" to="/data-sources">data sources and terms</Link>.
        </p>
      </footer>
    </div>
  );
}
