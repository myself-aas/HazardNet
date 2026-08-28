import crypto from 'node:crypto';

/**
 * Request-ID middleware (BE-04): assigns a unique id to every request,
 * echoes it back via X-Request-Id, and emits a structured one-line
 * request log. Gives support/ops a correlation key across
 * client report -> server log -> proxy logs without adding dependencies.
 */
export function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    // eslint-disable-next-line no-console
    console[level](
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg: 'http_request',
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      })
    );
  });

  next();
}
