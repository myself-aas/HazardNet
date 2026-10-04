/**
 * `/` — the editorial front door.
 *
 * The GIS console moved to `/live` (see `App.tsx`), and the root became the page a
 * journalist, an agronomist or a reviewer lands on first: what this platform is for, what
 * the last run actually produced, and where every number can be checked. `scripts/lib/public-text.mjs`
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
 *   * `/data/model-performance.json` — the validation scorecard's episode count and build
 *
 * Nothing here is estimated, rounded up, or filled in when an artifact is missing: a
 * missing value renders as an em dash or as the sentence that says it is missing, never as
 * a zero that reads like a real measurement. That rule is the reason this page exists.
 *
 * **The 2026-09-19 landing-page review.** A design review benchmarked this page against the
 * front doors of GFDRR, UNDRR and the Red Cross and asked for a photograph-led hero, a
 * district map and a live status strip. Two of those three are built here, one is refused,
 * and the reasoning is recorded in `scripts/lib/public-text.mjs` rather than left as a
 * reviewer's disappointment:
 *
 *   · The strip is built (`components/frontdoor/LiveStatusStrip.tsx`) from the alert
 *     artifact's own counts — including today's zero, which the review's worked example
 *     ("2 active alerts · 61 districts normal") would have invented.
 *   · The hero visual is built (`components/frontdoor/RunVisual.tsx`) as the last run's own
 *     coverage, outcome and artifact ages. There is still no photograph: none ships in this
 *     repository under a licence the project can stand behind, and a stock image of a flood
 *     would date the page to a disaster it is not describing. On 2026-10-05 the card moved out
 *     of the hero to a page of its own (`/last-run`, `pages/LastRunPage.tsx`); the hero keeps
 *     the claim, the action and a hyperlink to the card that checks the claim.
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
import { ExternalLink } from 'lucide-react';
import { Interactive } from '../components/interactive/Interactive';
import { useWebFrame, interpolate, Easing } from '../lib/motion-interpolate';

import MaterialIcon from '../components/MaterialIcon';
import { ButtonLink, Card, PillTabs, ProvenanceNote, SectionHeading, SeverityBadge } from '../components/meridian/primitives';
import { useReveal } from '../components/meridian/motion';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import LiveStatusStrip from '../components/frontdoor/LiveStatusStrip';
import CardStackTable from '../components/ui/CardStackTable';
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

/** Meridian eyebrow: uppercase caption, weight over size, secondary label colour. */
const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mrd-eyebrow">{children}</p>
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
  <div
    className={`flex flex-col gap-2 p-5 transition-shadow duration-[var(--mrd-duration-base)] ${
      tone === 'muted'
        ? 'bg-[color:var(--mrd-bg-grouped)]'
        : 'bg-[color:var(--mrd-bg-elevated)] shadow-[var(--mrd-shadow-card)]'
    }`}
  >
    {/* leading-[1.1], not leading-none: values like "7 & 15 days" wrap on narrow
        screens, and zero leading would collide the wrapped lines. */}
    <p
      className={`mrd-figure font-semibold leading-[1.1] ${
        tone === 'muted'
          ? 'text-[length:var(--mrd-text-display3)] text-[color:var(--mrd-label-secondary)]'
          : 'text-[length:var(--mrd-text-display2)] text-[color:var(--mrd-label)]'
      }`}
    >
      {value}
    </p>
    <p className="mrd-caption text-[color:var(--mrd-label)]">{label}</p>
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
        <CardStackTable
          columns={section.table.columns}
          rows={section.table.rows}
          caption={section.table.caption}
          className="border border-carbon-20 md:border-0"
        />
      )}
      {section.callout?.text && (
        <p
          role={section.callout.tone === 'warning' ? 'note' : undefined}
          className="border-l-2 border-nasa-orange bg-white p-4 text-base leading-[1.62] text-carbon-80"
        >
          {section.callout.text}
        </p>
      )}
      {/* A list, not a `<nav>`. These rows used to be five separate navigation landmarks (one
          per section that has links), each with a unique accessible name to satisfy
          `landmark-unique` - which fixes the axe rule and not the reading experience: VoiceOver's
          rotor listed nine navigation regions on one page, and TalkBack does not expose
          navigation regions at all, so the names were inert there. The links stay; the landmark
          count drops to the one that is genuinely a navigational aid, the table of contents. */}
      {(section.links ?? []).length > 0 && (
        <ul
          role="list"
          aria-label={section.h2 ? `${t('frontdoor.relatedPages')}: ${section.h2}` : t('frontdoor.relatedPages')}
          className="flex flex-wrap gap-x-5 gap-y-2 pt-1"
        >
          {(section.links ?? []).map((link) => (
            <li key={link.href}>
              <ExternalOrInternalLink href={link.href} label={link.label} />
            </li>
          ))}
        </ul>
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
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
  // The full standfirst is 70 words; below `sm` it is clamped to three lines with this control.
  const [standfirstOpen, setStandfirstOpen] = useState(false);
  // The phone-only evidence pointer under the CTA reads the same artifact the proof card does, so
  // the first viewport on a phone is claim -> action -> one fact from the run (see the hero comment).
  const coverageArtifact = freshness?.coverage ?? null;
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

  const reduceMotion = useReducedMotion();
  const frame = useWebFrame(30, 8);

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
      {/* ── Hero: one photograph, one claim, one action ──
          The backdrop was a five-layer motion build with a decorative telemetry HUD and a film
          grain; it is four layers now (see HeroCinematicBackground). Keeping the composition
          honest rather than busy is the whole job of this block: a claim (h1), the sentence that
          qualifies it, one primary action, and a hyperlink to the page that carries the artifact
          card checking the claim (/last-run — the card itself moved there from this hero). */}
      {/* `mrd-on-dark` scopes the outline button's inversion to this hero, so the
          same primitive renders white-on-dark here and ink-on-light everywhere
          else without a second variant existing. */}
      {/* `pt-[calc(var(--navbar-height)+44px)]` instead of a hard 100px: the bar is 3.5rem plus
          `env(safe-area-inset-top)`, so a fixed number collided with it on notched phones. The
          variable now carries the inset, which makes this clearance correct on both. */}
      <header className="mrd-on-dark relative w-full overflow-hidden bg-carbon-90 text-white min-h-[600px] lg:min-h-[100dvh] flex items-center -mt-14 sm:-mt-16 pt-[calc(var(--navbar-height)+20px)] sm:pt-[calc(var(--navbar-height)+44px)] pb-8 sm:pb-16 shadow-2xl">
        {/* Mesh → photograph → grade → vignette. */}
        <HeroCinematicBackground paused={heroPaused} />
        {/* Pause control — keyboard-reachable, respects reduced-motion (audit #1) */}
        <button
          type="button"
          onClick={() => setHeroPaused((v) => !v)}
          aria-pressed={heroPaused}
          aria-label={heroPaused ? t('frontdoor.hero.resumeMotion') : t('frontdoor.hero.pauseMotion')}
          className="absolute bottom-4 right-4 z-10 inline-flex min-h-[44px] items-center gap-1.5 bg-carbon-90/60 px-3 py-2 text-xs font-semibold text-white border border-white/20 backdrop-blur-sm hover:bg-carbon-90/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        >
          <MaterialIcon name={heroPaused ? 'play_arrow' : 'pause'} className="text-sm" />
          <span>{heroPaused ? t('frontdoor.hero.resumeMotion') : t('frontdoor.hero.pauseMotion')}</span>
        </button>

        <div className="relative z-10 w-full max-w-[1200px] mx-auto px-4 xl:px-8">
          {/* The masthead strip ("Overview · HazardNet · reviewed <date>") used to sit here. It
              was a middot row of the kind the design skill bans: a version-style eyebrow, half of
              it repeating the wordmark directly above a wordmark, and the only reader-facing fact
              in it - the review date - is already stated in the artifact it describes, where it
              carries its own provenance. The language switch, which is the one control that has to
              be on the front door, stays and right-aligns on its own. */}
          <div className="flex justify-end">
            {/* The switch carries its own surface (`tone="hds"` draws a bordered white chip), so
                the second glass frame that used to sit around it was a box inside a box. */}
            <LanguageToggle variant="switch" tone="hds" />
          </div>

          <div className="mt-4 grid grid-cols-1 items-center gap-6 sm:mt-6 sm:gap-8">
            {/* One flat scrim, not a two-stop gradient. The gradient existed to keep the
                authority paragraph (12px `text-white/75`) off the weak end of its own surface:
                at the old `to-black/35` the same pixel measured 2.45:1 over a light frame, at
                `to-black/60` 6.40:1. A single `bg-carbon-black/65` clears that everywhere on the
                card instead of only at the bottom of it, and `carbon-black` is pinned dark in
                both themes (it is a scrim, see dark.css §1) so this holds in dark mode too. */}
            <div className="min-w-0 rounded-sm border border-white/15 bg-carbon-black/65 p-4 sm:p-5" style={{ backdropFilter: 'blur(var(--hero-glass-blur))', WebkitBackdropFilter: 'blur(var(--hero-glass-blur))' }}>
              <h1 className="mrd-display2 max-w-3xl text-balance text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {localised.h1 ?? localised.title}
              </h1>
              {language === 'bn' && (
                <p role="status" aria-live="polite" className="mt-3 inline-flex items-center gap-1.5 bg-warning-surface px-2 py-1 text-xs font-bold text-carbon-90 border border-warning-border">
                  <MaterialIcon name="translate" className="text-xs" />
                  {t('frontdoor.bengaliDraft')}
                </p>
              )}
              {localised.standfirst && (
                <>
                  {/* The standfirst is 70 words - about eleven lines at this size on a 390px
                      phone, which was most of the viewport before the reader reached a button.
                      It is clamped below `sm` and expanded in place; the same argument is made
                      in full by the seven sections under this hero, so nothing is hidden that
                      the page does not say again. Two lines, not three: the third line cost 26px
                      of the first viewport, and the phone budget belongs to the action and the
                      evidence pointer (docs/audits/2026-10-03-landing-live-hero-audit.md, H-P1-3). */}
                  <p
                    id="front-door-standfirst"
                    className={`mt-5 max-w-2xl text-base leading-[1.62] text-white/90 md:text-lg md:leading-[1.5] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
                      standfirstOpen ? '' : 'line-clamp-2 sm:line-clamp-none'
                    }`}
                  >
                    {localised.standfirst}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStandfirstOpen((v) => !v)}
                    aria-expanded={standfirstOpen}
                    aria-controls="front-door-standfirst"
                    className="mt-1 inline-flex min-h-[44px] items-center text-xs font-bold text-white underline underline-offset-4 sm:hidden"
                  >
                    {standfirstOpen ? t('frontdoor.hero.readLess') : t('frontdoor.hero.readMore')}
                  </button>
                </>
              )}

              {/* Meridian dual-primary, applied. "Open the map" is a NAVIGATION
                  action, so it takes the ink pill — not crimson. Under HDS 2.2
                  this button was `bg-primary-strong` (crimson), which spent the
                  hazard colour on a browse action and trained the reader that
                  crimson means "clickable". On a warning service that is a
                  safety bug, not a style preference: the crimson has to still
                  mean something when the district under it is under warning.
                  The two secondary links stay outlined. */}
              {/* One primary action. Three equal full-width buttons on a phone is three
                  primaries, which reads as none; the other destinations stay here as text
                  links, and the scorecard has a whole section below that argues for it. The
                  run card used to sit beside this copy as the hero's second column; since
                  2026-10-05 it has a page of its own, and the hero reaches it as a link. */}
              <div className="mt-5 sm:mt-7">
                <ButtonLink href="/live" intent="ink" size="lg" className="w-full sm:w-auto">
                  <MaterialIcon name="public" className="text-base" />
                  {t('frontdoor.hero.ctaMap')}
                </ButtonLink>
                <div className="mt-2 flex flex-wrap gap-x-6">
                  <Link
                    to="/methodology"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center text-sm font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                  >
                    {t('frontdoor.hero.ctaMethodology')}
                  </Link>
                  <Link
                    to="/model-performance"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center text-sm font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                  >
                    {t('frontdoor.hero.ctaScorecard')}
                  </Link>
                  <Link
                    to="/last-run"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center text-sm font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                  >
                    {t('frontdoor.hero.viewLastRun')}
                  </Link>
                </div>
              </div>

              {/* The one evidence pointer is deliberately the last hero element on a phone. It
                  borrows the run card's own text (it is not a second copy) and links to the card's
                  page, so the hierarchy stands - claim, action, then the card that checks the
                  claim. The card moved to `/last-run` on 2026-10-05, so this anchor is now a
                  route link rather than an in-page fragment; on the wide layout the text link above
                  already reaches it and this line does not render.
                  docs/audits/2026-10-03-landing-live-hero-audit.md, H-P1-3. */}
              {coverageArtifact?.districts_covered != null && coverageArtifact?.districts_expected ? (
                <Link
                  to="/last-run"
                  className="mt-3 inline-flex min-h-[44px] min-w-[44px] items-center text-xs font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white sm:hidden"
                >
                  {t('frontdoor.hero.evidencePointer', {
                    covered: formatNumber(coverageArtifact.districts_covered),
                    expected: formatNumber(coverageArtifact.districts_expected),
                    published:
                      published != null
                        ? t('frontdoor.hero.evidencePointerAlerts', { count: formatNumber(published) })
                        : t('frontdoor.hero.evidencePointerNoAlerts'),
                  })}
                </Link>
              ) : null}

              <p className="mt-6 max-w-2xl border-t border-white/20 pt-4 text-xs leading-[1.62] text-white/75">
                {t('frontdoor.hero.authority')}{' '}
                <Link to="/live" className="font-bold text-white underline underline-offset-2 hover:text-white/90">
                  {t('frontdoor.hero.authorityMap')}
                </Link>
              </p>

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

          {/* A list, not a `<nav>`: this page already carries its one navigation landmark (the
              "On this page" table of contents). Extra named navigation regions do not help a
              reader - VoiceOver's rotor fills with near-identical "Navigation" entries and
              TalkBack does not expose the role at all, so the aria-label is inert there - and
              the links are just as reachable as a labelled list. */}
          <ul
            aria-label={t('frontdoor.run.alertNav')}
            className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-carbon-10 pt-3"
          >
            <li>
              <Link to="/alerts" className="text-xs font-bold text-nasa-blue-shade underline underline-offset-2">
                {t('frontdoor.strip.allAlerts')}
              </Link>
            </li>
            <li>
              <Link to="/status" className="text-xs font-bold text-nasa-blue-shade underline underline-offset-2">
                {t('frontdoor.strip.whyHeld')}
              </Link>
            </li>
          </ul>
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
        {/* Same rule as the alert row above: a labelled list, not a fourth navigation landmark. */}
        <ul aria-label={t('frontdoor.attribution.links')} className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {[
            { label: t('frontdoor.attribution.repository'), href: attribution.work.repository },
            { label: t('frontdoor.attribution.institution'), href: attribution.department.url },
            { label: t('frontdoor.attribution.supervisor'), href: attribution.supervisor.url },
            ...(attribution.coSupervisor?.url
              ? [{ label: t('frontdoor.attribution.coSupervisor'), href: attribution.coSupervisor.url }]
              : []),
          ].map((link) => (
            <li key={link.href}>
              <ExternalOrInternalLink href={link.href} label={link.label} />
            </li>
          ))}
        </ul>
      </section>
      </div>
    </Interactive.Div>
  );
};

export default FrontDoor;
