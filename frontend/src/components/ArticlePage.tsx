import React from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import MaterialIcon from './MaterialIcon';
import CardStackTable from './ui/CardStackTable';
import {
  DocsFormulaSet,
  DocsProcessFigure,
  DocsStatChart,
  DocsTableOfContents,
  DocsTopicGrid,
  type DocsChartDefinition,
  type DocsFigureDefinition,
  type DocsFormulaDefinition,
  type DocsTopic,
  type TocItem,
} from './docs/DocsVisuals';
import { usePageSeo } from '../hooks/usePageSeo';

/**
 * Long-form public page renderer. Copy lives in src/content/site-routes.json so the
 * prerendered HTML and the hydrated React page use the same facts, figures and tables.
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
  topics?: DocsTopic[];
  chart?: DocsChartDefinition;
  formulas?: DocsFormulaDefinition[];
  figure?: DocsFigureDefinition;
  table?: SectionTable;
}

const CALLOUT_STYLES: Record<string, string> = {
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-carbon-30 bg-carbon-05 text-carbon-80',
  danger: 'border-rose-300 bg-rose-50 text-rose-950',
};

const InlineLink: React.FC<{ link: SectionLink }> = ({ link }) => {
  const external = /^https?:\/\//i.test(link.href);
  const dataAsset = /^\/data\/[^\s?#]+\.(?:json|csv)$/i.test(link.href);
  if (external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="ap-link underline underline-offset-4"
      >
        {link.label}
      </a>
    );
  }
  if (dataAsset) {
    return (
      <a href={link.href} className="ap-link underline underline-offset-4">
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.href} className="ap-link underline underline-offset-4">
      {link.label}
    </Link>
  );
};

const SectionTableBlock: React.FC<{ table: SectionTable }> = ({ table }) => (
  <CardStackTable columns={table.columns} rows={table.rows} caption={table.caption} />
);

export function sectionAnchorId(heading: string, index: number): string {
  const slug = heading
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
  return `docs-${index + 1}-${slug}`;
}

function isDocumentationRoute(path: string): boolean {
  return path === '/docs' || path.startsWith('/docs/');
}

/**
 * `introSlot` lets a page inject live content (the `/status` freshness panel) directly under
 * the shared header, so the long-form copy and the live numbers come from one renderer.
 */
