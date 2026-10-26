#!/usr/bin/env node
/**
 * The maintain-phase check behind `docs/agents/impeccable-protocol.md`.
 *
 * The protocol holds one brief per surface in `.impeccable/surfaces/`, and the router in
 * `frontend/src/App.tsx` is the only place a route exists. Everything else (the detector,
 * the craft floor, the document audit) measures the *rendered* result; nothing measured
 * whether the set of routes and the set of briefs still describe the same product. A route
 * added without a brief inherits no mode, no direction and no "decisions to preserve", and
 * a brief left pointing at a route that was renamed silently stops constraining anything.
 *
 * This script is that measurement:
 *
 *   · every non-redirect route is claimed by exactly one brief
 *   · every brief route still exists in the router
 *   · every brief declares a mode the skill recognises
 *   · every surface reports whether a critique snapshot exists (debt, never a failure)
 *
 * Usage:
 *   node scripts/protocol.mjs            human table + summary
 *   node scripts/protocol.mjs --check    exit 1 on a hard gap (CI)
 *   node scripts/protocol.mjs --json     machine-readable
 *   node scripts/protocol.mjs --write docs/design/protocol-ledger.md
 *
 * The critique column reads `.impeccable/critique/`, which `impeccable critique` writes.
 * A missing snapshot is reported as `—` and never fails the check: Review is scheduled on
 * this repository, not yet complete (see §2.1 of the protocol).
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SURFACES_DIR = join(ROOT, '.impeccable', 'surfaces');
const CRITIQUE_DIR = join(ROOT, '.impeccable', 'critique');
const APP = join(ROOT, 'frontend', 'src', 'App.tsx');
const PAGES_DIR = join(ROOT, 'frontend', 'src', 'pages');
const MODES = new Set(['Persuade', 'Operate', 'Read', 'Experience']);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

/* ─────────────────────────── surface briefs ─────────────────────────── */

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fields = {};
  let currentKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const listItem = raw.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(fields[currentKey])) fields[currentKey] = [];
      fields[currentKey].push(listItem[1].trim());
      continue;
    }
    const kv = raw.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      fields[currentKey] = kv[2].trim();
    }
  }
  return fields;
}

function loadBriefs() {
  if (!existsSync(SURFACES_DIR)) return [];
  return readdirSync(SURFACES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const path = join(SURFACES_DIR, file);
      const front = parseFrontmatter(readFileSync(path, 'utf8'));
      if (!front) return { file, surface: basename(file, '.md'), routes: [], mode: null, unparsed: true };
      const routes = Array.isArray(front.routes) ? front.routes : [];
      return {
        file,
        path: relative(ROOT, path),
        surface: front.surface || basename(file, '.md'),
        routes,
        mode: front.mode || null,
      };
    });
}

/* ─────────────────────────── the router ─────────────────────────── */

// Route guards and Suspense boundaries are not the page. The first capitalised tag inside
// `element={…}` is usually a wrapper (`<RequireSuperAdmin><BlogStudioPage /></…>`), so the
// scan steps through them until it reaches the component that actually renders.
const WRAPPERS = new Set([
  'RequireSuperAdmin',
  'RequireAuth',
  'ProtectedRoute',
  'Suspense',
  'ErrorBoundary',
  'Fragment',
]);

function rendererComponent(element) {
  let rest = element;
  for (let guard = 0; guard < 6 && rest; guard += 1) {
    const tag = rest.match(/<\s*([A-Z][A-Za-z0-9_]*)/);
    if (!tag) return null;
    if (!WRAPPERS.has(tag[1])) return tag[1];
    rest = rest.slice(rest.indexOf(tag[0]) + tag[0].length);
  }
  return null;
}

/**
 * Pull `<Route … />` elements out of App.tsx. A plain regex cannot do this: the multi-line
 * routes in this repo carry a nested component tree, complete with self-closing children,
 * so the scan has to stop at the `/>` that closes the Route rather than the first one it
 * meets. Braces and quotes are tracked for that reason.
 */
