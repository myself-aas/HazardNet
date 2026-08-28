import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { isValidLatLng, detectExactPinpointLocation, getDistrictBoundaryCoordinates } from '../services/geolocationService';
import { DistrictData } from '../data/bangladeshDistricts';
import { tileCacheService } from '../services/tileCacheService';

export const MAP_LAYERS = {
  esriSatellite: {
    name: 'Esri World Imagery (HD Satellite)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  esriClarity: {
    name: 'Esri Clarity (Ultra HD Vivid Satellite)',
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default/default/GoogleMapsCompatible/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri Clarity',
    maxZoom: 19,
  },
  cartoDark: {
    name: 'High Contrast Dark GIS',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OpenStreetMap',
    maxZoom: 19,
  },
  osmStandard: {
    name: 'OpenStreetMap (Street & Topo)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  esriShadedRelief: {
    name: 'Esri 3D Terrain Relief',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 17,
  },
  topoMap: {
    name: 'OpenTopoMap (Contours & Elevation)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM',
    maxZoom: 17,
  },
};

export type MapLayerKey = keyof typeof MAP_LAYERS;

// Custom Leaflet TileLayer subclass that checks IndexedDB first, caches network tiles on fetch, and handles offline mode gracefully
export function createCachedTileLayer(url: string, layerId: string, options: L.TileLayerOptions = {}): L.TileLayer {
  const CachedLayer = (L.TileLayer as any).extend({
    createTile(coords: any, done: (error?: any, tile?: HTMLElement) => void) {
      const tile = document.createElement('img');
      L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
      L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));

      if (this.options.crossOrigin || this.options.crossOrigin === '') {
        tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
      }
      tile.alt = '';
      tile.setAttribute('role', 'presentation');

      const tileUrl = this.getTileUrl(coords);
      const tileKey = tileCacheService.getTileKey(layerId, coords.z, coords.x, coords.y);

      // 1. Check IndexedDB store first
      tileCacheService
        .getTileBlob(tileKey)
        .then((blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            tile.src = objectUrl;
            const cleanUp = () => {
              URL.revokeObjectURL(objectUrl);
              tile.removeEventListener('load', cleanUp);
              tile.removeEventListener('error', cleanUp);
            };
            tile.addEventListener('load', cleanUp);
            tile.addEventListener('error', cleanUp);
          } else {
            // 2. Fetch from network & cache in IndexedDB in background
            fetch(tileUrl, {
              mode: 'cors',
              headers: { Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8' },
            })
              .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.blob();
              })
              .then((newBlob) => {
                tileCacheService.saveTileBlob(tileKey, tileUrl, layerId, coords.z, coords.x, coords.y, newBlob);
                const objectUrl = URL.createObjectURL(newBlob);
                tile.src = objectUrl;
                const cleanUp = () => {
                  URL.revokeObjectURL(objectUrl);
                  tile.removeEventListener('load', cleanUp);
                  tile.removeEventListener('error', cleanUp);
                };
                tile.addEventListener('load', cleanUp);
                tile.addEventListener('error', cleanUp);
              })
              .catch(() => {
                // Fallback directly to regular tile URL in case CORS fetch fails or offline
                tile.src = tileUrl;
              });
          }
        })
        .catch(() => {
          tile.src = tileUrl;
        });

      return tile;
    },
  });

  return new CachedLayer(url, {
    ...options,
    crossOrigin: true,
  });
}

export interface UseLeafletMapOptions {
  onMapClick?: (lat: number, lng: number) => void;
  onAutoLocateDistrict?: (district: DistrictData) => void;
  autoLocateEnabled?: boolean;
}

