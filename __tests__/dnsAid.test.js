import { DNS_AID_RECORDS } from '../scripts/publish-dns-aid.mjs';

describe('DNS-AID publication records', () => {
  it('publishes HTTPS discovery records under the _agents namespace', () => {
    expect(DNS_AID_RECORDS).toHaveLength(5);
    for (const record of DNS_AID_RECORDS) {
      expect(record.type).toBe('HTTPS');
      expect(record.name).toMatch(/^_[a-z0-9]+\._agents\.hazardnet\.live$/);
      expect(record.proxied).toBe(false);
      expect(record.content).toMatch(/^1 www\.hazardnet\.live\. alpn="[^"]+" port=443 mandatory="alpn,port"$/);
    }
  });
});
