#!/usr/bin/env node
/**
 * Contrast across the JSX tree, not just within one element.
 *
 * check-contrast.mjs scores a foreground against a background only when both
 * sit in the same class list. Most real markup does not work that way — a panel
 * sets the fill and its children set the ink:
 *
 *     <div className="bg-carbon-90 …">
 *       <h3 className="text-white">…</h3>     ← 16.83:1 light, 1.00:1 dark
 *
 * carbon-90 inverts to #ffffff, so that heading disappears in dark mode. The
 * flat scanner cannot see it: the <h3> has no background of its own and the
 * <div> has no text of its own, so neither line has a scoreable pair.
 *
 * This walks the real JSX tree with Babel and resolves each element's ink
 * against the nearest ANCESTOR that paints a background.
 *
 * Deliberately conservative — it reports only what it can stand behind:
 *   • static class strings only. A className built from a ternary or a variable
 *     may differ per state, so it is not guessed at.
 *   • translucent color utilities are alpha-composited through the nearest
 *     opaque JSX ancestor in both theme token graphs.
 *   • inline-painted surfaces, gradients and background images are skipped;
 *     component-specific audits own their contrast (the hero scrim has its
 *     own worst-case-white regression test).
 *   • aria-hidden decoration and icon-only ink are not treated as text.
 *   • it stops at the component root; it cannot know what a parent component
 *     renders this into, so a caller-owned surface is never guessed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { resolvePaintColor, contrast, isResting, RESOLVER, LITERAL } from './lib/class-resolver.mjs';
import { parseColor, toHex } from './lib/token-resolver.mjs';

const traverse = _traverse.default ?? _traverse;
const AA = 4.5;

/**
 * The family alternation is DERIVED from the real token graph, never
 * hand-listed. A hand-list is silently wrong in the worst possible way: a
 * family it omits (`carbon-black`, `warning-surface`) makes the element
 * carrying that background invisible to the tree walk, so its children get
 * scored — and "fixed" — against the wrong ancestor. Longest-first so
 * `carbon-black` wins over `carbon`.
 */
const FAMILIES = [...new Set([
  ...Object.keys(RESOLVER.theme).map((k) => k.replace(/^--color-/, '').replace(/-\d{2,3}$/, '')),
  // Tailwind literals never appear as `--color-*` tokens, so the token graph
  // alone does not know them. Omitting `white` here is what hid self-painted
  // panels from the walk.
  ...Object.keys(LITERAL),
])].sort((a, b) => b.length - a.length);
const RAMP = FAMILIES.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const CLS = new RegExp(`^(dark:)?(text|bg)-(${RAMP})(?:-(\\d{2,3}))?(?:/(\\d{1,3}))?$`);
/* Custom component surfaces that paint a background without a `bg-*` utility.
 * Keep this list tied to the corresponding rules in apple.css. */
const CUSTOM_SURFACES = {
  'ap-card': '--ap-bg-card',
  'ap-sheet': '--ap-bg-elevated',
  'ap-tile-light': '--ap-canvas',
  'ap-tile-parchment': '--ap-parchment',
  'ap-tile-dark': '--ap-tile-1',
  'ap-tile-dark-2': '--ap-tile-2',
  'ap-tile-dark-3': '--ap-tile-3',
};

/* Cross-file JSX composition cannot see a caller's shell. These shared modules have verified
 * mount surfaces at their actual call sites. Route modules use the global canvas as their
 * fallback because App.tsx's <main> is transparent and html/body paint --ap-bg-canvas; inline,
 * image, and gradient surfaces are still rejected before that fallback is considered. */
