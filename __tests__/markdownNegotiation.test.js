import { readFileSync } from 'node:fs';

describe('self-hosted Markdown negotiation cache policy', () => {
  it('does not publish cacheable negotiated responses without edge Vary configuration', () => {
    const source = readFileSync('backend/middleware/markdownNegotiation.js', 'utf8');
    expect(source).toContain("res.setHeader('Cache-Control', 'no-store')");
    expect(source).not.toContain("res.setHeader('Cache-Control', 'public, max-age=3600')");
  });
});
