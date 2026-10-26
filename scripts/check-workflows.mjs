#!/usr/bin/env node
/**
 * Workflow shape gate — Node replacement for the deleted `scripts/tests/test_workflows.py`
 * (the Python stack left the tree in the history squash; the guards it enforced must not).
 * Wired in `ci.yml`'s `test-pipeline-scripts` job.
 *
 * Guards, both of which made GitHub reject an entire workflow file with zero jobs
 * (the September 2026 CI outage):
 *
 *   1. Every `.github/workflows/*.yml` must PARSE as YAML.
 *   2. No workflow may use the `secrets` context in ANY `if:` — job-level or step-level.
 *      GitHub rejects the whole file either way; gate on a resolved step output instead.
 *   3. `ci.yml` structural invariants the deleted pytest suite also pinned:
 *      a. the backend jest step passes no bare positional selector (`npx jest … 'src'`
 *         silently re-scopes coverage — `--testPathIgnorePatterns` is array-valued and
 *         swallows following args), b. the model-version handshake step exists,
 *      c. the claims-registry step exists, d. `verify` needs `test-pipeline-scripts`.
 *
 * Run: `node scripts/check-workflows.mjs`
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOWS = join(ROOT, '.github/workflows');

const files = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('[workflows] no workflow files found — is this the repo root?');
  process.exit(2);
}

const failures = [];

/** Collect every `if:` expression with its owning job/step path. */
function* findIfs(node, trail = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) yield* findIfs(node[i], [...trail, i]);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'if') yield { trail: trail.join('.'), value: String(value) };
    else yield* findIfs(value, [...trail, key]);
  }
}

for (const file of files) {
  const source = readFileSync(join(WORKFLOWS, file), 'utf8');
  let doc;
  try {
    doc = parseYaml(source);
  } catch (error) {
    failures.push(`${file}: does not parse as YAML — ${error.message.split('\n')[0]}`);
    continue;
  }
  if (!doc || typeof doc !== 'object' || !doc.jobs) {
    failures.push(`${file}: parses but has no jobs map`);
    continue;
  }
  for (const { trail, value } of findIfs(doc)) {
    if (/\bsecrets\./.test(value)) {
      failures.push(
        `${file}: \`if: ${value}\` at ${trail} uses the secrets context — ` +
          `resolve the secret into a step output and gate on that instead`,
      );
    }
  }
  console.log(`[workflows] ${file}: parses, ${Object.keys(doc.jobs).length} job(s), no secrets-in-if`);
}

if (failures.length) {
  console.error(`\n[workflows] FAIL:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

/* ─── ci.yml structural invariants (old test_workflows.py pins) ─── */

const ci = parseYaml(readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8'));

const stepNames = (job) =>
  (ci.jobs?.[job]?.steps || []).map((s) => `${s.name || ''}\n${s.run || ''}`);

// (a) the backend jest invocation's --testPathIgnorePatterns list must be EXACTLY the
// sanctioned scope set: the flag is array-valued, so any extra bare positional (a stray
// `'frontend/src'` selector) is silently swallowed as another ignore pattern and the
// step stays green while covering nothing. Pin the list; adding a scope means editing
// this constant deliberately. (Old pytest: test_backend_jest_step_has_no_bare_selector)
const SANCTIONED_IGNORES = ['/node_modules/', '/e2e/', '/frontend/', '/apps/', '/__mocks__/'].join('|');
for (const blob of stepNames('test-backend')) {
  const line = blob.split('\n').find((l) => /\bnpx jest\b/.test(l));
  if (!line) continue;
  let tokens = line.slice(line.indexOf('npx jest') + 8).trim().split(/\s+/).filter(Boolean);
  const singleValueFlags = new Set(['--config', '--coverageDirectory', '--maxWorkers']);
  const positionals = [];
  let seenIgnores = null;
  const ignIdx = tokens.findIndex((t) => t === '--testPathIgnorePatterns' || /^--testPathIgnorePatterns=/.test(t));
  if (ignIdx !== -1) {
    // yargs array flag: `--flag val val2` and `--flag=val1 val2` both keep swallowing
    // every following non-flag token into the same array — the tail was the old
    // bug's hiding place
    const first = tokens[ignIdx].includes('=')
      ? [tokens[ignIdx].slice(tokens[ignIdx].indexOf('=') + 1)]
      : [];
    let end = ignIdx + 1;
    while (end < tokens.length && !tokens[end].startsWith('-')) end += 1;
    seenIgnores = [...first, ...tokens.slice(ignIdx + 1, end)].map((v) => v.replace(/^'|'$/g, ''));
    tokens = [...tokens.slice(0, ignIdx), ...tokens.slice(end)];
  }
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (['&&', '||', ';', '|'].includes(t) || /^2?>&?1?$/.test(t) || /^2?>\s*\/dev\//.test(t)) break;
    if (/^--[a-zA-Z][\w-]*=/.test(t)) continue;
    if (singleValueFlags.has(t)) { i += 1; continue; }
    if (t.startsWith('-')) continue;
    positionals.push(t);
  }
  if (seenIgnores === null || seenIgnores.join('|') !== SANCTIONED_IGNORES) {
    failures.push(
      `ci.yml test-backend: --testPathIgnorePatterns is ${seenIgnores ? JSON.stringify(seenIgnores) : 'missing'}; ` +
        `must be exactly ${JSON.stringify(SANCTIONED_IGNORES.split('|'))} — anything else green-lights wrong coverage`,
    );
  }
  if (positionals.length) {
    failures.push(
      `ci.yml test-backend: bare positional selector(s) ${positionals.join(' ')} on \`npx jest\` ` +
        `(swallowed into ignore patterns or silently re-scoping coverage)`,
    );
  }
}

// (b) + (c) the handshake and claims gates must exist as named steps
if (!stepNames('verify').some((n) => n.includes('Model version handshake is committed and clean'))) {
  failures.push('ci.yml verify: "Model version handshake is committed and clean" step missing');
}
if (!stepNames('verify').some((n) => n.includes('Claims registry verification'))) {
  failures.push('ci.yml verify: "Claims registry verification" step missing');
}

// (d) verify still aggregates the pipeline-scripts job (a rename here silently un-blocks merges)
const verifyNeeds = ci.jobs?.verify?.needs;
const needs = Array.isArray(verifyNeeds) ? verifyNeeds : verifyNeeds ? [verifyNeeds] : [];
if (!needs.includes('test-pipeline-scripts')) {
  failures.push('ci.yml verify.needs no longer includes test-pipeline-scripts — pipeline smoke tests no longer gate merges');
}

if (failures.length) {
  console.error(`\n[workflows] FAIL (ci.yml structure):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`[workflows] OK: ${files.length} workflow files loadable, secrets-safe; ci.yml invariants hold`);