const ROOT_SURFACES = {
  // Unresolved text sits on the app canvas or on an opaque/white surface that maps to it.
  'frontend/src/components/ArticlePage.tsx': '--ap-bg-canvas',
  'frontend/src/components/Breadcrumbs.tsx': '--ap-bg-canvas',
  'frontend/src/components/alerts/AlertFilters.tsx': '--ap-bg-canvas',
  'frontend/src/components/alerts/AlertLevelBadge.tsx': '--ap-bg-canvas',
  'frontend/src/components/alerts/DataSourceBanner.tsx': '--ap-bg-canvas',
  'frontend/src/components/alerts/EvidenceCard.tsx': '--ap-bg-canvas',
  'frontend/src/components/auth/AuthLayout.tsx': '--ap-bg-canvas',
  'frontend/src/components/auth/AuthSocialButtons.tsx': '--ap-bg-canvas',
  'frontend/src/components/blog/RequireSuperAdmin.tsx': '--ap-bg-canvas',
  'frontend/src/components/docs/DocsVisuals.tsx': '--ap-bg-canvas',
  'frontend/src/components/frontdoor/HazardIndex.tsx': '--ap-bg-canvas',
  'frontend/src/components/frontdoor/RunVisual.tsx': '--ap-bg-canvas',
  'frontend/src/components/ReportTemplate.tsx': '--ap-bg-canvas',
  'frontend/src/components/RiskAnalytics.tsx': '--ap-bg-canvas',
  'frontend/src/components/StoredForecastPanel.tsx': '--ap-bg-canvas',
  'frontend/src/components/ui/FloatingControlBar.tsx': '--ap-bg-canvas',
  'frontend/src/components/ui/KeyFigures.tsx': '--ap-bg-canvas',
  'frontend/src/components/user/dashboard/ProfileDetails.tsx': '--ap-bg-canvas',
  'frontend/src/components/WeatherPanel.tsx': '--ap-bg-canvas',
  'frontend/src/components/DataProcessingSkeleton.tsx': '--ap-bg-canvas',

  // Shared UI mounted inside `.ap-card` panels at every production call site.
  'frontend/src/components/EmdatComparisonChart.tsx': '--ap-bg-card',
  'frontend/src/components/FirebaseRealtimeStatus.tsx': '--ap-bg-card',
  'frontend/src/components/IdentityConnections.tsx': '--ap-bg-card',
  'frontend/src/components/user/UserAvatarField.tsx': '--ap-bg-card',
  'frontend/src/components/user/dashboard/AccountSection.tsx': '--ap-bg-card',
  'frontend/src/components/user/dashboard/OverviewSection.tsx': '--ap-bg-card',
  'frontend/src/components/user/dashboard/ui.tsx': '--ap-bg-card',

  // Keep mixed-context components unmapped: for example, StatusStrip is also placed over
  // LiveMapView, while StructuredAdvisoryRenderer has severity-colored and print-only regions.
  // Existing verified component surfaces.
  'frontend/src/components/alerts/DistrictAlertTable.tsx': '--ap-bg-canvas',
  'frontend/src/components/district/DistrictBriefBody.tsx': '--ap-bg-canvas',
  'frontend/src/components/map/DistrictForecastCard.tsx': '--ap-bg-elevated',
};
const PAGE_ROOT_SURFACE = '--ap-bg-canvas';

/**
 * Ink that is correct for a given kind of ground.
 *
 * The neutral ramp splits cleanly at 40/50: on an inverting tile only 10–40
 * (and ap-on-inverse) clear AA, and on a normal surface only 50–90 do. The
 * coloured families split at 300/400 the same way. Mapping therefore depends
 * entirely on which ground the element actually sits on, which is why this
 * runs off the JSX tree instead of a regex.
 */
const INVERTED_TILE = /^(?:dark:)?bg-carbon-(?:70|80|90)(?:\/\d+)?$/;
const PLAIN_SURFACE = /^(?:dark:)?bg-(?:white|carbon-0?5|carbon-10)(?:\/\d+)?$/;
const ACTION_FILL = /^(?:dark:)?bg-(?:primary|primary-strong|blue-[5-7]00|ap-primary)(?:\/\d+)?$/;
/** #000 in both themes, so its ink must be fixed, not inverting. */
const FIXED_SCRIM = /^(?:dark:)?bg-(?:carbon-black|black)(?:\/\d+)?$/;

