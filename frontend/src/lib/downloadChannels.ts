/**
 * HazardNet Download Center release channels (single source of truth).
 *
 * Each channel maps a downloadable product (the five HazardNet product
 * repositories) to where its artifacts are published:
 *
 *   - GitHub Releases  → native binaries/installers/archives, attached by the
 *                        release workflow templates in
 *                        .github/workflow-templates/ of the HazardNet repo
 *
 * DISTRIBUTION DECISION (owner, 2026-09-19 — ADR 0011)
 * ----------------------------------------------------
 * HazardNet does **not** publish packages to npm or PyPI, and this page no
 * longer queries either registry. Both lookups returned 404 for `hazardnet`
 * (the packages do not exist), so every visit to `/download` fired two
 * requests that could only fail and rendered an install command
 * (`pip install hazardnet` / `npm install hazardnet`) that could not work.
 * The registries were removed from the channel model rather than left
 * "pending": a distribution channel the project has decided not to use is
 * not a channel that is awaiting its first release.
 *
 * The same reasoning applies to the release lookups, with one difference: a
 * GitHub Releases listing *will* exist once a product repository is created,
 * so that lookup is kept — but it is opt-in (`VITE_DOWNLOAD_LIVE_RELEASES`,
 * default off). Until the owner flips it, `/download` makes **no** network
 * requests at all: it states what is distributed and links to the repository
 * and the workflow template that will produce the artifacts. That is also
 * what keeps the page inside the whole-app QA gate, which fails a route that
 * serves any non-environmental 4xx (e2e/full-app-qa.spec.ts).
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
 *   VITE_DOWNLOAD_LIVE_RELEASES    (default: off — see above)
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
  /**
   * Where this channel's artifacts actually come from. Stated on the card so
   * the page never implies a distribution path the project does not use — no
   * channel is published to a package registry (ADR 0011).
   */
  distribution: string;
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
    distribution: 'Signed APK / AAB attached to the product repository’s GitHub Releases by the Android release workflow.',
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
    distribution: 'Installer / zip archive attached to the product repository’s GitHub Releases by the Windows release workflow.',
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
    distribution: 'tar.gz archive (plus SHA256SUMS.txt) attached to the product repository’s GitHub Releases by the Linux release workflow.',
    primaryAssetKinds: ['archive'],
  },
  {
    id: 'python',
    title: 'HazardNet Python SDK',
    platform: 'Python',
    icon: 'python',
    badge: 'SDK / Library',
    description:
      'Typed Python client objects for the HazardNet forecast and advisory APIs — for research pipelines and custom integrations that consume published results.',
    requirements: 'Python 3.10–3.13',
    distribution:
      'Source and built sdist/wheel from the product repository. Not published to PyPI (ADR 0011) — there is no `pip install hazardnet`.',
    primaryAssetKinds: ['wheel', 'sdist'],
  },
  {
    id: 'npm',
    title: 'HazardNet JavaScript Library',
    platform: 'Node.js',
    icon: 'code',
    badge: 'JS / TS Library',
    description:
      'TypeScript/JavaScript client for the HazardNet forecast and advisory APIs: typed forecast objects, district lookups, advisory rendering helpers and shared HazardNet types for web and Node integrations.',
    requirements: 'Node.js 18+ (LTS recommended) • npm 9+',
    distribution:
      'Source and packed tarball from the product repository. Not published to the npm registry (ADR 0011) — there is no `npm install hazardnet`.',
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

/** Build the channel list, applying Vite env overrides for repository slugs. */
export function resolveChannels(
  env: Record<string, string | undefined> = {},
): DownloadChannel[] {
  const owner = env.VITE_DOWNLOAD_GITHUB_OWNER?.trim() || DEFAULT_OWNER;

  return BASE_CHANNELS.map((base) => {
    const repoName =
      env[`VITE_DOWNLOAD_REPO_${REPO_ENV_SUFFIX[base.id]}`]?.trim() ||
      DEFAULT_REPO_NAME[base.id];
    return {
      ...base,
      repoSlug: `${owner}/${repoName}`,
    };
  });
}

/**
 * Whether the Download Center may query the GitHub Releases API at all.
 *
 * Off by default (ADR 0011): the five product repositories do not exist yet, so
 * every lookup would be a 404 the visitor's browser has to make and the page
 * would render a state that says less than the static copy does. Set
 * `VITE_DOWNLOAD_LIVE_RELEASES=true` in the deployment environment once the
 * product repositories publish releases and the live asset buttons are wanted.
 *
 * There is deliberately no equivalent flag for PyPI/npm: those registries are
 * not a distribution path for this project, so there is nothing to enable.
 */
export function liveReleaseLookupsEnabled(
  env: Record<string, string | undefined> = {},
): boolean {
  return env.VITE_DOWNLOAD_LIVE_RELEASES?.trim().toLowerCase() === 'true';
}

/** Repository root URL for a slug (owner/name). */
export function githubRepoUrl(slug: string): string {
  return `https://github.com/${slug}`;
}

/** Human-facing "latest release" URL (works even when the API is rate-limited). */
export function githubReleasesUrl(slug: string): string {
  return `https://github.com/${slug}/releases/latest`;
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
