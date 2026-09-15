/**
 * HazardNet connector registry + per-user connector persistence.
 *
 * "Connectors" let a HazardNet account pull data from and push alerts to the
 * services farmers, NGOs and researchers already use. Connection state lives
 * in the `user_connectors` table (Supabase), so a user's dashboard is fully
 * portable across devices. Catalog metadata (name, category, accent, docs)
 * is code-owned; only per-user state is stored.
 */

import { db } from '../services/firebase';
import { collection, query, getDocs, where, doc, setDoc } from 'firebase/firestore';

export type ConnectorCategory = 'Data Sources' | 'Alerts & Messaging' | 'Productivity' | 'Developer';

export interface ConnectorDefinition {
  key: string;
  name: string;
  tagline: string;
  category: ConnectorCategory;
  /** MaterialIcon glyph name (rendered via the in-house SVG icon system). */
  icon: string;
  accent: string;
  docsUrl: string;
  /** Connectors that take an endpoint/identifier when being enabled. */
  asksFor?: { key: string; label: string; placeholder: string; type?: 'url' | 'text' | 'phone' };
  builtIn?: boolean;
}

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  'Data Sources',
  'Alerts & Messaging',
  'Productivity',
  'Developer',
];

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  {
    key: 'open_meteo',
    name: 'Open-Meteo',
    tagline: 'Deterministic 7/15-day weather forecasts feeding your district view.',
    category: 'Data Sources',
    icon: 'cloud',
    accent: '#0284c7',
    docsUrl: 'https://open-meteo.com/en/docs',
    builtIn: true,
  },
  {
    key: 'nasa_power',
    name: 'NASA POWER',
    tagline: 'Agroclimatology reanalysis for historical rainfall and temperature.',
    category: 'Data Sources',
    icon: 'satellite_alt',
    accent: '#0f766e',
    docsUrl: 'https://power.larc.nasa.gov/docs/',
  },
  {
    key: 'sentinel_hub',
    name: 'Sentinel Hub',
    tagline: 'Sentinel-1 SAR & Sentinel-2 NDVI layers for your fields.',
    category: 'Data Sources',
    icon: 'satellite',
    accent: '#1d4ed8',
    docsUrl: 'https://docs.sentinel-hub.com/',
  },
  {
    key: 'iot_gateway',
    name: 'IoT Sensor Gateway',
    tagline: 'Stream on-farm soil-moisture and weather-station readings.',
    category: 'Data Sources',
    icon: 'sensors',
    accent: '#7c3aed',
    docsUrl: 'https://github.com/myself-aas/HazardNet',
    asksFor: { key: 'endpoint', label: 'MQTT / HTTP endpoint', placeholder: 'https://sensor-gateway.example.com', type: 'url' },
  },
  {
    key: 'whatsapp_cloud',
    name: 'WhatsApp Alerts',
    tagline: 'Hazard warnings delivered to your WhatsApp.',
    category: 'Alerts & Messaging',
    icon: 'chat',
    accent: '#16a34a',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    asksFor: { key: 'phone', label: 'WhatsApp number', placeholder: '+8801XXXXXXXXX', type: 'phone' },
  },
  {
    key: 'twilio_sms',
    name: 'Twilio SMS',
    tagline: 'Text-message early warnings for feature phones.',
    category: 'Alerts & Messaging',
    icon: 'sms',
    accent: '#dc2626',
    docsUrl: 'https://www.twilio.com/docs/sms',
    asksFor: { key: 'phone', label: 'Mobile number', placeholder: '+8801XXXXXXXXX', type: 'phone' },
  },
  {
    key: 'slack',
    name: 'Slack',
    tagline: 'Post district advisories into a team channel.',
    category: 'Alerts & Messaging',
    icon: 'groups',
    accent: '#4A154B',
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    asksFor: { key: 'endpoint', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/services/…', type: 'url' },
  },
  {
    key: 'discord',
    name: 'Discord',
    tagline: 'Community server alerts via webhook.',
    category: 'Alerts & Messaging',
    icon: 'forum',
    accent: '#5865F2',
    docsUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
    asksFor: { key: 'endpoint', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…', type: 'url' },
  },
  {
    key: 'email_digest',
    name: 'Email Digest',
    tagline: 'Weekly plain-language hazard summary for your district.',
    category: 'Alerts & Messaging',
    icon: 'mail',
    accent: '#d97706',
    docsUrl: 'https://hazardnet.live/docs',
    builtIn: true,
  },
  {
    key: 'google_sheets',
    name: 'Google Sheets',
    tagline: 'Mirror forecasts and assessments into a spreadsheet.',
    category: 'Productivity',
    icon: 'table_chart',
    accent: '#0f9d58',
    docsUrl: 'https://developers.google.com/sheets',
    asksFor: { key: 'endpoint', label: 'Sheet ID', placeholder: '1AbC…sheet-id', type: 'text' },
  },
  {
    key: 'zapier',
    name: 'Zapier',
    tagline: 'Automate 6,000+ apps from HazardNet events.',
    category: 'Productivity',
    icon: 'bolt',
    accent: '#ff4f00',
    docsUrl: 'https://zapier.com/developer/platform/',
    asksFor: { key: 'endpoint', label: 'Zapier webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/…', type: 'url' },
  },
  {
    key: 'webhook',
    name: 'Custom Webhook',
    tagline: 'POST hazard alerts to any HTTP endpoint you control.',
    category: 'Developer',
    icon: 'api',
    accent: '#334155',
    docsUrl: 'https://github.com/myself-aas/HazardNet',
    asksFor: { key: 'endpoint', label: 'Endpoint URL', placeholder: 'https://your-service.example.com/hooks/hazardnet', type: 'url' },
  },
];

export const CONNECTOR_KEYS = CONNECTOR_CATALOG.map((connector) => connector.key);

export function getConnector(key: string): ConnectorDefinition | undefined {
  return CONNECTOR_CATALOG.find((connector) => connector.key === key);
}

export interface UserConnectorState {
  connectorKey: string;
  status: 'connected' | 'disconnected';
  config: Record<string, string>;
  connectedAt: string | null;
}

/** Load the signed-in user's connector rows. */
export async function fetchUserConnectors(userId: string): Promise<UserConnectorState[]> {
  if (!userId) return [];
  try {
    const q = query(collection(db, 'user_connectors'), where('user_id', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const row = d.data();
      return {
        connectorKey: String(row.connector_key ?? row.provider ?? ''),
        status: row.status === 'disconnected' ? 'disconnected' : 'connected',
        config: (row.config as Record<string, string>) ?? (row.auth_data as Record<string, string>) ?? {},
        connectedAt: (row.connected_at as string) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** Enable/disable a connector for a user (upserts the state row in Firestore). */
export async function saveUserConnector(
  userId: string,
  connectorKey: string,
  status: 'connected' | 'disconnected',
  config: Record<string, string> = {},
): Promise<void> {
  if (!userId) return;
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'user_connectors', `${userId}_${connectorKey}`),
    {
      user_id: userId,
      connector_key: connectorKey,
      status,
      config,
      connected_at: status === 'connected' ? now : null,
      disconnected_at: status === 'disconnected' ? now : null,
      updated_at: now,
    },
    { merge: true },
  );
}
