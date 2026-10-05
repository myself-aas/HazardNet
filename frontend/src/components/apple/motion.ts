/**
 * Apple motion + theme hooks.
 *
 * Two rules from Apple's HIG, enforced here rather than per-component:
 *   · motion uses only compositor-friendly properties (opacity, transform,
 *     filter) — never width, height, top or left, which trigger layout
 *   · `prefers-reduced-motion: reduce` turns motion OFF, not down. Content is
 *     never hidden behind an animation that will not run.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** True when the user has asked the OS to reduce motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Live-binding version: flips if the user changes the OS setting mid-session. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export interface UseRevealOptions {
  /** Fraction of the element visible before it fires. */
  threshold?: number;
  /** Root margin — fire slightly before the element arrives. */
  rootMargin?: string;
  /** Reveal once and stop observing. Default true. */
  once?: boolean;
}

/**
 * Adds `.is-visible` when an element scrolls into view, driving the
 * `[data-mrd-reveal]` CSS transition.
 *
 * If IntersectionObserver is unavailable, or the user prefers reduced motion,
 * the element is marked visible immediately. Failing open is the correct
 * behaviour: the fallback for "cannot animate" must be "content is present",
 * never "content is invisible".
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options: UseRevealOptions = {}) {
  const { threshold = 0.12, rootMargin = '0px 0px -8% 0px', once = true } = options;
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Fail open: no observer, or motion not wanted → already visible.
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      node.classList.add('is-visible');
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          setVisible(true);
          if (once) observer.unobserve(entry.target);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, visible } as const;
}

/**
 * Scroll progress of an element through the viewport, 0 → 1.
 * rAF-throttled and passive, because a scroll handler that blocks is worse than
 * no scroll handler.
 */
export function useScrollProgress<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) return; // no scroll-linked motion under reduce

    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      // 0 when the top edge enters, 1 when the bottom edge leaves.
      const travelled = viewport - rect.top;
      const total = viewport + rect.height;
      setProgress(Math.min(1, Math.max(0, travelled / total)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return { ref, progress } as const;
}

/** True once the page has scrolled past `offset` px — drives the nav's
 *  transparent-over-hero → solid transition. */
export function useScrolledPast(offset = 24): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setPast(window.scrollY > offset);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [offset]);

  return past;
}

/* ────────────────────────────────────────────────────────────────────────────
   Theme
   ──────────────────────────────────────────────────────────────────────────── */

export type AppleThemeName = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'hazardnet.theme';

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The theme actually in effect on `<html>` right now — what the CSS is painting.
 *
 * Read from the DOM rather than from React state so it works for anything rendered outside the
 * hook's tree (the prerendered HTML, a portal, a component that never sees `useAppleTheme`),
 * and so a test can put the document in dark mode and assert what a component does with it.
 * `useResolvedTheme` below is the live version: it also hears about a change of theme, including
 * the OS flipping while the document is open.
 */
export function readAppliedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  const attribute = root.getAttribute('data-theme');
  if (attribute === 'dark' || attribute === 'light') return attribute;
  return root.classList.contains('dark') ? 'dark' : 'light';
}

/** Subscribers to the resolved theme, so one hook instance can tell every other one. */
const themeListeners = new Set<(theme: ResolvedTheme) => void>();

function announceTheme(theme: ResolvedTheme) {
  for (const listener of themeListeners) listener(theme);
}

/**
 * Resolves and applies the Apple theme to <html data-theme>.
 *
 * Apple's system colours adapt automatically; on the web that adaptation is this hook.
 * 'system' follows the OS and follows it live if the OS changes.
 *
 * DESIGN.md leaves dark mode under Known Gaps, so `styles/apple.css` §5 builds it from Apple's
 * own dark tiles (#252527 canvas / #272729 grouped / #2a2a2c raised) and switches links to Sky
 * Link Blue — one Apple language at two luminances, not a second design system.
 *
 * The default is 'system' - the answer the migration always wanted, and the
 * one P0-1 of the 2026-10-03 audit said could not be shipped until dark was complete. It was
 * held at 'light' while dark was 3.7% applied (an iOS user opening the app in the evening got a
 * light page with a dark panel nested inside it). It is now a theme layer:
 * `frontend/src/styles/apple.css` re-points the palette the utilities already resolve through, so
 * a page does not need `dark:` twins to be dark. `__tests__/darkTheme.test.js` is the gate - it
 * fails if a colour step is un-mapped, if a documented pair drops under AA, or if a colour family
 * appears in the source that the theme layer neither remaps nor allow-lists as a data encoding.
 */
export function useAppleTheme() {
  const [theme, setTheme] = useState<AppleThemeName>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = (name: AppleThemeName) => {
      const resolvedTheme = name === 'system' ? systemTheme() : name;
      // The attribute is always written, including for 'system'. apple.css §5 carries a
      // prefers-color-scheme arm scoped to :root:not([data-theme='light']) so a system-dark
      // visitor is already painted dark in the prerendered HTML; this just keeps the DOM
      // honest once React is live, and lets `light` positively override the OS.
      root.setAttribute('data-theme', resolvedTheme);
      root.classList.toggle('dark', resolvedTheme === 'dark');
      root.style.colorScheme = resolvedTheme;
      // Everything that renders theme-dependent artwork (the brand lockup is the one today)
      // subscribes here rather than re-reading the attribute on every render.
      announceTheme(resolvedTheme);
    };

    apply(theme);

    if (theme !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  const select = useCallback((name: AppleThemeName) => {
    setTheme(name);
    try {
      window.localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // Private mode / blocked storage. The theme still applies for this
      // session; persistence is a nicety, not a requirement.
    }
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? systemTheme() : theme;
  return { theme, setTheme: select, resolved } as const;
}

/**
 * The theme in effect, as React state: `<HazardNetBrand variant="auto">` and anything else that
 * ships different *artwork* per theme reads this, because CSS can re-point a colour but it
 * cannot repaint an `<img src>`.
 *
 * Rendered before the theme is applied (prerendered HTML, first paint) it answers `light`, the
 * same default the document has — so nothing flashes a white lockup onto a light page.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(readAppliedTheme);

  useEffect(() => {
    setResolved(readAppliedTheme());
    const listener = (theme: ResolvedTheme) => setResolved(theme);
    themeListeners.add(listener);
    return () => {
      themeListeners.delete(listener);
    };
  }, []);

  return resolved;
}
