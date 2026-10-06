import { useState } from 'react';
import MaterialIcon from './MaterialIcon';
import { Button } from './apple/primitives';
import { useFirebaseConnectivity, type RTDBConnectionStatus } from '../hooks/useFirebaseConnectivity';

export type { RTDBConnectionStatus };

/**
 * Realtime Database connectivity for the signed-in profile: a status row, the latency reading and
 * the two controls that act on it.
 *
 * It used to render three variants of a coloured widget (a green/amber/rose card, badge and compact
 * strip) with a ping glyph and a `rounded-xl` box per metric. On `/profile` that meant a second
 * bordered box with a second radius inside the profile page's own cards, and its hues were chrome
 * borrowed from the severity palette for a connection state — the thing the 2026-10-06 pass removed
 * everywhere else on the two signed-in surfaces. Status is now an icon and a word; the numbers are
 * mono data; the controls are the system's secondary pill. There was exactly one consumer
 * (`/profile`), so the variant prop went with the variants.
 */
export const FirebaseRealtimeStatus: React.FC<{ className?: string }> = ({ className = '' }) => {
  const {
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

  const [showTelemetry, setShowTelemetry] = useState(false);

  const label =
    status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Offline';
  const glyph =
    status === 'connected' ? 'check_circle' : status === 'connecting' ? 'hourglass_top' : 'cloud_off';

  return (
    <div className={`space-y-4 ${className}`}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-carbon-60">Connection</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-carbon-90">
            <MaterialIcon name={glyph} size={16} className="text-carbon-70" />
            {label}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-carbon-60">Round-trip latency</dt>
          <dd className="mt-0.5 font-mono text-sm text-carbon-90">
            {latency !== null ? `${latency} ms` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-carbon-60">Last check</dt>
          <dd className="mt-0.5 truncate font-mono text-sm text-carbon-90">
            {lastChecked || 'Waiting for the first check'}
          </dd>
        </div>
      </dl>

      {errorMessage && (
        <p role="alert" className="text-sm font-semibold text-ap-link">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-carbon-10 pt-4">
        <Button intent="secondary" size="sm" onClick={() => ping()} disabled={isPinging}>
          <MaterialIcon name="refresh" size={14} />
          {isPinging ? 'Pinging…' : 'Check latency'}
        </Button>
        <Button intent="secondary" size="sm" onClick={reconnect}>
          Force reconnect
        </Button>
        <Button
          intent="secondary"
          size="sm"
          onClick={() => setShowTelemetry((open) => !open)}
          aria-expanded={showTelemetry}
        >
          {showTelemetry ? 'Hide connection details' : 'Connection details'}
        </Button>
      </div>

      {showTelemetry && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-carbon-10 pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-carbon-60">Database URL</dt>
            <dd className="mt-0.5 truncate font-mono text-sm text-carbon-90" title={databaseUrl}>
              {databaseUrl}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-carbon-60">Protocol</dt>
            <dd className="mt-0.5 font-mono text-sm text-carbon-90">WebSocket / HTTPS WSS</dd>
          </div>
          <div>
            <dt className="text-sm text-carbon-60">Server clock offset</dt>
            <dd className="mt-0.5 font-mono text-sm text-carbon-90">
              {serverTimeOffset !== null
                ? `${serverTimeOffset > 0 ? '+' : ''}${serverTimeOffset} ms`
                : 'Syncing'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
};

export default FirebaseRealtimeStatus;
