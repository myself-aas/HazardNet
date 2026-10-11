const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('Phase 6 — Final Production Readiness Gate & Full Reproduction Contracts', () => {
  test('Edge model size budget (<= 100 MB) and Models/VERSION.json SHA-256 integrity', () => {
    const versionPath = path.join(ROOT, 'Models/VERSION.json');
    const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

    // Standing constraint: target model size <= 100 MB
    const MAX_BYTES = 100 * 1024 * 1024;
    expect(Array.isArray(version.artifacts)).toBe(true);
    expect(version.artifacts.length).toBeGreaterThan(0);

    for (const artifact of version.artifacts) {
      const artifactPath = path.join(ROOT, 'Models', artifact.name);
      if (!fs.existsSync(artifactPath)) continue;
      const stat = fs.statSync(artifactPath);
      expect(stat.size).toBeLessThanOrEqual(MAX_BYTES);
      expect(stat.size).toBe(artifact.bytes);
      expect(sha256(artifactPath)).toBe(artifact.sha256);
    }

    const int8Path = path.join(ROOT, 'Models/hazardnet_int8.tflite');
    if (fs.existsSync(int8Path)) {
      expect(fs.statSync(int8Path).size).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  test('Strict on-device location privacy is enforced in geolocationService.ts', () => {
    const geoSrc = fs.readFileSync(
      path.join(ROOT, 'frontend/src/services/geolocationService.ts'),
      'utf8'
    );
    // Strip single-line and multi-line comments before verifying no external IP lookup URLs exist
    const codeOnly = geoSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/ipapi\.co|ipwho\.is|freeipapi\.com/i);
  });

  test('Calibration artifact and CI workflow gates remain intact', () => {
    const cal = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'Models/calibration/confidence_map.template.json'), 'utf8')
    );
    expect(cal.format).toBe('hazardnet-calibration/v1');

    const { getPolicy } = require('../backend/alerts/policy.js');
    const policy = getPolicy();
    expect(typeof policy?.agreement_epsilon).toBe('number');
    expect(policy.agreement_epsilon).toBeGreaterThan(0);

    const dailyWorkflow = fs.readFileSync(
      path.join(ROOT, '.github/workflows/daily_advisory_ingest.yml'),
      'utf8'
    );
    expect(dailyWorkflow).toContain('git diff --staged --quiet');

    const siteHealth = fs.readFileSync(
      path.join(ROOT, '.github/workflows/site-health.yml'),
      'utf8'
    );
    expect(siteHealth).toContain('Enforce aggregate site-health probe outcome');
  });

  test('E2E critical paths and smoke tests use deterministic mobile selectors and animation settling', () => {
    const criticalPaths = fs.readFileSync(
      path.join(ROOT, 'e2e/critical-paths.spec.ts'),
      'utf8'
    );
    expect(criticalPaths).toContain(
      "await expect(page.locator('main').getByText(/forecast|hazard/i).first()).toBeVisible();"
    );

    const smoke = fs.readFileSync(path.join(ROOT, 'e2e/smoke.spec.ts'), 'utf8');
    expect(smoke).toContain('b.x >= 0 && b.x + b.width <= 375');
  });
});
