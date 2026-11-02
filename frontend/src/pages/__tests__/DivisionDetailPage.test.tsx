import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DivisionDetailPage from '../DivisionDetailPage';
import {
  fetchDistrictEvents,
  fetchDivisionEvents,
  fetchHazardEvents,
  resetEventsClientCacheForTests,
} from '../../lib/eventsClient';

expect.extend(toHaveNoViolations);

const PUBLIC_DATA = join(__dirname, '../../../public/data');
const CATALOG_INDEX = JSON.parse(readFileSync(join(PUBLIC_DATA, 'historical/hazard-catalog-index.json'), 'utf8'));
const EVENTS_MASTER = JSON.parse(readFileSync(join(PUBLIC_DATA, 'historical/events-master.json'), 'utf8'));
const FORECASTS_LATEST = JSON.parse(readFileSync(join(PUBLIC_DATA, 'hazardnet_forecasts_latest.json'), 'utf8'));
const DAILY_SNAPSHOT = JSON.parse(readFileSync(join(PUBLIC_DATA, 'daily-advisories-v1.json'), 'utf8'));
const ALERTS_SNAPSHOT = JSON.parse(readFileSync(join(PUBLIC_DATA, 'alerts-latest.json'), 'utf8'));

function stubStaticDeploymentFetch({ emptyCatalog = false }: { emptyCatalog?: boolean } = {}) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Simulate Cloudflare Pages / vite preview SPA HTML fallback on unmounted /api/v1/events/* and missing compact file
    if (url.includes('/api/v1/events/') || url.includes('climatic_hazards_events.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response;
    }
    if (url.includes('/api/v1/advisories') || url.includes('/api/v1/alerts') || url.includes('/api/v1/kaggle')) {
      return {
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'static_preview' }),
      } as unknown as Response;
    }
    if (url.includes('hazard-catalog-index.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => (emptyCatalog ? [] : CATALOG_INDEX),
      } as unknown as Response;
    }
    if (url.includes('events-master.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => EVENTS_MASTER,
      } as unknown as Response;
    }
    if (url.includes('hazardnet_forecasts_latest.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => FORECASTS_LATEST,
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
    if (url.includes('alerts-latest.json')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ALERTS_SNAPSHOT,
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    } as unknown as Response;
  }) as jest.Mock;
}

describe('eventsClient & DivisionDetailPage (/divisions/:id)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetEventsClientCacheForTests();
    stubStaticDeploymentFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetEventsClientCacheForTests();
  });

  it('synthesizes Dhaka and Chattogram/Chittagong divisions from shipped static catalog & forecast artifacts', async () => {
    const dhaka = await fetchDivisionEvents('dhaka');
    expect(dhaka.division).toBe('Dhaka');
    expect(dhaka.totalDistricts).toBe(13);
    expect(dhaka.totalEvents).toBe(610);
    expect(dhaka.districtRankings).toHaveLength(13);
    expect(dhaka.forecasts).toHaveLength(13);
    expect(dhaka.districtRankings.every((d) => d.forecast15DSeverity !== null)).toBe(true);

    const chattogram = await fetchDivisionEvents('chattogram');
    expect(chattogram.division).toBe('Chattogram');
    expect(chattogram.totalDistricts).toBe(11);
    expect(chattogram.totalEvents).toBe(532);
    expect(chattogram.districtRankings).toHaveLength(11);
    expect(chattogram.forecasts).toHaveLength(11);

    const chittagongAlias = await fetchDivisionEvents('chittagong');
    expect(chittagongAlias.division).toBe('Chattogram');
    expect(chittagongAlias.totalDistricts).toBe(11);
    expect(chittagongAlias.totalEvents).toBe(532);
  });

  it('keeps constituent districts and forecasts populated even when historical catalog is empty', async () => {
    stubStaticDeploymentFetch({ emptyCatalog: true });
    const dhaka = await fetchDivisionEvents('dhaka');
    expect(dhaka.totalDistricts).toBe(13);
    expect(dhaka.districtRankings).toHaveLength(13);
    expect(dhaka.forecasts).toHaveLength(13);
    expect(dhaka.totalEvents).toBe(0);
  });

  it('disambiguates Flood from Flash Flood on /hazards/flood and resolves apostrophe district names', async () => {
    const flood = await fetchHazardEvents('flood');
    expect(flood.totalEvents).toBeGreaterThan(0);
    expect(flood.allEvents.every((e) => e.hazard !== 'Flash Flood')).toBe(true);

    const coxs = await fetchDistrictEvents("Cox's Bazar");
    expect(coxs.division).toBe('Chattogram');
    expect(coxs.totalEvents).toBeGreaterThan(40);
    expect(coxs.forecast15D).not.toBeNull();
  });

  it('renders /divisions/dhaka with live 15-day trajectory charts, published advisories, archive records, and zero axe violations', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/divisions/dhaka']}>
        <Routes>
          <Route path="/divisions/:id" element={<DivisionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: /Dhaka Division/i })).toBeInTheDocument();
    expect(screen.getByText(/spans 13 constituent districts with 610 verified climatic disaster records/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Continuous 15-Day Division Trajectory \(Dhaka\)/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Constituent District Advisories & 15-Day Forecasts \(Dhaka\)/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /26-Year Historical Disaster Analytics \(2000-2026\)/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Historical Climatic Events Archive \(Dhaka Division\)/i })).toBeInTheDocument();

    // Verify published advisory Evidence Card links and 15-Day District Outlook links render
    const alertLinks = screen.getAllByRole('link', { name: /Evidence Card|Alert/i });
    expect(alertLinks.length).toBeGreaterThanOrEqual(13);

    // Exercise interactive trajectory chart mode buttons and sort control
    const watchModeBtn = screen.getByRole('button', { name: /WATCH\+ Districts/i });
    fireEvent.click(watchModeBtn);
    expect(watchModeBtn).toHaveAttribute('aria-pressed', 'true');

    const weatherModeBtn = screen.getByRole('button', { name: /Rain & Max Temp/i });
    fireEvent.click(weatherModeBtn);
    expect(weatherModeBtn).toHaveAttribute('aria-pressed', 'true');

    const sortSelect = screen.getByLabelText(/Sort:/i);
    fireEvent.change(sortSelect, { target: { value: 'name' } });
    expect((sortSelect as HTMLSelectElement).value).toBe('name');

    // Pass jest-axe accessibility gate
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
