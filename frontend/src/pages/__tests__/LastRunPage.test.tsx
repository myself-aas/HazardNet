import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * `/last-run` — the run card on a page of its own, relocated from the front-door hero
 * on 2026-10-05.
 *
 * Like the front door's test, the artifacts are read from `frontend/public/data/` rather
 * than written as fixtures here: the page's whole point is that it cannot say anything the
 * files do not say, so the test reads the same bytes the browser will.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';

import { LastRunPage } from '../LastRunPage';
import siteRoutes from '../../content/site-routes.json';
import { resetLanguageForTests } from '../../lib/i18n';

expect.extend(toHaveNoViolations);

const route = siteRoutes.routes.find((entry) => entry.path === '/last-run');

const artifact = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../../public/data', name), 'utf8'));

const FRESHNESS = artifact('freshness.json');
const ALERTS = artifact('alerts-latest.json');

/** URL-keyed fetch stub, same discipline as the front door's test. */
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
      <LastRunPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests('en');
  stubFetch({
    'freshness.json': FRESHNESS,
    'alerts-latest.json': ALERTS,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the last-run page', () => {
  it('renders the route copy with the whole run card under the header', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(route!.h1 as string);
    for (const section of (route!.sections as Array<{ h2?: string }>) ?? []) {
      if (section.h2) expect(screen.getByRole('heading', { level: 2, name: section.h2 })).toBeInTheDocument();
    }

    const card = await screen.findByTestId('last-run-visual');
    // The eyebrow is the title of the card that moved.
    expect(within(card).getByText('The last run, from the committed artifacts')).toBeInTheDocument();
    await waitFor(() => expect(within(card).getByText(/60 \/ 64/)).toBeInTheDocument());
    expect(within(card).getByText(/coverage status: partial/)).toBeInTheDocument();
  });

  it('states the withheld outcome in words instead of dressing an unread value as a zero', async () => {
    renderPage();

    const card = await screen.findByTestId('last-run-visual');
    // The snapshot this deployment ships publishes nothing; the card says what happened
    // to the assessed rows rather than showing a bare zero.
    expect(await within(card).findByText(/No alert is published from this run/)).toBeInTheDocument();
    expect(within(card).getByText(/74 assessed rows were withheld/)).toBeInTheDocument();
  });

  it('reads the honesty notes the run reports against itself', async () => {
    renderPage();

    const card = await screen.findByTestId('last-run-visual');
    expect(await within(card).findByText(/What the run reports against itself/)).toBeInTheDocument();
    expect(within(card).getByText(/SELF-REPORTED AUDIT/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const view = renderPage();
    await screen.findByTestId('last-run-visual');
    await waitFor(() => expect(view.container.textContent).toMatch(/60 \/ 64/));
    expect(await axe(view.container)).toHaveNoViolations();
  });
});
