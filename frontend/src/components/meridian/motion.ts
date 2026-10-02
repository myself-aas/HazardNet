/**
 * Meridian motion + theme hooks.
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

export type MeridianThemeName = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'hazardnet.theme';

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolves and applies the Meridian theme to <html data-mrd-theme>.
 *
 * Apple's system colours adapt automatically; on the web that adaptation is
 * this hook. 'system' follows the OS and follows it live if the OS changes.
 */
export function useMeridianTheme() {
  const [theme, setTheme] = useState<MeridianThemeName>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = (name: MeridianThemeName) => {
      root.setAttribute('data-mrd-theme', name === 'system' ? systemTheme() : name);
    };

    apply(theme);

    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  const select = useCallback((name: MeridianThemeName) => {
    setTheme(name);
    try {
      window.localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // Private mode / blocked storage. The theme still applies for this
      // session; persistence is a nicety, not a requirement.
    }
  }, []);

  return { theme, setTheme: select, resolved: systemTheme() } as const;
}
