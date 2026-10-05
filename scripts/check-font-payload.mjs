#!/usr/bin/env node
/** Enforce the 50 KiB local web-font budget against assets the web source actually references. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const frontendRoot = join(repoRoot, 'frontend');
const sourceRoot = join(frontendRoot, 'src');
const publicFontsRoot = join(frontendRoot, 'public', 'fonts');
const requireFrontend = createRequire(join(frontendRoot, 'package.json'));
const fontFiles = new Set();

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function addFaceAssets(cssPath, cssText) {
  for (const [, face] of cssText.matchAll(/@font-face\s*\{([^}]+)\}/gi)) {
    for (const [, quote, url] of face.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) {
      if (/^https?:/i.test(url)) {
        throw new Error(`Remote font URL is not allowed: ${url} (${relative(repoRoot, cssPath)})`);
      }
      if (!/\.(?:woff2?|ttf|otf)$/i.test(url)) continue;
      const file = url.startsWith('@fontsource/')
        ? requireFrontend.resolve(url)
        : resolve(dirname(cssPath), url);
      if (!existsSync(file)) throw new Error(`Missing local font asset: ${file}`);
      fontFiles.add(file);
    }
  }
}

for (const cssPath of walk(sourceRoot).filter((file) => extname(file) === '.css')) {
  const cssText = readFileSync(cssPath, 'utf8');
  addFaceAssets(cssPath, cssText);

  for (const [, specifier] of cssText.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?\s*;/gi)) {
    if (!specifier.startsWith('@fontsource/')) continue;
    let importedCss;
    try {
      importedCss = requireFrontend.resolve(specifier);
    } catch (error) {
      throw new Error(`Unable to resolve font stylesheet ${specifier}: ${error.message}`);
    }
    addFaceAssets(importedCss, readFileSync(importedCss, 'utf8'));
  }
}

for (const file of walk(publicFontsRoot).filter((candidate) => /\.(?:woff2?|ttf|otf)$/i.test(candidate))) {
  fontFiles.add(file);
}

const files = [...fontFiles]
  .map((file) => ({ name: relative(repoRoot, file), bytes: statSync(file).size }))
  .sort((a, b) => a.name.localeCompare(b.name));
const total = files.reduce((sum, file) => sum + file.bytes, 0);
const budget = 50 * 1024;
console.log(`[fonts] ${files.length} referenced local face(s), ${(total / 1024).toFixed(2)} KiB / 50.00 KiB`);
for (const file of files) console.log(`  ${file.name} ${(file.bytes / 1024).toFixed(2)} KiB`);
if (total > budget) {
  console.error('[fonts] ABORT: referenced local font payload exceeds the 50 KiB edge budget.');
  process.exit(1);
}
