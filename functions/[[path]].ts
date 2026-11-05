/**
 * Markdown for Agents at the Cloudflare Pages edge.
 *
 * Document requests normally fall through to the prerendered HTML asset. When
 * a client explicitly prefers text/markdown, fetch the matching build artifact
 * from `/markdown/` and return it as the negotiated representation.
 */

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
  env?: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
}

function markdownQuality(accept: string): number {
  for (const part of accept.split(',')) {
    const [mediaType, ...params] = part.trim().split(';');
    if (mediaType.trim().toLowerCase() !== 'text/markdown') continue;
    const q = params.find((param) => param.trim().startsWith('q='));
    const quality = q ? Number.parseFloat(q.split('=')[1]) : 1;
    return Number.isFinite(quality) ? quality : 0;
  }
  return 0;
}

function htmlQuality(accept: string): number {
  for (const part of accept.split(',')) {
    const [mediaType, ...params] = part.trim().split(';');
    const type = mediaType.trim().toLowerCase();
    if (type !== 'text/html' && type !== '*/*') continue;
    const q = params.find((param) => param.trim().startsWith('q='));
    const quality = q ? Number.parseFloat(q.split('=')[1]) : 1;
    return Number.isFinite(quality) ? quality : 0;
  }
  return 0;
}

function acceptsMarkdown(request: Request): boolean {
  const accept = request.headers.get('Accept');
  if (!accept) return false;
  const markdown = markdownQuality(accept);
  return markdown > 0 && markdown >= htmlQuality(accept);
}

function markdownUrl(request: Request): URL {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/index';
  return new URL(`/markdown${pathname}.md`, url.origin);
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (!acceptsMarkdown(context.request) || context.request.method !== 'GET') {
    return context.next();
  }

  const assets = context.env?.ASSETS;
  if (!assets) return context.next();

  const markdownResponse = await assets.fetch(
    new Request(markdownUrl(context.request), { method: 'GET' })
  );
  if (!markdownResponse.ok) return context.next();

  const body = await markdownResponse.text();
  const headers = new Headers(markdownResponse.headers);
  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  headers.set('Vary', 'Accept');
  headers.set('x-markdown-tokens', String(Math.ceil(body.length / 4)));
  // Do not let an edge cache reuse an HTML or Markdown response for the other
  // Accept variant. The zone has no Cache Rule with Vary: Accept configured.
  headers.set('Cache-Control', 'no-store');

  return new Response(body, {
    status: 200,
    headers,
  });
}
