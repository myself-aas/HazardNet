/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.hazardnet.live/"}
 */
import { registerWebMCPTools, resolveSitePath, managedBridge } from '../webmcp';
import * as webmcp from '../webmcp';

const ORIGIN = 'https://www.hazardnet.live';
const descriptor = {
  name: 'get_hazard_forecast', title: 'Get district outlook', description: 'Read published outlooks.',
  inputSchema: { type: 'object', properties: { district: { type: 'string' } }, required: ['district'] },
  annotations: { readOnlyHint: true },
};
const sitemap = `<urlset><url><loc>${ORIGIN}/alerts</loc></url><url><loc>${ORIGIN}/districts/dhaka</loc></url></urlset>`;
type RegisteredTool = typeof descriptor & { execute: (input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<{ content: Array<{ text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }> };
let registered: Array<{ tool: RegisteredTool; signal: AbortSignal }>;
let context: { registerTool: jest.Mock; getTools: jest.Mock };
let cleanup: (() => void) | undefined;
let fetchMock: jest.MockedFunction<(path: string, init: RequestInit) => Promise<unknown>>;
let navigateMock: jest.SpyInstance;

const jsonResponse = (value: unknown) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => value });
const textResponse = (value: string, type = 'application/xml') => ({ ok: true, status: 200, headers: { get: () => type }, text: async () => value });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function install() { cleanup = registerWebMCPTools(); return cleanup; }
function tool(name: string) {
  const entry = registered.find((item) => item.tool.name === name);
  if (!entry) throw new Error(`Tool was not registered: ${name}`);
  return entry.tool;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  navigateMock = jest.spyOn(webmcp.webmcpNavigation, 'navigate').mockImplementation(() => {});
  document.head.innerHTML = '';
  registered = [];
  context = {
    registerTool: jest.fn((tool, options) => { registered.push({ tool, signal: options.signal }); return Promise.resolve(); }),
    getTools: jest.fn(async () => []),
  };
  Object.defineProperty(document, 'modelContext', { configurable: true, value: context });
  Object.defineProperty(navigator, 'modelContext', { configurable: true, value: undefined });
  fetchMock = jest.fn(async (path, init) => {
    if (path === '/sitemap.xml') return textResponse(sitemap);
    if (path === '/data/content-index.json') return jsonResponse({ routes: [
      { path: '/districts/dhaka', title: 'Dhaka district hazard outlook: HazardNet' },
      { path: '/districts/chattogram', title: 'Chattogram district hazard outlook: HazardNet' },
    ] });
    const message = JSON.parse(String(init.body));
    if (message.method === 'tools/list') return jsonResponse({ jsonrpc: '2.0', id: message.id, result: { tools: [descriptor] } });
    return jsonResponse({ jsonrpc: '2.0', id: message.id, result: {
      content: [{ type: 'text', text: '{"district":"Dhaka"}' }], structuredContent: { district: 'Dhaka' }, isError: false,
    } });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  jest.restoreAllMocks();
  document.head.innerHTML = '';
});

describe('native WebMCP registration', () => {
  test('unsupported browsers do not fetch or register anything', () => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
    install();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(registered).toEqual([]);
  });
  test('discovers server descriptors and registers proxies alongside two browser tools', async () => {
    install(); await flush();
    expect(registered.map((entry) => entry.tool.name)).toEqual(['search-district', 'navigate-to-page', descriptor.name]);
    expect(fetchMock).toHaveBeenCalledWith('/mcp', expect.objectContaining({ credentials: 'same-origin' }));
    const list = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(list.method).toBe('tools/list');
    expect(tool(descriptor.name).inputSchema).toEqual(descriptor.inputSchema);
    expect(tool(descriptor.name).annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true, consequentialHint: false });
  });
  test('repeated installation is idempotent, including React strict effects', async () => {
    install(); await flush();
    const dispose = install();
    expect(dispose).toBe(cleanup);
    expect(context.registerTool).toHaveBeenCalledTimes(3);
  });
  test('executes a same-origin tools/call and passes CallToolResult through', async () => {
    install(); await flush();
    const output = await tool(descriptor.name).execute({ district: 'Dhaka' }, { signal: new AbortController().signal });
    expect(output.structuredContent).toEqual({ district: 'Dhaka' });
    const call = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(call.method).toBe('tools/call');
    expect(call.params).toEqual({ name: descriptor.name, arguments: { district: 'Dhaka' } });
    expect(fetchMock.mock.calls[1][1].credentials).toBe('same-origin');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('MCP-Protocol-Version')).toBe('2025-11-25');
  });
  test('tool errors remain errors rather than becoming empty forecasts', async () => {
    install(); await flush();
    fetchMock.mockImplementationOnce(async () => jsonResponse({ jsonrpc: '2.0', id: 2, result: {
      content: [{ type: 'text', text: 'Unavailable' }], isError: true,
    } }));
    const output = await tool(descriptor.name).execute({}, { signal: new AbortController().signal });
    expect(output.isError).toBe(true);
  });
  test('caller cancellation aborts the HTTP request', async () => {
    install(); await flush();
    const caller = new AbortController();
    fetchMock.mockImplementationOnce((_path, init) => new Promise<unknown>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = tool(descriptor.name).execute({}, { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow('Aborted');
  });
  test('pagehide unregisters tools; a bfcache pageshow installs a fresh session', async () => {
    install(); await flush();
    const oldSignal = registered[0].signal;
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(oldSignal.aborted).toBe(true);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await flush();
    expect(registered).toHaveLength(6);
    expect(registered[3].signal.aborted).toBe(false);
    cleanup?.(); cleanup = undefined;
    expect(registered[3].signal.aborted).toBe(true);
  });
  test('a late tools/list response cannot register after pagehide', async () => {
    let resolveList!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise<unknown>((resolve) => { resolveList = (value) => resolve(value); }));
    install();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    resolveList(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [descriptor] } }));
    await flush();
    expect(registered).toHaveLength(2);
  });
  test('registration rejection does not create an unhandled promise', async () => {
    context.registerTool.mockRejectedValue(new DOMException('Duplicate', 'InvalidStateError'));
    install(); await flush();
    expect(context.registerTool).toHaveBeenCalled();
  });
});

