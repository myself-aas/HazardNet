import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * `/alerts` — the assembled page (Phase 5).
 *
 * The library and component suites cover the parts; this one covers the *page* rules
 * that only exist once they are wired together:
 *
 *   - the §1.7 disclaimer is on the page whatever the data source is;
 *   - the source banner tells the truth about live vs snapshot vs nothing;
 *   - an empty payload explains itself (assessed-but-blocked is not "all clear");
 *   - low-bandwidth mode lands the reader on the text table, not the card grid.
 *
 * `loadAlerts` is mocked at the lib boundary so the page is exercised without a network.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlertsPage } from '../AlertsPage';
import { loadAlerts } from '../../lib/alerts';
import { ALERT_DISCLAIMER } from '../../lib/legal';
import { resetLanguageForTests } from '../../lib/i18n';

jest.mock('../../lib/alerts', () => ({
  ...jest.requireActual('../../lib/alerts'),
  loadAlerts: jest.fn(),
}));

const loadAlertsMock = loadAlerts as jest.MockedFunction<typeof loadAlerts>;

const publishedAlert = {
  id: '2026-09-21__7_days__sunamganj__flash-flood__p2026-09-18',
  state: 'PUBLISHED' as const,
  level: 'WATCH' as const,
  district_id: 60,
  district_name: 'Sunamganj',
  division: 'Sylhet',
  horizon: '7_days',
  hazard_type: 'Flash Flood',
  target_date: '2026-09-21',
  prediction_date: '2026-09-18',
  lead_time_days: 3,
  severity_score: 0.9999,
  confidence: 0.9912,
  evidence: {
    model: { model_severity: 0.9999, confidence_published: 'uncalibrated_model_softmax' },
    physics: { physics_severity: 0.7549, divergence: 0.245, physics_agreement: 'partial' },
  },
  freshness: { data_cutoff: '2026-09-18T00:00:00Z' },
  provenance: { model_version: 'tflite-2026-09-12' },
  published: { at: '2026-09-18T06:00:00Z', mode: 'auto' as const },
  disclaimer: ALERT_DISCLAIMER,
};

const result = (over: Partial<Awaited<ReturnType<typeof loadAlerts>>> = {}) => ({
  alerts: [publishedAlert],
  policy: { version: 'alert-policy/1.0.0', disclaimer: ALERT_DISCLAIMER, human_in_the_loop: { max_auto_publish_level: 'WATCH' } },
  source: 'api' as const,
  generated_at: '2026-09-18T06:00:00Z',
  assessed: 74,
  counts: { WATCH: 1 },
  dropped_unpublished: 0,
  warnings: [],
  error: null,
  fetched_at: '2026-09-18T06:00:00Z',
  ...over,
});

const renderPage = () => render(
  <MemoryRouter>
    <AlertsPage />
  </MemoryRouter>,
);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  // jsdom reports 2 CPU cores, and the low-bandwidth rule correctly treats that as a
  // low-end device (see lib/bandwidth.ts). Most of these tests are about the full-mode
  // page, so they state the user's choice explicitly — which also exercises the
  // override path — and the two tests that care about detection clear it again.
  localStorage.setItem('hazardnet-low-bandwidth', 'false');
  resetLanguageForTests('en');
  loadAlertsMock.mockResolvedValue(result() as never);
});

