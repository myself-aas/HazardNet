import MaterialIcon from "./MaterialIcon";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapToolbar, { type MapViewMode } from './map/MapToolbar';
import MapDistrictTable from './map/MapDistrictTable';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.heat';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { LocationMap } from './ui/expand-map';
import { ALL_64_DISTRICTS, ALL_8_DIVISIONS } from '../data/bangladeshDistricts';
import { 
  isValidLatLng, 
  isValidCoordinate, 
  getDistrictBoundaryCoordinates, 
  getSeverityColor
} from '../services/geolocationService';
import { useAuth } from '../context/AuthContext';
import DataProcessingSkeleton from './DataProcessingSkeleton';
import { useLeafletMap, MAP_LAYERS, MapLayerKey } from '../hooks/useLeafletMap';
import { useBandwidthMode } from '../hooks/useBandwidthMode';
import {
  useMapMeasurements,
  calculateDistanceKm,
  findNearestDistrict,
  analyzePathBetweenPoints,
  PathAnalysisResult,
  DistrictGeo,
} from '../hooks/useMapMeasurements';
import { useMapSnapshot } from '../hooks/useMapSnapshot';
import { useLiveDistricts } from '../hooks/useForecasts';
import { type ForecastHorizon } from '../lib/forecasts';
import { LIVE_LAYERS, LIVE_SECTIONS } from '../lib/liveLayers';
import { activeCredits } from '../lib/dataCredits';
import {
  ConcurrencyGate,
  GIBS_IMERG_RAIN,
  GIBS_MAX_IN_FLIGHT,
  GIBS_STATUS_URL,
  GIBS_TILE_MAX_NATIVE_ZOOM,
  GIBS_TILE_SUBDOMAINS,
  GIBS_TRUECOLOR,
  gibsDateCandidates,
  gibsSubDailyTileUrl,
  gibsTileUrl,
  gibsTimeLabel,
  resolveImergFrames,
  resolveTrueColorPlan,
  stepGibsDate,
  type TrueColorPlan,
} from '../lib/gibs';
import { GibsTileLayer } from './map/gibsTileLayer';
import { mapFreshnessLabel } from '../lib/mapFreshness';
import {
  WIND_ARTIFACT_URL,
  parseWindArtifact,
  windChipLabel,
  windFeedState,
  type WindArtifact,
} from '../lib/wind';

/** Structural handle: the overlay module is lazy-loaded, so the component only
 *  depends on the two calls it makes. */
type WindOverlayHandle = { destroy: () => void };

export type { DistrictGeo, PathAnalysisResult, MapLayerKey };
export const liveDistrictsData: DistrictGeo[] = ALL_64_DISTRICTS;
export {
  getDistrictBoundaryCoordinates,
  calculateDistanceKm,
  findNearestDistrict,
  analyzePathBetweenPoints,
  MAP_LAYERS,
};

import { BANGLADESH_RIVERS, HAZARD_LAYERS, createCustomIcon, hazardMarkerLabel, getAdvisoryColor } from './map/mapPrimitives';
import StatusStrip, { computeTierCounts } from './StatusStrip';
import DistrictForecastCard from './map/DistrictForecastCard';
import type { HazardLayerDef } from './map/mapPrimitives';
import {
  MAP_CHROME,
  MAP_INTERACTIVE,
  MAP_HEAT_RAMP,
  MAP_RAIN_RAMP,
  MAP_RISK_RAMP,
} from '@hazardnet/design-system';

interface LiveMapViewProps {
  onSelectDistrict?: (district: { id: string; name: string; division: string; lat: number; lng: number; risk: 'Low' | 'Moderate' | 'High'; mainCrop: string }) => void;
  selectedDistrictId?: string;
  selectedDivision?: string;
  onSelectDivision?: (divisionName: string) => void;
  onOpenDisasterModal?: (districtId: string) => void;
  /** Opens the full-screen console's AI advisory drawer, if there is one. */
  onOpenAdvisory?: () => void;
  pinpointLat?: number;
  pinpointLng?: number;
  isFullScreen?: boolean;
  compactHeader?: boolean;
  customHeight?: string;
  className?: string;
}

export { BANGLADESH_RIVERS, HAZARD_LAYERS };
export type { HazardLayerDef };

