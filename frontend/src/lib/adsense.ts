/**
 * Google AdSense configuration for the HazardNet blog (the only monetized
 * surface — ads load exclusively on /blogs and /blogs/:slug).
 *
 * Configure via environment variables (no secrets — the AdSense client id is
 * public by design):
 *   VITE_ADSENSE_CLIENT              e.g. ca-pub-1234567890123456
 *   VITE_ADSENSE_SLOT_BLOG_INDEX     ad unit on the /blogs index
 *   VITE_ADSENSE_SLOT_ARTICLE_INLINE in-article ad on /blogs/:slug
 *   VITE_ADSENSE_SLOT_ARTICLE_FOOTER end-of-article ad on /blogs/:slug
 *
 * Until VITE_ADSENSE_CLIENT is set the script tag is never injected, so the
 * site stays clean for AdSense site-approval crawls; editors see reserved
 * placeholder boxes locally (dev mode) to keep layouts honest.
 */

/** AdSense publisher id ("ca-pub-…"), empty when not configured. */
export const ADSENSE_CLIENT: string =
  (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() ?? '';

/** Ad unit ids created in the AdSense dashboard. */
export const ADSENSE_SLOT_BLOG_INDEX: string =
  (import.meta.env.VITE_ADSENSE_SLOT_BLOG_INDEX as string | undefined)?.trim() ?? '';
export const ADSENSE_SLOT_ARTICLE_INLINE: string =
  (import.meta.env.VITE_ADSENSE_SLOT_ARTICLE_INLINE as string | undefined)?.trim() ?? '';
export const ADSENSE_SLOT_ARTICLE_FOOTER: string =
  (import.meta.env.VITE_ADSENSE_SLOT_ARTICLE_FOOTER as string | undefined)?.trim() ?? '';

/** True when the publisher id looks like a real ca-pub- id. */
export const isAdSenseConfigured: boolean = /^ca-pub-\d{10,}$/.test(ADSENSE_CLIENT);

/** True in local dev builds — controls placeholder rendering. */
export const isAdSenseDevMode: boolean = import.meta.env.DEV === true;

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

/** Push an ad-fill request onto the AdSense queue (no-op before the script loads). */
export function requestAdFill(): void {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // AdSense script not loaded (blocked/not configured) — ignore.
  }
}

/** Inject the AdSense loader once per page (blog routes only). Returns cleanup. */
export function injectAdSenseScript(doc: Document = document): (() => void) | null {
  if (!isAdSenseConfigured) return null;
  // Site-verification meta required by AdSense "ads.txt / site ownership".
  if (!doc.querySelector('meta[name="google-adsense-account"]')) {
    const meta = doc.createElement('meta');
    meta.name = 'google-adsense-account';
    meta.content = ADSENSE_CLIENT;
    doc.head.appendChild(meta);
  }
  if (doc.querySelector('script[data-hazardnet-adsense]')) return null;
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-hazardnet-adsense', 'true');
  doc.head.appendChild(script);
  return () => {
    script.remove();
  };
}
