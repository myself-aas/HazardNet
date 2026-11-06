/** RFC 9728 metadata served by the Cloudflare Pages Workers runtime. */
import { protectedResourceMetadataResponse } from '../../backend/security/oauthProtectedResource.js';

interface PagesContext {
  request: Request;
}

export function onRequest(context: PagesContext): Response {
  return protectedResourceMetadataResponse(context.request.method);
}