describe('AlertsPage', () => {
  it('renders the published alert with its level, hazard and lead time', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /Sunamganj/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Flash Flood/).length).toBeGreaterThan(0);
    expect(screen.getByText('3 days')).toBeInTheDocument();
  });

  it('always carries the §1.7 disclaimer', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /Sunamganj/ });
    expect(screen.getByText(/not an official warning service/)).toBeInTheDocument();
  });

  it('labels the data source and the freshness', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('data-source-banner')).toHaveAttribute('data-source', 'api'));
    expect(screen.getByText('Live API')).toBeInTheDocument();
    expect(screen.getByText(/74 districts assessed/)).toBeInTheDocument();
  });

  it('says "offline snapshot" rather than passing a fallback off as live', async () => {
    loadAlertsMock.mockResolvedValue(result({ source: 'snapshot', generated_at: '2026-09-17T20:00:00Z' }) as never);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('data-source-banner')).toHaveAttribute('data-source', 'snapshot'));
    expect(screen.getByText('Offline snapshot')).toBeInTheDocument();
  });

  it('reports an unreachable API and snapshot instead of showing an empty list as good news', async () => {
    loadAlertsMock.mockResolvedValue(result({
      alerts: [], source: 'none', generated_at: null, assessed: null, counts: null, error: 'live API: offline',
    }) as never);
    renderPage();
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.getByTestId('data-source-banner')).toHaveAttribute('data-source', 'none');
    expect(screen.getByText(/live API: offline/)).toBeInTheDocument();
  });

  it('explains an assessed-but-blocked run rather than calling it a quiet period', async () => {
    loadAlertsMock.mockResolvedValue(result({
      alerts: [], counts: null, assessed: 74, dropped_unpublished: 74,
    }) as never);
    renderPage();
    expect(await screen.findByText(/none could be published/)).toBeInTheDocument();
    expect(screen.getByText(/§1.6 requires a model version/)).toBeInTheDocument();
  });

  it('explains the block from the run tally even when the payload dropped nothing', async () => {
    // The committed snapshot's shape after the CI wiring fix: the published list is empty
    // (so `dropped_unpublished` is 0) and the engine's own tally says 74 rows were held
    // back. Reading only the drop count would have turned a blocked run into "no alerts".
    loadAlertsMock.mockResolvedValue(result({
      alerts: [],
      counts: { WATCH: 0, dropped_unpublished: 0, not_published: 74 },
      assessed: 74,
      dropped_unpublished: 0,
      not_published: 74,
    }) as never);
    renderPage();
    expect(await screen.findByText(/none could be published/)).toBeInTheDocument();
    expect(screen.getByText(/74 district rows were assessed/)).toBeInTheDocument();
  });

  it('says out loud that an uncalibrated score is not a probability', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /Sunamganj/ });
    expect(screen.getAllByText(/not a probability/i).length).toBeGreaterThan(0);
  });

  it('offers the district table, the map legend and the policy in force', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /Sunamganj/ });
    expect(screen.getByText(/How these levels are decided/)).toBeInTheDocument();
    expect(screen.getByText('alert-policy/1.0.0')).toBeInTheDocument();
    // The table is rendered only in list view; in card view the text alternative is
    // reached through the view switch, which must exist on both.
    expect(screen.getByRole('button', { name: /Text list/ })).toBeInTheDocument();
    expect(screen.getByText(/how these levels are decided/i)).toBeInTheDocument();
  });

  it('renders in Bengali when the language is Bengali', async () => {
    resetLanguageForTests('bn');
    renderPage();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('ঝুঁকির সতর্কবার্তা');
    expect(screen.getAllByRole('option', { name: 'সব' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/দাবিত্যাগ/)).toBeInTheDocument();
  });

  it('opens on the text table when low-bandwidth mode is on', async () => {
    localStorage.setItem('hazardnet-low-bandwidth', 'true');
    renderPage();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('rowheader', { name: /Sunamganj/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cards/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Text list/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the toggle as checked and explains the mode', async () => {
    localStorage.setItem('hazardnet-low-bandwidth', 'true');
    renderPage();
    await screen.findByRole('table');
    const toggle = screen.getByRole('checkbox', { name: /Low-bandwidth mode/ });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/vector map and skip animations/)).toBeInTheDocument();
  });

  it('places the published-alert list before the map in the document', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /Sunamganj/ });
    const list = screen.getByRole('heading', { name: /Published alerts/ });
    const map = screen.getByRole('heading', { name: /District map/ });
    expect(list.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives Refresh a 44px minimum height', async () => {
    renderPage();
    const refresh = await screen.findByRole('button', { name: /Refresh/ });
    expect(refresh.className).toMatch(/min-h-\[44px\]/);
  });

  it('turns the mode on by itself on a low-end device, without a stored preference', async () => {
    localStorage.clear();
    renderPage();
    // jsdom reports 2 cores, so the library rule decides the device cannot carry raster
    // tiles + animation, and the page must land on the cheapest view that still informs.
    await screen.findByRole('table');
    expect(screen.getByRole('checkbox', { name: /Low-bandwidth mode/ })).toBeChecked();
  });
});
