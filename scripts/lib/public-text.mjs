/**
 * One rule about repository locations on visitor surfaces, shared by the build scripts.
 *
 * A page may state where a number came from in words a reader can act on — a build time,
 * a coverage count, a link to a served artifact. It may not print a location in this
 * repository's tree, because a visitor cannot open one: `scripts/severity.py` is
 * not a thing a person reading on a phone during a flood can do anything with, and every
 * character of a public surface has to earn its place.
 *
 * The rule is applied where prose is assembled, not where data is stored. Committed
 * artifacts keep the paths — they are what makes a number auditable by a script — and the
 * surface drops them. That is deliberate: `docs/PUBLIC_SURFACE.md` §3 records the
 * decision, and the machine-readable copy of every page still carries its provenance.
 *
 * The browser-side twin of this module is `frontend/src/lib/publicText.ts`, which the
 * components use for the same job at render time. `__tests__/publicText.test.js` fails if
 * the two implementations disagree, so the rule cannot drift between build and runtime.
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
 */
export const REPO_PATH = new RegExp(
  `(?:^|[\\s(,{'"\`\\[>=])(${REPO_PATH_SOURCE})`,
);

/** True when the string names a file or directory in this repository. */
export function namesRepoFile(value) {
  if (typeof value !== 'string') return false;
  return REPO_PATH.test(value);
}

/**
 * Delete every parenthetical that names a file in the tree, together with the space that
 * separated it from the word before it.
 *
 * Deletion, not replacement: the sentence keeps the claim it made and loses the location
 * it pointed at. "…the independent physics cross-check (scripts/severity.py) run
 * on environmental drivers" becomes "…the independent physics cross-check run on environmental
 * drivers". A path that is not inside parentheses is left alone, because removing it
 * would take the grammar with it; those are edited at the source instead.
 */
export function withoutRepoPaths(text) {
  if (typeof text !== 'string') return text;
  return text.replace(new RegExp(`\\s*\\([^()]*${REPO_PATH_SOURCE}[^()]*\\)`, 'g'), '');
}

/**
 * The entries of a machine-readable record that may be shown to a visitor: everything
 * except the values that name a location in the tree.
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
 * Record fields that carry a location on purpose and are never rendered.
 *
 * `artifact`, `inputs`, `path` and `source_path` are the machine-readable provenance the
 * committed artifacts exist to hold; `generated_by` and `freshness_hint` are build
 * metadata; `$comment` is the reasoning that travels with the data in this repository.
 * Build-side only — the browser twin has no use for it, because a component never walks a
 * record looking for leaks, it filters what it renders.
 */
export const MACHINE_PROVENANCE_KEYS = new Set([
  '$comment',
  'artifact',
  'freshness_hint',
  'generated_at',
  'generated_by',
  'inputs',
  'origin',
  'path',
  'schema',
  'source_path',
]);

/**
 * Every rendered string in a data structure that names a location in this repository,
 * reported as `{ pointer, value }` pairs.
 *
 * A build script calls this on what it is about to publish and fails rather than shipping
 * a page that prints a path. It exists because the leak does not always come from a literal
 * in the script: an interpolated field (`${archive.source_path}`) or a string read out of a
 * data file (a validation report's `cnn_note`) is invisible to a grep of the source and only
 * appears in the document, sometimes only once the data it depends on is present.
 */
export function findRepoPaths(node, pointer = '$') {
  const found = [];
  if (typeof node === 'string') {
    if (namesRepoFile(node)) found.push({ pointer, value: node });
  } else if (Array.isArray(node)) {
    node.forEach((item, index) => found.push(...findRepoPaths(item, `${pointer}[${index}]`)));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (MACHINE_PROVENANCE_KEYS.has(key)) continue;
      found.push(...findRepoPaths(value, `${pointer}.${key}`));
    }
  }
  return found;
}
