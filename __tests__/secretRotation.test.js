/**
 * @jest-environment node
 *
 * The rotation register is a security control, so it gets the same treatment as the rules
 * file: shape checks that cannot rot, plus behavioural checks on the gate itself. The
 * behavioural ones run `scripts/check-secret-rotation.mjs` against throwaway manifests in a
 * temp directory — the real register is never mutated by a test, and `audit()` is also
 * exported so the arithmetic can be pinned without spawning a process.
 */

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadManifest, audit, evaluate } from '../scripts/check-secret-rotation.mjs';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'data', 'security', 'secret-rotation.json');
const SCRIPT = join(ROOT, 'scripts', 'check-secret-rotation.mjs');
const NOW = Date.parse('2026-10-02T00:00:00Z');

const run = (args = []) => {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [SCRIPT, '--now', new Date(NOW).toISOString(), ...args], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const writeManifest = (secrets, defaults = { grace_days: 14, warn_days: 30 }) => {
  const dir = mkdtempSync(join(tmpdir(), 'rotation-'));
  const path = join(dir, 'secret-rotation.json');
  writeFileSync(path, JSON.stringify({ version: 1, defaults, secrets }));
  return path;
};

describe('secret rotation register', () => {
  it('exists and parses', () => {
    const manifest = loadManifest(MANIFEST);
    expect(manifest.secrets.length).toBeGreaterThan(0);
  });

  it('gives every credential a cadence decision and a blast-radius note', () => {
    for (const entry of loadManifest(MANIFEST).secrets) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      // `null` is a decision too: "rotate on compromise only" (the Play upload key).
      expect(entry.cadence_days === null || entry.cadence_days > 0).toBe(true);
      expect(entry).toHaveProperty('last_rotated');
      expect(typeof entry.scope).toBe('string');
      expect(typeof entry.impact).toBe('string');
      expect(entry.impact.length).toBeGreaterThan(20);
      expect(entry.procedure).toMatch(/^docs\/ops\/secret-rotation\.md#/);
    }
  });

  it('names each credential once, and only credentials the setup guide documents', () => {
    const manifest = loadManifest(MANIFEST);
    const ids = manifest.secrets.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    // A credential nobody knows how to create is a ghost entry; ENVIRONMENT_SECRETS.md is
    // the document that says how each one is obtained.
    const guide = readFileSync(join(ROOT, 'docs', 'ENVIRONMENT_SECRETS.md'), 'utf8');
    for (const id of ids) expect(guide).toContain(id);
  });

  it('points every procedure anchor at a heading that exists', () => {
    const runbook = readFileSync(join(ROOT, 'docs', 'ops', 'secret-rotation.md'), 'utf8');
    // Same rule GitHub uses for heading anchors: lowercase, drop punctuation, spaces → hyphens.
    const headings = [...runbook.matchAll(/^#{2,3}\s+(.*)$/gm)].map((match) => match[1]
      .toLowerCase()
      .replace(/[^\w\- ]/g, '')
      .trim()
      .replace(/ /g, '-'));
    for (const entry of loadManifest(MANIFEST).secrets) {
      const anchor = entry.procedure.split('#')[1];
      expect(headings).toContain(anchor);
    }
  });
});

describe('check-secret-rotation.mjs', () => {
  it('marks a credential rotated yesterday as healthy', () => {
    const path = writeManifest([{ id: 'FRESH', cadence_days: 90, last_rotated: '2026-10-01' }]);
    const { code, out } = run(['--manifest', path]);
    expect(code).toBe(0);
    expect(out).toContain('FRESH');
    expect(out).toContain('due in 89d');
  });

  it('fails on an overdue credential and prints how far past due it is', () => {
    const path = writeManifest([{ id: 'STALE', cadence_days: 90, last_rotated: '2026-01-01' }]);
    const { code, out } = run(['--manifest', path]);
    expect(code).toBe(1);
    expect(out).toContain('STALE');
    expect(out).toMatch(/184d overdue/);
  });

  it('treats a missing rotation date as unknown, not as healthy', () => {
    const path = writeManifest([{ id: 'UNKNOWN', cadence_days: 90, last_rotated: null }]);
    expect(run(['--manifest', path]).code).toBe(0);
    expect(run(['--manifest', path]).out).toContain('last rotation never recorded');
    // …and as a failure once the register is expected to be complete.
    expect(run(['--manifest', path, '--strict']).code).toBe(1);
  });

  it('leaves a credential with no cadence alone', () => {
    const path = writeManifest([{ id: 'UPLOAD_KEY', cadence_days: null, last_rotated: null }]);
    const { code, out } = run(['--manifest', path, '--strict']);
    expect(code).toBe(0);
    expect(out).toContain('no cadence');
  });

  it('fails with exit code 2 when the register itself is unreadable', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rotation-')), 'nope.json');
    expect(run(['--manifest', path]).code).toBe(2);
  });

  it('warns inside the window and only fails once the grace period is spent', () => {
    const entry = { id: 'EDGE', cadence_days: 90, last_rotated: '2026-07-10' };
    const evaluated = evaluate(entry, { now: NOW, graceDays: 14, warnDays: 30 });
    expect(evaluated.status).toBe('due-soon');
    expect(audit({ secrets: [entry], defaults: { grace_days: 14, warn_days: 30 } }, { now: NOW }).ok).toBe(true);

    const spent = { ...entry, last_rotated: '2026-06-15' };
    expect(evaluate(spent, { now: NOW, graceDays: 14, warnDays: 30 }).status).toBe('overdue');
    expect(audit({ secrets: [spent] }, { now: NOW }).ok).toBe(false);
  });
});

describe('the live register', () => {
  it('is auditable today without throwing', () => {
    const report = audit(loadManifest(MANIFEST), { now: NOW });
    expect(report.results.length).toBe(loadManifest(MANIFEST).secrets.length);
    // No invented dates: until the owner records the first rotation, every dated entry is
    // unknown, which must not read as "rotated".
    for (const result of report.results) {
      expect(result.status === 'unknown' || result.status === 'not-scheduled').toBe(true);
      expect(result.status).not.toBe('ok');
    }
  });
});
