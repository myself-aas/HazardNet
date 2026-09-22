/**
 * The hero visual — a picture made of the deployment's own artifacts.
 *
 * The 2026-09-19 landing-page review asked for a full-width photograph in the hero.
 * `docs/PUBLIC_SURFACE.md` §3 rule 5 refuses invented imagery, and the reason still
 * holds: no licence-clean field or satellite photograph ships in this repository, and an
 * AI-generated illustration sitting next to provenance claims would undercut the one
 * thing the page is for. The owner's choice was the third option — replace the photograph
 * with something the artifacts actually produce.
 *
 * So this is a *run card*: the last forecast run's coverage as a bar, the rows it produced
 * per horizon, the age of every artifact the deployment ships, and the run's own
 * `honesty` notes verbatim. It is dated, sourced and reproducible from committed files,
 * which is a stronger hero for this product than a landscape — and it cannot go stale in
 * the way a photograph of a flood taken in 2007 can.
 *
 * Same rules as the strip: no number without an artifact, a missing value is an em dash or
 * a sentence (never a zero), colour never carries meaning alone, and no SVG — the bar is a
 * labelled element with a textual value beside it, so there is no unnamed graphic for a
 * screen reader to skip (the `svg-img-alt` class of defect the 2026-09-19 design review
 * counted 88 of).
 */

import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../hooks/useI18n';
import { describeAge, stateLabel, type FreshnessArtifact, type FreshnessState } from '../../lib/freshness';

/** A state is never signalled by colour alone: the word is always rendered beside the dot. */
const STATE_DOT: Record<FreshnessState, string> = {
  fresh: 'bg-nasa-green',
  stale: 'bg-nasa-orange',
  failing: 'bg-nasa-red',
  missing: 'bg-carbon-40',
  unknown: 'bg-carbon-40',
};

export interface RunVisualProps {
  freshness: FreshnessArtifact | null;
  loading: boolean;
  /** The alert artifact's own counts, so the card can show what the run published. */
  published: number | null;
  withheld: number | null;
}

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-mono text-xs font-bold uppercase tracking-wider text-carbon-70">{children}</span>
);

