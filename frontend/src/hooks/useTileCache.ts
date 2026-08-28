import { useState, useEffect, useCallback, useRef } from 'react';
import { tileCacheService, CacheStats } from '../services/tileCacheService';
import { MAP_LAYERS, MapLayerKey } from './useLeafletMap';
import toast from 'react-hot-toast';

export interface UseTileCacheReturn {
  cacheStats: CacheStats;
  isOnline: boolean;
  isPreCaching: boolean;
  preCacheProgress: number;
  preCacheStatus: string;
  refreshStats: () => Promise<void>;
  downloadEmergencyBangladeshPack: (layerKey?: MapLayerKey) => Promise<void>;
  downloadDistrictEmergencyPack: (
    districtLat: number,
    districtLng: number,
    districtName: string,
    layerKey?: MapLayerKey
  ) => Promise<void>;
  clearCache: (layerKey?: MapLayerKey) => Promise<void>;
  cancelPreCache: () => void;
}

export function useTileCache(): UseTileCacheReturn {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    totalTiles: 0,
    totalSizeBytes: 0,
    formattedSize: '0 KB',
    layerBreakdown: {},
  });

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isPreCaching, setIsPreCaching] = useState<boolean>(false);
  const [preCacheProgress, setPreCacheProgress] = useState<number>(0);
  const [preCacheStatus, setPreCacheStatus] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refresh cache metrics
  const refreshStats = useCallback(async () => {
    try {
      const stats = await tileCacheService.getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      console.warn('Failed to fetch cache stats:', err);
    }
  }, []);

  // Monitor network connectivity changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Network Reconnected: Resuming live telemetry feeds', { duration: 3000 });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Network Offline: Switched to IndexedDB emergency tile store', { duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    refreshStats();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshStats]);

  // Cancel in-progress pre-cache download
  const cancelPreCache = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsPreCaching(false);
      setPreCacheStatus('Download cancelled');
      toast('Pre-cache download cancelled');
    }
  }, []);

  // Pre-cache all strategic quadrants of Bangladesh
  const downloadEmergencyBangladeshPack = useCallback(
    async (layerKey: MapLayerKey = 'esriSatellite') => {
      if (!navigator.onLine) {
        toast.error('Internet connection required to download offline emergency tiles.');
        return;
      }

      setIsPreCaching(true);
      setPreCacheProgress(0);
      setPreCacheStatus('Downloading Bangladesh Strategic Map Pack (Zoom 6–9)...');

      abortControllerRef.current = new AbortController();
      const config = MAP_LAYERS[layerKey] || MAP_LAYERS.esriSatellite;

      try {
        const { successCount, failCount } = await tileCacheService.preCacheBangladeshEmergencyPack(
          layerKey,
          config.url,
          (pct, count, total) => {
            setPreCacheProgress(pct);
            setPreCacheStatus(`Caching Bangladesh Tiles (${count}/${total})...`);
          },
          abortControllerRef.current.signal
        );

        await refreshStats();
        setIsPreCaching(false);
        setPreCacheProgress(100);
        setPreCacheStatus(`Complete: ${successCount} tiles cached in IndexedDB`);

        toast.success(`Bangladesh Offline Pack Ready: ${successCount} tiles saved in IndexedDB!`, {
          duration: 5000,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Pre-cache error:', err);
          setPreCacheStatus('Failed to download tiles');
          toast.error('Failed to pre-cache offline map pack.');
        }
        setIsPreCaching(false);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [refreshStats]
  );

  // Pre-cache high-resolution district tiles
  const downloadDistrictEmergencyPack = useCallback(
    async (
      districtLat: number,
      districtLng: number,
      districtName: string,
      layerKey: MapLayerKey = 'esriSatellite'
    ) => {
      if (!navigator.onLine) {
        toast.error('Internet connection required to download offline emergency tiles.');
        return;
      }

      setIsPreCaching(true);
      setPreCacheProgress(0);
      setPreCacheStatus(`Downloading HD Tiles for ${districtName} (Zoom 7–11)...`);

      abortControllerRef.current = new AbortController();
      const config = MAP_LAYERS[layerKey] || MAP_LAYERS.esriSatellite;

      try {
        const { successCount } = await tileCacheService.preCacheDistrictEmergencyPack(
          districtLat,
          districtLng,
          layerKey,
          config.url,
          (pct, count, total) => {
            setPreCacheProgress(pct);
            setPreCacheStatus(`Caching ${districtName} HD Tiles (${count}/${total})...`);
          },
          abortControllerRef.current.signal
        );

        await refreshStats();
        setIsPreCaching(false);
        setPreCacheProgress(100);
        setPreCacheStatus(`Complete: ${successCount} HD tiles cached for ${districtName}`);

        toast.success(`${districtName} HD Offline Pack Ready: ${successCount} tiles saved!`, {
          duration: 5000,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('District pre-cache error:', err);
          setPreCacheStatus('Download failed');
          toast.error(`Failed to pre-cache tiles for ${districtName}.`);
        }
        setIsPreCaching(false);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [refreshStats]
  );

  // Clear tiles from IndexedDB
  const clearCache = useCallback(
    async (layerKey?: MapLayerKey) => {
      try {
        await tileCacheService.clearTileCache(layerKey);
        await refreshStats();
        toast.success(layerKey ? `Cleared ${layerKey} offline tiles` : 'Cleared all IndexedDB offline map tiles');
      } catch (err) {
        console.error('Error clearing tile cache:', err);
        toast.error('Failed to clear tile cache');
      }
    },
    [refreshStats]
  );

  return {
    cacheStats,
    isOnline,
    isPreCaching,
    preCacheProgress,
    preCacheStatus,
    refreshStats,
    downloadEmergencyBangladeshPack,
    downloadDistrictEmergencyPack,
    clearCache,
    cancelPreCache,
  };
}
