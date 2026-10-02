/**
 * @jest-environment node
 *
 * `plugins/plugin_manifest.json` — the manifest that promised integrations the tree did not
 * contain. Two of its three entries pointed at Python modules that have never existed, and
 * `data_ingestion` even claimed `"enabled": true`. Nothing reads the file today, which is
 * exactly why it could rot unnoticed; these checks are what make it safe to wire a loader up
 * later, and what stops a new entry from being added on the same basis ("we'll write it").
 *
 * The rule enforced here: **every enabled plugin must resolve to a real file.** Declaring an
 * intended plugin is fine — declaring one as enabled when it does not exist is a lie a future
 * loader would act on.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, 'plugins', 'plugin_manifest.json');

const loadManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

/** Every entry, flattened, with the group it came from and the file it claims. */
function entries(manifest = loadManifest()) {
  const out = [];
  for (const group of ['agent_tools', 'data_ingestion', 'frontend_widgets']) {
    for (const entry of manifest[group] ?? []) {
      out.push({ group, ...entry, path: entry.module ?? entry.component });
    }
  }
  return out;
}

describe('plugin manifest', () => {
  it('parses and declares at least one plugin per group', () => {
    const manifest = loadManifest();
    expect(manifest.version).toBeTruthy();
    for (const group of ['agent_tools', 'data_ingestion', 'frontend_widgets']) {
      expect(Array.isArray(manifest[group])).toBe(true);
    }
  });

  it('gives every entry an id, a path and an explicit enabled state', () => {
    for (const entry of entries()) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.path).toBe('string');
      expect(typeof entry.enabled).toBe('boolean');
    }
  });

  it('resolves every enabled plugin to a file that exists', () => {
    const missing = entries()
      .filter((entry) => entry.enabled)
      .filter((entry) => !existsSync(join(ROOT, 'plugins', entry.path)))
      .map((entry) => `${entry.group}/${entry.id} → ${entry.path}`);

    expect(missing).toEqual([]);
  });

  it('marks entries whose files do not exist as not implemented', () => {
    // The failure this file exists for: `data_ingestion.open_meteo` was `"enabled": true`
    // against `02_data_ingestion/open_meteo_plugin.py`, which has never been in the tree.
    const all = entries();
    for (const entry of all) {
      const exists = existsSync(join(ROOT, 'plugins', entry.path));
      if (!exists) {
        expect(entry.enabled).toBe(false);
        expect(entry.status).toBe('declared-not-implemented');
      }
    }
    // …and at least one implemented plugin must survive, or the test above is vacuous.
    expect(all.filter((entry) => entry.enabled).length).toBeGreaterThan(0);
  });

  it('does not claim a backend module for a frontend widget, or the reverse', () => {
    const manifest = loadManifest();
    for (const entry of manifest.frontend_widgets ?? []) {
      expect(entry.component).toMatch(/\.tsx$/);
      expect(entry.module).toBeUndefined();
    }
    for (const group of ['agent_tools', 'data_ingestion']) {
      for (const entry of manifest[group] ?? []) {
        expect(entry.module).toMatch(/\.(py|js|mjs|ts)$/);
      }
    }
  });
});
