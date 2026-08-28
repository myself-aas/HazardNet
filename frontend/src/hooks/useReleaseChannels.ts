import { useEffect, useState } from 'react';
import {
  AssetKind,
  ChannelId,
  DownloadChannel,
  GithubReleaseInfo,
  RegistryInfo,
  ReleaseAsset,
  classifyAsset,
  githubReleasesUrl,
  npmPackageUrl,
  ownsRegistryProject,
  pypiProjectUrl,
} from '../lib/downloadChannels';

/**
 * Live release state for the Download Center channels.
 *
 * Data sources (all public, no credentials):
 *   - GitHub Releases API  → latest release + assets per product repository
 *   - PyPI / npm JSON APIs → latest published version of the SDK packages
 *
 * Robustness:
 *   - sessionStorage TTL cache (10 min) so repeat visits do not burn the
 *     unauthenticated GitHub API rate budget (60 req/h per IP)
 *   - stale-while-error: on fetch failure a cached older payload is reused
 *   - 404  → "pending": the product repository has not published a release yet
 *   - 403  → "rate-limited": the UI falls back to the human release page URL
 *   - registry ownership guard → a squatted name shows as pending, never as
 *     a download link to someone else's package
 */

const CACHE_PREFIX = 'hazardnet.download.v1';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;

export type ChannelStatus = 'loading' | 'ready' | 'pending' | 'unavailable';

export interface ChannelState {
  status: ChannelStatus;
  /** Latest GitHub release for the channel's product repository. */
  release?: GithubReleaseInfo;
  /** Latest registry (PyPI/npm) information for SDK channels. */
  registry?: RegistryInfo;
  /** Human-readable explanation for pending/unavailable states. */
  note?: string;
}

export type ChannelStates = Record<ChannelId, ChannelState>;

interface CachedChannel {
  ts: number;
  release?: GithubReleaseInfo;
  registry?: RegistryInfo;
}

function readCache(id: ChannelId): CachedChannel | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}.${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChannel;
    return typeof parsed?.ts === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(id: ChannelId, value: CachedChannel): void {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}.${id}`, JSON.stringify(value));
  } catch {
    // Private mode / quota — caching is best effort only.
  }
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

interface GithubApiAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
  download_count?: number;
}

interface GithubApiRelease {
  tag_name?: string;
  published_at?: string;
  html_url?: string;
  assets?: GithubApiAsset[];
}

async function fetchGithubRelease(
  channel: DownloadChannel,
): Promise<Pick<ChannelState, 'release' | 'note'>> {
  try {
    const { status, body } = await fetchJson(
      `https://api.github.com/repos/${channel.repoSlug}/releases/latest`,
    );
    if (status === 404) {
      return { note: 'No release published yet' };
    }
    if (status === 403 || status === 429) {
      return { note: 'GitHub API rate limit reached — open the releases page directly' };
    }
    if (status !== 200 || !body) {
      return { note: 'Release information unavailable' };
    }
    const rel = body as GithubApiRelease;
    if (!rel.tag_name || !Array.isArray(rel.assets)) {
      return { note: 'Malformed release payload' };
    }
    const assets: ReleaseAsset[] = rel.assets
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({
        name: a.name as string,
        url: a.browser_download_url as string,
        sizeBytes: typeof a.size === 'number' ? a.size : 0,
        kind: classifyAsset(a.name as string),
        downloadCount: a.download_count,
      }));
    return {
      release: {
        tagName: rel.tag_name,
        publishedAt: rel.published_at ?? '',
        pageUrl: rel.html_url || githubReleasesUrl(channel.repoSlug),
        assets,
      },
    };
  } catch {
    return { note: 'Network error while contacting GitHub' };
  }
}

