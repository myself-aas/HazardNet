import MaterialIcon from "../components/MaterialIcon";
import React from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import { DownloadDoneIcon, SuccessIcon } from '../components/ui/animated-state-icons';

interface PlatformSoftware {
  id: string;
  name: string;
  platform: string;
  version: string;
  fileSize: string;
  icon: string;
  badge: string;
  description: string;
  sha256: string;
  downloadFilename: string;
  requirements: string;
}

const PLATFORMS: PlatformSoftware[] = [
  {
    id: 'android',
    name: 'HazardNet Field Agent Mobile App',
    platform: 'Android',
    version: 'v1.4.2 (APK)',
    fileSize: '18.4 MB',
    icon: 'android',
    badge: 'Field Ready',
    description: 'Offline-first Android app for agricultural extension officers and emergency responders with offline district map caching, GPS location geotagging, and local Wasm model execution.',
    sha256: 'a9f8b7c6d5e4f3a2b109876543210fedcba9876543210fedcba9876543210fed',
    downloadFilename: 'hazardnet-android-v1.4.2.apk',
    requirements: 'Android 8.0 (API 26) or higher • 100MB storage • GPS enabled'
  },
  {
    id: 'windows',
    name: 'HazardNet Desktop GIS Workstation',
    platform: 'Windows',
    version: 'v1.0.1 (.msi)',
    fileSize: '42.8 MB',
    icon: 'windows',
    badge: 'Desktop GUI',
    description: 'Standalone Windows desktop suite for high-resolution GeoTIFF tile batch processing, multi-layer GIS composition, and DirectML GPU accelerated hazard inference.',
    sha256: 'b123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    downloadFilename: 'hazardnet-windows-x64-v1.0.1.msi',
    requirements: 'Windows 10/11 64-bit • 4GB RAM • DirectX 12 compatible GPU'
  },
  {
    id: 'linux',
    name: 'HazardNet Headless Daemon & CLI',
    platform: 'Linux',
    version: 'v1.0.1 (.deb / .tar.gz)',
    fileSize: '12.6 MB',
    icon: 'linux',
    badge: 'Server Daemon',
    description: 'Headless Linux binary and systemd service daemon for automated Sentinel-1/2 tile pipeline ingestion, Prometheus metrics export, and REST API serving.',
    sha256: 'c89abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345',
    downloadFilename: 'hazardnet-daemon-amd64_1.0.1_linux.deb',
    requirements: 'Ubuntu 20.04+ / Debian 11+ / RHEL 8+ • x86_64 or ARM64'
  },
  {
    id: 'python',
    name: 'HazardNet Python PyPI Package',
    platform: 'Python PyPI',
    version: 'v1.0.1 (pip)',
    fileSize: '1.2 MB',
    icon: 'python',
    badge: 'SDK / API',
    description: 'Python library for downloading satellite granules, constructing 15-channel raster tensors, running ONNX/TFLite model evaluation, and calculating physical severity indexes.',
    sha256: 'd0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde',
    downloadFilename: 'hazardnet-1.0.1-py3-none-any.whl',
    requirements: 'Python 3.9+ • NumPy >= 1.22 • Rasterio >= 1.3 • tflite-runtime'
  }
];

