/**
 * The hero carousel's slides, in the order they are drawn.
 *
 * Every slide is a self-hosted asset served from `frontend/public/hero-carousel/`, so the
 * hero makes exactly zero remote requests. That is deliberate and it is load-bearing:
 * this repository's E2E suite (`e2e/full-app-qa.spec.ts`) fails the build on *any* failing
 * request on a covered route, and both of the hero's previous backdrops — the stock-video
 * playlist and, before it, remote CDN clips — died on precisely that gate. A background
 * that only ever asks same-origin for its pictures cannot.
 *
 * The images are AI-generated (this sandbox has no network egress, so nothing here was
 * scraped) and therefore carry no third-party copyright. The two NASA Earth Observatory
 * frames I located while researching were public domain but shipped as a labelled,
 * portrait two-panel comparison — the wrong shape and legibility for a full-bleed
 * background — so they were not used.
 */

export interface HeroCarouselImage {
  /** Same-origin path under `frontend/public/hero-carousel/`. */
  src: string;
  /** What the frame shows — kept for attribution and future a11y use. */
  alt: string;
}

export const HERO_CAROUSEL_IMAGES: readonly HeroCarouselImage[] = [
  {
    src: '/hero-carousel/hero-flood-delta.jpg',
    alt: 'Night satellite view of the flooded Bangladesh river delta, waterways glowing',
  },
  {
    src: '/hero-carousel/hero-monsoon-storm.jpg',
    alt: 'Monsoon storm clouds over a wide Bangladesh river at dusk',
  },
  {
    src: '/hero-carousel/hero-cyclone-orbit.jpg',
    alt: 'A cyclone spiralling over the Bay of Bengal, seen from orbit at night',
  },
  {
    src: '/hero-carousel/hero-flooded-fields.jpg',
    alt: 'Flooded farmland and a submerged village at blue hour',
  },
] as const;
