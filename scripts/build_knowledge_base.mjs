#!/usr/bin/env node
/**
 * Knowledge-base compiler — `npm run build:knowledge` / `npm run check:knowledge`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The support agent retrieves from `backend/services/knowledge/corpus.json`, which
 * is authored and reviewed by hand. But that file has to be readable in four
 * runtimes at once — Node (Express, Vercel, Firebase), a Cloudflare Worker
 * isolate, and the browser bundle that powers offline mode. A JSON import is not
 * portable across those: Node 20 (this repo's CI target) does not support import
 * attributes unflagged, so `import corpus from './corpus.json'` would load
 * everywhere except the one place the backend actually runs.
 *
 * So the corpus is compiled to a plain ESM module, exactly as
 * `scripts/build_content_engine.mjs` compiles the site's generated routes. The
 * authored JSON stays the source of truth; the emitted file is an artifact.
 *
 * WHAT IT VALIDATES
 * -----------------
 * The compiler is also the corpus's gate, because a support agent that retrieves
 * an uncited or malformed document is worse than one that retrieves nothing:
 *   · every document has id, title, category, authority, body and at least one tag
 *   · ids are unique, and every skill card's `document_ids` resolves to a document
 *   · `basis` is one of the three declared provenance kinds
 *   · no document carries research material — the knowledge base is public support
 *     content, and the research corpus is private and must stay that way
 *   · the national helplines are present, because an answer without 999 is not a
 *     hazard answer
 *
 * USAGE
 *   node scripts/build_knowledge_base.mjs           write the artifact
 *   node scripts/build_knowledge_base.mjs --check   fail on drift (CI)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_CARDS } from '../backend/services/knowledge/skills.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(ROOT, 'backend/services/knowledge/corpus.json');
const TARGET = join(ROOT, 'backend/services/knowledge/corpus.generated.js');

const ALLOWED_BASIS = ['repo-artifact', 'official-directory', 'general-practice'];
const REQUIRED_NUMBERS = ['999', '1090', '16123'];

/** Words that would mean research material had leaked into a public corpus. */
const RESEARCH_MARKERS = [
  'unpublished', 'preprint', 'confidential', 'internal model card', 'held-out set',
  'validation split', 'ablation', 'private dataset', 'not for distribution',
];

function fail(message) {
  console.error(`[knowledge-base] ${message}`);
  process.exit(1);
}

const source = existsSync(SOURCE) ? readFileSync(SOURCE, 'utf8') : fail(`${SOURCE} is missing`);
let corpus;
try {
  corpus = JSON.parse(source);
} catch (error) {
  fail(`corpus.json does not parse: ${error.message}`);
}

const documents = Array.isArray(corpus?.documents) ? corpus.documents : [];
if (!documents.length) fail('corpus.json declares no documents');

const errors = [];
const ids = new Set();
const allBodies = documents.map((doc) => String(doc.body ?? '')).join('\n').toLowerCase();

for (const doc of documents) {
  const label = doc?.id ?? '(missing id)';
  for (const field of ['id', 'title', 'category', 'authority', 'body']) {
    if (!doc?.[field] || !String(doc[field]).trim()) errors.push(`${label}: missing ${field}`);
  }
  if (!Array.isArray(doc?.tags) || !doc.tags.length) errors.push(`${label}: needs at least one tag`);
  if (!ALLOWED_BASIS.includes(doc?.basis)) {
    errors.push(`${label}: basis "${doc.basis}" is not one of ${ALLOWED_BASIS.join(', ')}`);
  }
  if (doc?.id) {
    if (ids.has(doc.id)) errors.push(`${label}: duplicate id`);
    ids.add(doc.id);
  }
  for (const marker of RESEARCH_MARKERS) {
    if (String(doc?.body ?? '').toLowerCase().includes(marker)) {
      errors.push(`${label}: body contains research marker "${marker}"`);
    }
  }
}

for (const [skill, card] of Object.entries(SKILL_CARDS)) {
  for (const documentId of card.documents) {
    if (!ids.has(documentId)) errors.push(`skill "${skill}" cites unknown document "${documentId}"`);
  }
}

for (const number of REQUIRED_NUMBERS) {
  if (!allBodies.includes(number)) errors.push(`no document mentions the ${number} helpline`);
}

if (errors.length) {
  for (const error of errors) console.error(`[knowledge-base] ${error}`);
  process.exit(1);
}

const generated = `/**
 * GENERATED FILE — do not edit.
 *
 * Compiled from backend/services/knowledge/corpus.json by
 * scripts/build_knowledge_base.mjs, which also validates it. Regenerate with
 * \`npm run build:knowledge\`; CI fails on drift with \`npm run check:knowledge\`.
 *
 * It is a module rather than a JSON import because the corpus has to load in
 * Node 20 (no unflagged import attributes), a Cloudflare Worker isolate and the
 * browser bundle that serves offline mode.
 *
 * ${documents.length} public support documents. No research content.
 */
export default ${JSON.stringify(corpus, null, 2)};
`;

if (process.argv.includes('--check')) {
  if (!existsSync(TARGET)) fail(`${TARGET} is missing — run \`npm run build:knowledge\``);
  const current = readFileSync(TARGET, 'utf8');
  if (current !== generated) {
    fail(`${TARGET} is stale — run \`npm run build:knowledge\` and commit it`);
  }
  console.log(`[knowledge-base] PASS: ${documents.length} documents, artifact up to date.`);
  process.exit(0);
}

writeFileSync(TARGET, generated);
console.log(`[knowledge-base] ${documents.length} documents → ${TARGET.replace(`${ROOT}/`, '')}`);
