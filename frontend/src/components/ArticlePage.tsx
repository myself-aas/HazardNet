import React from 'react';
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
  danger: 'border-rose-300 bg-white text-nasa-red-shade',
};

const InlineLink: React.FC<{ link: SectionLink }> = ({ link }) => {
  const external = /^https?:\/\//i.test(link.href);
  if (external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-nasa-blue-shade hover:text-nasa-blue underline underline-offset-4"
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.href} className="font-bold text-nasa-blue-shade hover:text-nasa-blue underline underline-offset-4">
      {link.label}
    </Link>
  );
};

const SectionTableBlock: React.FC<{ table: SectionTable }> = ({ table }) => (
  <div className="w-full min-w-0 overflow-x-auto border border-carbon-20">
    <table className="w-full border-collapse text-left text-xs">
      {table.caption && <caption className="bg-carbon-05 px-3 py-2 text-left text-xs text-carbon-60">{table.caption}</caption>}
      <thead>
        <tr className="bg-carbon-10/80">
          {table.columns.map((column) => (
            <th key={column} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-carbon-70">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-t border-carbon-20 align-top">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={`px-3 py-2 ${cellIndex === 0 ? 'font-medium text-carbon-80' : 'text-carbon-60'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
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
          This page&apos;s content could not be loaded. Return to the <Link to="/live" className="font-bold text-nasa-blue-shade">live map</Link>.
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
      className="mx-auto max-w-4xl space-y-6 text-carbon-80"
    >
      <Breadcrumbs />

      <header className="space-y-4 border border-carbon-20 bg-white p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm border border-carbon-20 bg-carbon-05 px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-900">
            {content.label ?? 'Reference'}
          </span>
          {content.updated && (
            <span className="text-xs font-medium text-carbon-60">
              Last reviewed <time dateTime={content.updated}>{content.updated}</time>
            </span>
          )}
        </div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-carbon-90 sm:text-[32px]">{content.h1 ?? content.title}</h1>
        {content.standfirst && <p className="max-w-3xl text-base leading-[1.62] text-carbon-60">{content.standfirst}</p>}
      </header>

      {introSlot}

      {sections.map((section, index) => (
        <section key={index} className="space-y-3 border border-carbon-20 bg-white p-6 md:p-7">
          {section.h2 && <h2 className="text-lg font-bold text-carbon-90">{section.h2}</h2>}
          {(section.paragraphs ?? []).map((paragraph, i) => (
            <p key={i} className="break-words text-base leading-[1.62] text-carbon-60">
              {paragraph}
            </p>
          ))}
          {(section.bullets ?? []).length > 0 && (
            <ul className="space-y-2 pl-1">
              {(section.bullets ?? []).map((bullet, i) => (
                <li key={i} className="flex gap-2 text-base leading-[1.62] text-carbon-60">
                  <MaterialIcon name="chevron_right" className="mt-0.5 shrink-0 text-sm text-amber-600" />
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

      {faqs.length > 0 && (
        <section aria-label="Frequently asked questions" className="space-y-2 border border-carbon-20 bg-white p-6 md:p-7">
          <h2 className="mb-2 text-lg font-bold text-carbon-90">Questions and answers</h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-carbon-20 py-2 last:border-b-0">
              <summary className="cursor-pointer list-none text-base font-bold text-carbon-80 marker:hidden">
                <span className="inline-flex items-start gap-2">
                  <MaterialIcon name="help" className="mt-0.5 text-sm text-amber-600" />
                  {faq.question}
                </span>
              </summary>
              <p className="mt-2 pl-6 text-base leading-[1.62] text-carbon-60">{faq.answer}</p>
            </details>
          ))}
        </section>
      )}

      <footer className="border border-carbon-20 bg-carbon-05 p-5 text-base leading-[1.62] text-carbon-60">
        HazardNet is an independent decision-support platform. It does not replace official warnings from the Bangladesh
        Meteorological Department (BMD), the Flood Forecasting and Warning Centre (FFWC), the Department of Disaster
        Management (DDM) or your local administration. National emergency hotline: 999.{' '}
        <Link to="/contact" className="font-bold text-nasa-blue-shade hover:text-nasa-blue">
          Report a problem
        </Link>
        .
      </footer>
    </motion.article>
  );
};

export default ArticlePage;
