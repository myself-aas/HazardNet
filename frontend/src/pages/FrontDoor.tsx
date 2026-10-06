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
 *     the claim, the action and a hyperlink to the card that checks the claim. On 2026-10-06 the
 *     copy panel around all of it was removed as well, so the hero is a photograph with type on
 *     it: one heading, one tagline, one action, and the small print (see the hero block below for
 *     what the small print carries, and why it is still legible without a panel).
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
import { ButtonLink, Card, PillTabs, ProvenanceNote, SectionHeading, SeverityBadge } from '../components/apple/primitives';
import { useReveal } from '../components/apple/motion';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import LiveStatusStrip from '../components/frontdoor/LiveStatusStrip';
import CardStackTable from '../components/ui/CardStackTable';
import HeroCinematicBackground from '../components/HeroCinematicBackground';
import { localiseRoute, usePageSeo } from '../hooks/usePageSeo';
import { useAlertsData } from '../hooks/useAlertsData';
import { hazardIcon, useHazardLabel } from '../hooks/useHazardLabel';
import { useI18n } from '../hooks/useI18n';
import { FRESHNESS_URL, parseFreshness, type FreshnessArtifact } from '../lib/freshness';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import hazardMethodology from '../content/hazard-methodology.json';
import attribution from '../content/attribution.json';
import { listPublishedArticles, readingTimeMinutes, type BlogArticle } from '../lib/blogArticles';

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