export const ArticlePage: React.FC<{ path: string; introSlot?: React.ReactNode }> = ({ path, introSlot }) => {
  const content = usePageSeo(path);

  if (!content) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-16 text-center">
        <h1 className="ap-tagline">Page unavailable</h1>
        <p className="text-ap-body-sm text-carbon-60">
          This page&apos;s content could not be loaded. Return to the{' '}
          <Link to="/live" className="ap-link">
            live map
          </Link>
          .
        </p>
      </div>
    );
  }

  const sections = (content.sections ?? []) as Section[];
  const faqs = content.faqs ?? [];
  const isDocsRoute = isDocumentationRoute(path);
  const tocItems: TocItem[] = sections.flatMap((section, index) => section.h2
    ? [{ id: sectionAnchorId(section.h2, index), label: section.h2 }]
    : []);
  if (faqs.length > 0) tocItems.push({ id: 'frequently-asked-questions', label: 'Questions and answers' });
  const hasToc = isDocsRoute && tocItems.length >= 2;

  return (
    <article className={`ap-enter mx-auto ${hasToc ? 'max-w-7xl' : 'max-w-3xl'} text-carbon-80`}>
      <div className={hasToc ? 'grid gap-6 lg:grid-cols-[14rem_minmax(0,52rem)] lg:gap-10' : 'space-y-6'}>
        <div className={hasToc ? 'lg:col-span-2' : ''}>
          <Breadcrumbs />
        </div>
        {hasToc && (
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto py-2">
              <DocsTableOfContents items={tocItems} variant="desktop" />
            </div>
          </aside>
        )}
        <div className={`min-w-0 ${hasToc ? 'lg:col-start-2 lg:row-start-2' : ''}`}>
          <header className="space-y-4">
            <h1 className="ap-display-md">
              {content.h1 ?? content.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ap-label-sm font-medium text-carbon-60">{content.label ?? 'Reference'}</span>
              {content.updated && (
                <span className="text-ap-label-sm font-medium text-carbon-60">
                  Last reviewed <time dateTime={content.updated}>{content.updated}</time>
                </span>
              )}
            </div>
            {content.standfirst && (
              <p className="max-w-[68ch] text-ap-body-lg text-carbon-70">{content.standfirst}</p>
            )}
          </header>

          {hasToc && <DocsTableOfContents items={tocItems} variant="mobile" />}
          {introSlot}

          <div className="divide-y divide-carbon-20">
            {sections.map((section, index) => (
              <section key={index} className="space-y-3 py-7 first:pt-2 last:pb-0">
                {section.h2 && (
                  <h2 id={sectionAnchorId(section.h2, index)} className="scroll-mt-24 ap-tagline">
                    {section.h2}
                  </h2>
                )}
                {(section.paragraphs ?? []).map((paragraph, i) => (
                  <p key={i} className="max-w-[68ch] break-words text-ap-body-md text-carbon-80">
                    {paragraph}
                  </p>
                ))}
                {(section.bullets ?? []).length > 0 && (
                  <ul className="space-y-2">
                    {(section.bullets ?? []).map((bullet, i) => (
                      <li key={i} className="flex max-w-[68ch] gap-2 text-ap-body-md text-carbon-80">
                        <MaterialIcon name="chevron_right" className="mt-0.5 shrink-0 text-ap-label-md text-carbon-40" />
                        <span className="min-w-0 break-words">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {section.topics && <DocsTopicGrid topics={section.topics} />}
                {section.figure && <DocsProcessFigure figure={section.figure} />}
                {section.formulas && section.formulas.length > 0 && <DocsFormulaSet formulas={section.formulas} />}
                {section.chart && <DocsStatChart chart={section.chart} />}
                {section.table && <SectionTableBlock table={section.table} />}
                {section.callout?.text && (
                  <div
                    className={`rounded-lg border p-4 text-ap-body-md ${
                      CALLOUT_STYLES[section.callout.tone ?? 'info'] ?? CALLOUT_STYLES.info
                    }`}
                    role="note"
                    aria-label={`${section.callout.tone ?? 'info'} documentation note`}
                  >
                    <strong className="font-semibold">
                      {section.callout.tone === 'warning' ? 'Warning' : section.callout.tone === 'danger' ? 'Important' : 'Information'}:{' '}
                    </strong>
                    {section.callout.text}
                  </div>
                )}
                {(section.links ?? []).length > 0 && (
                  <nav aria-label="Related pages" className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                    {(section.links ?? []).map((link) => <InlineLink key={link.href} link={link} />)}
                  </nav>
                )}
              </section>
            ))}
          </div>

          {faqs.length > 0 && (
            <section id="frequently-asked-questions" aria-label="Frequently asked questions" className="space-y-2 border-t border-carbon-20 pt-7">
              <h2 className="mb-2 ap-tagline">Questions and answers</h2>
              {faqs.map((faq) => (
                <details key={faq.question} className="group border-b border-carbon-20 py-2 last:border-b-0">
                  <summary className="cursor-pointer list-none ap-body-strong marker:hidden">
                    <span className="inline-flex items-start gap-2">
                      <MaterialIcon name="help" className="mt-0.5 text-ap-label-md text-carbon-40" />
                      {faq.question}
                    </span>
                  </summary>
                  <p className="mt-2 max-w-[68ch] pl-6 text-ap-body-md text-carbon-70">{faq.answer}</p>
                </details>
              ))}
            </section>
          )}

          <footer className="border-t border-carbon-20 pt-6 text-ap-body-sm text-carbon-70">
            HazardNet is an independent decision-support platform. It does not replace official warnings from the Bangladesh
            Meteorological Department (BMD), the Flood Forecasting and Warning Centre (FFWC), the Department of Disaster
            Management (DDM) or your local administration. National emergency hotline: 999.{' '}
            <Link to="/contact" className="ap-link hover:text-ap-link">
              Report a problem
            </Link>
            .
          </footer>
        </div>
      </div>
    </article>
  );
};

export default ArticlePage;
