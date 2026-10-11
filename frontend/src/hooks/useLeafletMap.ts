import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { isValidLatLng, detectExactPinpointLocation, getDistrictBoundaryCoordinates } from '../services/geolocationService';
import { DistrictData } from '../data/bangladeshDistricts';

/**
 * One basemap, deliberately. The console used to offer six tile providers behind a
 * picker (and a "+" menu), and the choice changed nothing the reader needed: every
 * HazardNet layer draws on top of whichever ground is underneath. A single basemap
 * has no picker.
 *
 * 2026-10-05 (provider change): the ground moved from `tile.openstreetmap.org` to
 * OpenTopoMap. OSM's own tile servers were IP-blocking this deployment's requests
 * (its "Access blocked" interstitial) because an earlier build bulk-downloaded their
 * tiles — an IP block persists and cannot be lifted from code. OpenTopoMap renders
 * OpenStreetMap data on separate infrastructure, needs no API key, and is free for
 * on-demand use, so the map renders again while staying policy-compliant: tiles are
 * still loaded on demand through a plain L.tileLayer and the browser HTTP cache only.
 * Attribution keeps the OSM copyright ODbL requires, plus the OpenTopoMap style credit.
 */
export const MAP_LAYERS = {
  topoMap: {
    name: 'OpenTopoMap (OpenStreetMap data)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM · Map style &copy; OpenTopoMap (CC-BY-SA) · map lines delineate study areas and do not necessarily depict accepted national boundaries',
    maxZoom: 17,
  },
  esriSatellite: {
    name: 'Esri World Imagery (satellite)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Powered by Esri &mdash; Source: Esri, Maxar, Earthstar Geographics and the GIS User Community',
    maxZoom: 18,
  },
};

export type MapLayerKey = keyof typeof MAP_LAYERS;

/* ── The attribution, decoded once ────────────────────────────────────────────────────────────
   `attribution` above is written in HTML entities because Leaflet renders that string as HTML in
   its own corner control. The map's own footer prints the same credit as TEXT, and it used to do
   the decoding inline in JSX:

     MAP_LAYERS[activeLayer]?.attribution?.replace(/&copy;/g, ©).replace(/&mdash;/g, —)

   which built two RegExp literals and made two passes over a 170-character string on every render
   of the map, including the renders the marker and tile effects trigger — for two strings that
   cannot change (Vercel React guidance: `js-hoist-regexp`). The decode is a property of the data,
   so it lives here, next to the data, and happens once at module load.

   The `/g` flag is safe at module scope: `String.prototype.replace` resets `lastIndex`, so a shared
   global regex cannot carry state between calls. */

/** The sentence the map printed inline as its fallback, named once. */
export const DEFAULT_ATTRIBUTION_TEXT = 'Map data \u00A9 OpenStreetMap contributors';

const ENTITY_COPY_RE = /&copy;/g;
const ENTITY_MDASH_RE = /&mdash;/g;

/**
 * The attribution for each basemap as plain text, ready for a text surface rather than Leaflet's
 * HTML control: HTML entities decoded, and the named fallback where a layer carries none, so a
 * layer added without a credit still credits the map data.
 */
export const ATTRIBUTION_TEXT = Object.fromEntries(
  Object.entries(MAP_LAYERS).map(([key, layer]) => [
    key,
    (layer as { attribution?: string }).attribution
      ?.replace(ENTITY_COPY_RE, '\u00A9')
      .replace(ENTITY_MDASH_RE, '\u2014') || DEFAULT_ATTRIBUTION_TEXT,
  ]),
) as Record<MapLayerKey, string>;

export function attributionFor(key: MapLayerKey): string {
  return ATTRIBUTION_TEXT[key] || DEFAULT_ATTRIBUTION_TEXT;
}

/**
 * Layer actually used for a request (Phase 5: low-bandwidth mode).
 *
 * With a single basemap there is nothing to substitute — the function stays because
 * callers read the map through it, and so the day a second provider is ever argued
 * for, the low-bandwidth rule is already wired where it belongs.
 */
export function effectiveMapLayer(requested: MapLayerKey, _lowBandwidth?: boolean | null): MapLayerKey {
  return requested;
}

/* Tiles are requested by Leaflet's stock L.tileLayer and nothing else. The IndexedDB
   tile store was deleted on 2026-10-05: it fetched every tile twice (once to persist,
   once to display) and backed a bulk pre-cache of all of Bangladesh, which is exactly
   what the OpenStreetMap tile usage policy forbids for volunteer-run servers
   (osm.wiki/blocked). The browser's own HTTP cache is the only cache now, attribution
   stays visible under the map, and heavy or offline use belongs to a dedicated tile
   provider rather than to this service. */

