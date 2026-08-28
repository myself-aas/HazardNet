import {
  ASSET_LABELS,
  AssetKind,
  classifyAsset,
  formatBytes,
  githubReleasesUrl,
  githubRepoUrl,
  npmPackageUrl,
  ownsRegistryProject,
  pypiProjectUrl,
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

  it('keeps install commands in sync with registry name overrides', () => {
    const channels = resolveChannels({
      VITE_PYPI_PACKAGE_NAME: 'hazardnet-sdk',
      VITE_NPM_PACKAGE_NAME: '@hazardnet/client',
    });
    const python = channels.find((c) => c.id === 'python');
    const npm = channels.find((c) => c.id === 'npm');
    expect(python?.pypiName).toBe('hazardnet-sdk');
    expect(python?.installCommand).toBe('pip install hazardnet-sdk');
    expect(npm?.npmName).toBe('@hazardnet/client');
    expect(npm?.installCommand).toBe('npm install @hazardnet/client');
  });

  it('ignores empty-string overrides', () => {
    const channels = resolveChannels({ VITE_DOWNLOAD_REPO_ANDROID: '  ' });
    expect(channels.find((c) => c.id === 'android')?.repoSlug).toBe('myself-aas/hazardnet-field-agent');
  });
});

describe('downloadChannels — registry ownership guard', () => {
  it('accepts project URLs that reference hazardnet or the owner', () => {
    expect(ownsRegistryProject(['https://github.com/myself-aas/hazardnet-python'])).toBe(true);
    expect(ownsRegistryProject(['https://hazardnet.live'])).toBe(true);
  });

  it('rejects squatted names with unrelated project URLs', () => {
    expect(ownsRegistryProject(['https://example.com/unrelated'])).toBe(false);
    expect(ownsRegistryProject([''])).toBe(false);
    expect(ownsRegistryProject([], 'myself-aas')).toBe(false);
  });

  it('honours a custom owner', () => {
    expect(ownsRegistryProject(['https://github.com/bd-disaster-lab/anything'], 'bd-disaster-lab')).toBe(true);
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
    expect(pypiProjectUrl('hazardnet')).toBe('https://pypi.org/project/hazardnet/');
    expect(npmPackageUrl('hazardnet')).toBe('https://www.npmjs.com/package/hazardnet');
  });
});
