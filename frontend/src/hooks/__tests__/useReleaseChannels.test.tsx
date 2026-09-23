import '@testing-library/jest-dom';
/// <reference types="jest" />
import { renderHook, waitFor } from '@testing-library/react';
import { LOOKUPS_DISABLED_NOTE, useReleaseChannels } from '../useReleaseChannels';
import { resolveChannels } from '../../lib/downloadChannels';

/**
 * ADR 0011 (owner decision, 2026-09-19): the Download Center does not query
 * package registries — HazardNet publishes no npm or PyPI package — and it does
 * not query the GitHub Releases API either unless the deployment opts in, since
 * none of the five product repositories exists yet.
 *
 * The assertion that matters is the *absence* of a request: a page that fires a
 * lookup which can only 404 both logs a failing response in the browser (the
 * whole-app QA gate fails the route for it) and renders a state derived from
 * nothing. So these tests spy on `fetch` rather than on the rendered copy.
 */
const channels = resolveChannels({});

describe('useReleaseChannels — no registry queries, no doomed lookups', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('makes no request at all while release lookups are off (the default)', () => {
    const { result } = renderHook(() => useReleaseChannels(channels));

    expect(fetchMock).not.toHaveBeenCalled();
    for (const channel of channels) {
      const state = result.current[channel.id];
      // Not 'loading': there is nothing in flight, so the first paint is final
      // and the visitor never sees a spinner for a request that is never made.
      expect(state.status).toBe('pending');
      expect(state.release).toBeUndefined();
      expect(state.note).toBe(LOOKUPS_DISABLED_NOTE);
    }
  });

  it('queries no package registry in either mode', async () => {
    fetchMock.mockResolvedValue({ status: 404, json: async () => null });

    renderHook(() => useReleaseChannels(channels)); // lookups off
    const live = renderHook(() => useReleaseChannels(channels, true)); // lookups on
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).not.toEqual([]);
    expect(urls.join('\n')).not.toMatch(/registry\.npmjs\.org|pypi\.org|npmjs\.com/i);
    expect(urls.every((url) => url.startsWith('https://api.github.com/repos/'))).toBe(true);
    live.unmount();
  });

  it('reads the latest GitHub release and classifies its assets when enabled', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        tag_name: 'v1.2.3',
        published_at: '2026-09-01T00:00:00Z',
        html_url: 'https://github.com/myself-aas/hazardnet-field-agent/releases/tag/v1.2.3',
        assets: [
          {
            name: 'SHA256SUMS.txt',
            browser_download_url: 'https://example.invalid/SHA256SUMS.txt',
            size: 128,
          },
          {
            name: 'hazardnet-field-agent-v1.2.3.apk',
            browser_download_url: 'https://example.invalid/field-agent.apk',
            size: 18_874_368,
            download_count: 3,
          },
        ],
      }),
    });

    const { result } = renderHook(() => useReleaseChannels([channels[0]], true));
    await waitFor(() => expect(result.current.android.status).toBe('ready'));

    const release = result.current.android.release;
    expect(release?.tagName).toBe('v1.2.3');
    // API order is preserved here; the card sorts by `primaryAssetKinds`
    // (`orderAssets`) so the checksum never becomes the primary button.
    expect(release?.assets.map((asset) => asset.kind)).toEqual(['checksum', 'apk']);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/myself-aas/hazardnet-field-agent/releases/latest',
    );
  });

  it('reports an unpublished release as pending, and a rate limit as unavailable', async () => {
    fetchMock.mockResolvedValue({ status: 404, json: async () => null });
    const missing = renderHook(() => useReleaseChannels([channels[0]], true));
    await waitFor(() => expect(missing.result.current.android.status).toBe('pending'));
    expect(missing.result.current.android.note).toMatch(/no release published yet/i);
    missing.unmount();

    sessionStorage.clear();
    fetchMock.mockResolvedValue({ status: 403, json: async () => null });
    const limited = renderHook(() => useReleaseChannels([channels[1]], true));
    await waitFor(() => expect(limited.result.current.windows.status).toBe('unavailable'));
    expect(limited.result.current.windows.note).toMatch(/rate limit/i);
    limited.unmount();
  });

  it('reuses a cached release inside the TTL instead of refetching', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ tag_name: 'v0.9.0', published_at: '', html_url: '', assets: [] }),
    });

    const first = renderHook(() => useReleaseChannels([channels[2]], true));
    await waitFor(() => expect(first.result.current.linux.status).toBe('ready'));
    first.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useReleaseChannels([channels[2]], true));
    await waitFor(() => expect(second.result.current.linux.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1); // served from sessionStorage
    expect(second.result.current.linux.release?.tagName).toBe('v0.9.0');
  });
});