export interface UseLeafletMapOptions {
  onMapClick?: (lat: number, lng: number) => void;
  onAutoLocateDistrict?: (district: DistrictData) => void;
  autoLocateEnabled?: boolean;
  /** Low-bandwidth mode (Phase 5). With the single OSM basemap there is no heavier
      provider to fall back from; the flag stays in the contract for the overlays. */
  lowBandwidth?: boolean;
  /**
   * Phase B (2026-10-05): fired when a basemap's tiles stop arriving (a run of
   * tile errors with no successful load). LiveMapView uses it to step the
   * satellite ground back to the street map and tell the user why. The hook
   * never switches layers itself; the component owns that state.
   */
  onBasemapDegraded?: (layerKey: MapLayerKey) => void;
}

export function useLeafletMap(
  mapContainerRef: React.RefObject<HTMLDivElement | null>,
  activeLayer: MapLayerKey = 'topoMap',
  options: UseLeafletMapOptions = {}
) {
  const { onMapClick, onAutoLocateDistrict, autoLocateEnabled = true, lowBandwidth = false } = options;
  const onBasemapDegradedRef = useRef(options.onBasemapDegraded);
  onBasemapDegradedRef.current = options.onBasemapDegraded;

  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const measureGroupRef = useRef<L.LayerGroup | null>(null);
  const riverGroupRef = useRef<L.LayerGroup | null>(null);
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
      // Native zoom stays: the "+" hazard-actions menu that carried zoom in/out was
      // deleted on 2026-10-05 (one control per job). Leaflet's control is keyboard-
      // reachable and its targets are widened to 44px in index.css.
      zoomControl: true,
      attributionControl: false,
    });

    const baseLayerKey = effectiveMapLayer(activeLayer, lowBandwidth);
    const config = MAP_LAYERS[baseLayerKey] || MAP_LAYERS.topoMap;
    // Plain L.tileLayer: Leaflet requests each tile once and the browser's HTTP cache
    // does the rest. No IndexedDB persistence, no pre-cache — that is what keeps this
    // page inside the OpenStreetMap tile usage policy.
    const tileLayer = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      opacity: 1.0,
      crossOrigin: true,
      // Names the layer in the DOM (`hn-tile-topoMap`) so the dark theme can
      // regrade the basemap without touching the tiles themselves.
      className: `hn-tile-${baseLayerKey}`,
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
          ? 'linear-gradient(135deg, #c01f1f 0%, #c01f1f 100%)'
          : isMod
          ? 'linear-gradient(135deg, #8a5a00 0%, #8a5a00 100%)'
          : 'linear-gradient(135deg, #1d7a3e 0%, #1d7a3e 100%)';

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
              font-family: var(--ap-font-display);
              cursor: pointer;
              transition: transform 0.2s ease;
              outline: none;
            ">
              ${pulseRing}
              <div style="font-size: 12px; font-weight: 900; line-height: 1; letter-spacing: -0.5px;">
                ${count}
              </div>
              <div style="font-size: 12px; font-weight: 800; opacity: 0.95; line-height: 1; margin-top: 1px; background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 4px;">
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
    inspectGroupRef.current = inspectGroup;

    // Automatic location request on first launch
    if (!hasAutoLocatedRef.current && autoLocateEnabled) {
      hasAutoLocatedRef.current = true;
      setIsLocatingUser(true);
      detectExactPinpointLocation()
        .then((result) => {
          setIsLocatingUser(false);
          // `method: 'fallback'` is not a location fix. The service returns a
          // hard-coded central-Bangladesh (Dhaka) placeholder when neither GPS
          // nor IP geolocation answered, and treating it as one published a
          // fake "Active Real-time GPS Position" and auto-selected Dhaka —
          // silently overriding any district the user picked (or that arrived
          // through `?district=<id>`) while the lookup was still running.
          if (!result || result.method === 'fallback') return;
          if (isValidLatLng(result.lat, result.lng)) {
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
      inspectGroupRef.current = null;
    };
  }, [mapContainerRef, autoLocateEnabled]);

  // Update base tile layer on layer switch
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    setIsProcessingData(true);
    const baseLayerKey = effectiveMapLayer(activeLayer, lowBandwidth);
    const config = MAP_LAYERS[baseLayerKey] || MAP_LAYERS.topoMap;

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const newTileLayer = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      opacity: 1.0,
      crossOrigin: true,
      className: `hn-tile-${baseLayerKey}`,
    }).addTo(mapInstanceRef.current);

    if ((newTileLayer as any).bringToBack) {
      (newTileLayer as any).bringToBack();
    }
    tileLayerRef.current = newTileLayer;

    // Degraded-tile watchdog: a run of tile errors with no successful load means
    // the provider is not answering this client (an outage or an IP block). Eight
    // consecutive failures is the threshold; a single clean load resets it.
    let errors = 0;
    let degraded = false;
    const onTileError = () => {
      if (degraded) return;
      errors += 1;
      if (errors >= 8) {
        degraded = true;
        onBasemapDegradedRef.current?.(baseLayerKey);
      }
    };
    const onTilesLoad = () => {
      errors = 0;
    };
    newTileLayer.on('tileerror', onTileError);
    newTileLayer.on('load', onTilesLoad);

    const timer = setTimeout(() => {
      setIsProcessingData(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [activeLayer, lowBandwidth]);

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
