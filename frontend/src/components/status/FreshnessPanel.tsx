/**
 * The freshness panel (Phase 7) — the data half of `/status`.
 *
 * It renders `frontend/public/data/freshness.json`, the artifact the build ships, and it
 * keeps three rules visible on screen:
 *
 *   * the artifact's own `built_at` is printed, with the sentence that says the page is a
 *     statement about committed files and not a live probe;
 *   * every source carries its state, age, SLO and the artifact path it came from, so a
 *     reader can check the claim against the file;
 *   * the artifact's `honesty` notes are rendered verbatim — they are generated from the
 *     inputs, so they disappear when the condition does.
 *
 * The copy is English, like the other long-form pages (`/methodology`, `/model`); the
 * bilingual surface is the alert UI a duty officer reads. See `docs/ops/STATUS_PAGE.md`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import {
  type FreshnessArtifact,
  describeAge,
  describeSlo,
  describeStamp,
  loadFreshness,
  stateLabel,
  stateTone,
} from '../../lib/freshness';

import { publishableEntries } from '../../lib/publicText';

interface Loaded {
  artifact: FreshnessArtifact | null;
  error: string | null;
  fetchedAt: string;
  loading: boolean;
}

const StateBadge: React.FC<{ state: FreshnessArtifact['overall']['state'] }> = ({ state }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${stateTone(state)}`}
  >
    {stateLabel(state)}
  </span>
);

/**
 * Detail rows for the probe. A value that names a location in this repository is dropped
 * here rather than printed: the artifact keeps it, because a script auditing this page
 * needs it, and the surface does not show it, because a visitor cannot open it. The rule
 * lives in one place (`lib/publicText`) so the panel and the test that guards the built
 * pages cannot disagree about it.
 */
const detailEntries = (detail: Record<string, unknown> | null): [string, string][] =>
  publishableEntries(detail, ['checks']);