export const DownloadCenter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const platformParam = searchParams.get('platform');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('software');

  useEffect(() => {
    if (platformParam) {
      const element = document.getElementById(`platform-${platformParam}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [platformParam]);

  const handleSimulatedDownload = (filename: string, id: string) => {
    setDownloadingId(id);
    setDownloadSuccess(null);

    setTimeout(() => {
      setDownloadingId(null);
      setDownloadSuccess(filename);

      // Create dummy file download blob
      const dummyContent = `HazardNet AI Package: ${filename}\nVersion: 1.0.1\nHazardNet Open Release 2026\nhttps://github.com/hazardnet/hazardnet-ai\n`;
      const blob = new Blob([dummyContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1200);
  };

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
        <div className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]"></div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 text-amber-900 border border-amber-300 uppercase tracking-wider shadow-2xs">
            Open Software Center
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500 font-semibold">HazardNet Software & Tools</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-brand font-black text-slate-900 tracking-tight">
          Hazard<span className="text-[#d08305]">Net</span> Multi-Platform Software & Model Downloads
        </h1>
        <p className="text-slate-600 text-xs md:text-sm leading-relaxed max-w-3xl">
          Download native mobile apps, desktop workstation binaries, server daemons, Python SDKs, and pre-trained FP32/INT8 TFLite neural network models for offline edge evaluation.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3 text-xs font-bold overflow-x-auto scrollbar-none touch-scroll">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSelectedTab('software')}
          className={`px-4 py-2.5 rounded-xl transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer ${
            selectedTab === 'software'
              ? 'bg-[#f9a825] text-slate-950 font-black shadow-md shadow-amber-500/20'
              : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          <MaterialIcon name="android" className="w-4 h-4" /> Native Applications & Mobile Apps
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSelectedTab('python')}
          className={`px-4 py-2.5 rounded-xl transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer ${
            selectedTab === 'python'
              ? 'bg-[#f9a825] text-slate-950 font-black shadow-md shadow-amber-500/20'
              : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          <MaterialIcon name="code" className="w-4 h-4" /> Python SDK & CLI
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setSelectedTab('models')}
          className={`px-4 py-2.5 rounded-xl transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer ${
            selectedTab === 'models'
              ? 'bg-[#f9a825] text-slate-950 font-black shadow-md shadow-amber-500/20'
              : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 shadow-2xs'
          }`}
        >
                <MaterialIcon name="ai_advisor" className="w-4 h-4" /> Hosted Inference

        </motion.button>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {downloadSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center justify-between gap-3 shadow-md"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-emerald-600 shrink-0"><SuccessIcon isState={true} size={24} /></span>
              <div>
                <p className="font-extrabold text-sm">Download initialized for <span className="font-mono bg-emerald-100/80 px-2 py-0.5 rounded-md">{downloadSuccess}</span>!</p>
                <p className="text-[11px] text-emerald-800 font-medium">Check your browser downloads folder. Verify SHA-256 hash before deployment.</p>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* Tab 1: Native Applications */}
        {selectedTab === 'software' && (
          <motion.div
            key="software"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {PLATFORMS.map((item) => (
              <motion.div
                whileHover={{ y: -3 }}
                key={item.id}
                id={`platform-${item.id}`}
                className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all duration-300 space-y-4 relative overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs">
                      <MaterialIcon name={item.icon} className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-slate-900 text-base">{item.name}</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-slate-100 border border-slate-200 text-slate-800">
                          {item.version}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-100 text-amber-950">
                          {item.fileSize}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-medium">{item.requirements}</p>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSimulatedDownload(item.downloadFilename, item.id)}
                    disabled={downloadingId === item.id}
                    className="px-5 py-2.5 rounded-xl bg-[#f9a825] hover:bg-[#d08305] text-slate-950 text-xs font-black transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {downloadingId === item.id ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                        <span>Preparing Package...</span>
                      </>
                    ) : (
                      <>
                        <DownloadDoneIcon isState={downloadSuccess === item.downloadFilename} size={18} duration={0} />
                        <span>Download {item.platform}</span>
                      </>
                    )}
                  </motion.button>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  {item.description}
                </p>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 overflow-x-auto shadow-2xs">
                  <span className="font-extrabold text-slate-700 shrink-0">SHA-256 Checksum:</span>
                  <span className="select-all font-mono truncate text-slate-800 font-semibold">{item.sha256}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Tab 2: Python SDK */}
        {selectedTab === 'python' && (
          <motion.div
            key="python"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-slate-200/90 rounded-3xl p-6 md:p-8 shadow-md space-y-6"
          >
            <div className="flex items-center gap-3.5">
              <span className="text-3xl p-2 rounded-2xl bg-amber-50 border border-amber-200"><MaterialIcon name="code" className="w-4 h-4" /></span>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">HazardNet Python PyPI SDK (`hazardnet`)</h2>
                <p className="text-xs text-slate-500 font-medium">Official Python client for tensor construction and TFLite inference</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-900">Installation via pip:</label>
              <div className="p-4 bg-slate-950 text-amber-400 font-mono text-xs rounded-2xl flex items-center justify-between select-all shadow-md border border-slate-800">
                <span className="font-bold">pip install hazardnet --upgrade</span>
                <span className="text-slate-400 text-[10px] font-semibold bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">PyPI v1.0.1</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-900">Quickstart Example Code:</label>
              <pre className="p-4 sm:p-5 bg-slate-950 text-slate-200 font-mono text-xs rounded-2xl overflow-x-auto leading-relaxed border border-slate-800 shadow-lg">
{`import hazardnet as hn

# 1. Load 15-channel GeoTIFF satellite tensor
tensor = hn.load_geotiff("sylhet_sentinel_15band.tif")

# 2. Initialize TFLite FP32 model engine
model = hn.HazardNetEngine(model_type="fp32")

# 3. Predict classification and continuous severity index
result = model.predict(tensor)

print(f"Detected Hazard: {result.hazard_class}")
print(f"Physical Severity Index: {result.severity_index:.4f}")
print(f"72-hr Agronomic Advisory: {result.get_advisory()}")`}
              </pre>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <a
                  href="https://github.com/hazardnet/hazardnet-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <MaterialIcon name="github" className="w-4 h-4 text-white" /> View Python SDK Source on GitHub
                </a>
              </motion.div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </motion.div>
  );
};

export default DownloadCenter;
