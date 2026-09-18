/**
 * @jest-environment node
 *
 * Phase 6 (SEC-12): Firestore rules coverage.
 *
 * CONCERNS §3 carried this as `[TODO]`: the rules were written but never tested. Full
 * behavioural coverage needs the Firestore emulator (`@firebase/rules-unit-testing` plus
 * the emulator JAR, i.e. Java), which is not available in this sandbox or in CI — that run
 * is written down as an owner action instead of being implied. What is verified here is the
 * part that has actually gone wrong before: the *shape* of the file. These checks fail on
 * the mistakes that are easy to make and invisible until someone exploits them — a
 * permissive catch-all, a write with no condition, a user-scoped collection missing the
 * ownership check, a collection the client writes to that the rules never mention.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RULES = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

/**
 * Minimal block scanner: returns `{ name, body }` for each `match /<name>/{...} { … }`.
 * A brace-balanced walk rather than a regex, because `allow update:` statements in this
 * file legitimately continue onto a second line, and a line-oriented check would read
 * them as unconditioned.
 */
function matchBlocks(source = RULES) {
  const blocks = [];
  const stack = [];
  for (const raw of source.split('\n')) {
    const opening = raw.match(/^\s*match \/(.+?)\s*\{\s*$/);
    if (opening) {
      stack.push({ name: opening[1], body: [] });
      continue;
    }
    // Every open block sees the line; nested blocks stay independently addressable.
    for (const block of stack) block.body.push(raw);

    const closes = (raw.match(/}/g) || []).length;
    const opens = (raw.match(/{/g) || []).length;
    if (closes > opens) {
      for (let i = 0; i < closes - opens && stack.length > 0; i += 1) blocks.push(stack.pop());
    }
  }
  while (stack.length > 0) blocks.push(stack.pop());
  return blocks;
}

/** Full `allow …;` statements from a block body, continuation lines joined. */
function allowStatements(body) {
  const statements = [];
  let pending = null;
  for (const raw of Array.isArray(body) ? body : body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (pending === null) {
      if (!line.startsWith('allow ')) continue;
      pending = line;
    } else {
      pending += ` ${line}`;
    }
    if (pending.endsWith(';')) {
      statements.push(pending.replace(/\s+/g, ' '));
      pending = null;
    }
  }
  return statements;
}

const findBlock = (name) => {
  const found = matchBlocks().find((b) => b.name === name || b.name.startsWith(`${name}/`));
  if (!found) throw new Error(`no rules block for ${name}`);
  return found;
};

/** Just the `allow …;` statements of a collection block. */
const block = (name) => allowStatements(findBlock(name).body.join('\n'));

/** The whole block body, including validation calls and comments. */
const rawBlock = (name) => findBlock(name).body.join('\n');

/** Collections the browser client writes to, read from the source rather than listed here. */
function clientCollections() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) {
        for (const match of readFileSync(full, 'utf8').matchAll(/collection\([^,]+,\s*'([a-z_]+)'/g)) {
          found.add(match[1]);
        }
      }
    }
  };
  walk(join(process.cwd(), 'frontend/src'));
  return [...found].sort();
}

