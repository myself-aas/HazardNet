/**
 * Resolve the runtime environment in a way that loads in Node AND in a Cloudflare
 * Worker isolate.
 *
 * Node has `process.env`; a Worker without the `nodejs_compat` flag has no `process`
 * global at all, so the check must be `typeof process !== 'undefined'` first — reading
 * `process.env` directly throws a ReferenceError in the isolate. Pages Functions get
 * their secrets through `context.env` instead, and the edge routes
 * (`functions/api/chat/*`) pass that object down explicitly; every Node caller
 * (Express routes, `serverless/*` twins) calls the handlers without an env argument
 * and gets `process.env` from this default.
 */
export function defaultEnv() {
  if (typeof process !== 'undefined' && process && typeof process.env === 'object' && process.env) {
    return process.env;
  }
  return {};
}
