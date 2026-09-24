import MaterialIcon from "./MaterialIcon";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapLegend } from './map/MapLegend';
import MapToolbar, { type MapViewMode } from './map/MapToolbar';
import MapDistrictTable from './map/MapDistrictTable';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.heat';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, Filter, Layers, RefreshCw, 
  ZoomIn, ZoomOut, Navigation, Maximize, 
  Camera, RotateCcw, Flame, Ruler, Waves, Radio, 
  Contrast, Compass, Box, Share2, Download, Copy,
  Image as ImageIcon,
  HardDrive, Wifi, WifiOff, Trash2, CloudDownload
} from 'lucide-react';
import { AnimatedSocialIcons } from './ui/floating-action-button';
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
import { useTileCache } from '../hooks/useTileCache';
import { useLiveDistricts } from '../hooks/useForecasts';
import { type ForecastHorizon } from '../lib/forecasts';

export type { DistrictGeo, PathAnalysisResult, MapLayerKey };
export const liveDistrictsData: DistrictGeo[] = ALL_64_DISTRICTS;
export {
  getDistrictBoundaryCoordinates,
  calculateDistanceKm,
  findNearestDistrict,
  analyzePathBetweenPoints,
  MAP_LAYERS,
};

// River data, hazard layer registry & marker icon builder moved to
// ./map/mapPrimitives (see P2 decomposition plan in docs/audits/).
import { BANGLADESH_RIVERS, HAZARD_LAYERS, createCustomIcon, hazardMarkerLabel } from './map/mapPrimitives';
import DistrictForecastCard from './map/DistrictForecastCard';
import type { HazardLayerDef } from './map/mapPrimitives';

interface LiveMapViewProps {
  onSelectDistrict?: (district: { id: string; name: string; division: string; lat: number; lng: number; risk: 'Low' | 'Moderate' | 'High'; mainCrop: string }) => void;
  selectedDistrictId?: string;
  selectedDivision?: string;
  onSelectDivision?: (divisionName: string) => void;
  onOpenDisasterModal?: (districtId: string) => void;
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
  const [activeLayer, setActiveLayer] = useState<keyof typeof MAP_LAYERS>('esriSatellite');
  const [isHighContrastBoost, setIsHighContrastBoost] = useState<boolean>(true);
  const [isHeatmapActive, setIsHeatmapActive] = useState<boolean>(false);
  const [isRiverLayerActive, setIsRiverLayerActive] = useState<boolean>(true);
  const [isRadarActive, setIsRadarActive] = useState<boolean>(false);
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
  const [is3DTilted, setIs3DTilted] = useState<boolean>(false);
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // New features: Fullscreen, Legend Panel
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState<boolean>(false);

