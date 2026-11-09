import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AlertDetailPage from '../AlertDetailPage';
import { EVIDENCE_CARD_ID } from '../../components/alerts/EvidenceCard';
import { formatDate, resetLanguageForTests } from '../../lib/i18n';
import type { AlertRecord } from '../../lib/alerts';

expect.extend(toHaveNoViolations);

const ALERTS_SNAPSHOT = JSON.parse(
  readFileSync(join(__dirname, '../../../public/data/alerts-latest.json'), 'utf8'),
);
const DAILY_SNAPSHOT = JSON.parse(
  readFileSync(join(__dirname, '../../../public/data/daily-advisories-v1.json'), 'utf8'),
);

function stubLiveFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/alerts')) {
      return {
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'offline' }),
      } as unknown as Response;
    }
    if (url.includes('alerts-latest.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ALERTS_SNAPSHOT,
      } as unknown as Response;
    }
    if (url.includes('daily-advisories-v1.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => DAILY_SNAPSHOT,
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    } as unknown as Response;
  });
}

function mountAlert(alertId: string) {
  return render(
    <MemoryRouter initialEntries={[`/alerts/${alertId}`]}>
      <Routes>
        <Route path="/alerts/:id" element={<AlertDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AlertDetailPage (/alerts/:id)', () => {
  beforeEach(() => {
    resetLanguageForTests('en');
    stubLiveFetch();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the fresh Kaggle v42 Chandpur alert with 15-day trajectory charts, sortable table, peak severe date, and dual-track severity bars', async () => {
    // Mount an alert that exists in the committed snapshot so the test stays
    // green as the daily artifact rotates, instead of hardcoding a run date
    // that disappears the next time the snapshot is regenerated.
    //
    // The hazard is *not* hardcoded, for the same reason the date is not. It read
    // `hazard_type === 'Flash Flood'` — true of the 2026-10-24 snapshot, false of the committed
    // one, where Chandpur's published row is a `Flood`. The lookup then returned undefined, so
    // this test failed on its own precondition rather than on the page it exists to cover.
    // The property under test is "Chandpur, whatever hazard the run published for it": one
    // published alert per district and horizon, which is what the pipeline guarantees.
    const chandpurAlert = ALERTS_SNAPSHOT.alerts.find(
      (a: AlertRecord) => Number(a.district_id) === 60
    );
    expect(chandpurAlert).toBeDefined();
    const alertId = chandpurAlert!.id;
    const peakDate = formatDate(chandpurAlert!.target_date, 'en');

    const { container } = mountAlert(alertId);

    expect(await screen.findByRole('heading', { level: 1, name: 'Evidence card' })).toBeInTheDocument();
    const evidence = container.querySelector(`#${EVIDENCE_CARD_ID}`) as HTMLElement;
    expect(evidence).not.toBeNull();
    expect(evidence.textContent).toMatch(/Chandpur/);

    // Freshness banner reflects current Kaggle v42 cutoff (within 48h SLO, not 234h Oct 24 stale)
    expect(container.textContent).not.toMatch(/234 hours old|24 October 2026/i);
    expect(container.textContent).not.toMatch(/No current daily outlook is published/i);

    // Continuous 15-day trajectory + Peak Severe Date + interactive chart + 15-row table
    const trajectory = await screen.findByTestId('continuous-15day-trajectory');
    expect(trajectory.querySelectorAll('[data-forecast-day]')).toHaveLength(15);
    expect(trajectory.querySelectorAll('[data-peak="true"]')).toHaveLength(1);
    expect(container.textContent).toMatch(new RegExp(`Peak severe date:\\s*${peakDate}`));

    const peakBanner = screen.getByTestId('peak-severe-banner');
    expect(peakBanner.textContent).toMatch(peakDate);

    const chart = screen.getByTestId('trajectory-15day-chart');
    fireEvent.click(within(chart).getByRole('button', { name: /Confidence & thresholds/i }));
    expect(within(chart).getByRole('button', { name: /Confidence & thresholds/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const table = screen.getByTestId('trajectory-15day-table');
    expect(table.querySelectorAll('tr[data-table-day]')).toHaveLength(15);

    // Evidence card renders Peak severe date, 0-100 Severity Index, and Dual-Track visual comparison
    expect(within(evidence).getByText('Peak severe date')).toBeInTheDocument();
    expect(within(evidence).getByText('Dual-track severity & divergence comparison')).toBeInTheDocument();
    expect(within(evidence).getAllByText('Model severity').length).toBeGreaterThanOrEqual(1);
    expect(within(evidence).getAllByText('Independent physics severity').length).toBeGreaterThanOrEqual(1);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('resolves a superseded bookmarked alert ID to the district’s current trajectory alert with an update note', async () => {
    const chandpurAlert = ALERTS_SNAPSHOT.alerts.find(
      (a: AlertRecord) => Number(a.district_id) === 60
    );
    expect(chandpurAlert).toBeDefined();
    // A bookmarked id for the same district/hazard that is deliberately absent
    // from the snapshot, so the page must fall back to the current run. The hazard
    // segment comes from the row so the bookmark stays a *stale id for this district*
    // rather than becoming a bookmark for a hazard Chandpur does not carry.
    const hazardSlug = String(chandpurAlert!.hazard_type).trim().toLowerCase().replace(/[\s_]+/g, '-');
    const bookmarkedId = `2026-11-20__15_days__60__${hazardSlug}__p2026-11-02`;
    const { container } = mountAlert(bookmarkedId);

    expect(await screen.findByRole('heading', { level: 1, name: 'Evidence card' })).toBeInTheDocument();
    expect(container.querySelector(`#${EVIDENCE_CARD_ID}`)?.textContent).toMatch(/Chandpur/);
    const banner = await screen.findByTestId('superseded-alert-banner');
    expect(banner.textContent).toMatch(/Showing updated forecast run/i);
    expect(banner.textContent).toMatch(chandpurAlert!.id);
    expect(await screen.findByTestId('continuous-15day-trajectory')).toBeInTheDocument();
  });
});
