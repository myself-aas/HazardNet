/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

describe('forecast writer runtime dependencies', () => {
  test.each(['firebase-admin', '@google-cloud/firestore'])(
    '%s is required in production, not an optional or development-only install',
    (name) => {
      // Firebase Admin lists Firestore as optional, but durable forecast writes
      // require it. npm must not silently skip it on an unsupported Node version.
      expect(manifest.dependencies[name]).toBeTruthy();
      expect(lock.packages[''].dependencies[name]).toBe(manifest.dependencies[name]);
      const entry = lock.packages[`node_modules/${name}`];
      expect(entry).toBeDefined();
      expect(entry.optional).not.toBe(true);
      expect(entry.dev).not.toBe(true);
    },
  );

  test('a fresh native Node process can import the writer without credentials or Jest mocks', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { getFirestore } from 'firebase-admin/firestore';
      import { persistForecasts } from './backend/forecastPersistence.js';
      if (typeof getFirestore !== 'function' || typeof persistForecasts !== 'function') {
        throw new Error('Forecast writer runtime dependencies are unavailable');
      }
      console.log('forecast writer imports OK');
    `], { cwd: root, encoding: 'utf8', timeout: 15000 });
    expect(output.trim()).toBe('forecast writer imports OK');
  });
});
