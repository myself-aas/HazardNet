/**
 * @jest-environment node
 *
 * `/.well-known/ai-catalog.json` is an Agentic Resource Discovery (ARD) 1.0 catalog.
 * Lighthouse 13.5.0 added an "ai-catalog.json schema is valid" audit under its Agentic
 * Browsing category (2026-09-18), and a run against www.hazardnet.live on 2026-10-10
 * scored that category 1/3 because the file was missing the two required root members.
 *
 * The file used to carry a free-form shape (`name`, `version`, `origin`, `agents[]`,
 * `dns_aid`, `discovery`) under a `$schema` pointing at the Cloudflare Agent Skills
 * Discovery family. That is a different specification: ARD's own schema
 * (`ards-project/ard-spec`, `spec/schemas/ai-catalog.schema.json`) declares
 * `additionalProperties: false` at the root and permits only `specVersion`, `host` and
 * `entries`, so the two shapes are mutually exclusive and only ARD is what gets audited.
 *
 * The rules below are transcribed from that schema and from the ARD conformance CLI
 * (`conformance/bin/conformance-test`), not guessed. This suite exists because nothing
 * else in the build looks at the file: `backend/server.js` serves it verbatim and
 * `scripts/publish-dns-aid.mjs` keeps its own record list, so a regression here would
 * otherwise surface only as a Lighthouse score — or, worse, as a registry fetching a URL
 * that no longer exists.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ORIGIN = 'https://www.hazardnet.live';
const catalog = JSON.parse(
  readFileSync(join(root, 'frontend/public/.well-known/ai-catalog.json'), 'utf8')
);

/** ARD §4.2.1 / ai-catalog.schema.json `$defs.catalogEntry.properties.identifier`. */
const URN_PATTERN = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;

/** Members the root schema allows. `additionalProperties: false` — anything else fails. */
const ROOT_MEMBERS = new Set(['specVersion', 'host', 'entries']);
const HOST_MEMBERS = new Set([
  'displayName',
  'identifier',
  'documentationUrl',
  'logoUrl',
  'trustManifest',
]);
const ENTRY_MEMBERS = new Set([
  'identifier',
  'displayName',
  'type',
  'url',
  'data',
  'description',
  'tags',
  'capabilities',
  'representativeQueries',
  'version',
  'updatedAt',
  'metadata',
  'trustManifest',
]);

/**
 * Media types ARD treats as deprecated, mapped to their replacement. The conformance CLI
 * carries this table; using the old name is a silent interop bug rather than an error.
 */
const DEPRECATED_MEDIA_TYPES = {
  'application/mcp-server+json': 'application/mcp-server-card+json',
};

/** `metadata` is `additionalProperties: { type: [string, number, boolean, null] }`. */
const isScalar = (value) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

describe('ai-catalog.json — ARD 1.0 root', () => {
  it('carries the two required root members and nothing the schema forbids', () => {
    expect(catalog.specVersion).toBe('1.0'); // the schema pins enum: ["1.0"]
    expect(Array.isArray(catalog.entries)).toBe(true);
    expect(catalog.entries.length).toBeGreaterThan(0);

    const extra = Object.keys(catalog).filter((key) => !ROOT_MEMBERS.has(key));
    expect(extra).toEqual([]);
  });

  it('describes the publisher with only the members host allows', () => {
    expect(catalog.host).toBeDefined();
    expect(typeof catalog.host.displayName).toBe('string');
    expect(catalog.host.displayName.length).toBeGreaterThan(0);

    const extra = Object.keys(catalog.host).filter((key) => !HOST_MEMBERS.has(key));
    expect(extra).toEqual([]);

    // The URN publisher segment is the trust anchor, so it has to be the same domain the
    // host block and every entry URL claim.
    expect(catalog.host.identifier).toBe('did:web:hazardnet.live');
  });
});

