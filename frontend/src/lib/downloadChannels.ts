/**
 * HazardNet Download Center release channels (single source of truth).
 *
 * Each channel maps a downloadable product (the five HazardNet product
 * repositories) to where its artifacts are published:
 *
 *   - GitHub Releases  → native binaries/installers/archives, attached by the
 *                        release workflow templates in
 *                        .github/workflow-templates/ of the HazardNet repo
 *   - PyPI / npm       → package registries for the Python SDK and npm library
 *
 * The default repository slugs below are the *expected* product repository
 * names; they are placeholders until each product repository is created and
 * can be overridden per deployment with Vite env vars:
 *
 *   VITE_DOWNLOAD_GITHUB_OWNER     (default: myself-aas)
 *   VITE_DOWNLOAD_REPO_ANDROID     (default: hazardnet-field-agent)
 *   VITE_DOWNLOAD_REPO_WINDOWS     (default: hazardnet-gis-workstation)
 *   VITE_DOWNLOAD_REPO_LINUX       (default: hazardnet-daemon-cli)
 *   VITE_DOWNLOAD_REPO_PYTHON      (default: hazardnet-python)
 *   VITE_DOWNLOAD_REPO_NPM         (default: hazardnet-npm)
 *   VITE_PYPI_PACKAGE_NAME         (default: hazardnet)
 *   VITE_NPM_PACKAGE_NAME          (default: hazardnet)
 *
 * Registry lookups carry an ownership guard: a PyPI/npm project only counts
 * as "ours" when its declared project/repository URLs reference HazardNet or
 * the configured GitHub owner. This prevents the Download Center from ever
 * linking to an unrelated package that squatted the name.
 */

/** Identifiers of the five release channels (deep-link ?platform=<id>). */
export type ChannelId = 'android' | 'windows' | 'linux' | 'python' | 'npm';

/** Classification of a GitHub release asset (drives button labels/icons). */
export type AssetKind =
  | 'apk'
  | 'aab'
  | 'installer'
  | 'archive'
  | 'wheel'
  | 'sdist'
  | 'tarball'
  | 'checksum'
  | 'other';

export interface ReleaseAsset {
  name: string;
  url: string;
  sizeBytes: number;
  kind: AssetKind;
  downloadCount?: number;
}

export interface GithubReleaseInfo {
  tagName: string;
  publishedAt: string;
  pageUrl: string;
  assets: ReleaseAsset[];
}

export interface RegistryInfo {
  /** Package name on the registry. */
  name: string;
  /** Latest version on the registry. */
  version: string;
  /** Human-facing project page (PyPI project / npm package page). */
  url: string;
  /** Registry kind, for labels. */
  registry: 'pypi' | 'npm';
  /** True when the ownership guard passed. */
  verified: boolean;
}

export interface DownloadChannel {
  id: ChannelId;
  title: string;
  platform: string;
  icon: string;
  badge: string;
  description: string;
  requirements: string;
  /** GitHub owner/name whose Releases carry this channel's artifacts. */
  repoSlug: string;
  /** Link to the workflow template that builds and publishes the artifacts. */
  workflowTemplate: string;
  /** PyPI project name (python channel only). */
  pypiName?: string;
  /** npm package name (npm channel only). */
  npmName?: string;
  /** Registry install command shown with a copy button, when applicable. */
  installCommand?: string;
  /** Preferred asset kinds for the primary download button, in order. */
  primaryAssetKinds: AssetKind[];
}

const HAZARDNET_REPO = 'myself-aas/HazardNet';
const TEMPLATE_BASE = `https://github.com/${HAZARDNET_REPO}/blob/main/.github/workflow-templates`;

const DEFAULT_OWNER = 'myself-aas';