function remedy(fgCls, bgCls) {
  const fg = fgCls.replace(/^dark:/, '');
  if (ACTION_FILL.test(bgCls)) return 'text-ap-action-fg';
  if (FIXED_SCRIM.test(bgCls)) {
    if (/^text-white\/\d+$/.test(fg)) return 'text-ap-on-scrim-muted';
    if (/^text-carbon-(?:10|20|30|40|50|60)$/.test(fg)) return 'text-ap-on-scrim-muted';
    if (/^text-(?:white|carbon-(?:70|80|90)|carbon-black|ap-on-inverse|black)$/.test(fg)) return 'text-ap-on-scrim';
    // The accent and the severity encoding both need a value that holds in
    // both themes, because the scrim underneath them does not move.
    if (/^text-(?:ap-link|ap-action|primary|primary-strong|blue-\d{2,3})$/.test(fg)) return 'text-ap-primary-on-dark';
    if (/^text-(?:rose|red|amber|orange|severity)[a-z-]*-?\d*$/.test(fg)) return 'text-ap-on-scrim-sev';
    return null;
  }
  if (INVERTED_TILE.test(bgCls)) {
    if (/^text-white\/\d+$/.test(fg)) return 'text-carbon-30';         // muted, stays muted
    if (/^text-(?:white|carbon-(?:70|80|90))$/.test(fg)) return 'text-ap-on-inverse';
    if (/^text-carbon-(?:50|60)$/.test(fg)) return 'text-carbon-30';
    if (fg === 'text-ap-link') return 'text-blue-300';
    const fam = /^text-([a-z]+)-(?:400|500|600|700)$/.exec(fg);
    if (fam) return `text-${fam[1]}-300`;
    return null;
  }
  if (PLAIN_SURFACE.test(bgCls)) {
    if (/^text-(?:carbon-(?:10|20|30|40)|ap-on-scrim-muted)$/.test(fg)) return 'text-carbon-60';
    // carbon-black is #000 in BOTH themes; on a surface that inverts it goes
    // black-on-dark. The surface ink must invert with the surface.
    if (/^text-(?:white|ap-on-inverse|carbon-black|black|ap-on-scrim)$/.test(fg)) return 'text-carbon-90';
    // Scrim-pinned inks landing back on a light surface need their inverting
    // counterparts, not the values that were pinned for a black scrim.
    if (fg === 'text-ap-primary-on-dark') return 'text-ap-link';
    if (fg === 'text-ap-on-scrim-sev') return 'text-rose-700';
    return null;
  }
  return null;
}

/** Static class list of a JSX element: string literals and template quasis. */
function classesOf(node) {
  const attr = node.openingElement?.attributes?.find(
    (a) => a.type === 'JSXAttribute' && (a.name?.name === 'className' || a.name?.name === 'class'),
  );
  if (!attr?.value) return [];
  const out = [];
  const push = (text, node) => {
    for (const c of String(text).split(/\s+/).filter(Boolean)) out.push({ cls: c, node });
  };
  if (attr.value.type === 'StringLiteral') push(attr.value.value, attr.value);
  else if (attr.value.type === 'JSXExpressionContainer') {
    const e = attr.value.expression;
    if (e.type === 'StringLiteral') push(e.value, e);
    else if (e.type === 'TemplateLiteral') for (const q of e.quasis) push(q.value.cooked ?? '', q);
  }
  return out;
}

const pick = (entries, prop, mode) => {
  let base = null;
  let dark = null;
  for (const e of entries) {
    const m = CLS.exec(e.cls);
    if (!m || m[2] !== prop || !isResting(e.cls)) continue;
    if (e.cls.startsWith('dark:')) dark = e;
    else base = e;
  }
  return mode === 'dark' ? dark ?? base : base;
};

const composite = (front, back) => {
  const alpha = front[3] ?? 1;
  return [0, 1, 2].map((i) => front[i] * alpha + back[i] * (1 - alpha)).concat(1);
};

const attributeValue = (node, name) => {
  const attr = node.openingElement?.attributes?.find(
    (a) => a.type === 'JSXAttribute' && a.name?.name === name,
  );
  if (!attr?.value) return null;
  if (attr.value.type === 'StringLiteral') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    const expression = attr.value.expression;
    if (expression.type === 'StringLiteral') return expression.value;
    if (expression.type === 'BooleanLiteral') return expression.value;
  }
  return null;
};

function isAriaHidden(path) {
  for (let p = path; p; p = p.parentPath) {
    if (p.node.type !== 'JSXElement') continue;
    if (attributeValue(p.node, 'aria-hidden') === true || attributeValue(p.node, 'aria-hidden') === 'true') return true;
  }
  return false;
}