describe('firestore.rules shape', () => {
  it('is rules_version 2, scoped to cloud.firestore only', () => {
    expect(RULES).toMatch(/rules_version\s*=\s*'2'/);
    expect(RULES).toMatch(/service cloud\.firestore/);
    expect(RULES).not.toMatch(/service cloud\.storage/);
  });

  it('denies everything by default', () => {
    const catchAll = matchBlocks().find((b) => b.name.includes('{document=**}'));
    expect(catchAll).toBeTruthy();
    expect(catchAll.body.join('\n')).toMatch(/allow read, write: if false/);
  });

  it('never grants a write without a condition', () => {
    const offenders = matchBlocks().flatMap(({ name, body }) => allowStatements(body)
      .filter((statement) => /allow [^:]*\b(create|update|delete|write)\b/.test(statement))
      .filter((statement) => /:\s*if\s+true\s*;/.test(statement))
      .map((statement) => `${name}: ${statement}`));
    expect(offenders).toEqual([]);
  });

  it('exposes public reads only where they are documented', () => {
    // Public by design: the forecast feed (the website's live layer), public profiles, and
    // published blog articles. Any *new* `if true` read must be a deliberate decision.
    const publicReads = matchBlocks().flatMap(({ name, body }) => allowStatements(body)
      .filter((statement) => /if true;/.test(statement))
      .map((statement) => `${name}: ${statement}`));

    expect(publicReads.sort()).toEqual([
      'blog_articles/{articleId}: allow get, list: if true;',
      'forecasts/{forecastId}: allow get, list: if true;',
      'profiles/{userId}: allow get, list: if true;',
    ]);
  });

  it('gates every client-writable collection on the caller’s own identity', () => {
    // Either directly (`request.auth.uid`) or through a helper that does exactly that.
    const authAware = /request\.auth|isOwner\(|isSignedIn\(|isBlogSuperadmin\(/;
    for (const collection of ['user_connectors', 'assessments', 'alerts', 'users', 'profiles']) {
      const writes = block(collection).filter((s) => /\b(create|update|delete|write)\b/.test(s));
      expect(writes.length).toBeGreaterThan(0);
      for (const write of writes) {
        expect(write).toMatch(authAware);
      }
    }
  });

  it('keeps blog and forecast writes out of client hands entirely', () => {
    // Blog: superadmin claim only. Forecasts: denied (the server-side store is the writer).
    for (const write of block('blog_articles').filter((s) => /\b(create|update|delete)\b/.test(s))) {
      expect(write).toMatch(/isBlogSuperadmin\(\)/);
      expect(write).not.toMatch(/isSignedIn\(\)\s*;/);
    }
    const forecastWrites = block('forecasts').filter((s) => /\b(create|update|delete)\b/.test(s));
    expect(forecastWrites).toEqual(['allow create, update, delete: if false;']);
  });

  it('validates the shape of documents it accepts, and defines those validators', () => {
    for (const [collection, validator] of [
      ['profiles', 'isValidUserProfile'],
      ['assessments', 'isValidAssessment'],
      ['alerts', 'isValidUserAlert'],
    ]) {
      expect(rawBlock(collection)).toContain(validator);
      expect(RULES).toMatch(new RegExp(`function ${validator}\\(`));
    }
  });

  it('ties connector rows to the document owner rather than the id the client sent', () => {
    // The documented SEC-01/SEC-09 bug: `if isSignedIn()` let any account read or overwrite
    // any other account's connector config (webhook URLs included).
    const statements = block('user_connectors').join('\n');
    expect(statements).toMatch(/isCallerOwned\(existing\(\)\)/);
    expect(statements).toMatch(/isCallerOwned\(incoming\(\)\)/);
    expect(statements).not.toMatch(/allow (get|list|create|update|delete)[^:]*: if isSignedIn\(\);/);
  });

  it('reads the ownership field under both spellings the codebase writes', () => {
    // Phase 6 finding: the client writes `user_id` (AuthContext.saveAssessment /
    // updateUserProfile) while the rules compared `userId`, so owner checks read
    // `undefined` and every client-owned row was denied — and the validators never ran.
    expect(RULES).toMatch(/function ownerOf\(data\)/);
    expect(RULES).toMatch(/'user_id' in data/);
    expect(RULES).toMatch(/'userId' in data/);
    for (const collection of ['assessments', 'alerts', 'user_connectors']) {
      expect(block(collection).join('\n')).toContain('isCallerOwned(');
    }
  });

  it('applies the profile validator instead of leaving it defined and unused', () => {
    const profileWrites = block('profiles').filter((s) => /\b(create|update)\b/.test(s));
    expect(profileWrites.length).toBe(2);
    for (const write of profileWrites) {
      expect(write).toContain('isValidUserProfile(incoming())');
    }
  });

  it('validates the fields the client actually writes to a profile', () => {
    // Anchored to reality: each field below is asserted to appear in the frontend source,
    // so this list cannot rot into fiction as the profile document evolves.
    const frontendSource = (() => {
      let text = '';
      const walk = (dir) => {
        for (const entry of readdirSync(dir)) {
          if (entry === 'node_modules' || entry === '__tests__') continue;
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.tsx?$/.test(full)) text += readFileSync(full, 'utf8');
        }
      };
      walk(join(process.cwd(), 'frontend/src'));
      return text;
    })();

    const writtenFields = [
      'display_name', 'email', 'username', 'role', 'user_role', 'organization',
      'farm_size_hectares', 'primary_division', 'primary_district', 'target_crops',
      'phone_number', 'photo_url', 'home_district_id', 'bio', 'website',
    ];
    for (const field of writtenFields) {
      expect(frontendSource).toContain(field);
      expect(RULES).toContain(`'${field}'`);
    }
  });

  it('looks like it will compile: balanced delimiters and only defined helpers', () => {
    // Not a substitute for the emulator (see the file header) — but a typo in a helper name
    // or an unbalanced brace makes `firebase deploy --only firestore:rules` fail, and that
    // deploy is manual, so nothing else in CI would catch it.
    const opens = (RULES.match(/\(/g) || []).length;
    const closes = (RULES.match(/\)/g) || []).length;
    expect(opens).toBe(closes);
    expect((RULES.match(/{/g) || []).length).toBe((RULES.match(/}/g) || []).length);

    // Comments legitimately contain parentheses and words like "spelling (Phase 6 …)".
    const code = RULES.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const defined = new Set([...code.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
    const calls = new Set(
      [...code.matchAll(/(^|[^.\w])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[2]),
    );
    const KEYWORDS = new Set(['return', 'if', 'function', 'in', 'is', 'match', 'allow']);
    const undefinedCalls = [...calls].filter((name) => !defined.has(name) && !KEYWORDS.has(name));
    expect(undefinedCalls).toEqual([]);
    expect(defined.size).toBeGreaterThanOrEqual(12);
  });

  it('knows about every collection the browser client touches', () => {
    const collections = clientCollections();
    expect(collections.length).toBeGreaterThan(0);
    const unknown = collections.filter((name) => !RULES.includes(`match /${name}/`));
    expect(unknown).toEqual([]);
  });
});
