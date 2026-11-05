/**
 * WebMCP: discover HazardNet's same-origin MCP tools and register browser proxies.
 *
 * Follows https://blog.cloudflare.com/webmcp/: tools/list supplies descriptors;
 * execute sends tools/call to /mcp with the visitor's same-origin session.
 * Cloudflare's managed Site MCP Server pack can replace these proxies without
 * duplicate registration. Two browser-only tools add district search and navigation.
 *
 * Unsupported browsers do no network work and retain the normal human interface.
 * This module has no import-time side effects; main.tsx owns its lifecycle.
 */
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';

interface McpDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
interface McpResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
interface ModelContextTool extends McpDescriptor {
  execute: (input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<unknown>;
}
interface ModelContextLike {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => unknown;
  getTools?: () => unknown;
}
interface ManagedBridge {
  hasSitePack: boolean;
}

const SAFETY_NOTICE =
  'HazardNet is not an official warning service. Follow BMD, FFWC and local administration. In an emergency call 999. An empty result is not an all-clear.';
let activeCleanup: (() => void) | null = null;
let requestNumber = 0;

export function getModelContext(): ModelContextLike | null {
  if (typeof document === 'undefined') return null;
  const contexts = [
    (document as Document & { modelContext?: ModelContextLike }).modelContext,
    (navigator as Navigator & { modelContext?: ModelContextLike }).modelContext,
  ];
  return contexts.find((context) => context && typeof context.registerTool === 'function') ?? null;
}

/** The edge inserts this tag before the application module executes. */
export function managedBridge(): ManagedBridge | null {
  const script = document.querySelector('script[src="/.webmcp/bridge.js"], script[src$="/.webmcp/bridge.js"]');
  if (!script) return null;
  const packs = (script.getAttribute('data-packs') || '').split(',').map((pack) => pack.trim());
  const endpoint = script.getAttribute('data-mcp-url') || '/mcp';
  let sameEndpoint = false;
  try {
    const url = new URL(endpoint, window.location.origin);
    sameEndpoint = url.origin === window.location.origin && url.pathname === '/mcp';
  } catch { /* An invalid managed endpoint is not a reason to break the page. */ }
  return { hasSitePack: packs.includes('mcp-server-client') && sameEndpoint };
}

async function jsonRequest(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', signal });
  if (!response.ok) throw new Error(`HazardNet request failed (HTTP ${response.status}).`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('HazardNet returned a non-JSON response.');
  }
  return response.json();
}

async function rpc(method: string, params: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const body = await jsonRequest('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'MCP-Protocol-Version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestNumber, method, params }),
  }, signal) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'The MCP request failed.');
  if (!body.result || typeof body.result !== 'object') throw new Error('The MCP endpoint returned no result.');
  return body.result;
}

function executionSignal(session: AbortController, caller?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, 20_000);
  session.signal.addEventListener('abort', abort, { once: true });
  caller?.addEventListener('abort', abort, { once: true });
  if (session.signal.aborted || caller?.aborted) abort();
  return { signal: controller.signal, dispose: () => {
    window.clearTimeout(timeout);
    session.signal.removeEventListener('abort', abort);
    caller?.removeEventListener('abort', abort);
  } };
}

function proxyTool(descriptor: McpDescriptor, session: AbortController): ModelContextTool {
  return {
    ...descriptor,
    // The managed pack uses MCP hints; native WebMCP has its own hint dictionary.
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    execute: async (input, options) => {
      const execution = executionSignal(session, options?.signal);
      try {
        const result = await rpc('tools/call', { name: descriptor.name, arguments: input }, execution.signal) as McpResult;
        if (!Array.isArray(result.content)) throw new Error('The MCP endpoint returned an invalid tool result.');
        // Pass CallToolResult through, including isError. Do not disguise a
        // failed read as a successful empty forecast.
        return result;
      } finally { execution.dispose(); }
    },
  };
}

