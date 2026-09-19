import MaterialIcon from "./MaterialIcon";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFirebaseConnectivity, RTDBConnectionStatus } from '../hooks/useFirebaseConnectivity';

export type { RTDBConnectionStatus };

interface FirebaseRealtimeStatusProps {
  variant?: 'card' | 'badge' | 'compact';
  className?: string;
  showDetailsInitially?: boolean;
}

export const FirebaseRealtimeStatus: React.FC<FirebaseRealtimeStatusProps> = ({
  variant = 'card',
  className = '',
  showDetailsInitially = false,
}) => {
  const {
    isConnected,
    status,
    latency,
    serverTimeOffset,
    lastChecked,
    isPinging,
    errorMessage,
    databaseUrl,
    ping,
    reconnect,
  } = useFirebaseConnectivity();

  const [showTelemetry, setShowTelemetry] = useState<boolean>(showDetailsInitially);
  const dbName = 'hazardnet-aas48424-default-rtdb';

  const handleReconnect = () => {
    reconnect();
  };

  // Compact / Badge variant
  if (variant === 'badge') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
        status === 'connected'
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : status === 'connecting'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-rose-50 text-rose-800 border-rose-200'
      } ${className}`}>
        <span className="relative flex h-2 w-2">
          {status === 'connected' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${
            status === 'connected'
              ? 'bg-emerald-500'
              : status === 'connecting'
              ? 'bg-amber-500'
              : 'bg-rose-500'
          }`} />
        </span>
        <span>
          {status === 'connected'
            ? `RTDB Sync ${latency ? `(${latency}ms)` : ''}`
            : status === 'connecting'
            ? 'RTDB Connecting...'
            : 'RTDB Offline'}
        </span>
      </div>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
        status === 'connected'
          ? 'bg-emerald-50/70 border-emerald-200 text-carbon-80'
          : status === 'connecting'
          ? 'bg-amber-50/70 border-amber-200 text-carbon-80'
          : 'bg-rose-50/70 border-rose-200 text-carbon-80'
      } ${className}`}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {status === 'connected' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'
            }`} />
          </span>
          <div>
            <span className="font-bold text-carbon-90">Firebase Realtime DB</span>
            <span className="ml-1.5 text-[11px] text-carbon-60">
              {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Offline'}
            </span>
          </div>
        </div>
        {latency !== null && status === 'connected' && (
          <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
            {latency} ms
          </span>
        )}
      </div>
    );
  }

  // Full Card Variant for User Profile Menu
  return (
    <div className={`bg-carbon-05/90 border border-carbon-20 rounded-xl p-4 space-y-3 font-inter text-carbon-80 shadow-2xs ${className}`}>
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border shadow-2xs ${
            status === 'connected'
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
              : status === 'connecting'
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-rose-100 text-rose-900 border-rose-300'
          }`}>
            <MaterialIcon name="bolt" className="w-4 h-4 inline-block mr-1" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-extrabold text-carbon-90">Firebase Realtime Database Status</h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase border ${
                status === 'connected'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : status === 'connecting'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-rose-100 text-rose-900 border-rose-300'
              }`}>
                {status === 'connected' ? 'CONNECTED' : status === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'}
              </span>
            </div>
            <p className="text-[11px] text-carbon-60 mt-0.5">
              Live WebSocket synchronization telemetry for Realtime Database
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => ping()}
            disabled={isPinging}
            className="px-2.5 py-1 text-[11px] font-bold text-carbon-70 hover:text-carbon-90 bg-white hover:bg-carbon-10 border border-carbon-20 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
            title="Check round-trip latency to Firebase RTDB"
          >
            <span className={isPinging ? 'animate-spin' : ''}><MaterialIcon name="refresh" className="w-4 h-4 inline-block mr-1" /></span>
            <span className="hidden sm:inline">{isPinging ? 'Pinging...' : 'Ping'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTelemetry(!showTelemetry)}
            className="p-1.5 text-xs text-carbon-60 hover:text-carbon-90 bg-white hover:bg-carbon-10 border border-carbon-20 rounded-lg transition-colors cursor-pointer"
            title="Toggle Connection Telemetry Details"
          >
            {showTelemetry ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-white border border-carbon-20/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-carbon-60 uppercase tracking-wider">Live Connection</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="relative flex h-2 w-2">
              {status === 'connected' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'
              }`} />
            </span>
            <span className="font-extrabold text-carbon-90 text-xs">
              {status === 'connected' ? 'Active WebSocket' : status === 'connecting' ? 'Handshake...' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="bg-white border border-carbon-20/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-carbon-60 uppercase tracking-wider">Latency Ping</span>
          <div className="font-mono font-black text-carbon-90 text-xs mt-1">
            {latency !== null ? `${latency} ms` : '—'}
          </div>
        </div>

        <div className="bg-white border border-carbon-20/80 rounded-lg p-2 flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-carbon-60 uppercase tracking-wider">Last Check</span>
          <div className="font-mono text-xs font-semibold text-carbon-70 mt-1 truncate">
            {lastChecked || 'Initial loading'}
          </div>
        </div>
      </div>

      {/* Expanded Telemetry Details */}
      <AnimatePresence>
        {showTelemetry && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pt-1"
          >
            <div className="bg-white border border-carbon-20 rounded-lg p-3 space-y-2 text-[11px]">
              <div className="font-bold text-carbon-90 pb-1 border-b border-carbon-10 flex items-center justify-between">
                <span>Firebase RTDB Endpoint Specifications</span>
                <button
                  type="button"
                  onClick={handleReconnect}
                  className="text-[10px] font-extrabold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                >
                  Force Reconnect
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-carbon-60">
                <div>
                  <span className="text-carbon-60">Database ID:</span>{' '}
                  <span className="text-carbon-80 font-bold">{dbName}</span>
                </div>
                <div className="truncate">
                  <span className="text-carbon-60">Database URL:</span>{' '}
                  <span className="text-carbon-80 font-bold truncate" title={databaseUrl}>
                    {databaseUrl}
                  </span>
                </div>
                <div>
                  <span className="text-carbon-60">Protocol:</span>{' '}
                  <span className="text-carbon-80 font-bold">WebSocket / HTTPS WSS</span>
                </div>
                <div>
                  <span className="text-carbon-60">Server Clock Offset:</span>{' '}
                  <span className="text-carbon-80 font-bold">
                    {serverTimeOffset !== null ? `${serverTimeOffset > 0 ? '+' : ''}${serverTimeOffset} ms` : 'Syncing'}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 font-semibold mt-2 text-[10px]">
                  <MaterialIcon name="warning" className="w-4 h-4 inline-block mr-1" /> Error: {errorMessage}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FirebaseRealtimeStatus;