async function fetchRegistry(channel: DownloadChannel): Promise<Pick<ChannelState, 'registry' | 'note'>> {
  try {
    if (channel.pypiName) {
      const name = channel.pypiName;
      const { status, body } = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
      if (status === 404) return { note: 'Not yet published on PyPI' };
      if (status !== 200 || !body) return { note: 'PyPI lookup unavailable' };
      const info = (body as { info?: { version?: string; project_url?: string; project_urls?: Record<string, string> } }).info;
      if (!info?.version) return { note: 'PyPI payload missing version' };
      const urls = Object.values(info.project_urls ?? {});
      if (info.project_url) urls.push(info.project_url);
      const verified = ownsRegistryProject(urls);
      return {
        registry: {
          name,
          version: info.version,
          url: pypiProjectUrl(name),
          registry: 'pypi',
          verified,
        },
        ...(verified ? {} : { note: 'PyPI name exists but is not published by HazardNet' }),
      };
    }
    if (channel.npmName) {
      const name = channel.npmName;
      const { status, body } = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
      if (status === 404) return { note: 'Not yet published on npm' };
      if (status !== 200 || !body) return { note: 'npm lookup unavailable' };
      const doc = body as {
        'dist-tags'?: Record<string, string>;
        repository?: { url?: string } | string;
        homepage?: string;
      };
      const version = doc['dist-tags']?.latest;
      if (!version) return { note: 'npm payload missing version' };
      const repoUrl = typeof doc.repository === 'string' ? doc.repository : doc.repository?.url;
      const urls = [repoUrl ?? '', doc.homepage ?? ''];
      const verified = ownsRegistryProject(urls);
      return {
        registry: {
          name,
          version,
          url: npmPackageUrl(name),
          registry: 'npm',
          verified,
        },
        ...(verified ? {} : { note: 'npm name exists but is not published by HazardNet' }),
      };
    }
  } catch {
    return { note: 'Network error while contacting the registry' };
  }
  return {};
}

function deriveStatus(
  github: Pick<ChannelState, 'release' | 'note'>,
  registry: Pick<ChannelState, 'registry' | 'note'>,
): ChannelStatus {
  const registryReady = registry.registry?.verified === true;
  if (github.release || registryReady) return 'ready';
  // A verifiable release is simply not published yet (expected pre-launch).
  const hardFailure = /rate limit|network error|malformed|unavailable/i.test(
    `${github.note ?? ''} ${registry.note ?? ''}`,
  );
  return hardFailure ? 'unavailable' : 'pending';
}

/** Sort channel assets so preferred kinds come first (primary download). */
export function orderAssets(assets: ReleaseAsset[], preferred: AssetKind[]): ReleaseAsset[] {
  const rank = (kind: AssetKind) => {
    const idx = preferred.indexOf(kind);
    return idx === -1 ? preferred.length + 1 : idx;
  };
  return [...assets].sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));
}

/** Fetch live release/registry state for every channel (cached, resilient). */
export function useReleaseChannels(channels: DownloadChannel[]): ChannelStates {
  const [states, setStates] = useState<ChannelStates>(() =>
    Object.fromEntries(
      channels.map((c) => [c.id, { status: 'loading' } as ChannelState]),
    ) as ChannelStates,
  );

  useEffect(() => {
    let cancelled = false;

    const loadChannel = async (channel: DownloadChannel) => {
      const cached = readCache(channel.id);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        if (!cancelled) {
          setStates((prev) => ({
            ...prev,
            [channel.id]: {
              status: cached.release || cached.registry?.verified ? 'ready' : 'pending',
              release: cached.release,
              registry: cached.registry,
            },
          }));
        }
        return;
      }

      const [github, registry] = await Promise.all([
        fetchGithubRelease(channel),
        fetchRegistry(channel),
      ]);
      writeCache(channel.id, { ts: Date.now(), release: github.release, registry: registry.registry });
      if (!cancelled) {
        setStates((prev) => ({
          ...prev,
          [channel.id]: {
            status: deriveStatus(github, registry),
            release: github.release,
            registry: registry.registry,
            note: github.note ?? registry.note,
          },
        }));
      }
    };

    channels.forEach((channel) => {
      void loadChannel(channel);
    });

    return () => {
      cancelled = true;
    };
    // Channels come from static config; refetch only when the set of
    // repositories/package names changes (stable across renders in practice).
  }, [channels.map((c) => c.repoSlug + c.pypiName + c.npmName).join('|')]);

  return states;
}
