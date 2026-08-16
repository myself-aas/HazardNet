// Simple Prometheus metrics endpoint
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  // In a real setup, expose actual metrics. Here we return a placeholder.
  const metrics = `# HELP ingest_requests_total Total ingest requests
# TYPE ingest_requests_total counter
ingest_requests_total 42\n`;
  res.setHeader('Content-Type', 'text/plain');
  res.end(metrics);
}
