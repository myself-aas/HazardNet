/**
 * Document-head manager for the blog pages.
 *
 * React Router has no per-route <head>, so the blog applies its SEO metadata
 * imperatively: title, description, keywords, robots, canonical, Open Graph,
 * Twitter card and JSON-LD structured data. Every apply() returns a cleanup
 * that restores the previous title/description and removes created nodes —
 * so client-side navigation between articles never leaks metadata.
 *
 * Pure DOM only (no react-helmet) to keep the lockfile untouched; the logic
 * is exercised by jsdom unit tests.
 */

import { useEffect, useMemo } from 'react';
import type { SeoHead } from './blogSeo';

export interface HeadManager {
  apply: (head: SeoHead) => () => void;
}

function upsertMeta(doc: Document, attr: 'name' | 'property', key: string, content: string, created: Element[]): void {
  let el = doc.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attr, key);
    doc.head.appendChild(el);
    created.push(el);
  }
  el.setAttribute('content', content);
}

export function createHeadManager(doc: Document = document): HeadManager {
  return {
    apply(head: SeoHead) {
      const created: Element[] = [];
      const previousTitle = doc.title;
      const previousDescription =
        doc.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.getAttribute('content') ?? null;

      doc.title = head.title;

      upsertMeta(doc, 'name', 'description', head.description, created);
      if (head.keywords.length > 0) {
        upsertMeta(doc, 'name', 'keywords', head.keywords.join(', '), created);
      }
      upsertMeta(doc, 'name', 'robots', head.robots, created);

      // Canonical link
      let canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = doc.createElement('link');
        canonical.rel = 'canonical';
        doc.head.appendChild(canonical);
        created.push(canonical);
      }
      canonical.href = head.canonical;

      // Open Graph
      upsertMeta(doc, 'property', 'og:title', head.title, created);
      upsertMeta(doc, 'property', 'og:description', head.description, created);
      upsertMeta(doc, 'property', 'og:type', head.ogType, created);
      upsertMeta(doc, 'property', 'og:url', head.canonical, created);
      upsertMeta(doc, 'property', 'og:site_name', 'HazardNet', created);
      if (head.ogImage) upsertMeta(doc, 'property', 'og:image', head.ogImage, created);
      if (head.publishedTime) upsertMeta(doc, 'property', 'article:published_time', head.publishedTime, created);
      if (head.modifiedTime) upsertMeta(doc, 'property', 'article:modified_time', head.modifiedTime, created);
      if (head.ogType === 'article' && head.authorName) {
        upsertMeta(doc, 'property', 'article:author', head.authorName, created);
      }
      if (head.section) upsertMeta(doc, 'property', 'article:section', head.section, created);
      for (const tag of head.tags) {
        upsertMeta(doc, 'property', 'article:tag', tag, created);
      }

      // Twitter card
      upsertMeta(doc, 'name', 'twitter:card', head.ogImage ? 'summary_large_image' : 'summary', created);
      upsertMeta(doc, 'name', 'twitter:title', head.title, created);
      upsertMeta(doc, 'name', 'twitter:description', head.description, created);
      if (head.ogImage) upsertMeta(doc, 'name', 'twitter:image', head.ogImage, created);

      // JSON-LD structured data (Article + FAQPage @graph)
      let jsonLdScript: HTMLScriptElement | null = null;
      if (head.jsonLd) {
        jsonLdScript = doc.createElement('script');
        jsonLdScript.type = 'application/ld+json';
        jsonLdScript.setAttribute('data-hazardnet-seo', 'true');
        jsonLdScript.textContent = JSON.stringify(head.jsonLd);
        doc.head.appendChild(jsonLdScript);
      }

      return () => {
        doc.title = previousTitle;
        if (previousDescription !== null) {
          doc.head
            .querySelector<HTMLMetaElement>('meta[name="description"]')
            ?.setAttribute('content', previousDescription);
        }
        created.forEach((el) => el.remove());
        jsonLdScript?.remove();
      };
    },
  };
}

/** React hook: applies the SEO head for the lifetime of the calling page. */
export function useSeoHead(head: SeoHead): void {
  const manager = useMemo(() => createHeadManager(document), []);
  useEffect(() => manager.apply(head), [manager, head]);
}
