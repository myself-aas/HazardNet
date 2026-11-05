#!/usr/bin/env node

/**
 * Publish HazardNet's DNS-AID HTTPS records through the Cloudflare DNS API.
 *
 * Required environment:
 *   CLOUDFLARE_API_TOKEN — Zone:DNS:Edit (and Zone:Zone:Read)
 *   CLOUDFLARE_ZONE_ID   — zone identifier for hazardnet.live
 *
 * DNSSEC is checked on every publish. Use --enable-dnssec once when the zone
 * is not yet signed; Cloudflare returns the DS record for registrar setup.
 */

import { fileURLToPath } from 'node:url';

const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const ZONE_NAME = 'hazardnet.live';
const AGENT_ORIGIN = 'www.hazardnet.live.';

export const DNS_AID_RECORDS = [
  { name: '_index._agents', alpn: 'https' },
  { name: '_a2a._agents', alpn: 'a2a' },
  { name: '_mcp._agents', alpn: 'mcp' },
  { name: '_api._agents', alpn: 'https' },
  { name: '_webmcp._agents', alpn: 'webmcp' },
].map(({ name, alpn }) => ({
  name: `${name}.${ZONE_NAME}`,
  type: 'HTTPS',
  ttl: 3600,
  proxied: false,
  content: `1 ${AGENT_ORIGIN} alpn="${alpn}" port=443 mandatory="alpn,port"`,
}));

function usage() {
  console.log(`Usage: node scripts/publish-dns-aid.mjs [--dry-run] [--delete] [--enable-dnssec]

Publishes HTTPS records under _agents.${ZONE_NAME}. DNSSEC is verified by default.
`);
}

function request(path, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');
  return fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      throw new Error(`Cloudflare API ${response.status}: ${JSON.stringify(body.errors || body)}`);
    }
    return body.result;
  });
}

async function getZoneId() {
  if (process.env.CLOUDFLARE_ZONE_ID) return process.env.CLOUDFLARE_ZONE_ID;
  const zones = await request(`/zones?name=${ZONE_NAME}&status=active`);
  if (zones.length !== 1) throw new Error(`Expected one active ${ZONE_NAME} zone, found ${zones.length}`);
  return zones[0].id;
}

async function checkDnssec(zoneId, enable) {
  let state = await request(`/zones/${zoneId}/dnssec`);
  if (state.status === 'active') return state;
  if (!enable) {
    throw new Error(`DNSSEC is ${state.status}; rerun with --enable-dnssec and complete registrar DS setup`);
  }
  state = await request(`/zones/${zoneId}/dnssec`, { method: 'PUT', body: JSON.stringify({}) });
  console.log(`DNSSEC status: ${state.status}`);
  if (state.ds) console.log(`Registrar DS: ${JSON.stringify(state.ds)}`);
  return state;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) return usage();
  const dryRun = args.has('--dry-run');
  const deleting = args.has('--delete');
  if (dryRun) {
    console.log(JSON.stringify({ zone: ZONE_NAME, dnssec: args.has('--enable-dnssec'), records: deleting ? [] : DNS_AID_RECORDS }, null, 2));
    return;
  }

  const resolvedZoneId = await getZoneId();
  await checkDnssec(resolvedZoneId, args.has('--enable-dnssec'));
  const records = DNS_AID_RECORDS;

  for (const record of records) {
    const existing = await request(
      `/zones/${resolvedZoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`
    );
    if (deleting) {
      for (const item of existing) {
        await request(`/zones/${resolvedZoneId}/dns_records/${item.id}`, { method: 'DELETE' });
        console.log(`Deleted ${record.name}`);
      }
      continue;
    }
    const payload = { ...record, zone_id: resolvedZoneId };
    if (existing[0]) {
      await request(`/zones/${resolvedZoneId}/dns_records/${existing[0].id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      console.log(`Updated ${record.name}`);
    } else {
      await request(`/zones/${resolvedZoneId}/dns_records`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log(`Created ${record.name}`);
    }
  }

  if (deleting) console.log('DNS-AID records removed; DNSSEC remains enabled.');
  else console.log(`Published ${DNS_AID_RECORDS.length} DNS-AID records under _agents.${ZONE_NAME}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[dns-aid] ${error.message}`);
    process.exitCode = 1;
  });
}
