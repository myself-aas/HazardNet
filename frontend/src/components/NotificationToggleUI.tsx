import MaterialIcon from './MaterialIcon';
import { NotificationIcon } from './ui/animated-state-icons';

export interface NotificationToggleUIProps {
  isOpen: boolean;
  isSubscribed: boolean;
  loading: boolean;
  statusMessage: string | null;
  isSupported: boolean;
  vapidKey: string;
  onToggleOpen: () => void;
  onClose: () => void;
  onTogglePush: () => void;
  onTestPush: () => void;
  variant?: 'default' | 'icon';
}

export const NotificationToggleUI: React.FC<NotificationToggleUIProps> = ({
  isOpen,
  isSubscribed,
  loading,
  statusMessage,
  isSupported,
  vapidKey,
  onToggleOpen,
  onClose,
  onTogglePush,
  onTestPush,
  variant = 'default',
}) => {
  return (
    <div className="relative inline-block text-left">
      {variant === 'icon' ? (
        <button
          onClick={onToggleOpen}
          className="w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
          title="Push Alerts"
        >
          <NotificationIcon size={20} className={isSubscribed ? "text-amber-600" : "text-slate-700"} duration={0} isState={isSubscribed} />
        </button>
      ) : (
        <button
          onClick={onToggleOpen}
          className={`px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-semibold ${
            isSubscribed
              ? 'bg-[#f9a825] text-white border-[#f9a825] hover:bg-[#d08305] shadow-xs'
              : 'bg-white/40 text-slate-800 border-slate-200/60 hover:bg-white/70 backdrop-blur-md'
          }`}
          title="Web Push Certificate & Emergency Alerts"
        >
          <NotificationIcon size={20} className={isSubscribed ? "text-white" : "text-slate-700"} duration={0} isState={isSubscribed} />
          <span className="hidden lg:inline">{isSubscribed ? 'Alerts Active' : 'Push Alerts'}</span>
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 z-[3000] text-slate-800 font-sans">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <MaterialIcon name="verified_user" className="text-[#d08305] text-lg" />
              <span className="font-bold text-sm text-slate-900">Web Push Certificates</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xs">
              <MaterialIcon name="close" className="text-sm" />
            </button>
          </div>

          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            Receive real-time disaster alerts, cyclone surges, and agricultural severity warnings via encrypted Web Push.
          </p>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 text-[11px]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-500 font-medium">VAPID Key Status:</span>
              <span className="font-mono text-emerald-600 font-semibold text-[10px]">VERIFIED</span>
            </div>
            <div className="font-mono text-[9px] text-slate-600 truncate bg-white p-1 rounded border border-slate-200">
              {vapidKey}
            </div>
          </div>

          {!isSupported ? (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs mb-3">
              <MaterialIcon name="warning" className="text-amber-600 text-base shrink-0" />
              <span>Web Push API is not supported in this browser environment.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={onTogglePush}
                disabled={loading}
                className={`w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  isSubscribed
                    ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
                    : 'bg-[#f9a825] text-white hover:bg-[#d08305] shadow-sm'
                }`}
              >
                <NotificationIcon size={18} duration={0} isState={!isSubscribed} />
                {loading ? 'Processing...' : isSubscribed ? 'Disable Push Alerts' : 'Enable Real-time Push Alerts'}
              </button>

              {isSubscribed && (
                <button
                  onClick={onTestPush}
                  disabled={loading}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 font-medium text-xs flex items-center justify-center gap-1.5 border border-slate-200"
                >
                  <MaterialIcon name="send" className="text-[#d08305] text-sm" />
                  <span>Send Test Emergency Alert</span>
                </button>
              )}
            </div>
          )}

          {statusMessage && (
            <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700 flex items-start gap-1.5">
              <MaterialIcon name="check_circle" className="text-emerald-600 text-sm shrink-0 mt-0.5" />
              <span className="leading-snug">{statusMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
