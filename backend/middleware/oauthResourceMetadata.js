/** Express adapter for the RFC 9728 §5 discovery challenge. */
import { resourceMetadataChallengeFor, resourceOriginFor } from '../security/oauthProtectedResource.js';

/**
 * Express routes call res.status(401) before sending their body. Intercept the
 * final header write so this also covers res.sendStatus() and implicit headers.
 * A challenge already set by the route wins, including one passed to writeHead.
 * Successful/public responses keep proactive discovery in Link, not WWW-Authenticate.
 */
export function oauthResourceMetadataChallenge(req, res, next) {
  const challenge = resourceMetadataChallengeFor(resourceOriginFor(`${req.protocol}://${req.get('host')}`));
  const writeHead = res.writeHead;
  res.writeHead = function (statusCode, ...args) {
    const supplied = args.findLast((arg) => arg !== null && typeof arg === 'object');
    const hasChallenge = Array.isArray(supplied)
      ? supplied.some((value, index) => index % 2 === 0 && String(value).toLowerCase() === 'www-authenticate')
      : Boolean(supplied && Object.keys(supplied).some((name) => name.toLowerCase() === 'www-authenticate'));

    if (statusCode === 401 && !res.getHeader('WWW-Authenticate') && !hasChallenge) {
      res.setHeader('WWW-Authenticate', challenge);
    }
    return writeHead.call(this, statusCode, ...args);
  };
  next();
}
