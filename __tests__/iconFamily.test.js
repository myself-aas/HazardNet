/**
 * Gate for audit P1-8 / backlog 10: one icon family, decided and enforced.
 *
 * The finding was two families in one tree - `lucide-react` in 23 files and a 923-line
 * hand-authored `MaterialIcon.tsx` used by 61 - plus emoji as row icons on the native shell.
 * The decision (data/design/icon-registry.json) is Lucide, because it is the only icon
 * package the repo already declares and it ships plain SVG path data that `react-native-svg`
 * can draw unchanged. This suite enforces the parts that can silently rot:
 *
 *   1. no second icon package appears in package.json or in an import;
 *   2. every imported name is in the registry (so a new icon is a decision, not a typo);
 *   3. the generated path data matches the registry and the installed lucide version;
 *   4. web and native share one stroke and one size scale;
 *   5. the legacy hand-authored set is frozen - importers may only be removed;
 *   6. no emoji/text-glyph stand-ins remain in web literals, and native icons stay registry names.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const MOBILE = join(ROOT, 'apps/mobile/src');
const REGISTRY = join(ROOT, 'data/design/icon-registry.json');
const GENERATED = join(ROOT, 'packages/design-system/src/icons.ts');
const NATIVE_ICON = join(MOBILE, 'components/Icon.tsx');
const NATIVE_NAVIGATION = join(MOBILE, 'navigation/RootNavigator.tsx');

/**
 * Packages that would make this a two-family tree again. The check is by name, so a
 * transitive icon dependency is fine - what matters is what the app imports directly.
 */
const RIVAL_PACKAGES = [
  'react-icons',
  '@phosphor-icons/react',
  '@heroicons/react',
  '@tabler/icons-react',
  '@radix-ui/react-icons',
  'feather-icons',
  'react-feather',
  'material-symbols',
  '@mui/icons-material',
  '@fortawesome/react-fontawesome',
  'bootstrap-icons',
];

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const generated = readFileSync(GENERATED, 'utf8');
const names = new Set(registry.names);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const frontendPkg = JSON.parse(readFileSync(join(ROOT, 'frontend/package.json'), 'utf8'));
const mobilePkg = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/package.json'), 'utf8'));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

/** `import { A, B as C } from 'lucide-react'` -> ['A', 'B'] */
function lucideImports(text) {
  const found = [];
  const named = /import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g;
  for (const match of text.matchAll(named)) {
    for (const part of match[1].split(',')) {
      const clean = part.trim();
      if (!clean || /^type\s+/.test(clean)) continue;
      found.push(clean.split(' as ')[0].trim());
    }
  }
  return found;
}