/** Fallback channel definitions; slugs get overridden by env in resolveChannels. */
const BASE_CHANNELS: Omit<DownloadChannel, 'repoSlug'>[] = [
  {
    id: 'android',
    title: 'HazardNet Field Agent',
    platform: 'Android',
    icon: 'android',
    badge: 'Field Ready',
    description:
      'Offline-first Android companion app for agricultural extension officers and emergency responders: offline district map caching, GPS geotagging, push advisory delivery and on-device TFLite hazard inference for the field.',
    requirements: 'Android 8.0+ (API 26) • ~100 MB storage • GPS recommended',
    workflowTemplate: `${TEMPLATE_BASE}/hazardnet-field-agent-android.yml`,
    primaryAssetKinds: ['apk', 'aab'],
  },
  {
    id: 'windows',
    title: 'HazardNet GIS Workstation',
    platform: 'Windows',
    icon: 'windows',
    badge: 'Desktop GIS',
    description:
      'Native Windows workstation for high-resolution satellite tile batch processing, multi-layer GIS composition and print-quality hazard map export, with GPU-accelerated inference for district-scale analysis.',
    requirements: 'Windows 10/11 64-bit • 4 GB RAM • DirectX 12 GPU recommended',
    workflowTemplate: `${TEMPLATE_BASE}/hazardnet-gis-workstation-windows.yml`,
    primaryAssetKinds: ['installer', 'archive'],
  },
  {
    id: 'linux',
    title: 'HazardNet Daemon & CLI',
    platform: 'Linux',
    icon: 'linux',
    badge: 'Server / Headless',
    description:
      'Headless Linux daemon and CLI for automated tile pipeline ingestion, scheduled forecasting jobs, Prometheus metrics export and REST API serving — the same engine that powers the web platform, packaged for servers.',
    requirements: 'Ubuntu 20.04+ / Debian 11+ / RHEL 8+ • x86_64 (ARM64 on roadmap)',
    workflowTemplate: `${TEMPLATE_BASE}/hazardnet-daemon-cli-linux.yml`,
    primaryAssetKinds: ['archive'],
  },
  {
    id: 'python',
    title: 'HazardNet Python SDK',
    platform: 'Python (PyPI)',
    icon: 'python',
    badge: 'SDK / Library',
    description:
      'Python library for 15-channel satellite tensor construction, ONNX/TFLite model evaluation, physical severity indexing and advisory retrieval — the building blocks for research pipelines and custom integrations.',
    requirements: 'Python 3.10–3.13 • NumPy • rasterio (optional, GeoTIFF inputs)',
    workflowTemplate: `${TEMPLATE_BASE}/hazardnet-python-package.yml`,
    pypiName: 'hazardnet',
    installCommand: 'pip install hazardnet',
    primaryAssetKinds: ['wheel', 'sdist'],
  },
  {
    id: 'npm',
    title: 'HazardNet JavaScript Library',
    platform: 'Node.js (npm)',
    icon: 'code',
    badge: 'npm Package',
    description:
      'TypeScript/JavaScript client for the HazardNet forecast and advisory APIs: typed forecast objects, district lookups, advisory rendering helpers and shared HazardNet types for web and Node integrations.',
    requirements: 'Node.js 18+ (LTS recommended) • npm 9+',
    workflowTemplate: `${TEMPLATE_BASE}/hazardnet-npm-package.yml`,
    npmName: 'hazardnet',
    installCommand: 'npm install hazardnet',
    primaryAssetKinds: ['tarball'],
  },
];

/** Env var suffix per channel id for repository-name overrides. */
const REPO_ENV_SUFFIX: Record<ChannelId, string> = {
  android: 'ANDROID',
  windows: 'WINDOWS',
  linux: 'LINUX',
  python: 'PYTHON',
  npm: 'NPM',
};

/** Default product repository name per channel (under the configured owner). */
const DEFAULT_REPO_NAME: Record<ChannelId, string> = {
  android: 'hazardnet-field-agent',
  windows: 'hazardnet-gis-workstation',
  linux: 'hazardnet-daemon-cli',
  python: 'hazardnet-python',
  npm: 'hazardnet-npm',
};

