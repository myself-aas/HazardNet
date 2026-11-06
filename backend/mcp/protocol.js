/**
 * Stateless MCP Streamable HTTP transport, shared by Pages and Express.
 * Implements the initialization-based 2025 revisions used by Cloudflare's
 * Site MCP Server bridge. JSON responses are used; no server-initiated SSE,
 * durable session, credentials or write capability is advertised.
 */
import {
  MCP_SERVER_INFO, MCP_INSTRUCTIONS, MCP_TOOL_DESCRIPTORS, executeMcpTool,
} from './tools.js';

export const MCP_PATH = '/mcp';
export const MCP_PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26']);
export const MCP_BODY_LIMIT = 16 * 1024;
const JSON_TYPE = 'application/json; charset=utf-8';
const RPC_ERROR = {
  parse: -32700, invalidRequest: -32600, method: -32601, invalidParams: -32602, internal: -32603,
};
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (id) => typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id));
const hasId = (message) => Object.hasOwn(message, 'id');

function response(body, status = 200, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': JSON_TYPE,
      'Cache-Control': 'no-store',
      'Allow': 'POST, OPTIONS',
      ...extra,
    },
  });
}

/** Read at most the cap, including chunked requests with no Content-Length. */
export async function readMcpBody(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MCP_BODY_LIMIT)) {
    return { error: 'too-large' };
  }
  if (!request.body) return { text: '' };
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MCP_BODY_LIMIT) {
        await reader.cancel();
        return { error: 'too-large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text };
  } catch {
    return { error: 'unreadable' };
  } finally {
    reader.releaseLock();
  }
}

function acceptsJson(request) {
  const accept = request.headers.get('accept');
  if (!accept) return true;
  return accept.split(',').some((entry) => {
    const [type, ...params] = entry.trim().toLowerCase().split(';');
    const q = params.find((part) => part.trim().startsWith('q='));
    const quality = q ? Number(q.trim().slice(2)) : 1;
    return (type === 'application/json' || type === 'application/*' || type === '*/*') && quality > 0;
  });
}

/** Reject browser cross-origin calls even though the reads are public. */
export function isSameOriginMcpRequest(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;
  if (!origin) return true; // Non-browser MCP clients need not send Origin.
  return origin === new URL(request.url).origin;
}

export async function handleMcpRequest(request, env = {}) {
  if (request.method === 'OPTIONS') return response(null, 204);
  if (request.method !== 'POST') return response(rpcError(null, RPC_ERROR.invalidRequest, 'MCP requires HTTP POST.'), 405);
  if (!isSameOriginMcpRequest(request)) return response(rpcError(null, RPC_ERROR.invalidRequest, 'Cross-origin MCP requests are not allowed.'), 403);
  if (!acceptsJson(request)) return response(rpcError(null, RPC_ERROR.invalidRequest, 'This stateless endpoint returns application/json.'), 406);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return response(rpcError(null, RPC_ERROR.invalidRequest, 'Content-Type must be application/json.'), 415);
  }
  const versionHeader = request.headers.get('mcp-protocol-version');
  if (versionHeader && !MCP_PROTOCOL_VERSIONS.includes(versionHeader)) {
    return response(rpcError(null, RPC_ERROR.invalidRequest, 'Unsupported MCP protocol version.'), 400);
  }
  const body = await readMcpBody(request);
  if (body.error) return response(rpcError(null, RPC_ERROR.invalidRequest,
    body.error === 'too-large' ? 'MCP request exceeds the 16 KiB limit.' : 'MCP request body could not be read.'),
  body.error === 'too-large' ? 413 : 400);
  let message;
  try { message = JSON.parse(body.text); }
  catch { return response(rpcError(null, RPC_ERROR.parse, 'Invalid JSON.'), 400); }
  // JSON-RPC batching was removed in 2025-06-18. Do not accept an array and
  // silently execute only its first item.
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string'
    || !message.method || (hasId(message) && !validId(message.id))
    || (message.params !== undefined && !isObject(message.params))) {
    return response(rpcError(isObject(message) && validId(message.id) ? message.id : null,
      RPC_ERROR.invalidRequest, 'Invalid JSON-RPC 2.0 request.'), 400);
  }
  if (!hasId(message)) {
    // Notifications never receive a JSON-RPC response. This endpoint has no
    // server-initiated work to cancel; cancellation is the HTTP abort signal.
    return response(null, 202);
  }
  const { id, method, params = {} } = message;
  // The blog's bridge calls tools/list and tools/call directly, without an
  // initialize handshake or version header. These stateless operations have
  // the same shape in all three supported revisions; initialize negotiates a
  // version explicitly for clients that use the full lifecycle.
  try {
    if (method === 'initialize') {
      if (typeof params.protocolVersion !== 'string' || !isObject(params.capabilities) || !isObject(params.clientInfo)
        || typeof params.clientInfo.name !== 'string' || !params.clientInfo.name
        || typeof params.clientInfo.version !== 'string' || !params.clientInfo.version) {
        return response(rpcError(id, RPC_ERROR.invalidParams, 'initialize requires protocolVersion, capabilities and clientInfo.'), 200);
      }
      return response({ jsonrpc: '2.0', id, result: {
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
      } });
    }
    if (method === 'ping') return response({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') {
      if (params.cursor !== undefined) return response(rpcError(id, RPC_ERROR.invalidParams, 'This tool list fits one page; cursors are not supported.'));
      return response({ jsonrpc: '2.0', id, result: { tools: MCP_TOOL_DESCRIPTORS } });
    }
    if (method === 'tools/call') {
      if (typeof params.name !== 'string' || (params.arguments !== undefined && !isObject(params.arguments))) {
        return response(rpcError(id, RPC_ERROR.invalidParams, 'tools/call requires a string name and an object arguments value.'));
      }
      const result = await executeMcpTool(params.name, params.arguments, env, request);
      if (result.invalidParams) return response(rpcError(id, RPC_ERROR.invalidParams, result.message));
      return response({ jsonrpc: '2.0', id, result });
    }
    return response(rpcError(id, RPC_ERROR.method, `Method not found: ${method.slice(0, 128)}`));
  } catch {
    return response(rpcError(id, RPC_ERROR.internal, 'The MCP request could not be completed.'), 500);
  }
}