/** Inline-painted surfaces are audited by the component-specific check that defines them.
 * The hero is one such surface: `heroContrast.test.js` composites its --hero-scrim over
 * a worst-case white photograph. Do not score its descendants against a farther ancestor. */
function expressionHasInlineBackground(expression) {
  if (!expression) return false;
  if (expression.type === 'ObjectExpression') {
    return expression.properties.some((property) => {
      if (property.type === 'SpreadElement') return true;
      const key = property.key?.name ?? property.key?.value;
      if (key === 'background' || key === 'backgroundColor' || key === 'backgroundImage') return true;
      return property.computed || key == null;
    });
  }
  if (expression.type === 'ConditionalExpression') {
    return expressionHasInlineBackground(expression.consequent)
      || expressionHasInlineBackground(expression.alternate);
  }
  if (expression.type === 'LogicalExpression') return expressionHasInlineBackground(expression.right);
  if (expression.type === 'TSAsExpression' || expression.type === 'TypeCastExpression') {
    return expressionHasInlineBackground(expression.expression);
  }
  if (expression.type === 'NullLiteral' || expression.type === 'StringLiteral'
      || expression.type === 'NumericLiteral' || expression.type === 'BooleanLiteral'
      || (expression.type === 'Identifier' && expression.name === 'undefined')) return false;
  // A variable, call, or spread result can paint a background the source audit cannot see.
  return true;
}

function hasInlineBackground(node) {
  const attr = node.openingElement?.attributes?.find(
    (a) => a.type === 'JSXAttribute' && a.name?.name === 'style',
  );
  if (!attr?.value || attr.value.type !== 'JSXExpressionContainer') return false;
  return expressionHasInlineBackground(attr.value.expression);
}

function hasUnknownImageBackground(classes, mode) {
  return classes.some(({ cls }) => {
    if (cls.startsWith('dark:') && mode !== 'dark') return false;
    const base = cls.split(':').pop();
    return /^bg-(?:gradient|linear)-/.test(base) || /^bg-\[/.test(base);
  });
}

function iconComponents(ast) {
  const names = new Set(['MaterialIcon']);
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'lucide-react') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier') names.add(specifier.local.name);
    }
  }
  return names;
}

const hasWords = (text) => /[\p{L}\p{N}]/u.test(text);

function expressionHasVisibleText(expression, icons) {
  if (!expression || expression.type === 'JSXEmptyExpression') return false;
  if (expression.type === 'StringLiteral') return hasWords(expression.value);
  if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
    return nodeHasVisibleText(expression, icons);
  }
  if (expression.type === 'ConditionalExpression') {
    return expressionHasVisibleText(expression.consequent, icons)
      || expressionHasVisibleText(expression.alternate, icons);
  }
  if (expression.type === 'LogicalExpression') return expressionHasVisibleText(expression.right, icons);
  if (expression.type === 'SequenceExpression') return expression.expressions.some((part) => expressionHasVisibleText(part, icons));
  if (expression.type === 'ArrayExpression') return expression.elements.some((part) => expressionHasVisibleText(part, icons));
  // A variable, call, or member expression in the child position can render a label or value.
  return true;
}

function nodeHasVisibleText(node, icons) {
  if (attributeValue(node, 'aria-hidden') === true || attributeValue(node, 'aria-hidden') === 'true') return false;
  const name = node.openingElement?.name;
  const tag = name?.type === 'JSXIdentifier' ? name.name : null;
  if (tag && (icons.has(tag) || tag === 'title' || tag === 'desc')) return false;
  if (tag && /^(?:input|select|textarea|option)$/.test(tag)) return true;
  return (node.children ?? []).some((child) => {
    if (child.type === 'JSXText') return hasWords(child.value);
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') return nodeHasVisibleText(child, icons);
    if (child.type === 'JSXExpressionContainer') return expressionHasVisibleText(child.expression, icons);
    return false;
  });
}

