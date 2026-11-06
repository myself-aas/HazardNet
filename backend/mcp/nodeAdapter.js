/** Express adapter for the same public MCP handler used on Cloudflare Pages. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PUBLIC_ASSET_PATHS } from './tools.js';
import { handleMcpRequest, MCP_BODY_LIMIT } from './protocol.js';
import { applySecurityHeaders } from '../security/httpHeaders.js';

/** Serve only the pack's fixed public paths, preferring the actual deployment build. */
export function createNodeAssetReader(root = process.cwd()) {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (!PUBLIC_ASSET_PATHS.includes(pathname)) return new Response('Not found', { status: 404 });
      const relative = pathname.slice(1);
      const publicRoot = path.resolve(root, 'frontend/public');
      const buildRoot = path.resolve(root, 'frontend/dist');
      for (const base of [buildRoot, publicRoot]) {
        const filename = path.resolve(base, relative);
        if (!filename.startsWith(`${base}${path.sep}`)) continue;
        try {
          const bytes = await readFile(filename);
          return new Response(bytes, { headers: {
            'Content-Type': pathname.endsWith('.json') ? 'application/json' : 'text/markdown; charset=utf-8',
          } });
        } catch { /* A missing build artifact may still exist in public/. */ }
      }
      return new Response('Not found', { status: 404 });
    },
  };
}

export function nodeMcpHandler({ root = process.cwd() } = {}) {
  const assets = createNodeAssetReader(root);
  return async (req, res) => {
    const host = req.get('host') || 'localhost';
    const url = new URL(req.originalUrl, `${req.protocol}://${host}`);
    const headers = new Headers();
    for (const name of ['content-type', 'content-length', 'accept', 'origin', 'sec-fetch-site', 'mcp-protocol-version']) {
      const value = req.get(name);
      if (value) headers.set(name, value);
    }
    const controller = new AbortController();
    res.once('close', () => { if (!res.writableEnded) controller.abort(); });
    let request;
    try {
      request = new Request(url, {
        method: req.method,
        headers,
        signal: controller.signal,
        ...(req.method === 'POST' ? { body: req, duplex: 'half' } : {}),
      });
    } catch {
      res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid HTTP request.' } });
      return;
    }
    // Express has a global JSON parser for other routes. This route is mounted
    // before it, so the shared handler enforces its own smaller streaming cap.
    const response = await handleMcpRequest(request, { ASSETS: assets });
    applySecurityHeaders(response.headers);
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.setHeader('X-Accel-Buffering', 'no');
    if (response.body === null) res.end();
    else res.send(Buffer.from(await response.arrayBuffer()));
  };
}

export { MCP_BODY_LIMIT };
