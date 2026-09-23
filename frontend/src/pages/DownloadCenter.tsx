import MaterialIcon from '../components/MaterialIcon';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import Breadcrumbs from '../components/Breadcrumbs';
import { DownloadDoneIcon } from '../components/ui/animated-state-icons';
import {
  ASSET_LABELS,
  DownloadChannel,
  ReleaseAsset,
  formatBytes,
  githubReleasesUrl,
  liveReleaseLookupsEnabled,
  resolveChannels,
} from '../lib/downloadChannels';
import { ChannelState, orderAssets, useReleaseChannels } from '../hooks/useReleaseChannels';
import { usePageSeo } from '../hooks/usePageSeo';

type TabId = 'software' | 'python' | 'npm';

const TAB_BY_CHANNEL: Record<string, TabId> = {
  android: 'software',
  windows: 'software',
  linux: 'software',
  python: 'python',
  npm: 'npm',
};

/** Primary/secondary download buttons backed by real GitHub release assets. */
const AssetButton: React.FC<{
  asset: ReleaseAsset;
  primary?: boolean;
  onDownload: (asset: ReleaseAsset) => void;
}> = ({ asset, primary = false, onDownload }) => (
  <motion.a
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.97 }}
    href={asset.url}
    download
    rel="noopener noreferrer"
    onClick={() => onDownload(asset)}
    className={
      primary
        ? 'px-5 py-2.5 rounded-xl bg-nasa-red hover:bg-nasa-red-shade text-carbon-black text-xs font-black transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer'
        : 'px-3.5 py-2 rounded-lg bg-carbon-10 hover:bg-carbon-20 border border-carbon-20 text-carbon-80 text-[11px] font-bold font-mono transition-all flex items-center gap-1.5 shrink-0 cursor-pointer'
    }
    title={`Download ${asset.name}`}
  >
    {primary ? (
      <DownloadDoneIcon isState={false} size={18} duration={0} />
    ) : (
      <MaterialIcon name="download" className="w-3.5 h-3.5" />
    )}
    <span>{primary ? `Download ${ASSET_LABELS[asset.kind]}` : asset.name}</span>
    {primary && asset.sizeBytes > 0 && (
      <span className="text-[10px] font-mono font-bold opacity-70">({formatBytes(asset.sizeBytes)})</span>
    )}
  </motion.a>
);

/** Neutral state chip per channel status. */
const StatusChip: React.FC<{ state: ChannelState }> = ({ state }) => {
  if (state.status === 'ready') {
    const label = state.release?.tagName ?? '';
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-50 border border-emerald-200 text-emerald-900">
        {label || 'Latest'}
      </span>
    );
  }
  if (state.status === 'loading') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-carbon-10 border border-carbon-20 text-carbon-60 flex items-center gap-1.5">
        <span className="w-2 h-2 border-2 border-carbon-40 border-t-transparent rounded-full animate-spin" />
        Checking releases…
      </span>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-rose-50 border border-rose-200 text-rose-900">
        Temporarily unavailable
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 border border-amber-200 text-amber-900">
      Awaiting first release
    </span>
  );
};

