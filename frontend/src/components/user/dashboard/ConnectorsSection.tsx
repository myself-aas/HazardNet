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
import { Button } from '../../apple/primitives';
import { Panel, inputClass } from './ui';
import { useI18n } from '../../../hooks/useI18n';

/**
 * "Connectors" tab — one-click integrations between a HazardNet account and
 * external services (data sources, alert channels, productivity, developer
 * webhooks). Per-user state persists in the `user_connectors` table.
 *
 * Each connector is one bordered cell; the cells sit directly on the page under
 * a category heading, so there is no card row inside a card. The provider
 * accent colour is gone: twenty inline hexes meant twenty brands' palettes
 * asserting themselves over the one accent this product has, and the icon and
 * the name already identify the provider.
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
  const { formatDate } = useI18n();

  const startConnect = () => {
    if (connector.asksFor && !configValue.trim()) {
      setConfigOpen(true);
      return;
    }
    onConnect(connector, connector.asksFor ? { [connector.asksFor.key]: configValue.trim() } : {});
  };

  return (
    <div
      className={`flex flex-col border p-5 ${connected ? 'border-carbon-30 bg-carbon-05' : 'border-carbon-20 bg-white'}`}
      data-testid={`connector-${connector.key}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center bg-carbon-05 text-carbon-70">
          <MaterialIcon name={connector.icon} size={20} />
        </span>
        {connected && (
          <span className="text-xs font-semibold text-carbon-60">
            Connected{state?.connectedAt ? ` · ${formatDate(state.connectedAt)}` : ''}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-bold text-carbon-90">{connector.name}</h3>
      <p className="mt-1 flex-1 text-sm leading-[1.62] text-carbon-70">{connector.tagline}</p>

      {connector.asksFor && configOpen && !connected && (
        <div className="mt-4 space-y-1.5">
          <label
            htmlFor={`connector-config-${connector.key}`}
            className="text-sm font-semibold text-carbon-80"
          >
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

      <div className="mt-4 flex items-center gap-2">
        {connected ? (
          <Button size="sm" disabled={busy} onClick={() => onDisconnect(connector)} className="flex-1">
            Disconnect
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={startConnect} className="flex-1">
            {busy ? 'Working…' : configOpen && connector.asksFor ? 'Save & connect' : 'Connect'}
          </Button>
        )}
        <a
          href={connector.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ap-btn ap-btn-secondary"
        >
          <MaterialIcon name="info" size={14} />
          Docs
        </a>
      </div>
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

  const connectedCount = useMemo(
    () => Object.values(states).filter((state) => state.status === 'connected').length,
    [states],
  );

  const handleConnect = async (connector: ConnectorDefinition, config: Record<string, string>) => {
    if (!user) return;
    setBusyKey(connector.key);
    try {
      await saveUserConnector(user.uid, connector.key, 'connected', config);
      setStates((current) => ({
        ...current,
        [connector.key]: {
          connectorKey: connector.key,
          status: 'connected',
          config,
          connectedAt: new Date().toISOString(),
        },
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
    <div className="space-y-6">
      <Panel title="Your integrations" description={`${connectedCount} connected. Forecasts in, alerts out.`}>
        <p className="max-w-prose text-sm leading-[1.62] text-carbon-70">
          Connect an account to receive hazard alerts where you already work, or to pull your own data into HazardNet.
          Connectors store only non-secret identifiers such as a webhook URL or a phone number; secrets for production
          pipelines stay server-side. The built-in weather and email-digest connectors work without setup.
        </p>
      </Panel>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading connectors">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse bg-carbon-10" />
          ))}
        </div>
      ) : (
        CONNECTOR_CATEGORIES.map((category) => {
          const connectors = CONNECTOR_CATALOG.filter((connector) => connector.category === category);
          return (
            <section key={category} className="space-y-3">
              <h2 className="text-lg font-bold tracking-tight text-carbon-90">{category}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

export default ConnectorsSection;
