import React from 'react';
import CardStackTable from './ui/CardStackTable';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from './Breadcrumbs';
import MaterialIcon from './MaterialIcon';
import { usePageSeo } from '../hooks/usePageSeo';

/**
 * Long-form public page renderer (methodology, model card, data sources, FAQ).
 *
 * Copy is NOT in this file: it lives in src/content/site-routes.json, which the
 * build-time prerenderer reads as well. That keeps the crawlable HTML and the
 * interactive page byte-for-byte consistent — the failure mode this guards
 * against is a beautifully written static page that the SPA then overwrites
 * with different text.
 */

interface SectionLink {
  label: string;
  href: string;
}

interface SectionTable {
  caption?: string;
  columns: string[];
  rows: string[][];
}

interface Section {
  h2?: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: { tone?: string; text?: string };
  links?: SectionLink[];
  /**
   * A data table, carried in the route content rather than fetched, so the page the crawler and
   * the page the visitor sees are the same numbers (Phase 9 §8.1 — `/model-performance`). The
   * wrapper scrolls horizontally on a phone: a wide table must never widen the document, which
   * the E2E overflow check would (correctly) fail.
   */
  table?: SectionTable;
}

const CALLOUT_STYLES: Record<string, string> = {
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-carbon-30 bg-carbon-05 text-carbon-80',
  danger: 'border-rose-300 bg-rose-50 text-rose-950',
};

const InlineLink: React.FC<{ link: SectionLink }> = ({ link }) => {
  const external = /^https?:\/\//i.test(link.href);
  if (external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-ap-link hover:text-ap-link underline underline-offset-4"
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.href} className="font-bold text-ap-link hover:text-ap-link underline underline-offset-4">
      {link.label}
    </Link>
  );
};

const SectionTableBlock: React.FC<{ table: SectionTable }> = ({ table }) => (
  <CardStackTable columns={table.columns} rows={table.rows} caption={table.caption} />
);

/**
 * `introSlot` lets a page inject live content (the `/status` freshness panel) directly under
 * the shared header, so the long-form copy and the live numbers come from one renderer
 * instead of two that can drift.
 */
export const ArticlePage: React.FC<{ path: string; introSlot?: React.ReactNode }> = ({ path, introSlot }) => {
  const content = usePageSeo(path);

  if (!content) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-16 text-center">
        <h1 className="text-xl font-black text-carbon-90">Page unavailable</h1>
        <p className="text-sm text-carbon-60">
          This page&apos;s content could not be loaded. Return to the{' '}
          <Link to="/live" className="font-bold text-ap-link">
            live map
          </Link>
          .
        </p>
      </div>
    );
  }

  const sections = (content.sections ?? []) as Section[];
  const faqs = content.faqs ?? [];

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto max-w-3xl space-y-6 text-carbon-80"
    >
      <Breadcrumbs />

      {/* A document, not a dashboard. Every section used to be its own bordered white card, so a
          nine-section methodology page was nine boxes of equal weight with no hierarchy above the
          paragraph. The column is one surface now, sections are separated by a hairline, and the
          heading ramp is set two steps above body so a reader skimming for a section can see one. */}
      <header className="space-y-4">
        <h1 className="text-ap-lead font-bold leading-tight tracking-tight text-carbon-90 sm:text-ap-display-md">
          {content.h1 ?? content.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-carbon-60">{content.label ?? 'Reference'}</span>
          {content.updated && (
            <span className="text-xs font-medium text-carbon-60">
              Last reviewed <time dateTime={content.updated}>{content.updated}</time>
            </span>
          )}
        </div>
        {content.standfirst && (
          <p className="max-w-[68ch] text-lg leading-[1.55] text-carbon-70">{content.standfirst}</p>
        )}
      </header>

      {introSlot}

      <div className="divide-y divide-carbon-20">
        {sections.map((section, index) => (
          <section key={index} className="space-y-3 py-7 first:pt-2 last:pb-0">
            {section.h2 && (
              <h2 className="text-xl font-bold tracking-tight text-carbon-90 sm:text-2xl">{section.h2}</h2>
            )}
            {(section.paragraphs ?? []).map((paragraph, i) => (
              <p key={i} className="max-w-[68ch] break-words text-base leading-[1.62] text-carbon-80">
                {paragraph}
              </p>
            ))}
            {(section.bullets ?? []).length > 0 && (
              <ul className="space-y-2">
                {(section.bullets ?? []).map((bullet, i) => (
                  <li key={i} className="flex max-w-[68ch] gap-2 text-base leading-[1.62] text-carbon-80">
                    <MaterialIcon name="chevron_right" className="mt-0.5 shrink-0 text-sm text-carbon-40" />
                    {/* `break-words`: the truth-set citations carry full URLs, and an unbroken
                        90-character URL is 126px of document-level overflow on a 375px phone. */}
                    <span className="min-w-0 break-words">{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.table && <SectionTableBlock table={section.table} />}
            {section.callout?.text && (
              <div
                className={`border p-4 text-base leading-[1.62] ${
                  CALLOUT_STYLES[section.callout.tone ?? 'info'] ?? CALLOUT_STYLES.info
                }`}
                role={section.callout.tone === 'warning' ? 'note' : undefined}
              >
                {section.callout.text}
              </div>
            )}
            {(section.links ?? []).length > 0 && (
              <nav aria-label="Related pages" className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {(section.links ?? []).map((link) => (
                  <InlineLink key={link.href} link={link} />
                ))}
              </nav>
            )}
          </section>
        ))}
      </div>

      {faqs.length > 0 && (
        <section aria-label="Frequently asked questions" className="space-y-2 border-t border-carbon-20 pt-7">
          <h2 className="mb-2 text-xl font-bold tracking-tight text-carbon-90 sm:text-2xl">Questions and answers</h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-carbon-20 py-2 last:border-b-0">
              <summary className="cursor-pointer list-none text-base font-bold text-carbon-80 marker:hidden">
                <span className="inline-flex items-start gap-2">
                  <MaterialIcon name="help" className="mt-0.5 text-sm text-carbon-40" />
                  {faq.question}
                </span>
              </summary>
              <p className="mt-2 max-w-[68ch] pl-6 text-base leading-[1.62] text-carbon-70">{faq.answer}</p>
            </details>
          ))}
        </section>
      )}

      <footer className="border-t border-carbon-20 pt-6 text-sm leading-[1.62] text-carbon-70">
        HazardNet is an independent decision-support platform. It does not replace official warnings from the Bangladesh
        Meteorological Department (BMD), the Flood Forecasting and Warning Centre (FFWC), the Department of Disaster
        Management (DDM) or your local administration. National emergency hotline: 999.{' '}
        <Link to="/contact" className="font-bold text-ap-link hover:text-ap-link">
          Report a problem
        </Link>
        .
      </footer>
    </motion.article>
  );
};

export default ArticlePage;
