#!/usr/bin/env node
/**
 * Environment shape validator — restored 2026-10-25 (the file was deleted in the history
 * squash; `npm run check:env` and the `ci.yml` verify job step "Validate Firebase
 * environment variables" invoke this exact path, so the path is part of the contract).
 *
 * What this gate actually checks (it cannot check *values* — `.env` is gitignored by
 * design, and GitHub Actions secrets are validated separately by
 * `scripts/verify-actions-secrets.sh`):
 *
 *   1. `.env.example` is the shape contract: every declared variable must be present and
 *      **empty-valued** (publication policy: no secret material is ever committed).
 *   2. The browser boot contract still holds: `frontend/src/lib/config.ts` — the single
 *      source of truth (its own header: "Do not introduce additional Firebase config
 *      literals elsewhere") — still provides a fallback for every `VITE_FIREBASE_*`
 *      variable, so the app boots without a local `.env`.
 *   3. The committed public Firebase web-config literals do not reappear anywhere else in
 *      `frontend/src` — the removed `src/firebase.ts` (an unused second project) is the
 *      cautionary tale this check exists to prevent.
 *
 * Everything else (which optional integrations are configured, whether the local
 * developer set overrides) is reported, never enforced: absent keys are a supported,
 * documented mode of this codebase (fail-closed behaviours in
 * `backend/utils/apiKeyAuth.js`, `backend/middleware/cors.js`).
 *
 * Exit codes: 0 pass, 1 fail.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXAMPLE = join(ROOT, '.env.example');
const CONFIG = join(ROOT, 'frontend/src/lib/config.ts');
const WEB_SRC = join(ROOT, 'frontend/src');

const failures = [];
const notes = [];

// 1) .env.example: every variable present, every value empty.
const template = readFileSync(EXAMPLE, 'utf8');
const vars = [];
for (const raw of template.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) {
    failures.push(`.env.example: unparsable line: ${line.slice(0, 60)}`);
    continue;
  }
  vars.push(match[1]);
  if (match[2].trim() !== '') {
    failures.push(`.env.example: ${match[1]} has a committed value — the template must stay empty (publication policy)`);
  }
}
if (vars.length === 0) failures.push('.env.example declares no variables');

// 2) Boot contract: a fallback for every VITE_FIREBASE_* var in config.ts.
const configSource = readFileSync(CONFIG, 'utf8');
const browserVars = vars.filter((v) => v.startsWith('VITE_'));
const firebaseVars = browserVars.filter((v) => v.startsWith('VITE_FIREBASE_'));
const missingFallbacks = firebaseVars.filter((v) => !configSource.includes(`env.${v}`));
if (missingFallbacks.length) {
  failures.push(
    `frontend/src/lib/config.ts no longer reads: ${missingFallbacks.join(', ')} — ` +
      `the boot-without-.env contract is broken. Add the env.<var> || '<fallback>' entries back.`,
  );
}

// 3) The public Firebase literals must live in exactly one place.
//    Matches the identifiers themselves, not the words "firebase" etc.
const LITERALS = ['AIzaSy', '1053636076316', 'hazardnet-aas48424.firebaseapp.com'];
const ALLOWED = new Set(['lib/config.ts']);
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) yield full;
  }
}
for (const file of walk(WEB_SRC)) {
  const rel = relative(WEB_SRC, file);
  if (ALLOWED.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  const hits = LITERALS.filter((l) => text.includes(l));
  if (hits.length) {
    failures.push(
      `frontend/src/${rel} embeds Firebase config literals (${hits.join(', ')}) — ` +
        `config.ts is the single source of truth; import from there instead.`,
    );
  }
}

// Informational report: what is configured in *this* process (never enforced).
const setVars = vars.filter((v) => process.env[v] && process.env[v].trim() !== '');
notes.push(`${vars.length} variables declared in .env.example (${browserVars.length} VITE_* / ${vars.length - browserVars.length} server-only)`);
notes.push(`${setVars.length} set in this environment${setVars.length ? ': ' + setVars.join(', ') : ''}`);
notes.push(`${firebaseVars.length} VITE_FIREBASE_* vars have committed public-by-design fallbacks`);

for (const line of notes) console.log(`[check:env] ${line}`);

if (failures.length) {
  for (const f of failures) console.error(`[check:env] FAIL ${f}`);
  process.exit(1);
}
console.log('[check:env] env shape OK');
