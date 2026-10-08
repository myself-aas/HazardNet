#!/usr/bin/env node
/**
 * Publish DNS for AI Discovery (DNS-AID) records to Cloudflare.
 *
 * Creates HTTPS/SVCB records under the _agents namespace of hazardnet.live
 * so AI agents can discover agent endpoints through DNS.
 *
 * USAGE:
 *   CLOUDFLARE_API_TOKEN=your-token CLOUDFLARE_ZONE_ID=your-zone-id node scripts/publish-dns-aid.mjs
 *   CLOUDFLARE_API_TOKEN=your-token CLOUDFLARE_ZONE_ID=your-zone-id node scripts/publish-dns-aid.mjs --dry-run
 *   CLOUDFLARE_API_TOKEN=your-token CLOUDFLARE_ZONE_ID=your-zone-id node scripts/publish-dns-aid.mjs --delete
 *
 * ENVIRONMENT:
 *   CLOUDFLARE_API_TOKEN  — Cloudflare API token with Zone:DNS:Edit permissions
 *   CLOUDFLARE_ZONE_ID    — Zone ID for hazardnet.live (find in Cloudflare dashboard)
 *
 * Reference: https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md
 */

import { existsSync } from 'node:fs';

const ZONE = 'hazardnet.live';
const TARGET = 'www.hazardnet.live';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

// ──────────────────────────────────────────────────────────────────────────
// DNS-AID record definitions
// ──────────────────────────────────────────────────────────────────────────

const RECORDS = [
  {
    name: `_index._agents.${ZONE}`,
    comment: 'DNS-AID: Master agent discovery index',
    alpn: 'https',
  },
  {
    name: `_a2a._agents.${ZONE}`,
    comment: 'DNS-AID: A2A Agent-to-Agent protocol endpoint',
    alpn: 'a2a',
  },
  {
    name: `_mcp._agents.${ZONE}`,
    comment: 'DNS-AID: MCP Model Context Protocol endpoint',
    alpn: 'mcp',
  },
  {
    name: `_api._agents.${ZONE}`,
    comment: 'DNS-AID: REST API endpoint (RFC 9727)',
    alpn: 'https',
  },
  {
    name: `_webmcp._agents.${ZONE}`,
    comment: 'DNS-AID: WebMCP browser-based tool endpoint',
    alpn: 'webmcp',
  },
];

// ──────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ──────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteMode = args.includes('--delete');

if (dryRun) {
  console.log('[dns-aid] DRY RUN — no changes will be made\n');
}

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;

if (!apiToken) {
  console.error('Error: CLOUDFLARE_API_TOKEN environment variable is required.');
  console.error('Create a token at https://dash.cloudflare.com/profile/api-tokens');
  console.error('Required permission: Zone → DNS → Edit');
  process.exit(1);
}

if (!zoneId) {
  console.error('Error: CLOUDFLARE_ZONE_ID environment variable is required.');
  console.error(`Find the zone ID for ${ZONE} in the Cloudflare dashboard overview page.`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────
// Cloudflare API helpers
// ──────────────────────────────────────────────────────────────────────────

async function cfRequest(method, path, body) {
  const url = `${CLOUDFLARE_API}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const json = await res.json();

  if (!json.success) {
    const errors = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`Cloudflare API error (${res.status}): ${errors}`);
  }

  return json.result;
}

/** List existing DNS records matching a name pattern. */
async function listRecords(namePrefix) {
  return cfRequest('GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(namePrefix)}&per_page=100`);
}

/** Create an HTTPS (SVCB) record. */
async function createHttpsRecord(record) {
  // Cloudflare HTTPS record format:
  // priority target alpn="..." port=443 mandatory=alpn,port
  const svcPriority = 1;
  const svcTarget = TARGET;
  const data = {
    type: 'HTTPS',
    name: record.name,
    content: `${svcPriority} ${svcTarget}. alpn="${record.alpn}" port=443 mandatory=alpn,port`,
    ttl: 3600,
    proxied: false, // DNS-AID records must NOT be proxied (need raw DNS response)
    comment: record.comment,
  };
  return cfRequest('POST', `/zones/${zoneId}/dns_records`, data);
}

/** Delete a DNS record by ID. */
async function deleteRecord(id) {
  return cfRequest('DELETE', `/zones/${zoneId}/dns_records/${id}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[dns-aid] Publishing DNS-AID records for ${ZONE}`);
  console.log(`[dns-aid] Target: ${TARGET}`);
  console.log(`[dns-aid] Records: ${RECORDS.length}\n`);

  // Check for existing records
  const existing = await listRecords(`_agents.${ZONE}`);
  const existingByName = new Map(existing.map((r) => [r.name, r]));

  if (deleteMode) {
    // ── Delete mode ──
    console.log('[dns-aid] DELETE MODE — removing all _agents DNS-AID records\n');
    for (const record of RECORDS) {
      const match = existingByName.get(record.name);
      if (!match) {
        console.log(`  - ${record.name}: not found, skipping`);
        continue;
      }
      if (dryRun) {
        console.log(`  - ${record.name}: would delete (id: ${match.id})`);
      } else {
        await deleteRecord(match.id);
        console.log(`  ✓ ${record.name}: deleted`);
      }
    }
    return;
  }

  // ── Create/update mode ──
  for (const record of RECORDS) {
    const match = existingByName.get(record.name);

    if (match) {
      console.log(`  ~ ${record.name}: already exists (id: ${match.id}), skipping`);
      continue;
    }

    if (dryRun) {
      console.log(`  + ${record.name}: would create HTTPS record → ${TARGET} alpn="${record.alpn}"`);
    } else {
      const result = await createHttpsRecord(record);
      console.log(`  ✓ ${record.name}: created (id: ${result.id})`);
    }
  }

  // ── Summary ──
  console.log('\n[dns-aid] Done. Verify with:');
  console.log('  dig +short _a2a._agents.hazardnet.live HTTPS');
  console.log('  dig +short _mcp._agents.hazardnet.live HTTPS');
  console.log('  dig +short _index._agents.hazardnet.live HTTPS');
  console.log('\n  Or via DNS-over-HTTPS:');
  console.log(`  curl "https://cloudflare-dns.com/dns-query?name=_a2a._agents.${ZONE}&type=HTTPS" -H "Accept: application/dns-json"`);

  if (!dryRun) {
    console.log('\n[dns-aid] Note: DNS propagation may take up to 5 minutes.');
    console.log('[dns-aid] Ensure DNSSEC is enabled for the zone so validating resolvers return authenticated data.');
  }
}

main().catch((err) => {
  console.error(`\n[dns-aid] Error: ${err.message}`);
  process.exit(1);
});
