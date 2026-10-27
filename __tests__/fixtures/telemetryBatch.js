/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from packages/analytics/src/streaming.ts:191 (SendBatch) and its __tests__/streaming.test.ts recorder, as posted to /api/v1/telemetry on 2026-10-27 by `node scripts/capture_edge_fixtures.mjs`.
 * # Shape: object — { sessionId, events: [{event, at, properties}] } — the client request, not an upstream response.
 * # To refresh: node scripts/capture_edge_fixtures.mjs (edit EMBEDDED_TELEMETRY if the tracker shape changes).
 *
 * This is a REQUEST fixture: the endpoint's "upstream" is the browser beacon. Leaf values
 * (page_view, session-abc-123, zoom 7) are asserted verbatim in the telemetry suites.
 */
module.exports = {
  "sessionId": "session-abc-123",
  "events": [
    {
      "event": "page_view",
      "at": 1767000000000,
      "properties": {
        "route": "/",
        "lang": "en"
      }
    },
    {
      "event": "map_interaction",
      "at": 1767000001000,
      "properties": {
        "zoom": 7,
        "dragged": true
      }
    }
  ]
};