/** Resolve and composite every known background layer up to the nearest opaque surface. */
function backgroundFor(path, mode, file) {
  const layers = [];
  let nearestClass = null;
  let nearestLine = 0;
  let customSurface = null;
  let rootSurfaceToken = null;

  for (let p = path; p; p = p.parentPath) {
    if (p.node.type !== 'JSXElement') continue;
    if (hasInlineBackground(p.node)) return { unknown: 'inline background', layers };
    const classes = classesOf(p.node);
    if (hasUnknownImageBackground(classes, mode)) return { unknown: 'background image/gradient', layers };

    let entry = pick(classes, 'bg', mode);
    let layer = entry ? resolvePaintColor(entry.cls, mode) : null;
    if (!entry) {
      const custom = classes.find(({ cls }) => Object.hasOwn(CUSTOM_SURFACES, cls));
      if (custom) {
        customSurface = custom.cls;
        layer = RESOLVER.evaluate(`var(${CUSTOM_SURFACES[custom.cls]})`, mode);
        entry = custom;
      }
    }
    if (!entry) continue;
    if (!layer) return { unknown: `unresolved background ${entry.cls}`, layers };
    if ((layer[3] ?? 1) <= 0) continue;
    if (!nearestClass) {
      nearestClass = entry.cls;
      nearestLine = entry.node?.loc?.start.line ?? p.node.loc?.start.line ?? 0;
    }
    layers.push(layer);
    if ((layer[3] ?? 1) >= 1) break;
  }

  // A component can be mounted on a caller-owned surface; do not assume the page canvas
  // unless its only real route call site has been explicitly verified above. This keeps
  // shared components conservative while letting route-owned districts use body.css's root.
  if (!layers.some((layer) => (layer[3] ?? 1) >= 1)) {
    const rootToken = ROOT_SURFACES[file]
      ?? (file.startsWith('frontend/src/pages/') ? PAGE_ROOT_SURFACE : null);
    const rootSurface = rootToken ? RESOLVER.evaluate(`var(${rootToken})`, mode) : null;
    if (!rootSurface) return { unknown: 'no known opaque ancestor', layers };
    rootSurfaceToken = rootToken;
    layers.push(rootSurface);
    if (!nearestClass) nearestClass = `root surface ${rootToken}`;
  }

  // Translucent class backgrounds above the opaque surface are blended in CSS order,
  // farthest ancestor first. The page canvas is only a numerical safety net behind a
  // known opaque JSX or call-site surface.
  const canvas = parseColor(RESOLVER.token('bg-canvas', mode) ?? (mode === 'dark' ? '#000000' : '#ffffff'));
  let color = canvas;
  for (let i = layers.length - 1; i >= 0; i -= 1) color = composite(layers[i], color);
  return { color, nearestClass, nearestLine, customSurface, layers, rootSurfaceToken };
}

const files = execSync("find frontend/src -name '*.tsx' ! -path '*__tests__*'")
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

const problems = [];
const edits = [];
const stats = {
  checkedPairs: 0,
  skippedUnknown: 0,
  skippedReasons: {},
  skippedExamples: [],
  rootSurfaceUsage: {},
};
const wantsFix = process.argv.includes('--fix');

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    continue; // a file we cannot parse is not a file we may report on
  }

  const icons = iconComponents(ast);
  traverse(ast, {
    JSXElement(path) {
      if (isAriaHidden(path) || !nodeHasVisibleText(path.node, icons)) return;
      const classes = classesOf(path.node);
      if (!classes.length) return;

      for (const mode of ['light', 'dark']) {
        const fgEntry = pick(classes, 'text', mode);
        if (!fgEntry) continue;
        const foreground = resolvePaintColor(fgEntry.cls, mode);
        if (!foreground || foreground[3] <= 0) continue;

        // Include alpha layers all the way to the nearest opaque ancestor. This is the
        // important distinction from the flat scan: `text-white/70` on `bg-black/40`
        // over a theme-inverting card is not white-on-black in both themes.
        const surface = backgroundFor(path, mode, file);
        if (surface.rootSurfaceToken) {
          const key = `${file.replace('frontend/src/', '')}|${surface.rootSurfaceToken}`;
          stats.rootSurfaceUsage[key] = (stats.rootSurfaceUsage[key] ?? 0) + 1;
        }
        if (surface.unknown || !surface.color) {
          stats.skippedUnknown += 1;
          const reason = surface.unknown ?? 'unresolved surface';
          stats.skippedReasons[reason] = (stats.skippedReasons[reason] ?? 0) + 1;
          if (stats.skippedExamples.length < 100) {
            stats.skippedExamples.push({
              file: file.replace('frontend/src/', ''),
              line: path.node.loc?.start.line ?? 0,
              mode,
              foreground: fgEntry.cls,
              reason,
            });
          }
          continue;
        }
        stats.checkedPairs += 1;
        const paintedForeground = composite(foreground, surface.color);
        const fgHex = toHex(paintedForeground);
        const bgHex = toHex(surface.color);
        const ratio = contrast(fgHex, bgHex);
        if (ratio === null || ratio >= AA) continue;

        const translucentLayer = surface.layers.some((layer) => (layer[3] ?? 1) < 1);
        const fix = !translucentLayer && surface.nearestClass
          ? remedy(fgEntry.cls, surface.nearestClass)
          : null;
        problems.push({
          file: file.replace('frontend/src/', ''),
          line: path.node.loc?.start.line ?? 0,
          mode,
          pair: `${fgEntry.cls} over ${surface.nearestClass ?? 'page canvas'}`,
          detail: `${fgHex} on ${bgHex} = ${ratio.toFixed(2)}:1 (AA needs ${AA})`,
          ancestorLine: surface.nearestLine ?? 0,
          fix,
        });
        if (fix) {
          edits.push({
            file,
            start: fgEntry.node.start,
            end: fgEntry.node.end,
            from: fgEntry.cls,
            to: fgEntry.cls.startsWith('dark:') ? `dark:${fix}` : fix,
          });
        }
      }
    },
  });
}

