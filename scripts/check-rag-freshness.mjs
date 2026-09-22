// RAG knowledge-base freshness check (ML-03).
// Fails when rag_pipeline/agent_knowledge_base.json is OLDER than any source
// document in references/ or the builder script — i.e., the committed index
// has gone stale relative to the documents it claims to index.
// Run: node scripts/check-rag-freshness.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexFile = path.join(root, 'rag_pipeline', 'agent_knowledge_base.json');
const builder = path.join(root, 'rag_pipeline', 'build_agent_knowledge_base.js');
const refsDir = path.join(root, 'references');

if (!fs.existsSync(indexFile)) {
  console.error('[rag-freshness] agent_knowledge_base.json missing — run build_agent_knowledge_base.js');
  process.exit(1);
}
const indexTime = fs.statSync(indexFile).mtimeMs;

let newestSource = { file: null, mtime: 0 };
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(md|txt|json)$/i.test(entry.name)) {
      const m = fs.statSync(p).mtimeMs;
      if (m > newestSource.mtime) newestSource = { file: path.relative(root, p), mtime: m };
    }
  }
};
walk(refsDir);

const builderTime = fs.statSync(builder).mtimeMs;
// Git checkouts assign all files near-identical mtimes (ms apart, arbitrary
// order), so strict comparisons false-positive on every fresh clone. Flag
// staleness only when a source is meaningfully newer (TOLERANCE_MS).
const TOLERANCE_MS = 60_000;
const staleVsRefs = newestSource.mtime > indexTime + TOLERANCE_MS;
const staleVsBuilder = builderTime > indexTime + TOLERANCE_MS;

console.log(`[rag-freshness] index built:        ${new Date(indexTime).toISOString()}`);
console.log(`[rag-freshness] newest source doc:  ${new Date(newestSource.mtime).toISOString()} (${newestSource.file})`);
console.log(`[rag-freshness] builder script:     ${new Date(builderTime).toISOString()}`);

if (staleVsRefs || staleVsBuilder) {
  console.error(
    '[rag-freshness] STALE: regenerate the index with `node rag_pipeline/build_agent_knowledge_base.js` and commit it.'
  );
  process.exit(1);
}
console.log('[rag-freshness] PASS: knowledge base is fresh.');
