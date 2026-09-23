// Client-Side Tile Caching Engine via IndexedDB for Offline Emergency GIS Access
// Enables complete blackout resilience for disaster response in flood and cyclone zones.

export interface CachedTileRecord {
  key: string; // unique tile key: `${layerId}_${z}_${x}_${y}`
  url: string;
  layerId: string;
  z: number;
  x: number;
  y: number;
  blob: Blob;
  timestamp: number;
  size: number;
}

export interface CacheStats {
  totalTiles: number;
  totalSizeBytes: number;
  formattedSize: string;
  layerBreakdown: Record<string, number>;
}

const DB_NAME = 'hazardnet_tile_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

class TileCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // Open / Initialize IndexedDB
  public async initDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB is not supported in this environment');
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('layerId', 'layerId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('z', 'z', { unique: false });
        }
      };

      request.onsuccess = (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
      };

      request.onerror = (event: Event) => {
        console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });

    return this.dbPromise;
  }

  // Generate standard tile key
  public getTileKey(layerId: string, z: number, x: number, y: number): string {
    return `${layerId}_${z}_${x}_${y}`;
  }

  // Retrieve tile blob from IndexedDB
  public async getTileBlob(key: string): Promise<Blob | null> {
    try {
      const db = await this.initDB();
      return new Promise<Blob | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const record = req.result as CachedTileRecord | undefined;
          if (record && record.blob) {
            resolve(record.blob);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => {
          resolve(null);
        };
      });
    } catch {
      return null;
    }
  }

  // Save tile blob into IndexedDB
  public async saveTileBlob(
    key: string,
    url: string,
    layerId: string,
    z: number,
    x: number,
    y: number,
    blob: Blob
  ): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: CachedTileRecord = {
          key,
          url,
          layerId,
          z,
          x,
          y,
          blob,
          timestamp: Date.now(),
          size: blob.size,
        };

        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Failed to store tile in IndexedDB:', err);
    }
  }

  // Format bytes into readable format (KB, MB)
  public formatBytes(bytes: number): string {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  // Query cache stats
  public async getCacheStats(): Promise<CacheStats> {
    try {
      const db = await this.initDB();
      return new Promise<CacheStats>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();

        let totalTiles = 0;
        let totalSizeBytes = 0;
        const layerBreakdown: Record<string, number> = {};

        req.onsuccess = (event: Event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const record = cursor.value as CachedTileRecord;
            totalTiles++;
            totalSizeBytes += record.size || 0;
            layerBreakdown[record.layerId] = (layerBreakdown[record.layerId] || 0) + 1;
            cursor.continue();
          } else {
            resolve({
              totalTiles,
              totalSizeBytes,
              formattedSize: this.formatBytes(totalSizeBytes),
              layerBreakdown,
            });
          }
        };

        req.onerror = () => {
          resolve({
            totalTiles: 0,
            totalSizeBytes: 0,
            formattedSize: '0 KB',
            layerBreakdown: {},
          });
        };
      });
    } catch {
      return {
        totalTiles: 0,
        totalSizeBytes: 0,
        formattedSize: '0 KB',
        layerBreakdown: {},
      };
    }
  }

  // Clear tiles from IndexedDB
  public async clearTileCache(layerId?: string): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        if (!layerId) {
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } else {
          const index = store.index('layerId');
          const req = index.openCursor(IDBKeyRange.only(layerId));
          req.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => reject(req.error);
        }
      });
    } catch (err) {
      console.warn('Failed to clear tile cache:', err);
    }
  }

  // Convert geographic coordinates to Web Mercator tile indices
  public latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return {
      x: Math.max(0, Math.min(n - 1, x)),
      y: Math.max(0, Math.min(n - 1, y)),
    };
  }

  // Format tile URL from template
  public formatTileUrl(template: string, z: number, x: number, y: number): string {
    const subdomains = ['a', 'b', 'c'];
    const s = subdomains[Math.abs(x + y) % subdomains.length];
    return template
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
      .replace('{s}', s)
      .replace('{r}', '');
  }

  // Calculate tile list for a geographic bounding box across zoom range
  public getTilesForBounds(
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    minZoom: number,
    maxZoom: number,
    layerId: string,
    urlTemplate: string
  ): { key: string; url: string; layerId: string; z: number; x: number; y: number }[] {
    const tiles: { key: string; url: string; layerId: string; z: number; x: number; y: number }[] = [];

    for (let z = minZoom; z <= maxZoom; z++) {
      const p1 = this.latLngToTile(bounds.maxLat, bounds.minLng, z);
      const p2 = this.latLngToTile(bounds.minLat, bounds.maxLng, z);

      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = this.getTileKey(layerId, z, x, y);
          const url = this.formatTileUrl(urlTemplate, z, x, y);
          tiles.push({ key, url, layerId, z, x, y });
        }
      }
    }

    return tiles;
  }

  // Batch download and pre-cache tiles in IndexedDB with concurrent workers
  public async preCacheTiles(
    tiles: { key: string; url: string; layerId: string; z: number; x: number; y: number }[],
    onProgress?: (pct: number, count: number, total: number) => void,
    abortSignal?: AbortSignal
  ): Promise<{ successCount: number; failCount: number }> {
    let completed = 0;
    let successCount = 0;
    let failCount = 0;
    const total = tiles.length;

    if (total === 0) {
      if (onProgress) onProgress(100, 0, 0);
      return { successCount: 0, failCount: 0 };
    }

    // Filter out tiles already cached to avoid redundant network transfers
    const unCachedTiles: typeof tiles = [];
    for (const t of tiles) {
      const existing = await this.getTileBlob(t.key);
      if (existing) {
        completed++;
        successCount++;
      } else {
        unCachedTiles.push(t);
      }
    }

    if (onProgress) {
      const initialPct = Math.round((completed / total) * 100);
      onProgress(initialPct, completed, total);
    }

    // Concurrency pool (6 parallel requests)
    const concurrency = 6;
    let index = 0;

    const worker = async () => {
      while (index < unCachedTiles.length) {
        if (abortSignal?.aborted) break;

        const tile = unCachedTiles[index++];
        if (!tile) break;

        try {
          const res = await fetch(tile.url, {
            mode: 'cors',
            signal: abortSignal,
            headers: { Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8' },
          });

          if (res.ok) {
            const blob = await res.blob();
            await this.saveTileBlob(tile.key, tile.url, tile.layerId, tile.z, tile.x, tile.y, blob);
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        } finally {
          completed++;
          if (onProgress) {
            const pct = Math.min(100, Math.round((completed / total) * 100));
            onProgress(pct, completed, total);
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, unCachedTiles.length) }, () => worker());
    await Promise.all(workers);

    return { successCount, failCount };
  }

  // Pre-cache all strategic Bangladesh map quadrants (zoom 6-9) for emergency blackout offline resilience
  public async preCacheBangladeshEmergencyPack(
    layerId: string,
    urlTemplate: string,
    onProgress?: (pct: number, count: number, total: number) => void,
    abortSignal?: AbortSignal
  ): Promise<{ successCount: number; failCount: number }> {
    // Bangladesh geographic bounding box with buffer
    const bdBounds = {
      minLat: 20.4,
      maxLat: 26.8,
      minLng: 88.0,
      maxLng: 92.8,
    };

    const tiles = this.getTilesForBounds(bdBounds, 6, 9, layerId, urlTemplate);
    return this.preCacheTiles(tiles, onProgress, abortSignal);
  }

  // Pre-cache high-resolution district tiles (zoom 7-11) for active local response
  public async preCacheDistrictEmergencyPack(
    lat: number,
    lng: number,
    layerId: string,
    urlTemplate: string,
    onProgress?: (pct: number, count: number, total: number) => void,
    abortSignal?: AbortSignal
  ): Promise<{ successCount: number; failCount: number }> {
    // District ~50km bounding box
    const distBounds = {
      minLat: Math.max(20.0, lat - 0.45),
      maxLat: Math.min(27.0, lat + 0.45),
      minLng: Math.max(88.0, lng - 0.45),
      maxLng: Math.min(93.0, lng + 0.45),
    };

    const tiles = this.getTilesForBounds(distBounds, 7, 11, layerId, urlTemplate);
    return this.preCacheTiles(tiles, onProgress, abortSignal);
  }
}

export const tileCacheService = new TileCacheService();
