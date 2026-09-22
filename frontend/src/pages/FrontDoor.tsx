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
import { useReducedMotion } from 'framer-motion';
import { Interactive } from '../components/interactive/Interactive';
import { useWebFrame, interpolate, Easing } from '../lib/motion-interpolate';

import MaterialIcon from '../components/MaterialIcon';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import LiveStatusStrip from '../components/frontdoor/LiveStatusStrip';
import RunVisual from '../components/frontdoor/RunVisual';
import HeroCinematicBackground from '../components/HeroCinematicBackground';
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
  retry: () => void;
}

/**
 * One fetch per artifact, no retries, no polling. A front door is not a dashboard; it
 * states what the deployment currently ships and links to `/status` for the detail. A
 * failure here is rendered as a failure, because an unread artifact is a fact too.
 * A retry is exposed so the error banner can recover without a full page reload
 * (finding #2 — error recovery).
 */
function useLiveFacts(): LiveFacts {
  const [freshness, setFreshness] = useState<FreshnessArtifact | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardFacts>({ episodes: null, generatedAt: null });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const retry = () => {
    setFailed(false);
    setLoading(true);
    setNonce((n) => n + 1);
  };

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
  }, [nonce]);

  return { freshness, scorecard, loading, failed, retry };
}

/* ─────────────────────────────── presentation ──────────────────────────────── */

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-mono text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">{children}</p>
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
/**
 * One figure in the trust strip.
 * Capability figures (hazards/districts) use white at 32px; meta figures
 * (horizons/episodes) use a muted tint at 28px so the strip has a scan
 * hierarchy and does not mis-signify as four equal CTAs (audit #5).
 */
const Figure: React.FC<{ value: string; label: string; tone?: 'default' | 'muted' }> = ({ value, label, tone = 'default' }) => (
  <div className={`border p-4 ${tone === 'muted' ? 'bg-carbon-05 border-carbon-20' : 'bg-white border-carbon-20'}`}>
    <p className={`font-mono font-light leading-none tabular-nums ${tone === 'muted' ? 'text-[28px] text-carbon-80' : 'text-[32px] text-carbon-90'}`}>{value}</p>
    <p className="mt-2 text-xs font-bold leading-snug text-carbon-90">{label}</p>
  </div>
);