export const LiveMapView: React.FC<LiveMapViewProps> = ({
  onSelectDistrict,
  selectedDistrictId,
  onOpenDisasterModal,
  onOpenAdvisory,
  pinpointLat,
  pinpointLng,
  isFullScreen = false,
  compactHeader = false,
  customHeight,
  className,
}) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { lowBandwidth } = useBandwidthMode();
  const mainWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const districtMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const lastTargetedDistrictRef = useRef<DistrictGeo | null>(null);

  // Header collapse state
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(compactHeader);
  const [viewMode, setViewMode] = useState<MapViewMode>('map');

  useEffect(() => {
    setIsHeaderCollapsed(compactHeader);
  }, [compactHeader]);

  // Layer & Visual Controls
  // Ground choice (Phase B, 2026-10-05): the situational view opens on
  // satellite, the honest ground for hazard reading; street/topo is one
  // segment away. Two grounds, one at a time, in the layers panel. If the
  // satellite provider stops answering this client the watchdog in
  // useLeafletMap steps us back to the street map automatically.
  const [activeLayer, setActiveLayer] = useState<MapLayerKey>('esriSatellite');
  const [isEsriUnavailable, setIsEsriUnavailable] = useState<boolean>(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState<boolean>(false);
  const [isHighContrastBoost, setIsHighContrastBoost] = useState<boolean>(true);
  const [isHeatmapActive, setIsHeatmapActive] = useState<boolean>(false);
  const [isRiverLayerActive, setIsRiverLayerActive] = useState<boolean>(true);
  const [isClusteringActive, setIsClusteringActive] = useState<boolean>(true);
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [inspectedPoint, setInspectedPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isolateSelected, setIsolateSelected] = useState<boolean>(false);
  const [selectedHazards, setSelectedHazards] = useState<string[]>([
    'Flash Flood',
    'Monsoon Flood',
    'Tropical Cyclone',
    'Drought',
    'Cold Wave',
    'Severe Storm',
  ]);
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Map export: one click captures the current view at the hook's defaults and
  // downloads the PNG. The old capture modal (resolution/format/title/watermark
  // controls) was removed on 2026-10-05; users only ever wanted the image.
  const exportScale = 3; // Ultra HD 4K (300 DPI)
  const exportFormat: 'png' | 'jpeg' = 'png';
  const includeWatermarkHeader = true;
  const includeOverlayLegend = true;
  const customReportTitle = 'Bangladesh Multi-Hazard Geospatial Intelligence Report';

  // The old "+" hazard-actions menu opened twelve options at once; on 2026-10-05 it was
  // deleted in favour of one button per job (locate, filters, layers) plus Leaflet's own
  // zoom control. The fake "sync live telemetry" action and the field-report form that
  // persisted nothing went with it.
  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);
  const [isLayerModalOpen, setIsLayerModalOpen] = useState<boolean>(false);

  // Measure mode ref for Leaflet click callback
  const isMeasuringRef = useRef(isMeasuring);
  useEffect(() => {
    isMeasuringRef.current = isMeasuring;
  }, [isMeasuring]);

  // Live forecast overlay (weekly pipeline via /api/v1/forecasts/bulk);
  // falls back to the static district baseline when the API is unreachable,
  // so every consumer below can treat `liveDistricts` as always-available.
  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizon>('7_days');
  const { districts: liveDistricts, isLive, liveCount, predictionDate } = useLiveDistricts(forecastHorizon);

  // Selected district object
  const currentSelected = selectedDistrictId ? liveDistricts.find((d) => d.id === selectedDistrictId) : undefined;

  // Extracted Hook 1: useLeafletMap (Manages Leaflet instance lifecycle, tiles, resize, and geolocation)
  const {
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
  } = useLeafletMap(mapContainerRef, activeLayer, {
    onMapClick: (lat, lng) => {
      if (isMeasuringRef.current) {
        setMeasurePoints((prev) => [...prev, [lat, lng]]);
      } else {
        setInspectedPoint({ lat, lng });
      }
    },
    onAutoLocateDistrict: (district) => {
      // The first-launch auto-locate (up to ~13.5 s: 10 s GPS + 3.5 s IP) must
      // never override an explicit selection — a deep link, a palette pick or a
      // map click that landed while the lookup was running. Without this guard
      // the late GPS/IP result replaced the district the user had just chosen.
      if (selectedDistrictId) return;
      if (onSelectDistrict) {
        onSelectDistrict({
          id: district.id,
          name: district.name,
          division: district.division,
          lat: district.lat,
          lng: district.lng,
          risk: district.risk,
          mainCrop: district.mainCrop,
        });
      }
    },
    autoLocateEnabled:
      userProfile?.autoDetectLocationEnabled ??
      (localStorage.getItem('hazardnet_auto_detect_location') !== 'false'),
    lowBandwidth,
    onBasemapDegraded: (layerKey) => {
      if (layerKey !== 'esriSatellite') return;
      setActiveLayer('topoMap');
      setIsEsriUnavailable(true);
      toast.error('Satellite imagery is not answering right now. Showing the street map instead.');
    },
  });

  useEffect(() => {
    if (viewMode !== 'map') return;
    const id = window.setTimeout(() => mapInstanceRef.current?.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [viewMode]);

  // The IndexedDB tile cache (useTileCache) was deleted on 2026-10-05: its bulk
  // pre-cache of Bangladesh tiles is what the OpenStreetMap tile usage policy forbids
  // (osm.wiki/blocked). Leaflet's stock layer and the browser's HTTP cache are the
  // whole tile story now — see hooks/useLeafletMap.ts.

  // Extracted Hook 3: useMapMeasurements (Manages ruler points, polyline rendering, and path risk corridor analysis)
  const {
    pathAnalysis,
    totalMeasuredKm,
    clearMeasurements,
    removeLastPoint,
  } = useMapMeasurements({
    measureGroupRef,
    measurePoints,
    setMeasurePoints,
  });

  // Extracted Hook 3: useMapSnapshot (Manages html2canvas-pro image capture, watermarks & exports)
  const baseMapName = MAP_LAYERS[activeLayer]?.name || 'OpenTopoMap';
  const selectedInfo = currentSelected
    ? `${currentSelected.name} District (${(currentSelected.severity * 100).toFixed(0)}% Risk)`
    : 'Bangladesh National Overview';
  const activeOverlayNames = HAZARD_LAYERS
    .filter((h) => selectedHazards.includes(h.id))
    .map((h) => h.name)
    .join(', ') || 'Baseline Vector Boundaries';

  // Attribution derivation lives below the overlay state (it reads it).

  // Overlay rows read the liveLayers table; this map binds each table row to
  // the component state that actually drives the Leaflet layer.
  const overlayToggles: Record<string, { value: boolean; set: (next: boolean) => void }> = {
    'overlay-rivers': { value: isRiverLayerActive, set: setIsRiverLayerActive },
    'overlay-heatmap': { value: isHeatmapActive, set: setIsHeatmapActive },
    'overlay-cluster': { value: isClusteringActive, set: setIsClusteringActive },
    'overlay-contrast': { value: isHighContrastBoost, set: setIsHighContrastBoost },
  };

  // True-colour satellite (Phase C). The row's freshness chip, date control and
  // attribution all key off this small state machine:
  //   idle -> loading -> ready (Terra, or VIIRS SNPP when Terra fails: L1)
  //                  -> unavailable (both failed: L4, with the NASA status link)
  // "newest available" means exactly that: the newest UTC date the probe found,
  // never "live". Stepping back is an honest archive step, never a re-render.
  const [isTrueColorActive, setIsTrueColorActive] = useState<boolean>(false);
  const [trueColorStatus, setTrueColorStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [trueColorPlan, setTrueColorPlan] = useState<TrueColorPlan | null>(null);
  const [trueColorOffset, setTrueColorOffset] = useState<number>(0);
  const [trueColorOpacity, setTrueColorOpacity] = useState<number>(80);
  const [isTrueColorExpanded, setIsTrueColorExpanded] = useState<boolean>(false);
  const gibsGateRef = useRef<ConcurrencyGate | null>(null);
  if (gibsGateRef.current === null) {
    gibsGateRef.current = new ConcurrencyGate(GIBS_MAX_IN_FLIGHT);
  }
  const gibsLayerRef = useRef<GibsTileLayer | null>(null);
  const trueColorDateIso = trueColorPlan ? stepGibsDate(trueColorPlan.dateIso, trueColorOffset) : null;

  // Rain rate (Phase D). GPM IMERG Early Run half-hourly frames from GIBS,
  // probed newest-first behind the ~4 h latency, replayed six frames deep. The
  // advertised observation time is always shown separately from "now" — the
  // frames are estimates at the middle of each 30-minute period, not a live
  // gauge network.
  const [isRainActive, setIsRainActive] = useState<boolean>(false);
  const [rainStatus, setRainStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [rainFrames, setRainFrames] = useState<string[]>([]);
  const [rainFrameIndex, setRainFrameIndex] = useState<number>(0);
  const [isRainPlaying, setIsRainPlaying] = useState<boolean>(false);
  const [isRainExpanded, setIsRainExpanded] = useState<boolean>(false);
  const rainLayerRef = useRef<GibsTileLayer | null>(null);
  const rainFrameIso = rainFrames[rainFrameIndex] ?? null;

  // Wind field (Phase E). A committed artifact (frontend/public/data/live/
  // wind.json), rebuilt every six hours by the Live Wind Update workflow from
  // GFS or ECMWF open data. A forecast is labelled a forecast: the chip carries
  // the model and its cycle time, and the expansion spells out issue and valid
  // times. Amber stays reserved for observed data; this is model output.
  const [isWindActive, setIsWindActive] = useState<boolean>(false);
  const [windStatus, setWindStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [windArtifact, setWindArtifact] = useState<WindArtifact | null>(null);
  const [isWindExpanded, setIsWindExpanded] = useState<boolean>(false);
  const windOverlayRef = useRef<WindOverlayHandle | null>(null);
  const windFeed = windFeedState(windArtifact);

  // What the attribution lightbox lists: exactly the credits of what is on
  // screen. The basemap credit follows the ground; the forecast credit appears
  // only while an overlay that draws the forecast product is switched on; the
  // GIBS credit only while a GIBS overlay is actually rendering; the wind
  // credit follows whichever model the artifact carries (credits follow the
  // ladder).
  const attributionCreditIds: string[] =
    activeLayer === 'esriSatellite' ? ['esri'] : ['osm', 'opentopomap'];
  if (isRiverLayerActive || isHeatmapActive || isClusteringActive) {
    attributionCreditIds.push('forecasts');
  }
  if ((isTrueColorActive && trueColorStatus === 'ready') || (isRainActive && rainStatus === 'ready')) {
    attributionCreditIds.push('gibs');
  }
  if (isWindActive && windStatus === 'ready' && windArtifact) {
    attributionCreditIds.push(windArtifact.model === 'ecmwf' ? 'windEcmwf' : 'windGfs');
  }
  const attributionList = activeCredits(attributionCreditIds);

  // Ladder probe: when the overlay turns on, find the newest UTC date Terra
  // answers for; if Terra cannot answer any of the last three days, ask VIIRS
  // SNPP (L1); if neither answers, L4 UNAVAILABLE. Turning the overlay off and
  // on again re-probes (a fresh L0 success is the only way back up the ladder).
  useEffect(() => {
    if (!isTrueColorActive) {
      setTrueColorStatus('idle');
      setTrueColorPlan(null);
      setTrueColorOffset(0);
      return;
    }
    let cancelled = false;
    setTrueColorStatus('loading');
    resolveTrueColorPlan(gibsDateCandidates(), { gate: gibsGateRef.current ?? undefined }).then((plan) => {
      if (cancelled) return;
      if (!plan) {
        setTrueColorPlan(null);
        setTrueColorStatus('unavailable');
        setIsTrueColorExpanded(true);
        return;
      }
      setTrueColorPlan(plan);
      setTrueColorOffset(0);
      setTrueColorStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [isTrueColorActive]);

  // The tile layer itself: rebuilt whenever source or advertised date changes,
  // opacity applied live. Imagery layers stay neutral in dark mode (no filter
  // class), and removal always releases the gate.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const gate = gibsGateRef.current;
    if (!map || !gate || !isTrueColorActive || trueColorStatus !== 'ready' || !trueColorPlan || !trueColorDateIso) {
      if (gibsLayerRef.current) {
        if (map && map.hasLayer(gibsLayerRef.current)) map.removeLayer(gibsLayerRef.current);
        gibsLayerRef.current = null;
      }
      return;
    }
    const layer = new GibsTileLayer(gibsTileUrl(trueColorPlan.source.gibsLayer, trueColorDateIso), {
      gate,
      subdomains: GIBS_TILE_SUBDOMAINS,
      maxNativeZoom: GIBS_TILE_MAX_NATIVE_ZOOM,
      maxZoom: 12,
      opacity: trueColorOpacity / 100,
      crossOrigin: true,
      className: 'hn-tile-gibsTrueColor',
    });

    // Runtime watchdog, same shape as the basemap one: a run of tile errors with
    // no successful load means the provider stopped answering after the probe.
    // Terra gets one L1 demotion to VIIRS SNPP on the same date; after that the
    // row shows the distinct UNAVAILABLE state. Tiles never silently fake it.
    let errors = 0;
    let sawLoad = false;
    let demoted = false;
    const planAtWatch = trueColorPlan;
    const onTileError = () => {
      if (sawLoad || demoted) return;
      errors += 1;
      if (errors < 8) return;
      demoted = true;
      if (planAtWatch.source.id === 'modis-terra') {
        setTrueColorPlan({ source: GIBS_TRUECOLOR[1], dateIso: planAtWatch.dateIso, degraded: true });
      } else {
        setTrueColorStatus('unavailable');
        setIsTrueColorExpanded(true);
      }
    };
    const onTilesLoad = () => {
      errors = 0;
      sawLoad = true;
    };
    layer.on('tileerror', onTileError);
    layer.on('load', onTilesLoad);

    layer.addTo(map);
    gibsLayerRef.current = layer;
    return () => {
      layer.cancelGibsQueue();
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (gibsLayerRef.current === layer) gibsLayerRef.current = null;
    };
    // Opacity intentionally not in deps: applied via setOpacity below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrueColorActive, trueColorStatus, trueColorPlan, trueColorDateIso]);

  useEffect(() => {
    const layer = gibsLayerRef.current;
    if (layer) layer.setOpacity(trueColorOpacity / 100);
  }, [trueColorOpacity]);

  // GEV rule: the gate pauses when the tab is hidden (no background GIBS
  // traffic) and resumes on return. Running downloads finish; queued ones wait.
  useEffect(() => {
    const onVisibility = () => {
      const gate = gibsGateRef.current;
      if (!gate) return;
      if (document.visibilityState === 'hidden') gate.pause();
      else gate.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Rain frame probe: newest six IMERG frames behind the Early Run latency.
  // Re-enabling re-probes; the plan's tiles skip L2/L3, so the only states are
  // ready and the distinct UNAVAILABLE one.
  useEffect(() => {
    if (!isRainActive) {
      setRainStatus('idle');
      setRainFrames([]);
      setRainFrameIndex(0);
      setIsRainPlaying(false);
      return;
    }
    let cancelled = false;
    setRainStatus('loading');
    resolveImergFrames({ gate: gibsGateRef.current ?? undefined }).then((plan) => {
      if (cancelled) return;
      if (!plan) {
        setRainFrames([]);
        setRainStatus('unavailable');
        setIsRainExpanded(true);
        return;
      }
      setRainFrames(plan.frames);
      setRainFrameIndex(0);
      setRainStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [isRainActive]);

  // Rain replay: step one frame every 900 ms, looping oldest -> newest.
  useEffect(() => {
    if (!isRainPlaying || rainFrames.length < 2) return;
    const id = window.setInterval(() => {
      setRainFrameIndex((i) => (i + 1) % rainFrames.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [isRainPlaying, rainFrames.length]);

  // The rain tile layer: created once per ready session; frame changes swap the
  // URL in place so replay does not flicker the whole layer.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const gate = gibsGateRef.current;
    if (!map || !gate || !isRainActive || rainStatus !== 'ready' || rainFrames.length === 0) {
      if (rainLayerRef.current) {
        if (map && map.hasLayer(rainLayerRef.current)) map.removeLayer(rainLayerRef.current);
        rainLayerRef.current = null;
      }
      return;
    }
    const { gibsLayer, tileMatrixSet, maxNativeZoom } = GIBS_IMERG_RAIN;
    const layer = new GibsTileLayer(gibsSubDailyTileUrl(gibsLayer, rainFrames[0], tileMatrixSet), {
      gate,
      subdomains: GIBS_TILE_SUBDOMAINS,
      maxNativeZoom,
      maxZoom: 10,
      opacity: 0.85,
      crossOrigin: true,
      className: 'hn-tile-imergRain',
    });

    // Tiles skip L2/L3: a run of errors with no successful load is the distinct
    // UNAVAILABLE state, with the forecast card's precipitation row as the
    // rain story in the meantime.
    let errors = 0;
    let sawLoad = false;
    let failed = false;
    const onTileError = () => {
      if (sawLoad || failed) return;
      errors += 1;
      if (errors < 8) return;
      failed = true;
      setRainStatus('unavailable');
      setIsRainExpanded(true);
    };
    const onTilesLoad = () => {
      errors = 0;
      sawLoad = true;
    };
    layer.on('tileerror', onTileError);
    layer.on('load', onTilesLoad);

    layer.addTo(map);
    rainLayerRef.current = layer;
    return () => {
      layer.cancelGibsQueue();
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (rainLayerRef.current === layer) rainLayerRef.current = null;
    };
    // Frame swaps are handled by setUrl below to keep the layer mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRainActive, rainStatus, rainFrames]);

  useEffect(() => {
    const layer = rainLayerRef.current;
    if (!layer || !rainFrameIso) return;
    const { gibsLayer, tileMatrixSet } = GIBS_IMERG_RAIN;
    layer.setUrl(gibsSubDailyTileUrl(gibsLayer, rainFrameIso, tileMatrixSet));
  }, [rainFrameIso]);

  // Wind artifact fetch: schema-strict parse, honest states only. A stale
  // artifact still renders (chip says STALE as of ...); a missing or unknown
  // one is UNAVAILABLE, never an invented breeze.
  useEffect(() => {
    if (!isWindActive) {
      setWindStatus('idle');
      setWindArtifact(null);
      setIsWindExpanded(false);
      return;
    }
    let cancelled = false;
    setWindStatus('loading');
    fetch(WIND_ARTIFACT_URL)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        const artifact = parseWindArtifact(raw);
        if (!artifact) {
          setWindArtifact(null);
          setWindStatus('unavailable');
          setIsWindExpanded(true);
          return;
        }
        setWindArtifact(artifact);
        setWindStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [isWindActive]);

  // The renderer, lazy-loaded: the particle machinery only ships to users who
  // switch the row on (bundle-gate acceptance). Coarse pointers get 600
  // particles, fine ones 1,800; reduced motion and low bandwidth collapse to
  // the static quiver plot.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const artifact = windArtifact;
    if (!map || !isWindActive || windStatus !== 'ready' || !artifact) {
      if (windOverlayRef.current) {
        windOverlayRef.current.destroy();
        windOverlayRef.current = null;
      }
      return;
    }
    let cancelled = false;
    import('./map/windOverlay')
      .then((mod) => {
        if (cancelled || !mapInstanceRef.current) return;
        if (windOverlayRef.current) windOverlayRef.current.destroy();
        windOverlayRef.current = mod.createWindOverlay(mapInstanceRef.current, artifact, {
          particleCount: mod.windParticleBudget(),
          quiver: lowBandwidth || mod.windPrefersStatic(),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setWindStatus('unavailable');
          setIsWindExpanded(true);
        }
      });
    return () => {
      cancelled = true;
      if (windOverlayRef.current) {
        windOverlayRef.current.destroy();
        windOverlayRef.current = null;
      }
    };
  }, [isWindActive, windStatus, windArtifact, lowBandwidth]);

  const {
    generateMapSnapshot,
    isExportingMap,
    exportSuccessMsg,
    setExportSuccessMsg,
  } = useMapSnapshot(mapContainerRef, mapInstanceRef, {
    exportScale,
    exportFormat,
    includeWatermarkHeader,
    includeOverlayLegend,
    customReportTitle,
    baseMapName,
    selectedInfo,
    activeOverlayNames,
  });

  const handleExportMapImage = async () => {
    try {
      const dataUrl = await generateMapSnapshot();
      if (!dataUrl) return;
      const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = `HazardNet_MapReport_${dateStr}.${exportFormat}`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Map report saved as ${filename}`);
    } catch {
      // useMapSnapshot already surfaced an error toast.
    }
  };




  // Handler to locate user geographic position and map to corresponding district
  const handleCenterOnUserLocation = () => {
    centerOnUserLocation();
  };

  const handleActivity = () => {
    setIsHudVisible(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setIsHudVisible(false);
    }, 5000);
  };

  useEffect(() => {
    handleActivity();
    return () => {
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, []);

  // Callback to emit selection & center map on targeted district
  const handleSelectDistrict = useCallback((dist: DistrictGeo) => {
    if (dist && isValidLatLng(dist.lat, dist.lng)) {
      lastTargetedDistrictRef.current = dist;
      if (mapInstanceRef.current) {
        const boundaryCoords = getDistrictBoundaryCoordinates(dist);
        if (boundaryCoords.length >= 3) {
          try {
            const bounds = L.latLngBounds(boundaryCoords);
            if (bounds.isValid()) {
              mapInstanceRef.current.fitBounds(bounds.pad(0.35), { animate: true, duration: 1.2, maxZoom: 10.5 });
            } else {
              mapInstanceRef.current.flyTo([dist.lat, dist.lng], 9.5, { duration: 1.2 });
            }
          } catch (e) {
            console.warn('Failed to fit district bounds:', e);
            mapInstanceRef.current.flyTo([dist.lat, dist.lng], 9.5, { duration: 1.2 });
          }
        } else {
          mapInstanceRef.current.flyTo([dist.lat, dist.lng], 9.5, { duration: 1.2 });
        }
      }
    }
    if (onSelectDistrict && dist && isValidLatLng(dist.lat, dist.lng)) {
      onSelectDistrict({
        id: dist.id,
        name: dist.name,
        division: dist.division,
        lat: dist.lat,
        lng: dist.lng,
        risk: dist.risk,
        mainCrop: dist.mainCrop,
      });
    }
  }, [onSelectDistrict]);

  // Active district corresponding to the user's current GPS location, stored pinpoint, or home profile
  const activeUserDistrict = useMemo(() => {
    if (userGpsPos && isValidLatLng(userGpsPos.lat, userGpsPos.lng)) {
      const nearest = findNearestDistrict(userGpsPos.lat, userGpsPos.lng);
      return nearest?.district || null;
    }
    if (isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng) && isValidLatLng(pinpointLat, pinpointLng)) {
      const nearest = findNearestDistrict(pinpointLat, pinpointLng);
      return nearest?.district || null;
    }
    if (userProfile?.homeDistrictId) {
      return liveDistricts.find((d) => d.id === userProfile.homeDistrictId) || null;
    }
    const storedDist = localStorage.getItem('hazardnet_home_district');
    if (storedDist) {
      return liveDistricts.find((d) => d.id === storedDist) || null;
    }
    return null;
  }, [userGpsPos, pinpointLat, pinpointLng, userProfile?.homeDistrictId, liveDistricts]);

  const toggleHazard = (hazardId: string) => {
    setSelectedHazards((prev) =>
      prev.includes(hazardId) ? prev.filter((h) => h !== hazardId) : [...prev, hazardId]
    );
  };

  const selectAllHazards = () => {
    setSelectedHazards(HAZARD_LAYERS.map((h) => h.id));
  };

  const clearAllHazards = () => {
    setSelectedHazards([]);
  };

  // Compute top 3 hazards for the selected division
  const divisionTopHazards = useMemo(() => {
    if (selectedDivision === 'All') return [];
    const divDistricts = liveDistricts.filter(d => d.division.toLowerCase() === selectedDivision.toLowerCase());
    
    const hazards: Record<string, { hazardName: string; severitySum: number; count: number; maxSeverity: number }> = {};
    divDistricts.forEach(d => {
      if (!hazards[d.hazardType]) {
        hazards[d.hazardType] = { hazardName: d.hazardType, severitySum: 0, count: 0, maxSeverity: 0 };
      }
      hazards[d.hazardType].severitySum += d.severity || 0.5;
      hazards[d.hazardType].count += 1;
      if ((d.severity || 0.5) > hazards[d.hazardType].maxSeverity) {
        hazards[d.hazardType].maxSeverity = d.severity || 0.5;
      }
    });

    return Object.values(hazards)
      .map(h => ({
        ...h,
        avgSeverity: h.severitySum / h.count
      }))
      .sort((a, b) => b.avgSeverity - a.avgSeverity)
      .slice(0, 3);
  }, [selectedDivision, liveDistricts]);

  // Handle Division Filter Jump
  const handleSelectDivision = (divisionName: string) => {
    setSelectedDivision(divisionName);
    setIsolateSelected(false);
    if (!mapInstanceRef.current) return;

    if (divisionName === 'All') {
      mapInstanceRef.current.flyTo([23.8103, 90.4125], 7, { duration: 1.2 });
      return;
    }

    const divisionDistricts = liveDistricts.filter((d) => d.division.toLowerCase() === divisionName.toLowerCase());
    if (divisionDistricts.length > 0) {
      const bounds = L.latLngBounds(divisionDistricts.map((d) => [d.lat, d.lng]));
      mapInstanceRef.current.fitBounds(bounds.pad(0.25), { animate: true, duration: 1.2 });
    }
  };

  // Auto-zoom to selected district boundary when selectedDistrictId changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (currentSelected && isValidLatLng(currentSelected.lat, currentSelected.lng)) {
      lastTargetedDistrictRef.current = currentSelected;
      const boundaryCoords = getDistrictBoundaryCoordinates(currentSelected);
      if (boundaryCoords.length >= 3) {
        try {
          const bounds = L.latLngBounds(boundaryCoords);
          if (bounds.isValid()) {
            mapInstanceRef.current.fitBounds(bounds.pad(0.35), { animate: true, duration: 1.2, maxZoom: 10.5 });
            return;
          }
        } catch (e) {
          console.warn('Failed to fit district bounds in effect:', e);
        }
      }
      mapInstanceRef.current.flyTo([currentSelected.lat, currentSelected.lng], 9.5, { duration: 1.2 });
    } else if (selectedDivision !== 'All') {
      const divisionDistricts = liveDistricts.filter((d) => d.division.toLowerCase() === selectedDivision.toLowerCase());
      const bounds = L.latLngBounds([]);
      divisionDistricts.forEach((d) => {
        if (isValidLatLng(d.lat, d.lng)) {
          const boundaryCoords = getDistrictBoundaryCoordinates(d);
          if (boundaryCoords.length >= 3) {
            boundaryCoords.forEach((coord) => bounds.extend(coord as L.LatLngTuple));
          } else {
            bounds.extend([d.lat, d.lng] as L.LatLngTuple);
          }
        }
      });
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds.pad(0.1), { animate: true, duration: 1.2, maxZoom: 9 });
      }
    }
  }, [selectedDistrictId, currentSelected, selectedDivision, liveDistricts]);

  // Filtered districts based on search, division & active disaster checkboxes
  const filteredDistricts = liveDistricts.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.division.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.hazardType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesHazard = selectedHazards.includes(d.hazardType);
    const matchesDivision = selectedDivision === 'All' || d.division.toLowerCase() === selectedDivision.toLowerCase();
    return matchesSearch && matchesHazard && matchesDivision;
  });

  const hazardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const layer of HAZARD_LAYERS) {
      counts[layer.id] = liveDistricts.filter((d) => d.hazardType === layer.id).length;
    }
    return counts;
  }, [liveDistricts]);

  const statusStripCounts = useMemo(() => {
    const counts = { SEVERE: 0, WARNING: 0, WATCH: 0, NORMAL: 0 };
    for (const d of liveDistricts) {
      const tier = (d.advisoryTier || '').toUpperCase();
      if (tier === 'SEVERE') counts.SEVERE += 1;
      else if (tier === 'WARNING') counts.WARNING += 1;
      else if (tier === 'WATCH') counts.WATCH += 1;
      else if (tier === 'NORMAL') counts.NORMAL += 1;
      else {
        if (d.severity >= 0.75) counts.SEVERE += 1;
        else if (d.severity >= 0.50) counts.WARNING += 1;
        else if (d.severity >= 0.30) counts.WATCH += 1;
        else counts.NORMAL += 1;
      }
    }
    return counts;
  }, [liveDistricts]);

  // 3. Render Markers & Outlined District Boundaries
  useEffect(() => {
    if (!markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
    clusterGroupRef.current?.clearLayers();
    districtMarkersRef.current.clear();

    const districtsToRender =
      currentSelected && isolateSelected && isValidLatLng(currentSelected.lat, currentSelected.lng)
        ? [currentSelected]
        : filteredDistricts;

    districtsToRender.forEach((dist) => {
      if (!dist || !isValidLatLng(dist.lat, dist.lng)) return;

      const isSel = dist.id === selectedDistrictId;
      const isUserDist = Boolean(activeUserDistrict && dist.id === activeUserDistrict.id);
      const severityColor = getAdvisoryColor(dist.advisoryTier, dist.severity);
      const color = severityColor;

      const isDivSel = selectedDivision !== 'All' && dist.division.toLowerCase() === selectedDivision.toLowerCase();

      // Always render high-contrast outlined district boundary polygon for selected district, user's location district, OR selected division
      if (isSel || isUserDist || isDivSel) {
        const userLocLat = userGpsPos?.lat ?? pinpointLat;
        const userLocLng = userGpsPos?.lng ?? pinpointLng;
        const boundaryCoords = (isUserDist || isSel) && isValidLatLng(userLocLat, userLocLng)
          ? getDistrictBoundaryCoordinates(dist, userLocLat, userLocLng)
          : getDistrictBoundaryCoordinates(dist);
        if (boundaryCoords.length >= 3) {
          try {
            // Dynamic Severity Outlined Boundary Polygon (reflecting advisory tier)
            const boundaryPolygon = L.polygon(boundaryCoords, {
              color: severityColor,
              weight: isSel || isUserDist ? 4 : 2,
              stroke: true,
              fillColor: severityColor,
              fillOpacity: isSel || isUserDist ? 0.32 : 0.15,
              dashArray: isSel ? '8, 8' : isUserDist ? '6, 6' : '4, 4',
              className: isUserDist ? 'user-district-pulse-border' : undefined,
            });

            if (isSel || isUserDist) {
              const outerGlow = L.polygon(boundaryCoords, {
                color: severityColor,
                weight: 10,
                opacity: 0.50,
                fill: false,
                interactive: false,
                className: isUserDist ? 'user-district-pulse-glow' : undefined,
              });
              markersGroupRef.current?.addLayer(outerGlow);
            }

            const severityPercent = Math.round(dist.severity * 100);
            const tierBadge = dist.advisoryTier ? `[${dist.advisoryTier}] ` : '';
            const tooltipText = isUserDist
              ? `<div style="font-family: var(--ap-font-display); font-size: 12px; font-weight: 900; color: ${MAP_CHROME.surface}; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>${dist.name} District Boundary (Your Location)</span><span style="background: ${severityColor}; color: ${MAP_CHROME.surface}; padding: 2px 6px; border-radius: 9999px; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${tierBadge}${severityPercent}% Severity</span></div>`
              : `<div style="font-family: var(--ap-font-display); font-size: 12px; font-weight: 900; color: ${MAP_CHROME.surface}; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><span>${dist.name} District ${isDivSel ? `(${dist.division} Division)` : 'Boundary'}</span><span style="background: ${severityColor}; color: ${MAP_CHROME.surface}; padding: 2px 6px; border-radius: 9999px; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${tierBadge}${severityPercent}% Severity</span></div>`;

            boundaryPolygon.bindTooltip(tooltipText, {
              permanent: isUserDist && !isSel,
              direction: 'top',
            });

            markersGroupRef.current?.addLayer(boundaryPolygon);
          } catch (polygonErr) {
            console.warn('Failed to draw polygon:', polygonErr);
          }
        }
      }

      try {
        // Circle Marker Heatmap Halo
        const circle = L.circleMarker([dist.lat, dist.lng], {
          radius: isSel ? 42 : Math.max(18, dist.severity * 34),
          color: isSel ? MAP_CHROME.surface : color,
          fillColor: color,
          fillOpacity: isSel ? 0.5 : 0.28,
          weight: isSel ? 3.5 : 2,
          dashArray: isSel ? '4,4' : undefined,
        });

        // Pin Marker with DivIcon reflecting active advisory tier
        const icon = createCustomIcon(dist.severity, isSel, dist.hazardType, dist.name, dist.advisoryTier);
        const marker = L.marker([dist.lat, dist.lng], { icon });
        const severityPct = (dist.severity * 100).toFixed(0);

        // District popup replaced by the React DistrictForecastCard overlay
        // (viewport-docked below the navbar — never cropped like the old
        // native Leaflet popup that opened above the marker).

        // Attach district payload for cluster icon summary calculations
        (marker as any).districtData = dist;
        districtMarkersRef.current.set(dist.id, marker);

        const triggerClick = () => {
          handleSelectDistrict(dist);
        };

        marker.on('click', triggerClick);
        circle.on('click', triggerClick);

        // Single source of truth for the marker's accessible name (see mapPrimitives).
        const districtAriaLabel = hazardMarkerLabel(dist.severity, dist.hazardType, dist.name, dist.risk, dist.advisoryTier);

        const attachMarkerA11y = () => {
          const el = marker.getElement();
          if (el) {
            el.setAttribute('tabindex', '0');
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', districtAriaLabel);
            el.onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerClick();
              }
            };
          }
        };

        marker.on('add', attachMarkerA11y);
        setTimeout(attachMarkerA11y, 50);

        if (isClusteringActive && !isolateSelected) {
          clusterGroupRef.current?.addLayer(marker);
          if (isSel || isUserDist || isDivSel) {
            markersGroupRef.current?.addLayer(circle);
          }
        } else {
          markersGroupRef.current?.addLayer(circle);
          markersGroupRef.current?.addLayer(marker);
        }
      } catch (markerErr) {
        console.warn('Failed to add district marker:', dist.name, markerErr);
      }
    });

    // Render User Pinpoint GPS marker if passed
    if (isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng) && isValidLatLng(pinpointLat, pinpointLng)) {
      try {
        const userPinIcon = L.divIcon({
          html: `
            <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; outline: none; cursor: pointer;">
              <div style="position: absolute; inset: -8px; border-radius: 50%; background: rgba(2, 132, 199, 0.4); filter: blur(4px);" class="radar-ping-ring"></div>
              <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background: ${MAP_INTERACTIVE.blue}; border: 2.5px solid ${MAP_CHROME.surface}; display: flex; align-items: center; justify-content: center; color: ${MAP_CHROME.surface}; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.6);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>
              </div>
            </div>
          `,
          className: 'user-pinpoint-leaflet-icon',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const userPinMarker = L.marker([pinpointLat, pinpointLng], {
          icon: userPinIcon,
          zIndexOffset: 3000,
        });

        const pinNearest = isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng)
          ? findNearestDistrict(pinpointLat, pinpointLng)
          : null;
        const pinDist = pinNearest?.district || currentSelected;

        const attachPinA11y = () => {
          const el = userPinMarker.getElement();
          if (el) {
            el.setAttribute('tabindex', '0');
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', `User Stored Pinpoint GPS Location: ${pinpointLat.toFixed(4)}°N, ${pinpointLng.toFixed(4)}°E`);
          }
        };
        userPinMarker.on('add', attachPinA11y);
        setTimeout(attachPinA11y, 50);

        userPinMarker.bindPopup(`
          <div style="font-family: var(--ap-font-display); color: ${MAP_CHROME.panelInk}; padding: 4px 2px; min-width: 190px; max-width: 240px;">
            <div style="font-size: 14px; font-weight: 800; color: ${MAP_CHROME.inkStrong}; margin-bottom: 6px;">Your location</div>
            <div style="font-size: 13px; font-family: var(--ap-font-mono), monospace; color: ${MAP_CHROME.inkSoft};">${pinpointLat.toFixed(4)}°N, ${pinpointLng.toFixed(4)}°E</div>
            ${pinDist ? `
              <div style="margin-top: 8px; font-size: 13px; line-height: 1.45; color: ${MAP_CHROME.ink};">
                <strong style="font-weight: 800;">${pinDist.name}</strong> · ${pinDist.division}
              </div>
            ` : ''}
          </div>
        `);

        markersGroupRef.current?.addLayer(userPinMarker);
      } catch (pinErr) {
        console.warn('Failed to add pinpoint marker:', pinErr);
      }
    }

    // Render User Real-Time Geolocation Pin & Radius if active
    if (userGpsPos && isValidLatLng(userGpsPos.lat, userGpsPos.lng)) {
      try {
        const accuracyCircle = L.circle([userGpsPos.lat, userGpsPos.lng], {
          radius: userGpsPos.accuracy || 800,
          color: MAP_INTERACTIVE.blue,
          fillColor: MAP_INTERACTIVE.blueBright,
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: '4, 4',
          interactive: false,
        });

        const userGpsIcon = L.divIcon({
          html: `
            <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; outline: none; cursor: pointer;">
              <div style="position: absolute; inset: -10px; border-radius: 50%; background: rgba(2, 132, 199, 0.45); filter: blur(6px);" class="radar-ping-ring"></div>
              <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: ${MAP_INTERACTIVE.blue}; border: 2.5px solid ${MAP_CHROME.surface}; display: flex; align-items: center; justify-content: center; color: ${MAP_CHROME.surface}; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.7);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>
              </div>
            </div>
          `,
          className: 'user-gps-leaflet-icon',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const gpsMarker = L.marker([userGpsPos.lat, userGpsPos.lng], {
          icon: userGpsIcon,
          zIndexOffset: 3500,
        });

        const attachGpsA11y = () => {
          const el = gpsMarker.getElement();
          if (el) {
            el.setAttribute('tabindex', '0');
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', `Active Real-time GPS Position: ${userGpsPos.lat.toFixed(4)}°N, ${userGpsPos.lng.toFixed(4)}°E`);
          }
        };
        gpsMarker.on('add', attachGpsA11y);
        setTimeout(attachGpsA11y, 50);

        const nearest = findNearestDistrict(userGpsPos.lat, userGpsPos.lng);
        const dist = nearest?.district;
        const distanceKm = nearest?.distanceKm ? nearest.distanceKm.toFixed(1) : '0.0';

        gpsMarker.bindPopup(`
          <div style="font-family: var(--ap-font-display); color: ${MAP_CHROME.panelInk}; padding: 4px 2px; min-width: 190px; max-width: 240px;">
            <div style="font-size: 14px; font-weight: 800; color: ${MAP_CHROME.inkStrong}; margin-bottom: 6px;">Your location</div>
            <div style="font-size: 13px; font-family: var(--ap-font-mono), monospace; color: ${MAP_CHROME.inkSoft};">${userGpsPos.lat.toFixed(4)}°N, ${userGpsPos.lng.toFixed(4)}°E</div>
            <div style="margin-top: 4px; font-size: 12px; color: ${MAP_CHROME.muted};">Accuracy ±${userGpsPos.accuracy || 10} m</div>
            ${dist ? `
              <div style="margin-top: 8px; font-size: 13px; line-height: 1.45; color: ${MAP_CHROME.ink};">
                <strong style="font-weight: 800;">${dist.name}</strong> · ${dist.division}
                <div style="margin-top: 2px; font-size: 12px; color: ${MAP_CHROME.muted};">${distanceKm} km from district centre</div>
              </div>
            ` : ''}
          </div>
        `);

        markersGroupRef.current?.addLayer(accuracyCircle);
        markersGroupRef.current?.addLayer(gpsMarker);
      } catch (gpsErr) {
        console.warn('Failed to add GPS marker:', gpsErr);
      }
    }

    // Render active user location district boundary polygon as fallback if not rendered
    if (activeUserDistrict && !districtsToRender.some((d) => d.id === activeUserDistrict.id)) {
      const userLocLat = userGpsPos?.lat ?? pinpointLat;
      const userLocLng = userGpsPos?.lng ?? pinpointLng;
      const boundaryCoords = getDistrictBoundaryCoordinates(activeUserDistrict, userLocLat, userLocLng);
      if (boundaryCoords.length >= 3) {
        try {
          const severityColor = getSeverityColor(activeUserDistrict.severity);
          const severityPercent = Math.round(activeUserDistrict.severity * 100);
          const boundaryPolygon = L.polygon(boundaryCoords, {
            color: severityColor,
            weight: 4,
            stroke: true,
            fillColor: severityColor,
            fillOpacity: 0.32,
            dashArray: '6, 6',
            className: 'user-district-pulse-border',
          });
          const outerGlow = L.polygon(boundaryCoords, {
            color: severityColor,
            weight: 10,
            opacity: 0.50,
            fill: false,
            interactive: false,
            className: 'user-district-pulse-glow',
          });
          markersGroupRef.current?.addLayer(outerGlow);
          boundaryPolygon.bindTooltip(
            `<div style="font-family: var(--ap-font-display); font-size: 12px; font-weight: 900; color: ${MAP_CHROME.surface}; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>${activeUserDistrict.name} District Boundary (Your Location)</span><span style="background: ${severityColor}; color: ${MAP_CHROME.surface}; padding: 2px 6px; border-radius: 9999px; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`,
            { permanent: true, direction: 'top' }
          );
          markersGroupRef.current?.addLayer(boundaryPolygon);
        } catch (e) {
          console.warn('Failed to draw activeUserDistrict fallback boundary:', e);
        }
      }
    }
  }, [filteredDistricts, selectedDistrictId, isolateSelected, currentSelected, handleSelectDistrict, navigate, pinpointLat, pinpointLng, userGpsPos, activeUserDistrict, isClusteringActive, selectedDivision]);

  // 4. Render Interactive Click Inspection Marker
  useEffect(() => {
    if (!inspectGroupRef.current) return;
    inspectGroupRef.current.clearLayers();

    if (inspectedPoint && isValidLatLng(inspectedPoint.lat, inspectedPoint.lng)) {
      const inspectIcon = L.divIcon({
        html: `
          <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; outline: none; cursor: pointer;">
            <div style="position: absolute; inset: -12px; border-radius: 50%; background: rgba(249, 168, 37, 0.45); filter: blur(6px);" class="radar-ping-ring"></div>
            <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background: ${MAP_CHROME.surface}; border: 3px solid ${MAP_RISK_RAMP.severe}; display: flex; align-items: center; justify-content: center; color: ${MAP_CHROME.inkStrong}; font-size: 14px; font-weight: 900; box-shadow: 0 4px 16px rgba(249, 168, 37, 0.5);">
              <MaterialIcon name="search" className="w-4 h-4 inline-block align-middle" />
            </div>
          </div>
        `,
        className: 'inspect-pin-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const inspectMarker = L.marker([inspectedPoint.lat, inspectedPoint.lng], { icon: inspectIcon, zIndexOffset: 4000 });
      const attachInspectA11y = () => {
        const el = inspectMarker.getElement();
        if (el) {
          el.setAttribute('tabindex', '0');
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `Inspected Geographic Point: ${inspectedPoint.lat.toFixed(4)}°N, ${inspectedPoint.lng.toFixed(4)}°E`);
        }
      };
      inspectMarker.on('add', attachInspectA11y);
      setTimeout(attachInspectA11y, 50);

      inspectGroupRef.current.addLayer(inspectMarker);
    }
  }, [inspectedPoint]);

  // 6. Render Major Bangladesh River Basins Polyline Layer
  useEffect(() => {
    if (!riverGroupRef.current) return;
    riverGroupRef.current.clearLayers();

    if (isRiverLayerActive) {
      BANGLADESH_RIVERS.forEach((river) => {
        try {
          const outerGlow = L.polyline(river.coords, {
            color: MAP_INTERACTIVE.blueBright,
            weight: 7,
            opacity: 0.35,
            interactive: false,
          });

          const riverPolyline = L.polyline(river.coords, {
            color: river.color,
            weight: 3.5,
            opacity: 0.9,
            dashArray: '6, 6',
          });

          riverPolyline.bindTooltip(
            `<div style="font-family: var(--ap-font-display); font-size: 12px; font-weight: 900; color: ${MAP_INTERACTIVE.blue};">
              <MaterialIcon name="water" className="w-4 h-4 inline-block align-middle" /> ${river.name}<br/>
              <span style="font-size: 12px; color: ${MAP_CHROME.muted}; font-weight: normal;">${river.status}</span>
            </div>`,
            { permanent: false, direction: 'top' }
          );

          riverGroupRef.current?.addLayer(outerGlow);
          riverGroupRef.current?.addLayer(riverPolyline);
        } catch (riverErr) {
          console.warn('Failed to add river layer:', riverErr);
        }
      });
    }
  }, [isRiverLayerActive]);


  // 8. Update Heatmap Layer
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (isHeatmapActive && !lowBandwidth) {
      const heatData = filteredDistricts
        .filter((dist) => dist && isValidLatLng(dist.lat, dist.lng))
        .map((dist) => [dist.lat, dist.lng, dist.severity] as L.HeatLatLngTuple);

      if (heatData.length > 0) {
        try {
          heatLayerRef.current = (L as any)
            .heatLayer(heatData, {
              radius: 38,
              blur: 22,
              maxZoom: 10,
              max: 1.0,
              gradient: {
                0.2: MAP_HEAT_RAMP.calm,
                0.5: MAP_HEAT_RAMP.moderate,
                0.8: MAP_HEAT_RAMP.heavy,
              },
            })
            .addTo(mapInstanceRef.current);
        } catch (heatErr) {
          console.warn('Failed to add heatmap layer:', heatErr);
        }
      }
    }
  }, [isHeatmapActive, filteredDistricts, lowBandwidth]);

  // Nearest district details for current inspection point
  const nearestDistrictData = inspectedPoint ? findNearestDistrict(inspectedPoint.lat, inspectedPoint.lng) : null;


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      ref={mainWrapperRef}
      className={
        isFullScreen
          ? 'w-full h-full min-h-[360px] lg:min-h-[560px] h-dvh bg-carbon-05 overflow-hidden text-carbon-90 relative flex flex-col'
          : className
          ? className
          : `w-full ${customHeight || 'h-full min-h-[360px] lg:min-h-[560px]'} bg-carbon-10 overflow-hidden text-carbon-90 relative flex flex-col border border-carbon-20 rounded-2xl shadow-md`
      }
    >
      {!isFullScreen && (
        <div className="shrink-0 z-[var(--ap-z-sticky)] w-full flex flex-col bg-white border-b border-carbon-20">
          <MapToolbar
            collapsed={isHeaderCollapsed}
            onCollapsedChange={setIsHeaderCollapsed}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            highContrast={isHighContrastBoost}
            onHighContrastChange={setIsHighContrastBoost}
            exporting={isExportingMap}
            onExport={handleExportMapImage}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            forecastHorizon={forecastHorizon}
            onForecastHorizonChange={setForecastHorizon}
            isLive={isLive}
            liveCount={liveCount}
            predictionDate={predictionDate}
            hazardLayers={HAZARD_LAYERS}
            selectedHazards={selectedHazards}
            onToggleHazard={toggleHazard}
            onSelectAllHazards={selectAllHazards}
            onClearHazards={clearAllHazards}
            hazardCounts={hazardCounts}
            filteredCount={filteredDistricts.length}
            totalCount={liveDistricts.length}
            lowBandwidth={lowBandwidth}
          />
        </div>
      )}

      {/* Main Map Stage Container */}
      <div
        onMouseMove={handleActivity}
        onTouchStart={handleActivity}
        className="relative flex-1 min-h-[360px] z-0 bg-carbon-10 overflow-hidden flex flex-col"
      >
        {/* Data Processing Skeleton Overlay */}
        <AnimatePresence>
        {isProcessingData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[var(--ap-z-sticky)] p-6 bg-white flex flex-col justify-center"
          >
            <DataProcessingSkeleton
              title="PROCESSING SATELLITE TILES & HIGH-CONTRAST RASTER"
              subtitle="Streaming high resolution terrain raster over Bangladesh..."
              mode="map"
              onDismiss={() => setIsProcessingData(false)}
            />
          </motion.div>
        )}
        </AnimatePresence>

        <div
          className={`w-full flex-1 min-h-[360px] bg-carbon-10 map-perspective-container ${
            viewMode === 'table' ? 'hidden' : ''
          } ${isHighContrastBoost ? 'map-tile-high-contrast' : ''}`}
        >
          <div
            ref={mapContainerRef}
            role="region"
            aria-label="Interactive Bangladesh Hazard Leaflet GIS Map with keyboard-navigable district pins and risk data"
            /* `relative` makes the z-10 effective (z-index is ignored on
               static elements) — without it Leaflet's internal panes
               (z-index 200–1000) escape to the root stacking context and
               would paint over the sticky header (z-40). */
            className="relative w-full h-full min-h-[360px] z-10 bg-transparent pointer-events-auto"
          />
        </div>

        {viewMode === 'table' && (
          <MapDistrictTable
            districts={filteredDistricts}
            selectedDistrictId={selectedDistrictId}
            onSelectDistrict={(row) => {
              const found = filteredDistricts.find((d) => d.id === row.id);
              if (found) handleSelectDistrict(found);
            }}
          />
        )}

        {currentSelected && !inspectedPoint && (
          <div
            data-testid="district-forecast-slot"
            /* `relative z-20` keeps the in-flow mobile card above the overlay HUD
               (its attribution bar and hazard-action cluster are absolute
               `z-[var(--ap-z-sticky)]` = 10 children of the `inset-0` stage overlay and
               used to swallow the card's primary action at phone widths). */
            className="relative z-20 lg:absolute lg:top-4 lg:right-4 lg:w-[clamp(280px,28vw,340px)] lg:max-w-[calc(100%-2rem)] max-w-full shrink-0 w-full border-t lg:border-t-0 border-carbon-20 bg-white"
          >
            <DistrictForecastCard
              district={currentSelected}
              onClose={() => {
                onSelectDistrict?.(null as any);
              }}
              onOpenAnalytics={(districtId) => navigate(`/forecast/district/${districtId}`)}
              onOpenAdvisory={onOpenAdvisory}
            />
          </div>
        )}

        {/* Floating HUD Controls Container */}
        <div
          onMouseEnter={handleActivity}
          className={`absolute inset-0 pointer-events-none ${
            viewMode === 'table' ? 'hidden' : ''
          } ${isHudVisible ? 'opacity-100' : 'opacity-0'}`}
        >
          {/* Active Advisory Tier Status Strip (TASK-005) */}
          <div className="absolute top-4 left-4 z-[var(--ap-z-sticky)] pointer-events-auto hidden md:block">
            <StatusStrip counts={statusStripCounts} horizon={forecastHorizon} />
          </div>

          {/* Point Telemetry Click Inspection HUD */}
          <AnimatePresence>
          {inspectedPoint && nearestDistrictData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 lg:bottom-auto lg:top-4 left-0 right-0 lg:left-auto lg:right-4 z-[var(--ap-z-sticky)] pointer-events-auto lg:w-[clamp(280px,28vw,340px)] lg:max-w-[calc(100%-2rem)] max-w-full w-full"
            >
              <div className="bg-white border border-carbon-20 p-4 text-carbon-80 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2 border-b border-carbon-20 pb-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-carbon-60 uppercase tracking-wide">
                      Point inspection
                    </div>
                    <h4 className="text-base font-bold text-carbon-90 tracking-tight mt-1 font-mono tabular-nums">
                      {inspectedPoint.lat}° N, {inspectedPoint.lng}° E
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectedPoint(null)}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 hover:bg-carbon-10 text-carbon-70 flex items-center justify-center touch-manipulation"
                    aria-label="Close point inspection"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-carbon-05 border border-carbon-20 p-3 text-sm space-y-1">
                  <div className="flex justify-between font-semibold text-carbon-80 gap-2">
                    <span>Nearest district</span>
                    <span>{nearestDistrictData.district.name}</span>
                  </div>
                  <div className="flex justify-between text-carbon-70 font-mono text-xs tabular-nums">
                    <span>Distance to centre</span>
                    <span>{nearestDistrictData.distanceKm.toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between text-carbon-70 text-xs">
                    <span>Recorded hazard</span>
                    <span className="font-semibold text-carbon-90">{nearestDistrictData.district.hazardType}</span>
                  </div>
                  <div className="flex justify-between text-carbon-70 font-mono text-xs tabular-nums">
                    <span>Recorded severity</span>
                    <span className="font-semibold text-carbon-90">{Math.round(nearestDistrictData.district.severity * 100)}%</span>
                  </div>
                </div>

                <div className="my-0.5">
                  <LocationMap 
                    location={`${nearestDistrictData.district.name}, ${nearestDistrictData.district.division}`}
                    coordinates={`${inspectedPoint.lat.toFixed(4)}° N, ${inspectedPoint.lng.toFixed(4)}° E`}
                    lat={inspectedPoint.lat}
                    lng={inspectedPoint.lng}
                    hazardType={nearestDistrictData.district.hazardType}
                    severity={nearestDistrictData.district.severity}
                    risk={nearestDistrictData.district.risk}
                    division={nearestDistrictData.district.division}
                    elevation={nearestDistrictData.district.elevationMeters}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectDistrict(nearestDistrictData.district);
                      setInspectedPoint(null);
                    }}
                    className="flex-1 min-h-[44px] py-2 bg-primary text-ap-action-fg font-semibold text-sm text-center touch-manipulation"
                  >
                    Focus {nearestDistrictData.district.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedPoint(null)}
                    className="min-h-[44px] px-4 py-2 bg-carbon-05 border border-carbon-20 text-carbon-70 font-semibold text-sm touch-manipulation"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Distance Ruler & Hazard Measurement Floating HUD */}
          <AnimatePresence>
          {isMeasuring && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute top-4 left-4 right-4 lg:right-auto z-[var(--ap-z-sticky)] pointer-events-auto lg:max-w-[320px] w-auto"
            >
              <div className="bg-white text-carbon-90 border border-carbon-20 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-carbon-20 pb-2 text-xs font-bold">
                  <span className="flex items-center gap-2 text-carbon-90 uppercase tracking-wide">
                    Distance measure
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMeasuring(false);
                      setMeasurePoints([]);
                    }}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center touch-manipulation"
                    aria-label="Close measurement"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                {measurePoints.length === 0 && (
                  <div className="bg-carbon-80/80 p-2.5 border border-carbon-70 text-xs text-carbon-30 flex items-center gap-2">
                    <MaterialIcon name="touch_app" className="w-4 h-4 shrink-0 text-amber-300" />
                    <span>Click any location on the map to set <strong>Point 1 (Origin)</strong>.</span>
                  </div>
                )}

                {measurePoints.length === 1 && (
                  <div className="bg-carbon-80/80 p-2.5 border border-carbon-70 text-xs text-carbon-30 space-y-1">
                    <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                      <MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>Point 1 (Origin):</span>
                      <span>{findNearestDistrict(measurePoints[0][0], measurePoints[0][1]).district.name}</span>
                    </div>
                    <div className="text-xs text-amber-300 font-medium flex items-center gap-1">
                      <span className="animate-pulse"><MaterialIcon name="my_location" className="w-4 h-4 inline-block align-middle" /></span> Click a second location to set <strong>Point 2 (Destination)</strong> & calculate path hazards.
                    </div>
                  </div>
                )}

                {measurePoints.length >= 2 && pathAnalysis && (
                  <div className="text-xs space-y-2">
                    <div className="bg-carbon-80/90 p-2.5 border border-carbon-70 space-y-1.5">
                      <div className="flex items-center justify-between font-mono font-extrabold text-amber-300 text-sm">
                        <span>Distance:</span>
                        <span>
                          {pathAnalysis.totalDistanceKm.toFixed(2)} km{' '}
                          <span className="text-carbon-30 text-xs font-normal">
                            ({(pathAnalysis.totalDistanceKm * 0.621371).toFixed(2)} mi)
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-carbon-30">Path Span:</span>
                        <span className="font-bold text-carbon-20">
                          {pathAnalysis.startDistrict?.name}{' '}
                          <MaterialIcon name="arrow_forward" className="w-3 h-3 inline-block align-middle" />{' '}
                          {pathAnalysis.endDistrict?.name}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs border-t border-carbon-70/60 pt-1.5">
                        <span className="text-carbon-30">Max Hazard Severity:</span>
                        <span
                          className={`font-black px-1.5 py-0.5 rounded text-xs ${
 pathAnalysis.riskRating === 'High'
 ? 'bg-severity-high-surface text-severity-high border border-severity-high/40'
 : pathAnalysis.riskRating === 'Moderate'
 ? 'bg-severity-moderate-surface text-severity-moderate border border-severity-moderate/40'
 : 'bg-severity-low-surface text-severity-low border border-severity-low/40'
 }`}
                        >
                          {(pathAnalysis.maxSeverity * 100).toFixed(0)}% • {pathAnalysis.riskRating} Risk
                        </span>
                      </div>
                    </div>

                    {pathAnalysis.hazardsDetected.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-carbon-60 uppercase font-bold tracking-wider">
                          Intersects Hazard Zones:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {pathAnalysis.hazardsDetected.map((h, idx) => (
                            <span
                              key={idx}
                              className="text-xs font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200"
                            >
                              <MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-carbon-60 font-mono">
                      Transiting {pathAnalysis.districtsAlongPath.length} district(s):{' '}
                      <span className="text-carbon-60 font-sans font-medium">
                        {pathAnalysis.districtsAlongPath.map((d) => d.district.name).join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-carbon-70/80">
                  <button
                    onClick={() => setMeasurePoints([])}
                    className="flex-1 min-h-[44px] py-1.5 bg-carbon-80 hover:bg-carbon-70 text-carbon-20 font-bold text-xs transition-colors border border-carbon-70"
                  >
                    Reset Points
                  </button>
                  <button
                    onClick={() => {
                      setIsMeasuring(false);
                      setMeasurePoints([]);
                    }}
                    className="min-h-[44px] px-3 py-1.5 bg-primary hover:bg-primary-strong text-ap-action-fg font-semibold text-xs"
                  >
                    Exit Ruler
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {(exportSuccessMsg || userLocationError) && (
            <div
              role="status"
              className="absolute bottom-16 left-4 right-4 lg:right-auto lg:max-w-[320px] z-[var(--ap-z-sticky)] pointer-events-auto bg-white border border-carbon-20 p-4 text-base text-carbon-90"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 min-w-0">
                  {userLocationError || exportSuccessMsg}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExportSuccessMsg(null);
                    setUserLocationError(null);
                  }}
                  className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center shrink-0 touch-manipulation"
                  aria-label="Dismiss status"
                >
                  <MaterialIcon name="close" className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* District & hazard filters: 2026-10-05 restyle to the shared map
              language. One rounded floating sheet (a bottom sheet on phones,
              a centered card on desktop), a bold title with grey support text,
              hairline dividers between the two pickers, round division pills,
              hazard pills with coloured dots, and a sticky CTA row.
              44px targets throughout, both themes. */}
          <AnimatePresence>
          {isFilterModalOpen && (
            <div
              className="fixed inset-0 z-[var(--ap-z-modal)] bg-carbon-black/30 flex items-end sm:items-center justify-center sm:p-4 pointer-events-auto"
              onClick={(e) => { if (e.target === e.currentTarget) setIsFilterModalOpen(false); }}
            >
              <motion.div
                key="district-filter-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Division and hazard filters"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.98 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="w-full sm:max-w-md flex flex-col max-h-[88vh] sm:max-h-[80vh] overflow-hidden bg-white sm:rounded-xl rounded-t-xl shadow-map"
              >
                {/* grab + header */}
                <div className="shrink-0 px-5 pt-3 pb-3 border-b border-carbon-20">
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-carbon-20 sm:hidden" aria-hidden="true" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold tracking-tight text-carbon-90 dark:text-white">Districts & hazards</h3>
                      <p className="text-xs text-carbon-60">Narrow the national situational map</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close filters"
                      onClick={() => setIsFilterModalOpen(false)}
                      className="tap-target shrink-0 w-11 h-11 grid place-items-center rounded-full bg-carbon-05 text-carbon-50 hover:text-carbon-90 dark:hover:text-white hover:bg-carbon-10 dark:hover:bg-carbon-70 transition-colors"
                    >
                      <MaterialIcon name="close" className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-5">
                  {/* Divisions */}
                  <div className="py-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-carbon-60">Division</span>
                      {selectedDivision !== 'All' && (
                        <button
                          type="button"
                          onClick={() => setSelectedDivision('All')}
                          className="text-xs font-semibold text-ap-link hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[{ id: 'all', name: 'All' }, ...ALL_8_DIVISIONS].map((div) => {
                        const divName = div.id === 'all' ? 'All' : div.name.replace(' Division', '');
                        const selected = div.id === 'all'
                          ? selectedDivision === 'All'
                          : selectedDivision.toLowerCase() === divName.toLowerCase();
                        return (
                          <button
                            key={div.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedDivision(divName)}
                            className={`tap-target inline-flex min-h-[36px] items-center rounded-full px-3.5 text-xs font-bold transition-colors ${
                              selected
                                ? 'bg-carbon-90 text-ap-on-inverse '
                                : 'bg-carbon-05 text-carbon-60 hover:bg-carbon-10 dark:hover:bg-carbon-70 hover:text-carbon-90 dark:hover:text-white'
                            }`}
                          >
                            {divName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hazards */}
                  <div className="py-4 border-t border-carbon-20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-carbon-60">
                        Hazards ({selectedHazards.length}/{HAZARD_LAYERS.length})
                      </span>
                      <div className="flex items-center gap-3 text-xs font-semibold">
                        <button type="button" onClick={selectAllHazards} className="text-ap-link hover:underline">All</button>
                        <button type="button" onClick={clearAllHazards} className="text-ap-link hover:underline">None</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {HAZARD_LAYERS.map((hazard) => {
                        const selected = selectedHazards.includes(hazard.id);
                        return (
                          <button
                            key={hazard.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleHazard(hazard.id)}
                            className={`tap-target inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-colors ${
                              selected
                                ? 'border-transparent bg-carbon-90 text-ap-on-inverse '
                                : 'border-carbon-20 text-carbon-60 hover:border-carbon-30 dark:hover:border-carbon-60 hover:text-carbon-90 dark:hover:text-white'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hazard.color }} aria-hidden="true" />
                            {hazard.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-carbon-60">
                      Showing {filteredDistricts.length} of {liveDistricts.length} districts
                    </p>
                  </div>
                </div>

                {/* sticky CTA row */}
                <div className="shrink-0 flex items-center gap-2 px-5 py-4 border-t border-carbon-20 bg-white">
                  <button
                    type="button"
                    aria-label="Reset division and hazard filters"
                    onClick={() => { setSelectedDivision('All'); selectAllHazards(); setSearchQuery(''); }}
                    className="tap-target min-h-[44px] rounded-full px-5 bg-carbon-05 hover:bg-carbon-10 dark:hover:bg-carbon-70 text-carbon-70 font-bold text-xs transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFilterModalOpen(false)}
                    className="flex-1 min-h-[44px] rounded-full bg-carbon-90 hover:bg-carbon-80 dark:hover:bg-carbon-10 text-carbon-05 font-black text-xs transition-all"
                  >
                    Show {filteredDistricts.length} districts
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          {/* Layer panel — one floating card, three flat sections: ground,
              overlays, hazards. Rows are icon + name + one pill, never a box
              inside a box. Ground is a two-way segmented control (street & topo,
              satellite); the satellite ground steps back to the street map on
              its own if Esri stops answering (see useLeafletMap watchdog).
              Every source on screen names its credit in the attribution
              lightbox. The panel this replaced stacked six sections, including
              the offline tile store that bulk-downloaded all of Bangladesh from
              OpenStreetMap's volunteer-run servers (deleted 2026-10-05 as the
              abuse named at osm.wiki/blocked) and a "Doppler radar" toggle that
              drew hard-coded storm cells — data with no artifact behind it. */}
          <AnimatePresence>
          {isLayerModalOpen && (
            <div className="fixed inset-0 z-[var(--ap-z-modal)] bg-carbon-black/40 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="w-full max-w-sm rounded-xl bg-white border border-carbon-20 p-5 sm:p-6 flex flex-col gap-5 max-h-[85vh] overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="map-layers-title"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 id="map-layers-title" className="text-lg font-bold tracking-tight text-carbon-90 dark:text-white">Map layers</h3>
                  <button
                    type="button"
                    onClick={() => setIsLayerModalOpen(false)}
                    className="tap-target w-11 h-11 rounded-full bg-carbon-10 hover:bg-carbon-20 dark:hover:bg-carbon-70 text-carbon-60 flex items-center justify-center transition-colors"
                    aria-label="Close map layers"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                {/* Ground: two basemaps, one at a time. */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-carbon-60 mb-2.5">
                    {LIVE_SECTIONS[0].label}
                  </p>
                  <div className="flex gap-1 rounded-full bg-carbon-10 p-1" role="radiogroup" aria-label="Basemap">
                    {LIVE_LAYERS.filter((l) => l.kind === 'basemap').map((def) => {
                      const isSelected = activeLayer === def.mapLayerKey;
                      const isDisabled = def.mapLayerKey === 'esriSatellite' && isEsriUnavailable;
                      return (
                        <button
                          key={def.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={isDisabled}
                          onClick={() => def.mapLayerKey && setActiveLayer(def.mapLayerKey)}
                          className={`flex-1 min-h-[44px] rounded-full px-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-carbon-90 text-ap-on-inverse shadow-sm'
                              : 'text-carbon-60 hover:text-carbon-90 dark:hover:text-white'
                          }`}
                          title={isDisabled ? 'Satellite tiles are not answering right now' : def.name}
                        >
                          <MaterialIcon name={def.icon} className="w-4 h-4" />
                          {def.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Overlays: flat rows, icon + name + one On/Off pill each. */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-carbon-60 mb-1.5">
                    {LIVE_SECTIONS[1].label}
                  </p>
                  <ul className="flex flex-col" role="group" aria-labelledby="map-layers-title">
                    {LIVE_LAYERS.filter((l) => l.section === 'overlays').map((def) => {
                      if (def.id === 'overlay-wind') {
                        // Wind row (Phase E): model chip with the cycle time,
                        // issue/valid times in the expansion, honest states only.
                        const isActive = isWindActive;
                        const isUnavailable = windStatus === 'unavailable';
                        const isLoading = windStatus === 'loading';
                        const chipLabel = !isActive
                          ? 'Off'
                          : isLoading
                            ? 'Loading'
                            : isUnavailable
                              ? 'UNAVAILABLE'
                              : windChipLabel(windFeed);
                        const chipActive = isActive && !isUnavailable && !isLoading && windFeed.kind === 'live';
                        return (
                          <li key={def.id} className="py-2.5">
                            <div className="flex items-center justify-between gap-3 min-h-[52px]">
                              <span className="flex items-center gap-3">
                                <MaterialIcon name={def.icon} className="w-5 h-5 text-carbon-60 shrink-0" />
                                <span className="flex flex-col">
                                  <span className="text-ap-caption font-semibold text-carbon-90">{def.name}</span>
                                  {def.caption ? (
                                    <span className="text-xs text-carbon-60">{def.caption}</span>
                                  ) : null}
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                {isActive || isUnavailable ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsWindExpanded(!isWindExpanded)}
                                    aria-expanded={isWindExpanded}
                                    aria-label={isWindExpanded ? 'Hide wind details' : 'Show wind details'}
                                    className="tap-target w-11 h-11 rounded-full text-carbon-60 hover:bg-carbon-10 dark:hover:bg-carbon-80 flex items-center justify-center transition-colors"
                                  >
                                    <MaterialIcon name={isWindExpanded ? 'expand_less' : 'expand_more'} className="w-5 h-5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsWindActive(!isActive);
                                    if (isActive) setIsWindExpanded(false);
                                  }}
                                  aria-pressed={isActive}
                                  title={
                                    isUnavailable
                                      ? 'The wind pipeline has no artifact to show right now.'
                                      : isActive
                                        ? 'Turn the wind field off'
                                        : 'Animate the latest modelled wind field'
                                  }
                                  className={`min-h-[40px] px-4 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                                    chipActive
                                      ? 'bg-carbon-90 text-ap-on-inverse '
                                      : 'bg-carbon-10 text-carbon-50 '
                                  }`}
                                >
                                  {chipLabel}
                                </button>
                              </span>
                            </div>

                            {isUnavailable ? (
                              <p className="text-xs leading-[1.62] text-carbon-60 pl-8 pt-1">
                                No wind field is available right now. The pipeline publishes a new one every six hours
                                from GFS, falling back to ECMWF open data; if this message stays, the latest run could
                                not reach either model.
                              </p>
                            ) : null}

                            {isActive && isWindExpanded && windStatus === 'ready' && windArtifact ? (
                              <div className="mt-2 pl-8 flex flex-col gap-2">
                                <p className="text-sm font-semibold text-carbon-90 dark:text-white">
                                  {windArtifact.model_name}
                                </p>
                                <p className="text-xs leading-[1.62] text-carbon-60">
                                  {windArtifact.kind === 'forecast'
                                    ? `${windArtifact.step_hours}-hour forecast.`
                                    : 'Analysis (zero-hour) field.'}{' '}
                                  Issued {windArtifact.issue_time.slice(11, 16)} UTC · valid{' '}
                                  {windArtifact.valid_time.slice(11, 16)} UTC
                                  {windFeed.kind === 'stale' ? ' · older than the six-hourly schedule; last good field kept' : ''}.
                                </p>
                                <p className="text-xs leading-[1.62] text-carbon-60">
                                  What this is: air flowing through one model field over Bangladesh and the Bay of Bengal,
                                  resampled to 1 degree. What it is not: an observation, or a movie of the forecast
                                  advancing. The animation does not advance forecast time.
                                </p>
                              </div>
                            ) : null}

                            {isActive && isWindExpanded && isLoading ? (
                              <p className="text-xs leading-[1.62] text-carbon-60 pl-8 pt-2">
                                Fetching the latest wind artifact.
                              </p>
                            ) : null}
                          </li>
                        );
                      }

                      if (def.id === 'overlay-rain') {
                        // GPM IMERG rain-rate row (Phase D): amber NRT chip,
                        // six-frame replay, mm/h legend, honest unavailable state.
                        const isActive = isRainActive;
                        const isUnavailable = rainStatus === 'unavailable';
                        const chipLabel = !isActive
                          ? 'Off'
                          : isUnavailable
                            ? mapFreshnessLabel({ kind: 'unavailable' })
                            : mapFreshnessLabel({ kind: 'nrt', lag: def.freshness?.cadence ?? '30 min' });
                        const chipAmber = isActive && !isUnavailable;
                        const latestRainIso = rainFrames[rainFrameIndex] ?? null;
                        const nowUtcLabel = `${new Date().toISOString().slice(11, 16)} UTC`;
                        return (
                          <li key={def.id} className="py-2.5">
                            <div className="flex items-center justify-between gap-3 min-h-[52px]">
                              <span className="flex items-center gap-3">
                                <MaterialIcon name={def.icon} className="w-5 h-5 text-carbon-60 shrink-0" />
                                <span className="flex flex-col">
                                  <span className="text-ap-caption font-semibold text-carbon-90">{def.name}</span>
                                  {def.caption ? (
                                    <span className="text-xs text-carbon-60">{def.caption}</span>
                                  ) : null}
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                {isActive || isUnavailable ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsRainExpanded(!isRainExpanded)}
                                    aria-expanded={isRainExpanded}
                                    aria-label={isRainExpanded ? 'Hide rain controls' : 'Show rain controls'}
                                    className="tap-target w-11 h-11 rounded-full text-carbon-60 hover:bg-carbon-10 dark:hover:bg-carbon-80 flex items-center justify-center transition-colors"
                                  >
                                    <MaterialIcon name={isRainExpanded ? 'expand_less' : 'expand_more'} className="w-5 h-5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsRainActive(!isActive);
                                    if (isActive) setIsRainExpanded(false);
                                  }}
                                  aria-pressed={isActive}
                                  title={
                                    isUnavailable
                                      ? 'GIBS is not answering right now. See the NASA Earthdata status page.'
                                      : isActive
                                        ? 'Turn the rain-rate overlay off'
                                        : 'Show the newest IMERG rain-rate frames'
                                  }
                                  className={`min-h-[40px] px-4 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                                    chipAmber
                                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                      : 'bg-carbon-10 text-carbon-50 '
                                  }`}
                                >
                                  {chipLabel}
                                </button>
                              </span>
                            </div>

                            {isUnavailable ? (
                              <p className="text-xs leading-[1.62] text-carbon-60 pl-8 pt-1">
                                Rain-rate tiles are not answering right now. Try again shortly, or check{' '}
                                <a
                                  href={GIBS_STATUS_URL}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline underline-offset-2 text-carbon-90"
                                >
                                  NASA Earthdata status
                                </a>
                                . The district forecast card still carries the precipitation outlook in the meantime.
                              </p>
                            ) : null}

                            {isActive && isRainExpanded && rainStatus === 'ready' && rainFrames.length > 0 && latestRainIso ? (
                              <div className="mt-2 pl-8 flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setIsRainPlaying(!isRainPlaying)}
                                    disabled={rainFrames.length < 2}
                                    aria-label={isRainPlaying ? 'Pause the rain replay' : 'Play the rain replay'}
                                    className="tap-target w-11 h-11 rounded-full bg-carbon-90 text-carbon-05 flex items-center justify-center disabled:opacity-40 transition-colors"
                                  >
                                    <MaterialIcon name={isRainPlaying ? 'pause' : 'play_arrow'} className="w-5 h-5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRainFrameIndex(Math.max(0, rainFrameIndex - 1))}
                                    disabled={rainFrameIndex <= 0}
                                    aria-label="One frame newer"
                                    className="tap-target w-11 h-11 rounded-full bg-carbon-10 text-carbon-70 flex items-center justify-center disabled:opacity-40 transition-colors"
                                  >
                                    <MaterialIcon name="chevron_left" className="w-5 h-5" />
                                  </button>
                                  <span className="flex flex-col items-center min-w-[120px]">
                                    <span className="text-sm font-bold text-carbon-90 dark:text-white tabular-nums">
                                      {gibsTimeLabel(latestRainIso)}
                                    </span>
                                    <span className="text-xs text-carbon-60">
                                      {rainFrameIndex === 0
                                        ? 'Latest frame'
                                        : `${rainFrameIndex * 30} min earlier`}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setRainFrameIndex(Math.min(rainFrames.length - 1, rainFrameIndex + 1))}
                                    disabled={rainFrameIndex >= rainFrames.length - 1}
                                    aria-label="One frame older"
                                    className="tap-target w-11 h-11 rounded-full bg-carbon-10 text-carbon-70 flex items-center justify-center disabled:opacity-40 transition-colors"
                                  >
                                    <MaterialIcon name="chevron_right" className="w-5 h-5" />
                                  </button>
                                </div>
                                <p className="text-xs text-carbon-60">
                                  Observed {gibsTimeLabel(latestRainIso)} · now {nowUtcLabel}
                                </p>

                                <div className="flex flex-col gap-1">
                                  <div
                                    className="h-2.5 rounded-full"
                                    style={{
                                      background: `linear-gradient(to right, ${MAP_RAIN_RAMP.trace} 0%, ${MAP_RAIN_RAMP.light} 20%, ${MAP_RAIN_RAMP.moderate} 40%, ${MAP_RAIN_RAMP.heavy} 60%, ${MAP_RAIN_RAMP.intense} 80%, ${MAP_RAIN_RAMP.extreme} 100%)`,
                                    }}
                                    role="img"
                                    aria-label="Rain-rate colour ramp from trace to extreme, in millimetres per hour"
                                  />
                                  <div className="flex justify-between text-xs text-carbon-60 tabular-nums">
                                    <span>0.1</span>
                                    <span>0.5</span>
                                    <span>1</span>
                                    <span>2</span>
                                    <span>4</span>
                                    <span>10+ mm/h</span>
                                  </div>
                                  <p className="flex items-center gap-1.5 text-xs text-carbon-60">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MAP_RAIN_RAMP.snowLight }} />
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MAP_RAIN_RAMP.snowModerate }} />
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MAP_RAIN_RAMP.snowHeavy }} />
                                    Cyan to purple is snowfall, shown as liquid-water equivalent.
                                  </p>
                                </div>

                                <p className="text-xs leading-[1.62] text-carbon-60">
                                  Rainfall rate in millimetres per hour: the depth that would accumulate in an hour if this
                                  rate persisted. Near-real-time multi-satellite estimate at about 10 km resolution with
                                  roughly a four-hour lag, not gauge data. Colour boundaries are approximate; the tiles are
                                  rendered by NASA GIBS.
                                </p>
                              </div>
                            ) : null}

                            {isActive && isRainExpanded && rainStatus === 'loading' ? (
                              <p className="text-xs leading-[1.62] text-carbon-60 pl-8 pt-2">
                                Finding the newest rain frames.
                              </p>
                            ) : null}
                          </li>
                        );
                      }

                      if (def.id === 'overlay-truecolor') {
                        // True-colour satellite row (Phase C): freshness chip,
                        // expandable date + opacity controls, honest states only.
                        const isActive = isTrueColorActive;
                        const isUnavailable = trueColorStatus === 'unavailable';
                        const chipLabel = !isActive
                          ? 'Off'
                          : isUnavailable
                            ? mapFreshnessLabel({ kind: 'unavailable' })
                            : trueColorOffset > 0 && trueColorDateIso
                              ? trueColorDateIso
                              : mapFreshnessLabel({ kind: 'nrt', lag: def.freshness?.cadence ?? '4 h' });
                        const chipAmber = isActive && !isUnavailable && trueColorOffset === 0;
                        return (
                          <li key={def.id} className="py-2.5">
                            <div className="flex items-center justify-between gap-3 min-h-[52px]">
                              <span className="flex items-center gap-3">
                                <MaterialIcon name={def.icon} className="w-5 h-5 text-carbon-60 shrink-0" />
                                <span className="flex flex-col">
                                  <span className="text-ap-caption font-semibold text-carbon-90">{def.name}</span>
                                  {def.caption ? (
                                    <span className="text-xs text-carbon-60">{def.caption}</span>
                                  ) : null}
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                {isActive || isUnavailable ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsTrueColorExpanded(!isTrueColorExpanded)}
                                    aria-expanded={isTrueColorExpanded}
                                    aria-label={isTrueColorExpanded ? 'Hide satellite controls' : 'Show satellite controls'}
                                    className="tap-target w-11 h-11 rounded-full text-carbon-60 hover:bg-carbon-10 dark:hover:bg-carbon-80 flex items-center justify-center transition-colors"
                                  >
                                    <MaterialIcon name={isTrueColorExpanded ? 'expand_less' : 'expand_more'} className="w-5 h-5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsTrueColorActive(!isActive);
                                    if (isActive) setIsTrueColorExpanded(false);
                                  }}
                                  aria-pressed={isActive}
                                  title={
                                    isUnavailable
                                      ? 'GIBS is not answering right now. See the NASA Earthdata status page.'
                                      : isActive
                                        ? 'Turn true-colour satellite imagery off'
                                        : 'Show the newest available true-colour satellite imagery'
                                  }
                                  className={`min-h-[40px] px-4 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                                    chipAmber
                                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                      : isActive && !isUnavailable
                                        ? 'bg-carbon-90 text-ap-on-inverse '
                                        : 'bg-carbon-10 text-carbon-50 '
                                  }`}
                                >
                                  {chipLabel}
                                </button>
                              </span>
                            </div>

                            {isUnavailable ? (
                              <p className="text-xs leading-[1.62] text-carbon-60 pl-8 pt-1">
                                Satellite imagery is not answering right now. Try again in a few minutes, or check{' '}
                                <a
                                  href={GIBS_STATUS_URL}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline underline-offset-2 text-carbon-90"
                                >
                                  NASA Earthdata status
                                </a>
                                .
                              </p>
                            ) : null}

                            {isActive && isTrueColorExpanded && trueColorStatus === 'ready' && trueColorPlan && trueColorDateIso ? (
                              <div className="mt-2 pl-8 flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setTrueColorOffset(Math.min(2, trueColorOffset + 1))}
                                    disabled={trueColorOffset >= 2}
                                    aria-label="One day earlier"
                                    className="tap-target w-11 h-11 rounded-full bg-carbon-10 text-carbon-70 flex items-center justify-center disabled:opacity-40 transition-colors"
                                  >
                                    <MaterialIcon name="chevron_left" className="w-5 h-5" />
                                  </button>
                                  <span className="flex flex-col items-center min-w-[132px]">
                                    <span className="text-sm font-bold text-carbon-90 dark:text-white tabular-nums">{trueColorDateIso}</span>
                                    <span className="text-xs text-carbon-60">
                                      {trueColorOffset === 0 ? 'Newest available' : `${trueColorOffset} ${trueColorOffset === 1 ? 'day' : 'days'} earlier`}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setTrueColorOffset(Math.max(0, trueColorOffset - 1))}
                                    disabled={trueColorOffset <= 0}
                                    aria-label="One day newer"
                                    className="tap-target w-11 h-11 rounded-full bg-carbon-10 text-carbon-70 flex items-center justify-center disabled:opacity-40 transition-colors"
                                  >
                                    <MaterialIcon name="chevron_right" className="w-5 h-5" />
                                  </button>
                                </div>
                                <label className="flex flex-col gap-1.5">
                                  <span className="flex items-center justify-between text-xs text-carbon-60">
                                    <span>Imagery opacity</span>
                                    <span className="font-semibold tabular-nums">{trueColorOpacity}%</span>
                                  </span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={trueColorOpacity}
                                    onChange={(e) => setTrueColorOpacity(Number(e.target.value))}
                                    aria-label="Imagery opacity"
                                    className="w-full accent-carbon-90 dark:accent-white min-h-[44px]"
                                  />
                                </label>
                                <p className="text-xs leading-[1.62] text-carbon-60">
                                  {trueColorPlan.source.name} · {trueColorPlan.source.resolution} · usually available{' '}
                                  {trueColorPlan.source.typicalLag} after the satellite pass.
                                  {trueColorPlan.degraded
                                    ? ' MODIS Terra is not answering right now, so this shows VIIRS SNPP instead.'
                                    : ''}
                                </p>
                                <p className="text-xs leading-[1.62] text-carbon-60">
                                  What this is: a true-colour photograph of Bangladesh from space on the date above. What it
                                  is not: a live feed. Imagery arrives a few hours after acquisition and clouds can hide the
                                  ground.
                                </p>
                              </div>
                            ) : null}

                            {isActive && isTrueColorExpanded && trueColorStatus === 'loading' ? (
                              <p className="text-xs leading-[1.62] text-carbon-60 pl-8 pt-2">
                                Finding the newest available imagery.
                              </p>
                            ) : null}
                          </li>
                        );
                      }

                      const toggle = overlayToggles[def.id];
                      return (
                        <li key={def.id} className="flex items-center justify-between gap-3 py-2.5 min-h-[52px]">
                          <span className="flex items-center gap-3">
                            <MaterialIcon name={def.icon} className="w-5 h-5 text-carbon-60 shrink-0" />
                            <span className="flex flex-col">
                              <span className="text-ap-caption font-semibold text-carbon-90">{def.name}</span>
                              {def.caption ? (
                                <span className="text-xs text-carbon-60">{def.caption}</span>
                              ) : null}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle.set(!toggle.value)}
                            aria-pressed={toggle.value}
                            className={`min-h-[40px] px-4 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                              toggle.value
                                ? 'bg-carbon-90 text-ap-on-inverse '
                                : 'bg-carbon-10 text-carbon-50 '
                            }`}
                          >
                            {toggle.value ? 'On' : 'Off'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Hazards: hairline chips, colored dot + name. A chip is on while
                    its hazard type is in the marker filter. */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-carbon-60 mb-2.5">
                    {LIVE_SECTIONS[2].label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {HAZARD_LAYERS.map((h) => {
                      const isOn = selectedHazards.includes(h.id);
                      return (
                        <button
                          key={h.id}
                          type="button"
                          aria-pressed={isOn}
                          onClick={() =>
                            setSelectedHazards((prev) =>
                              prev.includes(h.id) ? prev.filter((id) => id !== h.id) : [...prev, h.id]
                            )
                          }
                          className={`min-h-[40px] px-3.5 rounded-full border text-sm font-semibold flex items-center gap-2 transition-colors ${
                            isOn
                              ? 'border-carbon-30 text-carbon-90 dark:text-white'
                              : 'border-carbon-20 text-carbon-50 '
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: h.color, opacity: isOn ? 1 : 0.35 }}
                          />
                          {h.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer: attribution entry on the left, high-contrast Done pill on the right. */}
                <div className="flex items-center justify-between gap-3 border-t border-carbon-20 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAttributionOpen(true)}
                    className="min-h-[44px] px-1 flex items-center gap-1.5 text-xs font-medium text-carbon-60 hover:text-carbon-90 dark:hover:text-white transition-colors"
                  >
                    <MaterialIcon name="info" className="w-4 h-4" />
                    Data attribution ({attributionList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLayerModalOpen(false)}
                    className="min-h-[44px] px-6 rounded-full bg-carbon-90 hover:bg-carbon-80 dark:hover:bg-carbon-10 text-carbon-05 text-sm font-bold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          {/* Data attribution lightbox: exactly the credits of what is on screen,
              each with its licence and a pointer to the provider's terms. */}
          <AnimatePresence>
          {isAttributionOpen && (
            <div className="fixed inset-0 z-[var(--ap-z-modal)] bg-carbon-black/50 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="w-full max-w-sm rounded-xl bg-white border border-carbon-20 p-5 sm:p-6 flex flex-col gap-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="data-attribution-title"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 id="data-attribution-title" className="text-lg font-bold tracking-tight text-carbon-90 dark:text-white">Data attribution</h3>
                  <button
                    type="button"
                    onClick={() => setIsAttributionOpen(false)}
                    className="tap-target w-11 h-11 rounded-full bg-carbon-10 hover:bg-carbon-20 dark:hover:bg-carbon-70 text-carbon-60 flex items-center justify-center transition-colors"
                    aria-label="Close data attribution"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>
                <ul className="flex flex-col gap-4">
                  {attributionList.map((credit) => (
                    <li key={credit.id} className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-carbon-90">{credit.label}</p>
                      <p className="text-xs text-carbon-60">
                        {credit.licence} ·{' '}
                        <a
                          href={credit.href}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-carbon-90 dark:hover:text-white"
                        >
                          source terms
                        </a>
                      </p>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

                    {/* Bottom-Center Floating Clear Search & Inspect Pill */}
          <AnimatePresence>
          {(searchQuery || inspectedPoint || measurePoints.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-20 sm:bottom-12 left-1/2 z-[var(--ap-z-sticky)] pointer-events-auto flex items-center gap-2 max-w-[90vw]"
            >
              <button
                onClick={() => {
                  setSearchQuery('');
                  setInspectedPoint(null);
                  setMeasurePoints([]);
                  setIsolateSelected(false);
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.flyTo([23.8103, 90.4125], 7, { duration: 1.2 });
                  }
                }}
                className="min-h-[44px] px-4 py-2 glass-pill text-carbon-90 font-semibold text-sm flex items-center gap-2 touch-manipulation hover:bg-white transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-carbon-90 text-carbon-05 flex items-center justify-center text-xs"><MaterialIcon name="close" className="w-4 h-4" /></span>
                  <span>Clear Active Overlays & Filter</span>
                </span>
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Bottom-right map controls — one 48px circular button per job. The "+"
              hazard-actions menu that used to sit here opened seventeen options at once;
              on 2026-10-05 it became these three controls plus Leaflet's native zoom.
              On phones they sit above the bottom-center clear pill so the two never
              overlap. Opaque white, visible focus, no glass. */}
          <div className="absolute bottom-32 sm:bottom-14 right-3 sm:right-5 z-[var(--ap-z-sticky)] pointer-events-auto flex flex-col items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsFilterModalOpen(true)}
              className="tap-target w-12 h-12 bg-white hover:bg-carbon-05 border border-carbon-20 text-carbon-80 flex items-center justify-center rounded-full shadow-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-primary"
              title="Filters"
              aria-label="Open district and hazard filters"
            >
              <MaterialIcon name="tune" className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsLayerModalOpen(true)}
              className="tap-target w-12 h-12 bg-white hover:bg-carbon-05 border border-carbon-20 text-carbon-80 flex items-center justify-center rounded-full shadow-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-primary"
              title="Map overlays"
              aria-label="Open map overlays"
            >
              <MaterialIcon name="layers" className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleCenterOnUserLocation}
              className={`tap-target w-12 h-12 border flex items-center justify-center rounded-full shadow-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-primary ${
                userGpsPos
                  ? 'bg-primary text-ap-action-fg border-ap-primary hover:bg-primary-strong'
                  : 'bg-white hover:bg-carbon-05 border-carbon-20 text-carbon-80'
              }`}
              title="Center the map on my location"
              aria-label="Center the map on my location"
            >
              <MaterialIcon name={isLocatingUser ? 'gps_fixed' : 'my_location'} className={`w-5 h-5 ${isLocatingUser ? 'animate-pulse' : ''}`} />
            </button>
          </div>

          {/* Coordinates Readout, Performance Clustering & IndexedDB Tile Cache Indicator */}
          {/* Attribution as plain map text (2026-10-05 restyle): no card, no panel,
              the smallest readable size, with a soft shadow so it stays legible
              over any ground. Every character stays visible (map attribution is
              not collapsible), it just stops pretending to be chrome. */}
          <div className="absolute bottom-1.5 left-2 z-[var(--ap-z-sticky)] text-xs leading-snug text-carbon-60 [text-shadow:0_1px_2px_rgba(255,255,255,0.7),0_0_6px_rgba(255,255,255,0.5)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_0_6px_rgba(0,0,0,0.6)] pointer-events-auto max-w-[calc(100%-7rem)]">
            <p className="leading-snug">
              {MAP_LAYERS[activeLayer]?.attribution?.replace(/&copy;/g, '©').replace(/&mdash;/g, '—') || 'Map data © OpenStreetMap contributors'}
            </p>
          </div>

          <div className="absolute bottom-2 right-16 z-[var(--ap-z-sticky)] glass-pill px-4 py-2 text-xs font-mono font-semibold text-carbon-70 pointer-events-auto hidden lg:flex items-center gap-3 tabular-nums">
            <span>Lat {currentCoords.lat.toFixed(4)}° N</span>
            <span>Lng {currentCoords.lng.toFixed(4)}° E</span>
            <span>Zoom {currentCoords.zoom}</span>
            <button
              type="button"
              onClick={() => setIsClusteringActive(!isClusteringActive)}
              className="min-h-[44px] px-3.5 rounded-full border border-carbon-20 bg-white/70 hover:bg-white text-carbon-70 hover:text-carbon-90 text-xs font-semibold transition-colors"
              title="Toggle district marker clustering"
            >
              {isClusteringActive ? 'Clustered' : '64 pins'}
            </button>
          </div>
        </div>
      </div>

      {/* Exterior Bottom Quick Jumps Bar */}
      <AnimatePresence>
      {!isFullScreen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="p-4 bg-carbon-05 border-t border-carbon-20 rounded-b-2xl flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2">
            
            <span className="font-extrabold text-carbon-70 text-xs uppercase tracking-wider font-mono">
              Agricultural Vulnerability Hotspot Quick Jumps:
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none whitespace-nowrap py-1 touch-scroll w-full sm:w-auto shrink-0">
            {[
              { label: 'Haor Flash Flood (Sunamganj)', id: 'sunamganj' },
              { label: 'Northern Char (Kurigram)', id: 'kurigram' },
              { label: 'Coastal Saline (Satkhira)', id: 'satkhira' },
              { label: 'Barind Drought (Rajshahi)', id: 'rajshahi' },
              { label: 'Coastal Surge (Cox\'s Bazar)', id: 'coxsbazar' },
            ].map((preset) => {
              const isAct = selectedDistrictId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    const target = liveDistricts.find((d) => d.id === preset.id);
                    if (target) handleSelectDistrict(target);
                  }}
                  className={`min-h-[44px] px-3.5 rounded-full border text-xs font-semibold touch-manipulation transition-colors ${
 isAct
 ? 'bg-primary border-ap-primary text-ap-action-fg '
 : 'bg-white border-carbon-20 text-carbon-70 hover:text-carbon-90 hover:bg-carbon-10'
 }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LiveMapView;
