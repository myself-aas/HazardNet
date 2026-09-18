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

interface Loaded {
  artifact: FreshnessArtifact | null;
  error: string | null;
  fetchedAt: string;
  loading: boolean;
}

const StateBadge: React.FC<{ state: FreshnessArtifact['overall']['state'] }> = ({ state }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${stateTone(state)}`}
  >
    {stateLabel(state)}
  </span>
);

const detailEntries = (detail: Record<string, unknown> | null): [string, string][] => {
  if (!detail) return [];
  return Object.entries(detail)
    .filter(([key, value]) => key !== 'checks' && (typeof value === 'string' || typeof value === 'number'))
    .map(([key, value]) => [key.replace(/_/g, ' '), String(value)]);
};

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
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs md:p-7"
      >
        <h2 id="freshness-heading" className="text-lg font-bold text-slate-900">
          Right now
        </h2>
        <p className="mt-2 text-xs text-slate-600 md:text-sm" role="status">
          Loading the freshness artifact this deployment ships…
        </p>
      </section>
    );
  }

  if (!artifact) {
    return (
      <section
        aria-labelledby="freshness-heading"
        className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-xs md:p-7"
      >
        <h2 id="freshness-heading" className="text-lg font-bold text-amber-950">
          Right now
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-amber-950 md:text-sm" role="status">
          The freshness artifact could not be loaded ({error ?? 'unknown error'}), so this page
          cannot state the age of the data this deployment serves. That is not a statement that
          the data is fresh, and it is not a statement that it is stale — it is unknown. The
          artifact is committed at <code>frontend/public/data/freshness.json</code>; the
          scheduled <em>Site Health Probe</em> workflow reports the live surface.
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
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
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs md:p-7"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="freshness-heading" className="text-lg font-bold text-slate-900">
            Right now
          </h2>
          <StateBadge state={overall.state} />
        </div>
        <p className="text-xs leading-relaxed text-slate-600 md:text-sm">
          {artifact.what_this_is ??
            'A derived statement about the committed data artifacts this deployment ships.'}
        </p>
        <p className="text-[11px] text-slate-500">
          Derived <time dateTime={artifact.built_at ?? undefined}>{describeStamp(artifact.built_at)}</time> by{' '}
          <code>{artifact.generated_by ?? 'unknown producer'}</code>.{' '}
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
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3 font-bold">Source</th>
              <th scope="col" className="py-2 pr-3 font-bold">State</th>
              <th scope="col" className="py-2 pr-3 font-bold">Age</th>
              <th scope="col" className="py-2 pr-3 font-bold">SLO</th>
              <th scope="col" className="py-2 font-bold">Latest data</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-slate-100 align-top">
                <th scope="row" className="py-2 pr-3 font-semibold text-slate-800">
                  {source.label}
                  {source.reason && (
                    <span className="mt-1 block font-normal text-[11px] leading-relaxed text-slate-500">
                      {source.reason}
                    </span>
                  )}
                  <span className="mt-1 block font-mono text-[10px] font-normal text-slate-400">
                    {source.artifact}
                  </span>
                </th>
                <td className="py-2 pr-3">
                  <StateBadge state={source.state} />
                </td>
                <td className="py-2 pr-3 tabular-nums text-slate-700">{describeAge(source.age_hours)}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-700">{describeSlo(source.slo_hours)}</td>
                <td className="py-2 text-slate-700">
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
          <h3 className="text-sm font-bold text-slate-900">Coverage of the current run</h3>
          <p className="text-xs leading-relaxed text-slate-600 md:text-sm">
            {coverage.districts_covered ?? 'unknown'} of {coverage.districts_expected ?? 'unknown'} districts
            have a row for at least one horizon, from {coverage.produced_units ?? 'unknown'} produced
            district/horizon units — coverage status <strong>{coverage.status ?? 'unreported'}</strong>.
          </p>
          {coverage.horizons && coverage.units_per_horizon && (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse text-left text-xs md:text-sm">
              <caption className="sr-only">Units produced per forecast horizon</caption>
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-1.5 pr-3 font-bold">Horizon</th>
                  <th scope="col" className="py-1.5 font-bold">Units</th>
                </tr>
              </thead>
              <tbody>
                {coverage.horizons.map((horizon) => (
                  <tr key={horizon} className="border-b border-slate-100">
                    <th scope="row" className="py-1.5 pr-3 font-semibold text-slate-800">{horizon}</th>
                    <td className="py-1.5 tabular-nums text-slate-700">
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
          <h3 className="text-sm font-bold text-slate-900">Model provenance</h3>
          <p className="text-xs leading-relaxed text-slate-600 md:text-sm">
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
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2">
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
        <h3 className="text-sm font-bold text-slate-900">Last site-health probe</h3>
        {probeChecks.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs md:text-sm">
            <caption className="sr-only">
              Checks performed by the last published site-health probe run
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-1.5 pr-3 font-bold">Check</th>
                <th scope="col" className="py-1.5 pr-3 font-bold">Outcome</th>
                <th scope="col" className="py-1.5 font-bold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {probeChecks.map((check) => (
                <tr key={check.id} className="border-b border-slate-100">
                  <th scope="row" className="py-1.5 pr-3 font-semibold text-slate-800">{check.id}</th>
                  <td className="py-1.5 pr-3">
                    {check.outcome === 'success' ? '✅ pass' : `❌ ${check.outcome}`}
                  </td>
                  <td className="py-1.5 text-slate-600">{check.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-600 md:text-sm">
            No probe result has been published to this checkout, so the live-surface checks are{' '}
            <strong>unknown here</strong> — not passing. The probe runs every 30 minutes on the
            default branch and commits its result; until that commit lands, this page cannot state
            whether the production surface satisfies its own checks.
          </p>
        )}
        {probe && detailEntries(probe.detail).length > 0 && (
          <p className="text-[11px] text-slate-500">
            {detailEntries(probe.detail)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')}
          </p>
        )}
      </div>

      {artifact.honesty.length > 0 && (
        <div role="note" className="rounded-xl border border-slate-300 bg-slate-50 p-4">
          <h3 className="text-sm font-bold text-slate-900">What this page is not saying</h3>
          <ul className="mt-2 space-y-1.5">
            {artifact.honesty.map((note, index) => (
              <li key={index} className="text-[11px] leading-relaxed text-slate-600">
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