export const FreshnessPanel: React.FC = () => {
  const [state, setState] = useState<Loaded>({
    artifact: null,
    error: null,
    fetchedAt: '',
    loading: true,
  });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState((previous) => ({ ...previous, loading: true }));
      const result = await loadFreshness();
      if (!cancelled) {
        setState({
          artifact: result.artifact,
          error: result.error,
          fetchedAt: result.fetchedAt,
          loading: false,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const { artifact, error, loading } = state;

  if (loading && !artifact) {
    return (
      <section
        aria-labelledby="freshness-heading"
        className="border border-carbon-20 bg-white p-6 md:p-7"
      >
        <h2 id="freshness-heading" className="text-lg font-bold text-carbon-90">
          Right now
        </h2>
        <p className="mt-2 text-base leading-[1.62] text-carbon-60" role="status">
          Loading the freshness artifact this deployment ships…
        </p>
      </section>
    );
  }

  if (!artifact) {
    return (
      <section
        aria-labelledby="freshness-heading"
        className="border border-amber-300 bg-amber-50 p-6 md:p-7"
      >
        <h2 id="freshness-heading" className="text-lg font-bold text-amber-950">
          Right now
        </h2>
        <p className="mt-2 text-base leading-[1.62] text-amber-950" role="status">
          The freshness artifact could not be loaded ({error ?? 'unknown error'}), so this page
          cannot state the age of the data this deployment serves. That is not a statement that
          the data is fresh, and it is not a statement that it is stale — it is unknown. The
          scheduled <em>Site Health Probe</em> workflow reports the live surface.
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1 rounded-sm border border-amber-400 bg-white px-3 py-1.5 text-base font-semibold text-amber-900 hover:bg-amber-100 touch-manipulation"
        >
          <MaterialIcon name="refresh" className="text-sm" /> Retry
        </button>
      </section>
    );
  }

  const { overall, sources, coverage, model } = artifact;
  const withinSlo = overall.counts.fresh ?? 0;
  const probe = sources.find((source) => source.id === 'site_probe');
  const probeChecks = probe?.detail && Array.isArray(probe.detail.checks) ? (probe.detail.checks as {
    id: string;
    outcome: string;
    detail: string | null;
  }[]) : [];

  return (
    <section
      aria-labelledby="freshness-heading"
      className="space-y-5 border border-carbon-20 bg-white p-6 md:p-7"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="freshness-heading" className="text-lg font-bold text-carbon-90">
            Right now
          </h2>
          <StateBadge state={overall.state} />
        </div>
        <p className="text-base leading-[1.62] text-carbon-60">
          {artifact.what_this_is ??
            'A derived statement about the committed data artifacts this deployment ships.'}
        </p>
        <p className="text-xs text-carbon-60">
          Derived <time dateTime={artifact.built_at ?? undefined}>{describeStamp(artifact.built_at)}</time>.{' '}
          {withinSlo} of {sources.length} sources within their SLO.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs md:text-sm">
          <caption className="sr-only">
            Each data source this deployment ships, its state, its age and the SLO it is measured
            against.
          </caption>
          <thead>
            <tr className="border-b border-carbon-20 text-xs uppercase tracking-wide text-carbon-60">
              <th scope="col" className="py-2 pr-3 font-bold">Source</th>
              <th scope="col" className="py-2 pr-3 font-bold">State</th>
              <th scope="col" className="py-2 pr-3 font-bold">Age</th>
              <th scope="col" className="py-2 pr-3 font-bold">SLO</th>
              <th scope="col" className="py-2 font-bold">Latest data</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-carbon-10 align-top">
                <th scope="row" className="py-2 pr-3 font-semibold text-carbon-80">
                  {source.label}
                  {source.reason && (
                    <span className="mt-1 block font-normal text-base leading-[1.62] text-carbon-60">
                      {source.reason}
                    </span>
                  )}
                </th>
                <td className="py-2 pr-3">
                  <StateBadge state={source.state} />
                </td>
                <td className="py-2 pr-3 tabular-nums text-carbon-70">{describeAge(source.age_hours)}</td>
                <td className="py-2 pr-3 tabular-nums text-carbon-70">{describeSlo(source.slo_hours)}</td>
                <td className="py-2 text-carbon-70">
                  <time dateTime={source.prediction_date ?? source.generated_at ?? undefined}>
                    {source.prediction_date ?? describeStamp(source.generated_at)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {coverage && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-carbon-90">Coverage of the current run</h3>
          <p className="text-base leading-[1.62] text-carbon-60">
            {coverage.districts_covered ?? 'unknown'} of {coverage.districts_expected ?? 'unknown'} districts
            have a row for at least one horizon, from {coverage.produced_units ?? 'unknown'} produced
            district/horizon units — coverage status <strong>{coverage.status ?? 'unreported'}</strong>.
          </p>
          {coverage.horizons && coverage.units_per_horizon && (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse text-left text-xs md:text-sm">
              <caption className="sr-only">Units produced per forecast horizon</caption>
              <thead>
                <tr className="border-b border-carbon-20 text-xs uppercase tracking-wide text-carbon-60">
                  <th scope="col" className="py-1.5 pr-3 font-bold">Horizon</th>
                  <th scope="col" className="py-1.5 font-bold">Units</th>
                </tr>
              </thead>
              <tbody>
                {coverage.horizons.map((horizon) => (
                  <tr key={horizon} className="border-b border-carbon-10">
                    <th scope="row" className="py-1.5 pr-3 font-semibold text-carbon-80">{horizon}</th>
                    <td className="py-1.5 tabular-nums text-carbon-70">
                      {coverage.units_per_horizon?.[horizon] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {model && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-carbon-90">Model provenance</h3>
          <p className="text-base leading-[1.62] text-carbon-60">
            {model.stamped ? (
              <>
                This deployment&apos;s rows carry <code>{model.model_version}</code>
                {model.run_id ? <> from run <code>{model.run_id}</code></> : null}.
              </>
            ) : (
              <>
                <strong>Not stamped.</strong> The ingest pipeline does not yet record a{' '}
                <code>model_version</code> on the rows it produces, so no number on this site claims
                one, and §1.6 of the product spec blocks automatic publication of anything above{' '}
                <code>WATCH</code> until one exists.
              </>
            )}
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-carbon-60 sm:grid-cols-2">
            <div>
              <dt className="font-bold">Tensor build</dt>
              <dd><code>{model.tensor_build_id ?? '—'}</code></dd>
            </div>
            <div>
              <dt className="font-bold">Dataset version</dt>
              <dd><code>{model.dataset_version ?? '—'}</code></dd>
            </div>
            <div>
              <dt className="font-bold">Pipeline version</dt>
              <dd><code>{model.pipeline_version ?? '—'}</code></dd>
            </div>
            <div>
              <dt className="font-bold">Soil channels fabricated</dt>
              <dd>
                {model.soil_channels_fabricated === null
                  ? '—'
                  : model.soil_channels_fabricated
                    ? 'yes — flagged on the snapshot'
                    : 'no'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-carbon-90">Last site-health probe</h3>
        {probeChecks.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs md:text-sm">
            <caption className="sr-only">
              Checks performed by the last published site-health probe run
            </caption>
            <thead>
              <tr className="border-b border-carbon-20 text-xs uppercase tracking-wide text-carbon-60">
                <th scope="col" className="py-1.5 pr-3 font-bold">Check</th>
                <th scope="col" className="py-1.5 pr-3 font-bold">Outcome</th>
                <th scope="col" className="py-1.5 font-bold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {probeChecks.map((check) => (
                <tr key={check.id} className="border-b border-carbon-10">
                  <th scope="row" className="py-1.5 pr-3 font-semibold text-carbon-80">{check.id}</th>
                  <td className="py-1.5 pr-3">
                    {check.outcome === 'success' ? '✅ pass' : `❌ ${check.outcome}`}
                  </td>
                  <td className="py-1.5 text-carbon-60">{check.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="text-base leading-[1.62] text-carbon-60">
            No probe result has been published to this checkout, so the live-surface checks are{' '}
            <strong>unknown here</strong> — not passing. The probe runs every 30 minutes on the
            default branch and commits its result; until that commit lands, this page cannot state
            whether the production surface satisfies its own checks.
          </p>
        )}
        {probe && detailEntries(probe.detail).length > 0 && (
          <p className="text-xs text-carbon-60">
            {detailEntries(probe.detail)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')}
          </p>
        )}
      </div>

      {artifact.honesty.length > 0 && (
        <div role="note" className="border border-carbon-30 bg-carbon-05 p-4">
          <h3 className="text-sm font-bold text-carbon-90">What this page is not saying</h3>
          <ul className="mt-2 space-y-1.5">
            {artifact.honesty.map((note, index) => (
              <li key={index} className="text-base leading-[1.62] text-carbon-60">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default FreshnessPanel;
