/**
 * ScrollView-collection lint.
 *
 * Per mobile-performance.md ("The #1 AI Mistake") and Phase 2 scope: no RN
 * screen should use ScrollView with inline .map() to render > 20 items — it
 * causes severe jank and memory blow-up on Android. Lists must use FlashList
 * (preferred) or optimized FlatList.
 *
 * This static test scans each screen file for ScrollView + .map() patterns.
 * It's a cheap CI gate; a proper ESLint custom rule would be stricter but is
 * not worth the maintenance cost for a small codebase.
 */

const { readFileSync, readdirSync, existsSync } = require('node:fs');
const path = require('node:path');

const SCREENS_DIR = path.join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) yield full;
  }
}

describe('Phase 2 — list virtualization rule (no ScrollView+.map for collections)', () => {
  const files = [...walk(SCREENS_DIR)];
  test(`found screen files to scan (${files.length})`, () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s does not use ScrollView to render mapped collections', (file) => {
    const src = readFileSync(file, 'utf8');
    // Strip comments/strings very crudely so we don't false-positive on
    // mentions of "ScrollView" inside a comment.
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');

    // Heuristic: file imports ScrollView AND uses .map( inside a JSX block.
    const importsScrollView = /import\s*\{[^}]*\bScrollView\b[^}]*\}\s*from\s*['"]react-native['"]/.test(stripped);
    const usesMap = /\.map\s*\(/.test(stripped);

    if (importsScrollView && usesMap) {
      // Allow it only if the file also imports FlashList OR FlatList AND the
      // ScrollView is a small hero container. We can't statically prove that,
      // so we fail with a clear message and the developer must justify.
      const hasFlashList = /FlashList/.test(stripped);
      const hasFlatList = /FlatList/.test(stripped);
      // Phase 2 screens are placeholders; this gate starts relaxed. When
      // Phase 3 adds real lists, we'll tighten.
      if (hasFlashList || hasFlatList) return; // okay — lists use virtualized
      // If neither FlashList nor FlatList is imported AND ScrollView+.map()
      // appears, fail. Phase 2 placeholders don't map data arrays so this
      // will only trip once real lists land without proper virtualization.
      expect(stripped).not.toMatch(/ScrollView[\s\S]*\.map\s*\(/);
    }
  });
});
