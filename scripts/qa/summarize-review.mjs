/**
 * Turn the design-review JSON into the tables that appear in the reports.
 *
 * The point of separating this from the report prose is that every number in
 * docs/reviews/*web-design-review*.md is generated here rather than typed. If a
 * claim in the report and a number below disagree, the report is wrong.
 *
 * Usage: node scripts/qa/summarize-review.mjs --in=/tmp/hn-review-mobile.json,...
 *        node scripts/qa/summarize-review.mjs --in=/tmp/hn-review-*.json --json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);

const files = String(args.in ?? '/tmp/hn-review-mobile.json').split(',').flatMap((f) => f.split(/\s+/)).filter(Boolean);

const results = [];
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  results.push(...data.results);
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ── shape ────────────────────────────────────────────────────────────────────

const viewports = [...new Set(results.map((r) => r.viewport))];
const routes = [...new Set(results.map((r) => r.route))];

const summary = {
  measurements: results.length,
  routes: routes.length,
  viewports,
  errorBoundaries: results.filter((r) => r.errorBoundary).map((r) => `${r.viewport} ${r.route}`),
  nonOkStatus: results.filter((r) => r.status !== 'ok').map((r) => `${r.viewport} ${r.route}: ${r.status}`),
};

// ── axe ──────────────────────────────────────────────────────────────────────

const ruleMap = new Map();
for (const r of results) {
  for (const v of r.axe ?? []) {
    if (!ruleMap.has(v.id)) {
      ruleMap.set(v.id, { id: v.id, impact: v.impact, help: v.help, wcag: v.wcag, nodes: 0, routes: new Set(), viewports: new Set(), sample: v.sample });
    }
    const e = ruleMap.get(v.id);
    e.nodes += v.nodes;
    e.routes.add(r.route);
    e.viewports.add(r.viewport);
  }
}
const rules = [...ruleMap.values()].sort(
  (a, b) => b.routes.size - a.routes.size || b.nodes - a.nodes,
);

const impactCounts = {};
for (const r of rules) impactCounts[r.impact] = (impactCounts[r.impact] ?? 0) + r.routes.size;

// ── layout ───────────────────────────────────────────────────────────────────

const overflowRows = results.filter((r) => r.metrics?.horizontalScroll);
const headingJumpRows = results.filter((r) => (r.metrics?.headingJumps ?? 0) > 0);
const multiH1Rows = results.filter((r) => (r.metrics?.h1Count ?? 0) !== 1);
const noFocusRing = results.filter((r) => r.focus?.focused && !r.focus?.hasRing);

const allSmallTargets = [];
for (const r of results) {
  for (const t of r.metrics?.smallTargets ?? []) allSmallTargets.push({ ...t, route: r.route, viewport: r.viewport });
}

const allOverflows = [];
for (const r of results) {
  for (const o of r.metrics?.overflowing ?? []) allOverflows.push({ ...o, route: r.route, viewport: r.viewport });
}

const allClipped = [];
for (const r of results) {
  for (const c of r.metrics?.clipped ?? []) allClipped.push({ ...c, route: r.route, viewport: r.viewport });
}

// ── console ──────────────────────────────────────────────────────────────────

/**
 * Console errors are bucketed by a signature so 91 tile failures on one route
 * count as one problem. The signature strips the parts that vary per instance.
 */
function signature(text) {
  const t = text.split('\n')[0];
  return t
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\d+/g, 'N')
    .replace(/"[^"]*"/g, '"<str>"')
    .slice(0, 130);
}

const consoleMap = new Map();
for (const r of results) {
  for (const err of r.consoleErrors ?? []) {
    const sig = signature(err);
    if (!consoleMap.has(sig)) consoleMap.set(sig, { sig, count: 0, routes: new Set(), viewports: new Set() });
    const e = consoleMap.get(sig);
    e.count += 1;
    e.routes.add(r.route);
    e.viewports.add(r.viewport);
  }
}
const consoleGroups = [...consoleMap.values()].sort((a, b) => b.routes.size - a.routes.size || b.count - a.count);

const pageErrorGroups = new Map();
for (const r of results) {
  for (const err of r.pageErrors ?? []) {
    const sig = signature(err);
    pageErrorGroups.set(sig, (pageErrorGroups.get(sig) ?? 0) + 1);
  }
}

// ── fonts / structure ────────────────────────────────────────────────────────

const fontRows = results
  .filter((r) => r.metrics?.bodyMinFont != null)
  .map((r) => ({ route: r.route, viewport: r.viewport, size: r.metrics.bodyMinFont }))
  .sort((a, b) => a.size - b.size);

const textSizes = {};
for (const f of fontRows) textSizes[f.size] = (textSizes[f.size] ?? 0) + 1;

// ── output ───────────────────────────────────────────────────────────────────

const report = {
  summary,
  axe: { rules: rules.map((r) => ({ ...r, routes: [...r.routes], viewports: [...r.viewports] })), impactCounts },
  layout: {
    overflowCount: overflowRows.length,
    overflowDetail: allOverflows.slice(0, 30),
    smallTargetCount: allSmallTargets.length,
    smallTargetDetail: allSmallTargets.slice(0, 30),
    clippedCount: allClipped.length,
    clippedDetail: allClipped.slice(0, 20),
    headingJumpCount: headingJumpRows.length,
    multiH1: multiH1Rows.map((r) => ({ route: r.route, viewport: r.viewport, h1Count: r.metrics?.h1Count })),
    noFocusRing: noFocusRing.map((r) => ({ route: r.route, viewport: r.viewport, focus: r.focus })),
    textSizes,
    smallestText: fontRows.slice(0, 12),
  },
  console: {
    groups: consoleGroups.map((g) => ({ ...g, routes: [...g.routes], viewports: [...g.viewports] })),
    pageErrors: [...pageErrorGroups.entries()].map(([sig, count]) => ({ sig, count })),
    totalErrors: results.reduce((n, r) => n + (r.consoleErrors?.length ?? 0), 0),
  },
};

if (args.json) {
  if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('# Review summary\n');
  console.log(`Measurements: ${report.summary.measurements} across ${report.summary.routes} routes × [${viewports.join(', ')}]`);
  console.log(`Error boundaries: ${report.summary.errorBoundaries.length}`);
  console.log(`Non-ok statuses: ${report.summary.nonOkStatus.length}\n`);

  console.log('## axe rules\n');
  console.log('| rule | impact | routes | nodes | help |');
  console.log('|---|---|---|---|---|');
  for (const r of rules) console.log(`| ${r.id} | ${r.impact} | ${r.routes.size} | ${r.nodes} | ${esc(r.help)} |`);

  console.log('\n## console error groups\n');
  console.log('| signature | occurrences | routes |');
  console.log('|---|---|---|');
  for (const g of consoleGroups.slice(0, 15)) console.log(`| ${esc(g.sig)} | ${g.count} | ${g.routes.size} |`);

  console.log('\n## layout\n');
  console.log(`- horizontal overflow: ${report.layout.overflowCount} measurement(s)`);
  console.log(`- small touch targets: ${report.layout.smallTargetCount}`);
  console.log(`- clipped text: ${report.layout.clippedCount}`);
  console.log(`- heading jumps: ${report.layout.headingJumpCount}`);
  console.log(`- missing focus ring: ${report.layout.noFocusRing.length}`);
  console.log(`- text sizes seen: ${JSON.stringify(report.layout.textSizes)}`);
}

if (args.out) {
  writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(`\n[summarize] wrote ${args.out}`);
}
