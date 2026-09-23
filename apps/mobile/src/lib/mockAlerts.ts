/**
 * Mock alert fixtures for Phase 3.
 *
 * These are Zod-compliant AlertItem shapes per @hazardnet/core AlertItemSchema.
 * Supplemental display fields (headline, summary, instructions, sources, etc.)
 * are kept in a parallel lookup (MOCK_ALERT_EXTRAS) — the core schema only
 * carries the minimum fields needed for severity/district/date computation;
 * the UI layer can extend with richer content once the backend ships it.
 */

import { AlertItemType } from '@hazardnet/core';

const NOW = Date.parse('2026-09-24T08:00:00Z');
const iso = (offsetHours: number) => new Date(NOW + offsetHours * 60 * 60 * 1000).toISOString();

export interface AlertExtras {
  headline: string;
  summary: string;
  instructions: string[];
  sources: { name: string; url?: string; phone?: string }[];
  affectedUpazilas?: string[];
  dutyOfficer?: string | null;
}

/** Core alert rows (Schema-compliant). */
export const MOCK_ALERT_ROWS: AlertItemType[] = [
  {
    id: 'a-kurigram-flashflood-2026-09-24',
    district_name: 'Kurigram',
    hazard_type: 'Flash Flood',
    level: 'SEVERE',
    severity_score: 0.82,
    confidence: 0.78,
    prediction_date: iso(-0.75),
    target_date: iso(6),
    horizon: '6h',
    published_at: iso(-0.75),
    reviewed_by: 'F. Ahmed (duty hydrologist)',
    state: 'active',
  },
  {
    id: 'a-coxsbazar-cyclone-2026-09-24',
    district_name: "Cox's Bazar",
    hazard_type: 'Tropical Cyclone',
    level: 'WARNING',
    severity_score: 0.68,
    confidence: 0.72,
    prediction_date: iso(-2),
    target_date: iso(18),
    horizon: '24h',
    published_at: iso(-2),
    state: 'active',
  },
  {
    id: 'a-dhaka-heat-2026-09-24',
    district_name: 'Dhaka',
    hazard_type: 'Heat Wave',
    level: 'WATCH',
    severity_score: 0.46,
    confidence: 0.82,
    prediction_date: iso(-5),
    target_date: iso(12),
    horizon: '12h',
    published_at: iso(-5),
    state: 'active',
  },
  {
    id: 'a-rajshahi-drought-2026-09-24',
    district_name: 'Rajshahi',
    hazard_type: 'Drought',
    level: 'WATCH',
    severity_score: 0.42,
    confidence: 0.65,
    prediction_date: iso(-24),
    target_date: iso(72),
    horizon: '72h',
    published_at: iso(-24),
    state: 'active',
  },
];

/** Supplemental display content keyed by alert id. */
export const MOCK_ALERT_EXTRAS: Record<string, AlertExtras> = {
  'a-kurigram-flashflood-2026-09-24': {
    headline: 'Flash flooding expected in Kurigram within 6 hours',
    summary:
      'Heavy upstream rainfall combined with high Brahmaputra discharge is projected to cause flash flooding in low-lying char areas of Kurigram and adjacent upazilas beginning this afternoon.',
    instructions: [
      'Move people and livestock to higher ground or designated flood shelters immediately.',
      'Do NOT cross flooded roads or bridges by foot or vehicle.',
      'Keep emergency kits, drinking water, and documents in waterproof bags.',
      'Monitor FFWC and BMD bulletins through local authorities.',
    ],
    sources: [
      { name: 'FFWC', url: 'https://ffwc.gov.bd' },
      { name: 'BMD', url: 'https://bmd.gov.bd' },
      { name: 'Emergency — 999', phone: '999' },
    ],
    affectedUpazilas: ['Ulipur', 'Chilmari', 'Rajarhat', 'Kurigram Sadar'],
    dutyOfficer: 'Reviewed by F. Ahmed (duty hydrologist)',
  },
  'a-coxsbazar-cyclone-2026-09-24': {
    headline: 'Cyclonic storm approaching Cox\u2019s Bazar coast',
    summary:
      'A depression over the Bay of Bengal is forecast to intensify into a cyclonic storm and cross the coast near Cox\u2019s Bazar within 18\u201324 hours. Wind speeds 80\u2013100 km/h; storm surge 1.5\u20132m.',
    instructions: [
      'Fishermen must NOT venture into the deep sea.',
      'Tourists on Saint Martin\u2019s and Teknaf should move inland.',
      'Prepare for power outages; charge phones and emergency lights.',
      'Listen to BMD cyclone bulletins every 3 hours.',
    ],
    sources: [
      { name: 'BMD', url: 'https://bmd.gov.bd' },
      { name: 'Emergency — 999', phone: '999' },
    ],
    affectedUpazilas: ['Teknaf', 'Ukhiya', 'Maheshkhali'],
    dutyOfficer: null,
  },
  'a-dhaka-heat-2026-09-24': {
    headline: 'Mild heat wave over Dhaka tomorrow',
    summary:
      'Maximum temperatures 36\u201338°C with moderate humidity. Outdoor workers and sensitive groups may experience heat stress; no immediate danger for the general public.',
    instructions: [
      'Stay hydrated; avoid midday outdoor exertion.',
      'Wear loose, light-coloured clothing.',
      'Check on elderly neighbours and outdoor workers.',
    ],
    sources: [{ name: 'BMD', url: 'https://bmd.gov.bd' }],
    affectedUpazilas: ['Dhaka North', 'Dhaka South', 'Keraniganj'],
    dutyOfficer: null,
  },
  'a-rajshahi-drought-2026-09-24': {
    headline: 'Agricultural drought watch for western Rajshahi',
    summary: '30-day rainfall deficit in Barind tracts; irrigation demand elevated. No immediate drinking-water risk.',
    instructions: [
      'Prioritize irrigation for aman rice.',
      'Monitor groundwater levels; report tubewell failures to the local agriculture office.',
    ],
    sources: [{ name: 'BMD', url: 'https://bmd.gov.bd' }, { name: 'DAM', url: 'https://dam.gov.bd' }],
    affectedUpazilas: ['Godagari', 'Tanore', 'Bagmara'],
    dutyOfficer: null,
  },
};

export function getExtrasFor(id: string): AlertExtras | null {
  return MOCK_ALERT_EXTRAS[id] ?? null;
}

/** Simulate a brief fetch latency for the mock data source. */
export async function fetchMockAlerts(delayMs = 400): Promise<AlertItemType[]> {
  await new Promise((r) => setTimeout(r, delayMs));
  return [...MOCK_ALERT_ROWS];
}

export function getMockAlertById(id: string) {
  return MOCK_ALERT_ROWS.find((a) => a.id === id) ?? null;
}

/** Highest-severity alert from a list, or null when all clear. */
export function highestAlert(alerts: AlertItemType[]) {
  if (!alerts.length) return null;
  const rank: Record<AlertItemType['level'], number> = { SEVERE: 3, WARNING: 2, WATCH: 1, NO_ALERT: 0 };
  return [...alerts].sort((a, b) => rank[b.level] - rank[a.level])[0]!;
}

/** Alias kept for readability in tests/screens; MOCK_ALERT_ROWS is the canonical export. */
export { MOCK_ALERT_ROWS as MOCK_ALERTS };