/** One download channel card: live release assets, install command, or pending state. */
const ChannelCard: React.FC<{ channel: DownloadChannel; state: ChannelState }> = ({ channel, state }) => {
  const onDownload = useCallback((asset: ReleaseAsset) => {
    toast.success(`Downloading ${asset.name}…`, {
      duration: 2600,
      id: `dl-${asset.name}`,
    });
  }, []);

  const assets = state.release ? orderAssets(state.release.assets, channel.primaryAssetKinds) : [];
  const checksum = assets.find((a) => a.kind === 'checksum');
  const downloadAssets = assets.filter((a) => a.kind !== 'checksum');
  const primary = downloadAssets[0];
  const rest = downloadAssets.slice(1);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      id={`platform-${channel.id}`}
      className="scroll-mt-28 bg-white border border-carbon-20/90 rounded-3xl p-6 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all duration-300 space-y-4 relative overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-carbon-10 pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
            <MaterialIcon name={channel.icon} className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-carbon-90 text-base">{channel.title}</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-carbon-10 border border-carbon-20 text-carbon-80">
                {channel.badge}
              </span>
              <StatusChip state={state} />
            </div>
            <p className="text-xs text-carbon-60 mt-1 font-medium">{channel.requirements}</p>
          </div>
        </div>

        {primary && <AssetButton asset={primary} primary onDownload={onDownload} />}
      </div>

      <p className="text-xs text-carbon-60 leading-relaxed font-normal">{channel.description}</p>

      {/* Where the artifacts come from.
          This replaced the registry install command (`pip install hazardnet` /
          `npm install hazardnet`) that the page rendered while its own chip read
          "pending": the packages have never existed, so the command could not
          work and the two statements contradicted each other. HazardNet does not
          publish to a package registry (ADR 0011) — the card now states the
          distribution path that does exist. */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold text-carbon-90 flex items-center gap-2">
          <MaterialIcon name="inventory_2" className="w-3.5 h-3.5 text-carbon-60" />
          How this is distributed:
        </span>
        <p className="p-3.5 bg-carbon-05 border border-carbon-20/80 text-carbon-70 text-[11px] font-medium rounded-2xl leading-relaxed">
          {channel.distribution}
        </p>
      </div>

      {/* Live release assets */}
      {state.release && downloadAssets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {primary && <span className="text-[10px] font-mono font-extrabold text-carbon-60 uppercase tracking-wider">Release files:</span>}
          {rest.map((asset) => (
            <AssetButton key={asset.url} asset={asset} onDownload={onDownload} />
          ))}
          {checksum && (
            <a
              href={checksum.url}
              download
              rel="noopener noreferrer"
              onClick={() => onDownload(checksum)}
              className="px-3.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-bold font-mono transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              title="SHA-256 checksums for all release files"
            >
              <MaterialIcon name="verified_user" className="w-3.5 h-3.5" />
              SHA256SUMS.txt
            </a>
          )}
        </div>
      )}

      {/* Pending first release (or release lookups switched off for this deployment) */}
      {state.status === 'pending' && (
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-dashed border-amber-300 text-[11px] text-amber-950 font-medium space-y-2">
          <p className="flex items-center gap-2 font-extrabold">
            <MaterialIcon name="history" className="w-4 h-4" />
            Release pipeline prepared — no version published yet
          </p>
          <p className="leading-relaxed">
            {state.note}{' '}
            <a
              href={githubReleasesUrl(channel.repoSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold underline underline-offset-2"
            >
              {channel.repoSlug}/releases
            </a>{' '}
            · builds, signing and SHA-256 checksums are produced by the project's release automation.
          </p>
        </div>
      )}

      {/* API/rate-limit/network failure */}
      {state.status === 'unavailable' && (
        <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-[11px] text-rose-950 font-medium space-y-1.5">
          <p className="flex items-center gap-2 font-extrabold">
            <MaterialIcon name="warning" className="w-4 h-4" />
            Live release data unavailable
          </p>
          <p className="leading-relaxed">
            {state.note ?? 'Temporary lookup failure.'} Download files directly from the{' '}
            <a
              href={githubReleasesUrl(channel.repoSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-2"
            >
              GitHub releases page
            </a>
            .
          </p>
        </div>
      )}
    </motion.div>
  );
};

export const DownloadCenter: React.FC = () => {
  // Per-route <head>: see the note in frontend/src/hooks/usePageSeo.ts.
  usePageSeo('/download');
  const [searchParams] = useSearchParams();
  const platformParam = searchParams.get('platform');
  const [selectedTab, setSelectedTab] = useState<TabId>(
    platformParam && TAB_BY_CHANNEL[platformParam] ? TAB_BY_CHANNEL[platformParam] : 'software',
  );

  const channels = useMemo(() => resolveChannels(import.meta.env as Record<string, string | undefined>), []);
  // Release lookups are opt-in (ADR 0011): with no product repository published
  // yet, the default deployment makes no request from this page at all.
  const live = useMemo(
    () => liveReleaseLookupsEnabled(import.meta.env as Record<string, string | undefined>),
    [],
  );
  const states = useReleaseChannels(channels, live);

  // Deep links: /download?platform=<channel> switches to the right tab and
  // scrolls to the channel card (footer & About page links rely on this).
  useEffect(() => {
    if (!platformParam) return;
    const tab = TAB_BY_CHANNEL[platformParam];
    if (tab) setSelectedTab(tab);
    const timer = setTimeout(() => {
      const element = document.getElementById(`platform-${platformParam}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
    return () => clearTimeout(timer);
  }, [platformParam]);

  const tabs: { id: TabId; icon: string; label: string }[] = [
    { id: 'software', icon: 'download', label: 'Apps & Binaries' },
    { id: 'python', icon: 'python', label: 'Python SDK' },
    { id: 'npm', icon: 'code', label: 'JS / TS Library' },
  ];

  const channelsForTab = (tab: TabId) =>
    channels.filter((c) => TAB_BY_CHANNEL[c.id] === tab);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      {/* Hero Header */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden space-y-3">
        <div className="absolute top-0 left-0 w-full h-1 bg-nasa-red"></div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 text-amber-900 border border-amber-300 uppercase tracking-wider shadow-2xs">
            Open Software Center
          </span>
          <span className="text-carbon-30">•</span>
          <span className="text-xs text-carbon-60 font-semibold">HazardNet Software, Daemons & Libraries</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-brand font-black text-carbon-90 tracking-tight">
          Hazard<span className="text-nasa-red-shade">Net</span> Multi-Platform Downloads
        </h1>
        <p className="text-carbon-60 text-xs md:text-sm leading-relaxed max-w-3xl">
          Every artifact below is produced automatically by the HazardNet product repositories&apos; release
          pipelines — native Android and Windows apps, the Linux daemon/CLI, and the Python &amp; JavaScript libraries.
          Files are served straight from GitHub Releases with SHA-256 checksums attached to every release; nothing is
          hosted or proxied by this website. <strong className="text-carbon-80">HazardNet packages are not published
          to npm or PyPI</strong>, so no install command is offered and this page queries no package registry. Each
          card states its own state: a channel with no published release is marked <em>awaiting first release</em>{' '}
          rather than shown as downloadable.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2.5 border-b border-carbon-20/80 pb-3 text-xs font-bold overflow-x-auto scrollbar-none touch-scroll">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              selectedTab === tab.id
                ? 'bg-nasa-red text-carbon-black font-black shadow-md shadow-amber-500/20'
                : 'bg-white text-carbon-70 border border-carbon-20/90 hover:bg-carbon-05 shadow-2xs'
            }`}
          >
            <MaterialIcon name={tab.icon} className="w-4 h-4" /> {tab.label}
          </motion.button>
        ))}
      </div>

      {/* Channel cards per tab */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-5"
        >
          {channelsForTab(selectedTab).map((channel) => (
            <ChannelCard key={channel.id} channel={channel} state={states[channel.id]} />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Provenance & verification note */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-black text-carbon-90 flex items-center gap-2">
          <MaterialIcon name="verified_user" className="w-4 h-4 text-emerald-700" />
          Provenance &amp; Verification
        </h2>
        <ul className="text-xs text-carbon-60 leading-relaxed space-y-1.5 list-disc pl-4">
          <li>
            All native binaries and archives are produced by CI release workflows (see the{' '}
            <a
              href="https://github.com/myself-aas/HazardNet/tree/main/.github/workflow-templates"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-amber-700 hover:text-amber-900 underline underline-offset-2"
            >
              workflow templates
            </a>
            ) and attached to GitHub Releases — never built on this website.
          </li>
          <li>
            Each release ships a <span className="font-mono font-bold">SHA256SUMS.txt</span>; verify downloads against
            it before deployment (<span className="font-mono">sha256sum -c SHA256SUMS.txt</span>).
          </li>
          <li>Android builds are signed when release signing is configured; Windows installers are Authenticode-signed when a certificate is present.</li>
          <li>
            {/* Decision, not an omission (ADR 0011, owner 2026-09-19): HazardNet does not publish
                packages to npm or PyPI. This page previously queried both registries on every load —
                `hazardnet` returns 404 on each — and printed `pip install hazardnet` /
                `npm install hazardnet` next to a chip that read "pending", so the copy contradicted
                itself and the browser logged two failing requests per visit. The lookups and the
                install commands are gone; the Python SDK and the JavaScript library are distributed
                as source and build artifacts from their product repositories. */}
            The Python SDK and the JavaScript library are <strong>not</strong> published to PyPI or npm
            and carry no install command. Both are distributed as source and as the build artifacts
            their release workflow attaches to GitHub Releases, exactly like the native channels.
          </li>
        </ul>
      </div>
    </motion.div>
  );
};

export default DownloadCenter;
