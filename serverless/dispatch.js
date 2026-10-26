import { guardRequest } from '../backend/middleware/serverlessGuard.js';

export function routeSegment(req, paramName, routesTable) {
  const urlPath = (req.url || '').split('?')[0].replace(/\/+$/, '');
  const segments = urlPath.split('/').filter(Boolean);

  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1];
    if (routesTable && typeof routesTable.has === 'function') {
      if (routesTable.has(lastSeg)) return lastSeg;
    } else if (routesTable && typeof routesTable === 'object') {
      if (lastSeg in routesTable) return lastSeg;
    }
  }

  const queryVal = req.query?.[paramName];
  if (Array.isArray(queryVal)) {
    if (routesTable) {
      for (let i = queryVal.length - 1; i >= 0; i--) {
        const v = queryVal[i];
        if (typeof routesTable.has === 'function' ? routesTable.has(v) : v in routesTable) {
          return v;
        }
      }
    }
    return queryVal[queryVal.length - 1];
  }

  if (queryVal) return queryVal;

  if (segments.length > 0) {
    return segments[segments.length - 1];
  }

  return '';
}

export function stripRouteParam(req, paramName) {
  if (req.query && paramName in req.query) {
    delete req.query[paramName];
  }
  if (req.url && req.url.includes('?')) {
    const [pathPart, queryPart] = req.url.split('?');
    const regex = new RegExp(`(^|[&?])${paramName}=[^&]*`, 'g');
    let newQuery = queryPart.replace(regex, '');
    if (newQuery.startsWith('&')) newQuery = newQuery.slice(1);
    req.url = newQuery ? `${pathPart}?${newQuery}` : pathPart;
  }
}

export function createDispatcher({ param, entry, routes = {} }) {
  const table = new Map(Object.entries(routes));

  const dispatcher = async function (req, res) {
    // The dispatcher itself is guarded: an unknown path must be metered too (the probe
    // that enumerates /api/* should burn budget, not map the surface for free). Handlers
    // apply their own tighter bucket on top; this read-tier call is the floor. Statically
    // asserted by __tests__/api/serverlessGuard.test.js (every serverless/ file must
    // contain a guardRequest( call — this dispatcher's is the 404 path's only guard).
    if (guardRequest(req, res, { bucket: 'read' })) {
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    const key = routeSegment(req, param, table);

    if (!key || !table.has(key)) {
      res.setHeader('cache-control', 'no-store');
      return res.status(404).json({ error: `no endpoint "${key || 'unknown'}"` });
    }

    stripRouteParam(req, param);

    try {
      const loader = routes[key];
      const mod = await loader();
      const fn = typeof mod === 'function' ? mod : (mod.default?.default || mod.default || mod);
      if (typeof fn !== 'function') {
        throw new Error(`Handler for route "${key}" is not a function`);
      }
      return await fn(req, res);
    } catch (err) {
      if (res.headersSent) return;
      res.setHeader('cache-control', 'no-store');
      return res.status(500).json({ error: 'internal server error' });
    }
  };

  dispatcher.routes = Object.keys(routes);
  return dispatcher;
}