/** Only URLs published in this origin's sitemap are navigation destinations. */
export async function resolveSitePath(input: string, signal: AbortSignal): Promise<URL> {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048
    || input.includes('\\') || Array.from(input).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || input.startsWith('//')) {
    throw new Error('Provide a relative HazardNet page path, not an external URL.');
  }
  const target = new URL(input.startsWith('/') ? input : `/${input}`, window.location.origin);
  if (target.origin !== window.location.origin || target.username || target.password) {
    throw new Error('Navigation is restricted to this HazardNet origin.');
  }
  const response = await fetch('/sitemap.xml', { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('The public page list is unavailable; navigation was not attempted.');
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('The public page list could not be read.');
  const normalize = (path: string) => path.replace(/\/+$/, '') || '/';
  const allowed = Array.from(xml.querySelectorAll('url > loc')).some((node) => {
    try {
      const url = new URL(node.textContent || '');
      return url.origin === target.origin && normalize(url.pathname) === normalize(target.pathname);
    } catch { return false; }
  });
  if (!allowed) throw new Error('This path is not in HazardNet’s public page list.');
  return target;
}

/** Small seam for jsdom, whose Location.assign is non-configurable. */
export const webmcpNavigation = {
  navigate(href: string): void { window.location.href = href; },
};

function browserTools(session: AbortController): ModelContextTool[] {
  return [
    {
      name: 'search-district', title: 'Search districts',
      description: 'Find Bangladesh districts by canonical name or alias. Returns up to five matches and their page paths without navigating. Use navigate-to-page to open a selected result.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 100 } }, required: ['query'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
      execute: async (input, options) => {
        if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 100) throw new Error('Provide a district name of at most 100 characters.');
        const execution = executionSignal(session, options?.signal);
        const query = input.query.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!query) throw new Error('Provide a district name in Latin script.');
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aliases: Record<string, string> = { chittagong: 'chattogram', comilla: 'cumilla', barisal: 'barishal', jessore: 'jashore', bogura: 'bogra', nawabganj: 'chapainawabganj' };
        const districtKey = aliases[normalize(input.query)] || normalize(input.query);
        const exact = ALL_64_DISTRICTS.find((place) => normalize(place.name) === districtKey);
        try {
          const index = await jsonRequest('/data/content-index.json', { headers: { Accept: 'application/json' } }, execution.signal) as {
            routes?: Array<{ path: string; title: string }>;
          };
          const matches = (index.routes || []).filter((route) => /^\/districts\/[^/]+$/.test(route.path))
            .filter((route) => exact ? route.title.startsWith(`${exact.name} district`)
              : route.path.slice('/districts/'.length).includes(query) || route.title.toLowerCase().includes(String(input.query).toLowerCase()))
            .sort((a, b) => Number(b.title.toLowerCase().startsWith(String(input.query).toLowerCase())) - Number(a.title.toLowerCase().startsWith(String(input.query).toLowerCase())))
            .slice(0, 5).map((route) => ({ name: route.title.replace(' district hazard outlook: HazardNet', ''), path: route.path, url: new URL(route.path, window.location.origin).href }));
          return { content: [{ type: 'text', text: JSON.stringify({ found: matches.length > 0, matches, disclaimer: SAFETY_NOTICE }) }], isError: false };
        } finally { execution.dispose(); }
      },
    },
    {
      name: 'navigate-to-page', title: 'Open a HazardNet page',
      description: 'Navigate this tab to a path published in HazardNet’s sitemap. External origins, API paths and unpublished paths are rejected. Call only when the visitor asks to open a page.',
      inputSchema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 2048, description: 'A relative public page path, e.g. /alerts or /districts/dhaka.' } }, required: ['path'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true, consequentialHint: false },
      execute: async (input, options) => {
        const execution = executionSignal(session, options?.signal);
        try {
          const target = await resolveSitePath(String(input.path ?? ''), execution.signal);
          execution.signal.throwIfAborted();
          webmcpNavigation.navigate(target.href);
          return { content: [{ type: 'text', text: JSON.stringify({ navigationStarted: true, url: target.href }) }], isError: false };
        } finally { execution.dispose(); }
      },
    },
  ];
}

/** Idempotent installation; the returned disposer also removes lifecycle listeners. */
export function registerWebMCPTools(): () => void {
  if (activeCleanup) return activeCleanup;
  const context = getModelContext();
  if (!context) return () => {};
  let session: AbortController | null = null;
  let disposed = false;

  const register = (tool: ModelContextTool, controller: AbortController) => {
    try {
      // Native registration is asynchronous in the current proposal. Catch
      // duplicate-name rejections so a managed bridge winning a race is harmless.
      Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => {});
    } catch { /* Experimental implementations may throw synchronously. */ }
  };
  const start = () => {
    if (disposed || session) return;
    const controller = new AbortController();
    session = controller;
    for (const tool of browserTools(controller)) register(tool, controller);
    if (managedBridge()?.hasSitePack) return;
    void (async () => {
      try {
        const result = await rpc('tools/list', {}, controller.signal) as { tools?: McpDescriptor[] };
        if (controller.signal.aborted || !Array.isArray(result.tools)) return;
        // getTools is optional in older experimental builds. It also prevents
        // duplicates when the managed tag was inserted after this module began.
        const existing = context.getTools ? await Promise.resolve(context.getTools()) : [];
        const names = new Set(Array.isArray(existing) ? existing.map((tool) => (tool as McpDescriptor).name) : []);
        for (const descriptor of result.tools) {
          if (controller.signal.aborted) break;
          if (!names.has(descriptor.name)) register(proxyTool(descriptor, controller), controller);
        }
      } catch { /* Offline or unsupported: the human page and its cached data still work. */ }
    })();
  };
  const hide = () => { session?.abort(); session = null; };
  const show = (event: PageTransitionEvent) => { if (event.persisted) start(); };
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  start();
  activeCleanup = () => {
    disposed = true;
    hide();
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    activeCleanup = null;
  };
  return activeCleanup;
}
