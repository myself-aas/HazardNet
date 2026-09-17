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

interface Section {
  h2?: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: { tone?: string; text?: string };
  links?: SectionLink[];
}

const CALLOUT_STYLES: Record<string, string> = {
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-slate-300 bg-slate-50 text-slate-800',
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
        className="font-bold text-amber-700 hover:text-amber-900 underline underline-offset-4"
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.href} className="font-bold text-amber-700 hover:text-amber-900 underline underline-offset-4">
      {link.label}
    </Link>
  );
};

export const ArticlePage: React.FC<{ path: string }> = ({ path }) => {
  const content = usePageSeo(path);

  if (!content) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-16 text-center">
        <h1 className="text-xl font-black text-slate-900">Page unavailable</h1>
        <p className="text-sm text-slate-600">
          This page&apos;s content could not be loaded. Return to the <Link to="/" className="font-bold text-amber-700">live map</Link>.
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
      className="mx-auto max-w-4xl space-y-6 text-slate-800"
    >
      <Breadcrumbs />

      <header className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-900">
            {content.label ?? 'Reference'}
          </span>
          {content.updated && (
            <span className="text-xs font-medium text-slate-500">
              Last reviewed <time dateTime={content.updated}>{content.updated}</time>
            </span>
          )}
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">{content.h1 ?? content.title}</h1>
        {content.standfirst && <p className="max-w-3xl text-xs leading-relaxed text-slate-600 md:text-sm">{content.standfirst}</p>}
      </header>

      {sections.map((section, index) => (
        <section key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs md:p-7">
          {section.h2 && <h2 className="text-lg font-bold text-slate-900">{section.h2}</h2>}
          {(section.paragraphs ?? []).map((paragraph, i) => (
            <p key={i} className="text-xs leading-relaxed text-slate-600 md:text-sm">
              {paragraph}
            </p>
          ))}
          {(section.bullets ?? []).length > 0 && (
            <ul className="space-y-2 pl-1">
              {(section.bullets ?? []).map((bullet, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-600 md:text-sm">
                  <MaterialIcon name="chevron_right" className="mt-0.5 shrink-0 text-sm text-amber-600" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {section.callout?.text && (
            <div
              className={`rounded-xl border p-4 text-xs leading-relaxed md:text-sm ${
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
        <section aria-label="Frequently asked questions" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs md:p-7">
          <h2 className="mb-2 text-lg font-bold text-slate-900">Questions and answers</h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-slate-200 py-2 last:border-b-0">
              <summary className="cursor-pointer list-none text-xs font-bold text-slate-800 marker:hidden md:text-sm">
                <span className="inline-flex items-start gap-2">
                  <MaterialIcon name="help" className="mt-0.5 text-sm text-amber-600" />
                  {faq.question}
                </span>
              </summary>
              <p className="mt-2 pl-6 text-xs leading-relaxed text-slate-600 md:text-sm">{faq.answer}</p>
            </details>
          ))}
        </section>
      )}

      <footer className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-[11px] leading-relaxed text-slate-500">
        HazardNet is an independent decision-support platform. It does not replace official warnings from the Bangladesh
        Meteorological Department (BMD), the Flood Forecasting and Warning Centre (FFWC), the Department of Disaster
        Management (DDM) or your local administration. National emergency hotline: 999.{' '}
        <Link to="/contact" className="font-bold text-amber-700 hover:text-amber-900">
          Report a problem
        </Link>
        .
      </footer>
    </motion.article>
  );
};

export default ArticlePage;
