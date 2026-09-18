/**
 * Types for the shared JSON-LD builder (`structuredData.js`).
 *
 * The implementation is plain ESM JavaScript on purpose: `scripts/prerender.mjs` runs under Node
 * with no TypeScript step in front of it, so a `.ts` implementation would force either a second
 * copy of the graph or a build-time transpile. The SPA imports the same file and gets its types
 * from this declaration, which is why the `@graph` document type lives here and not beside the
 * implementation.
 */

export declare const SCHEMA_CONTEXT: string;

export interface Person {
  name: string;
  orcid: string;
  orcidUrl: string;
  github: string;
  linkedin: string;
  x: string;
  role: string;
}

export interface Attribution {
  author: Person;
  supervisor: { name: string; url: string; role: string };
  coSupervisor: { url: string; role: string };
  department: { name: string; university: string; url: string };
  work: { type: string; name: string; repository: string; citationText: string };
}

export interface DatasetHint {
  /** `hindcast-validation` is the committed hindcast reports' own dataset (Phase 9 §8.1). */
  kind: 'event-archive' | 'forecast' | 'hindcast-validation';
  name?: string;
  description?: string;
  temporalCoverage?: string;
  variableMeasured?: string[];
  keywords?: string[];
}

export interface StructuredDataHint {
  /** A place the page is about (district pages: the district). */
  place?: Record<string, unknown>;
  /** The dataset the page documents; only emitted when the deployment actually holds it. */
  dataset?: DatasetHint;
}

export interface StructuredDataRoute {
  path: string;
  title: string;
  description: string;
  label?: string;
  h1?: string;
  updated?: string;
  faqs?: Array<{ question: string; answer: string }>;
  breadcrumb?: Array<{ name: string; path?: string }>;
  structuredData?: StructuredDataHint;
}

export interface SiteConfig {
  name: string;
  origin: string;
  locale: string;
  defaultTitle: string;
  defaultDescription: string;
  twitter?: string;
  publisher: { name: string; url: string; logo: string; email: string };
}

export interface JsonLdGraph {
  '@context': string;
  '@graph': Array<Record<string, unknown>>;
  // A JSON-LD document is a map; the index signature lets it be handed to any consumer that
  // types its payload as `Record<string, unknown>` (the SPA's SeoHead does) without a cast.
  [key: string]: unknown;
}

export declare function canonicalUrl(origin: string, routePath: string): string;

export declare function personNodes(attribution: Attribution): {
  authorNode: Record<string, unknown>;
  supervisorNode: Record<string, unknown>;
  coSupervisorNode: Record<string, unknown>;
};

export declare function buildJsonLdGraph(options: {
  route: StructuredDataRoute;
  site: SiteConfig;
  /**
   * Required, and the implementation throws without `attribution.author.orcidUrl`. The Person
   * nodes are what make the pages attributable to the thesis author; a graph that quietly omits
   * them would be a worse answer than a failed build.
   */
  attribution: Attribution;
}): JsonLdGraph;

export default buildJsonLdGraph;
