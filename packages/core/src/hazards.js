/**
 * The eight published hazard classes.
 *
 * This list used to live in `backend/mcp/tools.js`, which is a server-side module:
 * it imports `openMeteo.js` and the alert/forecast snapshot readers. The on-device
 * planner only ever needed the names, so importing it from there would have dragged
 * the whole server tool graph into the browser bundle. The constant is the single
 * source of truth here; `mcp/tools.js` imports it back and its JSON-Schema enums and
 * markdown allow-list are derived from it exactly as before.
 */
export const HAZARDS = Object.freeze([
  'flood', 'flash-flood', 'tropical-cyclone', 'drought', 'heat-wave', 'cold-wave', 'fire', 'severe-local-storm',
]);