  // High-Resolution Export Modal & Sharing State
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportScale, setExportScale] = useState<number>(3); // 3 = Ultra HD 4K (300 DPI), 2 = 2K HD, 1.5 = Standard 1080p
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const [includeWatermarkHeader, setIncludeWatermarkHeader] = useState<boolean>(true);
  const [includeOverlayLegend, setIncludeOverlayLegend] = useState<boolean>(true);
  const [customReportTitle, setCustomReportTitle] = useState<string>('Bangladesh Multi-Hazard Geospatial Intelligence Report');

  // Floating Action Button feature states (Report Hazard, Filter, Layers, Sync)
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportHazardType, setReportHazardType] = useState<string>('Flash Flood');
  const [reportSeverity, setReportSeverity] = useState<number>(0.75);
  const [reportDistrictId, setReportDistrictId] = useState<string>(liveDistrictsData[0]?.id || 'dhaka');
  const [reportNotes, setReportNotes] = useState<string>('');
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);
  const [isLayerModalOpen, setIsLayerModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

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
  } = useLeafletMap(mapContainerRef, activeLayer, {
    onMapClick: (lat, lng) => {
      if (isMeasuringRef.current) {
        setMeasurePoints((prev) => [...prev, [lat, lng]]);
      } else {
        setInspectedPoint({ lat, lng });
      }
    },
    onAutoLocateDistrict: (district) => {
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
  });

  useEffect(() => {
    if (viewMode !== 'map') return;
    const id = window.setTimeout(() => mapInstanceRef.current?.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [viewMode]);

  // Extracted Hook 2: useTileCache (IndexedDB Tile Caching & Offline Emergency Storage)
  const {
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
  } = useTileCache();

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
  const baseMapName = MAP_LAYERS[activeLayer]?.name || 'Satellite HD';
  const selectedInfo = currentSelected
    ? `${currentSelected.name} District (${(currentSelected.severity * 100).toFixed(0)}% Risk)`
    : 'Bangladesh National Overview';
  const activeOverlayNames = HAZARD_LAYERS
    .filter((h) => selectedHazards.includes(h.id))
    .map((h) => h.name)
    .join(', ') || 'Baseline Vector Boundaries';

  const {
    generateMapSnapshot,
    handleDownloadImage,
    handleCopyImageToClipboard,
    handleShareReport,
    capturedPreviewUrl,
    capturedBlob,
    isGeneratingSnapshot,
    isExportingMap,
    exportSuccessMsg,
    copySuccessMsg,
    setExportSuccessMsg,
    setCopySuccessMsg,
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

  const handleOpenExportModal = () => {
    setIsExportModalOpen(true);
    generateMapSnapshot();
  };

  const handleExportMapImage = () => {
    handleOpenExportModal();
  };

  // Sync browser fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsBrowserFullscreen(isFS);
      if (mapInstanceRef.current) {
        setTimeout(() => {
          mapInstanceRef.current?.invalidateSize();
        }, 200);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handler for true browser-level fullscreen toggle
  const handleToggleFullscreen = async () => {
    try {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (!isFS) {
        const targetEl = mainWrapperRef.current;
        if (targetEl) {
          if (targetEl.requestFullscreen) {
            await targetEl.requestFullscreen();
          } else if ((targetEl as any).webkitRequestFullscreen) {
            await (targetEl as any).webkitRequestFullscreen();
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Browser fullscreen toggle failed:', err);
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

  useEffect(() => {
    (window as any).selectHazardDistrict = (districtId: string) => {
      const found = liveDistricts.find((d) => d.id === districtId);
      if (found) {
        handleSelectDistrict(found);
      }
    };
    return () => {
      delete (window as any).selectHazardDistrict;
    };
  }, [handleSelectDistrict, liveDistricts]);

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
      const severityColor = getSeverityColor(dist.severity);
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
            // Dynamic Severity Outlined Boundary Polygon (Green 0% -> Red 100%)
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
            const tooltipText = isUserDist
              ? `<div style="font-family: var(--hds-font-family-heading); font-size: 11px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>${dist.name} District Boundary (Your Location)</span><span style="background: ${severityColor}; color: #ffffff; padding: 2px 6px; border-radius: 9999px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`
              : `<div style="font-family: var(--hds-font-family-heading); font-size: 11px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><span>${dist.name} District ${isDivSel ? `(${dist.division} Division)` : 'Boundary'}</span><span style="background: ${severityColor}; color: #ffffff; padding: 2px 6px; border-radius: 9999px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`;

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
          color: isSel ? '#ffffff' : color,
          fillColor: color,
          fillOpacity: isSel ? 0.5 : 0.28,
          weight: isSel ? 3.5 : 2,
          dashArray: isSel ? '4,4' : undefined,
        });

        // Pin Marker with DivIcon
        const icon = createCustomIcon(dist.severity, isSel, dist.hazardType, dist.name);
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
        const districtAriaLabel = hazardMarkerLabel(dist.severity, dist.hazardType, dist.name, dist.risk);

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
              <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; color: #ffffff; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.6);">
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
        const pinSevPct = pinDist ? Math.round(pinDist.severity * 100) : 0;
        const pinRiskColor = pinDist?.risk === 'High' ? '#e11d48' : pinDist?.risk === 'Moderate' ? '#d97706' : '#16a34a';
        const pinRiskBg = pinDist?.risk === 'High' ? 'rgba(225, 29, 72, 0.12)' : pinDist?.risk === 'Moderate' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(22, 163, 74, 0.12)';

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
          <div style="padding: 12px; font-family: var(--hds-font-family-heading); color: #023246; min-width: 240px; max-width: 280px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #d1d1d1; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>
                <strong style="font-size: 13px; color: #17171b; font-weight: 800;">Stored Location Pin</strong>
              </div>
              <span style="font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #0284c7; border: 1px solid rgba(56, 189, 248, 0.3);">Synced GPS</span>
            </div>

            <div style="font-size: 11px; color: #58585b; line-height: 1.6;">
              <div style="display: flex; justify-content: space-between; font-family: monospace; background: #e3e3e3; padding: 4px 8px; border-radius: 6px;">
                <span>Lat: <strong>${pinpointLat.toFixed(4)}°N</strong></span>
                <span>Lng: <strong>${pinpointLng.toFixed(4)}°E</strong></span>
              </div>

              ${pinDist ? `
                <div style="margin-top: 8px; padding: 8px 10px; background: #f6f6f6; border-radius: 8px; border: 1px solid #d1d1d1;">
                  <div style="font-size: 9px; font-weight: 800; color: #77777a; text-transform: uppercase;">Identified District</div>
                  <div style="font-size: 13px; font-weight: 900; color: #17171b; margin-top: 1px;">
                    ${pinDist.name} <span style="font-size: 10px; font-weight: 600; color: #77777a;">(${pinDist.division})</span>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #b9b9bb;">
                    <div>
                      <div style="font-size: 9px; color: #77777a; font-weight: 700; text-transform: uppercase;">Hazard Type</div>
                      <div style="font-size: 11px; font-weight: 800; color: #17171b; margin-top: 1px;"><MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> ${pinDist.hazardType}</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 9px; color: #77777a; font-weight: 700; text-transform: uppercase;">Severity Score</div>
                      <span style="font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 4px; background: ${pinRiskBg}; color: ${pinRiskColor}; display: inline-block; margin-top: 1px;">
                        ${pinSevPct}% (${pinDist.risk})
                      </span>
                    </div>
                  </div>
                  <div style="margin-top: 6px; font-size: 10px; color: #58585b;">
                    🌱 Vulnerable Crop: <strong style="color: #059669;">${pinDist.mainCrop}</strong>
                  </div>
                  <button onclick="window.selectHazardDistrict('${pinDist.id}')" style="margin-top: 8px; width: 100%; padding: 6px 10px; background: #0284c7; color: #ffffff; font-size: 11px; font-weight: 800; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);">
                    📍 Focus ${pinDist.name} District Boundary
                  </button>
                </div>
              ` : `
                <div style="margin-top: 6px; color: #0284c7; font-weight: 800;">Nearest District: ${(pinDist as DistrictGeo | undefined)?.name || 'Detected'}</div>
              `}
            </div>
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
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: '4, 4',
          interactive: false,
        });

        const userGpsIcon = L.divIcon({
          html: `
            <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; outline: none; cursor: pointer;">
              <div style="position: absolute; inset: -10px; border-radius: 50%; background: rgba(2, 132, 199, 0.45); filter: blur(6px);" class="radar-ping-ring"></div>
              <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; color: #ffffff; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.7);">
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
        const sevPct = dist ? Math.round(dist.severity * 100) : 0;
        const riskColor = dist?.risk === 'High' ? '#e11d48' : dist?.risk === 'Moderate' ? '#d97706' : '#16a34a';
        const riskBg = dist?.risk === 'High' ? 'rgba(225, 29, 72, 0.12)' : dist?.risk === 'Moderate' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(22, 163, 74, 0.12)';
        const riskBorder = dist?.risk === 'High' ? 'rgba(225, 29, 72, 0.3)' : dist?.risk === 'Moderate' ? 'rgba(217, 119, 6, 0.3)' : 'rgba(22, 163, 74, 0.3)';

        gpsMarker.bindPopup(`
          <div style="padding: 12px; font-family: var(--hds-font-family-heading); color: #023246; min-width: 250px; max-width: 290px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #d1d1d1; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>
                <strong style="font-size: 13px; color: #17171b; font-weight: 800;">GPS Device Position</strong>
              </div>
              <span style="font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #0284c7; border: 1px solid rgba(56, 189, 248, 0.3);">Active GPS</span>
            </div>

            <div style="font-size: 11px; color: #444447; line-height: 1.5;">
              <div style="display: flex; justify-content: space-between; font-family: monospace; background: #e3e3e3; padding: 6px 8px; border-radius: 6px; border: 1px solid #d1d1d1;">
                <div>Latitude: <strong>${userGpsPos.lat.toFixed(4)}°N</strong></div>
                <div>Longitude: <strong>${userGpsPos.lng.toFixed(4)}°E</strong></div>
              </div>
              <div style="margin-top: 4px; font-size: 10px; color: #77777a; font-family: monospace; text-align: right;">
                GPS Accuracy: <strong>~${userGpsPos.accuracy || 10}m</strong>
              </div>

              ${dist ? `
                <div style="margin-top: 8px; padding: 10px; background: #f6f6f6; border-radius: 10px; border: 1px solid #d1d1d1;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <div style="font-size: 9px; font-weight: 800; color: #77777a; text-transform: uppercase; letter-spacing: 0.5px;">Identified District</div>
                      <div style="font-size: 14px; font-weight: 900; color: #17171b; margin-top: 1px;">
                        ${dist.name} <span style="font-size: 11px; font-weight: 600; color: #77777a;">(${dist.division})</span>
                      </div>
                    </div>
                    <span style="font-size: 10px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(2, 132, 199, 0.2);">
                      ${distanceKm} km
                    </span>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #b9b9bb;">
                    <div>
                      <div style="font-size: 9px; color: #77777a; font-weight: 700; text-transform: uppercase;">Identified Hazard</div>
                      <div style="font-size: 12px; font-weight: 800; color: #17171b; margin-top: 1px;"><MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> ${dist.hazardType}</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 9px; color: #77777a; font-weight: 700; text-transform: uppercase;">Severity Score</div>
                      <div style="margin-top: 2px;">
                        <span style="font-size: 11px; font-weight: 900; padding: 2px 7px; border-radius: 5px; background: ${riskBg}; color: ${riskColor}; border: 1px solid ${riskBorder}; display: inline-block;">
                          ${sevPct}% (${dist.risk})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e3e3e3; font-size: 10px; color: #58585b; display: flex; align-items: center; gap: 4px;">
                    <span>🌱 Vulnerable Crop:</span>
                    <strong style="color: #059669; font-weight: 800;">${dist.mainCrop}</strong>
                  </div>
                  <button onclick="window.selectHazardDistrict('${dist.id}')" style="margin-top: 8px; width: 100%; padding: 6px 10px; background: #0284c7; color: #ffffff; font-size: 11px; font-weight: 800; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);">
                    📍 Focus ${dist.name} District Boundary
                  </button>
                </div>
              ` : `
                <div style="margin-top: 6px; color: #0284c7; font-weight: 900;">Nearest District: Detected (${distanceKm} km)</div>
              `}
            </div>
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
            `<div style="font-family: var(--hds-font-family-heading); font-size: 11px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>${activeUserDistrict.name} District Boundary (Your Location)</span><span style="background: ${severityColor}; color: #ffffff; padding: 2px 6px; border-radius: 9999px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`,
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
            <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background: #ffffff; border: 3px solid #f64137; display: flex; align-items: center; justify-content: center; color: #17171b; font-size: 14px; font-weight: 900; box-shadow: 0 4px 16px rgba(249, 168, 37, 0.5);">
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
            color: '#38bdf8',
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
            `<div style="font-family: var(--hds-font-family-heading); font-size: 11px; font-weight: 900; color: #0284c7;">
              <MaterialIcon name="water" className="w-4 h-4 inline-block align-middle" /> ${river.name}<br/>
              <span style="font-size: 10px; color: #77777a; font-weight: normal;">${river.status}</span>
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

  // 7. Render Animated Doppler Weather Radar Sweep Concentric Rings Layer
  useEffect(() => {
    if (!radarGroupRef.current) return;
    radarGroupRef.current.clearLayers();

    if (isRadarActive && !lowBandwidth) {
      const centerLat = 23.8103;
      const centerLng = 90.4125;
      const radarRings = [60000, 120000, 180000, 240000];

      radarRings.forEach((radiusMeters, idx) => {
        const ring = L.circle([centerLat, centerLng], {
          radius: radiusMeters,
          color: '#0284c7',
          weight: 1.5,
          opacity: 0.5 - idx * 0.1,
          fillColor: idx % 2 === 0 ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
          fillOpacity: 0.1,
          dashArray: '4, 4',
          interactive: false,
        });
        radarGroupRef.current?.addLayer(ring);
      });

      // Add radar storm reflectivity pulse cells
      const stormCells = [
        { lat: 25.0658, lng: 91.3950, radius: 28000, color: '#dc2626', name: 'Sylhet Severe Cells (52 dBZ)' },
        { lat: 25.8058, lng: 89.6361, radius: 24000, color: '#ea580c', name: 'Teesta Surge Cells (45 dBZ)' },
        { lat: 22.7185, lng: 89.0705, radius: 32000, color: '#7c3aed', name: 'Bay of Bengal Cyclone Outer Bands (48 dBZ)' },
      ];

      stormCells.forEach((cell) => {
        const storm = L.circle([cell.lat, cell.lng], {
          radius: cell.radius,
          color: cell.color,
          weight: 2,
          fillColor: cell.color,
          fillOpacity: 0.28,
        });
        storm.bindTooltip(`<div style="font-weight: 900; font-size: 11px;"><MaterialIcon name="bolt" className="w-4 h-4 inline-block align-middle" /> Doppler Radar: ${cell.name}</div>`);
        radarGroupRef.current?.addLayer(storm);
      });
    }
  }, [isRadarActive, lowBandwidth]);

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
                0.2: '#0284c7',
                0.5: '#f59e0b',
                0.8: '#ef4444',
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

  const hazardActions = [
    { 
      Icon: AlertTriangle,
      title: "Report Field Hazard Incident",
      onClick: () => setIsReportModalOpen(true)
    },
    {
      Icon: Filter,
      title: "Advanced District & Hazard Filter",
      onClick: () => setIsFilterModalOpen(true)
    },
    {
      Icon: Layers,
      title: "GIS & Map Layers Control",
      onClick: () => setIsLayerModalOpen(true)
    },
    {
      Icon: RefreshCw,
      title: "Sync Live Telemetry Sensor Feeds",
      onClick: async () => {
        setIsSyncing(true);
        setSyncToastMessage("Syncing 64 Districts Telemetry from Satellite-2 & NASA GPM...");
        await new Promise(r => setTimeout(r, 1500));
        setIsSyncing(false);
        setSyncToastMessage("Successfully synchronized 64 districts telemetry with real-time sensor feeds.");
        setTimeout(() => setSyncToastMessage(null), 5000);
      },
      className: isSyncing ? "text-amber-500 animate-spin" : ""
    },
    {
      Icon: Camera,
      title: "Export Visible Map Area as High-Res PNG Image",
      onClick: handleExportMapImage,
      className: isExportingMap ? "text-amber-500 animate-spin" : ""
    },
    {
      Icon: Compass,
      title: "Reset Compass North",
      onClick: () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([23.8103, 90.4125], 7, { duration: 1.0 });
        }
      }
    },
    {
      Icon: Box,
      title: "Toggle 3D Perspective Tilt Mode",
      onClick: () => {
        setIs3DTilted(!is3DTilted);
        if (mapInstanceRef.current) {
          setTimeout(() => mapInstanceRef.current?.invalidateSize(), 300);
        }
      },
      className: is3DTilted ? "bg-nasa-red/20 text-nasa-red-shade" : ""
    },
    {
      Icon: ZoomIn,
      title: "Zoom In (+)",
      onClick: () => mapInstanceRef.current?.zoomIn()
    },
    {
      Icon: ZoomOut,
      title: "Zoom Out (-)",
      onClick: () => mapInstanceRef.current?.zoomOut()
    },
    {
      Icon: Navigation,
      title: "Locate & Center Map on My GPS Position",
      onClick: handleCenterOnUserLocation,
      className: userGpsPos ? "bg-nasa-blue/20 text-nasa-blue-shade animate-pulse" : (isLocatingUser ? "animate-spin text-amber-500" : "")
    },
    {
      Icon: Maximize,
      title: isBrowserFullscreen ? "Exit Browser Fullscreen (Esc)" : "Enter Browser Fullscreen",
      onClick: handleToggleFullscreen,
      className: isBrowserFullscreen ? "bg-emerald-600/20 text-carbon-70" : ""
    },
    {
      Icon: RotateCcw,
      title: "Reset Map to Full Overview",
      onClick: () => {
        setSelectedDivision('All');
        setSearchQuery('');
        setIsolateSelected(false);
        setInspectedPoint(null);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([23.8103, 90.4125], 7, { duration: 1.2 });
        }
      }
    },
    {
      Icon: Flame,
      title: isHeatmapActive ? "Disable Hazard Heatmap" : "Enable Hazard Heatmap",
      onClick: () => setIsHeatmapActive(!isHeatmapActive),
      className: isHeatmapActive ? "bg-nasa-red/20 text-nasa-red-shade" : ""
    },
    {
      Icon: Ruler,
      title: "Toggle Geodesic Distance Measurement Tool",
      onClick: () => {
        const nextState = !isMeasuring;
        setIsMeasuring(nextState);
        if (!nextState) setMeasurePoints([]);
      },
      className: isMeasuring ? "bg-amber-500/20 text-amber-500" : ""
    },
    {
      Icon: Waves,
      title: "Toggle Major River Basins Layer",
      onClick: () => setIsRiverLayerActive(!isRiverLayerActive),
      className: isRiverLayerActive ? "bg-nasa-blue/20 text-nasa-blue-shade" : ""
    },
    {
      Icon: Radio,
      title: "Toggle Live Doppler Weather Radar Simulation",
      onClick: () => setIsRadarActive(!isRadarActive),
      className: isRadarActive ? "bg-nasa-blue/20 text-nasa-blue-shade" : ""
    },
    {
      Icon: Contrast,
      title: "Toggle Tile High Contrast Visual Filter Boost",
      onClick: () => setIsHighContrastBoost(!isHighContrastBoost),
      className: isHighContrastBoost ? "bg-carbon-90/20 text-carbon-90" : ""
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      ref={mainWrapperRef}
      className={
        isFullScreen || isBrowserFullscreen
          ? 'w-full h-full min-h-[360px] lg:min-h-[560px] h-dvh bg-carbon-05 overflow-hidden text-carbon-90 relative flex flex-col'
          : className
          ? className
          : `w-full ${customHeight || 'h-full min-h-[360px] lg:min-h-[560px]'} bg-carbon-10 overflow-hidden text-carbon-90 relative flex flex-col border border-carbon-20`
      }
    >
      {!isFullScreen && (
        <div className="shrink-0 z-[var(--z-sticky)] w-full flex flex-col bg-white border-b border-carbon-20">
          <MapToolbar
            collapsed={isHeaderCollapsed}
            onCollapsedChange={setIsHeaderCollapsed}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            activeLayer={activeLayer}
            onLayerChange={setActiveLayer}
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
            className="absolute inset-0 z-[var(--z-sticky)] p-6 bg-white flex flex-col justify-center"
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
          } ${is3DTilted ? 'map-perspective-tilted' : ''} ${isHighContrastBoost ? 'map-tile-high-contrast' : ''}`}
        >
          <div
            ref={mapContainerRef}
            role="region"
            aria-label="Interactive Bangladesh Hazard Leaflet GIS Map with keyboard-navigable district pins and risk data"
            /* `relative` makes the z-10 effective (z-index is ignored on
               static elements) — without it Leaflet's internal panes
               (z-index 200–1000) escape to the root stacking context and
               would paint over the sticky header (z-40). */
            className="relative w-full h-full z-10 bg-transparent pointer-events-auto"
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
            className="lg:absolute lg:top-4 lg:right-4 lg:z-[var(--z-sticky)] lg:w-[320px] lg:max-w-[calc(100%-2rem)] shrink-0 w-full border-t lg:border-t-0 border-carbon-20 bg-white"
          >
            <DistrictForecastCard
              district={currentSelected}
              onClose={() => {
                onSelectDistrict?.(null as any);
              }}
              onOpenAnalytics={(districtId) => navigate(`/forecast/district/${districtId}`)}
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

          {/* Point Telemetry Click Inspection HUD */}
          <AnimatePresence>
          {inspectedPoint && nearestDistrictData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 lg:bottom-auto lg:top-4 left-0 right-0 lg:left-auto lg:right-4 z-[var(--z-sticky)] pointer-events-auto lg:w-[320px] lg:max-w-[calc(100%-2rem)] w-full"
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
                    className="flex-1 min-h-[44px] py-2 bg-nasa-blue text-white font-semibold text-sm text-center touch-manipulation"
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
              className="absolute top-4 left-4 right-4 lg:right-auto z-[var(--z-sticky)] pointer-events-auto lg:max-w-[320px] w-auto"
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
                  <div className="bg-carbon-80/80 p-2.5  border border-carbon-70 text-xs text-carbon-30 flex items-center gap-2">
                    <MaterialIcon name="touch_app" className="w-4 h-4 shrink-0 text-[#ea6f24]" />
                    <span>Click any location on the map to set <strong>Point 1 (Origin)</strong>.</span>
                  </div>
                )}

                {measurePoints.length === 1 && (
                  <div className="bg-carbon-80/80 p-2.5  border border-carbon-70 text-xs text-carbon-30 space-y-1">
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
                    <div className="bg-carbon-80/90 p-2.5  border border-carbon-70 space-y-1.5">
                      <div className="flex items-center justify-between font-mono font-extrabold text-amber-300 text-sm">
                        <span>Distance:</span>
                        <span>
                          {pathAnalysis.totalDistanceKm.toFixed(2)} km{' '}
                          <span className="text-carbon-60 text-xs font-normal">
                            ({(pathAnalysis.totalDistanceKm * 0.621371).toFixed(2)} mi)
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-carbon-60">Path Span:</span>
                        <span className="font-bold text-carbon-20">
                          {pathAnalysis.startDistrict?.name} ➔ {pathAnalysis.endDistrict?.name}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs border-t border-carbon-70/60 pt-1.5">
                        <span className="text-carbon-60">Max Hazard Severity:</span>
                        <span
                          className={`font-black px-1.5 py-0.5 rounded text-xs ${
 pathAnalysis.riskRating === 'High'
 ? 'bg-carbon-80/40 text-rose-400 border border-rose-500/40'
 : pathAnalysis.riskRating === 'Moderate'
 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
 : 'bg-carbon-80/40 text-emerald-400 border border-emerald-500/40'
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
                              className="text-xs font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 "
                            >
                              <MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-carbon-60 font-mono">
                      Transiting {pathAnalysis.districtsAlongPath.length} district(s):{' '}
                      <span className="text-carbon-30 font-sans font-medium">
                        {pathAnalysis.districtsAlongPath.map((d) => d.district.name).join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-carbon-70/80">
                  <button
                    onClick={() => setMeasurePoints([])}
                    className="flex-1 min-h-[44px] py-1.5 bg-carbon-80 hover:bg-carbon-70 text-carbon-20 font-bold text-xs  transition-colors border border-carbon-70"
                  >
                    Reset Points
                  </button>
                  <button
                    onClick={() => {
                      setIsMeasuring(false);
                      setMeasurePoints([]);
                    }}
                    className="min-h-[44px] px-3 py-1.5 bg-nasa-red-shade hover:bg-nasa-red text-white font-semibold text-xs"
                  >
                    Exit Ruler
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {(exportSuccessMsg || userLocationError || syncToastMessage || reportSuccessMsg) && (
            <div
              role="status"
              className="absolute bottom-16 left-4 right-4 lg:right-auto lg:max-w-[320px] z-[var(--z-sticky)] pointer-events-auto bg-white border border-carbon-20 p-4 text-base text-carbon-90"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 min-w-0">
                  {userLocationError || exportSuccessMsg || syncToastMessage || reportSuccessMsg}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExportSuccessMsg(null);
                    setUserLocationError(null);
                    setSyncToastMessage(null);
                    setReportSuccessMsg(null);
                  }}
                  className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center shrink-0 touch-manipulation"
                  aria-label="Dismiss status"
                >
                  <MaterialIcon name="close" className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Report Field Hazard Modal */}
          <AnimatePresence>
          {isReportModalOpen && (
            <div className="fixed inset-0 z-[var(--z-modal)] bg-carbon-90/40 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white p-6 max-w-md w-full border border-carbon-20 text-carbon-90 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-11 h-11 bg-carbon-05 text-nasa-blue flex items-center justify-center">
                      <MaterialIcon name="warning" className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">Report field hazard</h3>
                      <p className="text-xs text-carbon-60">Log a ground observation. This does not publish an official warning.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center"
                    aria-label="Close report dialog"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-carbon-70 mb-1">Target District</label>
                    <select
                      value={reportDistrictId}
                      onChange={(e) => setReportDistrictId(e.target.value)}
                      className="w-full px-3 py-2 bg-carbon-05 border border-carbon-20  font-semibold text-carbon-80 focus:outline-none focus:border-nasa-blue"
                    >
                      {liveDistricts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.division} Division)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-carbon-70 mb-1">Hazard Category</label>
                    <select
                      value={reportHazardType}
                      onChange={(e) => setReportHazardType(e.target.value)}
                      className="w-full px-3 py-2 bg-carbon-05 border border-carbon-20  font-semibold text-carbon-80 focus:outline-none focus:border-nasa-blue"
                    >
                      {HAZARD_LAYERS.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-carbon-70 mb-1">
                      <span>Severity Level</span>
                      <span className="text-nasa-red-shade font-mono">{(reportSeverity * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={reportSeverity}
                      onChange={(e) => setReportSeverity(parseFloat(e.target.value))}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-carbon-70 mb-1">Field Observation Notes</label>
                    <textarea
                      rows={3}
                      placeholder="Describe water level, crop damage, wind speed, or local impacts..."
                      value={reportNotes}
                      onChange={(e) => setReportNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-carbon-05 border border-carbon-20  font-medium text-carbon-80 focus:outline-none focus:border-nasa-blue"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-carbon-10">
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="flex-1 min-h-[44px] py-2.5 bg-carbon-10 hover:bg-carbon-20 text-carbon-70 font-bold  text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const targetDist = liveDistricts.find(d => d.id === reportDistrictId);
                      if (targetDist) {
                        targetDist.severity = reportSeverity;
                        targetDist.hazardType = reportHazardType as any;
                        if (reportSeverity >= 0.8) targetDist.risk = 'High';
                        else if (reportSeverity >= 0.5) targetDist.risk = 'Moderate';
                        else targetDist.risk = 'Low';
                        handleSelectDistrict(targetDist);
                      }
                      setIsReportModalOpen(false);
                      setReportSuccessMsg(`Successfully logged field hazard report for ${targetDist?.name || 'District'}.`);
                      setTimeout(() => setReportSuccessMsg(null), 5000);
                    }}
                    className="flex-1 min-h-[44px] py-2.5 bg-nasa-red-shade hover:bg-nasa-red-shade text-white font-black  text-xs  transition-all"
                  >
                    Submit Incident Report
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          {/* Advanced Filter Modal */}
          <AnimatePresence>
          {isFilterModalOpen && (
            <div className="fixed inset-0 z-[var(--z-modal)] bg-carbon-90/40 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white p-6 max-w-lg w-full border border-carbon-20 text-carbon-90 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-11 h-11 bg-carbon-05 text-nasa-blue flex items-center justify-center">
                      <MaterialIcon name="search" className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">District and hazard filter</h3>
                      <p className="text-xs text-carbon-60">Filter districts by division and hazard type</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterModalOpen(false)}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center"
                    aria-label="Close filter dialog"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-carbon-70 mb-1.5">Division Selector</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setSelectedDivision('All')}
                        className={`py-2 px-3 font-bold text-xs transition-all border ${
 selectedDivision === 'All'
 ? 'bg-nasa-red text-white border-nasa-blue'
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                      >
                        All Divisions
                      </button>
                      {ALL_8_DIVISIONS.map((div) => {
                        const divName = div.name.replace(' Division', '');
                        return (
                          <button
                            key={div.id}
                            onClick={() => setSelectedDivision(divName)}
                            className={`py-2 px-3 font-bold text-xs transition-all border truncate ${
 selectedDivision.toLowerCase() === divName.toLowerCase()
 ? 'bg-nasa-red text-white border-nasa-blue'
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            {divName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-carbon-70">Hazard Types ({selectedHazards.length}/{HAZARD_LAYERS.length})</label>
                      <div className="flex gap-2">
                        <button onClick={selectAllHazards} className="text-xs text-nasa-blue-shade font-bold hover:underline">Select All</button>
                        <span className="text-carbon-30">|</span>
                        <button onClick={clearAllHazards} className="text-xs text-nasa-red-shade font-bold hover:underline">Clear All</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {HAZARD_LAYERS.map((h) => {
                        const isAct = selectedHazards.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            onClick={() => toggleHazard(h.id)}
                            className={`py-2 px-3 font-bold text-xs flex items-center justify-between border transition-all ${
 isAct
 ? 'bg-amber-50 text-amber-900 border-carbon-20 font-black'
 : 'bg-carbon-05 text-carbon-60 border-carbon-20 opacity-60'
 }`}
                          >
                            <span>{h.name}</span>
                            <span>{isAct ? '✓' : '○'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-carbon-10">
                  <button
                    onClick={() => {
                      setSelectedDivision('All');
                      selectAllHazards();
                      setSearchQuery('');
                    }}
                    className="py-2.5 px-4 bg-carbon-10 hover:bg-carbon-20 text-carbon-70 font-bold  text-xs transition-colors"
                  >
                    Reset Filters
                  </button>
                  <button
                    onClick={() => setIsFilterModalOpen(false)}
                    className="flex-1 min-h-[44px] py-2.5 bg-carbon-90 hover:bg-carbon-80 text-white font-black  text-xs  transition-all"
                  >
                    Apply Filters ({filteredDistricts.length} districts match)
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          {/* GIS Layers Control Modal */}
          <AnimatePresence>
          {isLayerModalOpen && (
            <div className="fixed inset-0 z-[var(--z-modal)] bg-carbon-90/40 flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white p-6 max-w-md w-full border border-carbon-20 text-carbon-90 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-11 h-11 bg-carbon-05 text-nasa-blue flex items-center justify-center">
                      <MaterialIcon name="layers" className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">Map layers</h3>
                      <p className="text-xs text-carbon-60">Basemap, overlays, and offline tile store</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLayerModalOpen(false)}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center"
                    aria-label="Close layers dialog"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-carbon-70 mb-1.5">Base Raster Tile Provider</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).map((key) => {
                        const isAct = activeLayer === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setActiveLayer(key)}
                            className={`py-2.5 px-3 font-bold text-xs border text-left transition-all ${
 isAct
 ? 'bg-nasa-red text-white border-nasa-blue '
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            {MAP_LAYERS[key].name.split('(')[0].trim()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-carbon-10">
                    <label className="block font-bold text-carbon-70">Analytical Map Overlays</label>
                    
                    <div className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20">
                      <span className="font-bold text-carbon-80"><MaterialIcon name="water" className="w-4 h-4 inline-block align-middle" /> River Basins Flow Polyline</span>
                      <button
                        onClick={() => setIsRiverLayerActive(!isRiverLayerActive)}
                        className={`min-h-[44px] px-3 font-semibold text-xs touch-manipulation ${
 isRiverLayerActive ? 'bg-nasa-blue text-white' : 'bg-carbon-20 text-carbon-60'
 }`}
                      >
                        {isRiverLayerActive ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20">
                      <span className="font-bold text-carbon-80"><MaterialIcon name="local_fire_department" className="w-4 h-4 inline-block align-middle" /> Hazard Heatmap Density</span>
                      <button
                        onClick={() => setIsHeatmapActive(!isHeatmapActive)}
                        className={`min-h-[44px] px-3 font-semibold text-xs touch-manipulation ${
 isHeatmapActive ? 'bg-nasa-red text-white' : 'bg-carbon-20 text-carbon-60'
 }`}
                      >
                        {isHeatmapActive ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20">
                      <span className="font-bold text-carbon-80">Doppler Weather Radar Simulation</span>
                      <button
                        onClick={() => setIsRadarActive(!isRadarActive)}
                        className={`min-h-[44px] px-3 font-semibold text-xs touch-manipulation ${
 isRadarActive ? 'bg-nasa-blue text-white' : 'bg-carbon-20 text-carbon-60'
 }`}
                      >
                        {isRadarActive ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20">
                      <span className="font-bold text-carbon-80"><MaterialIcon name="bolt" className="w-4 h-4 inline-block align-middle" /> High Contrast Raster Boost</span>
                      <button
                        onClick={() => setIsHighContrastBoost(!isHighContrastBoost)}
                        className={`min-h-[44px] px-3 font-semibold text-xs touch-manipulation ${
 isHighContrastBoost ? 'bg-carbon-90 text-white' : 'bg-carbon-20 text-carbon-60'
 }`}
                      >
                        {isHighContrastBoost ? 'Active' : 'Normal'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20">
                      <div className="flex flex-col pr-2">
                        <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-emerald-700" /> District Marker Clustering
                        </span>
                        <span className="text-xs text-carbon-80 font-medium mt-0.5">
                          Groups 64 districts at zoom ≤ 8 (Boosts mobile FPS & low-power GPU rendering)
                        </span>
                      </div>
                      <button
                        onClick={() => setIsClusteringActive(!isClusteringActive)}
                        className={`min-h-[44px] px-3 font-semibold text-xs touch-manipulation shrink-0 ${
 isClusteringActive ? 'bg-emerald-700 text-white ' : 'bg-carbon-20 text-carbon-70'
 }`}
                      >
                        {isClusteringActive ? 'Clustered (Auto)' : '64 Pins (Raw)'}
                      </button>
                    </div>

                    {/* IndexedDB Offline Tile Store Section */}
                    <div className="p-3.5  bg-carbon-05 border border-carbon-20 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8  bg-amber-600 text-white flex items-center justify-center  shrink-0">
                            <HardDrive className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-black text-xs text-amber-950 block">
                              Offline Emergency Tile Store (IndexedDB)
                            </span>
                            <span className="text-xs text-amber-800 font-medium">
                              Zero-network blackout resilience for flood & cyclone response
                            </span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 border shrink-0 ${
 isOnline 
 ? 'bg-carbon-10 text-carbon-80 border-emerald-300' 
 : 'bg-carbon-10 text-nasa-red-shade border-rose-300 animate-pulse'
 }`}>
                          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                          {isOnline ? 'Online Sync' : 'Offline Mode'}
                        </span>
                      </div>

                      {/* Storage Stats Pill */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5  border border-amber-200">
                        <div>
                          <span className="text-carbon-60 font-medium block text-xs uppercase">Storage Used</span>
                          <span className="font-bold text-carbon-80 font-mono text-xs">{cacheStats.formattedSize}</span>
                        </div>
                        <div>
                          <span className="text-carbon-60 font-medium block text-xs uppercase">Tiles in IndexedDB</span>
                          <span className="font-bold text-carbon-80 font-mono text-xs">{cacheStats.totalTiles} cached</span>
                        </div>
                      </div>

                      {/* Pre-caching Progress Bar */}
                      {isPreCaching && (
                        <div className="p-2.5 bg-carbon-10  border border-carbon-20 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                            <span className="flex items-center gap-1.5 animate-pulse">
                              <CloudDownload className="w-3.5 h-3.5 text-amber-700" />
                              {preCacheStatus}
                            </span>
                            <span className="font-mono">{preCacheProgress}%</span>
                          </div>
                          <div className="w-full bg-amber-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-amber-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${preCacheProgress}%` }}
                            />
                          </div>
                          <button
                            onClick={cancelPreCache}
                            className="self-end text-xs text-nasa-red-shade font-bold hover:underline cursor-pointer"
                          >
                            Cancel Download
                          </button>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => downloadEmergencyBangladeshPack(activeLayer)}
                          disabled={isPreCaching || !isOnline}
                          className="px-3 py-2 bg-nasa-red-shade hover:bg-nasa-red disabled:opacity-50 text-white text-xs font-black   transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Pre-cache tactical zoom 6–9 covering all 64 districts in Bangladesh"
                        >
                          <CloudDownload className="w-3.5 h-3.5" />
                          <span>⚡ Pre-cache Bangladesh Core</span>
                        </button>

                        <button
                          onClick={() => {
                            if (currentSelected) {
                              downloadDistrictEmergencyPack(currentSelected.lat, currentSelected.lng, currentSelected.name, activeLayer);
                            } else {
                              toast('Please select a district on the map first');
                            }
                          }}
                          disabled={isPreCaching || !isOnline}
                          className="px-3 py-2 bg-carbon-80 hover:bg-carbon-90 disabled:opacity-50 text-white text-xs font-black   transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Download high-resolution satellite/topo tiles for active district"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>📍 Pre-cache {currentSelected ? currentSelected.name : 'Selected'} HD</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/60">
                        <button
                          onClick={() => clearCache()}
                          disabled={isPreCaching || cacheStats.totalTiles === 0}
                          className="text-xs text-carbon-60 hover:text-nasa-red-shade disabled:opacity-40 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Purge Offline Storage</span>
                        </button>
                        <span className="text-xs font-mono text-amber-800/80">IndexedDB: hazardnet_tile_cache_db</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-carbon-10">
                  <button
                    onClick={() => setIsLayerModalOpen(false)}
                    className="w-full min-h-[44px] py-2.5 bg-carbon-90 hover:bg-carbon-80 text-white font-black  text-xs "
                  >
                    Apply & Close Layers Panel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          {/* High-Resolution Map Report Capture & Sharing Modal */}
          <AnimatePresence>
          {isExportModalOpen && (
            <div className="fixed inset-0 z-[var(--z-modal)] bg-carbon-90/40 flex items-center justify-center p-4 pointer-events-auto overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                className="bg-white  p-5 sm:p-7 max-w-4xl w-full  border border-carbon-20 text-carbon-90 flex flex-col gap-5 my-auto"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-carbon-10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11  bg-nasa-red/15 text-nasa-red-shade border border-nasa-blue/30 flex items-center justify-center font-black text-xl shrink-0">
                      <MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-nasa-red text-white font-black text-xs tracking-wide uppercase">
                          Geospatial Export
                        </span>
                        <span className="text-xs font-mono font-bold text-carbon-60">
                          {exportScale === 3 ? 'Ultra-HD 4K (300 DPI)' : exportScale === 2 ? 'HD 2K (200 DPI)' : 'Standard HD'}
                        </span>
                      </div>
                      <h3 className="text-xl font-black tracking-tight text-carbon-90 mt-0.5">
                        Capture High-Resolution Hazard Map Report
                      </h3>
                      <p className="text-xs text-carbon-60">
                        Export visible map view with active vector overlays, legend keys, and verified metadata watermarks
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(false)}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 text-carbon-70 flex items-center justify-center shrink-0"
                    aria-label="Close export dialog"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body: Grid with Preview & Settings */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Image Preview Canvas Viewport (7 Cols) */}
                  <div className="lg:col-span-7 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-carbon-70 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-nasa-red-shade" /> Captured Map Image Preview
                      </span>
                      {capturedPreviewUrl && (
                        <span className="text-xs font-mono text-carbon-70 font-bold bg-carbon-05 px-2 py-0.5  border border-carbon-20">
                          ✓ High-Res Image Ready
                        </span>
                      )}
                    </div>

                    <div className="relative aspect-[16/10] bg-carbon-black  overflow-hidden border-2 border-carbon-80  flex items-center justify-center group">
                      {isGeneratingSnapshot ? (
                        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-carbon-30">
                          <div className="w-10 h-10 border-4 border-nasa-blue border-t-transparent rounded-full animate-spin"></div>
                          <div>
                            <p className="font-black text-sm text-white">Rendering High-Resolution Canvas...</p>
                            <p className="text-xs text-carbon-60 mt-1">Applying raster layers, vector polygons & watermark headers</p>
                          </div>
                        </div>
                      ) : capturedPreviewUrl ? (
                        <>
                          <img
                            src={capturedPreviewUrl}
                            alt="Captured Hazard Map Report"
                            className="w-full h-full object-contain bg-carbon-90"
                          />
                          <a
                            href={capturedPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute bottom-3 right-3 px-3 py-1.5 bg-carbon-90/80 hover:bg-carbon-90 text-white  text-xs font-bold  border border-carbon-70 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MaterialIcon name="search" className="w-4 h-4 inline-block align-middle" /><span>View Full Resolution</span>
                          </a>
                        </>
                      ) : (
                        <div className="text-center text-carbon-60 p-6">
                          <p className="font-bold text-sm">No Preview Captured</p>
                          <button
                            onClick={() => generateMapSnapshot()}
                            className="mt-2 px-3 py-1.5 bg-nasa-red text-white font-bold text-xs "
                          >
                            Generate Map Image
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-carbon-05  p-3 border border-carbon-20 text-xs flex items-center justify-between text-carbon-60">
                      <span><strong>Format:</strong> {exportFormat.toUpperCase()}</span>
                      <span><strong>Resolution:</strong> {exportScale === 3 ? '3840 x 2160 (3x)' : exportScale === 2 ? '2560 x 1440 (2x)' : '1920 x 1080 (1.5x)'}</span>
                      <span><strong>Location:</strong> {currentSelected?.name || 'National Overview'}</span>
                    </div>
                  </div>

                  {/* Right Column: Customization Controls & Export Actions (5 Cols) */}
                  <div className="lg:col-span-5 flex flex-col justify-between gap-4">
                    <div className="space-y-4 text-xs">
                      {/* Report Title */}
                      <div>
                        <label className="block font-bold text-carbon-70 mb-1">Custom Report Header Title</label>
                        <input
                          type="text"
                          value={customReportTitle}
                          onChange={(e) => setCustomReportTitle(e.target.value)}
                          placeholder="e.g. Flood Situation Report - Sylhet Division"
                          className="w-full px-3 py-2 bg-carbon-05 border border-carbon-20  font-semibold text-carbon-80 focus:outline-none focus:border-nasa-blue transition-colors"
                        />
                      </div>

                      {/* Resolution Selector */}
                      <div>
                        <label className="block font-bold text-carbon-70 mb-1.5">Output Image Quality & Scale</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => {
                              setExportScale(3);
                              generateMapSnapshot({ overrideScale: 3 });
                            }}
                            className={`py-2 px-2.5 font-black text-xs border transition-all text-center ${
 exportScale === 3
 ? 'bg-nasa-red text-white border-nasa-blue '
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            Ultra 4K (3x)
                          </button>
                          <button
                            onClick={() => {
                              setExportScale(2);
                              generateMapSnapshot({ overrideScale: 2 });
                            }}
                            className={`py-2 px-2.5 font-black text-xs border transition-all text-center ${
 exportScale === 2
 ? 'bg-nasa-red text-white border-nasa-blue '
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            <MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" /> 2K HD (2x)
                          </button>
                          <button
                            onClick={() => {
                              setExportScale(1.5);
                              generateMapSnapshot({ overrideScale: 1.5 });
                            }}
                            className={`py-2 px-2.5 font-black text-xs border transition-all text-center ${
 exportScale === 1.5
 ? 'bg-nasa-red text-white border-nasa-blue '
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            <MaterialIcon name="smartphone" className="w-4 h-4 inline-block align-middle" /> HD (1.5x)
                          </button>
                        </div>
                      </div>

                      {/* Format Selector */}
                      <div>
                        <label className="block font-bold text-carbon-70 mb-1.5">Image Format</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setExportFormat('png')}
                            className={`py-2 px-3 font-bold text-xs border transition-all ${
 exportFormat === 'png'
 ? 'bg-carbon-90 text-white border-carbon-90'
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            PNG (Lossless Quality)
                          </button>
                          <button
                            onClick={() => setExportFormat('jpeg')}
                            className={`py-2 px-3 font-bold text-xs border transition-all ${
 exportFormat === 'jpeg'
 ? 'bg-carbon-90 text-white border-carbon-90'
 : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:bg-carbon-10'
 }`}
                          >
                            JPEG (Compact Size)
                          </button>
                        </div>
                      </div>

                      {/* Watermark & Legend Toggles */}
                      <div className="space-y-2 pt-2 border-t border-carbon-10">
                        <label className="block font-bold text-carbon-70">Watermark & Legend Overlays</label>
                        <label className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20 cursor-pointer">
                          <span className="font-semibold text-carbon-80"><MaterialIcon name="shield" className="w-4 h-4 inline-block align-middle" /> Official HazardNet Banner</span>
                          <input
                            type="checkbox"
                            checked={includeWatermarkHeader}
                            onChange={(e) => {
                              setIncludeWatermarkHeader(e.target.checked);
                            }}
                            className="w-4 h-4 accent-nasa-blue rounded cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center justify-between p-2.5  bg-carbon-05 border border-carbon-20 cursor-pointer">
                          <span className="font-semibold text-carbon-80">Hazard Severity Index Key</span>
                          <input
                            type="checkbox"
                            checked={includeOverlayLegend}
                            onChange={(e) => {
                              setIncludeOverlayLegend(e.target.checked);
                            }}
                            className="w-4 h-4 accent-nasa-blue rounded cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Action Toolbar */}
                    <div className="space-y-2 pt-3 border-t border-carbon-10">
                      <button
                        onClick={() => handleDownloadImage()}
                        disabled={isGeneratingSnapshot || !capturedPreviewUrl}
                        className="w-full min-h-[44px] py-3 bg-nasa-red-shade hover:bg-nasa-red-shade disabled:opacity-50 text-white font-black  text-xs  transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Download className="w-4 h-4" /> Download High-Resolution Map Report
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleCopyImageToClipboard}
                          disabled={isGeneratingSnapshot || !capturedBlob}
                          className="py-2.5 px-3 bg-carbon-10 hover:bg-carbon-20 disabled:opacity-50 text-carbon-80 font-bold  text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5 text-carbon-60" /> Copy Image
                        </button>
                        <button
                          onClick={handleShareReport}
                          disabled={isGeneratingSnapshot || !capturedBlob}
                          className="py-2.5 px-3 bg-nasa-blue hover:bg-nasa-blue-shade disabled:opacity-50 text-white font-bold  text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Share2 className="w-3.5 h-3.5" /> Share Report
                        </button>
                      </div>

                      <button
                        onClick={() => generateMapSnapshot()}
                        disabled={isGeneratingSnapshot}
                        className="w-full py-2 bg-carbon-05 hover:bg-carbon-10 text-carbon-60 font-bold  text-xs border border-carbon-20 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGeneratingSnapshot ? 'animate-spin' : ''}`} /> Re-render Snapshot Preview
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          <MapLegend
            isRadarActive={isRadarActive}
            setIsRadarActive={setIsRadarActive}
          />

          {/* Bottom-Center Floating Clear Search & Inspect Pill */}
          <AnimatePresence>
          {(searchQuery || inspectedPoint || measurePoints.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-20 sm:bottom-12 left-1/2 z-[var(--z-sticky)] pointer-events-auto flex items-center gap-2 max-w-[90vw]"
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
                className="min-h-[44px] px-4 py-2 bg-carbon-90 text-white font-semibold text-sm flex items-center gap-2 touch-manipulation"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-carbon-70 text-carbon-20 flex items-center justify-center text-xs"><MaterialIcon name="close" className="w-4 h-4" /></span>
                  <span>Clear Active Overlays & Filter</span>
                </span>
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Bottom-Right Hazard Actions Menu */}
          <div className="absolute bottom-20 sm:bottom-12 right-3 sm:right-6 z-[var(--z-sticky)] pointer-events-auto flex flex-col items-end gap-2">
            <AnimatedSocialIcons icons={hazardActions} iconSize={18} />
          </div>

          {/* Coordinates Readout, Performance Clustering & IndexedDB Tile Cache Indicator */}
          <div className="absolute bottom-2 left-2 z-[var(--z-sticky)] bg-white border border-carbon-20 px-2 py-1 text-xs text-carbon-70 pointer-events-auto max-w-[calc(100%-8rem)]">
            <p className="leading-snug">
              {MAP_LAYERS[activeLayer]?.attribution?.replace(/&copy;/g, '©').replace(/&mdash;/g, '—') || 'Map data © OpenStreetMap contributors'}
            </p>
          </div>

          <div className="absolute bottom-2 right-16 z-[var(--z-sticky)] bg-white px-3 py-2 border border-carbon-20 text-xs font-mono font-semibold text-carbon-70 pointer-events-auto hidden lg:flex items-center gap-3 tabular-nums">
            <span>Lat {currentCoords.lat.toFixed(4)}° N</span>
            <span>Lng {currentCoords.lng.toFixed(4)}° E</span>
            <span>Zoom {currentCoords.zoom}</span>
            <button
              type="button"
              onClick={() => setIsClusteringActive(!isClusteringActive)}
              className="min-h-[44px] px-3 border border-carbon-20 bg-white text-carbon-70 text-xs font-semibold"
              title="Toggle district marker clustering"
            >
              {isClusteringActive ? 'Clustered' : '64 pins'}
            </button>
            <button
              type="button"
              onClick={() => setIsLayerModalOpen(true)}
              className="min-h-[44px] px-3 border border-carbon-20 bg-white text-carbon-70 text-xs font-semibold"
              title="Offline tile cache"
            >
              Cache {cacheStats.totalTiles}
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
          className="p-4 bg-carbon-05 border-t border-carbon-20 flex flex-wrap items-center justify-between gap-3 text-xs"
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
                  className={`min-h-[44px] px-3 border text-xs font-semibold touch-manipulation ${
 isAct
 ? 'bg-nasa-red border-nasa-blue text-white '
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
