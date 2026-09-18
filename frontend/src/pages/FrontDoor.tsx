/**
 * `/` — the editorial front door.
 *
 * The GIS console moved to `/live` (see `App.tsx`), and the root became the page a
 * journalist, an agronomist or a reviewer lands on first: what this platform is for, what
 * the last run actually produced, and where every number can be checked. `docs/PUBLIC_SURFACE.md`
 * records the split and the reasoning; the short version is that a map answers "where?"
 * while a front door has to answer "who is telling me this, dated when, and how would I
 * know if it stopped working?".
 *
 * **Where the copy lives.** Every word of the editorial half is the `/` entry in
 * `src/content/site-routes.json` — the same file `scripts/prerender.mjs` renders into the
 * static HTML and `usePageSeo` applies to the document head. Nothing is forked into JSX,
 * so a no-JavaScript visitor, a crawler and the hydrated app read one text.
 *
 * **Where the numbers come from.** The live half reads committed artifacts and prints the
 * artifact's own values with the run that produced them:
 *
 *   * `/data/freshness.json`   — artifact ages against their SLOs, run coverage, honesty notes
 *   * `/data/alerts-latest.json` (through `useAlertsData`) — published alerts and the
 *     assessed/held/unpublished counts from the run report
 *   * `/data/model-performance.json` — the hindcast scorecard's episode count and build
 *
 * Nothing here is estimated, rounded up, or filled in when an artifact is missing: a
 * missing value renders as an em dash or as the sentence that says it is missing, never as
 * a zero that reads like a real measurement. That rule is the reason this page exists.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

import MaterialIcon from '../components/MaterialIcon';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { usePageSeo } from '../hooks/usePageSeo';
import { useAlertsData } from '../hooks/useAlertsData';
import { useHazardLabel } from '../hooks/useHazardLabel';
import { useI18n } from '../hooks/useI18n';
import {
  FRESHNESS_URL,
  describeAge,
  parseFreshness,
  stateLabel,
  type FreshnessArtifact,
  type FreshnessState,
} from '../lib/freshness';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import hazardMethodology from '../content/hazard-methodology.json';
import attribution from '../content/attribution.json';

/* ─────────────────────────── live artifact readers ─────────────────────────── */

interface ScorecardFacts {
  episodes: number | null;
  generatedAt: string | null;
}

interface LiveFacts {
  freshness: FreshnessArtifact | null;
  scorecard: ScorecardFacts;
  loading: boolean;
  /** True when at least one fetch failed — the page then says so instead of showing blanks. */
  failed: boolean;
}

/**
 * One fetch per artifact, no retries, no polling. A front door is not a dashboard; it
 * states what the deployment currently ships and links to `/status` for the detail. A
 * failure here is rendered as a failure, because an unread artifact is a fact too.
 */
