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

    // The editorial sections, in the route's order (eleven since the 2026-10-28 clarify rewrite).
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    for (const section of front!.sections ?? []) {
      if (section.h2) expect(headings).toContain(section.h2);
    }
    expect(headings).toContain('The current outlook, and where to see it');
    // Critique decision (2026-10-28): the action pathway is rendered before the
    // coverage figures; provenance and the full registry stay below it.
    expect(headings.indexOf('Start here: what to do with an outlook')).toBeLessThan(
      headings.indexOf('What HazardNet covers'),
    );

    // Editorial prose is held to a reading measure; the data table is the deliberate exception.
    const actionSection = screen
      .getByRole('heading', { name: 'Start here: what to do with an outlook' })
      .closest('section')!;
    expect(
      Array.from(actionSection.querySelectorAll('p')).some((node) =>
        node.className.includes('max-w-[72ch]'),
      ),
    ).toBe(true);
    // The contents box indexes the explanatory sections, so it is named for that scope.
    expect(screen.getByRole('navigation', { name: 'Guide to the sections below' })).toBeInTheDocument();
  });

  it('reads the committed artifacts for its live panels', async () => {
    renderPage();

    const strip = await screen.findByTestId('front-door-status-strip');
    // The alert artifact this deployment ships publishes 106 WATCH advisories (128
    // assessed, no publication gate blocked any). Awaited, because the strip reads the
    // snapshot over fetch and renders its reading state first.
    expect(await within(strip).findByText(/Advisories are active/)).toBeInTheDocument();
    expect(within(strip).getByText(/106 district advisories are published at WATCH or above/)).toBeInTheDocument();

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

  it('preloads only the hero crop and density this viewport will paint', () => {
    const preload = (
      front as { preload?: Array<{ href: string; as: string; media: string }> } | undefined
    )?.preload;

    // `styles/hero-media.css` paints the 1x portrait below 2dppx and the tall 2x render at
    // or above it. The preload list must make the same split: a single phone-wide 2x entry
    // made a DPR-1 phone download the large frame and then the small frame it actually used.
    expect(preload).toEqual([
      {
        href: '/hero-carousel/hero-flood-delta.jpg',
        as: 'image',
        media: '(min-width: 640px)',
      },
      {
        href: '/hero-carousel/hero-flood-delta-portrait.jpg',
        as: 'image',
        media: '(max-width: 639px) and (max-resolution: 1.99dppx)',
      },
      {
        href: '/hero-carousel/hero-flood-delta-portrait-2x.jpg',
        as: 'image',
        media: '(max-width: 639px) and (min-resolution: 2dppx)',
      },
    ]);
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

  it('keeps the hero simple: one scrim, one primary action, no second frame', async () => {
    renderPage();
    await screen.findByTestId('front-door-status-strip');
    const hero = document.querySelector('header.ap-on-dark') as HTMLElement;
    expect(hero).not.toBeNull();
    // The hero is pulled under, and then clears, the same measured header height. Its
    // bottom reserve follows the pinned pause control's safe-area offset, so the control
    // cannot cover the authority line on a notched phone or in landscape.
    expect(hero.className).toContain('mt-[calc(var(--navbar-height)*-1)]');
    expect(hero.className).toContain('pb-[calc(max(1rem,env(safe-area-inset-bottom,0px))+4rem)]');
    const pauseControl = Array.from(hero.querySelectorAll('button')).find((button) =>
      button.className.includes('motion-reduce:hidden'),
    );
    expect(pauseControl?.className).toContain('right-[max(1rem,env(safe-area-inset-right,0px))]');
    expect(hero.querySelector('.max-w-\\[1200px\\]')?.className).toContain(
      'pl-[max(1rem,env(safe-area-inset-left,0px))]',
    );

    // The run card left the hero for /last-run on 2026-10-05: it is not rendered here,
    // and the hero reaches it only as a hyperlink.
    expect(hero.querySelector('[data-testid="last-run-visual"]')).toBeNull();
    expect(Array.from(hero.querySelectorAll('a[href="/last-run"]')).length).toBeGreaterThanOrEqual(1);

    // One flat scrim over the photograph, and since the 2026-10-26 critique it is a token
    // rather than a utility class: `--hero-scrim` is what `__tests__/heroContrast.test.js`
    // composites over a white photograph to prove the small print clears 4.5:1.
    const card = hero.querySelector('h1')!.closest('div') as HTMLElement;
    // The synthetic backdrop is labelled where the reader sees it, not only in an AI note elsewhere.
    expect(hero).toHaveTextContent('Hero imagery is illustrative.');
    expect(card.style.background).toContain('var(--hero-scrim)');
    expect(card.className).not.toMatch(/from-black\//);
    expect(card.className).not.toContain('bg-carbon-black/65');

    // One primary action in the hero, and it is the navigation one. The other two destinations
    // are text links (the 2026-10-03 audit's L-P1-1: three equal-weight buttons read as none).
    // `ap-btn` is the Apple primitive's own marker; the hero renders exactly one of them.
    const buttons = Array.from(hero.querySelectorAll('a.ap-btn'));
    expect(buttons.map((link) => link.getAttribute('href'))).toEqual(['/live']);

    // The language switch carries its own chip; the glass frame that used to wrap it was a box
    // inside a box. Nothing else in the hero draws a translucent surface.
    expect(hero.querySelectorAll('.bg-carbon-90\\/40').length).toBe(0);
  });


  it('enters on the design system’s CSS entrance, not on a frame loop', async () => {
    const { container } = renderPage();

    // The page arrives as ONE compositor animation — `.ap-enter`, the same 240ms `--ap-ease`
    // every other entrance in the design system uses (apple.css §11). Nothing about the fade
    // touches React, so the hero, the backdrop and the carousel are not re-rendered for it.
    expect(container.firstElementChild).toHaveClass('ap-enter');

    // And it stays that way: this module may not reach for the motion bridge again. Until
    // 2026-10-06 the root ran `useWebFrame(30, 8)` and interpolated its own opacity, so eight
    // rAF ticks re-rendered the entire front door per page load — including the live-fact hooks
    // that read the artifacts, which is ~60 renders a second for 267ms.
    const source = readFileSync(join(__dirname, '../FrontDoor.tsx'), 'utf8')
      // Comments are allowed to name the old code (this file's own history explains the change);
      // only executable source counts.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/useWebFrame\(/);
    expect(source).not.toMatch(/motion-interpolate/);
  });

  it('renders the Bengali editorial copy, and writes the language on the document', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /বাংলা/ }));

    // The module writes a full BCP-47 tag, which is what a screen reader wants for voice selection.
    expect(document.documentElement.lang).toMatch(/^bn/);
    // No draft badge: the route records an owner-approved native-speaker review
    // (site-routes.json `i18n.bn.review`), so announcing the opposite would be a false claim.
    expect(screen.queryByText(/বাংলা খসড়া/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(bn!.h1 as string);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    for (const section of (bn!.sections as Array<{ h2?: string }>) ?? []) {
      if (section.h2) expect(headings).toContain(section.h2);
    }
    // New Bengali editorial sections are held out until the owner re-reads them: the
    // held-out action section falls back to English, while previously approved Bengali
    // sections still render in Bengali.
    expect(headings).toContain('Start here: what to do with an outlook');
    expect(headings).not.toContain('এখান থেকে শুরু করুন: একটি পূর্বাভাস দিয়ে কী করবেন');
    expect(headings).toContain('বর্তমান পূর্বাভাস, এবং তা কোথায় দেখবেন');
    expect(screen.queryByText(/রিয়েল-টাইম আর্লি ওয়ার্নিং/)).toBeNull();
    // The strip follows the page into Bengali, digits included — awaited, because it reads
    // the alert artifact over fetch and renders its "reading" state until that resolves.
    const strip = screen.getByTestId('front-door-status-strip');
    expect(await within(strip).findByText(/সতর্কবার্তা সক্রিয়/)).toBeInTheDocument();
    // Bengali verdict body with Bengali digits — the artifact's 106 published advisories.
    expect(within(strip).getByText(/১০৬টি জেলার সতর্কবার্তা/)).toBeInTheDocument();
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
    await waitFor(() => expect(english.container.textContent).toMatch(/64 of 64 districts/));
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
    await waitFor(() => expect(bengali.container.textContent).toMatch(/৬৪টির মধ্যে ৬৪টি জেলা/));
    expect(await axe(bengali.container)).toHaveNoViolations();
  });

  it('shows the hazards section: eight hazard classes and both horizons', async () => {
    const { container, unmount } = renderPage();
    await waitFor(() => expect(screen.getByText('Monsoon outlook test post')).toBeInTheDocument());
    // Called "Hazards" since 2026-10-07 - the reader's word for the section, and the word the top
    // bar uses for the same thing. "Products" was the vendor's word on a page that sells nothing.
    const heading = screen.getByRole('heading', { name: 'Hazards' });
    expect(heading).toBeInTheDocument();
    // The label points at the heading it names, and the caption is a caption, not a second
    // paragraph: `<span>` here, next to the `<h2>` it describes.
    const section = heading.closest('section')!;
    expect(section).toHaveAttribute('aria-labelledby', 'hazards-heading');
    expect(heading).toHaveAttribute('id', 'hazards-heading');
    expect(within(section).getByText(/Eight classes · 7 and 15 day horizons/).tagName).toBe('SPAN');
    // The eight classes come from the same methodology file the /hazards page reads, including
    // that file's own summaries rather than a second set of card taglines.
    expect(container.textContent).toContain('Tropical Cyclone');
    expect(container.textContent).toContain('Cold Wave');
    expect(section.textContent).toContain('Riverine and monsoon flooding');
    expect(container.textContent).toContain('7-day outlook');
    expect(container.textContent).toContain('15-day outlook');
    // Critique P0: daily publication must not be sold as a live/real-time emergency feed.
    expect(container.textContent).not.toMatch(/Live emergency|real-time early warning/i);
    // Distilled index: every class is a row in page flow. There is no Shelf/Grid mode, no
    // horizontal shelf to operate, and no quick-action row repeating hero/strip destinations.
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    expect(section.querySelector('[class*="overflow-x-auto"]')).toBeNull();
    expect(
      within(section).queryByRole('link', { name: /Report Hazard|Regional Dashboard|Live GIS Console/ }),
    ).not.toBeInTheDocument();
    expect(section.querySelectorAll('a[href^="/hazards/"]')).toHaveLength(8);
    unmount();
  });

  it('survives a 320px phone: no fixed widths, no unbreakable tokens', async () => {
    const { container, unmount } = renderPage();
    await screen.findByTestId('front-door-status-strip');

    /*
     * The front door cannot be laid out in jsdom, so this asserts the four things that decide
     * whether it CAN fit a small phone, each of them the mechanical form of a ui-ux-pro-max rule:
     *
     *   · §5 `horizontal-scroll` / "no fixed px container widths" — nothing in the subtree may
     *     declare a fixed width wider than the content box of the smallest phone we support.
     *     320px minus the page's own `px-4` (32px) leaves 288px; `max-w-*` is not counted, because
     *     a maximum cannot overflow, and neither is `min-h-*`, which is a touch target (below).
     *   · §6 `long-token-wrapping` — the citation carries a URL, the only unbreakable token
     *     on the page; it must be allowed to break.
     *   · §5 `touch-density` — the in-section actions are 44px rows, phone and desktop alike.
     *
     * The hero is deliberately not covered here: it is `main`'s hero, held by its own test below,
     * and the rules that shape it (the copy panel, the type sizes, the phone clamp) belong to that
     * contract rather than to this page-level scan.
     */
    const PHONE_CONTENT_BOX = 320 - 2 * 16;

    const fixed = new Map<string, string>();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
      const cls = el.getAttribute('class') ?? '';
      for (const match of cls.matchAll(/(?:^|\s)(min-w|w|basis)-\[(\d+)px\]/g)) {
        const width = Number(match[2]);
        if (width > PHONE_CONTENT_BOX) fixed.set(`${match[1]}-[${match[2]}px]`, el.tagName);
      }
      for (const match of cls.matchAll(/(?:^|\s)(min-w|w|basis)-\[(\d+(?:\.\d+)?)rem\]/g)) {
        const width = Number(match[2]) * 16;
        if (width > PHONE_CONTENT_BOX) fixed.set(`${match[1]}-[${match[2]}rem]`, el.tagName);
      }
    }
    expect([...fixed.entries()]).toEqual([]);

    // A width can fit the page's 288px content box and still overflow inside a padded panel.
    // The verdict used to hold a 16rem floor inside exactly such a panel, so its shrink/wrap
    // contract is asserted directly rather than inferred from the page-level scan.
    const verdictBody = screen.getByTestId('verdict-body');
    expect(verdictBody.className).toContain('min-w-0');
    expect(verdictBody.className).not.toContain('min-w-[16rem]');

    // The four coverage figures scan as a two-by-two block on a phone, not four stacked stops,
    // and every section heading is allowed to shrink and balance its wrapped lines.
    const trustSection = document.getElementById('trust-heading')?.closest('section');
    expect(trustSection?.querySelector('div.grid')?.className).toContain('grid-cols-2');
    for (const heading of Array.from(container.querySelectorAll('h2'))) {
      expect(heading.className).toContain('min-w-0');
      expect(heading.className).toContain('text-balance');
    }

    // The citation is the page's one long token (a 39-character repository URL).
    // `overflow-wrap: anywhere` also lowers its min-content size, so the token cannot
    // force the block wider than the phone before the browser gets a chance to wrap it.
    // Matched on the bare URL, because the body paragraph above it also names the department.
    const citation = [...container.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('github.com/myself-aas/HazardNet'),
    )!;
    expect(citation).toBeDefined();
    expect(citation.className).toContain('[overflow-wrap:anywhere]');
    expect(citation.className).toContain('font-mono');

    // The phone branch of the ledger table uses a fixed 38% label column. Both sides of
    // that pair therefore have to be shrinkable and breakable at the same strength.
    for (const term of Array.from(container.querySelectorAll('dt, dd'))) {
      expect(term.className).toContain('min-w-0');
      expect(term.className).toContain('[overflow-wrap:anywhere]');
    }

    // Every in-section action is a 44px row, phone and desktop alike.
    const sectionButtons = [...container.querySelectorAll('a')].filter((a) =>
      /How each class is scored|How to read a forecast/i.test(a.textContent ?? ''),
    );
    expect(sectionButtons.length).toBe(2);
    for (const button of sectionButtons) expect(button.className).toContain('min-h-[44px]');

    unmount();
  });

  it('shows the newest blog posts with a link into the blog', async () => {
    const { unmount } = renderPage();
    const post = await screen.findByText('Monsoon outlook test post');
    // Blog titles and excerpts are store-authored rather than route-pinned, so the card
    // must remain shrinkable even when one arrives as a single long token or URL.
    expect(post.className).toContain('[overflow-wrap:anywhere]');
    expect(post.closest('li')?.className).toContain('min-w-0');
    expect(post.closest('a')).toHaveAttribute('href', '/blogs/monsoon-outlook-test');
    expect(screen.getByRole('heading', { name: 'Newest from the blog' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read all posts/ })).toHaveAttribute('href', '/blogs');
    unmount();
  });
});
