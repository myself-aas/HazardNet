#!/usr/bin/env node
/**
 * Icon glyph generator — restored 2026-10-25 (the file was deleted in the history
 * squash; `__tests__/iconFamily.test.js`, `npm run icons:build` and `npm run icons:check`
 * all invoke this exact path, so the path is part of the contract).
 *
 * One icon family for both platforms (data/design/icon-registry.json, decision recorded
 * there): Lucide. This script renders the registry's icon names into
 * `packages/design-system/src/icons.ts`:
 *
 *   - web renders the names with `lucide-react`;
 *   - the native shell renders the same path data with `react-native-svg`.
 *
 * The glyph bodies are pulled from the *installed* lucide-react package
 * (`dist/esm/icons/*.mjs`, each module declares `__iconData = { name, size, node, aliases }`),
 * so a dependency bump is a deliberate, reviewable diff here rather than a silent
 * visual change. `key` props (React reconciliation hints) are stripped — the native
 * renderer does not need them, and they are unstable across lucide versions.
 *
 * Why aliases matter: lucide renames glyphs between releases (e.g. the registry's
 * `Waves` resolves to the module `waves-horizontal.mjs`, which lists `aliases: ["waves"]`).
 * Resolution therefore goes through an alias index built from the installed package, not
 * from filenames, so a rename upgrades in place instead of failing.
 *
 * Modes:
 *   (default)   write packages/design-system/src/icons.ts
 *   --check     regenerate in memory and fail if the committed file differs
 *
 * Run: npm run icons:build | npm run icons:check
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REGISTRY = join(ROOT, 'data/design/icon-registry.json');
const GENERATED = join(ROOT, 'packages/design-system/src/icons.ts');
const CHECK_ONLY = process.argv.includes('--check');

function pascalToKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function pascalToModuleStem(name) {
  // lucide module filenames are the kebab name; digits form their own segment
  // (BarChart3 -> bar-chart-3, Waves -> waves).
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

/** Parse one icon module's `__iconData` object without executing it. */
function parseIconData(source, file) {
  const block = source.match(/__iconData = \{[\s\S]*?\n\};/);
  if (!block) throw new Error(`no __iconData block in ${file}`);
  // The block is a plain JS object literal: quote the bare keys and choke on anything
  // unexpected rather than eval-ing it.
  const literal = block[0].slice('__iconData = '.length, -1); // strip trailing ';'
  const json = literal.replace(/(\w+):/g, '"$1":').replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(json);
}

/** Build kebab-name/alias -> module path for the installed lucide-react. */
function buildIconIndex(iconsDir) {
  const index = new Map();
  const files = readdirSync(iconsDir).filter((f) => f.endsWith('.mjs'));
  for (const file of files) {
    const full = join(iconsDir, file);
    const source = readFileSync(full, 'utf8');
    // Alias re-export stubs (`export { default } from './waves-horizontal.mjs'`) carry no
    // __iconData; skip them — the aliasing is declared on the canonical module instead.
    if (!source.includes('__iconData')) continue;
    const data = parseIconData(source, file);
    index.set(data.name, full);
    for (const alias of data.aliases ?? []) index.set(alias, full);
  }
  return index;
}

async function resolveGlyph(index, pascalName) {
  const kebab = pascalToModuleStem(pascalName);
  const file = index.get(kebab);
  if (!file) {
    throw new Error(
      `icon "${pascalName}" (${kebab}) is not in the installed lucide-react package — ` +
        `check data/design/icon-registry.json against node_modules/lucide-react/dist/esm/icons/`,
    );
  }
  const mod = await import(pathToFileURL(file).href);
  const data = mod.__iconData;
  if (!data?.node) throw new Error(`icon module ${basename(file)} exported no __iconData.node`);
  // Strip the React `key` hint from every attribute bag; keep attribute order as authored.
  return data.node.map(([tag, attrs]) => {
    const { key: _key, ...rest } = attrs ?? {};
    return [tag, rest];
  });
}

const nodeEntry = ([tag, attrs]) => `[${JSON.stringify(tag)}, ${JSON.stringify(attrs)}]`;

