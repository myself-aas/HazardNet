/**
 * The site's JSON-LD graph, built in exactly one place.
 *
 * WHY THIS IS SHARED
 * ------------------
 * Structured data has to describe the same page twice in this project: once in the static HTML
 * that `scripts/prerender.mjs` writes (what a crawler that does not run JavaScript reads) and
 * once, after a client-side navigation, by `usePageSeo` (what a crawler that does run JavaScript
 * reads). Two builders would eventually disagree — and disagreeing structured data is worse than
 * none, because a search engine that sees `WebSite` in the HTML and a different graph after
 * hydration may drop the rich result entirely.
 *
 * So the graph is a plain `.mjs` module: `prerender.mjs` imports it directly (Node ESM), the SPA
 * imports it through `structuredData.d.ts` (same file, typed), and
 * `frontend/__tests__/structuredData.test.js` asserts the two consumers emit byte-identical JSON
 * for the same route.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never invents a fact. Nodes are emitted only from the route's own committed content plus
 * `src/content/attribution.json`; a `Dataset` node for the historical event archive appears only
 * when the content engine actually loaded an archive (the engine passes the hint), so the markup
 * cannot claim a dataset this deployment does not have.
 *
 * `attribution` is a parameter rather than a module-level JSON import on purpose: this file is
 * loaded both by Vite (which resolves JSON imports happily) and by Node as plain ESM in
 * `scripts/prerender.mjs`, where a bare `import … from './x.json'` throws
 * ERR_IMPORT_ASSERTION_TYPE_MISSING without an import attribute. Taking the data as an argument
 * keeps one implementation usable from both runtimes.
 */

export const SCHEMA_CONTEXT = 'https://schema.org';

/** Routes that describe the software itself, not a page about a place or a dataset. */
const SOFTWARE_APPLICATION_ROUTES = new Set(['/', '/model', '/methodology']);

/** Routes whose Dataset node is the forecast snapshot (always shipped, downloadable at /download). */
const FORECAST_DATASET_ROUTES = new Set(['/data-sources', '/download']);

const trimSlash = (value = '') => String(value).replace(/\/+$/, '');

/** Canonical URL for a route path: `/` → `origin/`, `/about` → `origin/about`. */
export function canonicalUrl(origin, routePath) {
  const clean = trimSlash(routePath);
  return clean === '' ? `${trimSlash(origin)}/` : `${trimSlash(origin)}${clean}`;
}

/** The thesis author + supervisors as schema.org Person nodes, keyed by a stable @id. */
export function personNodes(attribution) {
  const { author, supervisor, coSupervisor, department } = attribution;
  const affiliation = {
    '@type': 'CollegeOrUniversity',
    name: department.university,
    url: department.url,
  };
  const authorNode = {
    '@type': 'Person',
    '@id': author.orcidUrl,
    name: author.name,
    identifier: { '@type': 'PropertyValue', propertyID: 'ORCID', value: author.orcid },
    url: author.github,
    sameAs: [author.orcidUrl, author.github, author.linkedin, author.x],
    affiliation: { ...affiliation, department: { '@type': 'Organization', name: department.name } },
    description: `${author.role}, ${department.name}, ${department.university}.`,
  };
  const supervisorNode = {
    '@type': 'Person',
    '@id': `${supervisor.url}#person`,
    name: supervisor.name,
    url: supervisor.url,
    affiliation,
    description: `${supervisor.role} — ${department.name}, ${department.university}.`,
  };
  const coSupervisorNode = {
    '@type': 'Person',
    '@id': `${coSupervisor.url}#person`,
    url: coSupervisor.url,
    affiliation,
    // The co-supervisor's name is not asserted: the repository has only the BAU CSM profile
    // URL, and guessing a name into structured data would be inventing a fact.
    description: `${coSupervisor.role} — ${department.name}, ${department.university}.`,
  };
  return { authorNode, supervisorNode, coSupervisorNode };
}

