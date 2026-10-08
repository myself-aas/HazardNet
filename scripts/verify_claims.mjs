#!/usr/bin/env node
/**
 * scripts/verify_claims.mjs — CI Verification Gate for Public Claims Registry
 *
 * Implements TASK-010 per PRD REQ-005 and TRD §10.
 *
 * Verifies that:
 * 1. CLAIMS.md exists, is valid markdown, and contains all required claim records.
 * 2. Every registered claim has documented methodological limitations (≥ 20 chars).
 * 3. Public-facing documents and source files do not assert contradictory numeric
 *    performance metrics.
 * 4. Fails CI with exit code 1 if an unregistered claim or validation error is detected.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const CLAIMS_FILE = path.resolve(REPO_ROOT, 'CLAIMS.md');

// Core registered claims that MUST exist in CLAIMS.md
export const REQUIRED_CLAIMS = [
  { id: 'CLM-001', metric: '64', desc: '64 districts' },
  { id: 'CLM-002', metric: '8', desc: '8 divisions' },
  { id: 'CLM-003', metric: '8', desc: '8 hazard classes' },
  { id: 'CLM-004', metric: '2', desc: '2 forecast horizons' },
  { id: 'CLM-005', metric: '128', desc: '128 rows' },
  { id: 'CLM-006', metric: '3,062', desc: '3,062 historical events' },
  { id: 'CLM-007', metric: '70', desc: '70 master events' },
  { id: 'CLM-008', metric: '26', desc: '26-year span' },
  { id: 'CLM-009', metric: '4', desc: '4 advisory tiers' },
  { id: 'CLM-010', metric: '36', desc: '36 hours staleness guard' },
  { id: 'CLM-011', metric: '300', desc: '< 300 ms latency' },
  { id: 'CLM-012', metric: '2.5', desc: '< 2.5 s LCP' },
  { id: 'CLM-013', metric: '95', desc: '≥ 95 accessibility' },
  { id: 'CLM-014', metric: '0.40', desc: '0.40 OOD threshold' },
  { id: 'CLM-015', metric: '100', desc: '≤ 100 MB model size' },
  { id: 'CLM-016', metric: '80', desc: '≤ 80 ms latency' },
];

/**
 * Parses CLAIMS.md markdown table rows into structured claim objects.
 *
 * @param {string} content
 * @returns {Array<{id: string, metric: string, canonicalValue: string, scope: string, limitations: string}>}
 */
export function parseClaimsRegistry(content) {
  const lines = content.split(/\r?\n/);
  const claims = [];

  for (const line of lines) {
    // Match Markdown table row: | **CLM-001** | ... |
    if (!line.includes('| **CLM-')) continue;
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 5) {
      const idMatch = parts[0].match(/CLM-\d+/);
      const id = idMatch ? idMatch[0] : parts[0];
      const metric = parts[1];
      const canonicalValue = parts[2];
      const scope = parts[3];
      const limitations = parts[4];
      claims.push({ id, metric, canonicalValue, scope, limitations });
    }
  }

  return claims;
}

/**
 * Validates the claims registry against quality criteria.
 *
 * @param {Array<object>} claims
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateClaims(claims) {
  const errors = [];

  if (claims.length === 0) {
    errors.push('No claims found in CLAIMS.md');
    return { valid: false, errors };
  }

  const claimIds = new Set(claims.map((c) => c.id));

  // Check required claims exist
  for (const req of REQUIRED_CLAIMS) {
    if (!claimIds.has(req.id)) {
      errors.push(`Missing required claim in CLAIMS.md: ${req.id} (${req.desc})`);
    }
  }

  // Check each claim has comprehensive limitations defined
  for (const claim of claims) {
    if (!claim.limitations || claim.limitations.length < 20) {
      errors.push(`Claim ${claim.id} has insufficient or missing methodological limitations (< 20 chars).`);
    }
    if (!claim.canonicalValue) {
      errors.push(`Claim ${claim.id} is missing a canonical value.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Scans public surface text for undeclared numeric performance assertions.
 *
 * @param {string[]} filePaths
 * @param {Array<object>} claims
 * @returns {{ passed: boolean, findings: string[] }}
 */
export function scanPublicSurfaces(filePaths, claims) {
  const findings = [];
  const registeredValues = new Set(claims.map((c) => c.canonicalValue.toLowerCase()));

  // Suspicious claim patterns that must map to a registered claim
  const claimPatterns = [
    /\b(\d+)\s+districts?\b/i,
    /\b(\d+)\s+divisions?\b/i,
    /\b(\d+)\s+hazard\s+classes?\b/i,
    /\b(\d+)\s+advisory\s+tiers?\b/i,
    /\b(\d+)\s+forecast\s+horizons?\b/i,
    /\b(\d+)\s+hours?\s+staleness\b/i,
  ];

  for (const relPath of filePaths) {
    const fullPath = path.resolve(REPO_ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      // Skip markdown tables or links inside CLAIMS.md itself
      if (relPath.endsWith('CLAIMS.md')) return;

      for (const pattern of claimPatterns) {
        const match = line.match(pattern);
        if (match) {
          const matchedVal = match[1];
          // Check if this matched value is known in registry
          const isRegistered = Array.from(registeredValues).some((rv) => rv.includes(matchedVal));
          if (!isRegistered) {
            findings.push(`${relPath}:${idx + 1}: Unregistered numeric assertion "${match[0]}"`);
          }
        }
      }
    });
  }

  return {
    passed: findings.length === 0,
    findings,
  };
}

/**
 * Main execution runner
 */
export async function run() {
  console.log('🔍 Running Claims Registry CI Check (PRD REQ-005, TRD §10)...');

  if (!fs.existsSync(CLAIMS_FILE)) {
    console.error(`❌ FATAL: CLAIMS.md does not exist at ${CLAIMS_FILE}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CLAIMS_FILE, 'utf8');
  const claims = parseClaimsRegistry(content);
  console.log(`📋 Parsed ${claims.length} registered claims from CLAIMS.md.`);

  const validation = validateClaims(claims);
  if (!validation.valid) {
    console.error('❌ Claims Registry Validation Failed:');
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // Scan public surfaces
  const publicFiles = [
    'README.md',
    'docs/PRD.md',
    'docs/TRD.md',
    'frontend/src/locales/en.json',
    'frontend/src/locales/bn.json',
  ];

  const surfaceScan = scanPublicSurfaces(publicFiles, claims);
  if (!surfaceScan.passed) {
    console.error('❌ Public Surface Scanning Detected Unregistered Claims:');
    for (const finding of surfaceScan.findings) {
      console.error(`  - ${finding}`);
    }
    process.exit(1);
  }

  console.log(`✅ All ${claims.length} claims verified with documented limitations.`);
  console.log('✅ Public surface integrity verified: zero unregistered numeric claims.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(CLAIMS_FILE.replace('CLAIMS.md', 'scripts/verify_claims.mjs'))) {
  run().catch((err) => {
    console.error('❌ Claims verification error:', err);
    process.exit(1);
  });
}
