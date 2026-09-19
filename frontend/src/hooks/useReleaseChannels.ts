import { useEffect, useState } from 'react';
import {
  AssetKind,
  ChannelId,
  DownloadChannel,
  GithubReleaseInfo,
  ReleaseAsset,
  classifyAsset,
  githubReleasesUrl,
} from '../lib/downloadChannels';

/**
 * Release state for the Download Center channels.
 *
 * ONE data source, and it is opt-in (ADR 0011, owner decision 2026-09-19):
 *
 *   - GitHub Releases API → latest release + assets per product repository,
 *     fetched only when `liveReleaseLookupsEnabled()` is true for this
 *     deployment. Off by default, because none of the five product
 *     repositories exists yet: every lookup was a guaranteed 404 that the
 *     visitor's browser had to make.
 *   - PyPI / npm JSON APIs → REMOVED. HazardNet does not publish packages to
 *     a registry, so there is nothing to look up and no install command to
 *     show. The previous `fetchRegistry()` + ownership guard existed to stop
 *     the page linking to a squatted name; not querying at all is the stronger
 *     form of the same guarantee.
 *
 * With lookups off this hook performs no network I/O: every channel resolves
 * synchronously to a `pending` state whose `note` is the exact sentence the
 * card renders, so the page states what is distributed instead of reporting
 * the absence of a listing it never asked for.
 *
 * Robustness (live mode only):
 *   - sessionStorage TTL cache (10 min) so repeat visits do not burn the
 *     unauthenticated GitHub API rate budget (60 req/h per IP)
 *   - stale-while-error: on fetch failure a cached older payload is reused
 *   - 404  → "pending": the product repository has not published a release yet
 *   - 403/429 → "unavailable": the UI falls back to the human release page URL
 */

const CACHE_PREFIX = 'hazardnet.download.v2';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;

/** Note shown on every card while release lookups are switched off. */
export const LOOKUPS_DISABLED_NOTE =
  'Release files are not fetched on this deployment — open the repository’s Releases page to see whether artifacts have been published.';

export type ChannelStatus = 'loading' | 'ready' | 'pending' | 'unavailable';

export interface ChannelState {
  /** Latest GitHub release for the channel's product repository (live mode). */
  release?: GithubReleaseInfo;
  /** Human-readable explanation for pending/unavailable states. */
  note?: string;
  status: ChannelStatus;
}

export type ChannelStates = Record<ChannelId, ChannelState>;

interface CachedChannel {
  ts: number;
  release?: GithubReleaseInfo;
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

function deriveStatus(github: Pick<ChannelState, 'release' | 'note'>): ChannelStatus {
  if (github.release) return 'ready';
  // A verifiable release is simply not published yet (expected pre-launch).
  const hardFailure = /rate limit|network error|malformed|unavailable/i.test(github.note ?? '');
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

/**
 * Release state for every channel.
 *
 * @param channels resolved channel definitions (`resolveChannels`)
 * @param live     whether release lookups are permitted for this deployment
 *                 (`liveReleaseLookupsEnabled(import.meta.env)`); default off
 */
export function useReleaseChannels(channels: DownloadChannel[], live = false): ChannelStates {
  const [states, setStates] = useState<ChannelStates>(() =>
    Object.fromEntries(
      channels.map((c) => [
        c.id,
        // No lookup to wait for when live mode is off, so the first paint is
        // already the final state — no "Checking releases…" spinner for a
        // request that is never made.
        live ? ({ status: 'loading' } as ChannelState) : ({ status: 'pending', note: LOOKUPS_DISABLED_NOTE } as ChannelState),
      ]),
    ) as ChannelStates,
  );

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const loadChannel = async (channel: DownloadChannel) => {
      const cached = readCache(channel.id);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        if (!cancelled) {
          setStates((prev) => ({
            ...prev,
            [channel.id]: {
              status: cached.release ? 'ready' : 'pending',
              release: cached.release,
              note: cached.release ? undefined : 'No release published yet',
            },
          }));
        }
        return;
      }

      const github = await fetchGithubRelease(channel);
      writeCache(channel.id, { ts: Date.now(), release: github.release });
      if (!cancelled) {
        setStates((prev) => ({
          ...prev,
          [channel.id]: {
            status: deriveStatus(github),
            release: github.release,
            note: github.note,
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
    // repositories changes (stable across renders in practice).
  }, [live, channels.map((c) => c.repoSlug).join('|')]);

  return states;
}
