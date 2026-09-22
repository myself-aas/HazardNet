// utils/logger.js — minimal logger for serverless functions (api/ingest.js et al.)
// Mirrors the interface expected by api/*: logger.info, logger.warn, logger.error, logger.debug
// Falls back to console so tests and local runs have visible output without a transport.
// In production this can be swapped for a structured logger (pino/winston) without changing call sites.

function formatArgs(args) {
  return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

export const logger = {
  info: (...args) => console.log('[info]', formatArgs(args)),
  warn: (...args) => console.warn('[warn]', formatArgs(args)),
  error: (...args) => console.error('[error]', formatArgs(args)),
  debug: (...args) => {
    if (process.env.DEBUG) console.debug('[debug]', formatArgs(args));
  },
};

export default logger;