const SectionBody: React.FC<{ section: Section }> = ({ section }) => {
  const { t } = useI18n();
  return (
    <>
      {(section.paragraphs ?? []).map((paragraph, index) => (
        <p key={index} className="min-w-0 break-words text-base leading-[1.62] text-carbon-70">
          {paragraph}
        </p>
      ))}
      {(section.bullets ?? []).length > 0 && (
        <ul className="space-y-2">
          {(section.bullets ?? []).map((bullet, index) => (
            <li key={index} className="flex min-w-0 gap-2 text-base leading-[1.62] text-carbon-70">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 bg-nasa-blue" />
              <span className="min-w-0 break-words">{bullet}</span>
            </li>
          ))}
        </ul>
      )}
      {section.table && (
        <div className="w-full min-w-0 overflow-x-auto border border-carbon-20">
          <table className="w-full border-collapse text-left text-xs">
            {section.table.caption && (
              <caption className="bg-carbon-05 px-3 py-2 text-left text-xs text-carbon-60">
                {section.table.caption}
              </caption>
            )}
            <thead>
              <tr className="border-b border-carbon-20 bg-carbon-05">
                {section.table.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-carbon-60"
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
          className="border-l-2 border-nasa-orange bg-white p-4 text-base leading-[1.62] text-carbon-80"
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
    'inline-flex min-h-[44px] items-center gap-1 text-base font-bold text-nasa-blue-shade underline decoration-carbon-30 underline-offset-4 hover:decoration-nasa-blue-shade';
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
  const { freshness, scorecard, loading, failed, retry: retryLiveFacts } = useLiveFacts();
  const [heroPaused, setHeroPaused] = useState(false);
  const { alerts, assessed, counts, notPublished, generatedAt, loading: alertsLoading, error, refresh: refreshAlerts } = useAlertsData();
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

  const reduceMotion = useReducedMotion();
  const frame = useWebFrame(30);

  return (
    <Interactive.Div
      name="FrontDoor page — editorial front door"
      style={{
        width: '100%',
        opacity: reduceMotion
          ? 1
          : interpolate(frame, [0, 8], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
      }}
      className="w-full"
    >
      {/* ── Hero: NASA-Inspired Global Observatory with Dynamic Video Background ── */}
      <header className="relative w-full overflow-hidden bg-black text-white min-h-[600px] lg:min-h-screen flex items-center -mt-14 sm:-mt-16 pt-[100px] pb-12 sm:pb-16 shadow-2xl">
        {/* Remotion-Inspired 5-Layer Cinematic Motion Background (BgMesh, Video, HUD, Grade, Grain & Vignette) */}
        <HeroCinematicBackground paused={heroPaused} />
        {/* Pause control — keyboard-reachable, respects reduced-motion (audit #1) */}
        <button
          type="button"
          onClick={() => setHeroPaused((v) => !v)}
          aria-pressed={heroPaused}
          aria-label={heroPaused ? t('frontdoor.hero.resumeMotion') : t('frontdoor.hero.pauseMotion')}
          className="absolute bottom-4 right-4 z-10 inline-flex min-h-[44px] items-center gap-1.5 bg-black/60 px-3 py-2 text-xs font-semibold text-white border border-white/20 backdrop-blur-sm hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        >
          <MaterialIcon name={heroPaused ? 'play_arrow' : 'pause'} className="text-sm" />
          <span>{heroPaused ? t('frontdoor.hero.resumeMotion') : t('frontdoor.hero.pauseMotion')}</span>
        </button>

        <div className="relative z-10 w-full max-w-[1200px] mx-auto px-4 xl:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3 text-white/80">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.025em] text-white/80">
              {localised.label ?? 'Overview'} · HazardNet ·{' '}
              {content.updated
                ? t('frontdoor.hero.reviewed', { date: content.updated })
                : t('frontdoor.hero.reviewedUnknown')}
            </p>
            {/* The switch lives on the front door because the front door is bilingual */}
            <div className="bg-black/40 backdrop-blur-sm p-1 border border-white/20" style={{ backdropFilter: 'blur(var(--hero-glass-blur))', WebkitBackdropFilter: 'blur(var(--hero-glass-blur))' }}>
              <LanguageToggle variant="switch" tone="hds" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-12">
            <div className="min-w-0 rounded-sm border border-white/15 bg-gradient-to-b from-black/55 to-black/35 p-4 backdrop-blur-sm sm:p-5" style={{ backdropFilter: 'blur(var(--hero-glass-blur))', WebkitBackdropFilter: 'blur(var(--hero-glass-blur))' }}>
              <h1 className="max-w-3xl text-balance text-[28px] font-bold leading-[1.1] tracking-tight text-white sm:text-[32px] md:text-5xl md:leading-[1.06] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {localised.h1 ?? localised.title}
              </h1>
              {language === 'bn' && (
                <p role="status" aria-live="polite" className="mt-3 inline-flex items-center gap-1.5 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 border border-amber-300/80">
                  <MaterialIcon name="translate" className="text-xs" />
                  {t('frontdoor.bengaliDraft')}
                </p>
              )}
              {localised.standfirst && (
                <p className="mt-5 max-w-2xl text-base leading-[1.62] text-white/90 md:text-lg md:leading-[1.5] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {localised.standfirst}
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-2 sm:gap-3">
                <Link
                  to="/live"
                  className="inline-flex min-h-[44px] items-center gap-2 bg-nasa-red-shade px-6 py-3 text-base font-semibold text-white hover:bg-nasa-red tracking-[0.01em] touch-manipulation shadow-lg transition-transform duration-150 active:scale-95"
                >
                  <MaterialIcon name="public" className="text-base" />
                  {t('frontdoor.hero.ctaMap')}
                </Link>
                <Link
                  to="/methodology"
                  className="inline-flex min-h-[44px] items-center gap-2 border-2 border-white/80 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 touch-manipulation backdrop-blur-sm transition-colors duration-150"
                >
                  {t('frontdoor.hero.ctaMethodology')}
                </Link>
                <Link
                  to="/model-performance"
                  className="inline-flex min-h-[44px] items-center gap-2 border-2 border-white/70 px-6 py-3 text-base font-semibold text-white hover:border-white hover:bg-white/10 touch-manipulation backdrop-blur-sm transition-colors duration-150"
                >
                  {t('frontdoor.hero.ctaScorecard')}
                </Link>
              </div>

              <p className="mt-6 max-w-2xl border-t border-white/20 pt-4 text-xs leading-[1.62] text-white/75">
                {t('frontdoor.hero.authority')}{' '}
                <Link to="/live" className="font-bold text-white underline underline-offset-2 hover:text-white/90">
                  {t('frontdoor.hero.authorityMap')}
                </Link>
              </p>
            </div>

            {/* The hero visual card. Solid White background with Carbon-90 text for clean paper-like readability */}
            <div className="relative z-10 w-full text-carbon-90 bg-white shadow-2xl overflow-hidden rounded-sm">
              <RunVisual freshness={freshness} loading={loading} published={published} withheld={withheld} />
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content Container: Live status strip, Outlook, and Methodology ── */}
      <div className="mx-auto w-full max-w-[1200px] px-4 xl:px-8 space-y-8 lg:space-y-12 mt-8 lg:mt-12">

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
        onRetry={refreshAlerts}
      />

      {/* ── Trust strip: every figure carries the artifact it was read from ── */}
      <section aria-labelledby="trust-heading" className="space-y-3">
          <h2 id="trust-heading" className="text-[22px] font-bold tracking-tight text-carbon-90">
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
            value="7 & 15 days"
            label={t('frontdoor.covers.horizons')}
            tone="muted"
          />
          <Figure
            value={scorecard.episodes != null ? formatNumber(scorecard.episodes) : '—'}
            label={t('frontdoor.covers.episodes')}
            tone="muted"
          />
        </div>
        <p className="text-sm leading-[1.62] text-carbon-70">
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
          <p className="font-mono text-xs uppercase tracking-wider text-carbon-60">{t('frontdoor.run.aside')}</p>
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
                  <p className="mt-1 font-mono text-xs text-carbon-60">
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
          <div role="alert" aria-live="polite" className="border-l-2 border-nasa-orange bg-white p-4 space-y-3">
            <p className="text-sm leading-[1.62] text-carbon-70">{t('frontdoor.run.failed')}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={retryLiveFacts}
                className="inline-flex min-h-[44px] items-center gap-1.5 bg-nasa-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nasa-blue-shade focus-visible:outline focus-visible:outline-2 focus-visible:outline-nasa-blue focus-visible:outline-offset-2"
              >
                <MaterialIcon name="refresh" className="text-base" />
                {t('common.retry')}
              </button>
              <Link to="/status" className="inline-flex min-h-[44px] items-center gap-1.5 border border-carbon-20 bg-white px-4 py-2 text-sm font-semibold text-carbon-80 hover:bg-carbon-05">
                {t('frontdoor.covers.statusLink')}
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── On this page — anchor nav for the 7 editorial sections (audit #7: recognition/efficiency) ── */}
      {sections.length > 1 && (
        <nav aria-label={t('frontdoor.toc')} className="border border-carbon-20 bg-carbon-05 p-4">
          <p className="font-mono text-xs font-bold uppercase tracking-wide text-carbon-60">{t('frontdoor.toc')}</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={`toc-${index}`}>
                <a href={`#section-${index}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-nasa-blue-shade underline underline-offset-4 hover:decoration-nasa-blue-shade">
                  {section.h2 ?? `${t('frontdoor.tocSection')} ${index + 1}`}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* ── The editorial half, from site-routes.json ─────────────────────── */}
      {sections.map((section, index) => (
        <section
          key={section.h2 ?? index}
          aria-labelledby={section.h2 ? `section-${index}` : undefined}
          className="space-y-4 border-t border-carbon-20 pt-6"
        >
          {section.h2 && (
            <h2 id={`section-${index}`} className="text-[22px] font-bold tracking-tight text-carbon-90 lg:text-2xl">
              {section.h2}
            </h2>
          )}
          <SectionBody section={section} />
        </section>
      ))}

      {/* ── Questions the front door should answer ────────────────────────── */}
      {faqs.length > 0 && (
        <section aria-labelledby="faq-heading" className="space-y-3 border-t border-carbon-20 pt-6">
          <h2 id="faq-heading" className="text-[22px] font-bold tracking-tight text-carbon-90 lg:text-2xl">
            {t('frontdoor.faq.h2')}
          </h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-carbon-20 py-1 last:border-b-0">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-carbon-90 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-nasa-blue focus-visible:outline-offset-2">
                <span className="inline-flex items-start gap-2 py-2">
                  <MaterialIcon name="help" className="mt-0.5 text-base text-nasa-blue" />
                  <span>{faq.question}</span>
                </span>
                <MaterialIcon name="chevron_right" className="shrink-0 text-carbon-60 transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
              </summary>
              <p className="mt-1 pl-6 pr-4 pb-3 text-base leading-[1.62] text-carbon-70">{faq.answer}</p>
            </details>
          ))}
        </section>
      )}

      {/* ── Attribution: the exact block, from the committed data ─────────── */}
      <section aria-labelledby="attribution-heading" className="border border-carbon-20 bg-white p-6 lg:p-8">
        <Eyebrow>{t('frontdoor.attribution.eyebrow')}</Eyebrow>
        <h2 id="attribution-heading" className="mt-3 text-[22px] font-bold tracking-tight text-carbon-90">
          {t('frontdoor.attribution.h2')}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-[1.62] text-carbon-70">
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
        <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">
          {t('frontdoor.attribution.citationLabel')}
        </p>
        <p
          lang="en"
          translate="no"
          className="mt-1 max-w-3xl border-l-2 border-carbon-20 bg-carbon-05 p-3 font-mono text-xs leading-[1.62] text-carbon-70"
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
      </div>
    </Interactive.Div>
  );
};

export default FrontDoor;
