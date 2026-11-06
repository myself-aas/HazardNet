/** Express adapter for the RFC 9728 §5 discovery challenge. */
import { RESOURCE_METADATA_CHALLENGE } from '../security/oauthProtectedResource.js';

/**
 * Express routes call res.status(401) before sending their body. Intercept the
 * final header write so this also covers res.sendStatus() and implicit headers.
 * A challenge already set by the route wins, including one passed to writeHead.
 * Successful/public responses keep proactive discovery in Link, not WWW-Authenticate.
 */
export function oauthResourceMetadataChallenge(_req, res, next) {
  const writeHead = res.writeHead;
  res.writeHead = function (statusCode, ...args) {
    const supplied = args.findLast((arg) => arg !== null && typeof arg === 'object');
    const hasChallenge = Array.isArray(supplied)
      ? supplied.some((value, index) => index % 2 === 0 && String(value).toLowerCase() === 'www-authenticate')
      : Boolean(supplied && Object.keys(supplied).some((name) => name.toLowerCase() === 'www-authenticate'));

    if (statusCode === 401 && !res.getHeader('WWW-Authenticate') && !hasChallenge) {
      res.setHeader('WWW-Authenticate', RESOURCE_METADATA_CHALLENGE);
    }
    return writeHead.call(this, statusCode, ...args);
  };
  next();
}
