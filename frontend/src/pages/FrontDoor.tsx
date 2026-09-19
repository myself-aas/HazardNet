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
 *
 * **The 2026-09-19 landing-page review.** A design review benchmarked this page against the
 * front doors of GFDRR, UNDRR and the Red Cross and asked for a photograph-led hero, a
 * district map and a live status strip. Two of those three are built here, one is refused,
 * and the reasoning is recorded in `docs/PUBLIC_SURFACE.md` §3 rather than left as a
 * reviewer's disappointment:
 *
 *   · The strip is built (`components/frontdoor/LiveStatusStrip.tsx`) from the alert
 *     artifact's own counts — including today's zero, which the review's worked example
 *     ("2 active alerts · 61 districts normal") would have invented.
 *   · The hero visual is built (`components/frontdoor/RunVisual.tsx`) as the last run's own
 *     coverage, outcome and artifact ages. There is still no photograph: none ships in this
 *     repository under a licence the project can stand behind, and a stock image of a flood
 *     would date the page to a disaster it is not describing.
 *   · The map stays at `/live`. The split was re-affirmed on 2026-09-19: `/` answers "who is
 *     telling me this, and how would I know if it stopped working", `/live` answers "where".
 *     A second map surface is a second thing to keep honest, for no reader who was lost.
 *   · The page is bilingual: the editorial copy carries a Bengali block in `site-routes.json`
 *     and the chrome is translated through `lib/i18n.ts`. That Bengali is drafted, not yet
 *     read by a native speaker — owner Action 6c, and the route says so in its own data.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

import MaterialIcon from '../components/MaterialIcon';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import LiveStatusStrip from '../components/frontdoor/LiveStatusStrip';
import RunVisual from '../components/frontdoor/RunVisual';
import { localiseRoute, usePageSeo } from '../hooks/usePageSeo';
import { useAlertsData } from '../hooks/useAlertsData';
import { useHazardLabel } from '../hooks/useHazardLabel';
import { useI18n } from '../hooks/useI18n';
import { FRESHNESS_URL, parseFreshness, type FreshnessArtifact } from '../lib/freshness';
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

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-carbon-60">{children}</p>
);

/**
 * One figure in the trust strip.
 *
 * The strip used to print, under each number, the file it was read from. That line is
 * gone: a visitor cannot open a repository path, and on the surface where this renders it
 * was the smallest, least readable text on the page. What still makes each figure
 * checkable is the run panel beside it (build time, coverage, honesty notes) and the
 * review ledger further down, which is where a reader can actually act.
 */
const Figure: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="border-t-2 border-nasa-red bg-white p-4">
    <p className="font-mono text-2xl font-light leading-none text-carbon-90 md:text-3xl">{value}</p>
    <p className="mt-2 text-xs font-bold leading-snug text-carbon-90">{label}</p>
  </div>
);

