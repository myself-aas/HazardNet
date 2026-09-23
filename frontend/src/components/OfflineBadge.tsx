import { useEffect, useState } from 'react';

export const OfflineBadge: React.FC = () => {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/80 border border-amber-500/50 rounded-md text-amber-300 text-xs font-mono font-semibold">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
      <span>Offline Edge Mode Active</span>
    </div>
  );
};

export default OfflineBadge;