/** Build the channel list, applying Vite env overrides for slugs and names. */
export function resolveChannels(
  env: Record<string, string | undefined> = {},
): DownloadChannel[] {
  const owner = env.VITE_DOWNLOAD_GITHUB_OWNER?.trim() || DEFAULT_OWNER;
  const pypiName = env.VITE_PYPI_PACKAGE_NAME?.trim() || 'hazardnet';
  const npmName = env.VITE_NPM_PACKAGE_NAME?.trim() || 'hazardnet';

  return BASE_CHANNELS.map((base) => {
    const repoName =
      env[`VITE_DOWNLOAD_REPO_${REPO_ENV_SUFFIX[base.id]}`]?.trim() ||
      DEFAULT_REPO_NAME[base.id];
    const channel: DownloadChannel = {
      ...base,
      repoSlug: `${owner}/${repoName}`,
    };
    // Keep install commands in sync with overridden registry names.
    if (base.id === 'python') {
      channel.pypiName = pypiName;
      channel.installCommand = `pip install ${pypiName}`;
    }
    if (base.id === 'npm') {
      channel.npmName = npmName;
      channel.installCommand = `npm install ${npmName}`;
    }
    return channel;
  });
}

/** Repository root URL for a slug (owner/name). */
export function githubRepoUrl(slug: string): string {
  return `https://github.com/${slug}`;
}

/** Human-facing "latest release" URL (works even when the API is rate-limited). */
export function githubReleasesUrl(slug: string): string {
  return `https://github.com/${slug}/releases/latest`;
}

/** PyPI project page URL. */
export function pypiProjectUrl(name: string): string {
  return `https://pypi.org/project/${name}/`;
}

/** npm package page URL. */
export function npmPackageUrl(name: string): string {
  return `https://www.npmjs.com/package/${name}`;
}

/**
 * Ownership guard for registry projects: at least one declared project URL
 * (source/home/repository) must reference HazardNet or the GitHub owner.
 */
export function ownsRegistryProject(projectUrls: string[], owner: string = DEFAULT_OWNER): boolean {
  return projectUrls.some(
    (url) =>
      typeof url === 'string' &&
      (url.toLowerCase().includes('hazardnet') || url.toLowerCase().includes(owner.toLowerCase())),
  );
}

/** Classify a release asset filename into an AssetKind (case-insensitive). */
export function classifyAsset(name: string): AssetKind {
  const n = name.toLowerCase();
  if (n === 'sha256sums.txt' || n === 'sha256sums' || /^[^\s]*checksums?\.(txt|json)$/.test(n)) {
    return 'checksum';
  }
  if (n.endsWith('.apk')) return 'apk';
  if (n.endsWith('.aab')) return 'aab';
  if (n.endsWith('.msi') || n.endsWith('.exe') || n.endsWith('.msix')) return 'installer';
  if (n.endsWith('.whl')) return 'wheel';
  if (n.endsWith('.tgz')) {
    // npm tarballs follow name-1.2.3.tgz
    return /-\d+(\.\d+)+.*\.tgz$/.test(n) ? 'tarball' : 'archive';
  }
  if (n.endsWith('.tar.gz')) {
    // PyPI sdists follow name-1.2.3.tar.gz; native archives carry a target
    // triple such as linux-x86_64
    const isSdist = /-\d+(\.\d+)+[a-z0-9.+-]*\.tar\.gz$/.test(n) && !/(linux|x86_64|aarch64|amd64)/.test(n);
    return isSdist ? 'sdist' : 'archive';
  }
  if (n.endsWith('.zip')) return 'archive';
  return 'other';
}

/** Human label for an asset kind (buttons, chips). */
export const ASSET_LABELS: Record<AssetKind, string> = {
  apk: 'APK (sideload)',
  aab: 'AAB (Play bundle)',
  installer: 'Installer',
  archive: 'Archive (.tar.gz)',
  wheel: 'Wheel',
  sdist: 'Source (sdist)',
  tarball: 'Package tarball',
  checksum: 'Checksums',
  other: 'File',
};

/** Format bytes into a compact human-readable size. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || unit === 0 ? `${Math.round(value)}` : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[unit]}`;
}
