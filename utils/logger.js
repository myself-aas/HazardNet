// Simple logger wrapper – can be swapped for winston or pino
export const logger = {
  info: (msg, ...meta) => console.log('[INFO]', msg, ...meta),
  error: (msg, ...meta) => console.error('[ERROR]', msg, ...meta),
};
