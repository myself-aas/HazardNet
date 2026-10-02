#!/usr/bin/env node
/**
 * Vercel function-budget gate.
 *
 * Why this exists: the Hobby plan allows **at most 12 Serverless Functions per
 * deployment**, and Vercel turns every file under `api/` into one function. The 13th file
 * does not degrade gracefully — the whole deployment is rejected
 * (`exceeded_serverless_functions_per_deployment`), and because the build itself succeeds
 * ("Build Completed … Deploying outputs … fails") the failure reads as infrastructure
 * rather than as a repository change. Production then keeps serving the last successful
 * deployment, so the symptom is a site that is quietly stale.
 *
 * This gate counts `api/` on every CI run, before a deploy ever sees it. The routing
 * design that keeps the count low (one entry point per URL *family*, the handlers in
 * `serverless/`) is documented in docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget and exercised by
 * __tests__/api/serverlessRouting.test.js.
 *
 * Counting rule: every file under `api/`, whatever its extension. Vercel ignores
 * `_`-prefixed files, but this gate deliberately does not depend on that convention —
 * the number it prints is an upper bound, so a false alarm is impossible and a missed
 * limit is not.
 *
 * Usage:
 *   node scripts/check-vercel-functions.mjs
 *   node scripts/check-vercel-functions.mjs --json
 *
 * Exit codes: 0 within budget, 1 over budget.
 */

import { readdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'api');

/** Hard limit on a Hobby deployment; the number Vercel rejects at. */
export const HOBBY_FUNCTION_LIMIT = 12;

/** Report headroom below this, so the next endpoint is added with the budget in sight. */
export const HEADROOM_WARNING = 2;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // A hidden directory is not a function; `.vercel` is gitignored and local-only.
      if (entry.name.startsWith('.')) continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every file under `api/` — the functions this deployment will carry.
 * @param {string} [apiDir] override for tests.
 * @returns {string[]} repo-relative POSIX paths, sorted.
 */
export function listFunctions(apiDir = API_DIR) {
  let files;
  try {
    files = walk(apiDir);
  } catch (error) {
    throw new Error(`cannot read ${relative(ROOT, apiDir)}: ${error.message}`);
  }
  return files.map((file) => relative(ROOT, file).split('\\').join('/')).sort();
}

function main() {
  const wantsJson = process.argv.slice(2).includes('--json');
  const functions = listFunctions();
  const count = functions.length;
  const headroom = HOBBY_FUNCTION_LIMIT - count;

  if (wantsJson) {
    console.log(JSON.stringify({ limit: HOBBY_FUNCTION_LIMIT, count, headroom, functions }, null, 2));
    if (count > HOBBY_FUNCTION_LIMIT) process.exitCode = 1;
    return;
  }

  console.log(
    `[vercel-functions] ${count}/${HOBBY_FUNCTION_LIMIT} Serverless Functions deployed from api/ ` +
      `(${Math.max(0, headroom)} left on the Hobby budget).`,
  );
  for (const file of functions) console.log(`  ${file}`);

  if (count > HOBBY_FUNCTION_LIMIT) {
    console.error(
      `\n[vercel-functions] ${count} functions exceeds the Hobby limit of ${HOBBY_FUNCTION_LIMIT} — ` +
        'Vercel would reject the whole deployment.\n' +
        'Fold the new URL into the entry point for its family (api/[endpoint].js,\n' +
        'api/v1/[resource].js, …) and put the handler in serverless/ — see\n' +
        'docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget.',
    );
    process.exitCode = 1;
    return;
  }

  if (headroom <= HEADROOM_WARNING) {
    console.warn(
      `\n[vercel-functions] only ${headroom} function(s) of headroom left; ` +
        'the next endpoint should be folded into an existing family entry point.',
    );
  }
}

// Importable for tests; only a direct invocation runs the gate.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