function datasetNode(route, origin, attribution) {
  const { authorNode } = personNodes(attribution);
  const hint = route.structuredData?.dataset;
  if (!hint) return null;
  if (hint.kind === 'event-archive') {
    return {
      '@type': 'Dataset',
      // A stable identifier for the archive itself, so the same dataset described on the
      // retrospectives and the district pages resolves to one node rather than several.
      '@id': `${trimSlash(origin)}/#event-archive`,
      name: hint.name,
      description: hint.description,
      url: `${origin}/data-sources`,
      spatialCoverage: { '@type': 'Place', name: 'Bangladesh' },
      ...(hint.temporalCoverage ? { temporalCoverage: hint.temporalCoverage } : {}),
      variableMeasured: hint.variableMeasured ?? [],
      creator: { '@id': authorNode['@id'] },
      citation: attribution.work.citationText,
      isAccessibleForFree: true,
      keywords: hint.keywords ?? [],
      // Deliberately no `license` and no `distribution`: this archive is compiled from
      // third-party sources and is not redistributed by this deployment. Claiming either
      // would assert something the repository cannot back up.
    };
  }
  return {
    '@type': 'Dataset',
    '@id': `${origin}/data-sources#forecast-archive`,
    name: 'HazardNet multi-hazard forecast archive (Bangladesh)',
    description:
      'Per-district hazard classification and severity forecasts for Bangladesh at 7- and 15-day horizons, derived from ERA5-Land, MODIS, Sentinel-1/2 and Open-Meteo, published as CSV and JSON with a provenance header on every snapshot.',
    url: `${origin}/download`,
    spatialCoverage: { '@type': 'Place', name: 'Bangladesh' },
    variableMeasured: ['hazard class', 'severity index', 'confidence bin', 'physics cross-check severity'],
    creator: { '@id': authorNode['@id'] },
    publisher: { '@id': `${trimSlash(origin)}/#organization` },
    license: `${origin}/terms`,
    isAccessibleForFree: true,
    citation: attribution.work.citationText,
  };
}

function breadcrumbNode(route, origin, pageUrl) {
  const trail = Array.isArray(route.breadcrumb) && route.breadcrumb.length > 0
    ? route.breadcrumb
    : [{ name: route.label ?? route.h1 ?? route.title, path: route.path }];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'HazardNet', item: `${trimSlash(origin)}/` },
      ...trail.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: crumb.name,
        item: canonicalUrl(origin, crumb.path ?? route.path),
      })),
    ],
  };
}

/**
 * Build the JSON-LD graph for one route.
 *
 * @param {object} options
 * @param {object} options.route    route content (site-routes.json or generated-routes.json entry)
 * @param {object} options.site     the `site` block of src/content/site-routes.json
 * @param {object} [options.attribution] attribution.json (defaults to the committed file)
 * @returns {object} the `@graph` document to serialise into `<script type="application/ld+json">`
 */
export function buildJsonLdGraph({ route, site, attribution }) {
  if (!attribution?.author?.orcidUrl) {
    throw new Error('buildJsonLdGraph: src/content/attribution.json must be passed as `attribution`');
  }
  const origin = trimSlash(site.origin);
  const siteOrigin = trimSlash(site.origin);
  const pageUrl = canonicalUrl(origin, route.path);
  const { authorNode, supervisorNode, coSupervisorNode } = personNodes(attribution);

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${siteOrigin}/#website`,
      url: `${siteOrigin}/`,
      name: site.name,
      description: site.defaultDescription,
      inLanguage: site.locale,
      publisher: { '@id': `${siteOrigin}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${siteOrigin}/#organization`,
      name: site.publisher.name,
      url: site.publisher.url,
      logo: site.publisher.logo,
      email: site.publisher.email,
      areaServed: { '@type': 'Country', name: 'Bangladesh' },
      founder: { '@id': authorNode['@id'] },
      member: [{ '@id': supervisorNode['@id'] }, { '@id': coSupervisorNode['@id'] }],
      sameAs: [attribution.work.repository],
      knowsAbout: [
        'flood early warning',
        'drought monitoring',
        'tropical cyclone risk',
        'agricultural disaster risk reduction',
      ],
    },
    authorNode,
    supervisorNode,
    coSupervisorNode,
  ];

  graph.push({
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: route.title,
    description: route.description,
    isPartOf: { '@id': `${siteOrigin}/#website` },
    inLanguage: site.locale,
    ...(route.updated ? { dateModified: route.updated } : {}),
    ...(route.structuredData?.place ? { about: route.structuredData.place } : {}),
  });

  if (SOFTWARE_APPLICATION_ROUTES.has(route.path)) {
    graph.push({
      '@type': 'SoftwareApplication',
      name: 'HazardNet',
      applicationCategory: 'WeatherApplication',
      operatingSystem: 'Web',
      url: `${siteOrigin}/`,
      description: site.defaultDescription,
      author: { '@id': authorNode['@id'] },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [
        'Multi-hazard forecasting for Bangladesh (8 hazard classes)',
        '7- and 15-day district outlooks with confidence bins',
        'Dual-track severity (model severity + formula-based physics estimate)',
        'Offline-capable map tiles and PDF export',
      ],
    });
  }

  if (FORECAST_DATASET_ROUTES.has(route.path)) {
    graph.push(datasetNode({ structuredData: { dataset: { kind: 'forecast' } } }, origin, attribution));
  }

  if (route.structuredData?.dataset) {
    const node = datasetNode(route, origin, attribution);
    if (node) graph.push(node);
  }

  if (Array.isArray(route.faqs) && route.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      isPartOf: { '@id': `${pageUrl}#webpage` },
      mainEntity: route.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  graph.push(breadcrumbNode(route, origin, pageUrl));

  return { '@context': SCHEMA_CONTEXT, '@graph': graph };
}

export default buildJsonLdGraph;