/** Eyebrow: uppercase caption, weight over size, secondary label colour. */
const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="ap-caption-strong text-ap-link">{children}</p>
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
    className={`flex flex-col gap-2 p-5 transition-shadow duration-[var(--ap-duration-base)] ${
      tone === 'muted'
        ? 'bg-[color:var(--ap-bg-grouped)]'
        : 'bg-[color:var(--ap-bg-raised)] shadow-[var(--ap-elev-flat)]'
    }`}
  >
    {/* leading-[1.1], not leading-none: values like "7 & 15 days" wrap on narrow
        screens, and zero leading would collide the wrapped lines. */}
    <p
      className={`ap-display-md ap-mono ${
        tone === 'muted'
          ? 'text-[length:var(--ap-text-tagline)] text-[color:var(--ap-label-secondary)]'
          : 'text-[length:var(--ap-text-display-lg)] text-[color:var(--ap-label)]'
      }`}
    >
      {value}
    </p>
    <p className="ap-caption text-[color:var(--ap-label)]">{label}</p>
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
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 bg-primary" />
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
          className="border-l-2 border-severity-high bg-white p-4 text-base leading-[1.62] text-carbon-80"
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
    'inline-flex min-h-[44px] items-center gap-1 text-base font-bold text-ap-link underline decoration-carbon-30 underline-offset-4 hover:decoration-ap-primary';
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
  // The standfirst is 70 words. Since 2026-10-06 it is small print in the hero (the copy panel it
  // used to sit in is gone), clamped to two lines at every width with this disclosure — claim,
  // tagline and action come first, and the reader asks for the rest.
  const [standfirstOpen, setStandfirstOpen] = useState(false);
  // The evidence pointer under the action reads the same artifact the proof card does: one fact
  // from the run, pointing at the page that carries the card (/last-run).
  const coverageArtifact = freshness?.coverage ?? null;
  const { alerts, assessed, counts, notPublished, generatedAt, loading: alertsLoading, error, refresh: refreshAlerts } = useAlertsData();
  const hazardLabel = useHazardLabel();
  const { t, language, formatNumber, formatDate } = useI18n();
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
   * Newest blog posts for the front door. The blog lives in Firestore (same store the
   * /blogs page reads), so this is a second independent read with its own four states:
   * an error here hides only this section, never the published record above it.
   */
  const [blogPosts, setBlogPosts] = useState<BlogArticle[] | null>(null);
  const [blogsLoading, setBlogsLoading] = useState(true);
  const [blogsError, setBlogsError] = useState<string | null>(null);
  const [blogsReload, setBlogsReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBlogsLoading(true);
    setBlogsError(null);
    void listPublishedArticles().then((result) => {
      if (cancelled) return;
      setBlogsLoading(false);
      setBlogsError(result.error ? String(result.error) : null);
      setBlogPosts(result.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [blogsReload]);

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
          card checking the claim (/last-run — the card itself moved there from this hero).

          **2026-10-06, the copy panel is gone.** Every word in this hero used to sit inside a
          near-opaque panel (`bg-carbon-black/65` plus a `backdrop-filter`), so the photograph was
          legible only in the frame around a black box. The type is now on the photograph: the h1,
          one tagline, one primary action, and the small print that carries everything else (the
          standfirst, the three links, the run's own coverage pointer and the authority boundary).
          Nothing in this block paints a surface over the image. The only thing between the type
          and the photograph is the grade `HeroCinematicBackground` draws, which is why the copy is
          anchored to the lower band of its exposure curve (now the 0.80 to 0.96 stops) instead of
          being centred on the brightest pixels: 12px small print needs a dark ground to clear
          4.5:1, and that band is where the hero provides one.

          **2026-10-06, the band is thinner and lower.** The photograph is the reason this block
          exists, and it has to survive the type laid over it. So the copy is one notch quieter and
          a good deal shorter, with nothing dropped: the display line is set from the viewport on
          phones only (`.hero-frame .ap-hero` in `index.css` — the 56px token is sized for a
          document heading, which is four lines over a 390px frame), the tagline steps down one
          size, every piece of small print tightens its leading from 1.6 to 1.375, the standfirst
          clamps to one line instead of two, the three links keep one row, and the vertical rhythm
          between all of them is roughly two thirds of what it was. The two fine-print links are
          32px tall and the standfirst's disclosure is 36px, both clear of the 24px WCAG 2.5.8 AA
          floor; the icon-only pause control keeps its 44px.

          Type protection is the second line of defence and it is a token, not a literal: the h1
          wears `text-shadow-hero-display` and every piece of small print wears
          `text-shadow-hero-fine`, both published from `index.css`. Before 2026-10-06 these were
          seven hand-copied `drop-shadow-[…]` arbitrary values in two tiers, which is how the 999
          boundary sentence came to be fixed separately from the rest (audit H-P1-4) instead of
          wearing the same published tier. Nothing was deleted; the panel is the only thing that
          left. */}
      {/* `ap-on-dark` scopes the outline button's inversion to this hero, so the
          same primitive renders white-on-dark here and ink-on-light everywhere
          else without a second variant existing. */}
      {/* `pt-[calc(var(--navbar-height)+44px)]` instead of a hard 100px: the bar is 3.5rem plus
          `env(safe-area-inset-top)`, so a fixed number collided with it on notched phones. The
          variable now carries the inset, which makes this clearance correct on both. */}
      <header className="ap-on-dark hero-frame relative w-full overflow-hidden bg-carbon-90 text-carbon-05 min-h-[600px] lg:min-h-[100dvh] flex items-center -mt-14 sm:-mt-16 pt-[calc(var(--navbar-height)+20px)] sm:pt-[calc(var(--navbar-height)+44px)] pb-6 sm:pb-16 shadow-2xl">
        {/* Mesh → photograph → grade → vignette. */}
        <HeroCinematicBackground paused={heroPaused} />
        {/* Pause control — keyboard-reachable, respects reduced-motion (audit #1) */}
        <button
          type="button"
          onClick={() => setHeroPaused((v) => !v)}
          aria-pressed={heroPaused}
          aria-label={heroPaused ? t('frontdoor.hero.resumeMotion') : t('frontdoor.hero.pauseMotion')}
          className="absolute bottom-4 right-4 z-10 inline-flex min-h-[44px] items-center gap-1.5 bg-carbon-black/60 px-3 py-2 text-xs font-semibold text-white border border-white/20 backdrop-blur-sm hover:bg-carbon-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        >
          <MaterialIcon name={heroPaused ? 'play_arrow' : 'pause'} className="text-sm" />
          <span>{heroPaused ? t('frontdoor.hero.resumeMotion') : t('frontdoor.hero.pauseMotion')}</span>
        </button>

        {/* `self-stretch` + `justify-between`: the language switch keeps the top-right corner
            while the copy takes the lower band of the frame, the part the exposure curve already
            darkens. The copy is bottom-anchored, so shortening it is also what moves it DOWN -
            its top edge is the only edge with room to move, and every line taken out of the block
            is a line of photograph the reader gets back. The extra bottom padding below `sm` is
            clearance for the pause control, which is pinned to the same corner at that width. */}
        <div className="relative z-10 w-full max-w-[1200px] mx-auto px-4 xl:px-8 self-stretch flex flex-col justify-between">
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

          <div className="min-w-0 max-w-3xl pb-12 sm:pb-2">
            <h1 className="ap-hero text-balance text-white text-shadow-hero-display">
              {localised.h1 ?? localised.title}
            </h1>
            {language === 'bn' && (
              <p role="status" aria-live="polite" className="mt-3 inline-flex items-center gap-1.5 bg-warning-surface px-2 py-1 text-xs font-bold text-carbon-90 border border-warning-border">
                <MaterialIcon name="translate" className="text-xs" />
                {t('frontdoor.bengaliDraft')}
              </p>
            )}
            {/* The tagline. Short by construction: it names the product (7- and 15-day horizons),
                the coverage and the provenance rule, and it leaves the arithmetic to the trust
                strip below. Nothing claimed here is not stated at length further down the page. */}
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-snug text-white/95 text-shadow-hero-fine sm:text-base">
              {t('frontdoor.hero.slogan')}
            </p>

            {/* One primary action. "Open the map" is a NAVIGATION action, so it takes the Action
                Blue pill — not crimson. Under HDS 2.2 this button was `bg-primary-strong`
                (crimson), which spent the hazard colour on a browse action and trained the reader
                that crimson means "clickable". On a warning service that is a safety bug, not a
                style preference: the crimson has to still mean something when the district under
                it is under warning.
                Three equal full-width buttons on a phone is three primaries, which reads as none;
                the other destinations are in the links row below, and the scorecard has a whole
                section under this hero that argues for it. */}
            <div className="mt-4 sm:mt-5">
              <ButtonLink href="/live" intent="primary" size="lg" className="w-full sm:w-auto">
                <MaterialIcon name="public" className="text-base" />
                {t('frontdoor.hero.ctaMap')}
              </ButtonLink>
            </div>

            {/* Small print, first block: what this is. The standfirst is 70 words of method at
                12px, so it is clamped to ONE line here (two until 2026-10-06) and expanded in
                place on request; the seven sections under this hero make the same argument at
                length, which is what makes a one-line clamp honest rather than a truncation. The
                control is 36px: a text disclosure in a fine-print band, clear of the 24px WCAG
                2.5.8 AA floor, and small enough not to push the photograph up the frame. */}
            {localised.standfirst && (
              <>
                <p
                  id="front-door-standfirst"
                  className={`mt-3 max-w-2xl text-ap-fine leading-snug text-white/80 text-shadow-hero-fine ${
                    standfirstOpen ? '' : 'line-clamp-1'
                  }`}
                >
                  {localised.standfirst}
                </p>
                <button
                  type="button"
                  onClick={() => setStandfirstOpen((v) => !v)}
                  aria-expanded={standfirstOpen}
                  aria-controls="front-door-standfirst"
                  className="mt-0.5 inline-flex min-h-[36px] items-center text-ap-fine font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
                >
                  {standfirstOpen ? t('frontdoor.hero.readLess') : t('frontdoor.hero.readMore')}
                </button>
              </>
            )}

            {/* Small print, second block: how to check the claim. A list, not a `<nav>` - the page
                keeps its one navigation landmark (the table of contents) - and one row, so the
                three destinations cost a line rather than a button each. The last entry is the
                run's own coverage sentence, read from the same artifact the /last-run card reads,
                with the links wording kept as the fallback when that artifact is unreadable. */}
            <ul className="mt-1.5 flex flex-wrap gap-x-4 text-ap-fine text-white/90">
              <li>
                <Link
                  to="/methodology"
                  className="inline-flex min-h-[32px] items-center font-bold text-white underline decoration-white/40 underline-offset-4 text-shadow-hero-fine hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
                >
                  {t('frontdoor.hero.ctaMethodology')}
                </Link>
              </li>
              <li>
                <Link
                  to="/model-performance"
                  className="inline-flex min-h-[32px] items-center font-bold text-white underline decoration-white/40 underline-offset-4 text-shadow-hero-fine hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
                >
                  {t('frontdoor.hero.ctaScorecard')}
                </Link>
              </li>
              <li>
                <Link
                  to="/last-run"
                  className="inline-flex min-h-[32px] items-center font-bold text-white underline decoration-white/40 underline-offset-4 text-shadow-hero-fine hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
                >
                  {coverageArtifact?.districts_covered != null && coverageArtifact?.districts_expected
                    ? t('frontdoor.hero.evidencePointer', {
                        covered: formatNumber(coverageArtifact.districts_covered),
                        expected: formatNumber(coverageArtifact.districts_expected),
                        published:
                          published != null
                            ? t('frontdoor.hero.evidencePointerAlerts', { count: formatNumber(published) })
                            : t('frontdoor.hero.evidencePointerNoAlerts'),
                      })
                    : t('frontdoor.hero.viewLastRun')}
                </Link>
              </li>
            </ul>

            {/* The boundary sentence, last and smallest: 12px `text-white/75`, no rule above it
                (a hairline over a photograph is decoration), and a drop shadow so the one
                sentence that must not be missed is legible over the brightest frame. */}
            <p className="mt-1 max-w-3xl text-ap-fine leading-snug text-white/80 text-shadow-hero-fine">
              {t('frontdoor.hero.authority')}{' '}
              <Link to="/live" className="font-bold text-white underline underline-offset-2 hover:text-white/90">
                {t('frontdoor.hero.authorityMap')}
              </Link>
            </p>
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
          <h2 id="trust-heading" className="text-ap-tagline font-bold tracking-tight text-carbon-90">
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
          <Link to="/status" className="font-bold text-ap-link underline underline-offset-2">
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
                <li key={alert.id} className="border-b border-carbon-20 pb-3 md:border-b-0 md:pb-0">
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
                      className="min-w-0 break-words text-sm font-bold text-ap-link underline underline-offset-2"
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
              {error && <p className="text-ap-link">{t('frontdoor.run.errorPrefix', { error })}</p>}
              <p>
                {t('frontdoor.run.noneSilence')}{' '}
                <strong className="font-bold text-carbon-90">{t('frontdoor.run.distinction')}</strong>.{' '}
                {t('frontdoor.run.noneRead')}{' '}
                <Link to="/live" className="font-bold text-ap-link underline underline-offset-2">
                  {t('frontdoor.run.noneLiveLink')}
                </Link>{' '}
                {t('frontdoor.run.noneFor')}{' '}
                <Link to="/status" className="font-bold text-ap-link underline underline-offset-2">
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
            className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-carbon-20 pt-3"
          >
            <li>
              <Link to="/alerts" className="text-xs font-bold text-ap-link underline underline-offset-2">
                {t('frontdoor.strip.allAlerts')}
              </Link>
            </li>
            <li>
              <Link to="/status" className="text-xs font-bold text-ap-link underline underline-offset-2">
                {t('frontdoor.strip.whyHeld')}
              </Link>
            </li>
          </ul>
        </div>

        {failed && (
          <div role="alert" aria-live="polite" className="border-l-2 border-severity-high bg-white p-4 space-y-3">
            <p className="text-sm leading-[1.62] text-carbon-70">{t('frontdoor.run.failed')}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={retryLiveFacts}
                className="inline-flex min-h-[44px] items-center gap-1.5 bg-primary px-4 py-2 text-sm font-semibold text-ap-action-fg hover:bg-primary-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2"
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

      {/* ── Products: the eight hazard classes and the two forecast horizons ── */}
      <section aria-labelledby="products-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="products-heading" className="text-ap-tagline font-bold tracking-tight text-carbon-90 lg:text-2xl">
            {t('frontdoor.products.h2')}
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-carbon-60">{t('frontdoor.products.aside')}</p>
        </div>

        <div>
          <Eyebrow>{t('frontdoor.products.hazardsEyebrow')}</Eyebrow>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(hazards as { slug: string; class: string; season: string }[]).map((hazard) => (
              <Link
                key={hazard.slug}
                to={`/hazards/${hazard.slug}`}
                className="group flex flex-col gap-1.5 border border-carbon-20 bg-white p-4 transition-colors hover:border-ap-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2"
              >
                <span className="flex items-center justify-between">
                  <MaterialIcon name={hazardIcon(hazard.class)} className="text-xl text-ap-link" />
                  <MaterialIcon name="arrow_forward" className="text-sm text-carbon-60 transition-colors group-hover:text-ap-link" />
                </span>
                <span className="text-sm font-bold text-carbon-90">{hazard.class}</span>
                <span className="text-xs leading-relaxed text-carbon-60">{hazard.season}</span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-sm leading-[1.62] text-carbon-70">{t('frontdoor.products.hazardsNote')}</p>
        </div>

        <div>
          <Eyebrow>{t('frontdoor.products.horizonsEyebrow')}</Eyebrow>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link
              to="/docs/forecasts"
              className="group flex items-start gap-3 border border-carbon-20 bg-white p-4 transition-colors hover:border-ap-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2"
            >
              <MaterialIcon name="date_range" className="mt-0.5 text-xl text-ap-link" />
              <span className="space-y-1">
                <span className="block text-sm font-bold text-carbon-90">{t('frontdoor.products.horizon7')}</span>
                <span className="block text-xs leading-relaxed text-carbon-60">{t('frontdoor.products.horizon7desc')}</span>
              </span>
            </Link>
            <Link
              to="/docs/forecasts"
              className="group flex items-start gap-3 border border-carbon-20 bg-white p-4 transition-colors hover:border-ap-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2"
            >
              <MaterialIcon name="calendar_month" className="mt-0.5 text-xl text-ap-link" />
              <span className="space-y-1">
                <span className="block text-sm font-bold text-carbon-90">{t('frontdoor.products.horizon15')}</span>
                <span className="block text-xs leading-relaxed text-carbon-60">{t('frontdoor.products.horizon15desc')}</span>
              </span>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/hazards" className="inline-flex min-h-[44px] items-center gap-1.5 border border-carbon-20 bg-white px-4 py-2 text-sm font-semibold text-carbon-80 hover:bg-carbon-05">
            {t('frontdoor.products.methodologyLink')}
          </Link>
          <Link to="/docs/forecasts" className="inline-flex min-h-[44px] items-center gap-1.5 border border-carbon-20 bg-white px-4 py-2 text-sm font-semibold text-carbon-80 hover:bg-carbon-05">
            {t('frontdoor.products.forecastDocs')}
          </Link>
        </div>
      </section>

      {/* ── On this page — anchor nav for the 7 editorial sections (audit #7: recognition/efficiency) ── */}
      {sections.length > 1 && (
        <nav aria-label={t('frontdoor.toc')} className="border border-carbon-20 bg-carbon-05 p-4">
          <p className="font-mono text-xs font-bold uppercase tracking-wide text-carbon-60">{t('frontdoor.toc')}</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={`toc-${index}`}>
                <a href={`#section-${index}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-ap-link underline underline-offset-4 hover:decoration-ap-primary">
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
            <h2 id={`section-${index}`} className="text-ap-tagline font-bold tracking-tight text-carbon-90 lg:text-2xl">
              {section.h2}
            </h2>
          )}
          <SectionBody section={section} />
        </section>
      ))}

      {/* ── Newest from the blog: freshness the published record cannot show ── */}
      <section aria-labelledby="blogs-heading" className="space-y-3 border-t border-carbon-20 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="blogs-heading" className="text-ap-tagline font-bold tracking-tight text-carbon-90 lg:text-2xl">
            {t('frontdoor.blogs.h2')}
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-carbon-60">{t('frontdoor.blogs.aside')}</p>
        </div>

        {blogsLoading && <p className="text-sm text-carbon-60">{t('frontdoor.blogs.loading')}</p>}

        {!blogsLoading && blogsError && (
          <div className="flex flex-wrap items-center gap-3 border border-carbon-20 bg-white p-4 text-sm text-carbon-70">
            <span>{t('frontdoor.blogs.error', { error: blogsError })}</span>
            <button
              type="button"
              onClick={() => setBlogsReload((n) => n + 1)}
              className="inline-flex min-h-[44px] items-center gap-1.5 border border-carbon-20 bg-carbon-05 px-3 py-1.5 text-xs font-bold text-carbon-80 hover:bg-carbon-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2"
            >
              <MaterialIcon name="refresh" className="text-sm" />
              {t('frontdoor.blogs.retry')}
            </button>
          </div>
        )}

        {!blogsLoading && !blogsError && blogPosts !== null && blogPosts.length === 0 && (
          <p className="text-sm text-carbon-60">{t('frontdoor.blogs.empty')}</p>
        )}

        {!blogsLoading && !blogsError && blogPosts !== null && blogPosts.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {blogPosts.slice(0, 4).map((article, index) => (
              <li key={article.id}>
                <Link
                  to={`/blogs/${encodeURIComponent(article.slug)}`}
                  className="flex h-full flex-col gap-2 border border-carbon-20 bg-white p-4 transition-colors hover:border-ap-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="border border-carbon-20 bg-carbon-05 px-2 py-0.5 text-xs font-semibold text-carbon-70">
                      {article.category || t('frontdoor.blogs.aside')}
                    </span>
                    {index === 0 && (
                      <span className="border border-ap-primary/20 bg-ap-primary/10 px-2 py-0.5 text-xs font-bold text-ap-link">
                        {t('frontdoor.blogs.newest')}
                      </span>
                    )}
                  </span>
                  <span className="text-base font-bold leading-snug text-carbon-90">{article.title}</span>
                  <span className="line-clamp-2 text-sm leading-[1.62] text-carbon-60">{article.excerpt}</span>
                  <span className="mt-auto pt-1 font-mono text-xs text-carbon-60">
                    {formatDate(article.publishedAt ?? article.createdAt)}
                    {` · ${t('frontdoor.blogs.minRead', { min: readingTimeMinutes(article.contentHtml) })}`}
                    {article.authorName ? ` · ${article.authorName}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link to="/blogs" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-ap-link underline underline-offset-4 hover:decoration-ap-primary">
          {t('frontdoor.blogs.allPosts')}
          <MaterialIcon name="arrow_forward" className="text-sm" />
        </Link>
      </section>

      {/* ── Questions the front door should answer ────────────────────────── */}
      {faqs.length > 0 && (
        <section aria-labelledby="faq-heading" className="space-y-3 border-t border-carbon-20 pt-6">
          <h2 id="faq-heading" className="text-ap-tagline font-bold tracking-tight text-carbon-90 lg:text-2xl">
            {t('frontdoor.faq.h2')}
          </h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-carbon-20 py-1 last:border-b-0">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-carbon-90 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2">
                <span className="inline-flex items-start gap-2 py-2">
                  <MaterialIcon name="help" className="mt-0.5 text-base text-ap-link" />
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
        <h2 id="attribution-heading" className="mt-3 text-ap-tagline font-bold tracking-tight text-carbon-90">
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
            className="font-bold text-ap-link underline underline-offset-2"
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
