/**
 * @jest-environment node
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'probe_runtime_paths.mjs');

describe('probe_runtime_paths.mjs', () => {
  test('--self-test passes all scenarios including advisories_summary_contract, kaggle_horizon_5tier_shape, and predict_district_shape', () => {
    const ok = spawnSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    const out = ok.stdout + ok.stderr;
    expect(out).toMatch(/advisories_summary_contract/);
    expect(out).toMatch(/kaggle_horizon_5tier_shape/);
    expect(out).toMatch(/predict_district_shape/);
  });

  test('--self-test=broken exits 1 and names hollow forecast/weather contracts', () => {
    const bad = spawnSync(process.execPath, [SCRIPT, '--self-test=broken'], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    const out = bad.stdout + bad.stderr;
    expect(out).toMatch(/current\.temperature_2m/);
    expect(out).toMatch(/kaggle_horizon_5tier_shape/);
    expect(out).toMatch(/predict_district_shape/);
  });
});