const SectionBody: React.FC<{ section: Section }> = ({ section }) => {
  const { t } = useI18n();
  return (
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
                  <th
                    key={column}
                    scope="col"
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-carbon-60"
                  >
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
      {/* The nav's accessible name is unique per section: six navs all named "Related pages" is a
          `landmark-unique` violation, and the landmark list is how a screen-reader user jumps
          between the sections of a long page. */}
      {(section.links ?? []).length > 0 && (
        <nav
          aria-label={section.h2 ? `${t('frontdoor.relatedPages')}: ${section.h2}` : t('frontdoor.relatedPages')}
          className="flex flex-wrap gap-x-5 gap-y-2 pt-1"
        >
          {(section.links ?? []).map((link) => (
            <ExternalOrInternalLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>
      )}
    </>
  );
};

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
  const { t, language, formatNumber } = useI18n();
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
  const hazards = (hazardMethodology as { hazards?: unknown[] }).hazards ?? [];
  const topAlerts = useMemo(() => alerts.slice(0, 4), [alerts]);

  /**
   * The two counts the strip and the hero card print. Both come from the alert artifact:
   * `not_published` can sit inside `counts` (as the current snapshot has it) or at the top
   * level (as an older one did), so both places are read. A null stays null — it renders as
   * an em dash or as the sentence that says the file could not be read, never as a zero.
   *
   * `published` is null rather than 0 when the artifact itself was unreadable: "0 alerts"
   * and "we could not read the file" are different facts, and on a hazard page the second
   * one must never be dressed as the first.
   */
  const alertsReadable = counts !== null || alerts.length > 0;
  const published = alertsReadable ? alerts.length : null;
  const withheld = counts?.not_published ?? notPublished ?? null;

  if (!content) return null;
  if (redirectToLive) return <Navigate to={redirectToLive} replace />;

  const localised = localiseRoute(content, language);
  const sections = (localised.sections ?? []) as Section[];
  const faqs = localised.faqs ?? [];

  const coverageLine =
    coverage?.districts_covered != null && coverage?.districts_expected != null
      ? t('frontdoor.covers.coverageValue', {
          covered: formatNumber(coverage.districts_covered),
          expected: formatNumber(coverage.districts_expected),
        })
      : '—';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-auto w-full max-w-[1200px] space-y-10"
    >
      {/* ── Hero: what this platform is, and the last run drawn from its own artifacts ── */}
      <header className="border border-carbon-20 bg-white p-6 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Eyebrow>
            {localised.label ?? 'Overview'} · HazardNet ·{' '}
            {content.updated
              ? t('frontdoor.hero.reviewed', { date: content.updated })
              : t('frontdoor.hero.reviewedUnknown')}
          </Eyebrow>
          {/* The switch lives on the front door because the front door is bilingual: a
              reader who cannot read this language cannot be expected to find the control
              on a page they have not reached yet. */}
          <LanguageToggle variant="switch" tone="hds" />
        </div>

        <div className="mt-4 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0">
            <h1 className="max-w-3xl text-3xl font-bold leading-[1.1] tracking-tight text-carbon-90 md:text-5xl">
              {localised.h1 ?? localised.title}
            </h1>
            {localised.standfirst && (
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-carbon-70 md:text-lg">
                {localised.standfirst}
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/live"
                className="inline-flex items-center gap-2 bg-nasa-red px-5 py-3 text-sm font-bold text-white hover:bg-nasa-red-shade"
              >
                <MaterialIcon name="public" className="text-base" />
                {t('frontdoor.hero.ctaMap')}
              </Link>
              <Link
                to="/methodology"
                className="inline-flex items-center gap-2 border border-nasa-blue px-5 py-3 text-sm font-bold text-nasa-blue-shade hover:bg-nasa-blue/5"
              >
                {t('frontdoor.hero.ctaMethodology')}
              </Link>
              <Link
                to="/model-performance"
                className="inline-flex items-center gap-2 border border-carbon-20 px-5 py-3 text-sm font-bold text-carbon-80 hover:border-carbon-30"
              >
                {t('frontdoor.hero.ctaScorecard')}
              </Link>
            </div>

            <p className="mt-6 max-w-2xl border-t border-carbon-10 pt-4 text-xs leading-relaxed text-carbon-60">
              {t('frontdoor.hero.authority')}{' '}
              <Link to="/live" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                {t('frontdoor.hero.authorityMap')}
              </Link>
            </p>
          </div>

          {/* The hero visual. Not a photograph and not a map — see the file's header
              comment and `docs/PUBLIC_SURFACE.md` §3 rule 5. */}
          <RunVisual freshness={freshness} loading={loading} published={published} withheld={withheld} />
        </div>
      </header>

      {/* ── The live strip: what is published at the moment of this read ──────────────── */}
      <LiveStatusStrip
        counts={counts}
        assessed={assessed}
        withheld={withheld}
        alerts={topAlerts}
        generatedAt={generatedAt}
        loading={alertsLoading}
        error={error}
        coverage={coverage}
      />

      {/* ── Trust strip: every figure carries the artifact it was read from ── */}
      <section aria-labelledby="trust-heading" className="space-y-3">
        <h2 id="trust-heading" className="text-lg font-bold text-carbon-90">
          {t('frontdoor.covers.h2')}
        </h2>
        <div className="grid grid-cols-1 gap-px bg-carbon-20 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            value={formatNumber(hazards.length)}
            label={t('frontdoor.covers.hazards')}
          />
          <Figure
            value={formatNumber(ALL_64_DISTRICTS.length)}
            label={t('frontdoor.covers.districts')}
          />
          <Figure
            value="7 + 15"
            label={t('frontdoor.covers.horizons')}
          />
          <Figure
            value={scorecard.episodes != null ? formatNumber(scorecard.episodes) : '—'}
            label={t('frontdoor.covers.episodes')}
          />
        </div>
        <p className="text-xs leading-relaxed text-carbon-60">
          {t('frontdoor.covers.noteLead')}{' '}
          <strong className="font-bold text-carbon-80">{loading ? '…' : coverageLine}</strong>
          {coverage?.produced_units != null
            ? ` ${t('frontdoor.covers.noteUnits', { units: formatNumber(coverage.produced_units) })}`
            : ''}
          .{' '}
          <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
            {t('frontdoor.covers.statusLink')}
          </Link>{' '}
          {t('frontdoor.covers.noteTail')}
        </p>
      </section>

      {/* ── The published alerts in full: the strip is the glance, this is the record ── */}
      <section aria-labelledby="run-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="run-heading" className="text-lg font-bold text-carbon-90">
            {t('frontdoor.run.h2')}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-wider text-carbon-60">{t('frontdoor.run.aside')}</p>
        </div>

        <div className="border border-carbon-20 bg-white p-5">
          <Eyebrow>{t('frontdoor.run.publishedEyebrow')}</Eyebrow>
          {alertsLoading && <p className="mt-3 text-sm text-carbon-60">{t('frontdoor.run.reading')}</p>}

          {!alertsLoading && topAlerts.length > 0 && (
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {topAlerts.map((alert) => (
                <li key={alert.id} className="border-b border-carbon-10 pb-3 md:border-b-0 md:pb-0">
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
                      {alert.district_name ?? t('frontdoor.strip.districtUnnamed')}
                    </Link>
                    <span className="text-xs text-carbon-60">{hazardLabel(alert.hazard_type)}</span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-carbon-60">
                    {alert.horizon ? `${t('frontdoor.run.horizon', { horizon: alert.horizon })} · ` : ''}
                    {alert.target_date ? `${t('frontdoor.run.valid', { date: alert.target_date })} · ` : ''}
                    {alert.published?.at
                      ? t('frontdoor.run.published', { at: alert.published.at })
                      : t('frontdoor.run.publishedUnknown')}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {!alertsLoading && topAlerts.length === 0 && (
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-carbon-70">
              <p className="text-carbon-90">
                <strong className="font-bold">{t('frontdoor.run.noneTitle')}</strong>
              </p>
              <p>
                {t('frontdoor.run.noneLead')}{' '}
                {assessed != null
                  ? t('frontdoor.run.noneAssessed', { assessed: formatNumber(assessed) })
                  : t('frontdoor.run.noneAssessedUnknown')}
                {notPublished != null
                  ? ` ${t('frontdoor.run.noneHeld', { held: formatNumber(notPublished) })}`
                  : counts
                    ? ` ${t('frontdoor.run.nonePublishedNone')}${
                        counts.dropped_unpublished
                          ? t('frontdoor.run.noneDropped', { dropped: formatNumber(counts.dropped_unpublished) })
                          : ''
                      }`
                    : ''}
                {generatedAt ? t('frontdoor.run.noneGenerated', { at: generatedAt }) : '.'}
              </p>
              {error && <p className="text-nasa-red-shade">{t('frontdoor.run.errorPrefix', { error })}</p>}
              <p>
                {t('frontdoor.run.noneSilence')}{' '}
                <strong className="font-bold text-carbon-90">{t('frontdoor.run.distinction')}</strong>.{' '}
                {t('frontdoor.run.noneRead')}{' '}
                <Link to="/live" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                  {t('frontdoor.run.noneLiveLink')}
                </Link>{' '}
                {t('frontdoor.run.noneFor')}{' '}
                <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                  {t('frontdoor.run.noneStatusLink')}
                </Link>{' '}
                {t('frontdoor.run.noneTail')}
              </p>
            </div>
          )}

          <nav
            aria-label={t('frontdoor.run.alertNav')}
            className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-carbon-10 pt-3"
          >
            <Link to="/alerts" className="text-xs font-bold text-nasa-blue-shade underline underline-offset-2">
              {t('frontdoor.strip.allAlerts')}
            </Link>
            <Link to="/status" className="text-xs font-bold text-nasa-blue-shade underline underline-offset-2">
              {t('frontdoor.strip.whyHeld')}
            </Link>
          </nav>
        </div>

        {failed && (
          <p className="border-l-2 border-nasa-orange bg-white p-3 text-xs leading-relaxed text-carbon-70">
            {t('frontdoor.run.failed')}
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
            {t('frontdoor.faq.h2')}
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
        <Eyebrow>{t('frontdoor.attribution.eyebrow')}</Eyebrow>
        <h2 id="attribution-heading" className="mt-3 text-lg font-bold text-carbon-90">
          {t('frontdoor.attribution.h2')}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-carbon-70">
          {t('frontdoor.attribution.body', {
            author: attribution.author.name,
            role: attribution.author.role,
            work: attribution.work.name,
            type: attribution.work.type,
            department: attribution.department.name,
            university: attribution.department.university,
            supervisor: attribution.supervisor.name,
            supervisorRole: attribution.supervisor.role,
            coSupervision: attribution.coSupervisor?.role ? t('frontdoor.attribution.coSupervised') : '',
          })}{' '}
          <a
            href={attribution.author.orcidUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-nasa-blue-shade underline underline-offset-2"
          >
            {t('frontdoor.attribution.orcid', { id: attribution.author.orcid })}
          </a>
        </p>
        {/* The citation is a literal string the repository publishes in three places
            (JSON-LD, CITATION.cff, this block). It is deliberately not translated and is
            marked `translate="no"` so a browser's own translation does not either: a
            citation a reader cannot paste back into a reference manager is not a citation. */}
        <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-carbon-60">
          {t('frontdoor.attribution.citationLabel')}
        </p>
        <p
          lang="en"
          translate="no"
          className="mt-1 max-w-3xl border-l-2 border-carbon-20 bg-carbon-05 p-3 font-mono text-[11px] leading-relaxed text-carbon-70"
        >
          {attribution.work.citationText}
        </p>
        <nav aria-label={t('frontdoor.attribution.links')} className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {[
            { label: t('frontdoor.attribution.repository'), href: attribution.work.repository },
            { label: t('frontdoor.attribution.institution'), href: attribution.department.url },
            { label: t('frontdoor.attribution.supervisor'), href: attribution.supervisor.url },
            ...(attribution.coSupervisor?.url
              ? [{ label: t('frontdoor.attribution.coSupervisor'), href: attribution.coSupervisor.url }]
              : []),
          ].map((link) => (
            <ExternalOrInternalLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>
      </section>
    </motion.div>
  );
};

export default FrontDoor;