describe('one icon family', () => {
  it('declares exactly one direct icon dependency across the three package.json files', () => {
    const iconish = (deps) =>
      Object.keys(deps ?? {}).filter(
        (dep) => /icon|lucide|phosphor|heroicon|tabler|fontawesome|font-awesome/i.test(dep),
      );
    expect({
      frontend: iconish(frontendPkg.dependencies),
      mobile: iconish(mobilePkg.dependencies),
      root: iconish(pkg.dependencies),
    }).toEqual({ frontend: ['lucide-react'], mobile: [], root: [] });
  });

  it('imports no rival icon package anywhere in frontend/src or apps/mobile/src', () => {
    const offenders = [];
    for (const dir of [SRC, MOBILE]) {
      for (const file of walk(dir)) {
        const text = readFileSync(file, 'utf8');
        for (const rival of RIVAL_PACKAGES) {
          if (text.includes(`'${rival}`) || text.includes(`"${rival}`)) {
            offenders.push(`${relative(ROOT, file)} imports ${rival}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('resolves every lucide import to a registered name', () => {
    const unregistered = new Set();
    for (const file of walk(SRC)) {
      for (const name of lucideImports(readFileSync(file, 'utf8'))) {
        if (!names.has(name)) unregistered.add(`${relative(SRC, file)}: ${name}`);
      }
    }
    expect([...unregistered]).toEqual([]);
  });

  it('keeps emoji and text-glyph stand-ins out of web runtime literals', () => {
    // Parse rather than grep: punctuation in comments is not rendered, but JSX text,
    // string literals and template segments are. ©, bullets, dates and measurement
    // units remain valid prose/data; emoji and directional/check/status glyphs do not.
    const forbidden = /[\p{Extended_Pictographic}\uFE0F←-⇿✓✔☑☒✗✘✕✖★☆●○◉◎◆◇■□◀▶▲▼⤢▸▾]/gu;
    const offenders = [];

    for (const file of walk(SRC)) {
      if (file.includes('/__tests__/') || /\.test\.(?:tsx?|jsx?)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const visit = (node) => {
        let value;
        if (ts.isJsxText(node)) value = node.text;
        else if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateLiteralToken(node)
        ) value = node.text;

        if (value) {
          const matches = [...value.matchAll(forbidden)].filter(([glyph]) => !['©', '®', '™'].includes(glyph));
          if (matches.length) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            offenders.push(`${relative(ROOT, file)}:${line + 1} contains ${[...new Set(matches.map(([glyph]) => glyph))].join('')}`);
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the generated path data in sync with the registry and the installed package', () => {
    // Re-runs the generator in --check mode: a dependency bump or a hand-edit fails here.
    expect(() =>
      execFileSync(process.execPath, [join(ROOT, 'scripts/generate-icon-glyphs.mjs'), '--check'], {
        cwd: ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('ships the family contract, not just the glyphs', () => {
    expect(generated).toMatch(/export const ICON_FAMILY = "lucide"/);
    expect(generated).toMatch(new RegExp(`export const ICON_STROKE = ${registry.strokeWidth} as const`));
    expect(generated).toMatch(/export const ICON_VIEW_BOX = ['"]0 0 24 24['"]/);
    expect(registry.viewBox).toBe('0 0 24 24');
    for (const name of registry.names) {
      expect(generated).toContain(`  ${JSON.stringify(name)}: [`);
    }
  });

  it('sets one stroke weight on web through the CSS rule, not at 500 call sites', () => {
    const css = readFileSync(join(SRC, 'styles/apple.css'), 'utf8');
    const rule = css.match(/svg\.lucide\s*\{\s*stroke-width:\s*([\d.]+)/);
    expect(rule).not.toBeNull();
    // The number is the same one the native shell passes to <Svg strokeWidth>.
    expect(Number(rule[1])).toBe(registry.strokeWidth);
    expect(readFileSync(NATIVE_ICON, 'utf8')).toMatch(/strokeWidth=\{ICON_STROKE\}/);
  });
});

describe('the legacy hand-authored set is frozen, not growing', () => {
  /** Files importing MaterialIcon when the decision was taken. It may only go down. */
  const BASELINE_IMPORTERS = 61;

  it('has no more importers than the day the family was decided', () => {
    const importers = walk(SRC).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /import\s+\w+\s+from\s+'(\.\.?\/)+(components\/)?MaterialIcon'/.test(text);
    });
    expect(importers.length).toBeLessThanOrEqual(BASELINE_IMPORTERS);
    // And the set itself still exists - retiring it outright is a separate change.
    expect(existsSync(join(SRC, 'components/MaterialIcon.tsx'))).toBe(true);
  });
});

describe('the native shell draws the same glyphs', () => {
  const icon = readFileSync(NATIVE_ICON, 'utf8');
  const more = readFileSync(join(MOBILE, 'screens/more/MoreScreen.tsx'), 'utf8');

  it('renders from the shared registry with react-native-svg', () => {
    expect(icon).toMatch(/from '@hazardnet\/design-system'/);
    expect(icon).toMatch(/ICON_PATHS/);
    expect(icon).toMatch(/ICON_SIZES/);
    expect(icon).toMatch(/from 'react-native-svg'/);
    expect(icon).toMatch(/viewBox=\{ICON_VIEW_BOX\}/);
  });

  it('uses registered Lucide icons for every native bottom tab', () => {
    const navigation = readFileSync(NATIVE_NAVIGATION, 'utf8');
    const start = navigation.indexOf('const TAB_ICONS');
    const end = navigation.indexOf('\n};', start);
    const block = navigation.slice(start, end);
    const assignments = [...block.matchAll(/(Today|Alerts|Map|Saved|More): ['"]([A-Za-z0-9]+)['"]/g)];
    expect(assignments.map((match) => match[1])).toEqual(['Today', 'Alerts', 'Map', 'Saved', 'More']);
    const unregistered = assignments.map((match) => match[2]).filter((name) => !names.has(name));
    expect(unregistered).toEqual([]);
    expect(navigation).toContain('<Icon name={TAB_ICONS[routeName]} color={color} size={size} />');
    expect(navigation).not.toMatch(/const glyph|[◉◎★≡]/);
  });

  it('has a native renderer for every tag the family uses', () => {
    const tags = new Set([...generated.matchAll(/\["(\w+)", \{/g)].map((match) => match[1]));
    expect(tags.size).toBeGreaterThan(0);
    const missing = [...tags].filter((tag) => !icon.includes(`case '${tag}':`));
    expect(missing).toEqual([]);
  });

  it('uses icon names, never emoji, as row icons', () => {
    // The More tab rows used 📷 ◐ 🔔 ◉ ⓘ ☎ ↗ - emoji cannot be tinted with the theme,
    // differ per OEM, and are silent as icons to a screen reader.
    const literals = [...more.matchAll(/icon="([^"]+)"/g)].map((match) => match[1]);
    expect(literals.length).toBeGreaterThan(0);
    const notNames = literals.filter((value) => !names.has(value));
    expect(notNames).toEqual([]);
    expect(more).not.toMatch(/icon="[^A-Za-z]/);
  });

  it('leaves no emoji or text glyph behind as an icon prop anywhere in the app', () => {
    // Every `icon=` literal in the native shell must name a registered glyph: the shell used
    // to pass '★', '↗', '!', '◐', '◔', '◉', '○', '✓' and emoji, none of which can be tinted
    // with the theme, and several of which a screen reader reads as punctuation.
    const offenders = [];
    for (const file of walk(MOBILE)) {
      const text = readFileSync(file, 'utf8');
      const literals = [
        ...[...text.matchAll(/icon=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]),
        ...[...text.matchAll(/icon=\{\s*'([^']+)'\s*\}/g)].map((m) => m[1]),
      ];
      for (const value of literals) {
        if (!names.has(value)) offenders.push(`${relative(ROOT, file)}: icon="${value}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