if (wantsFix) {
  // Apply from the end of each file backwards so earlier offsets stay valid.
  const byFile = {};
  for (const e of edits) (byFile[e.file] ??= []).push(e);
  let applied = 0;
  const unfixable = problems.filter((p) => !p.fix).length;
  for (const [file, list] of Object.entries(byFile)) {
    let text = readFileSync(file, 'utf8');
    const seen = new Set();
    for (const e of list.sort((a, b) => b.start - a.start)) {
      const key = `${e.start}:${e.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const slice = text.slice(e.start, e.end);
      const re = new RegExp(`(?<![\\w:-])${e.from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w/-])`, 'g');
      const next = slice.replace(re, e.to);
      if (next === slice) continue;
      text = text.slice(0, e.start) + next + text.slice(e.end);
      applied += 1;
    }
    writeFileSync(file, text);
  }
  console.log(`applied ${applied} inherited-background fix(es) across ${Object.keys(byFile).length} file(s)`);
  if (unfixable) console.log(`${unfixable} finding(s) had no mechanical remedy and were left for review`);
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    total: problems.length,
    checkedPairs: stats.checkedPairs,
    skippedUnknown: stats.skippedUnknown,
    skippedReasons: stats.skippedReasons,
    skippedExamples: stats.skippedExamples,
    rootSurfaceUsage: stats.rootSurfaceUsage,
    problems,
  }, null, 2));
  process.exit(0);
}

const skippedSummary = Object.entries(stats.skippedReasons)
  .map(([reason, count]) => `${count} ${reason}`)
  .join(', ');

if (!problems.length) {
  console.log(`✅ ${files.length} component files: ${stats.checkedPairs} foreground/background pairs checked across both themes; no AA findings.`);
  if (stats.skippedUnknown) {
    console.log(`   ${stats.skippedUnknown} candidate pair(s) skipped because the surface could not be modeled: ${skippedSummary}.`);
  }
  process.exit(0);
}

console.log(`${problems.length} inherited-background contrast problem(s) among ${stats.checkedPairs} checked pair(s):\n`);
if (stats.skippedUnknown) {
  console.log(`${stats.skippedUnknown} candidate pair(s) skipped because the surface could not be modeled: ${skippedSummary}.\n`);
}
const byPair = {};
for (const p of problems) (byPair[p.pair] ??= []).push(p);
for (const [pair, hits] of Object.entries(byPair).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(hits.length).padStart(3)}  ${pair}`);
  if (process.argv.includes('--report')) {
    for (const h of hits) console.log(`         ${h.file}:${h.line} (bg at :${h.ancestorLine})  ${h.detail}`);
  }
}
process.exit(1);
