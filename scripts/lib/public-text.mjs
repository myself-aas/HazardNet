/**
 * One rule about repository locations on visitor surfaces, for the scripts that assemble
 * prerendered pages and authored content. Restored 2026-10-25: the file was deleted in
 * the history squash while three suites (`__tests__/publicText.test.js`,
 * `__tests__/noRepoPaths.test.js`, `__tests__/contentEngine.test.js`), one gate
 * (`scripts/check-public-paths.mjs`) and one builder (`scripts/build_content_engine.mjs`)
 * still imported it, so this restoration mirrors the surviving runtime twin
 * `frontend/src/lib/publicText.ts` — the parity suite asserts the two are one rule.
 *
 * A page may state where a number came from in words a reader can act on — a build time,
 * a coverage count, a link to a served artifact. It may not print a location in this
 * repository's tree, because a visitor cannot open one. Committed artifacts keep their
 * paths; visitor-facing strings drop them.
 */

/** Directories at the root of this repository whose contents are implementation. */
export const TREE_ROOTS = [
  'data',
  'scripts',
  'backend',
  'Models',
  'frontend',
  'docs',
  'src',
  'api',
  'agent',
  'assets',
  'workflows',
  '__tests__',
  'validation',
  '.github',
];

/** File extensions that make a path a file rather than prose about a directory. */
export const FILE_EXTENSIONS =
  '(?:json|csv|tsv|mjs|cjs|js|ts|tsx|jsx|py|md|yml|yaml|parquet|geojson|tif|tiff|nc|sql|txt|html|css|sh)';

/** A path into the tree: an implementation root, then anything, then a file extension. */
export const REPO_PATH_SOURCE = `(?:${TREE_ROOTS.join('|')})/[A-Za-z0-9_./-]+\\.${FILE_EXTENSIONS}`;

/**
 * Anchored on a boundary so a served URL (`/data/hazard-archive.json`, which begins with a
 * slash and resolves on the deployed origin) is not mistaken for a location in the tree.
 * This module's name for the rule; `frontend/src/lib/publicText.ts` calls the same pattern
 * `REPO_PATH_PATTERN` and `__tests__/publicText.test.js` asserts the sources are identical.
 */
export const REPO_PATH = new RegExp(`(?:^|[\\s(,{'"\`\\[>=])(${REPO_PATH_SOURCE})`);

/** True when the string names a file or directory in this repository. */
export function namesRepoFile(value) {
  if (typeof value !== 'string') return false;
  return REPO_PATH.test(value);
}

/**
 * Delete every parenthetical that names a file in the tree, together with the space that
 * separated it from the word before it.
 *
 * Deletion, not replacement: the sentence keeps the claim it made and loses the location it
 * pointed at. A path that is not inside parentheses is left alone, because removing it would
 * take the grammar with it; those are edited at the source instead.
 */
export function withoutRepoPaths(text) {
  if (typeof text !== 'string') return text;
  return text.replace(new RegExp(`\\s*\\([^()]*${REPO_PATH_SOURCE}[^()]*\\)`, 'g'), '');
}

/**
 * The entries of a machine-readable record that may be shown to a visitor: everything
 * except the values that name a location in the tree. The record keeps them, because a
 * script auditing this page needs them; the surface does not print them.
 */
export function publishableEntries(record, skipKeys = []) {
  if (!record) return [];
  return Object.entries(record)
    .filter(([key]) => !skipKeys.includes(key))
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .filter(([, value]) => !namesRepoFile(String(value)))
    .map(([key, value]) => [key.replace(/_/g, ' '), String(value)]);
}

/**
 * Keys whose values are machine provenance, not visitor copy: the committed artifact keeps
 * these paths (an auditor needs them; a page never renders them), so the leak scan walks
 * past them. Everything else in the document is rendered text and IS scanned. Adding a key
 * here is publishing an exception — accompany it with a why.
 *
 * Proven by the builder itself: `scripts/build_content_engine.mjs` runs findRepoPaths()
 * over `{ ...summary, routes }` immediately before writing generated-routes.json, and the
 * committed artifact still carries `generated_by`, `inputs` and `freshness_hint`. The scan
 * can only have passed by not walking into them.
 */
export const PROVENANCE_KEYS = new Set(['$comment', 'generated_by', 'freshness_hint', 'inputs']);

/**
 * Walk a parsed JSON document and yield `{ pointer, value }` for every string value that
 * names a location in the tree. The pointer is a JSON-pointer-style path (`/sources/0/label`)
 * so the offender can be found in the file without printing it to a visitor.
 * Provenance keys (PROVENANCE_KEYS) are skipped, per the rule above.
 */
export function findRepoPaths(data, pointer = '') {
  const found = [];
  if (typeof data === 'string') {
    if (namesRepoFile(data)) found.push({ pointer, value: data });
    return found;
  }
  if (Array.isArray(data)) {
    data.forEach((item, index) => found.push(...findRepoPaths(item, `${pointer}/${index}`)));
    return found;
  }
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (PROVENANCE_KEYS.has(key)) continue;
      found.push(...findRepoPaths(value, `${pointer}/${key}`));
    }
  }
  return found;
}
