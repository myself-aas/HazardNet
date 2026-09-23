/**
 * Full axe node detail for the rules the sweep flagged.
 *
 * The sweep (`design-review.mjs`) counts violations, which is the right shape for
 * "how widespread is this". It is the wrong shape for fixing anything: "colour
 * contrast fails on 18 routes" does not tell you which element, which two colours,
 * or what ratio it reached. This script re-runs axe on the routes that matter and
 * keeps `any[].data` — the measured contrast ratio, the fg/bg pair, and the CSS
 * selector — so every remediation in the report names an element that exists.
 *
 * Usage: node scripts/qa/a11y-detail.mjs --out=/tmp/hn-a11y-detail.json
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launchBrowser, playwright } from './browser.mjs';

const require = createRequire(import.meta.url);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);

const BASE = args.base ?? 'http://127.0.0.1:3000';
const OUT = args.out ?? '/tmp/hn-a11y-detail.json';
const SHOTS = args.shots ?? '/tmp/hn-a11y-shots';

/**
 * One representative route per distinct shell, plus the two routes the sweep
 * flagged most heavily. Reviewing all 45 would mostly re-measure the same
 * shared header and footer.
 */
const ROUTES = (args.routes ? String(args.routes).split(',') : [
  '/', '/live', '/archive', '/alerts', '/forecast/district/dhaka',
  '/advisories', '/docs', '/districts', '/model-performance', '/blog-404-probe',
]);

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const { chromium } = playwright();
  const browser = await launchBrowser(chromium);
  const out = [];

  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('h1, main, .leaflet-container', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1400);
      await page.addScriptTag({ content: axeSource });

      const violations = await page.evaluate(async () => {
        const res = await window.axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
        });
        return res.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          description: v.description,
          helpUrl: v.helpUrl,
          wcag: (v.tags ?? []).filter((t) => t.startsWith('wcag')),
          nodes: v.nodes.slice(0, 25).map((n) => {
            // `any`/`all`/`none` carry the evidence: for colour contrast that is
            // the measured ratio and the fg/bg pair axe actually sampled.
            const checks = [...(n.any ?? []), ...(n.all ?? []), ...(n.none ?? [])];
            const evidence = {};
            for (const c of checks) {
              if (c.data && Object.keys(c.data).length) evidence[c.id] = c.data;
            }
            return {
              target: Array.isArray(n.target) ? n.target.join(' ') : String(n.target),
              html: (n.html ?? '').slice(0, 220),
              failureSummary: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 260),
              evidence,
            };
          }),
          totalNodes: v.nodes.length,
        }));
      });

      const name = route.replace(/[^a-z0-9]+/gi, '_') || '_root';
      await page.screenshot({ path: `${SHOTS}/a11y${name}.png` });
      out.push({ route, violations });
      const counted = violations.reduce((sum, v) => sum + v.totalNodes, 0);
      console.log(`${route.padEnd(30)} rules=${violations.length} nodes=${counted}`);
    } catch (err) {
      console.log(`${route.padEnd(30)} CRASHED ${String(err.message).slice(0, 90)}`);
      out.push({ route, error: String(err.message).slice(0, 200), violations: [] });
    }
    await page.close();
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify({ base: BASE, generatedBy: 'scripts/qa/a11y-detail.mjs', impacts: IMPACTS, results: out }, null, 2));
  console.log(`[a11y-detail] wrote ${OUT}`);
}

main().catch((err) => {
  console.error('[a11y-detail] FAILED:', err);
  process.exit(1);
});
