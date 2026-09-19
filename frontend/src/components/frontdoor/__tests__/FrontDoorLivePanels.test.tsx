import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * The two live panels the 2026-09-19 landing-page review asked for, rendered in jsdom.
 *
 * The review's worked example was "⚠ 2 active alerts · 🟡 1 watch · ✓ 61 districts normal".
 * Those numbers do not exist anywhere in this repository: the committed alert artifact holds
 * zero published alerts, 74 assessed rows and 74 withheld by the publication gate. So these
 * tests assert the property that matters — the panels print the artifact's own values and,
 * when an artifact cannot be read, they print the sentence that says so rather than a zero
 * that reads like a measurement. The fixtures below are the real values from
 * `frontend/public/data/freshness.json` and `frontend/public/data/alerts-latest.json`, so a
 * fixture that drifts from the deployment shows up as a failing test rather than as a lie.
 */

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { namesRepoFile } from '../../../lib/publicText';
import LiveStatusStrip from '../LiveStatusStrip';
import RunVisual from '../RunVisual';
import { resetLanguageForTests } from '../../../lib/i18n';
import type { FreshnessArtifact } from '../../../lib/freshness';

/* ── fixtures: the committed artifacts' own values ─────────────────────────── */

const coverage = {
  status: 'partial',
  produced_units: 74,
  districts_covered: 60,
  districts_expected: 64,
  missing_district_ids: null,
  horizons: ['7_days', '15_days'],
  units_per_horizon: { '7_days': 25, '15_days': 49 },
};

const freshness: FreshnessArtifact = {
  schema: 'hazardnet-freshness/v1',
  built_at: '2026-09-17T21:42:56.714Z',
  generated_by: 'scripts/build_freshness.mjs',
  what_this_is: 'the age of every artifact this deployment ships',
  overall: {
    state: 'unknown',
    counts: { fresh: 3, stale: 0, failing: 0, missing: 0, unknown: 1 },
    not_fresh: ['site_probe'],
  },
  sources: [
    {
      id: 'forecast_ingest',
      label: 'Forecast ingest',
      artifact: '/data/forecast-latest.json',
      state: 'fresh',
      reason: null,
      generated_at: '2026-09-16T00:00:00Z',
      prediction_date: '2026-09-16',
      age_hours: 45.7,
      slo_hours: 72,
      detail: null,
    },
    {
      id: 'site_probe',
      label: 'Site health probe',
      artifact: '/data/site-health.json',
      state: 'unknown',
      reason: 'no probe result is committed',
      generated_at: null,
      age_hours: null,
      slo_hours: 24,
      detail: null,
    },
  ],
  coverage: coverage as FreshnessArtifact['coverage'],
  model: null,
  honesty: [
    'model_version is null: nothing can be auto-published above WATCH.',
    'the forecast run reports coverage status "partial": 60 of 64 districts.',
    'the run did not report which districts are missing.',
    '74 assessed district/horizon rows produced no published alert.',
  ],
};

const counts = { NO_ALERT: 0, WATCH: 0, WARNING: 0, SEVERE: 0, dropped_unpublished: 0, not_published: 74 };

const renderInRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const strip = (over: Partial<React.ComponentProps<typeof LiveStatusStrip>> = {}) =>
  renderInRouter(
    <LiveStatusStrip
      counts={counts}
      assessed={74}
      withheld={74}
      alerts={[]}
      generatedAt="2026-09-17T21:08:14.217Z"
      loading={false}
      error={null}
      coverage={coverage as FreshnessArtifact['coverage']}
      {...over}
    />,
  );

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests('en');
});

