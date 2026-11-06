/** Same-origin MCP endpoint for Cloudflare's Site MCP Server WebMCP pack. */
import { handleMcpRequest } from '../backend/mcp/protocol.js';

interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleMcpRequest(context.request, context.env);
}
