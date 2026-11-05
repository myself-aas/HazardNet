import { onRequest } from '../functions/[[path]].ts';

class TestHeaders {
  constructor(init = {}) {
    this.values = new Map(Object.entries(init).map(([key, value]) => [key.toLowerCase(), value]));
  }
  get(key) { return this.values.get(key.toLowerCase()) ?? null; }
  set(key, value) { this.values.set(key.toLowerCase(), value); }
}

class TestRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method ?? 'GET';
    this.headers = new TestHeaders(options.headers);
  }
}

class TestResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = options.headers instanceof TestHeaders
      ? options.headers
      : new TestHeaders(options.headers);
  }
  async text() { return this.body; }
}

global.Request = TestRequest;
global.Response = TestResponse;
global.Headers = TestHeaders;

function context(accept, markdownResponse = new Response('# Home\n', { status: 200 })) {
  const requested = [];
  return {
    requested,
    value: {
      request: new Request('https://www.hazardnet.live/', {
        headers: accept ? { Accept: accept } : {},
      }),
      env: {
        ASSETS: {
          fetch: async (request) => {
            requested.push(request.url);
            return markdownResponse;
          },
        },
      },
      next: async () => new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    },
  };
}

describe('Cloudflare Markdown for Agents function', () => {
  it('serves Markdown when it is the preferred representation', async () => {
    const fixture = context('text/markdown, text/html;q=0.8');
    const response = await onRequest(fixture.value);

    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(response.headers.get('x-markdown-tokens')).toBe('2');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fixture.requested.map(String)).toEqual(['https://www.hazardnet.live/markdown/index.md']);
    expect(await response.text()).toBe('# Home\n');
  });

  it('keeps HTML as the default representation', async () => {
    const fixture = context('text/html, text/markdown;q=0.5');
    const response = await onRequest(fixture.value);

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(fixture.requested).toEqual([]);
  });
});
