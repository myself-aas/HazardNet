/**
 * frontend/src/components/SEOHead.tsx
 *
 * Implements dynamic document head management for client-side navigation (TASK-013, TRD §7.8):
 * - Open Graph & Twitter Cards for English and Bengali
 * - JSON-LD Structured Data for Dataset, Organization, and FAQPage schemas
 * - Dynamic Canonical & Robots tags
 */

import React, { useEffect } from 'react';
import { useI18n } from '../hooks/useI18n';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface DatasetMeta {
  name: string;
  description: string;
  temporalCoverage?: string;
  spatialCoverage?: string;
  variableMeasured?: string[];
  distributionUrl?: string;
}

export interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  faqs?: FAQItem[];
  dataset?: DatasetMeta;
  noindex?: boolean;
}

const CANONICAL_ORIGIN = 'https://www.hazardnet.live';
const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN}/hazardnet-og.png`;

export const ORGANIZATION_SCHEMA = {
  '@type': 'GovernmentOrganization',
  '@id': `${CANONICAL_ORIGIN}/#organization`,
  name: 'HazardNet Early Warning Research Initiative',
  alternateName: 'Department of Agrometeorology, Bangladesh Agricultural University',
  url: CANONICAL_ORIGIN,
  logo: `${CANONICAL_ORIGIN}/hazardnet-logo.png`,
  email: 'shuvoasifahmed@gmail.com',
  areaServed: {
    '@type': 'Country',
    name: 'Bangladesh',
  },
  parentOrganization: {
    '@type': 'CollegeOrUniversity',
    name: 'Bangladesh Agricultural University',
    url: 'https://www.bau.edu.bd',
  },
  knowsAbout: [
    'agricultural disaster risk reduction',
    'flood early warning systems',
    'cyclone track and storm surge modeling',
    'drought quantification and crop telemetry',
  ],
};

export const DEFAULT_DATASET_SCHEMA: DatasetMeta = {
  name: 'HazardNet Multi-Hazard Forecast & Advisory Dataset for Bangladesh',
  description:
    'Operational 7- and 15-day multi-hazard classifications, dual-track severity quantification, and agrometeorological advisories covering all 64 districts in Bangladesh.',
  temporalCoverage: '2000/2026',
  spatialCoverage: 'Bangladesh',
  variableMeasured: [
    'Hazard Classification (8 classes)',
    'Continuous Severity Score [0.0 - 1.0]',
    'Physics Cross-Check Severity',
    'Advisory Tier (SEVERE, WARNING, WATCH, NORMAL)',
    'Confidence Distribution (prob_top1/2/3)',
  ],
  distributionUrl: `${CANONICAL_ORIGIN}/download`,
};

export const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  path = '/',
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  faqs,
  dataset,
  noindex = false,
}) => {
  const { isBengali } = useI18n();

  const effectiveTitle = title
    ? `${title} · HazardNet`
    : isBengali
    ? 'হ্যাজার্ডনেট · বাংলাদেশ বহু-দুর্যোগ পূর্বাভাস ও কৃষি পরামর্শ'
    : 'HazardNet · Multi-Hazard AI Forecasting & Agricultural Risk Telemetry for Bangladesh';

  const effectiveDescription = description || (
    isBengali
      ? 'বাংলাদেশের সকল ৬৪ জেলার জন্য এআই-চালিত ৭ ও ১৫ দিনের দুর্যোগ ঝুঁকি পূর্বাভাস, পদার্থবিজ্ঞান-ভিত্তিক ক্রস-চেক ও কৃষি পরামর্শ।'
      : 'First-principles physics-grounded AI early warning system and agrometeorological advisories for 64 districts across Bangladesh.'
  );

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const canonicalUrl = `${CANONICAL_ORIGIN}${cleanPath === '/' ? '' : cleanPath}`;
  const locale = isBengali ? 'bn_BD' : 'en_US';
  const alternateLocale = isBengali ? 'en_US' : 'bn_BD';

  useEffect(() => {
    // 1. Update Title
    document.title = effectiveTitle;

    // Helper to set or create meta tag
    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Helper to set or create link tag
    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    // 2. Set Meta Description & Robots
    setMeta('name', 'description', effectiveDescription);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    // 3. Open Graph Tags
    setMeta('property', 'og:title', effectiveTitle);
    setMeta('property', 'og:description', effectiveDescription);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:locale', locale);
    setMeta('property', 'og:locale:alternate', alternateLocale);
    setMeta('property', 'og:site_name', 'HazardNet');

    // 4. Twitter Card Tags
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', effectiveTitle);
    setMeta('name', 'twitter:description', effectiveDescription);
    setMeta('name', 'twitter:image', ogImage);
    setMeta('name', 'twitter:site', '@HazardNet_BD');

    // 5. Canonical Link
    setLink('canonical', canonicalUrl);

    // 6. JSON-LD Structured Data
    const ds = dataset || (cleanPath === '/' || cleanPath === '/data-sources' || cleanPath === '/download' ? DEFAULT_DATASET_SCHEMA : null);

    const graph: any[] = [
      {
        '@type': 'WebSite',
        '@id': `${CANONICAL_ORIGIN}/#website`,
        url: `${CANONICAL_ORIGIN}/`,
        name: 'HazardNet',
        description: effectiveDescription,
        inLanguage: isBengali ? 'bn' : 'en',
        publisher: { '@id': `${CANONICAL_ORIGIN}/#organization` },
      },
      ORGANIZATION_SCHEMA,
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: effectiveTitle,
        description: effectiveDescription,
        isPartOf: { '@id': `${CANONICAL_ORIGIN}/#website` },
        inLanguage: isBengali ? 'bn' : 'en',
      },
    ];

    if (ds) {
      graph.push({
        '@type': 'Dataset',
        '@id': `${canonicalUrl}#dataset`,
        name: ds.name,
        description: ds.description,
        url: canonicalUrl,
        spatialCoverage: { '@type': 'Place', name: ds.spatialCoverage || 'Bangladesh' },
        ...(ds.temporalCoverage ? { temporalCoverage: ds.temporalCoverage } : {}),
        variableMeasured: ds.variableMeasured || [],
        creator: { '@id': `${CANONICAL_ORIGIN}/#organization` },
        publisher: { '@id': `${CANONICAL_ORIGIN}/#organization` },
        license: `${CANONICAL_ORIGIN}/terms`,
        isAccessibleForFree: true,
        ...(ds.distributionUrl
          ? {
              distribution: {
                '@type': 'DataDownload',
                contentUrl: ds.distributionUrl,
                encodingFormat: 'text/csv',
              },
            }
          : {}),
      });
    }

    if (faqs && faqs.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        isPartOf: { '@id': `${canonicalUrl}#webpage` },
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      });
    }

    const scriptId = 'hazardnet-jsonld-schema';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': graph,
    });
  }, [
    effectiveTitle,
    effectiveDescription,
    canonicalUrl,
    ogType,
    ogImage,
    locale,
    alternateLocale,
    noindex,
    faqs,
    dataset,
  ]);

  return null;
};

export default SEOHead;