describe('Cloudflare managed bridge coexistence', () => {
  function inject(packs: string, endpoint = '/mcp') {
    const script = document.createElement('script');
    script.type = 'module'; script.src = '/.webmcp/bridge.js';
    script.dataset.packs = packs; script.dataset.mcpUrl = endpoint;
    document.head.append(script);
  }
  test('Site MCP Server pack owns the proxies; native browser tools remain available', async () => {
    inject('c2pa,mcp-server-client');
    expect(managedBridge()).toEqual({ hasSitePack: true });
    install(); await flush();
    expect(registered.map((entry) => entry.tool.name)).toEqual(['search-district', 'navigate-to-page']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test('Content Credentials only does not suppress the hazard pack', async () => {
    inject('c2pa');
    install(); await flush();
    expect(registered).toHaveLength(3);
  });
  test('a managed bridge pointing elsewhere does not suppress our own endpoint', async () => {
    inject('mcp-server-client', 'https://other.example/mcp');
    expect(managedBridge()).toEqual({ hasSitePack: false });
    install(); await flush();
    expect(registered).toHaveLength(3);
  });
  test('tools registered by a bridge that won the race are not duplicated', async () => {
    context.getTools.mockResolvedValue([{ name: descriptor.name }]);
    install(); await flush();
    expect(registered).toHaveLength(2);
  });
});

describe('browser-only actions', () => {
  test('district search returns choices without hijacking the current page', async () => {
    install(); await flush();
    const output = await tool('search-district').execute({ query: 'Chittagong' }, { signal: new AbortController().signal });
    const data = JSON.parse(output.content[0].text);
    expect(data.matches).toEqual([{ name: 'Chattogram', path: '/districts/chattogram', url: `${ORIGIN}/districts/chattogram` }]);
    expect(navigateMock).not.toHaveBeenCalled();
  });
  test.each(['https://evil.example/alerts', '//evil.example/alerts', '/\\evil.example/alerts', '/mcp', '/api/v1/alerts', '/districts/unknown', '/alerts\n'])(
    'navigation rejects %s before changing location', async (path) => {
    install(); await flush();
    await expect(tool('navigate-to-page').execute({ path }, { signal: new AbortController().signal })).rejects.toThrow();
    expect(navigateMock).not.toHaveBeenCalled();
  });
  test('navigation opens a sitemap-published page on the current origin', async () => {
    install(); await flush();
    const output = await tool('navigate-to-page').execute({ path: '/alerts' }, { signal: new AbortController().signal });
    expect(navigateMock).toHaveBeenCalledWith(`${ORIGIN}/alerts`);
    expect(JSON.parse(output.content[0].text).navigationStarted).toBe(true);
  });
  test('path validation handles dot segments and malformed sitemap safely', async () => {
    const signal = new AbortController().signal;
    await expect(resolveSitePath('/districts/../alerts', signal)).resolves.toHaveProperty('pathname', '/alerts');
    fetchMock.mockResolvedValueOnce(textResponse('<broken'));
    await expect(resolveSitePath('/alerts', signal)).rejects.toThrow('could not be read');
  });
});
