/**
 * Test-path discipline: a test may not resolve a repository file from the process cwd.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two suites added on 2026-10-06 (`lib/__tests__/easing.test.ts`,
 * `hooks/__tests__/mapAttribution.test.ts`) guarded source files by reading them:
 *
 *     readFileSync(join(process.cwd(), 'frontend/src/lib/motion-interpolate.ts'))
 *
 * That passed locally from the repository root and failed on every PR, because the `Frontend
 * Tests` job in `.github/workflows/ci.yml` sets `working-directory: frontend` — so `cwd` was
 * `<repo>/frontend` and the path resolved to `<repo>/frontend/frontend/src/...`, an ENOENT. Both
 * suites errored, the frontend job went red, and `Code Quality & Build` (which `needs:` it) never
 * ran. Nothing about the code under test was wrong; the tests were reading the wrong tree.
 *
 * Jest's `rootDir` is the repository root in every job (the config is `jest.config.cjs` at the
 * top), but `rootDir` is not exposed to a test file — `__dirname` is, and it is the same in every
 * job because it is a property of the FILE. So the rule is: anchor on `__dirname` (or on a module
 * imported with a relative specifier), never on `process.cwd()`.
 *
 * WHAT IT SCANS
 * -------------
 * Every `*.test.ts` / `*.test.tsx` under `frontend/src`, for `process.cwd()` used as a path root —
 * `path.join(process.cwd(), …)`, `path.resolve(process.cwd(), …)` or a bare
 * `readFileSync(process.cwd() …)`. A test that only *mentions* `process.cwd()` in a comment or in
 * a message is fine; this reads the file with comments stripped, exactly like the sibling source
 * guards do.
 *
 * The scan is self-checking: if it cannot find the two suites it was written for, it fails, so a
 * refactor cannot leave this file passing vacuously.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Locate the repository root by walking UP from this file until the marker appears.
 *
 * Deliberately not `join(__dirname, '..', ...)`: counting levels is exactly the mistake that broke
 * CI in the first place (the guarded suites were two directories deeper than assumed), and a wrong
 * count fails as an ENOENT that looks like a missing file. A marker cannot be miscounted.
 */
const findUp = (marker: string): string => {
  let dir = __dirname;
  for (;;) {
    if (existsSync(join(dir, marker))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no ${marker} found above ${__dirname}`);
    dir = parent;
  }
};

const FRONTEND_ROOT = join(findUp('jest.config.cjs'), 'frontend');
const SRC = join(FRONTEND_ROOT, 'src');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.test\.tsx?$/.test(entry) ? [full] : [];
  });

/** Comments stripped: they are allowed to name the old mistake. */
const executableSource = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CWD_AS_PATH_ROOT = /(?:join|resolve)\s*\(\s*process\.cwd\(\)|(?:readFileSync|readdirSync|statSync|existsSync)\s*\(\s*process\.cwd\(\)/;

describe('test-path discipline', () => {
  const files = walk(SRC);

  it('finds the suites it guards, so it cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(50);
    const names = files.map((f) => relative(FRONTEND_ROOT, f));
    expect(names).toContain('src/lib/__tests__/easing.test.ts');
    expect(names).toContain('src/hooks/__tests__/mapAttribution.test.ts');
  });

  it('never resolves a repository file from the process cwd', () => {
    const offenders = files
      .filter((file) => CWD_AS_PATH_ROOT.test(executableSource(file)))
      .map((file) => relative(FRONTEND_ROOT, file));

    // The failure message says what to do, because the fix is not "delete the assertion".
    if (offenders.length > 0) {
      throw new Error(
        `${offenders.length} test file(s) resolve paths from process.cwd(), which is ` +
          `'<repo>/frontend' in CI and '<repo>' locally:\n  ${offenders.join('\n  ')}\n` +
          'Anchor on __dirname instead (see the header of this file).',
      );
    }
    expect(offenders).toEqual([]);
  });
});