export function useLeafletMap(
  mapContainerRef: React.RefObject<HTMLDivElement | null>,
  activeLayer: MapLayerKey = 'esriSatellite',
  options: UseLeafletMapOptions = {}
) {
  const { onMapClick, onAutoLocateDistrict, autoLocateEnabled = true } = options;

  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const measureGroupRef = useRef<L.LayerGroup | null>(null);
  const riverGroupRef = useRef<L.LayerGroup | null>(null);
  const radarGroupRef = useRef<L.LayerGroup | null>(null);
  const inspectGroupRef = useRef<L.LayerGroup | null>(null);

  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: 23.8103,
    lng: 90.4125,
    zoom: 7,
  });
  const [isProcessingData, setIsProcessingData] = useState<boolean>(false);
  const [isLocatingUser, setIsLocatingUser] = useState<boolean>(false);
  const [userLocationError, setUserLocationError] = useState<string | null>(null);
  const [userGpsPos, setUserGpsPos] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const onAutoLocateDistrictRef = useRef(onAutoLocateDistrict);
  useEffect(() => {
    onAutoLocateDistrictRef.current = onAutoLocateDistrict;
  }, [onAutoLocateDistrict]);

  const hasAutoLocatedRef = useRef<boolean>(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.8103, 90.4125],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    });

    const config = MAP_LAYERS[activeLayer] || MAP_LAYERS.esriSatellite;
    const tileLayer = createCachedTileLayer(config.url, activeLayer, {
      maxZoom: config.maxZoom,
      opacity: 1.0,
      crossOrigin: true,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    const clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 52,
      disableClusteringAtZoom: 9,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      animate: true,
      animateAddingMarkers: false,
      iconCreateFunction: (cluster: any) => {
        const childMarkers = cluster.getAllChildMarkers();
        const count = childMarkers.length;
        let maxSev = 0;
        let sumSev = 0;
        let dominantHazard = 'Hazard';
        const districtNames: string[] = [];

        childMarkers.forEach((m: any) => {
          const d = m.districtData;
          if (d) {
            sumSev += (d.severity ?? 0);
            if ((d.severity ?? 0) > maxSev) {
              maxSev = d.severity ?? 0;
              dominantHazard = d.hazardType ?? 'Hazard';
            }
            if (d.name) districtNames.push(d.name);
          }
        });

        const maxSevPct = Math.round(maxSev * 100);
        const isHigh = maxSev >= 0.7;
        const isMod = maxSev >= 0.4 && maxSev < 0.7;

        const bgGradient = isHigh
          ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
          : isMod
          ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

        const glowColor = isHigh ? 'rgba(220, 38, 38, 0.65)' : isMod ? 'rgba(245, 158, 11, 0.65)' : 'rgba(16, 185, 129, 0.65)';
        const pulseRing = isHigh
          ? `<div class="cluster-pulse-ring" style="position: absolute; inset: -6px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); z-index: -1;"></div>`
          : '';

        const tooltipTitle = `${count} Districts: ${districtNames.slice(0, 4).join(', ')}${districtNames.length > 4 ? '...' : ''} | Max Severity: ${maxSevPct}% (${dominantHazard})`;
        const ariaLabel = `Cluster of ${count} districts including ${districtNames.slice(0, 3).join(', ')}, maximum severity ${maxSevPct}%, dominant hazard ${dominantHazard}`;

        return L.divIcon({
          html: `
            <div class="hazardnet-cluster-badge" tabindex="0" role="button" aria-label="${ariaLabel}" title="${tooltipTitle}" style="
              position: relative;
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background: ${bgGradient};
              border: 2.5px solid #ffffff;
              box-shadow: 0 4px 18px ${glowColor}, 0 2px 6px rgba(0,0,0,0.35);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: #ffffff;
              font-family: 'Playfair Display', serif;
              cursor: pointer;
              transition: transform 0.2s ease;
              outline: none;
            ">
              ${pulseRing}
              <div style="font-size: 13px; font-weight: 900; line-height: 1; letter-spacing: -0.5px;">
                ${count}
              </div>
              <div style="font-size: 8px; font-weight: 800; opacity: 0.95; line-height: 1; margin-top: 1px; background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 4px;">
                ${maxSevPct}%
              </div>
            </div>
          `,
          className: 'custom-hazardnet-cluster-icon',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
      },
    }).addTo(map);

    const measureGroup = L.layerGroup().addTo(map);
    const riverGroup = L.layerGroup().addTo(map);
    const radarGroup = L.layerGroup().addTo(map);
    const inspectGroup = L.layerGroup().addTo(map);

    const updateCoords = () => {
      const c = map.getCenter();
      setCurrentCoords({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };

    map.on('move', updateCoords);
    map.on('zoom', updateCoords);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(4));
      const lng = Number(e.latlng.lng.toFixed(4));
      if (onMapClickRef.current) {
        onMapClickRef.current(lat, lng);
      }
    });

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    markersGroupRef.current = markersGroup;
    clusterGroupRef.current = clusterGroup;
    measureGroupRef.current = measureGroup;
    riverGroupRef.current = riverGroup;
    radarGroupRef.current = radarGroup;
    inspectGroupRef.current = inspectGroup;

    // Automatic location request on first launch
    if (!hasAutoLocatedRef.current && autoLocateEnabled) {
      hasAutoLocatedRef.current = true;
      setIsLocatingUser(true);
      detectExactPinpointLocation()
        .then((result) => {
          setIsLocatingUser(false);
          if (result && isValidLatLng(result.lat, result.lng)) {
            setUserGpsPos({ lat: result.lat, lng: result.lng, accuracy: result.accuracyMeters });
            if (result.nearestDistrict && onAutoLocateDistrictRef.current) {
              onAutoLocateDistrictRef.current(result.nearestDistrict);
            }
            if (mapInstanceRef.current && result.nearestDistrict) {
              const boundaryCoords = getDistrictBoundaryCoordinates(result.nearestDistrict, result.lat, result.lng);
              if (boundaryCoords.length >= 3) {
                try {
                  const bounds = L.latLngBounds(boundaryCoords);
                  if (bounds.isValid()) {
                    mapInstanceRef.current.fitBounds(bounds.pad(0.35), { animate: true, duration: 1.5, maxZoom: 11 });
                  } else {
                    mapInstanceRef.current.flyTo([result.lat, result.lng], 11, { animate: true, duration: 1.5 });
                  }
                } catch {
                  mapInstanceRef.current.flyTo([result.lat, result.lng], 11, { animate: true, duration: 1.5 });
                }
              } else {
                mapInstanceRef.current.flyTo([result.lat, result.lng], 11, { animate: true, duration: 1.5 });
              }
            } else if (mapInstanceRef.current) {
              mapInstanceRef.current.flyTo([result.lat, result.lng], 11, { animate: true, duration: 1.5 });
            }
          }
        })
        .catch((err) => {
          console.warn('Auto-geolocation on initial launch failed:', err);
          setIsLocatingUser(false);
        });
    }

    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 300);

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (clusterGroupRef.current && mapInstanceRef.current) {
        clusterGroupRef.current.clearLayers();
        mapInstanceRef.current.removeLayer(clusterGroupRef.current);
      }
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markersGroupRef.current = null;
      clusterGroupRef.current = null;
      measureGroupRef.current = null;
      riverGroupRef.current = null;
      radarGroupRef.current = null;
      inspectGroupRef.current = null;
    };
  }, [mapContainerRef, autoLocateEnabled]);

  // Update base tile layer on layer switch
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    setIsProcessingData(true);
    const config = MAP_LAYERS[activeLayer] || MAP_LAYERS.esriSatellite;

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const newTileLayer = createCachedTileLayer(config.url, activeLayer, {
      maxZoom: config.maxZoom,
      opacity: 1.0,
      crossOrigin: true,
    }).addTo(mapInstanceRef.current);

    if ((newTileLayer as any).bringToBack) {
      (newTileLayer as any).bringToBack();
    }
    tileLayerRef.current = newTileLayer;

    const timer = setTimeout(() => {
      setIsProcessingData(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [activeLayer]);

  // Handler to center on user location manually
  const centerOnUserLocation = useCallback(async () => {
    setIsLocatingUser(true);
    setUserLocationError(null);
    try {
      const result = await detectExactPinpointLocation();
      const { lat, lng, nearestDistrict, accuracyMeters } = result;
      setUserGpsPos({ lat, lng, accuracy: accuracyMeters });
      setIsLocatingUser(false);

      if (nearestDistrict && onAutoLocateDistrictRef.current) {
        onAutoLocateDistrictRef.current(nearestDistrict);
      }

      if (mapInstanceRef.current) {
        if (nearestDistrict) {
          const boundaryCoords = getDistrictBoundaryCoordinates(nearestDistrict, lat, lng);
          if (boundaryCoords.length >= 3) {
            try {
              const bounds = L.latLngBounds(boundaryCoords);
              if (bounds.isValid()) {
                mapInstanceRef.current.fitBounds(bounds.pad(0.35), { animate: true, duration: 1.5, maxZoom: 11 });
              } else {
                mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
              }
            } catch {
              mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
            }
          } else {
            mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
          }
        } else {
          mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
        }
      }
      return result;
    } catch (err: any) {
      console.warn('Geolocation failed:', err);
      setUserLocationError(err?.message || 'Failed to detect location');
      setIsLocatingUser(false);
      throw err;
    }
  }, []);

  return {
    mapInstanceRef,
    tileLayerRef,
    markersGroupRef,
    clusterGroupRef,
    heatLayerRef,
    measureGroupRef,
    riverGroupRef,
    radarGroupRef,
    inspectGroupRef,
    currentCoords,
    setCurrentCoords,
    isProcessingData,
    setIsProcessingData,
    userGpsPos,
    setUserGpsPos,
    isLocatingUser,
    setIsLocatingUser,
    userLocationError,
    setUserLocationError,
    centerOnUserLocation,
  };
}
