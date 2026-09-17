/**
 * @jest-environment node
 *
 * The site's JSON-LD graph (Phase 8, structured data).
 *
 * Structured data is a promise to a search engine: "here is what this page is". A graph that
 * claims a `Dataset` the deployment does not have, or an author whose ORCID is misspelled, is
 * worse than no graph at all — the rich result is dropped and the citation is wrong. So this
 * suite pins the three things that can rot:
 *
 *   1. the node set per route class (WebSite, Organization, Person, WebPage, FAQPage,
 *      BreadcrumbList, Dataset, SoftwareApplication);
 *   2. the attribution values, verbatim, inside the Person nodes;
 *   3. the honesty rule: the historical-archive `Dataset` appears **only** when the content
 *      engine loaded an archive, and it never carries a licence or a distribution URL the
 *      repository cannot back up.
 *
 * It also compares the graph the builder produces with the graph in the built HTML, because
 * those are two consumers (the SPA and the prerenderer) of one implementation and a divergence
 * between them is exactly the failure this sharing is meant to prevent.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildJsonLdGraph, canonicalUrl, personNodes } from '../frontend/src/lib/structuredData.js';

const repoRoot = join(__dirname, '..');
const siteRoutes = JSON.parse(readFileSync(join(repoRoot, 'frontend/src/content/site-routes.json'), 'utf8'));
const attribution = JSON.parse(readFileSync(join(repoRoot, 'frontend/src/content/attribution.json'), 'utf8'));
const generated = JSON.parse(readFileSync(join(repoRoot, 'frontend/src/content/generated-routes.json'), 'utf8'));

const SITE = siteRoutes.site;
const ORIGIN = 'https://www.hazardnet.live';

const routeByPath = (routes, path) => {
  const found = routes.find((route) => route.path === path);
  if (!found) throw new Error(`no route ${path} in the fixture set`);
  return found;
};

const typesOf = (graph) => graph['@graph'].map((node) => node['@type']);
const nodeOf = (graph, type) => graph['@graph'].find((node) => node['@type'] === type);

describe('the JSON-LD graph', () => {
  it('describes the site and the organisation on every route', () => {
    const graph = buildJsonLdGraph({ route: routeByPath(siteRoutes.routes, '/'), site: SITE, attribution });
    expect(typesOf(graph)).toEqual(expect.arrayContaining(['WebSite', 'Organization', 'WebPage']));
    const website = nodeOf(graph, 'WebSite');
    expect(website['@id']).toBe(`${ORIGIN}/#website`);
    expect(website.url).toBe(`${ORIGIN}/`);
    expect(website.inLanguage).toBe('en');
    expect(website.publisher['@id']).toBe(`${ORIGIN}/#organization`);
  });

  it('carries the thesis attribution verbatim, as Person nodes', () => {
    const graph = buildJsonLdGraph({ route: routeByPath(siteRoutes.routes, '/about'), site: SITE, attribution });
    const people = graph['@graph'].filter((node) => node['@type'] === 'Person');
    expect(people).toHaveLength(3);
    const author = people.find((person) => person.identifier?.value === '0009-0003-5734-1519');
    expect(author['@id']).toBe('https://orcid.org/0009-0003-5734-1519');
    expect(author.name).toBe('Ashif Ahmed Shuvo');
    expect(author.sameAs).toEqual([
      'https://orcid.org/0009-0003-5734-1519',
      'https://github.com/myself-aas',
      'https://www.linkedin.com/in/me-aas',
      'https://x.com/myself_aas',
    ]);
    const supervisor = people.find((person) => person.url === 'https://bau.edu.bd/profile/AGRON1013');
    expect(supervisor.name).toBe('Dr. Ahmed Khairul Hasan');
    expect(supervisor['@id']).toBe('https://bau.edu.bd/profile/AGRON1013#person');
    expect(people.map((person) => person['@id'])).toContain('https://csm.bau.edu.bd/teachers/CSM1007#person');
    // The founder link ties the published organisation back to the thesis author.
    expect(nodeOf(graph, 'Organization').founder['@id']).toBe(author['@id']);
    expect(nodeOf(graph, 'Organization').member).toHaveLength(2);
  });

  it('never invents a name for the co-supervisor, whose only known identifier is a URL', () => {
    const { coSupervisorNode } = personNodes(attribution);
    expect(coSupervisorNode.name).toBeUndefined();
    expect(coSupervisorNode.description).toContain('Co-supervisor');
  });

  it('builds a breadcrumb trail from the route instead of a two-item stub', () => {
    const route = routeByPath(generated.routes, '/districts/bhola');
    const graph = buildJsonLdGraph({ route, site: SITE, attribution });
    const trail = nodeOf(graph, 'BreadcrumbList').itemListElement;
    expect(trail.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(trail.map((item) => item.name)).toEqual(['HazardNet', 'District outlooks', 'Bhola']);
    expect(trail[2].item).toBe(`${ORIGIN}/districts/bhola`);
  });

  it('publishes a FAQPage only when the route has FAQs, and answers every question', () => {
    const withFaqs = buildJsonLdGraph({ route: routeByPath(siteRoutes.routes, '/faq'), site: SITE, attribution });
    const faq = nodeOf(withFaqs, 'FAQPage');
    expect(faq).toBeDefined();
    expect(faq.mainEntity.length).toBeGreaterThan(0);
    for (const question of faq.mainEntity) {
      expect(question['@type']).toBe('Question');
      expect(question.name).toBeTruthy();
      expect(question.acceptedAnswer.text.length).toBeGreaterThan(20);
    }
    const withoutFaqs = buildJsonLdGraph({
      route: { path: '/x', title: 'X', description: 'X' },
      site: SITE,
      attribution,
    });
    expect(typesOf(withoutFaqs)).not.toContain('FAQPage');
  });

  it('emits the forecast dataset on the pages that document it', () => {
    for (const path of ['/data-sources', '/download']) {
      const graph = buildJsonLdGraph({ route: routeByPath(siteRoutes.routes, path), site: SITE, attribution });
      const dataset = nodeOf(graph, 'Dataset');
      expect(dataset['@id']).toBe(`${ORIGIN}/data-sources#forecast-archive`);
      expect(dataset.spatialCoverage.name).toBe('Bangladesh');
      expect(dataset.isAccessibleForFree).toBe(true);
      expect(dataset.citation).toContain('Shuvo');
      expect(dataset.creator['@id']).toBe('https://orcid.org/0009-0003-5734-1519');
    }
  });

  it('emits the historical archive dataset only when the engine loaded an archive', () => {
    const district = generated.routes.find((route) => route.path.startsWith('/districts/'));
    const withoutArchive = buildJsonLdGraph({ route: district, site: SITE, attribution });
    expect(noArchiveDatasets(withoutArchive)).toHaveLength(0);

    const withArchive = buildJsonLdGraph({
      route: {
        ...district,
        structuredData: {
          ...district.structuredData,
          dataset: {
            kind: 'event-archive',
            name: 'HazardNet historical hazard event archive (Bangladesh, 2000–2025)',
            temporalCoverage: '2000-01-01/2025-12-31',
            variableMeasured: ['hazard class'],
          },
        },
      },
      site: SITE,
      attribution,
    });
    const archiveNode = nodeOf(withArchive, 'Dataset');
    expect(archiveNode['@id']).toBe(`${ORIGIN}/#event-archive`);
    expect(archiveNode.temporalCoverage).toBe('2000-01-01/2025-12-31');
    // Compiled from third-party sources and not redistributed: no licence, no distribution, and
    // the description says so rather than implying the rows are downloadable here.
    expect(archiveNode.license).toBeUndefined();
    expect(archiveNode.distribution).toBeUndefined();
  });

  it('keeps every URL on the canonical www host', () => {
    const serialised = JSON.stringify([
      buildJsonLdGraph({ route: routeByPath(siteRoutes.routes, '/'), site: SITE, attribution }),
      buildJsonLdGraph({ route: routeByPath(generated.routes, '/hazards/flood'), site: SITE, attribution }),
      buildJsonLdGraph({ route: routeByPath(generated.routes, '/districts/bhola'), site: SITE, attribution }),
    ]);
    // Apex URLs are the failure mode (the email address `contact@hazardnet.live` is not one).
    expect(serialised).not.toMatch(/https?:\/\/(?!www\.)hazardnet\.live/);
    expect(serialised).toContain('https://www.hazardnet.live/');
    expect(canonicalUrl(ORIGIN, '/')).toBe(`${ORIGIN}/`);
    expect(canonicalUrl(ORIGIN, '/districts/bhola/')).toBe(`${ORIGIN}/districts/bhola`);
  });
});

function noArchiveDatasets(graph) {
  return graph['@graph'].filter(
    (node) => node['@type'] === 'Dataset' && String(node['@id']).includes('event-archive')
  );
}

describe('the graph in the built HTML matches the graph the SPA builds', () => {
  // Guarded on dist: the comparison is meaningless before `npm run build`, and the suite says so
  // rather than passing silently. CI builds before it tests, so it runs there.
  const built = existsSync(join(repoRoot, 'frontend', 'dist', 'index.html'));
  const maybeIt = built ? it : it.skip;

  const graphIn = (relativePath) => {
    const html = readFileSync(join(repoRoot, 'frontend', 'dist', relativePath), 'utf8');
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    return JSON.parse(match[1]);
  };

  for (const [file, path] of [
    ['index.html', '/'],
    ['data-sources/index.html', '/data-sources'],
    ['hazards/flood/index.html', '/hazards/flood'],
    ['districts/bhola/index.html', '/districts/bhola'],
  ]) {
    maybeIt(`${file} carries the same @graph the renderer would produce`, () => {
      const route =
        siteRoutes.routes.find((candidate) => candidate.path === path) ??
        generated.routes.find((candidate) => candidate.path === path);
      expect(graphIn(file)).toEqual(buildJsonLdGraph({ route, site: SITE, attribution }));
    });
  }
});
