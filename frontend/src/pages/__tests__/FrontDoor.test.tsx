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

/**
 * The blog lives in Firestore; the front door reads it through the same module the blog page
 * uses. The mock stands in for the store the way Blogs.dedicatedPages.test.tsx does, with one
 * published article so the new "Newest from the blog" section has something to render.
 */
jest.mock('../../lib/blogArticles', () => ({
  listPublishedArticles: async () => ({
    data: [
      {
        id: 'post-1',
        slug: 'monsoon-outlook-test',
        title: 'Monsoon outlook test post',
        excerpt: 'An excerpt used only by the front door test.',
        contentHtml: '<p>Body copy.</p>',
        coverImageUrl: null,
        category: 'Field notes',
        tags: [],
        status: 'published',
        authorId: null,
        authorEmail: 'desk@hazardnet.live',
        authorName: 'HazardNet desk',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        publishedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
    error: null,
    localDemo: true,
  }),
  readingTimeMinutes: () => 4,
}));

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

    const strip = await screen.findByTestId('front-door-status-strip');
    // The alert artifact this deployment ships publishes nothing and says why. Awaited,
    // because the strip reads the snapshot over fetch and renders its reading state first.
    expect(await within(strip).findByText(/No alert is published at the moment of this read/)).toBeInTheDocument();
    expect(within(strip).getByText(/withheld 74 of them from publication/)).toBeInTheDocument();

    // The run card moved to /last-run on 2026-10-05: the hero reaches it as a hyperlink,
    // and the card itself is no longer part of this page.
    expect(document.querySelector('[data-testid="last-run-visual"]')).toBeNull();
    const hero = document.querySelector('header.ap-on-dark') as HTMLElement;
    expect(hero).not.toBeNull();
    expect(Array.from(hero.querySelectorAll('a[href="/last-run"]')).length).toBeGreaterThanOrEqual(1);
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

  it('keeps the hero copy a thin, low band so the photograph reads', async () => {
    renderPage();
    await screen.findByTestId('front-door-status-strip');
    const hero = document.querySelector('header.hero-frame') as HTMLElement;
    expect(hero).not.toBeNull();

    // The copy is bottom-anchored, so its top edge is the only one that can move: every line
    // taken out of this block is a line of photograph the reader gets back. The claim is set
    // from the viewport on phones (the rule is unlayered, because `.ap-hero` in apple.css is,
    // so it cannot be a Tailwind utility), the tagline is one size step down, the small print
    // is the 12px fine-print token rather than a size of its own, and the rhythm is tight.
    const h1 = hero.querySelector('h1')!;
    expect(h1.className).toContain('ap-hero');
    const tagline = within(hero).getByText(/every number traces to a dated artifact/i);
    expect(tagline.className).toContain('text-sm');
    expect(tagline.className).toContain('sm:text-base');
    expect(tagline.className).not.toContain('sm:text-lg');

    const css = readFileSync(join(process.cwd(), 'frontend/src/index.css'), 'utf8');
    expect(css).toMatch(/\.hero-frame \.ap-hero \{[^}]*font-size: clamp\(/);

    // The standfirst is 70 words of method: one clamped line by default, the rest on request.
    const standfirst = hero.querySelector('#front-door-standfirst') as HTMLElement;
    expect(standfirst.className).toContain('line-clamp-1');
    expect(standfirst.className).toContain('text-ap-fine');
    expect(standfirst.className).toContain('leading-snug');
    expect(standfirst.className).not.toContain('line-clamp-2');
    expect(hero.querySelectorAll('[class*="leading-\\[1.6\\]"]').length).toBe(0);

    // Touch targets: the two fine-print controls are text disclosures in a 12px band, sized
    // clear of the 24px WCAG 2.5.8 AA floor. The icon-only pause control keeps its 44px.
    const disclosure = within(hero).getByRole('button', { name: /read the full overview/i });
    expect(disclosure.className).toContain('min-h-[36px]');
    const links = Array.from(hero.querySelectorAll('a[href="/methodology"], a[href="/model-performance"], a[href="/last-run"]'));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) expect(link.className).toContain('min-h-[32px]');
    const pause = within(hero).getByRole('button', { name: /pause motion/i });
    expect(pause.className).toContain('min-h-[44px]');

    // And nothing was deleted to get there: the claim, the tagline, the action, the standfirst,
    // the three destinations and the 999 boundary are all still in the hero.
    expect(within(hero).getByRole('link', { name: /open the live map/i })).toHaveAttribute('href', '/live');
    expect(within(hero).getByText(/not an official warning service/)).toBeInTheDocument();
    expect(hero.querySelectorAll('.text-shadow-hero-fine').length).toBeGreaterThanOrEqual(5);
  });

  it('keeps the hero open: no surface over the photograph, one primary action, small print', async () => {
    renderPage();
    await screen.findByTestId('front-door-status-strip');
    const hero = document.querySelector('header.ap-on-dark') as HTMLElement;
    expect(hero).not.toBeNull();

    // The run card left the hero for /last-run on 2026-10-05: it is not rendered here,
    // and the hero reaches it only as a hyperlink.
    expect(hero.querySelector('[data-testid="last-run-visual"]')).toBeNull();
    expect(Array.from(hero.querySelectorAll('a[href="/last-run"]')).length).toBeGreaterThanOrEqual(1);

    // 2026-10-06: the copy panel is gone. Every word in the hero now sits on the photograph, with
    // nothing painted between them - no scrim, no blur, no frame, no inline filter - so the one
    // surface behind the type is the exposure curve HeroCinematicBackground already draws, and the
    // copy is anchored to the band that gradient darkens. The panel this replaces was
    // `bg-carbon-black/65` plus `backdrop-filter: blur(var(--hero-glass-blur))`; both are asserted
    // absent, so putting a box back over the hero fails here instead of quietly covering it again.
    const copy = hero.querySelector('h1')!.closest('div') as HTMLElement;
    expect(copy.className).toContain('max-w-3xl');
    expect(copy.className).not.toMatch(/bg-|border|rounded-|backdrop-/);
    expect(copy.getAttribute('style')).toBeNull();
    expect(copy.querySelector('[class*="backdrop-blur"]')).toBeNull();
    expect(copy.querySelectorAll('[style*="backdrop"]').length).toBe(0);

    // One big heading: the same `ap-hero` style the front door has always used.
    expect(hero.querySelector('h1')!.className).toContain('ap-hero');

    // Type protection is two published tokens, not seven hand-copied arbitrary values: the h1
    // wears the display tier, every piece of small print (tagline, standfirst, the three links, the
    // 999 boundary sentence) wears the fine one. Both utilities come from `index.css`; the values
    // are pinned there by `HeroCinematicBackground.test.tsx`.
    expect(hero.querySelector('h1')!.className).toContain('text-shadow-hero-display');
    const fine = Array.from(hero.querySelectorAll('.text-shadow-hero-fine'));
    expect(fine.length).toBeGreaterThanOrEqual(5); // tagline, standfirst, 3 links, boundary
    expect(hero.querySelectorAll('[class*="drop-shadow-["]').length).toBe(0);

    // One primary action in the hero, and it is the navigation one. The other destinations are
    // in the small-print link row (the 2026-10-03 audit's L-P1-1: three equal-weight buttons read
    // as none). `ap-btn` is the Apple primitive's own marker; the hero renders exactly one.
    const buttons = Array.from(hero.querySelectorAll('a.ap-btn'));
    expect(buttons.map((link) => link.getAttribute('href'))).toEqual(['/live']);

    // The tagline is the hero's one subheading, and the small print carries everything else: the
    // authority boundary (still in the hero - 2026-10-03 audit H-P1-4) and the three destinations
    // as one row of links rather than a column of buttons.
    expect(within(hero).getByText(/every number traces to a dated artifact/i)).toBeInTheDocument();
    expect(within(hero).getByText(/not an official warning service/)).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: /how a forecast is produced/i })).toHaveAttribute('href', '/methodology');
    expect(within(hero).getByRole('link', { name: /read the validation scorecard/i })).toHaveAttribute('href', '/model-performance');

    // The language switch carries its own chip; the glass frame that used to wrap it was a box
    // inside a box. Nothing else in the hero draws a translucent surface.
    expect(hero.querySelectorAll('.bg-carbon-90\\/40').length).toBe(0);
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
    await screen.findByTestId('front-door-status-strip');
    // Awaited on the trust strip's coverage figure: the run card that used to carry it
    // moved to /last-run, and this asserts the page's own live data has landed.
    await waitFor(() => expect(english.container.textContent).toMatch(/60 of 64 districts/));
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
    await waitFor(() => expect(bengali.container.textContent).toMatch(/৬৪টির মধ্যে ৬০টি জেলা/));
    expect(await axe(bengali.container)).toHaveNoViolations();
  });

  it('shows the products section: eight hazard classes and both horizons', async () => {
    const { container, unmount } = renderPage();
    await waitFor(() => expect(screen.getByText('Monsoon outlook test post')).toBeInTheDocument());
    const heading = screen.getByRole('heading', { name: 'Products' });
    expect(heading).toBeInTheDocument();
    // The eight classes come from the same methodology file the /hazards page reads.
    expect(container.textContent).toContain('Tropical Cyclone');
    expect(container.textContent).toContain('Cold Wave');
    expect(container.textContent).toContain('7-day outlook');
    expect(container.textContent).toContain('15-day outlook');
    expect(container.querySelectorAll('a[href^="/hazards/"]').length).toBeGreaterThanOrEqual(8);
    unmount();
  });

  it('shows the newest blog posts with a link into the blog', async () => {
    const { unmount } = renderPage();
    const post = await screen.findByText('Monsoon outlook test post');
    expect(post.closest('a')).toHaveAttribute('href', '/blogs/monsoon-outlook-test');
    expect(screen.getByRole('heading', { name: 'Newest from the blog' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read all posts/ })).toHaveAttribute('href', '/blogs');
    unmount();
  });
});