describe('ai-catalog.json — entries', () => {
  const label = (entry) => entry.displayName || entry.identifier || '<unnamed>';

  it.each(catalog.entries.map((entry) => [label(entry), entry]))(
    '%s declares identifier, displayName and type',
    (_name, entry) => {
      expect(typeof entry.identifier).toBe('string');
      expect(typeof entry.displayName).toBe('string');
      expect(typeof entry.type).toBe('string');
      expect(entry.type).toMatch(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i);
    }
  );

  it.each(catalog.entries.map((entry) => [label(entry), entry]))(
    '%s uses a domain-anchored urn:air identifier',
    (_name, entry) => {
      expect(entry.identifier).toMatch(URN_PATTERN);
      // <publisher> must be the FQDN that anchors trust for the whole catalog.
      expect(entry.identifier.startsWith('urn:air:hazardnet.live:')).toBe(true);
      // A terminal short name is mandatory; `urn:air:hazardnet.live` alone is not an entry.
      expect(entry.identifier.split(':').length).toBeGreaterThanOrEqual(5);
    }
  );

  it('delivers every entry by exactly one of url or data', () => {
    for (const entry of catalog.entries) {
      const hasUrl = 'url' in entry;
      const hasData = 'data' in entry;
      // `url` XOR `data` — the schema expresses it as a oneOf with a `not` on the other.
      expect({ entry: label(entry), exactlyOne: hasUrl !== hasData }).toEqual({
        entry: label(entry),
        exactlyOne: true,
      });
    }
  });

  it('uses no member the entry schema forbids and no deprecated media type', () => {
    for (const entry of catalog.entries) {
      const extra = Object.keys(entry).filter((key) => !ENTRY_MEMBERS.has(key));
      expect({ entry: label(entry), extra }).toEqual({ entry: label(entry), extra: [] });
      expect(DEPRECATED_MEDIA_TYPES[entry.type]).toBeUndefined();
    }
  });

  it('keeps metadata values scalar, which is all the schema permits', () => {
    for (const entry of catalog.entries) {
      if (!entry.metadata) continue;
      for (const [key, value] of Object.entries(entry.metadata)) {
        // An array here (e.g. `authentication: ["bearer", ...]`) validates in most
        // hand-written checks and fails the real schema, so it is worth naming.
        expect({ entry: label(entry), key, scalar: isScalar(value) }).toEqual({
          entry: label(entry),
          key,
          scalar: true,
        });
      }
    }
  });

  it('keeps tags, capabilities and representativeQueries arrays of strings', () => {
    for (const entry of catalog.entries) {
      for (const field of ['tags', 'capabilities', 'representativeQueries']) {
        if (entry[field] === undefined) continue;
        expect(Array.isArray(entry[field])).toBe(true);
        for (const item of entry[field]) expect(typeof item).toBe('string');
      }
      // §4.2: SHOULD contain 2–5 examples. Outside that band the entry still validates
      // but ranks badly in a registry's vector index, so it is pinned rather than left
      // to drift down to one query.
      if (entry.representativeQueries) {
        const count = entry.representativeQueries.length;
        expect({ entry: label(entry), count, inBand: count >= 2 && count <= 5 }).toEqual({
          entry: label(entry),
          count,
          inBand: true,
        });
      }
    }
  });

  it('gives every entry a representativeQueries block, or it is not discoverable', () => {
    // The conformance CLI warns that an entry without this term "will not be found by
    // search — it is a valid catalog entry but not a discoverable ARD entry".
    const missing = catalog.entries
      .filter((entry) => !entry.representativeQueries)
      .map(label);
    expect(missing).toEqual([]);
  });
});

describe('ai-catalog.json — every published URL is real', () => {
  /**
   * Registries fetch every URL in a catalog, so a stale path is not a cosmetic problem:
   * it is a broken advertisement. `frontend/public/` is copied verbatim into `dist/` by
   * Vite, so a path existing there is the same as it existing on the live origin.
   */
  const publishedUrls = [
    ...catalog.entries.filter((entry) => entry.url).map((entry) => entry.url),
    catalog.host.logoUrl,
  ].filter(Boolean);

  it('publishes at least the artifact-backed entries', () => {
    expect(publishedUrls.length).toBeGreaterThanOrEqual(6);
  });

  it.each(publishedUrls)('%s is same-origin https', (url) => {
    expect(url.startsWith(`${ORIGIN}/`)).toBe(true);
  });

  it.each(publishedUrls)('%s resolves to a file shipped in frontend/public', (url) => {
    const path = url.slice(ORIGIN.length);
    expect(existsSync(join(root, 'frontend/public', path))).toBe(true);
  });

  it('points host documentation at a route the prerenderer actually emits', () => {
    const { documentationUrl } = catalog.host;
    expect(documentationUrl.startsWith(`${ORIGIN}/`)).toBe(true);

    const routePath = documentationUrl.slice(ORIGIN.length);
    const routes = JSON.parse(
      readFileSync(join(root, 'frontend/src/content/site-routes.json'), 'utf8')
    );
    const paths = (routes.routes || routes).map((route) => route.path || route);
    expect(paths).toContain(routePath);
  });
});
