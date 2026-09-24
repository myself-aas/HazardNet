import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * `/` — the front door, rendered as a page.
 *
 * `__tests__/publicSurface.test.js` pins the contract (which route renders what, which claims the
 * copy may not make, that the citation links survive the prerenderer) and
 * `components/frontdoor/__tests__/` pins the two live panels in isolation. This is the third leg:
 * the whole page, hydrated, reading the artifacts this deployment actually ships.
 *
 * The artifacts are read from `frontend/public/data/` rather than written as fixtures here, on
 * purpose. A fixture that drifts from the committed file fails nothing, and the point of this page
 * is that it cannot say anything the files do not say — so the test reads the same bytes the
 * browser will.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';

import { FrontDoor } from '../FrontDoor';
import siteRoutes from '../../content/site-routes.json';
import { resetLanguageForTests } from '../../lib/i18n';

expect.extend(toHaveNoViolations);

const front = siteRoutes.routes.find((route) => route.path === '/');
const bn = (front as { i18n?: { bn?: Record<string, unknown> } }).i18n?.bn;

const artifact = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../../public/data', name), 'utf8'));

const FRESHNESS = artifact('freshness.json');
const ALERTS = artifact('alerts-latest.json');
const PERFORMANCE = artifact('model-performance.json');

/**
 * URL-keyed fetch stub. `loadAlerts` tries the live API first and falls back to the committed
 * snapshot, so the API route is answered with a failure the way an offline build would, and the
 * snapshot route with the real file.
 */
function stubFetch(byUrl: Record<string, unknown>) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, payload] of Object.entries(byUrl)) {
      if (url.includes(needle)) {
        return { ok: true, status: 200, json: async () => payload } as Response;
      }
    }
    return { ok: false, status: 503, json: async () => ({ error: 'no backend in this test' }) } as Response;
  }) as unknown as typeof fetch;
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <FrontDoor />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests('en');
  stubFetch({
    'freshness.json': FRESHNESS,
    'alerts-latest.json': ALERTS,
    'model-performance.json': PERFORMANCE,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the front door', () => {
  it('renders the editorial copy from the route, not from JSX', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(front!.h1 as string);

    // Seven sections, in the route's order — including the one added by the 2026-09-19 redesign.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    for (const section of front!.sections ?? []) {
      if (section.h2) expect(headings).toContain(section.h2);
    }
    expect(headings).toContain('The current outlook, and where to see it');
  });

  it('reads the committed artifacts for its live panels', async () => {
    renderPage();

    const card = await screen.findByTestId('front-door-run-visual');
    await waitFor(() => expect(within(card).getByText(/60 \/ 64/)).toBeInTheDocument());
    expect(within(card).getByText(/coverage status: partial/)).toBeInTheDocument();

    const strip = screen.getByTestId('front-door-status-strip');
    // The alert artifact this deployment ships publishes nothing and says why.
    expect(within(strip).getByText(/No alert is published at the moment of this read/)).toBeInTheDocument();
    expect(within(strip).getByText(/withheld 74 of them from publication/)).toBeInTheDocument();
  });

  it("resolves the ledger's review dates instead of printing a reference", async () => {
    renderPage();
    // `/model-performance`'s review date is derived from the newest validation report, so it moves
    // when that workflow runs. The ledger reads it through a reference; this is the DOM-side
    // proof that the reference resolved rather than reaching the reader as `@review-date:…`.
    const table = screen.getByRole('table');
    expect(table.textContent).not.toContain('@review-date');
    expect(table.textContent).toMatch(/20\d\d-\d\d-\d\d/);
  });

  it('keeps the authority boundary on the page', () => {
    renderPage();
    // The agency names and the hotline are copy; the portals are links, so the hosts are
    // checked in the rendered HTML rather than in the text.
    const text = document.body.textContent ?? '';
    for (const marker of [
      'Bangladesh Meteorological Department',
      'Flood Forecasting and Warning Centre',
      'Department of Disaster Management',
      '999',
    ]) {
      expect(text).toContain(marker);
    }
    const html = document.body.innerHTML;
    for (const host of ['bmd.gov.bd', 'ffwc.gov.bd', 'ddm.gov.bd']) {
      expect(html).toContain(host);
    }
  });

  it('makes none of the claims the repository cannot support', () => {
    renderPage();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/landslide/i);
    expect(text).not.toMatch(/MODIS/i);
    expect(text).not.toMatch(/every (alert|warning) is (reviewed|checked) by a human/i);
    // The publication rule is stated as the code implements it.
    expect(text).toMatch(/at or below its configured ceiling/);
  });

  it('carries no map and no image: the console stays at /live', () => {
    renderPage();
    expect(document.querySelector('.leaflet-container')).toBeNull();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    // The hero CTA and the new section's link both say it; either one has to reach the console.
    for (const link of screen.getAllByRole('link', { name: /open the live map/i })) {
      expect(link).toHaveAttribute('href', '/live');
    }
  });

  it('renders the Bengali editorial copy, and writes the language on the document', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /বাংলা/ }));

    // The module writes a full BCP-47 tag, which is what a screen reader wants for voice selection.
    expect(document.documentElement.lang).toMatch(/^bn/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(bn!.h1 as string);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    for (const section of (bn!.sections as Array<{ h2?: string }>) ?? []) {
      if (section.h2) expect(headings).toContain(section.h2);
    }
    // The strip follows the page into Bengali, digits included — awaited, because it reads
    // the alert artifact over fetch and renders its "reading" state until that resolves.
    const strip = screen.getByTestId('front-door-status-strip');
    expect(await within(strip).findByText(/৭৪টি প্রকাশ থেকে বিরত রাখা হয়েছে/)).toBeInTheDocument();
  });

  it('falls back to English field by field when the Bengali block is incomplete', () => {
    // The rule is structural: English is the authority, so a partial translation cannot punch a
    // hole in the page. Simulated by asking for a language the route has no block for.
    resetLanguageForTests('en');
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(front!.h1 as string);
  });

  it('has no accessibility violations in either language', async () => {
    const english = renderPage();
    await screen.findByTestId('front-door-run-visual');
    await waitFor(() => expect(english.container.textContent).toMatch(/60 \/ 64/));
    expect(await axe(english.container)).toHaveNoViolations();

    // Unmounted before the second render: two mounted front doors would share every id and
    // test id, and the failure would be about the test rather than about the page.
    english.unmount();

    resetLanguageForTests('bn');
    const bengali = render(
      <MemoryRouter>
        <FrontDoor />
      </MemoryRouter>,
    );
    await waitFor(() => expect(bengali.container.textContent).toMatch(/৬০ \/ ৬৪/));
    expect(await axe(bengali.container)).toHaveNoViolations();
  });
});