function useLiveFacts(): LiveFacts {
  const [freshness, setFreshness] = useState<FreshnessArtifact | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardFacts>({ episodes: null, generatedAt: null });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadFreshness = async () => {
      try {
        const response = await fetch(FRESHNESS_URL, { cache: 'no-cache' });
        const payload = await response.json();
        const parsed = parseFreshness(payload);
        if (!cancelled) {
          if (parsed) setFreshness(parsed);
          else setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    const loadScorecard = async () => {
      try {
        const response = await fetch('/data/model-performance.json', { cache: 'no-cache' });
        const payload = await response.json();
        if (cancelled) return;
        const episodes = Array.isArray(payload?.episodes) ? payload.episodes.length : null;
        setScorecard({
          episodes,
          generatedAt: typeof payload?.generated_at === 'string' ? payload.generated_at : null,
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void Promise.all([loadFreshness(), loadScorecard()]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { freshness, scorecard, loading, failed };
}

/* ─────────────────────────────── presentation ──────────────────────────────── */

/** A state is never signalled by colour alone: the word is always rendered beside the dot. */
const STATE_DOT: Record<FreshnessState, string> = {
  fresh: 'bg-nasa-green',
  stale: 'bg-nasa-orange',
  failing: 'bg-nasa-red',
  missing: 'bg-carbon-40',
  unknown: 'bg-carbon-40',
};

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-carbon-60">{children}</p>
);

/** One figure in the trust strip, with the artifact it was read from. */
const Figure: React.FC<{ value: string; label: string; source: string }> = ({ value, label, source }) => (
  <div className="border-t-2 border-nasa-red bg-white p-4">
    <p className="font-mono text-2xl font-light leading-none text-carbon-90 md:text-3xl">{value}</p>
    <p className="mt-2 text-xs font-bold leading-snug text-carbon-90">{label}</p>
    <p className="mt-1 font-mono text-[10px] leading-snug break-words text-carbon-60">source: {source}</p>
  </div>
);

const SectionBody: React.FC<{ section: Section }> = ({ section }) => (
  <>
    {(section.paragraphs ?? []).map((paragraph, index) => (
      <p key={index} className="min-w-0 break-words text-sm leading-relaxed text-carbon-70">
        {paragraph}
      </p>
    ))}
    {(section.bullets ?? []).length > 0 && (
      <ul className="space-y-2">
        {(section.bullets ?? []).map((bullet, index) => (
          <li key={index} className="flex min-w-0 gap-2 text-sm leading-relaxed text-carbon-70">
            <span aria-hidden="true" className="mt-[7px] h-[5px] w-[5px] shrink-0 bg-nasa-blue" />
            <span className="min-w-0 break-words">{bullet}</span>
          </li>
        ))}
      </ul>
    )}
    {section.table && (
      <div className="w-full min-w-0 overflow-x-auto border border-carbon-20">
        <table className="w-full border-collapse text-left text-xs">
          {section.table.caption && (
            <caption className="bg-carbon-05 px-3 py-2 text-left text-[11px] text-carbon-60">
              {section.table.caption}
            </caption>
          )}
          <thead>
            <tr className="border-b border-carbon-20 bg-carbon-05">
              {section.table.columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-carbon-60">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.table.rows.map((row) => (
              <tr key={row.join('|')} className="border-b border-carbon-10 last:border-b-0">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-3 py-2 align-top ${index === 0 ? 'font-bold text-carbon-90' : 'text-carbon-70'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {section.callout?.text && (
      <p
        role={section.callout.tone === 'warning' ? 'note' : undefined}
        className="border-l-2 border-nasa-orange bg-white p-4 text-sm leading-relaxed text-carbon-80"
      >
        {section.callout.text}
      </p>
    )}
    {(section.links ?? []).length > 0 && (
      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {(section.links ?? []).map((link) => (
          <ExternalOrInternalLink key={link.href} href={link.href} label={link.label} />
        ))}
      </nav>
    )}
  </>
);

const ExternalOrInternalLink: React.FC<{ href: string; label: string }> = ({ href, label }) => {
  const external = /^https?:\/\//i.test(href);
  const className =
    'inline-flex items-center gap-1 text-sm font-bold text-nasa-blue-shade underline decoration-carbon-30 underline-offset-4 hover:decoration-nasa-blue-shade';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
        <span aria-hidden="true">↗</span>
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {label}
    </Link>
  );
};

interface Section {
  h2?: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: { tone?: string; text?: string };
  links?: Array<{ label: string; href: string }>;
  table?: { caption?: string; columns: string[]; rows: string[][] };
}

/* ───────────────────────────────── page ───────────────────────────────────── */

export const FrontDoor: React.FC = () => {
  const content = usePageSeo('/');
  const { freshness, scorecard, loading, failed } = useLiveFacts();
  const { alerts, assessed, counts, notPublished, generatedAt, loading: alertsLoading, error } = useAlertsData();
  const hazardLabel = useHazardLabel();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  /**
   * Deep links built before the console moved. `/` carried the map for the whole life of
   * the project, so `/?district=kurigram` — and anything else the map reads from the query
   * string — is forwarded to `/live` rather than silently dropped on the editorial page.
   */
  const redirectToLive = useMemo(() => {
    const district = searchParams.get('district');
    if (!district) return null;
    const query = location.search.replace(/^\?/, '');
    return `/live?${query}`;
  }, [searchParams, location.search]);

  const coverage = freshness?.coverage ?? null;
  const overall = freshness?.overall ?? null;
  const hazards = (hazardMethodology as { hazards?: unknown[] }).hazards ?? [];
  const topAlerts = useMemo(() => alerts.slice(0, 4), [alerts]);

  if (!content) return null;
  if (redirectToLive) return <Navigate to={redirectToLive} replace />;

  const sections = (content.sections ?? []) as Section[];
  const faqs = content.faqs ?? [];

  const coverageLine = coverage?.districts_covered != null && coverage?.districts_expected != null
    ? `${coverage.districts_covered} of ${coverage.districts_expected} districts`
    : '—';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-auto w-full max-w-[1200px] space-y-10"
    >
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="border border-carbon-20 bg-white p-6 md:p-10">
        <Eyebrow>
          {content.label ?? 'Overview'} · HazardNet · {content.updated ? `reviewed ${content.updated}` : 'review date unknown'}
        </Eyebrow>
        <h1 className="mt-4 max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-carbon-90 md:text-5xl">
          {content.h1 ?? content.title}
        </h1>
        {content.standfirst && (
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-carbon-70 md:text-lg">{content.standfirst}</p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/live"
            className="inline-flex items-center gap-2 bg-nasa-red px-5 py-3 text-sm font-bold text-white hover:bg-nasa-red-shade"
          >
            <MaterialIcon name="public" className="text-base" />
            Open the live map
          </Link>
          <Link
            to="/methodology"
            className="inline-flex items-center gap-2 border border-nasa-blue px-5 py-3 text-sm font-bold text-nasa-blue-shade hover:bg-nasa-blue/5"
          >
            How a forecast is produced
          </Link>
          <Link
            to="/model-performance"
            className="inline-flex items-center gap-2 border border-carbon-20 px-5 py-3 text-sm font-bold text-carbon-80 hover:border-carbon-30"
          >
            Read the validation scorecard
          </Link>
        </div>

        <p className="mt-6 max-w-3xl border-t border-carbon-10 pt-4 text-xs leading-relaxed text-carbon-60">
          HazardNet is decision support, not an official warning service. Weather warnings, cyclone signals and flood
          bulletins come from the Bangladesh Meteorological Department and the Flood Forecasting and Warning Centre; in an
          emergency call 999. <Link to="/live" className="font-bold text-nasa-blue-shade underline underline-offset-2">The live map</Link> carries
          the current outlooks.
        </p>
      </header>

      {/* ── Trust strip: every figure carries the artifact it was read from ── */}
      <section aria-labelledby="trust-heading" className="space-y-3">
        <h2 id="trust-heading" className="text-lg font-bold text-carbon-90">
          What this deployment covers
        </h2>
        <div className="grid grid-cols-1 gap-px bg-carbon-20 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            value={`${hazards.length}`}
            label="Hazard classes, from cold wave to tropical cyclone"
            source="src/content/hazard-methodology.json"
          />
          <Figure
            value={`${ALL_64_DISTRICTS.length}`}
            label="Districts addressed on the live map"
            source="src/data/bangladeshDistricts.ts"
          />
          <Figure
            value="7 + 15"
            label="Forecast horizons, in days, from one deterministic weather window"
            source="src/content/site-routes.json · /methodology"
          />
          <Figure
            value={scorecard.episodes != null ? `${scorecard.episodes}` : '—'}
            label="Historical episodes scored in the hindcast report"
            source={
              scorecard.episodes != null
                ? `/data/model-performance.json · built ${scorecard.generatedAt ?? 'date not reported'}`
                : '/data/model-performance.json · not readable'
            }
          />
        </div>
        <p className="text-xs leading-relaxed text-carbon-60">
          Coverage is stated from the artifacts, not from the design: the last forecast snapshot covered{' '}
          <strong className="font-bold text-carbon-80">{loading ? '…' : coverageLine}</strong>
          {coverage?.produced_units != null ? ` (${coverage.produced_units} forecast units produced)` : ''}. The{' '}
          <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
            status page
          </Link>{' '}
          shows where each artifact came from and how old it is.
        </p>
      </section>

      {/* ── The last run, and the last published alerts ───────────────────── */}
      <section aria-labelledby="run-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="run-heading" className="text-lg font-bold text-carbon-90">
            The last run, and the last published alerts
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-wider text-carbon-60">
            read from the committed artifacts on every load
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Artifact freshness */}
          <div className="border border-carbon-20 bg-white p-5">
            <Eyebrow>Artifacts this deployment ships</Eyebrow>
            {loading && <p className="mt-3 text-sm text-carbon-60">Reading /data/freshness.json …</p>}
            {!loading && !freshness && (
              <p className="mt-3 text-sm leading-relaxed text-carbon-70">
                The freshness artifact could not be read, so this panel states nothing about ages. The{' '}
                <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                  status page
                </Link>{' '}
                will show the same failure.
              </p>
            )}
            {freshness && (
              <>
                <ul className="mt-3 space-y-2">
                  {freshness.sources.slice(0, 5).map((source) => (
                    <li key={source.id} className="flex min-w-0 items-start gap-2 text-xs">
                      <span aria-hidden="true" className={`mt-[6px] h-2 w-2 shrink-0 ${STATE_DOT[source.state]}`} />
                      <span className="min-w-0 break-words text-carbon-70">
                        <strong className="font-bold text-carbon-90">{source.label}</strong> — {stateLabel(source.state)}
                        {source.age_hours != null ? `, ${describeAge(source.age_hours)} old` : ''}
                        {source.prediction_date ? `, run dated ${source.prediction_date}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-carbon-10 pt-3 font-mono text-[10px] leading-relaxed text-carbon-60">
                  built {freshness.built_at ?? 'timestamp not reported'} · overall {overall?.state ?? 'unknown'} ·
                  generated by {freshness.generated_by ?? 'generator not reported'}
                </p>
              </>
            )}
          </div>

          {/* Published alerts */}
          <div className="border border-carbon-20 bg-white p-5">
            <Eyebrow>Published alerts</Eyebrow>
            {alertsLoading && <p className="mt-3 text-sm text-carbon-60">Reading the alerts artifact …</p>}

            {!alertsLoading && topAlerts.length > 0 && (
              <ul className="mt-3 space-y-3">
                {topAlerts.map((alert) => (
                  <li key={alert.id} className="border-b border-carbon-10 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertLevelBadge
                        level={alert.level}
                        label={t(`alerts.level.${alert.level}`)}
                        description={t(`alerts.level.${alert.level}.desc`)}
                        size="sm"
                        srPrefix={t('alerts.levelLabel')}
                      />
                      <Link
                        to={`/alerts/${encodeURIComponent(alert.id)}`}
                        className="min-w-0 break-words text-sm font-bold text-nasa-blue-shade underline underline-offset-2"
                      >
                        {alert.district_name ?? 'District not named'}
                      </Link>
                      <span className="text-xs text-carbon-60">{hazardLabel(alert.hazard_type)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-carbon-60">
                      {alert.horizon ? `${alert.horizon} horizon · ` : ''}
                      {alert.target_date ? `valid ${alert.target_date} · ` : ''}
                      {alert.published?.at ? `published ${alert.published.at}` : 'publication time not reported'}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {!alertsLoading && topAlerts.length === 0 && (
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-carbon-70">
                <p className="text-carbon-90">
                  <strong className="font-bold">No alert is published at the moment of this read.</strong>
                </p>
                <p>
                  That is a statement about the publisher, not about the weather. The run behind this read
                  {assessed != null ? ` assessed ${assessed} district forecasts` : ' assessed an unreported number of forecasts'}
                  {notPublished != null
                    ? ` and held ${notPublished} of them out of publication`
                    : counts
                      ? ` and published none${counts.dropped_unpublished ? `, dropping ${counts.dropped_unpublished}` : ''}`
                      : ''}
                  {generatedAt ? `; it was generated ${generatedAt}.` : '.'}
                </p>
                {error && <p className="text-nasa-red-shade">The alert source reported: {error}</p>}
                <p>
                  Silence on an agricultural platform is easily misread as safety, so the distinction matters:{' '}
                  <em>no published alert</em> is not the same as <em>no hazard</em>. Read the{' '}
                  <Link to="/live" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                    live map
                  </Link>{' '}
                  for the current outlooks and the{' '}
                  <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                    status page
                  </Link>{' '}
                  for why a run may be held.
                </p>
              </div>
            )}

            <nav aria-label="Alert pages" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-carbon-10 pt-3">
              <Link to="/alerts" className="text-xs font-bold text-nasa-blue-shade underline underline-offset-2">
                All published alerts
              </Link>
              <Link to="/status" className="text-xs font-bold text-nasa-blue-shade underline underline-offset-2">
                Why a run may be held
              </Link>
            </nav>
          </div>
        </div>

        {failed && (
          <p className="border-l-2 border-nasa-orange bg-white p-3 text-xs leading-relaxed text-carbon-70">
            At least one artifact could not be read on this load. The panels above say so where it applies; a blank is
            never rendered as a zero.
          </p>
        )}
      </section>

      {/* ── The editorial half, from site-routes.json ─────────────────────── */}
      {sections.map((section, index) => (
        <section
          key={section.h2 ?? index}
          aria-labelledby={section.h2 ? `section-${index}` : undefined}
          className="space-y-4 border-t border-carbon-20 pt-6"
        >
          {section.h2 && (
            <h2 id={`section-${index}`} className="text-xl font-bold tracking-tight text-carbon-90 md:text-2xl">
              {section.h2}
            </h2>
          )}
          <SectionBody section={section} />
        </section>
      ))}

      {/* ── Questions the front door should answer ────────────────────────── */}
      {faqs.length > 0 && (
        <section aria-labelledby="faq-heading" className="space-y-3 border-t border-carbon-20 pt-6">
          <h2 id="faq-heading" className="text-xl font-bold tracking-tight text-carbon-90 md:text-2xl">
            Direct answers
          </h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="border-b border-carbon-20 py-3 last:border-b-0">
              <summary className="cursor-pointer list-none text-sm font-bold text-carbon-90 marker:hidden">
                <span className="inline-flex items-start gap-2">
                  <MaterialIcon name="help" className="mt-0.5 text-base text-nasa-blue" />
                  {faq.question}
                </span>
              </summary>
              <p className="mt-2 pl-6 text-sm leading-relaxed text-carbon-70">{faq.answer}</p>
            </details>
          ))}
        </section>
      )}

      {/* ── Attribution: the exact block, from the committed data ─────────── */}
      <section aria-labelledby="attribution-heading" className="border border-carbon-20 bg-white p-6 md:p-8">
        <Eyebrow>Attribution</Eyebrow>
        <h2 id="attribution-heading" className="mt-3 text-lg font-bold text-carbon-90">
          Who built this, and under whose supervision
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-carbon-70">
          {attribution.author.name} ({attribution.author.role},{' '}
          <a
            href={attribution.author.orcidUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-nasa-blue-shade underline underline-offset-2"
          >
            ORCID {attribution.author.orcid}
          </a>
          ) — {attribution.work.name}. {attribution.work.type}, {attribution.department.name},{' '}
          {attribution.department.university}, supervised by {attribution.supervisor.name} ({attribution.supervisor.role})
          {attribution.coSupervisor?.role ? ' with a co-supervisor' : ''}.
        </p>
        <p className="mt-3 max-w-3xl border-l-2 border-carbon-20 bg-carbon-05 p-3 font-mono text-[11px] leading-relaxed text-carbon-70">
          {attribution.work.citationText}
        </p>
        <nav aria-label="Project links" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {[
            { label: 'Repository', href: attribution.work.repository },
            { label: 'Institution', href: attribution.department.url },
            { label: 'Supervisor profile', href: attribution.supervisor.url },
            ...(attribution.coSupervisor?.url ? [{ label: 'Co-supervisor profile', href: attribution.coSupervisor.url }] : []),
          ].map((link) => (
            <ExternalOrInternalLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>
      </section>
    </motion.div>
  );
};

export default FrontDoor;