function scanRoutes(source) {
  const routes = [];
  let i = 0;
  const opener = /<Route\s/g;
  let match;
  while ((match = opener.exec(source)) !== null) {
    i = match.index;
    let depth = 0;
    let quote = null;
    let j = i + '<Route'.length;
    for (; j < source.length; j += 1) {
      const ch = source[j];
      if (quote) {
        if (ch === quote && source[j - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '/' && source[j + 1] === '>' && depth === 0) break;
    }
    const chunk = source.slice(i, j + 2);
    const pathMatch = chunk.match(/\bpath="([^"]*)"/);
    const elementMatch = chunk.match(/\belement=\{([\s\S]*)\}\s*\/>\s*$/);
    const element = elementMatch ? elementMatch[1] : '';
    if (pathMatch) {
      routes.push({
        path: pathMatch[1],
        redirect: /<\s*Navigate\b/.test(element),
        component: rendererComponent(element),
      });
    }
    i = j + 2;
  }
  return routes;
}

function findPageFile(component) {
  if (!component || !existsSync(PAGES_DIR)) return null;
  const direct = join(PAGES_DIR, `${component}.tsx`);
  if (existsSync(direct)) return relative(ROOT, direct);
  return null;
}

/* ─────────────────────────── matching ─────────────────────────── */

const segments = (p) => p.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

/** Does a brief's route pattern cover an actual router path? `:param` matches one segment. */
function patternCovers(pattern, actual) {
  if (pattern === '*') return true;
  const p = segments(pattern);
  const a = segments(actual);
  if (p.length !== a.length) return false;
  return p.every((seg, idx) => seg.startsWith(':') || seg === '*' || seg === a[idx]);
}

/** Does an actual router path satisfy a brief route — allowing the router its own params? */
function actualCoversPattern(actual, pattern) {
  if (pattern === '*') return true;
  const a = segments(actual);
  const p = segments(pattern);
  if (a.length !== p.length) return false;
  return p.every((seg, idx) => seg.startsWith(':') || a[idx].startsWith(':') || seg === a[idx]);
}

// Mirrors `impeccable critique-storage slug`: `frontend/src/pages/FrontDoor.tsx` →
// `frontend-src-pages-frontdoor-tsx`. The extension is part of the slug.
const slugify = (target) =>
  target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function critiqueSnapshots() {
  if (!existsSync(CRITIQUE_DIR)) return [];
  return readdirSync(CRITIQUE_DIR).filter((f) => f.endsWith('.md'));
}

/** Score and priority counts out of a snapshot's front matter, for the ledger row. */
function snapshotMeta(file) {
  try {
    const head = readFileSync(join(CRITIQUE_DIR, file), 'utf8').split('---')[1] || '';
    const field = (name) => {
      const m = head.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };
    const total = Number(field('total_score'));
    const max = Number(field('max_score'));
    return {
      total: Number.isFinite(total) ? total : null,
      max: Number.isFinite(max) ? max : null,
      p1: Number(field('p1_count')) || 0,
      degraded: /DEGRADED: single-context/.test(readFileSync(join(CRITIQUE_DIR, file), 'utf8')),
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────── the pass ─────────────────────────── */

function build() {
  const briefs = loadBriefs();
  const routes = scanRoutes(readFileSync(APP, 'utf8'));
  const publicRoutes = routes.filter((r) => !r.redirect);
  const redirects = routes.filter((r) => r.redirect);
  const snapshots = critiqueSnapshots();

  const findings = [];

  for (const brief of briefs) {
    if (!brief.mode) {
      findings.push({ severity: 'error', id: 'brief-mode-missing', target: brief.path, detail: 'no `mode` in the front matter; the mode is the surface contract' });
    } else if (!MODES.has(brief.mode)) {
      findings.push({ severity: 'error', id: 'brief-mode-invalid', target: brief.path, detail: `mode "${brief.mode}" is not one of Persuade / Operate / Read / Experience` });
    }
    if (!brief.routes.length) {
      findings.push({ severity: 'error', id: 'brief-routes-missing', target: brief.path, detail: 'no `routes` list; a brief that claims no route constrains nothing' });
    }
    for (const pattern of brief.routes) {
      if (pattern === '*') continue;
      const found = routes.some((r) => actualCoversPattern(r.path, pattern));
      if (!found) {
        findings.push({ severity: 'error', id: 'brief-route-stale', target: brief.path, detail: `route "${pattern}" is not in App.tsx (renamed, removed, or a typo)` });
      }
    }
  }

  for (const route of publicRoutes) {
    const owners = briefs.filter((b) => b.routes.some((p) => patternCovers(p, route.path)));
    route.surfaces = owners.map((o) => o.surface);
    if (owners.length === 0) {
      findings.push({ severity: 'error', id: 'route-unclaimed', target: route.path, detail: `route "${route.path}" has no surface brief; it inherits no mode, direction or preserved decision` });
    } else if (owners.length > 1) {
      // A more specific brief may legitimately cover a route a wildcard also covers; only
      // report when two *specific* briefs both claim it.
      const specific = owners.filter((o) => !o.routes.includes('*'));
      if (specific.length > 1) {
        findings.push({ severity: 'warn', id: 'route-claimed-twice', target: route.path, detail: `claimed by ${specific.map((o) => o.surface).join(' and ')}` });
      }
    }
    const page = findPageFile(route.component);
    route.page = page;
    route.critique = page
      ? snapshots.find((s) => s.includes(slugify(page))) || null
      : null;
  }

  const surfaces = briefs.map((brief) => {
    // A `*` brief catches everything it catches; that is not a claim on 66 routes, so the
    // count only includes routes the brief names specifically.
    const specific = brief.routes.filter((r) => r !== '*');
    const matching = publicRoutes.filter((r) => r.surfaces?.includes(brief.surface));
    const claimed = matching.filter((r) => specific.some((p) => patternCovers(p, r.path)));
    // A `*` brief claims no route specifically, but it owns the catch-all route itself —
    // not every route the wildcard also matches, which would hand it another surface's page
    // and another surface's review score.
    const owned = claimed.length
      ? claimed
      : matching.filter((r) => brief.routes.includes('*') && r.path === '*');
    const pages = [...new Set(owned.map((r) => r.page).filter(Boolean))];
    const snapshot = pages.map((p) => snapshots.find((s) => s.includes(slugify(p)))).find(Boolean) || null;
    return {
      surface: brief.surface,
      mode: brief.mode,
      routes: brief.routes,
      claimedRoutes: claimed.length,
      pages,
      critique: snapshot,
      critiqueMeta: snapshot ? snapshotMeta(snapshot) : null,
      brief: brief.path,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      surfaces: briefs.length,
      routes: routes.length,
      publicRoutes: publicRoutes.length,
      redirects: redirects.length,
      claimed: publicRoutes.filter((r) => r.surfaces?.length).length,
      critiques: surfaces.filter((s) => s.critique).length,
    },
    surfaces,
    routes: publicRoutes.map(({ path, component, page, surfaces: s, critique }) => ({ path, component, page, surfaces: s, critique })),
    redirects: redirects.map(({ path, component }) => ({ path, component })),
    findings,
  };
}

const score = (meta) =>
  !meta || meta.total == null ? (meta ? 'yes' : '—') : `${meta.total}/${meta.max ?? 40}`;

const report = build();
const errors = report.findings.filter((f) => f.severity === 'error');
const warnings = report.findings.filter((f) => f.severity === 'warn');

if (flag('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log(
    `[protocol] ${report.counts.surfaces} surfaces · ${report.counts.publicRoutes} public routes ` +
      `(${report.counts.claimed} claimed) · ${report.counts.redirects} redirects · ` +
      `${report.counts.critiques}/${report.counts.surfaces} review snapshots`,
  );
  console.log('');
  console.log(`  ${pad('surface', 22)}${pad('mode', 10)}${pad('routes', 8)}${pad('review', 12)}brief`);
  for (const s of report.surfaces) {
    console.log(
      `  ${pad(s.surface, 22)}${pad(s.mode || '—', 10)}${pad(s.claimedRoutes || '—', 8)}` +
        `${pad(score(s.critiqueMeta), 12)}${s.brief}`,
    );
  }
  const unclaimed = report.routes.filter((r) => !r.surfaces?.length);
  if (unclaimed.length) {
    console.log('');
    console.log('  unclaimed routes:');
    for (const r of unclaimed) console.log(`    ${r.path}  →  ${r.page || r.component || 'unknown'}`);
  }
  if (warnings.length) {
    console.log('');
    for (const w of warnings) console.log(`  warn  ${w.id}  ${w.target} — ${w.detail}`);
  }
  if (errors.length) {
    console.log('');
    for (const e of errors) console.log(`  error ${e.id}  ${e.target} — ${e.detail}`);
  }
  const debt = report.surfaces.filter((s) => !s.critique);
  console.log('');
  console.log(
    errors.length === 0
      ? `  route coverage clean; ${debt.length} surface${debt.length === 1 ? '' : 's'} without a review snapshot`
      : `  ${errors.length} hard gap${errors.length === 1 ? '' : 's'}`,
  );
}

const ledgerPath = value('--write');
if (ledgerPath) {
  const lines = [
    '# Protocol ledger — routes and surfaces',
    '',
    '<!-- generated by scripts/protocol.mjs; do not edit by hand -->',
    '',
    `Generated ${report.generatedAt}. ${report.counts.surfaces} surfaces, ` +
      `${report.counts.publicRoutes} public routes (${report.counts.claimed} claimed), ` +
      `${report.counts.redirects} redirects, ${report.counts.critiques} review snapshots.`,
    '',
    '| Surface | Mode | Routes claimed | Review score | Priority issues | Brief |',
    '|---|---|---|---|---|---|',
    ...report.surfaces.map(
      (s) =>
        `| \`${s.surface}\` | ${s.mode || '—'} | ${s.claimedRoutes} | ${score(s.critiqueMeta)} | ` +
        `${s.critiqueMeta?.p1 ? `${s.critiqueMeta.p1} P1` : '—'} | \`${s.brief}\` |`,
    ),
    '',
    '## Routes',
    '',
    '| Route | Component | Surface | Page |',
    '|---|---|---|---|',
    ...report.routes.map(
      (r) =>
        `| \`${r.path}\` | ${r.component ? `\`${r.component}\`` : '—'} | ` +
        `${r.surfaces?.length ? r.surfaces.map((x) => `\`${x}\``).join(', ') : '**unclaimed**'} | ` +
        `${r.page ? `\`${relative(ROOT, r.page)}\`` : '—'} |`,
    ),
    '',
    '## Redirects',
    '',
    ...(report.redirects.length
      ? report.redirects.map((r) => `- \`${r.path}\` → \`${r.component}\``)
      : ['None.']),
    '',
  ];
  writeFileSync(join(ROOT, ledgerPath), lines.join('\n'));
  console.log(`\n[protocol] wrote ${ledgerPath}`);
}

if (flag('--check') && errors.length > 0) process.exit(1);