function emit(registry, version, glyphs) {
  const names = registry.names;
  const sizes = Object.entries(registry.sizes)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${v}`)
    .join(',\n');
  const nameList = names.map((n) => `  ${JSON.stringify(n)},`).join('\n');
  const paths = names
    .map(
      (n) =>
        `  ${JSON.stringify(n)}: [\n` +
        glyphs[n].map((entry) => `    ${nodeEntry(entry)},`).join('\n') +
        '\n  ],',
    )
    .join('\n');

  return `/**
 * GENERATED FILE - do not edit.
 *
 * One icon family for both platforms, generated by scripts/generate-icon-glyphs.mjs from
 * data/design/icon-registry.json and lucide-react@${version} (the one icon dependency the repo
 * declares). Web renders these names with \`lucide-react\`; the native shell renders the same path
 * data with \`react-native-svg\`, so an icon means the same thing on both.
 *
 * To add an icon: add its lucide name to the registry and run \`npm run icons:build\`.
 * \`__tests__/iconFamily.test.js\` fails if a call site imports a name that is not here.
 */

/** The decided family. Not a preference: the only icon package the repo declares. */
export const ICON_FAMILY = "lucide" as const;

/** The package that owns the glyph bodies on web. Native renders ICON_PATHS instead. */
export const ICON_PACKAGE = "lucide-react" as const;

/** Lucide's own version these paths were generated from. */
export const ICON_SOURCE_VERSION = "${version}" as const;

/**
 * One stroke weight for the whole app. Lucide's default is 2, which reads heavy next to
 * Apple's hairlines (skill3 bans the thick-stroke look); at ${registry.strokeWidth} the glyphs match the
 * 1px border weight and stay legible at 14-16px.
 */
export const ICON_STROKE = ${registry.strokeWidth} as const;

/** Named sizes. The values are the same on web (px) and native (dp/pt). */
export const ICON_SIZES = {
${sizes}
} as const;

/** Every icon name the app is allowed to use. */
export const ICON_NAMES = [
${nameList}
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** \`[tag, attributes]\`, the subset of SVG the family uses. */
export type IconNode = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

/**
 * Name -> glyph. Data only: no React, no DOM, so the native shell can consume it as-is.
 * The 24px grid and \`viewBox="0 0 24 24"\` are the family's contract on both platforms.
 */
export const ICON_PATHS: Readonly<Record<IconName, IconNode>> = {
${paths}
};

/** The family's own coordinate system. Both renderers must set exactly this viewBox. */
export const ICON_VIEW_BOX = "0 0 24 24" as const;

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value);
}
`;
}

async function main() {
  const require = createRequire(import.meta.url);
  const lucidePkg = require(join(ROOT, 'node_modules/lucide-react/package.json'));
  const version = lucidePkg.version;
  const iconsDir = join(ROOT, 'node_modules/lucide-react/dist/esm/icons');

  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  if (!Array.isArray(registry.names) || !registry.names.length) {
    throw new Error('data/design/icon-registry.json has no names[] — refusing to generate an empty family');
  }

  const index = buildIconIndex(iconsDir);
  const glyphs = {};
  for (const name of registry.names) glyphs[name] = await resolveGlyph(index, name);

  const next = emit(registry, version, glyphs);
  const current = readFileSync(GENERATED, 'utf8');

  if (CHECK_ONLY) {
    if (next !== current) {
      console.error(
        `[icons] packages/design-system/src/icons.ts is out of sync with ` +
          `data/design/icon-registry.json + lucide-react@${version}. Run: npm run icons:build`,
      );
      process.exit(1);
    }
    console.log(`[icons] in sync (${registry.names.length} glyphs, lucide-react@${version})`);
    return;
  }

  if (next === current) {
    console.log(`[icons] already in sync (${registry.names.length} glyphs, lucide-react@${version})`);
    return;
  }
  writeFileSync(GENERATED, next);
  console.log(`[icons] wrote ${registry.names.length} glyphs from lucide-react@${version}`);
}

main().catch((err) => {
  console.error(`[icons] ${err.message}`);
  process.exit(1);
});
