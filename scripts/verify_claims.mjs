import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseClaimsRegistry(markdownContent) {
  const claims = [];
  if (!markdownContent || typeof markdownContent !== 'string') return claims;

  const lines = markdownContent.split('\n');
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (trimmed.includes('Claim ID') && trimmed.includes('Metric')) {
      inTable = true;
      continue;
    }
    if (trimmed.includes(':---')) continue;
    if (inTable) {
      const parts = trimmed.split('|').map((p) => p.trim());
      // parts[0] is before first |, parts[1] is Claim ID, parts[2] is Metric, etc.
      if (parts.length >= 6) {
        const id = parts[1].replace(/\*\*/g, '').trim();
        const metric = parts[2].trim();
        const canonicalValue = parts[3].trim();
        const scope = parts[4].trim();
        const limitations = parts[5].trim();

        if (id.startsWith('CLM-')) {
          claims.push({
            id,
            metric,
            canonicalValue,
            scope,
            limitations,
          });
        }
      }
    }
  }

  return claims;
}

export function validateClaims(claims) {
  const errors = [];
  if (!Array.isArray(claims) || claims.length === 0) {
    return { valid: false, errors: ['No claims found in registry'] };
  }

  for (const c of claims) {
    if (!c.id) errors.push('Missing claim id');
    if (!c.metric) errors.push(`Claim ${c.id}: missing metric`);
    if (!c.canonicalValue) errors.push(`Claim ${c.id}: missing canonicalValue`);
    if (!c.limitations || c.limitations.length < 20) {
      errors.push(`Claim ${c.id}: limitations must be at least 20 characters`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function scanPublicSurfaces(filePaths = [], claims = []) {
  const root = process.cwd();
  const findings = [];

  const registeredNumbers = new Set(
    claims.flatMap((c) => {
      const nums = (c.canonicalValue || '').match(/\d+/g) || [];
      return nums;
    })
  );

  const PATTERNS = [
    /\b(\d+)\s+(districts|divisions|hazards|hazard classes|events|horizons)\b/gi,
  ];

  for (const relPath of filePaths) {
    const fullPath = path.resolve(root, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    for (const pattern of PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(content)) !== null) {
        const num = match[1];
        const phrase = match[0];
        if (!registeredNumbers.has(num)) {
          findings.push(`Unregistered claim "${phrase}" found in ${relPath}`);
        }
      }
    }
  }

  return {
    passed: findings.length === 0,
    findings,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const claimsPath = path.resolve(process.cwd(), 'CLAIMS.md');
    if (!fs.existsSync(claimsPath)) {
      console.error('[verify_claims] CLAIMS.md not found');
      process.exit(1);
    }
    const content = fs.readFileSync(claimsPath, 'utf8');
    const claims = parseClaimsRegistry(content);
    const validation = validateClaims(claims);
    if (!validation.valid) {
      console.error('[verify_claims] Claims validation errors:', validation.errors);
      process.exit(1);
    }
    console.log(`[verify_claims] Validated ${claims.length} claims in CLAIMS.md`);
  } catch (err) {
    console.error('[verify_claims] Error:', err.message);
    process.exit(1);
  }
}
