/**
 * Markdown Content Negotiation middleware.
 *
 * Implements "Markdown for Agents" (https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/):
 * when a request includes `Accept: text/markdown`, the middleware serves a
 * clean, formatting-stripped Markdown representation of the page instead of HTML.
 *
 * The markdown files are pre-generated at build time by `scripts/build_markdown.mjs`
 * and served from `frontend/dist/markdown/`.
 *
 * Response headers follow the spec:
 *   - Content-Type: text/markdown; charset=utf-8
 *   - Vary: Accept (so caches store separate variants for Markdown and HTML)
 *   - x-markdown-tokens: estimated token count of the Markdown document
 */

import path from 'node:path';
import fs from 'node:fs';

const __dirname = process.cwd();
const MARKDOWN_DIR = path.resolve(__dirname, 'frontend', 'dist', 'markdown');

/**
 * Check if the request accepts text/markdown.
 * Returns true if the Accept header includes text/markdown with higher priority than text/html.
 */
function acceptsMarkdown(req) {
  const accept = req.headers?.accept;
  if (!accept) return false;

  // Quick check: does the header mention text/markdown at all?
  if (!accept.includes('text/markdown')) return false;

  // Parse the Accept header to check priority
  const types = accept.split(',').map((part) => {
    const [type, ...params] = part.trim().split(';');
    const q = params.find((p) => p.trim().startsWith('q='));
    return {
      type: type.trim(),
      quality: q ? parseFloat(q.split('=')[1]) : 1.0,
    };
  });

  const markdownEntry = types.find((t) => t.type === 'text/markdown');
  const htmlEntry = types.find((t) => t.type === 'text/html' || t.type === '*/*');

  if (!markdownEntry) return false;
  if (!htmlEntry) return true;

  return markdownEntry.quality >= htmlEntry.quality;
}

/**
 * Resolve a request path to a markdown file path.
 * Handles both clean URLs (/about) and explicit paths (/about/).
 */
function resolveMarkdownPath(reqPath) {
  // Normalize the path: remove query string, decode, strip trailing slash
  let clean = decodeURIComponent(reqPath.split('?')[0]).replace(/\/+$/, '') || 'index';

  // Security: prevent path traversal
  clean = clean.replace(/\.\./g, '').replace(/\/\//g, '/');

  // Remove leading slash for file resolution
  const relative = clean.replace(/^\/+/, '');
  const filePath = path.join(MARKDOWN_DIR, `${relative}.md`);

  // Ensure the resolved path is within the markdown directory
  const resolved = path.resolve(filePath);
  const dir = path.resolve(MARKDOWN_DIR);
  if (!resolved.startsWith(dir)) {
    return null;
  }

  return resolved;
}

/**
 * Estimate token count from text.
 * Rough heuristic: ~4 characters per token for English text.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Express middleware for Markdown content negotiation.
 *
 * Usage:
 *   app.use(markdownNegotiation());
 *
 * Place this BEFORE the static file serving and SPA fallback, but AFTER
 * API routes (which should not be affected by markdown negotiation).
 */
export function markdownNegotiation() {
  // Cache for markdown file contents (avoids repeated disk reads)
  const cache = new Map();
  const CACHE_MAX_SIZE = 200;

  return (req, res, next) => {
    // Only handle GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Skip API routes, health checks, metrics, and model files
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/v1') ||
      req.path === '/health' ||
      req.path === '/metrics' ||
      /\.(tflite|onnx|bin|h5|keras|pt|pth|json|xml|txt|svg|png|jpg|jpeg|gif|ico|woff2?|ttf|eot|css|js|map)$/i.test(req.path)
    ) {
      return next();
    }

    // Check if the client accepts markdown
    if (!acceptsMarkdown(req)) {
      return next();
    }

    // Resolve the markdown file path
    const mdPath = resolveMarkdownPath(req.path);
    if (!mdPath) {
      return next();
    }

    // Try to serve the markdown file
    let content = cache.get(mdPath);

    if (content === undefined) {
      try {
        if (fs.existsSync(mdPath)) {
          content = fs.readFileSync(mdPath, 'utf8');

          // Simple LRU-style eviction
          if (cache.size >= CACHE_MAX_SIZE) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
          }
          cache.set(mdPath, content);
        } else {
          // Mark as not found (cache the negative result too, to avoid repeated stat calls)
          cache.set(mdPath, null);
          return next();
        }
      } catch (err) {
        console.warn(`[markdown-negotiation] error reading ${mdPath}: ${err.message}`);
        return next();
      }
    }

    if (content === null) {
      return next();
    }

    // Set response headers per the Markdown for Agents spec
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');

    // Vary: Accept ensures caches store separate HTML and Markdown variants
    const existingVary = res.getHeader('Vary');
    if (existingVary) {
      const varyParts = String(existingVary).split(',').map((v) => v.trim());
      if (!varyParts.includes('Accept')) {
        varyParts.push('Accept');
        res.setHeader('Vary', varyParts.join(', '));
      }
    } else {
      res.setHeader('Vary', 'Accept');
    }

    // Token count header (spec recommends this)
    res.setHeader('x-markdown-tokens', String(estimateTokens(content)));

    // Cache control: markdown is generated at build time, safe to cache
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Send the markdown content
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
      return res.end();
    }

    res.end(content);
  };
}

export default markdownNegotiation;
