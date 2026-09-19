import {
  ASSET_LABELS,
  AssetKind,
  classifyAsset,
  formatBytes,
  githubReleasesUrl,
  githubRepoUrl,
  liveReleaseLookupsEnabled,
  resolveChannels,
} from '../downloadChannels';

describe('downloadChannels — asset classification', () => {
  it.each<[string, AssetKind]>([
    ['hazardnet-field-agent-v1.2.3.apk', 'apk'],
    ['hazardnet-field-agent-v1.2.3.aab', 'aab'],
    ['hazardnet-gis-workstation-win-x64.zip', 'archive'],
    ['HazardNetSetup-1.0.0.exe', 'installer'], // case-insensitive
    ['hazardnet-1.0.0-x64.msi', 'installer'],
    ['hazardnet-daemon-cli-linux-x86_64-1.2.3.tar.gz', 'archive'],
    ['hazardnet-daemon-cli-linux-aarch64-1.0.0.tar.gz', 'archive'],
    ['hazardnet-1.2.3-py3-none-any.whl', 'wheel'],
    ['hazardnet-1.2.3.tar.gz', 'sdist'],
    ['hazardnet-1.2.3.tgz', 'tarball'],
    ['SHA256SUMS.txt', 'checksum'],
    ['checksums.json', 'checksum'],
    ['release-notes.md', 'other'],
  ])('classifies %s as %s', (name, kind) => {
    expect(classifyAsset(name)).toBe(kind);
  });

  it('labels every asset kind', () => {
    (Object.keys(ASSET_LABELS) as AssetKind[]).forEach((kind) => {
      expect(ASSET_LABELS[kind].length).toBeGreaterThan(0);
    });
  });
});

describe('downloadChannels — resolveChannels', () => {
  it('returns five channels with expected ids and default slugs', () => {
    const channels = resolveChannels({});
    expect(channels.map((c) => c.id)).toEqual(['android', 'windows', 'linux', 'python', 'npm']);
    expect(channels.find((c) => c.id === 'android')?.repoSlug).toBe('myself-aas/hazardnet-field-agent');
    expect(channels.find((c) => c.id === 'windows')?.repoSlug).toBe('myself-aas/hazardnet-gis-workstation');
    expect(channels.find((c) => c.id === 'linux')?.repoSlug).toBe('myself-aas/hazardnet-daemon-cli');
  });

  it('applies owner and per-channel repository overrides', () => {
    const channels = resolveChannels({
      VITE_DOWNLOAD_GITHUB_OWNER: 'bd-disaster-lab',
      VITE_DOWNLOAD_REPO_ANDROID: 'field-agent-mobile',
    });
    expect(channels.find((c) => c.id === 'android')?.repoSlug).toBe('bd-disaster-lab/field-agent-mobile');
    expect(channels.find((c) => c.id === 'linux')?.repoSlug).toBe('bd-disaster-lab/hazardnet-daemon-cli');
  });

  it('ignores empty-string overrides', () => {
    const channels = resolveChannels({ VITE_DOWNLOAD_REPO_ANDROID: '  ' });
    expect(channels.find((c) => c.id === 'android')?.repoSlug).toBe('myself-aas/hazardnet-field-agent');
  });

  it('states a distribution path for every channel', () => {
    for (const channel of resolveChannels({})) {
      expect(channel.distribution).toBeTruthy();
      expect(channel.distribution.length).toBeGreaterThan(20);
    }
  });
});

/**
 * ADR 0011 (owner decision, 2026-09-19): HazardNet does not publish packages to
 * npm or PyPI, and `/download` must not query either registry. `hazardnet`
 * returned 404 on both, so every visit fired two requests that could only fail
 * and printed an install command that could not work — the whole-app QA gate
 * (e2e/full-app-qa.spec.ts › Route health › /download) fails a route that serves
 * a non-environmental 4xx, which is how this stayed visible.
 *
 * These tests are the regression guard: a registry field, a registry URL helper
 * or an install command coming back is a re-opened decision, not a feature.
 */
describe('downloadChannels — no package-registry publication (ADR 0011)', () => {
  it('carries no registry name, no install command and no registry URL helper', () => {
    for (const channel of resolveChannels({})) {
      expect(channel).not.toHaveProperty('pypiName');
      expect(channel).not.toHaveProperty('npmName');
      expect(channel).not.toHaveProperty('installCommand');
    }
  });

  it('ignores the retired registry-name environment overrides', () => {
    const channels = resolveChannels({
      VITE_PYPI_PACKAGE_NAME: 'hazardnet-sdk',
      VITE_NPM_PACKAGE_NAME: '@hazardnet/client',
    });
    expect(channels.find((c) => c.id === 'python')).not.toHaveProperty('installCommand');
    expect(channels.find((c) => c.id === 'npm')).not.toHaveProperty('installCommand');
  });

  it('says on the card that the SDK channels are not on a registry', () => {
    const channels = resolveChannels({});
    expect(channels.find((c) => c.id === 'python')?.distribution).toMatch(/not published to pypi/i);
    expect(channels.find((c) => c.id === 'npm')?.distribution).toMatch(/not published to the npm registry/i);
    // …and never implies the retired command exists.
    for (const channel of channels) {
      expect(channel.distribution).not.toMatch(/^\s*(pip|npm) install /i);
    }
  });

  it('keeps release lookups off unless the deployment opts in', () => {
    expect(liveReleaseLookupsEnabled({})).toBe(false);
    expect(liveReleaseLookupsEnabled({ VITE_DOWNLOAD_LIVE_RELEASES: '' })).toBe(false);
    expect(liveReleaseLookupsEnabled({ VITE_DOWNLOAD_LIVE_RELEASES: 'false' })).toBe(false);
    expect(liveReleaseLookupsEnabled({ VITE_DOWNLOAD_LIVE_RELEASES: 'true' })).toBe(true);
    expect(liveReleaseLookupsEnabled({ VITE_DOWNLOAD_LIVE_RELEASES: ' TRUE ' })).toBe(true);
  });
});

describe('downloadChannels — formatting and URLs', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(18_874_368)).toBe('18 MB');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('derives stable URLs', () => {
    expect(githubRepoUrl('myself-aas/hazardnet-npm')).toBe('https://github.com/myself-aas/hazardnet-npm');
    expect(githubReleasesUrl('a/b')).toBe('https://github.com/a/b/releases/latest');
  });
});
