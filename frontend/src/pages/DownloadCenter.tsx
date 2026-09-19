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
  githubRepoUrl,
  githubReleasesUrl,
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

/** Copy-to-clipboard button with transient confirmation state. */
const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    toast.success(`${label ?? 'Command'} copied to clipboard`, { duration: 1800 });
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
      aria-label={`Copy ${label ?? 'command'} to clipboard`}
      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold font-mono transition-all cursor-pointer flex items-center gap-1.5"
    >
      <MaterialIcon name={copied ? 'check' : 'content_copy'} className="w-3.5 h-3.5" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
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
        ? 'px-5 py-2.5 rounded-xl bg-nasa-red hover:bg-nasa-red-shade text-slate-950 text-xs font-black transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer'
        : 'px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-[11px] font-bold font-mono transition-all flex items-center gap-1.5 shrink-0 cursor-pointer'
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
    const label = state.release?.tagName ?? (state.registry ? `v${state.registry.version}` : '');
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-50 border border-emerald-200 text-emerald-900">
        {label || 'Latest'}
      </span>
    );
  }
  if (state.status === 'loading') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-slate-100 border border-slate-200 text-slate-600 flex items-center gap-1.5">
        <span className="w-2 h-2 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
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
  const registryReady = state.registry?.verified === true;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      id={`platform-${channel.id}`}
      className="scroll-mt-28 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all duration-300 space-y-4 relative overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
            <MaterialIcon name={channel.icon} className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-slate-900 text-base">{channel.title}</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-slate-100 border border-slate-200 text-slate-800">
                {channel.badge}
              </span>
              <StatusChip state={state} />
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">{channel.requirements}</p>
          </div>
        </div>

        {primary && <AssetButton asset={primary} primary onDownload={onDownload} />}
      </div>

      <p className="text-xs text-slate-600 leading-relaxed font-normal">{channel.description}</p>

      {/* Registry install command (Python / npm channels) */}
      {channel.installCommand && (
        <div className="space-y-2">
          <label className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
            <MaterialIcon name="terminal" className="w-3.5 h-3.5 text-slate-500" />
            Install from {channel.pypiName ? 'PyPI' : 'npm'}:
          </label>
          <div className="p-3.5 bg-slate-950 text-amber-400 font-mono text-xs rounded-2xl flex items-center justify-between gap-3 select-all shadow-md border border-slate-800">
            <span className="font-bold truncate">$ {channel.installCommand}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-slate-400 text-[10px] font-semibold bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                {registryReady && state.registry
                  ? `${state.registry.registry === 'pypi' ? 'PyPI' : 'npm'} v${state.registry.version}`
                  : channel.pypiName
                    ? 'PyPI: pending'
                    : 'npm: pending'}
              </span>
              <CopyButton text={channel.installCommand} label="Install command" />
            </div>
          </div>
          {registryReady && state.registry && (
            <a
              href={state.registry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 hover:text-amber-900 underline-offset-4 hover:underline"
            >
              <MaterialIcon name="public" className="w-3.5 h-3.5" />
              View on {state.registry.registry === 'pypi' ? 'PyPI' : 'npm'} ({state.registry.name} v{state.registry.version})
            </a>
          )}
        </div>
      )}

      {/* Live release assets */}
      {state.release && downloadAssets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {primary && <span className="text-[10px] font-mono font-extrabold text-slate-500 uppercase tracking-wider">Release files:</span>}
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

      {/* Ready on registry but no GitHub assets attached yet */}
      {state.status === 'ready' && !state.release && (
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 font-medium">
          Published to its registry; standalone release files (sdist/wheel archives, checksums) appear here once the
          product repository tags its next <span className="font-mono font-bold">vX.Y.Z</span> release.
        </div>
      )}

      {/* Pending first release */}
      {state.status === 'pending' && (
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-dashed border-amber-300 text-[11px] text-amber-950 font-medium space-y-2">
          <p className="flex items-center gap-2 font-extrabold">
            <MaterialIcon name="history" className="w-4 h-4" />
            Release pipeline prepared — no version published yet
          </p>
          <p className="leading-relaxed">
            This section activates automatically once{' '}
            <a
              href={githubRepoUrl(channel.repoSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold underline underline-offset-2"
            >
              {channel.repoSlug}
            </a>{' '}
            publishes its first strict-semver tag. Builds, signing and SHA-256 checksums are produced by the{' '}
            <a
              href={channel.workflowTemplate}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-2"
            >
              HazardNet release workflow template
            </a>
            .
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
  const states = useReleaseChannels(channels);

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
    { id: 'npm', icon: 'code', label: 'npm Library' },
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
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden space-y-3">
        <div className="absolute top-0 left-0 w-full h-1 bg-nasa-red"></div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 text-amber-900 border border-amber-300 uppercase tracking-wider shadow-2xs">
            Open Software Center
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500 font-semibold">HazardNet Software, Daemons & Libraries</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-brand font-black text-slate-900 tracking-tight">
          Hazard<span className="text-nasa-red-shade">Net</span> Multi-Platform Downloads
        </h1>
        <p className="text-slate-600 text-xs md:text-sm leading-relaxed max-w-3xl">
          Every artifact below is produced automatically by the HazardNet product repositories&apos; release
          pipelines — native Android and Windows apps, the Linux daemon/CLI, and the Python &amp; JavaScript libraries.
          Files are served straight from GitHub Releases and the public package registries, with SHA-256 checksums
          attached to every release. Each card states its own live state: a card whose registry or release lookup
          has not returned a listing is marked <em>pending</em> or <em>temporarily unavailable</em> rather than shown
          as downloadable.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3 text-xs font-bold overflow-x-auto scrollbar-none touch-scroll">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              selectedTab === tab.id
                ? 'bg-nasa-red text-slate-950 font-black shadow-md shadow-amber-500/20'
                : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
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
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <MaterialIcon name="verified_user" className="w-4 h-4 text-emerald-700" />
          Provenance &amp; Verification
        </h2>
        <ul className="text-xs text-slate-600 leading-relaxed space-y-1.5 list-disc pl-4">
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
            {/* This sentence used to assert publication ("are published to PyPI and npm") while the
                registry chips on the same screen read "pending" — the two contradicted each other and
                a reader could not tell which was true. The copy now describes what the page actually
                does (checks the registries live and verifies ownership) and leaves the state to the
                chip, which is the thing backed by a lookup. */}
            The Python SDK and JavaScript library are checked against the PyPI and npm registries on
            load: a listing is shown only when the registry returns it <em>and</em> it names a HazardNet
            source repository. A <span className="font-mono font-bold">pending</span> state means the
            registry returned no listing yet, so the install command below is not usable at that time.
          </li>
        </ul>
      </div>
    </motion.div>
  );
};

export default DownloadCenter;
