import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * `/status` — the page (Phase 7).
 *
 * The page-level rules, as opposed to the component's:
 *   - the long-form copy from `site-routes.json` renders whether or not the artifact loads;
 *   - the panel prints the artifact's own numbers and its `honesty` notes verbatim;
 *   - an unstamped model version is stated as unstamped, never as a version;
 *   - when the artifact cannot be loaded the page says so and prints no state badge at all,
 *     because "could not read" is not "fine".
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { StatusPage } from '../StatusPage';
import siteRoutes from '../../content/site-routes.json';

expect.extend(toHaveNoViolations);

const statusContent = siteRoutes.routes.find((route) => route.path === '/status');

/** The panel shows a loading heading, so wait for a figure only the artifact can produce. */
const waitForArtifact = async () => {
  await screen.findByText('45.7 h');
};

const artifact = (over: Record<string, unknown> = {}) => ({
  schema: 'hazardnet-freshness/v1',
  built_at: '2026-09-18T12:00:00.000Z',
  generated_by: 'scripts/build_freshness_artifact.mjs',
  what_this_is: 'A derived statement about the committed data artifacts this deployment ships.',
  overall: { state: 'failing', counts: { fresh: 1, failing: 1 }, not_fresh: ['site_probe'] },
  sources: [
    {
      id: 'forecast_snapshot',
      label: 'Website forecast snapshot (frontend/public/data/forecasts-latest.json)',
      artifact: 'frontend/public/data/forecasts-latest.json',
      state: 'fresh',
      reason: null,
      generated_at: '2026-09-17T16:11:19.128Z',
      prediction_date: '2026-09-16',
      age_hours: 45.7,
      slo_hours: 192,
      detail: { schema: 'hazardnet-forecast-snapshot/v2' },
    },
    {
      id: 'site_probe',
      label: 'Site-health probe (data/site-health/latest.json, every 30 min on the default branch)',
      artifact: 'data/site-health/latest.json',
      state: 'failing',
      reason: 'the last probe run reported 2 failed check(s): deep_links, security_headers',
      generated_at: null,
      age_hours: 0.5,
      slo_hours: 2,
      outcome: 'fail',
      detail: {
        passed: 4,
        failed: 2,
        run_url: 'https://github.com/myself-aas/HazardNet/actions/runs/1',
        checks: [
          { id: 'homepage', outcome: 'success', detail: null },
          { id: 'deep_links', outcome: 'failure', detail: 'HTTP 404 on /about' },
        ],
      },
    },
  ],
  coverage: {
    status: 'partial',
    produced_units: 74,
    districts_covered: 60,
    districts_expected: 64,
    missing_district_ids: null,
    horizons: ['7_days', '15_days'],
    units_per_horizon: { '7_days': 25, '15_days': 49 },
  },
  model: {
    model_version: null,
    stamped: false,
    tensor_build_id: null,
    pipeline_version: null,
    run_id: null,
    dataset_version: null,
    soil_channels_fabricated: false,
  },
  honesty: ['model_version is null: the ingest pipeline does not stamp one yet.'],
  ...over,
});

const stubFetch = (payload: unknown, ok = true, status = 200) => {
  const fetcher = jest.fn(async () => ({ ok, status, json: async () => payload }));
  global.fetch = fetcher as unknown as typeof fetch;
  return fetcher;
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <StatusPage />
    </MemoryRouter>,
  );

afterEach(() => {
  jest.restoreAllMocks();
});

describe('/status', () => {
  it('renders the long-form copy and the artifact it ships', async () => {
    stubFetch(artifact());
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: statusContent?.h1 })).toBeInTheDocument();
    await waitForArtifact();

    // The artifact's own numbers, not rounded for comfort.
    expect(screen.getByText('45.7 h')).toBeInTheDocument();
    expect(screen.getByText('192 h')).toBeInTheDocument();
    expect(screen.getByText('2026-09-16')).toBeInTheDocument();
    expect(screen.getByText(/60 of 64 districts/)).toBeInTheDocument();

    // The probe row carries the failing state and the reason, not just a colour.
    expect(screen.getAllByText('Checks failing').length).toBeGreaterThan(0);
    expect(screen.getByText(/deep_links, security_headers/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 404 on \/about/)).toBeInTheDocument();

    // The honesty notes are rendered verbatim.
    expect(screen.getByText(/model_version is null/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 sources within their SLO/)).toBeInTheDocument();
  });

  it('states an unstamped model version as unstamped and never invents one', async () => {
    stubFetch(artifact());
    renderPage();
    await waitForArtifact();
    expect(screen.getByText(/Not stamped\./)).toBeInTheDocument();
    expect(screen.getByText(/blocks\s+automatic publication of anything above/)).toBeInTheDocument();
    expect(screen.queryByText(/carry mn-/)).not.toBeInTheDocument();
  });

  it('prints a stamped version when the artifact carries one', async () => {
    stubFetch(artifact({ model: { ...artifact().model, model_version: 'mn-v1-abc', stamped: true } }));
    renderPage();
    await waitForArtifact();
    expect(screen.getByText(/mn-v1-abc/)).toBeInTheDocument();
  });

  it('says the artifact could not be loaded instead of showing an empty table', async () => {
    stubFetch({}, false, 404);
    renderPage();
    expect(await screen.findByText(/could not be loaded \(HTTP 404\)/)).toBeInTheDocument();
    expect(screen.queryByText('Within SLO')).not.toBeInTheDocument();
    expect(screen.queryByText('Checks failing')).not.toBeInTheDocument();
    // The prose half of the page is still there — the route never goes blank.
    expect(screen.getByRole('heading', { level: 1, name: statusContent?.h1 })).toBeInTheDocument();
  });

  it('is axe-clean with the artifact loaded', async () => {
    stubFetch(artifact());
    const { container } = renderPage();
    await waitForArtifact();
    const results = await axe(container, {
      rules: {
        // jsdom cannot resolve Tailwind's compiled colours; contrast is covered by the
        // manual checklist in docs/frontend/ACCESSIBILITY.md.
        'color-contrast': { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('is axe-clean when the artifact is unavailable', async () => {
    stubFetch({}, false, 500);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument());
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
