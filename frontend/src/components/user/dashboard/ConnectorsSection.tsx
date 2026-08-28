import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import MaterialIcon from '../../MaterialIcon';
import {
  CONNECTOR_CATALOG,
  CONNECTOR_CATEGORIES,
  ConnectorDefinition,
  UserConnectorState,
  fetchUserConnectors,
  saveUserConnector,
} from '../../../lib/connectors';
import { Card, inputClass } from './ui';

/**
 * "Connectors" tab — one-click integrations between a HazardNet account and
 * external services (data sources, alert channels, productivity, developer
 * webhooks). Per-user state persists in the `user_connectors` table.
 */

const ConnectorCard: React.FC<{
  connector: ConnectorDefinition;
  state?: UserConnectorState;
  busy: boolean;
  onConnect: (connector: ConnectorDefinition, config: Record<string, string>) => void;
  onDisconnect: (connector: ConnectorDefinition) => void;
}> = ({ connector, state, busy, onConnect, onDisconnect }) => {
  const [configOpen, setConfigOpen] = useState(false);
  const [configValue, setConfigValue] = useState(state?.config?.[connector.asksFor?.key ?? ''] ?? '');
  const connected = state?.status === 'connected';

  const startConnect = () => {
    if (connector.asksFor && !configValue.trim()) {
      setConfigOpen(true);
      return;
    }
    onConnect(connector, connector.asksFor ? { [connector.asksFor.key]: configValue.trim() } : {});
  };

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border p-4 transition-all ${
        connected ? 'border-emerald-200 bg-emerald-50/40 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
      data-testid={`connector-${connector.key}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: connector.accent }}
        >
          <MaterialIcon name={connector.icon} size={20} />
        </span>
        {connected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
          </span>
        )}
      </div>
      <h4 className="mt-3 text-sm font-extrabold text-slate-900">{connector.name}</h4>
      <p className="mt-1 flex-1 text-[11.5px] leading-relaxed text-slate-500">{connector.tagline}</p>

      {connector.asksFor && configOpen && !connected && (
        <div className="mt-3 space-y-1.5">
          <label htmlFor={`connector-config-${connector.key}`} className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {connector.asksFor.label}
          </label>
          <input
            id={`connector-config-${connector.key}`}
            type={connector.asksFor.type ?? 'text'}
            placeholder={connector.asksFor.placeholder}
            value={configValue}
            onChange={(event) => setConfigValue(event.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDisconnect(connector)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-extrabold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={startConnect}
            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-extrabold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            {busy ? '…' : configOpen && connector.asksFor ? 'Save & connect' : 'Connect'}
          </button>
        )}
        <a
          href={connector.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Documentation"
          className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:text-slate-700"
        >
          <MaterialIcon name="info" size={13} />
        </a>
      </div>
      {connected && state?.connectedAt && (
        <p className="mt-1.5 text-[10px] text-slate-400">Since {new Date(state.connectedAt).toLocaleDateString()}</p>
      )}
    </div>
  );
};

export const ConnectorsSection: React.FC = () => {
  const { user } = useAuth();
  const [states, setStates] = useState<Record<string, UserConnectorState>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchUserConnectors(user?.uid ?? '').then((rows) => {
      if (cancelled) return;
      setStates(Object.fromEntries(rows.map((row) => [row.connectorKey, row])));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const connectedCount = useMemo(() => Object.values(states).filter((state) => state.status === 'connected').length, [states]);

  const handleConnect = async (connector: ConnectorDefinition, config: Record<string, string>) => {
    if (!user) return;
    setBusyKey(connector.key);
    try {
      await saveUserConnector(user.uid, connector.key, 'connected', config);
      setStates((current) => ({
        ...current,
        [connector.key]: { connectorKey: connector.key, status: 'connected', config, connectedAt: new Date().toISOString() },
      }));
      toast.success(`${connector.name} connected.`);
    } catch (error) {
      console.error(error);
      toast.error(`Could not connect ${connector.name}.`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleDisconnect = async (connector: ConnectorDefinition) => {
    if (!user) return;
    setBusyKey(connector.key);
    try {
      await saveUserConnector(user.uid, connector.key, 'disconnected');
      setStates((current) => {
        const next = { ...current };
        delete next[connector.key];
        return next;
      });
      toast.success(`${connector.name} disconnected.`);
    } catch (error) {
      console.error(error);
      toast.error(`Could not disconnect ${connector.name}.`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        title="Your integrations"
        subtitle="Wire HazardNet into the tools you already use — forecasts in, alerts out."
        icon={<MaterialIcon name="hub" size={18} />}
        actions={
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-extrabold text-slate-700">
            {connectedCount} connected
          </span>
        }
      >
        <p className="text-xs leading-relaxed text-slate-500">
          Connectors store only non-secret identifiers (webhook URLs, phone numbers) on your profile. Secrets for
          production pipelines live server-side. The built-in connectors — Open-Meteo and Email Digest — work out of
          the box.
        </p>
      </Card>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        CONNECTOR_CATEGORIES.map((category) => {
          const connectors = CONNECTOR_CATALOG.filter((connector) => connector.category === category);
          return (
            <section key={category}>
              <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{category}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {connectors.map((connector) => (
                  <ConnectorCard
                    key={connector.key}
                    connector={connector}
                    state={states[connector.key]}
                    busy={busyKey === connector.key}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};