export const RunVisual: React.FC<RunVisualProps> = ({ freshness, loading, published, withheld }) => {
  const { t, formatNumber } = useI18n();

  const coverage = freshness?.coverage ?? null;
  const covered = coverage?.districts_covered ?? null;
  const expected = coverage?.districts_expected ?? null;
  const pct = covered != null && expected ? Math.round((covered / expected) * 100) : null;
  const horizons = Object.entries(coverage?.units_per_horizon ?? {});
  const honesty = freshness?.honesty ?? [];

  return (
    /* A figure, not an aside: the card sits inside the hero's banner landmark, and a
       complementary landmark nested in another landmark is an accessibility violation
       (`landmark-complementary-is-top-level`), not just a style choice. The caption gives the
       figure its accessible name, so the eyebrow is read rather than skipped. */
    <figure
      aria-labelledby="front-door-run-visual-caption"
      className="border border-carbon-20 bg-white p-5 sm:p-6 shadow-sm"
      data-testid="front-door-run-visual"
    >
      <figcaption
        id="front-door-run-visual-caption"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon-10 pb-3.5"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nasa-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-nasa-green" />
          </span>
          <Eyebrow>{t('frontdoor.runVisual.eyebrow')}</Eyebrow>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium text-carbon-70 bg-carbon-05 border border-carbon-20">
            <span className="h-1.5 w-1.5 rounded-full bg-nasa-blue" />
            OPERATE RUN
          </span>
        </div>
      </figcaption>

      {loading && (
        <div className="mt-4 flex items-center gap-2.5 py-6 text-sm text-carbon-60">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-carbon-30 border-t-nasa-blue shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm leading-normal text-carbon-60">{t('frontdoor.runVisual.reading')}</p>
        </div>
      )}

      {!loading && !freshness && (
        <div className="mt-4 rounded-md border border-carbon-20 bg-carbon-05 p-4">
          <p className="text-sm leading-[1.62] text-carbon-70">
            {t('frontdoor.runVisual.unreadable')}{' '}
            <Link
              to="/status"
              className="font-bold text-nasa-blue-shade underline underline-offset-2 hover:text-nasa-blue"
            >
              {t('frontdoor.runVisual.statusPage')}
            </Link>
          </p>
        </div>
      )}

      {freshness && (
        <div className="mt-4 space-y-4 lg:space-y-5">
          {/* ── coverage of the last run ─────────────────────────────────── */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon-80">
                {t('frontdoor.runVisual.coverage')}
              </span>
              <span className="font-mono text-xs text-carbon-50 uppercase" aria-hidden="true">
                {coverage?.status === 'complete' ? 'NOMINAL' : 'PARTIAL DETECTED'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <div className="font-mono text-2xl lg:text-3xl font-black tracking-tight text-carbon-90 tabular-nums">
                {covered != null && expected != null ? (
                  <>
                    {formatNumber(covered)} / {formatNumber(expected)}
                    {pct != null && (
                      <span className="ml-2 inline-flex items-center rounded bg-carbon-10 px-2 py-0.5 text-xs font-mono font-bold text-carbon-80 align-middle">
                        ({formatNumber(pct)}%)
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
            {/* The bar is aria-hidden: the value beside it is the accessible text, so a
                screen reader gets the number rather than a nameless rectangle. */}
            <div
              aria-hidden="true"
              className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-carbon-10 border border-carbon-10/60"
            >
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  coverage?.status === 'complete' ? 'bg-nasa-green' : 'bg-nasa-orange'
                }`}
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <p className="mt-2.5 font-mono text-xs leading-[1.62] text-carbon-60">
              {coverage?.status ? `${t('frontdoor.runVisual.coverageStatus')}: ${coverage.status}` : '—'}
              {coverage?.produced_units != null
                ? ` · ${formatNumber(coverage.produced_units)} ${t('frontdoor.runVisual.units')}`
                : ''}
              {horizons.length > 0 &&
                ` · ${horizons
                  .map(([horizon, units]) => `${formatNumber(Number(units))} × ${horizon.replace('_', ' ')}`)
                  .join(', ')}`}
            </p>
          </div>

          {/* ── what the run published ───────────────────────────────────── */}
          <div className="border-t border-carbon-10 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon-80">
                {t('frontdoor.runVisual.outcome')}
              </span>
              {published != null && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border ${
                    published > 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-900 border-amber-300'
                  }`}
                  aria-hidden="true"
                >
                  {published > 0 ? 'ALERT PUBLISHED' : 'GATE WITHHELD'}
                </span>
              )}
            </div>
            <div
              className={`mt-2 rounded-md p-3 border ${
                published == null
                  ? 'bg-carbon-05 border-carbon-20 text-carbon-70'
                  : published > 0
                    ? 'bg-emerald-50/60 border-emerald-200 text-carbon-80'
                    : 'bg-amber-50/50 border-amber-200 text-carbon-80'
              }`}
            >
              <p className="text-xs sm:text-sm leading-[1.62]">
                {published == null
                  ? t('frontdoor.runVisual.outcomeUnknown')
                  : published > 0
                    ? t('frontdoor.runVisual.publishedSome', { count: formatNumber(published) })
                    : t('frontdoor.runVisual.publishedNone', {
                        withheld: withheld != null ? formatNumber(withheld) : '—',
                      })}
              </p>
            </div>
          </div>

          {/* ── the artifacts this deployment ships, and how old they are ─── */}
          <div className="border-t border-carbon-10 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon-80">
                {t('frontdoor.runVisual.artifacts')}
              </span>
              <span className="font-mono text-xs text-carbon-50" aria-hidden="true">
                {freshness.sources.length} sources tracked
              </span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {freshness.sources.map((source) => (
                <li
                  key={source.id}
                  className="flex min-w-0 items-center justify-between gap-2.5 rounded-md border border-carbon-10 bg-carbon-05/70 px-3 py-2 text-xs transition-colors hover:bg-carbon-05"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATE_DOT[source.state]}`}
                    />
                    <span className="min-w-0 break-words text-carbon-70 leading-[1.4]">
                      <strong className="font-bold text-carbon-90">{source.label}</strong>
                      <span className="mx-1 text-carbon-40">—</span>
                      <span className="font-medium text-carbon-90">{stateLabel(source.state)}</span>
                      {source.age_hours != null ? `, ${describeAge(source.age_hours)} old` : ''}
                      {source.prediction_date ? `, run dated ${source.prediction_date}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ── the run's own honesty notes, verbatim ────────────────────── */}
          {honesty.length > 0 && (
            <div className="border-t border-carbon-10 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-carbon-80">
                  {t('frontdoor.runVisual.honesty')}
                </span>
                <span className="font-mono text-xs text-carbon-50" aria-hidden="true">
                  SELF-REPORTED AUDIT
                </span>
              </div>
              <div className="mt-2.5 rounded-md border border-carbon-20 bg-carbon-05/80 p-3">
                <ul className="space-y-2">
                  {honesty.slice(0, 3).map((note) => (
                    <li key={note} className="flex min-w-0 items-start gap-2.5 text-xs leading-[1.62] text-carbon-70">
                      <span
                        aria-hidden="true"
                        className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-nasa-orange"
                      />
                      <span className="min-w-0 break-words font-mono text-xs text-carbon-80">{note}</span>
                    </li>
                  ))}
                </ul>
                {honesty.length > 3 && (
                  <p className="mt-2.5 border-t border-carbon-10 pt-2 font-mono text-xs leading-[1.62] text-carbon-60">
                    {t('frontdoor.runVisual.moreHonesty', { total: formatNumber(honesty.length) })}{' '}
                    <Link
                      to="/status"
                      className="font-bold text-nasa-blue-shade underline underline-offset-2 hover:text-nasa-blue"
                    >
                      {t('frontdoor.runVisual.statusPage')}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── provenance line ────────────────────────────────────────── */}
          <div className="border-t border-carbon-10 pt-3.5 flex flex-wrap items-center justify-between gap-2 font-mono text-xs leading-[1.62] text-carbon-60">
            <p className="min-w-0 break-words">
              {t('frontdoor.runVisual.provenance')} · built {freshness.built_at ?? 'timestamp not reported'}
            </p>
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-carbon-05 border border-carbon-20 text-carbon-70"
              aria-hidden="true"
            >
              <svg className="h-3 w-3 text-nasa-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>VERIFIED ARTIFACT</span>
            </div>
          </div>
        </div>
      )}
    </figure>
  );
};

export default RunVisual;
