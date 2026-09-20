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
  <p className="font-mono text-xs font-bold uppercase tracking-[0.025em] text-carbon-60">{children}</p>
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
      className="border border-carbon-20 bg-white p-4 lg:p-6"
      data-testid="front-door-run-visual"
    >
      <figcaption id="front-door-run-visual-caption">
        <Eyebrow>{t('frontdoor.runVisual.eyebrow')}</Eyebrow>
      </figcaption>

      {loading && <p className="mt-3 text-sm text-carbon-60">{t('frontdoor.runVisual.reading')}</p>}

      {!loading && !freshness && (
        <p className="mt-3 text-sm leading-relaxed text-carbon-70">
          {t('frontdoor.runVisual.unreadable')}{' '}
          <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
            {t('frontdoor.runVisual.statusPage')}
          </Link>
        </p>
      )}

      {freshness && (
        <div className="mt-4 space-y-5">
          {/* ── coverage of the last run ─────────────────────────────────── */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-bold text-carbon-90">{t('frontdoor.runVisual.coverage')}</p>
              <p className="font-mono text-sm text-carbon-90">
                {covered != null && expected != null ? (
                  <>
                    {formatNumber(covered)} / {formatNumber(expected)}
                    {pct != null && <span className="text-carbon-60"> ({formatNumber(pct)}%)</span>}
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
            {/* The bar is aria-hidden: the value beside it is the accessible text, so a
                screen reader gets the number rather than a nameless rectangle. */}
            <div aria-hidden="true" className="mt-2 h-2 w-full bg-carbon-10">
              <div
                className={`h-2 ${coverage?.status === 'complete' ? 'bg-nasa-green' : 'bg-nasa-orange'}`}
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-xs leading-relaxed text-carbon-60">
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
            <p className="text-xs font-bold text-carbon-90">{t('frontdoor.runVisual.outcome')}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-carbon-70">
              {published == null
                ? t('frontdoor.runVisual.outcomeUnknown')
                : published > 0
                  ? t('frontdoor.runVisual.publishedSome', { count: formatNumber(published) })
                  : t('frontdoor.runVisual.publishedNone', {
                      withheld: withheld != null ? formatNumber(withheld) : '—',
                    })}
            </p>
          </div>

          {/* ── the artifacts this deployment ships, and how old they are ─── */}
          <div className="border-t border-carbon-10 pt-4">
            <p className="text-xs font-bold text-carbon-90">{t('frontdoor.runVisual.artifacts')}</p>
            <ul className="mt-2 space-y-1.5">
              {freshness.sources.map((source) => (
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
          </div>

          {/* ── the run's own honesty notes, verbatim ────────────────────── */}
          {honesty.length > 0 && (
            <div className="border-t border-carbon-10 pt-4">
              <p className="text-xs font-bold text-carbon-90">{t('frontdoor.runVisual.honesty')}</p>
              <ul className="mt-2 space-y-1.5">
                {honesty.slice(0, 3).map((note) => (
                  <li key={note} className="flex min-w-0 gap-2 text-xs leading-[1.62] text-carbon-70">
                    <span aria-hidden="true" className="mt-[6px] h-[5px] w-[5px] shrink-0 bg-nasa-orange" />
                    <span className="min-w-0 break-words">{note}</span>
                  </li>
                ))}
              </ul>
              {honesty.length > 3 && (
                <p className="mt-2 font-mono text-xs text-carbon-60">
                  {t('frontdoor.runVisual.moreHonesty', { total: formatNumber(honesty.length) })}{' '}
                  <Link to="/status" className="font-bold text-nasa-blue-shade underline underline-offset-2">
                    {t('frontdoor.runVisual.statusPage')}
                  </Link>
                </p>
              )}
            </div>
          )}

          <p className="border-t border-carbon-10 pt-3 font-mono text-xs leading-relaxed text-carbon-60">
            {t('frontdoor.runVisual.provenance')} · built {freshness.built_at ?? 'timestamp not reported'}
          </p>
        </div>
      )}
    </figure>
  );
};

export default RunVisual;
