/**
 * One rule about repository locations on visitor surfaces, for the components that render
 * data at runtime.
 *
 * A page may state where a number came from in words a reader can act on — a build time, a
 * coverage count, a link to a served artifact. It may not print a location in this
 * repository's tree, because a visitor cannot open one. The committed artifacts keep their
 * paths; the surface drops them. `docs/PUBLIC_SURFACE.md` §3 records the decision.
 *
 * The build-side twin of this module is `scripts/lib/public-text.mjs`, which applies the
 * same rule where the prerendered pages are assembled. `__tests__/publicText.test.js`
 * fails if the two disagree, so the rule cannot drift between build and runtime.
 *
 *   namesRepoFile('backend/data/forecasts/manifest.json')  // true  — a location in the tree
 *   namesRepoFile('run `node scripts/build_archive.mjs`')   // true  — a command is a location
 *   namesRepoFile('/data/hazard-archive.json')              // false — a URL this site serves
 *   namesRepoFile('2,931 event-district observations')      // false — a published number
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
] as const;

/** File extensions that make a path a file rather than prose about a directory. */
export const FILE_EXTENSIONS =
  '(?:json|csv|tsv|mjs|cjs|js|ts|tsx|jsx|py|md|yml|yaml|parquet|geojson|tif|tiff|nc|sql|txt|html|css|sh)';

/** A path into the tree: an implementation root, then anything, then a file extension. */
export const REPO_PATH_SOURCE = `(?:${TREE_ROOTS.join('|')})/[A-Za-z0-9_./-]+\\.${FILE_EXTENSIONS}`;

/**
 * Anchored on a boundary so a served URL (`/data/hazard-archive.json`, which begins with a
 * slash and resolves on the deployed origin) is not mistaken for a location in the tree.
 */
export const REPO_PATH_PATTERN = new RegExp(`(?:^|[\\s(,{'"\`\\[>=])(${REPO_PATH_SOURCE})`);

/** True when the string names a file or directory in this repository. */
export function namesRepoFile(value: string): boolean {
  if (typeof value !== 'string') return false;
  return REPO_PATH_PATTERN.test(value);
}

/**
 * Delete every parenthetical that names a file in the tree, together with the space that
 * separated it from the word before it.
 *
 * Deletion, not replacement: the sentence keeps the claim it made and loses the location it
 * pointed at. A path that is not inside parentheses is left alone, because removing it would
 * take the grammar with it; those are edited at the source instead.
 */
export function withoutRepoPaths(text: string): string {
  if (typeof text !== 'string') return text;
  return text.replace(new RegExp(`\\s*\\([^()]*${REPO_PATH_SOURCE}[^()]*\\)`, 'g'), '');
}

/**
 * The entries of a machine-readable record that may be shown to a visitor: everything
 * except the values that name a location in the tree. The record keeps them, because a
 * script auditing this page needs them; the surface does not print them.
 */
export function publishableEntries(
  record: Record<string, unknown> | null | undefined,
  skipKeys: readonly string[] = [],
): [string, string][] {
  if (!record) return [];
  return Object.entries(record)
    .filter(([key]) => !skipKeys.includes(key))
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .filter(([, value]) => !namesRepoFile(String(value)))
    .map(([key, value]) => [key.replace(/_/g, ' '), String(value)] as [string, string]);
}
