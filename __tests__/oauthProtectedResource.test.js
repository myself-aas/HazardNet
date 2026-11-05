import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const origin = 'https://www.hazardnet.live';

describe('OAuth Protected Resource Metadata (RFC 9728)', () => {
  const metadata = JSON.parse(
    readFileSync(join(root, 'frontend/public/.well-known/oauth-protected-resource'), 'utf8')
  );
  const server = readFileSync(join(root, 'backend/server.js'), 'utf8');

  it('publishes the required resource and authorization server metadata', () => {
    expect(metadata.resource).toBe(origin);
    expect(metadata.authorization_servers).toEqual([
      'https://securetoken.google.com/hazardnet-aas48424',
    ]);
    expect(metadata.authorization_servers).not.toContain(origin);
    expect(metadata.scopes_supported).toEqual(expect.arrayContaining(['openid', 'read:forecasts', 'chat']));
  });

  it('uses the RFC 9728 resource_metadata challenge parameter', () => {
    expect(server).toContain('Bearer');
    expect(server).toContain('resource_metadata=');
    expect(server).toContain('/.well-known/oauth-protected-resource');
  });
});
