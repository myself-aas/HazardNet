/** Node-only reader for the built public asset (not the technical CSV). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readPublishedDailySnapshot(root = process.cwd()) {
  const assetRoot = process.env.NODE_ENV === 'production' ? 'dist' : 'public';
  const asset = path.join(root, 'frontend', assetRoot, 'data', 'daily-advisories-v1.json');
  try {
    return JSON.parse(await readFile(asset, 'utf8'));
  } catch {
    return null;
  }
}
