/** RFC 9728 metadata served by the Cloudflare Pages Workers runtime. */
import { protectedResourceMetadataResponse } from '../../backend/security/oauthProtectedResource.js';

interface PagesContext {
  request: Request;
}

export function onRequest(context: PagesContext): Response {
  // Pass the request URL: RFC 9728 §3.2 requires `resource` to match the identifier the
  // client used, and both the apex and www hostnames serve this path.
  return protectedResourceMetadataResponse(context.request.method, context.request.url);
}