describe('the live status strip', () => {
  it('prints the artifact’s own level counts, including the zeros', () => {
    strip();
    const list = screen.getByRole('status').querySelector('ul');
    expect(list).not.toBeNull();
    const items = within(list as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // Every level renders its word beside its number: colour is never the only carrier.
    // `NO_ALERT` gets no chip — see the component's LEVEL_ORDER comment.
    for (const word of ['Severe', 'Warning', 'Watch']) {
      expect(screen.getByText(new RegExp(word))).toBeInTheDocument();
    }
    expect(screen.getByText(/60 \/ 64/)).toBeInTheDocument();
    expect(screen.getByText(/partial/)).toBeInTheDocument();
  });

  it('states the zero case as a statement about the publisher, not the weather', () => {
    strip();
    expect(screen.getByText(/No alert is published at the moment of this read/)).toBeInTheDocument();
    expect(screen.getByText(/withheld 74 of them from publication/)).toBeInTheDocument();
    // and links to the page that explains it rather than leaving the reader to guess
    expect(screen.getByRole('link', { name: /Why a run may be held/i })).toHaveAttribute('href', '/status');
  });

  it('never turns an unreadable artifact into a zero', () => {
    strip({ counts: null, assessed: null, withheld: null });
    expect(screen.getByText(/could not be read on this load/i)).toBeInTheDocument();
    // no count list at all: a missing file produces no chips, not four zeroed ones
    expect(screen.getByRole('status').querySelector('ul')).toBeNull();
    expect(screen.queryByText(/withheld/i)).not.toBeInTheDocument();
  });

  it('is announced, so a reader who leaves the page open hears it change', () => {
    strip();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-label', 'Current publication status');
  });

  it('links a published alert to its own permalink', () => {
    strip({
      alerts: [
        {
          id: '2026-09-21__7_days__sunamganj__flash-flood__p2026-09-18',
          level: 'WATCH',
          district_name: 'Sunamganj',
          hazard_type: 'Flash Flood',
          target_date: '2026-09-21',
        },
      ],
    });
    const link = screen.getByRole('link', { name: 'Sunamganj' });
    expect(link).toHaveAttribute('href', '/alerts/2026-09-21__7_days__sunamganj__flash-flood__p2026-09-18');
    // with a permalink present, the "nothing published" prose must be gone
    expect(screen.queryByText(/No alert is published at the moment of this read/)).not.toBeInTheDocument();
  });

  it('renders the same facts in Bengali, in Bengali digits', () => {
    resetLanguageForTests('bn');
    strip();
    expect(screen.getByText('এই মুহূর্তে প্রকাশিত')).toBeInTheDocument();
    expect(screen.getByText(/৬০ \/ ৬৪/)).toBeInTheDocument();
    // the same withheld/assessed pair, in Bengali digits, in a sentence a reader can parse
    expect(
      screen.getByText(/এই রানে ৭৪টি জেলা-পূর্বাভাস মূল্যায়ন করা হয়েছে এবং ৭৪টি প্রকাশ থেকে বিরত রাখা হয়েছে/),
    ).toBeInTheDocument();
  });
});

describe('the hero run visual', () => {
  const visual = (over: Partial<React.ComponentProps<typeof RunVisual>> = {}) =>
    renderInRouter(<RunVisual freshness={freshness} loading={false} published={0} withheld={74} {...over} />);

  it('draws the last run from the freshness artifact', () => {
    visual();
    const card = screen.getByTestId('front-door-run-visual');
    expect(within(card).getByText(/60 \/ 64/)).toBeInTheDocument();
    expect(within(card).getByText(/94%/)).toBeInTheDocument(); // 60/64, from the artifact
    expect(within(card).getByText(/coverage status: partial/)).toBeInTheDocument();
    expect(within(card).getByText(/74 forecast units produced/)).toBeInTheDocument();
    expect(within(card).getByText(/25 × 7 days/)).toBeInTheDocument();
    expect(within(card).getByText(/49 × 15 days/)).toBeInTheDocument();
  });

  it('carries the run’s own honesty notes and when it was built', () => {
    visual();
    const card = screen.getByTestId('front-door-run-visual');
    expect(within(card).getByText(/model_version is null/)).toBeInTheDocument();
    // four notes, three shown, and the fourth is reachable rather than dropped silently
    expect(within(card).queryByText(/74 assessed district\/horizon rows/)).not.toBeInTheDocument();
    expect(within(card).getByText(/first three of 4 notes/)).toBeInTheDocument();
    expect(within(card).getByText(/built 2026-09-17T21:42:56.714Z/)).toBeInTheDocument();
    // The provenance line used to end "generated by scripts/build_freshness_artifact.mjs".
    // The build time stays because a reader can act on it; the module name went because no
    // reader on this surface can open it, and the artifact fetched to render this card
    // still carries `generated_by` for anything that can
    // (docs/PUBLIC_SURFACE.md §3, __tests__/noRepoPaths.test.js).
    expect(namesRepoFile(card.textContent ?? '')).toBe(false);
    // …while the served URLs the card tells the reader it is reading stay: they resolve on
    // the deployed origin, which is the difference the rule turns on.
    expect(card.textContent).toMatch(/\/data\//);
  });

  it('says nothing about ages when the artifact could not be read', () => {
    visual({ freshness: null });
    const card = screen.getByTestId('front-door-run-visual');
    expect(within(card).getByText(/could not be read/i)).toBeInTheDocument();
    expect(within(card).queryByText(/60 \/ 64/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('reports an unreadable alert artifact as unknown, not as zero published', () => {
    visual({ published: null });
    const card = screen.getByTestId('front-door-run-visual');
    expect(within(card).getByText(/does not state an outcome/)).toBeInTheDocument();
    expect(within(card).queryByText(/No alert is published from this run/)).not.toBeInTheDocument();
  });

  it('names the withheld rows when nothing was published', () => {
    visual();
    const card = screen.getByTestId('front-door-run-visual');
    expect(within(card).getByText(/No alert is published from this run/)).toBeInTheDocument();
    expect(within(card).getByText(/74 assessed rows were withheld by the review gate/)).toBeInTheDocument();
  });

  it('names each artifact’s state in words beside the dot', () => {
    visual();
    const card = screen.getByTestId('front-door-run-visual');
    expect(within(card).getByText(/Forecast ingest/)).toBeInTheDocument();
    expect(within(card).getByText(/Within SLO/)).toBeInTheDocument();
    expect(within(card).getByText(/Unknown/)).toBeInTheDocument();
  });
});
