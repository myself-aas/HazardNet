import MaterialIcon from "./MaterialIcon";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapLegendUI } from './MapLegendUI';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.heat';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, Filter, Layers, RefreshCw, 
  ZoomIn, ZoomOut, Navigation, Maximize, Tag, 
  Camera, RotateCcw, Flame, Ruler, Waves, Radio, 
  Contrast, Compass, Box, Share2, Download, Copy,
  Check, FileText, Image as ImageIcon, Sparkles
} from 'lucide-react';
import { AnimatedSocialIcons } from './ui/floating-action-button';
import { LocationMap } from './ui/expand-map';
import { ALL_64_DISTRICTS, ALL_8_DIVISIONS, DistrictData } from '../data/bangladeshDistricts';
import { 
  isValidLatLng, 
  isValidCoordinate, 
  detectExactPinpointLocation, 
  getDistrictBoundaryCoordinates, 
  snapCoordinateToDistrictBoundary,
  getSeverityColor
} from '../services/geolocationService';
import { useAuth } from '../context/AuthContext';
import DataProcessingSkeleton from './DataProcessingSkeleton';

export type DistrictGeo = DistrictData;
export const liveDistrictsData: DistrictGeo[] = ALL_64_DISTRICTS;
export { getDistrictBoundaryCoordinates };

// Geodesic distance calculation in kilometers (Haversine formula)
export const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Find closest district to any lat/lng coordinate
export const findNearestDistrict = (lat: number, lng: number) => {
  let nearest = ALL_64_DISTRICTS[0];
  let minDistance = Infinity;
  for (const dist of ALL_64_DISTRICTS) {
    const distKm = calculateDistanceKm(lat, lng, dist.lat, dist.lng);
    if (distKm < minDistance) {
      minDistance = distKm;
      nearest = dist;
    }
  }
  return { district: nearest, distanceKm: minDistance };
};

export interface PathAnalysisResult {
  totalDistanceKm: number;
  startDistrict: DistrictGeo | null;
  endDistrict: DistrictGeo | null;
  districtsAlongPath: { district: DistrictGeo; t: number; distanceToLineKm: number }[];
  hazardsDetected: string[];
  maxSeverity: number;
  avgSeverity: number;
  riskRating: 'High' | 'Moderate' | 'Low';
  segmentCount: number;
}

// Interactive Path Analysis between clicked measurement points
export const analyzePathBetweenPoints = (points: [number, number][]): PathAnalysisResult | null => {
  if (!points || points.length < 2) return null;

  let totalDistanceKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDistanceKm += calculateDistanceKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }

  const startDistrict = findNearestDistrict(points[0][0], points[0][1]).district;
  const endDistrict = findNearestDistrict(points[points.length - 1][0], points[points.length - 1][1]).district;

  const matchedMap = new Map<string, { district: DistrictGeo; t: number; distanceToLineKm: number }>();

  for (let s = 0; s < points.length - 1; s++) {
    const latA = points[s][0];
    const lonA = points[s][1];
    const latB = points[s + 1][0];
    const lonB = points[s + 1][1];

    const meanLatRad = ((latA + latB) / 2) * (Math.PI / 180);
    const cosLat = Math.cos(meanLatRad);

    const ux = (lonB - lonA) * cosLat;
    const uy = latB - latA;
    const lenSq = ux * ux + uy * uy;

    for (const dist of ALL_64_DISTRICTS) {
      let t = 0;
      let projLat = latA;
      let projLng = lonA;

      if (lenSq > 0.0000001) {
        const vx = (dist.lng - lonA) * cosLat;
        const vy = dist.lat - latA;
        t = Math.max(0, Math.min(1, (vx * ux + vy * uy) / lenSq));
        projLat = latA + t * (latB - latA);
        projLng = lonA + t * (lonB - lonA);
      }

      const distKm = calculateDistanceKm(dist.lat, dist.lng, projLat, projLng);
      // Districts within 35km buffer of path segment
      if (distKm <= 35) {
        const globalT = s + t;
        const existing = matchedMap.get(dist.id);
        if (!existing || distKm < existing.distanceToLineKm) {
          matchedMap.set(dist.id, { district: dist, t: globalT, distanceToLineKm: distKm });
        }
      }
    }
  }

  const districtsAlongPath = Array.from(matchedMap.values()).sort((a, b) => a.t - b.t);

  const hazardsSet = new Set<string>();
  let maxSev = 0;
  let sumSev = 0;

  districtsAlongPath.forEach(({ district }) => {
    if (district.hazardType) hazardsSet.add(district.hazardType);
    if (district.severity > maxSev) maxSev = district.severity;
    sumSev += district.severity;
  });

  const avgSev = districtsAlongPath.length > 0 ? sumSev / districtsAlongPath.length : 0;
  const riskRating: 'High' | 'Moderate' | 'Low' = maxSev >= 0.8 ? 'High' : maxSev >= 0.5 ? 'Moderate' : 'Low';

  return {
    totalDistanceKm,
    startDistrict,
    endDistrict,
    districtsAlongPath,
    hazardsDetected: Array.from(hazardsSet),
    maxSeverity: maxSev,
    avgSeverity: avgSev,
    riskRating,
    segmentCount: points.length - 1,
  };
};

// Bangladesh Major River Networks Polylines
export const BANGLADESH_RIVERS = [
  {
    name: 'Padma River (Ganges Basin)',
    status: 'High Water Volume • Flow 24,500 m³/s',
    coords: [
      [24.62, 88.02],
      [24.35, 88.58],
      [24.08, 89.05],
      [23.78, 89.80],
      [23.40, 90.60],
    ] as [number, number][],
    color: '#0284c7',
  },
  {
    name: 'Jamuna River (Brahmaputra Channel)',
    status: 'Flood Warning Level • Flow 42,000 m³/s',
    coords: [
      [25.80, 89.65],
      [25.25, 89.72],
      [24.50, 89.70],
      [23.95, 89.78],
      [23.78, 89.80],
    ] as [number, number][],
    color: '#2563eb',
  },
  {
    name: 'Meghna Estuary Network',
    status: 'Tidal Delta Discharge • Flow 31,200 m³/s',
    coords: [
      [24.88, 90.95],
      [24.20, 90.90],
      [23.60, 90.65],
      [22.90, 90.60],
      [22.20, 90.75],
    ] as [number, number][],
    color: '#0891b2',
  },
  {
    name: 'Teesta River Basin',
    status: 'Flash Surge Inundation Risk',
    coords: [
      [26.35, 88.85],
      [26.05, 89.15],
      [25.68, 89.58],
      [25.50, 89.70],
    ] as [number, number][],
    color: '#38bdf8',
  },
  {
    name: 'Surma & Kushiyara (Sylhet Haor)',
    status: 'Severe Haor Inundation Alert',
    coords: [
      [25.10, 91.85],
      [24.90, 91.50],
      [24.55, 91.05],
      [24.40, 90.80],
    ] as [number, number][],
    color: '#7c3aed',
  },
  {
    name: 'Karnaphuli Coastal Basin',
    status: 'Estuarine Normal Flow',
    coords: [
      [22.75, 92.20],
      [22.45, 91.95],
      [22.28, 91.80],
    ] as [number, number][],
    color: '#0284c7',
  },
];

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

// Map tile layer options (Hyper Photo-Realistic Satellite, High Contrast & 3D Relief)
const MAP_LAYERS = {
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

// Custom High-Contrast Marker Generator for Leaflet
const createCustomIcon = (severity: number, isSelected: boolean, hazardType: string, districtName: string) => {
  const hazardDef = HAZARD_LAYERS.find((h) => h.id === hazardType) || { name: hazardType };
  const color = getSeverityColor(severity);
  const glowColor = color;

  const html = isSelected ? `
    <div style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.98);
      border: 3px solid #f9a825;
      box-shadow: 0 6px 24px rgba(0,0,0,0.25), 0 0 20px ${glowColor};
      color: #0f172a;
      font-family: 'Playfair Display', serif;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    ">
      <span style="color: #0f172a; letter-spacing: -0.2px;">${districtName}: <span style="color: #0284c7;">${hazardDef.name}</span></span>
      <span style="
        background: ${color};
        color: #ffffff;
        font-weight: 900;
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 6px;
        margin-left: 2px;
        box-shadow: 0 2px 6px ${glowColor};
      ">
        ${(severity * 100).toFixed(0)}%
      </span>
    </div>
  ` : `
    <div style="
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #ffffff;
      border: 3px solid ${color};
      box-shadow: 0 4px 14px rgba(0,0,0,0.2), 0 0 12px ${glowColor};
      color: #0f172a;
      font-family: 'Playfair Display', serif;
      font-size: 11px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s ease;
    " title="${districtName} (${(severity * 100).toFixed(0)}% ${hazardDef.name})">
      ${districtName.substring(0, 2).toUpperCase()}
    </div>
  `;

  return L.divIcon({
    html,
    className: isSelected ? 'custom-leaflet-marker-pill' : 'custom-leaflet-marker-node',
    iconSize: isSelected ? [220, 36] : [30, 30],
    iconAnchor: isSelected ? [110, 18] : [15, 15],
  });
};

export interface HazardLayerDef {
  id: string;
  name: string;
  color: string;
  badgeColor: string;
}

export const HAZARD_LAYERS: HazardLayerDef[] = [
  { id: 'Flash Flood', name: 'Flash Flood', color: '#0284c7', badgeColor: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'Monsoon Flood', name: 'Monsoon Flood', color: '#2563eb', badgeColor: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'Tropical Cyclone', name: 'Tropical Cyclone', color: '#7c3aed', badgeColor: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'Drought', name: 'Drought', color: '#d97706', badgeColor: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'Cold Wave', name: 'Cold Wave', color: '#0891b2', badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { id: 'Severe Storm', name: 'Severe Storm', color: '#dc2626', badgeColor: 'bg-rose-100 text-rose-800 border-rose-200' },
];

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
  const mainWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const measureGroupRef = useRef<L.LayerGroup | null>(null);
  const riverGroupRef = useRef<L.LayerGroup | null>(null);
  const radarGroupRef = useRef<L.LayerGroup | null>(null);
  const inspectGroupRef = useRef<L.LayerGroup | null>(null);
  const districtMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const lastTargetedDistrictRef = useRef<DistrictGeo | null>(null);

  // Header collapse state
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(compactHeader);

  useEffect(() => {
    setIsHeaderCollapsed(compactHeader);
  }, [compactHeader]);

  // Layer & Visual Controls
  const [activeLayer, setActiveLayer] = useState<keyof typeof MAP_LAYERS>('esriSatellite');
  const [isHighContrastBoost, setIsHighContrastBoost] = useState<boolean>(true);
  const [isHeatmapActive, setIsHeatmapActive] = useState<boolean>(false);
  const [isRiverLayerActive, setIsRiverLayerActive] = useState<boolean>(true);
  const [isRadarActive, setIsRadarActive] = useState<boolean>(false);
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
  const [isProcessingData, setIsProcessingData] = useState<boolean>(false);
  const [is3DTilted, setIs3DTilted] = useState<boolean>(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; zoom: number }>({ lat: 23.8103, lng: 90.4125, zoom: 7 });
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // New features: Fullscreen, Legend Panel, User Geolocation & PNG Snapshot Export
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState<boolean>(false);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(true);
  const [isLocatingUser, setIsLocatingUser] = useState<boolean>(false);
  const [userLocationError, setUserLocationError] = useState<string | null>(null);
  const [userGpsPos, setUserGpsPos] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [isExportingMap, setIsExportingMap] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // High-Resolution Export Modal & Sharing State
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportScale, setExportScale] = useState<number>(3); // 3 = Ultra HD 4K (300 DPI), 2 = 2K HD, 1.5 = Standard 1080p
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const [includeWatermarkHeader, setIncludeWatermarkHeader] = useState<boolean>(true);
  const [includeOverlayLegend, setIncludeOverlayLegend] = useState<boolean>(true);
  const [customReportTitle, setCustomReportTitle] = useState<string>('Bangladesh Multi-Hazard Geospatial Intelligence Report');

  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState<boolean>(false);
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  const hasAutoLocatedRef = useRef<boolean>(false);

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

  // Core Map Snapshot Generator: Captures current Leaflet stage with active layers & overlays
  const generateMapSnapshot = async (overrideScale?: number) => {
    if (!mapContainerRef.current) return;

    const targetScale = overrideScale !== undefined ? overrideScale : exportScale;
    setIsGeneratingSnapshot(true);
    setIsExportingMap(true);
    setUserLocationError(null);

    try {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }

      await new Promise((resolve) => setTimeout(resolve, 350));

      const captureTarget = mapContainerRef.current;

      const activeOverlayNames = HAZARD_LAYERS
        .filter((h) => selectedHazards.includes(h.id))
        .map((h) => h.name)
        .join(', ') || 'Baseline Vector Boundaries';

      const baseMapName = MAP_LAYERS[activeLayer]?.name || 'Satellite HD';
      const timestampStr = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const selectedInfo = currentSelected
        ? `${currentSelected.name} District (${(currentSelected.severity * 100).toFixed(0)}% Risk)`
        : 'Bangladesh National Overview';

      const executeHtml2Canvas = async (scaleToUse: number): Promise<HTMLCanvasElement> => {
        return await html2canvas(captureTarget, {
          useCORS: true,
          allowTaint: false,
          scale: scaleToUse,
          backgroundColor: '#0f172a',
          logging: false,
          imageTimeout: 12000,
          ignoreElements: (element) => {
            return element.classList.contains('no-export-snapshot');
          },
          onclone: (clonedDoc) => {
            // 1. Sanitize oklch colors in style tags without stripping Leaflet or Tailwind CSS files
            const styleTags = clonedDoc.querySelectorAll('style');
            styleTags.forEach((styleTag) => {
              try {
                if (styleTag.textContent && styleTag.textContent.includes('oklch')) {
                  styleTag.textContent = styleTag.textContent.replace(/oklch\([^)]+\)/g, '#64748b');
                }
              } catch (e) {
                // Ignore style sanitization errors
              }
            });

            // 2. Set crossOrigin = 'anonymous' on all tile images in clonedDoc
            const clonedImgs = clonedDoc.querySelectorAll('img');
            clonedImgs.forEach((img) => {
              img.crossOrigin = 'anonymous';
            });

            // 3. Inject safe fallback styles
            const oklchFixStyle = clonedDoc.createElement('style');
            oklchFixStyle.innerHTML = `
              *, ::before, ::after {
                color-scheme: light;
              }
              :root {
                --background: #ffffff;
                --foreground: #0f172a;
                --card: #ffffff;
                --card-foreground: #0f172a;
                --primary: #0f172a;
                --primary-foreground: #f8fafc;
                --secondary: #f1f5f9;
                --secondary-foreground: #0f172a;
                --muted: #f1f5f9;
                --muted-foreground: #64748b;
                --border: #e2e8f0;
                --input: #e2e8f0;
              }
            `;
            clonedDoc.head.appendChild(oklchFixStyle);

            const clonedContainer = clonedDoc.querySelector('.leaflet-container') as HTMLElement | null;
            if (clonedContainer) {
              clonedContainer.style.position = 'relative';

              // Render Official Report Header Watermark
              if (includeWatermarkHeader) {
                const headerDiv = clonedDoc.createElement('div');
                headerDiv.style.cssText = `
                  position: absolute;
                  top: 16px;
                  left: 16px;
                  right: 16px;
                  z-index: 999999;
                  background: rgba(15, 23, 42, 0.95);
                  color: #ffffff;
                  border: 2px solid #334155;
                  border-radius: 20px;
                  padding: 16px 20px;
                  font-family: 'Playfair Display', serif"Segoe UI", Roboto, sans-serif;
                  box-shadow: 0 25px 30px -5px rgba(0,0,0,0.7);
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 16px;
                `;

                const escapeHtml = (str: string) => String(str || '')
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');

                const escapedTitle = escapeHtml(customReportTitle);
                const escapedLocation = escapeHtml(selectedInfo);
                const escapedBaseMap = escapeHtml(baseMapName);
                const escapedTimestamp = escapeHtml(timestampStr);
                const escapedOverlays = escapeHtml(activeOverlayNames);

                headerDiv.innerHTML = `
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="width: 48px; height: 48px; border-radius: 14px; background: #f9a825; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 24px; color: #0f172a; border: 2px solid #ffffff; flex-shrink: 0;">
                      <MaterialIcon name="shield" className="w-4 h-4 inline-block align-middle" />
                    </div>
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f9a825; color: #0f172a; font-weight: 900; font-size: 10px; padding: 2px 9px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                          HAZARDNET AI GEOSPATIAL REPORT
                        </span>
                        <span style="font-size: 11px; color: #94a3b8; font-family: monospace;">
                          VERIFIED SNAPSHOT
                        </span>
                      </div>
                      <h2 style="font-size: 18px; font-weight: 900; margin: 4px 0 2px 0; color: #ffffff; letter-spacing: -0.02em;">
                        ${escapedTitle}
                      </h2>
                      <div style="font-size: 11px; color: #cbd5e1; display: flex; gap: 14px; flex-wrap: wrap;">
                        <MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span><strong>Location:</strong> ${escapedLocation}</span>
                        <span>🌐 <strong>Base Map:</strong> ${escapedBaseMap}</span>
                        <span>⏱️ <strong>Generated:</strong> ${escapedTimestamp}</span>
                      </div>
                    </div>
                  </div>
                  <div style="text-align: right; font-size: 11px; color: #94a3b8; line-height: 1.4; border-left: 1px solid #334155; padding-left: 16px; flex-shrink: 0;">
                    <div style="color: #f9a825; font-weight: 800; font-size: 12px;">Active Overlays</div>
                    <div style="color: #f8fafc; font-weight: 600; max-width: 220px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                      ${escapedOverlays}
                    </div>
                  </div>
                `;
                clonedContainer.appendChild(headerDiv);
              }

              // Render Active Legend Overlay
              if (includeOverlayLegend) {
                const legendDiv = clonedDoc.createElement('div');
                legendDiv.style.cssText = `
                  position: absolute;
                  bottom: 20px;
                  right: 20px;
                  z-index: 999999;
                  background: rgba(15, 23, 42, 0.95);
                  color: #ffffff;
                  border: 1px solid #334155;
                  border-radius: 14px;
                  padding: 12px 18px;
                  font-family: 'Playfair Display', serif"Segoe UI", Roboto, sans-serif;
                  box-shadow: 0 10px 20px -3px rgba(0,0,0,0.6);
                `;
                legendDiv.innerHTML = `
                  <div style="font-weight: 900; color: #f9a825; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Hazard Severity Index Scale</div>
                  <div style="display: flex; align-items: center; gap: 14px; font-size: 11px; font-weight: 700;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="width: 12px; height: 12px; border-radius: 50%; background: #dc2626; display: inline-block;"></span>
                      <span>Severe (≥80%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="width: 12px; height: 12px; border-radius: 50%; background: #d97706; display: inline-block;"></span>
                      <span>Moderate (50-79%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="width: 12px; height: 12px; border-radius: 50%; background: #16a34a; display: inline-block;"></span>
                      <span>Low (&lt;50%)</span>
                    </div>
                  </div>
                `;
                clonedContainer.appendChild(legendDiv);
              }
            }
          },
        });
      };

      // Direct Canvas Fallback Generator
      const renderNativeCanvasFallback = async (): Promise<HTMLCanvasElement> => {
        const rect = captureTarget.getBoundingClientRect();
        const width = Math.max(800, rect.width || 1200);
        const height = Math.max(600, rect.height || 800);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * targetScale);
        canvas.height = Math.round(height * targetScale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create canvas 2D context');

        ctx.scale(targetScale, targetScale);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Draw tile images
        const imgs = Array.from(captureTarget.querySelectorAll('img'));
        const containerRect = captureTarget.getBoundingClientRect();
        for (const img of imgs) {
          if (!img.complete || img.naturalWidth === 0) continue;
          const iRect = img.getBoundingClientRect();
          const dx = iRect.left - containerRect.left;
          const dy = iRect.top - containerRect.top;
          const dw = iRect.width;
          const dh = iRect.height;
          try {
            ctx.drawImage(img, dx, dy, dw, dh);
          } catch (e) {
            // Ignore individual tile draw exceptions
          }
        }

        // Watermark Header
        if (includeWatermarkHeader) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(16, 16, width - 32, 72, 16);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f9a825';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('HAZARDNET AI GEOSPATIAL REPORT', 32, 38);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText(customReportTitle.substring(0, 55), 32, 58);

          ctx.fillStyle = '#cbd5e1';
          ctx.font = '11px sans-serif';
          ctx.fillText(`<MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /> ${selectedInfo}  |  📡 ${baseMapName}  |  📅 ${timestampStr}`, 32, 74);
        }

        // Legend Overlay
        if (includeOverlayLegend) {
          const lW = 260;
          const lH = 46;
          const lX = width - lW - 20;
          const lY = height - lH - 20;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(lX, lY, lW, lH, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f9a825';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('HAZARD SEVERITY INDEX SCALE', lX + 12, lY + 18);

          // Severity dots
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(lX + 18, lY + 32, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '10px sans-serif';
          ctx.fillText('Severe', lX + 26, lY + 35);

          ctx.fillStyle = '#d97706';
          ctx.beginPath();
          ctx.arc(lX + 85, lY + 32, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText('Moderate', lX + 93, lY + 35);

          ctx.fillStyle = '#16a34a';
          ctx.beginPath();
          ctx.arc(lX + 160, lY + 32, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText('Low', lX + 168, lY + 35);
        }

        return canvas;
      };

      let canvas: HTMLCanvasElement;
      try {
        canvas = await executeHtml2Canvas(targetScale);
      } catch (primaryError) {
        console.warn('html2canvas primary capture failed, retrying at scale 1.5:', primaryError);
        try {
          canvas = await executeHtml2Canvas(1.5);
        } catch (secondaryError) {
          console.warn('html2canvas scale 1.5 failed, using native canvas fallback:', secondaryError);
          canvas = await renderNativeCanvasFallback();
        }
      }

      const mimeType = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = exportFormat === 'jpeg' ? 0.92 : 1.0;
      
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL(mimeType, quality);
      } catch (dataUrlErr) {
        console.warn('canvas.toDataURL failed due to canvas policy, falling back to jpeg/png standard:', dataUrlErr);
        dataUrl = canvas.toDataURL('image/png');
      }

      setCapturedPreviewUrl(dataUrl);

      try {
        canvas.toBlob(
          (blob) => {
            if (blob) setCapturedBlob(blob);
          },
          mimeType,
          quality
        );
      } catch (blobErr) {
        console.warn('canvas.toBlob failed:', blobErr);
      }

      setExportSuccessMsg('High-resolution map snapshot ready!');
    } catch (err) {
      console.error('Failed to capture map snapshot:', err);
      toast.error('Failed to capture map image. Please try again.');
    } finally {
      setIsGeneratingSnapshot(false);
      setIsExportingMap(false);
    }
  };

  const handleOpenExportModal = () => {
    setIsExportModalOpen(true);
    generateMapSnapshot();
  };

  const handleDownloadImage = () => {
    if (!capturedPreviewUrl) return;
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `HazardNet_MapReport_${dateStr}.${exportFormat}`;

    const downloadLink = document.createElement('a');
    downloadLink.href = capturedPreviewUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    toast.success(`High-resolution report saved as ${filename}`, { icon: <MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" /> });
  };

  const handleCopyImageToClipboard = async () => {
    if (!capturedBlob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({ [capturedBlob.type || 'image/png']: capturedBlob });
        await navigator.clipboard.write([item]);
        setCopySuccessMsg('High-resolution map image copied to clipboard!');
        toast.success('Copied map image to clipboard! Ready to paste into reports or messages.', { icon: <MaterialIcon name="content_copy" className="w-4 h-4 text-amber-600" /> });
        setTimeout(() => setCopySuccessMsg(null), 4000);
      } else {
        toast.error('Browser clipboard copy not supported. Please use Download.');
      }
    } catch (err) {
      console.error('Clipboard copy error:', err);
      toast.error('Could not copy image to clipboard. Try downloading instead.');
    }
  };

  const handleShareReport = async () => {
    if (!capturedBlob) return;
    try {
      const filename = `HazardNet_Report_${Date.now()}.${exportFormat}`;
      const file = new File([capturedBlob], filename, { type: capturedBlob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: customReportTitle,
          text: `HazardNet High-Resolution Geospatial Hazard Report for Bangladesh. Active Location: ${currentSelected?.name || 'All Districts'}.`,
          files: [file],
        });
        toast.success('Hazard report shared successfully!', { icon: <MaterialIcon name="ios_share" className="w-4 h-4 text-sky-600" /> });
      } else {
        handleDownloadImage();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
        toast.error('Sharing failed or was cancelled.');
      }
    }
  };

  // Legacy handler compatibility
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
  const handleCenterOnUserLocation = async () => {
    setIsLocatingUser(true);
    setUserLocationError(null);

    try {
      const result = await detectExactPinpointLocation();
      const { lat, lng, nearestDistrict, distanceKm, accuracyMeters } = result;

      setUserGpsPos({ lat, lng, accuracy: accuracyMeters });
      setIsLocatingUser(false);

      if (nearestDistrict) {
        if (onSelectDistrict) {
          onSelectDistrict({
            id: nearestDistrict.id,
            name: nearestDistrict.name,
            division: nearestDistrict.division,
            lat: nearestDistrict.lat,
            lng: nearestDistrict.lng,
            risk: nearestDistrict.risk,
            mainCrop: nearestDistrict.mainCrop,
          });
        }
        toast.success(
          `Mapped to your location in ${nearestDistrict.name} District (${nearestDistrict.division} Division)!`,
          { icon: <MaterialIcon name="my_location" className="w-4 h-4 text-amber-600" />, duration: 4500 }
        );
      }

      if (mapInstanceRef.current && nearestDistrict) {
        const boundaryCoords = getDistrictBoundaryCoordinates(nearestDistrict, lat, lng);
        if (boundaryCoords.length >= 3) {
          try {
            const bounds = L.latLngBounds(boundaryCoords);
            if (bounds.isValid()) {
              mapInstanceRef.current.fitBounds(bounds.pad(0.35), { animate: true, duration: 1.5, maxZoom: 11 });
            } else if (isValidLatLng(lat, lng)) {
              mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
            }
          } catch (e) {
            if (isValidLatLng(lat, lng)) {
              mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
            }
          }
        } else if (isValidLatLng(lat, lng)) {
          mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
        }
      } else if (mapInstanceRef.current && isValidLatLng(lat, lng)) {
        mapInstanceRef.current.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
      }
    } catch (err) {
      console.warn('Geolocation error:', err);
      setIsLocatingUser(false);
      setUserLocationError('GPS/IP location detection failed. Centered on default position.');
      const fallbackLat = isValidCoordinate(pinpointLat) ? pinpointLat! : 23.8103;
      const fallbackLng = isValidCoordinate(pinpointLng) ? pinpointLng! : 90.4125;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([fallbackLat, fallbackLng], 9, { animate: true, duration: 1.2 });
      }
    }
  };

  // Measure mode ref for Leaflet click callback
  const isMeasuringRef = useRef(isMeasuring);
  useEffect(() => {
    isMeasuringRef.current = isMeasuring;
  }, [isMeasuring]);

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

  // Selected district object
  const currentSelected = selectedDistrictId ? liveDistrictsData.find((d) => d.id === selectedDistrictId) : undefined;

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
      return liveDistrictsData.find((d) => d.id === userProfile.homeDistrictId) || null;
    }
    const storedDist = localStorage.getItem('hazardnet_home_district');
    if (storedDist) {
      return liveDistrictsData.find((d) => d.id === storedDist) || null;
    }
    return null;
  }, [userGpsPos, pinpointLat, pinpointLng, userProfile?.homeDistrictId]);

  useEffect(() => {
    (window as any).selectHazardDistrict = (districtId: string) => {
      const found = liveDistrictsData.find((d) => d.id === districtId);
      if (found) {
        handleSelectDistrict(found);
      }
    };
    return () => {
      delete (window as any).selectHazardDistrict;
    };
  }, [handleSelectDistrict]);

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

  // Compute live path distance, hazards & risk severity analysis
  const pathAnalysis = useMemo(() => {
    return analyzePathBetweenPoints(measurePoints);
  }, [measurePoints]);

  // Compute top 3 hazards for the selected division
  const divisionTopHazards = useMemo(() => {
    if (selectedDivision === 'All') return [];
    const divDistricts = liveDistrictsData.filter(d => d.division.toLowerCase() === selectedDivision.toLowerCase());
    
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
  }, [selectedDivision]);

  // Handle Division Filter Jump
  const handleSelectDivision = (divisionName: string) => {
    setSelectedDivision(divisionName);
    setIsolateSelected(false);
    if (!mapInstanceRef.current) return;

    if (divisionName === 'All') {
      mapInstanceRef.current.flyTo([23.8103, 90.4125], 7, { duration: 1.2 });
      return;
    }

    const divisionDistricts = liveDistrictsData.filter((d) => d.division.toLowerCase() === divisionName.toLowerCase());
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
      const divisionDistricts = liveDistrictsData.filter((d) => d.division.toLowerCase() === selectedDivision.toLowerCase());
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
  }, [selectedDistrictId, currentSelected, selectedDivision]);

  // Filtered districts based on search, division & active disaster checkboxes
  const filteredDistricts = liveDistrictsData.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.division.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.hazardType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesHazard = selectedHazards.includes(d.hazardType);
    const matchesDivision = selectedDivision === 'All' || d.division.toLowerCase() === selectedDivision.toLowerCase();
    return matchesSearch && matchesHazard && matchesDivision;
  });

  // 1. Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.8103, 90.4125],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    });

    const tileLayer = L.tileLayer(MAP_LAYERS[activeLayer].url, {
      maxZoom: MAP_LAYERS[activeLayer].maxZoom,
      opacity: 1.0,
      crossOrigin: true,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    const measureGroup = L.layerGroup().addTo(map);
    const riverGroup = L.layerGroup().addTo(map);
    const radarGroup = L.layerGroup().addTo(map);
    const inspectGroup = L.layerGroup().addTo(map);

    map.on('move', () => {
      const c = map.getCenter();
      setCurrentCoords({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });
    map.on('zoom', () => {
      const c = map.getCenter();
      setCurrentCoords({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    // Map Anywhere Click Handler: Distance Ruler or Inspection Pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(4));
      const lng = Number(e.latlng.lng.toFixed(4));

      if (isMeasuringRef.current) {
        setMeasurePoints((prev) => [...prev, [lat, lng]]);
      } else {
        setInspectedPoint({ lat, lng });
      }
    });

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    markersGroupRef.current = markersGroup;
    measureGroupRef.current = measureGroup;
    riverGroupRef.current = riverGroup;
    radarGroupRef.current = radarGroup;
    inspectGroupRef.current = inspectGroup;

    // Automatically request user's current coordinates & map to nearest district on first launch if setting is enabled
    if (!hasAutoLocatedRef.current) {
      hasAutoLocatedRef.current = true;
      const isAutoLocateEnabled =
        userProfile?.autoDetectLocationEnabled ??
        (localStorage.getItem('hazardnet_auto_detect_location') !== 'false');

      if (isAutoLocateEnabled) {
        setIsLocatingUser(true);
        detectExactPinpointLocation()
          .then((result) => {
            setIsLocatingUser(false);
            if (result && isValidLatLng(result.lat, result.lng)) {
              setUserGpsPos({ lat: result.lat, lng: result.lng, accuracy: result.accuracyMeters });
              if (result.nearestDistrict && onSelectDistrict) {
                onSelectDistrict({
                  id: result.nearestDistrict.id,
                  name: result.nearestDistrict.name,
                  division: result.nearestDistrict.division,
                  lat: result.nearestDistrict.lat,
                  lng: result.nearestDistrict.lng,
                  risk: result.nearestDistrict.risk,
                  mainCrop: result.nearestDistrict.mainCrop,
                });
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
                  } catch (e) {
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
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markersGroupRef.current = null;
      measureGroupRef.current = null;
      riverGroupRef.current = null;
      radarGroupRef.current = null;
      inspectGroupRef.current = null;
    };
  }, []);

  // 2. Update Tile Layer on switch
  useEffect(() => {
    if (!tileLayerRef.current || !mapInstanceRef.current) return;
    setIsProcessingData(true);
    const config = MAP_LAYERS[activeLayer];
    tileLayerRef.current.setUrl(config.url);
    const timer = setTimeout(() => {
      setIsProcessingData(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeLayer]);

  // 3. Render Markers & Outlined District Boundaries
  useEffect(() => {
    if (!markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
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
              ? `<div style="font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>${dist.name} District Boundary (Your Location)</span><span style="background: ${severityColor}; color: #ffffff; padding: 2px 6px; border-radius: 9999px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`
              : `<div style="font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><span>${dist.name} District ${isDivSel ? `(${dist.division} Division)` : 'Boundary'}</span><span style="background: ${severityColor}; color: #ffffff; padding: 2px 6px; border-radius: 9999px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`;

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

        // Responsive Popup Card
        const popupContent = `
        <div style="
          padding: 16px;
          font-family: 'Playfair Display', serif;
          color: #0f172a;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.18);
          min-width: 260px;
          max-width: 320px;
          box-sizing: border-box;
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
            <div>
              <div style="font-size: 15px; font-weight: 900; color: #0f172a; letter-spacing: -0.3px;">
                ${dist.name} District
              </div>
              <div style="font-size: 10px; color: #64748b; font-family: monospace; font-weight: bold; margin-top: 1px;">
                ${dist.division} Division
              </div>
            </div>
            <span style="
              font-size: 10px;
              font-weight: 900;
              padding: 3px 9px;
              border-radius: 9999px;
              background: ${dist.severity >= 0.8 ? '#fee2e2' : dist.severity >= 0.5 ? '#fef3c7' : '#dcfce7'};
              color: ${dist.severity >= 0.8 ? '#991b1b' : dist.severity >= 0.5 ? '#92400e' : '#166534'};
              border: 1px solid ${dist.severity >= 0.8 ? '#fca5a5' : dist.severity >= 0.5 ? '#fde68a' : '#86efac'};
              white-space: nowrap;
            ">
              ${dist.risk} Risk
            </span>
          </div>

          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 12px;
            margin-bottom: 12px;
          ">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 900; color: #0f172a;">
                <span>${dist.hazardType}</span>
              </div>
              <span style="font-size: 13px; font-weight: 900; color: ${color}; font-family: monospace;">
                ${severityPct}%
              </span>
            </div>
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 9999px; overflow: hidden; margin-top: 4px;">
              <div style="width: ${severityPct}%; height: 100%; background: ${color}; border-radius: 9999px;"></div>
            </div>
          </div>

          <div style="font-size: 11px; color: #334155; line-height: 1.6; margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Primary Agriculture:</span>
              <strong style="color: #0f172a;">${dist.mainCrop}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Elevation MSL:</span>
              <strong style="color: #0f172a;">${dist.elevationMeters}m</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Coordinates:</span>
              <strong style="color: #0284c7; font-family: monospace;">${dist.lat.toFixed(2)}°N, ${dist.lng.toFixed(2)}°E</strong>
            </div>
          </div>

          <button id="btn-modal-${dist.id}" style="
            width: 100%;
            padding: 10px 12px;
            background: #f9a825;
            border: none;
            border-radius: 10px;
            color: #ffffff;
            font-weight: 900;
            font-size: 11px;
            cursor: pointer;
            box-shadow: 0 3px 10px rgba(249, 168, 37, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s ease;
          ">
            <span>View Detailed Analytics</span>
          </button>
        </div>
      `;

        marker.bindPopup(popupContent, {
          className: 'custom-modern-leaflet-popup',
          maxWidth: 320,
          minWidth: 260,
          autoPan: true,
          autoPanPadding: [20, 20],
        });

        districtMarkersRef.current.set(dist.id, marker);

        const triggerClick = () => {
          handleSelectDistrict(dist);
        };

        marker.on('click', triggerClick);
        circle.on('click', triggerClick);

        marker.on('popupopen', () => {
          const btn = document.getElementById(`btn-modal-${dist.id}`);
          if (btn) {
            btn.onclick = (e) => {
              e.stopPropagation();
              navigate(`/forecast/district/${dist.id}`);
            };
          }
        });

        markersGroupRef.current?.addLayer(circle);
        markersGroupRef.current?.addLayer(marker);
      } catch (markerErr) {
        console.warn('Failed to add district marker:', dist.name, markerErr);
      }
    });

    // Render User Pinpoint GPS marker if passed
    if (isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng) && isValidLatLng(pinpointLat, pinpointLng)) {
      try {
        const userPinIcon = L.divIcon({
          html: `
            <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
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

        userPinMarker.bindPopup(`
          <div style="padding: 12px; font-family: 'Playfair Display', serif; color: #023246; min-width: 240px; max-width: 280px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>
                <strong style="font-size: 13px; color: #0f172a; font-weight: 800;">Stored Location Pin</strong>
              </div>
              <span style="font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #0284c7; border: 1px solid rgba(56, 189, 248, 0.3);">Synced GPS</span>
            </div>

            <div style="font-size: 11px; color: #475569; line-height: 1.6;">
              <div style="display: flex; justify-content: space-between; font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 6px;">
                <span>Lat: <strong>${pinpointLat.toFixed(4)}°N</strong></span>
                <span>Lng: <strong>${pinpointLng.toFixed(4)}°E</strong></span>
              </div>

              ${pinDist ? `
                <div style="margin-top: 8px; padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase;">Identified District</div>
                  <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 1px;">
                    ${pinDist.name} <span style="font-size: 10px; font-weight: 600; color: #64748b;">(${pinDist.division})</span>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1;">
                    <div>
                      <div style="font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase;">Hazard Type</div>
                      <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 1px;"><MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> ${pinDist.hazardType}</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase;">Severity Score</div>
                      <span style="font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 4px; background: ${pinRiskBg}; color: ${pinRiskColor}; display: inline-block; margin-top: 1px;">
                        ${pinSevPct}% (${pinDist.risk})
                      </span>
                    </div>
                  </div>
                  <div style="margin-top: 6px; font-size: 10px; color: #475569;">
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
            <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
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

        const nearest = findNearestDistrict(userGpsPos.lat, userGpsPos.lng);
        const dist = nearest?.district;
        const distanceKm = nearest?.distanceKm ? nearest.distanceKm.toFixed(1) : '0.0';
        const sevPct = dist ? Math.round(dist.severity * 100) : 0;
        const riskColor = dist?.risk === 'High' ? '#e11d48' : dist?.risk === 'Moderate' ? '#d97706' : '#16a34a';
        const riskBg = dist?.risk === 'High' ? 'rgba(225, 29, 72, 0.12)' : dist?.risk === 'Moderate' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(22, 163, 74, 0.12)';
        const riskBorder = dist?.risk === 'High' ? 'rgba(225, 29, 72, 0.3)' : dist?.risk === 'Moderate' ? 'rgba(217, 119, 6, 0.3)' : 'rgba(22, 163, 74, 0.3)';

        gpsMarker.bindPopup(`
          <div style="padding: 12px; font-family: 'Playfair Display', serif; color: #023246; min-width: 250px; max-width: 290px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>
                <strong style="font-size: 13px; color: #0f172a; font-weight: 800;">GPS Device Position</strong>
              </div>
              <span style="font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #0284c7; border: 1px solid rgba(56, 189, 248, 0.3);">Active GPS</span>
            </div>

            <div style="font-size: 11px; color: #334155; line-height: 1.5;">
              <div style="display: flex; justify-content: space-between; font-family: monospace; background: #f1f5f9; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div>Latitude: <strong>${userGpsPos.lat.toFixed(4)}°N</strong></div>
                <div>Longitude: <strong>${userGpsPos.lng.toFixed(4)}°E</strong></div>
              </div>
              <div style="margin-top: 4px; font-size: 10px; color: #64748b; font-family: monospace; text-align: right;">
                GPS Accuracy: <strong>~${userGpsPos.accuracy || 10}m</strong>
              </div>

              ${dist ? `
                <div style="margin-top: 8px; padding: 10px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Identified District</div>
                      <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 1px;">
                        ${dist.name} <span style="font-size: 11px; font-weight: 600; color: #64748b;">(${dist.division})</span>
                      </div>
                    </div>
                    <span style="font-size: 10px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(2, 132, 199, 0.2);">
                      ${distanceKm} km
                    </span>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
                    <div>
                      <div style="font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase;">Identified Hazard</div>
                      <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 1px;"><MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> ${dist.hazardType}</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase;">Severity Score</div>
                      <div style="margin-top: 2px;">
                        <span style="font-size: 11px; font-weight: 900; padding: 2px 7px; border-radius: 5px; background: ${riskBg}; color: ${riskColor}; border: 1px solid ${riskBorder}; display: inline-block;">
                          ${sevPct}% (${dist.risk})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9; font-size: 10px; color: #475569; display: flex; align-items: center; gap: 4px;">
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
            `<div style="font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>${activeUserDistrict.name} District Boundary (Your Location)</span><span style="background: ${severityColor}; color: #ffffff; padding: 2px 6px; border-radius: 9999px; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${severityPercent}% Severity</span></div>`,
            { permanent: true, direction: 'top' }
          );
          markersGroupRef.current?.addLayer(boundaryPolygon);
        } catch (e) {
          console.warn('Failed to draw activeUserDistrict fallback boundary:', e);
        }
      }
    }
  }, [filteredDistricts, selectedDistrictId, isolateSelected, currentSelected, handleSelectDistrict, navigate, pinpointLat, pinpointLng, userGpsPos, activeUserDistrict]);

  // 4. Render Interactive Click Inspection Marker
  useEffect(() => {
    if (!inspectGroupRef.current) return;
    inspectGroupRef.current.clearLayers();

    if (inspectedPoint && isValidLatLng(inspectedPoint.lat, inspectedPoint.lng)) {
      const inspectIcon = L.divIcon({
        html: `
          <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: -12px; border-radius: 50%; background: rgba(249, 168, 37, 0.45); filter: blur(6px);" class="radar-ping-ring"></div>
            <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background: #ffffff; border: 3px solid #f9a825; display: flex; align-items: center; justify-content: center; color: #0f172a; font-size: 14px; font-weight: 900; box-shadow: 0 4px 16px rgba(249, 168, 37, 0.5);">
              <MaterialIcon name="search" className="w-4 h-4 inline-block align-middle" />
            </div>
          </div>
        `,
        className: 'inspect-pin-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const inspectMarker = L.marker([inspectedPoint.lat, inspectedPoint.lng], { icon: inspectIcon, zIndexOffset: 4000 });
      inspectGroupRef.current.addLayer(inspectMarker);
    }
  }, [inspectedPoint]);

  // 5. Render Distance Measurement Ruler Polyline, Waypoint Nodes & Path Analysis Leaflet Popup
  useEffect(() => {
    if (!measureGroupRef.current) return;
    measureGroupRef.current.clearLayers();

    if (measurePoints.length > 0) {
      // Waypoint Markers
      measurePoints.forEach((pt, idx) => {
        const stepDist = idx > 0 ? calculateDistanceKm(measurePoints[idx - 1][0], measurePoints[idx - 1][1], pt[0], pt[1]) : 0;
        const nearest = findNearestDistrict(pt[0], pt[1]);

        const nodeIcon = L.divIcon({
          html: `
            <div style="
              background: ${idx === 0 ? '#0284c7' : '#f9a825'};
              color: #ffffff;
              font-family: 'Playfair Display', serif;
              font-size: 10px;
              font-weight: 900;
              padding: 4px 9px;
              border-radius: 9999px;
              border: 2px solid #ffffff;
              box-shadow: 0 4px 14px rgba(0,0,0,0.35);
              white-space: nowrap;
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span>${idx === 0 ? '<MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /> P1' : `<MaterialIcon name="my_location" className="w-4 h-4 inline-block align-middle" /> P${idx + 1}`}</span>
              <span style="opacity: 0.9;">(${nearest.district.name})</span>
              ${stepDist > 0 ? `<span style="background: rgba(0,0,0,0.25); padding: 1px 5px; border-radius: 6px;">+${stepDist.toFixed(1)}km</span>` : ''}
            </div>
          `,
          className: 'measure-node-icon',
          iconSize: [120, 26],
          iconAnchor: [60, 13],
        });

        const marker = L.marker([pt[0], pt[1]], { icon: nodeIcon, zIndexOffset: 3800 });
        measureGroupRef.current?.addLayer(marker);
      });

      // Connecting Polyline & Midpoint Analysis Leaflet Popup
      if (measurePoints.length >= 2) {
        const line = L.polyline(measurePoints, {
          color: '#f9a825',
          weight: 5,
          opacity: 0.95,
          dashArray: '8, 8',
        });
        measureGroupRef.current.addLayer(line);

        const analysis = analyzePathBetweenPoints(measurePoints);
        if (analysis) {
          // Midpoint of segment
          const midLat = (measurePoints[0][0] + measurePoints[1][0]) / 2;
          const midLng = (measurePoints[0][1] + measurePoints[1][1]) / 2;

          const riskBadgeColor =
            analysis.riskRating === 'High' ? '#dc2626' : analysis.riskRating === 'Moderate' ? '#d97706' : '#16a34a';

          const midpointIcon = L.divIcon({
            html: `
              <div style="
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: #ffffff;
                border: 3px solid #f9a825;
                box-shadow: 0 4px 16px rgba(249, 168, 37, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                font-weight: 900;
                cursor: pointer;
              ">
                📏
              </div>
            `,
            className: 'measure-midpoint-icon',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const midpointMarker = L.marker([midLat, midLng], { icon: midpointIcon, zIndexOffset: 3900 });

          const popupContent = `
            <div style="padding: 10px; font-family: 'Playfair Display', serif; color: #0f172a; min-width: 250px; max-width: 290px;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
                <strong style="font-size: 12px; color: #0f172a; font-weight: 900; display: flex; align-items: center; gap: 4px;">
                  📏 Path Measurement
                </strong>
                <span style="font-size: 11px; font-weight: 900; background: #f9a825; color: #ffffff; padding: 2px 8px; border-radius: 9999px;">
                  ${analysis.totalDistanceKm.toFixed(1)} km
                </span>
              </div>
              
              <div style="font-size: 11px; line-height: 1.6; color: #334155;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-weight: 800; color: #0f172a; background: #f8fafc; padding: 6px 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <span style="color: #0284c7;"><MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /> ${analysis.startDistrict?.name || 'P1'}</span>
                  <span style="color: #64748b;">➔</span>
                  <span style="color: #d97706;"><MaterialIcon name="my_location" className="w-4 h-4 inline-block align-middle" /> ${analysis.endDistrict?.name || 'P2'}</span>
                </div>
                
                <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Path Severity Risk:</span>
                  <span style="font-size: 10px; font-weight: 900; color: ${riskBadgeColor}; background: ${riskBadgeColor}15; padding: 2px 6px; border-radius: 4px; border: 1px solid ${riskBadgeColor}30;">
                    ${(analysis.maxSeverity * 100).toFixed(0)}% • ${analysis.riskRating}
                  </span>
                </div>

                <div style="margin-top: 6px;">
                  <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Hazards Encountered:</span>
                  <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                    ${
                      analysis.hazardsDetected.length > 0
                        ? analysis.hazardsDetected.map(h => `<span style="font-size: 9px; font-weight: 800; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px;"><MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> ${h}</span>`).join('')
                        : '<span style="font-size: 10px; color: #16a34a; font-weight: 700;">✓ Low Hazard Risk</span>'
                    }
                  </div>
                </div>

                <div style="margin-top: 8px; font-size: 10px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
                  Districts transited (${analysis.districtsAlongPath.length}): ${analysis.districtsAlongPath.map(d => d.district.name).join(', ')}
                </div>
              </div>
            </div>
          `;

          midpointMarker.bindPopup(popupContent, { autoPan: false, closeButton: true });
          measureGroupRef.current.addLayer(midpointMarker);

          setTimeout(() => {
            midpointMarker.openPopup();
          }, 150);
        }
      }
    }
  }, [measurePoints]);

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
            `<div style="font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 900; color: #0284c7;">
              <MaterialIcon name="water" className="w-4 h-4 inline-block align-middle" /> ${river.name}<br/>
              <span style="font-size: 10px; color: #64748b; font-weight: normal;">${river.status}</span>
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

    if (isRadarActive) {
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
  }, [isRadarActive]);

  // 8. Update Heatmap Layer
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (isHeatmapActive) {
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
  }, [isHeatmapActive, filteredDistricts]);

  // Total measured distance calculation
  const totalMeasuredKm = measurePoints.reduce((acc, curr, idx) => {
    if (idx === 0) return 0;
    const prev = measurePoints[idx - 1];
    return acc + calculateDistanceKm(prev[0], prev[1], curr[0], curr[1]);
  }, 0);

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
        setSyncToastMessage("Syncing 64 Districts Telemetry from Sentinel-2 & NASA GPM...");
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
      className: is3DTilted ? "bg-[#f9a825]/20 text-[#f9a825]" : ""
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
      className: userGpsPos ? "bg-sky-500/20 text-sky-500 animate-pulse" : (isLocatingUser ? "animate-spin text-amber-500" : "")
    },
    {
      Icon: Maximize,
      title: isBrowserFullscreen ? "Exit Browser Fullscreen (Esc)" : "Enter Browser Fullscreen",
      onClick: handleToggleFullscreen,
      className: isBrowserFullscreen ? "bg-emerald-600/20 text-emerald-600" : ""
    },
    {
      Icon: Tag,
      title: isLegendOpen ? "Hide Hazard Legend Panel" : "Show Hazard Legend Panel",
      onClick: () => setIsLegendOpen(!isLegendOpen),
      className: isLegendOpen ? "bg-[#f9a825]/20 text-[#f9a825]" : ""
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
      className: isHeatmapActive ? "bg-[#f9a825]/20 text-[#f9a825]" : ""
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
      className: isRiverLayerActive ? "bg-sky-600/20 text-sky-600" : ""
    },
    {
      Icon: Radio,
      title: "Toggle Live Doppler Weather Radar Simulation",
      onClick: () => setIsRadarActive(!isRadarActive),
      className: isRadarActive ? "bg-purple-600/20 text-purple-600" : ""
    },
    {
      Icon: Contrast,
      title: "Toggle Tile High Contrast Visual Filter Boost",
      onClick: () => setIsHighContrastBoost(!isHighContrastBoost),
      className: isHighContrastBoost ? "bg-slate-900/20 text-slate-900" : ""
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
          ? 'w-full h-full min-h-screen h-screen bg-slate-900 overflow-hidden text-slate-900 relative z-[10]'
          : className
          ? className
          : `w-full ${customHeight || 'h-full min-h-[500px] lg:min-h-[700px]'} bg-slate-100 rounded-[28px] overflow-hidden text-slate-900 relative border border-slate-200 shadow-sm`
      }
    >
      {/* Absolute Headers Overlay */}
      <div className="absolute top-0 left-0 right-0 z-[100] flex flex-col pointer-events-none">
        <div className="pointer-events-auto w-full flex flex-col">
          {/* Top Header Bar (Only when NOT isFullScreen) */}
          <AnimatePresence mode="wait">
          {!isFullScreen && isHeaderCollapsed && (
            <motion.div
              key="compact-header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-2.5 px-4 bg-white/90 backdrop-blur-md border-b border-slate-200/70 flex items-center justify-between gap-3 text-xs shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                
                <span className="font-extrabold text-slate-900">GIS Satellite Engine</span>
                <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                  • {filteredDistricts.length} Districts Active
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).slice(0, 3).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveLayer(key)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                      activeLayer === key
                        ? 'bg-[#f9a825] text-slate-900 shadow-xs'
                        : 'bg-slate-100/90 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {key === 'esriSatellite' ? 'Satellite' : key === 'esriClarity' ? 'Clarity' : 'Dark GIS'}
                  </button>
                ))}

                <button
                  onClick={() => setIsHeaderCollapsed(false)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1"
                  title="Expand map controls and filters"
                >
                  <span>Controls 🔽</span>
                </button>
              </div>
            </motion.div>
          )}

          {!isFullScreen && !isHeaderCollapsed && (
            <motion.div
              key="full-header"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="p-4 sm:p-5 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              {/* Title & Telemetry Status */}
          <div className="flex items-center gap-3.5">
            <div className="px-3.5 py-2.5 rounded-2xl bg-[#f9a825] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm tracking-wider uppercase">
              GIS
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  High-Contrast GIS & Satellite Engine
                </h3>
                <span className="px-3 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-[#ad6d04] border border-amber-200 flex items-center gap-1.5">
                  
                  HD TERRAIN STREAM
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {filteredDistricts.length} / {liveDistrictsData.length} Districts Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-medium">
                14-vertex vector boundaries, live river basin overlays, point telemetry inspection & geodesic ruler
              </p>
            </div>
          </div>

          {/* Map Engine Layer Switcher & High Contrast Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200 overflow-x-auto max-w-full">
              {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).map((key) => {
                const isAct = activeLayer === key;
                const labels: Record<string, string> = {
                  esriSatellite: 'HD Satellite',
                  esriClarity: 'Vivid Clarity',
                  cartoDark: 'Dark GIS',
                  osmStandard: 'Street Map',
                  esriShadedRelief: '3D Relief',
                  topoMap: 'Contour Topo',
                };
                return (
                  <button
                    key={key}
                    onClick={() => setActiveLayer(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
                      isAct
                        ? 'bg-[#f9a825] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {labels[key]}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setIsHighContrastBoost(!isHighContrastBoost)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-black transition-all border shadow-xs min-h-[40px] flex items-center gap-1.5 ${
                isHighContrastBoost
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                  : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-white'
              }`}
              title="Toggle Tile High Contrast Visual Enhancement"
            >
              <span>{isHighContrastBoost ? '<MaterialIcon name="bolt" className="w-4 h-4 inline-block align-middle" /> High Contrast [ON]' : 'High Contrast [OFF]'}</span>
            </button>

            {/* High-Res Map Export Button */}
            <button
              onClick={handleExportMapImage}
              disabled={isExportingMap}
              className={`px-3.5 py-2 rounded-2xl text-xs font-black transition-all border shadow-xs min-h-[40px] flex items-center gap-1.5 active:scale-95 ${
                isExportingMap
                  ? 'bg-amber-500 text-white border-amber-500 animate-pulse'
                  : 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800 shadow-sm'
              }`}
              title="Capture and download current visible map area as a high-resolution PNG image"
            >
              <span>{isExportingMap ? '⌛ Capturing Map...' : '<MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" /> Export PNG Map'}</span>
            </button>

            <button
              onClick={() => setIsHeaderCollapsed(true)}
              className="px-3.5 py-2 rounded-2xl text-xs font-black bg-slate-900 text-white hover:bg-slate-800 transition-all border border-slate-800 shadow-xs min-h-[40px] flex items-center gap-1.5 cursor-pointer"
              title="Collapse controls overlay to maximize visible interactive map stage"
            >
              <span>Collapse 🔼</span>
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Exterior Filter Bar: Search & Hazard Filter Pills (Only when NOT isFullScreen and NOT isHeaderCollapsed) */}
      <AnimatePresence>
      {!isFullScreen && !isHeaderCollapsed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="px-4 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
        >
          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="Search districts, hazards, or divisions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-white/90 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-[#f9a825] font-semibold shadow-xs"
            />
          </div>

          {/* Hazard Layer Toggles */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar">
            <button
              onClick={() => {
                if (selectedHazards.length === HAZARD_LAYERS.length) {
                  clearAllHazards();
                } else {
                  selectAllHazards();
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
                selectedHazards.length === HAZARD_LAYERS.length
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 bg-white/90 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Hazards ({selectedHazards.length}/{HAZARD_LAYERS.length})
            </button>
            {HAZARD_LAYERS.map((h) => {
              const isAct = selectedHazards.includes(h.id);
              const count = liveDistrictsData.filter((d) => d.hazardType === h.id).length;
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHazard(h.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    isAct
                      ? 'bg-[#f9a825] text-white font-black shadow-xs'
                      : 'text-slate-600 bg-white/90 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{h.name}</span>
                  <span className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${isAct ? 'bg-amber-700/30 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
        </div>
      </div>

      {/* Main Map Stage Container */}
      <div
        onMouseMove={handleActivity}
        onTouchStart={handleActivity}
        className="absolute inset-0 z-0 bg-transparent overflow-hidden"
      >
        {/* Data Processing Skeleton Overlay */}
        <AnimatePresence>
        {isProcessingData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[1200] p-6 bg-white/95 backdrop-blur-2xl flex flex-col justify-center"
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
          className={`w-full h-full bg-transparent map-perspective-container ${
            is3DTilted ? 'map-perspective-tilted' : ''
          } ${isHighContrastBoost ? 'map-tile-high-contrast' : ''}`}
        >
          <div ref={mapContainerRef} className="w-full h-full z-10 bg-transparent pointer-events-auto" />
        </div>

        {/* Floating HUD Controls Container */}
        <div
          onMouseEnter={handleActivity}
          className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
            isHudVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Top-Right Floating Panel: District Info or Point Inspection HUD */}
          <AnimatePresence>
            {currentSelected && !inspectedPoint && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="absolute top-20 sm:top-6 left-4 right-4 sm:left-auto sm:right-6 z-[1000] pointer-events-auto sm:max-w-[320px] w-auto sm:w-full"
              >
                <div className="bg-white/98 border border-slate-200 rounded-2xl p-4 shadow-xl text-slate-800 flex flex-col gap-2.5 transition-all">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                      
                      TARGETED LOCATION HAZARD
                    </div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight mt-0.5 truncate">
                      {currentSelected.name} District
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                        currentSelected.severity >= 0.8
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : currentSelected.severity >= 0.5
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {currentSelected.risk} Risk
                    </span>
                    <button
                      onClick={() => {
                        if (onSelectDistrict) {
                          onSelectDistrict(null as any);
                        }
                      }}
                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-black flex items-center justify-center text-xs transition-colors cursor-pointer border border-slate-200 shadow-xs"
                      title="Close Target Hazard Overlay"
                      aria-label="Close Target Hazard Overlay"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">{currentSelected.hazardType}</span>
                    <span
                      className={`text-xs font-black font-mono ${
                        currentSelected.severity >= 0.8
                          ? 'text-rose-600'
                          : currentSelected.severity >= 0.5
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {(currentSelected.severity * 100).toFixed(0)}% Severity
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        currentSelected.severity >= 0.8
                          ? 'bg-rose-500'
                          : currentSelected.severity >= 0.5
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${currentSelected.severity * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Division</span>
                    <span className="font-bold text-slate-800">{currentSelected.division}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Elevation</span>
                    <span className="font-bold text-slate-800">{currentSelected.elevationMeters}m MSL</span>
                  </div>
                </div>

                {/* Expandable Location Map Tile */}
                <div className="my-1">
                  <LocationMap 
                    location={`${currentSelected.name}, Bangladesh`}
                    coordinates={`${currentSelected.lat.toFixed(4)}° N, ${currentSelected.lng.toFixed(4)}° E`}
                  />
                </div>

                <button
                  onClick={() => navigate(`/forecast/district/${currentSelected.id}`)}
                  className="w-full py-2 bg-[#f9a825] hover:bg-[#d08305] text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <span>View Detailed Disaster Analytics</span>
                </button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Point Telemetry Click Inspection HUD */}
          <AnimatePresence>
          {inspectedPoint && nearestDistrictData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-20 sm:top-6 left-4 right-4 sm:left-auto sm:right-6 z-[1050] pointer-events-auto sm:max-w-[320px] w-auto sm:w-full"
            >
              <div className="bg-white/98 border-2 border-amber-400 rounded-2xl p-4 shadow-2xl text-slate-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-600 uppercase tracking-wider">
                      
                      POINT INSPECTION TELEMETRY
                    </div>
                    <h4 className="text-sm font-black text-slate-900 tracking-tight mt-0.5">
                      Lat: {inspectedPoint.lat}° N, Lng: {inspectedPoint.lng}° E
                    </h4>
                  </div>
                  <button
                    onClick={() => setInspectedPoint(null)}
                    className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Nearest District:</span>
                    <span className="text-amber-800">{nearestDistrictData.district.name}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 font-mono text-[11px]">
                    <span>Distance to Center:</span>
                    <span>{nearestDistrictData.distanceKm.toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between text-slate-600 font-mono text-[11px]">
                    <span>Vulnerability Index:</span>
                    <span className="font-bold text-rose-600">{(nearestDistrictData.district.severity * 92).toFixed(0)} / 100</span>
                  </div>
                </div>

                <div className="my-0.5">
                  <LocationMap 
                    location={`${nearestDistrictData.district.name}, ${nearestDistrictData.district.division}`}
                    coordinates={`${inspectedPoint.lat.toFixed(4)}° N, ${inspectedPoint.lng.toFixed(4)}° E`}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleSelectDistrict(nearestDistrictData.district);
                      setInspectedPoint(null);
                    }}
                    className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-sm text-center"
                  >
                    Focus {nearestDistrictData.district.name}
                  </button>
                  <button
                    onClick={() => setInspectedPoint(null)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
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
              className="absolute top-24 sm:top-6 left-4 right-4 sm:right-auto sm:left-20 z-[1050] pointer-events-auto sm:max-w-sm w-auto sm:w-full"
            >
              <div className="bg-slate-900/95 backdrop-blur-md text-white border-2 border-amber-500/80 rounded-2xl p-3.5 shadow-2xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 text-xs font-bold">
                  <span className="flex items-center gap-2 text-amber-400 font-mono tracking-wide">
                    <span className="text-base">📏</span> MEASUREMENT & HAZARD ANALYZER
                  </span>
                  <button
                    onClick={() => {
                      setIsMeasuring(false);
                      setMeasurePoints([]);
                    }}
                    className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-0.5 rounded-md hover:bg-slate-800 transition-colors"
                  >
                    Close
                  </button>
                </div>

                {measurePoints.length === 0 && (
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-300 flex items-center gap-2">
                    <span className="text-amber-400 text-sm animate-bounce">👇</span>
                    <span>Click any location on the map to set <strong>Point 1 (Origin)</strong>.</span>
                  </div>
                )}

                {measurePoints.length === 1 && (
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                      <MaterialIcon name="location_on" className="w-4 h-4 inline-block align-middle" /><span>Point 1 (Origin):</span>
                      <span>{findNearestDistrict(measurePoints[0][0], measurePoints[0][1]).district.name}</span>
                    </div>
                    <div className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                      <span className="animate-pulse"><MaterialIcon name="my_location" className="w-4 h-4 inline-block align-middle" /></span> Click a second location to set <strong>Point 2 (Destination)</strong> & calculate path hazards.
                    </div>
                  </div>
                )}

                {measurePoints.length >= 2 && pathAnalysis && (
                  <div className="text-xs space-y-2">
                    <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700 space-y-1.5">
                      <div className="flex items-center justify-between font-mono font-extrabold text-amber-300 text-sm">
                        <span>Distance:</span>
                        <span>
                          {pathAnalysis.totalDistanceKm.toFixed(2)} km{' '}
                          <span className="text-slate-400 text-xs font-normal">
                            ({(pathAnalysis.totalDistanceKm * 0.621371).toFixed(2)} mi)
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Path Span:</span>
                        <span className="font-bold text-slate-200">
                          {pathAnalysis.startDistrict?.name} ➔ {pathAnalysis.endDistrict?.name}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] border-t border-slate-700/60 pt-1.5">
                        <span className="text-slate-400">Max Hazard Severity:</span>
                        <span
                          className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                            pathAnalysis.riskRating === 'High'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : pathAnalysis.riskRating === 'Moderate'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          }`}
                        >
                          {(pathAnalysis.maxSeverity * 100).toFixed(0)}% • {pathAnalysis.riskRating} Risk
                        </span>
                      </div>
                    </div>

                    {pathAnalysis.hazardsDetected.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                          Intersects Hazard Zones:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {pathAnalysis.hazardsDetected.map((h, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-md"
                            >
                              <MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /> {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 font-mono">
                      Transiting {pathAnalysis.districtsAlongPath.length} district(s):{' '}
                      <span className="text-slate-300 font-sans font-medium">
                        {pathAnalysis.districtsAlongPath.map((d) => d.district.name).join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-slate-700/80">
                  <button
                    onClick={() => setMeasurePoints([])}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors border border-slate-700"
                  >
                    Reset Points
                  </button>
                  <button
                    onClick={() => {
                      setIsMeasuring(false);
                      setMeasurePoints([]);
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md"
                  >
                    Exit Ruler
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Export Success Notification Toast */}
          <AnimatePresence>
          {exportSuccessMsg && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute top-20 left-1/2 z-[1100] pointer-events-auto bg-slate-900/95 text-emerald-300 border border-emerald-500/80 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold backdrop-blur-md"
            >
              <span className="text-emerald-400 text-sm"><MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" /></span>
              <span>{exportSuccessMsg}</span>
              <button
                onClick={() => setExportSuccessMsg(null)}
                className="w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-xs ml-2"
                title="Dismiss"
              >
                ✕
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Geolocation Notification Toast */}
          <AnimatePresence>
          {userLocationError && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute top-20 left-1/2 z-[1100] pointer-events-auto bg-slate-900/95 text-amber-300 border border-amber-500/80 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold backdrop-blur-md"
            >
              <span className="text-amber-400 text-sm"><MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" /></span>
              <span>{userLocationError}</span>
              <button
                onClick={() => setUserLocationError(null)}
                className="w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-xs ml-2"
                title="Dismiss"
              >
                ✕
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Sync Toast Notification */}
          <AnimatePresence>
          {syncToastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute top-20 left-1/2 z-[1200] pointer-events-auto bg-slate-900/95 text-sky-300 border border-sky-500/80 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold backdrop-blur-md"
            >
              <span className="text-sky-400 text-sm"><MaterialIcon name="refresh" className="w-4 h-4 inline-block align-middle" /></span>
              <span>{syncToastMessage}</span>
              <button
                onClick={() => setSyncToastMessage(null)}
                className="w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-xs ml-2"
              >
                ✕
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Report Hazard Success Toast */}
          <AnimatePresence>
          {reportSuccessMsg && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute top-20 left-1/2 z-[1200] pointer-events-auto bg-slate-900/95 text-emerald-300 border border-emerald-500/80 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold backdrop-blur-md"
            >
              <span className="text-emerald-400 text-sm"><MaterialIcon name="check_circle" className="w-4 h-4 inline-block align-middle" /></span>
              <span>{reportSuccessMsg}</span>
              <button
                onClick={() => setReportSuccessMsg(null)}
                className="w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-xs ml-2"
              >
                ✕
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Report Field Hazard Modal */}
          <AnimatePresence>
          {isReportModalOpen && (
            <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-slate-900 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                      <MaterialIcon name="warning" className="w-4 h-4 inline-block align-middle" />
                    </div>
                    <div>
                      <h3 className="text-base font-black tracking-tight">Report Field Hazard Incident</h3>
                      <p className="text-xs text-slate-500">Log real-time ground observation for telemetry analysis</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Target District</label>
                    <select
                      value={reportDistrictId}
                      onChange={(e) => setReportDistrictId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-[#f9a825]"
                    >
                      {liveDistrictsData.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.division} Division)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Hazard Category</label>
                    <select
                      value={reportHazardType}
                      onChange={(e) => setReportHazardType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-[#f9a825]"
                    >
                      {HAZARD_LAYERS.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>Severity Level</span>
                      <span className="text-rose-600 font-mono">{(reportSeverity * 100).toFixed(0)}%</span>
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
                    <label className="block font-bold text-slate-700 mb-1">Field Observation Notes</label>
                    <textarea
                      rows={3}
                      placeholder="Describe water level, crop damage, wind speed, or local impacts..."
                      value={reportNotes}
                      onChange={(e) => setReportNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-[#f9a825]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const targetDist = liveDistrictsData.find(d => d.id === reportDistrictId);
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
                    className="flex-1 py-2.5 bg-[#f9a825] hover:bg-[#d08305] text-white font-black rounded-xl text-xs shadow-md transition-all"
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
            <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 text-slate-900 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                      <MaterialIcon name="search" className="w-4 h-4 inline-block align-middle" />
                    </div>
                    <div>
                      <h3 className="text-base font-black tracking-tight">Advanced District & Hazard Filter</h3>
                      <p className="text-xs text-slate-500">Filter telemetry data across divisions and hazard parameters</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsFilterModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">Division Selector</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setSelectedDivision('All')}
                        className={`py-2 px-3 rounded-xl font-bold text-xs transition-all border ${
                          selectedDivision === 'All'
                            ? 'bg-[#f9a825] text-white border-[#f9a825]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
                            className={`py-2 px-3 rounded-xl font-bold text-xs transition-all border truncate ${
                              selectedDivision.toLowerCase() === divName.toLowerCase()
                                ? 'bg-[#f9a825] text-white border-[#f9a825]'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
                      <label className="font-bold text-slate-700">Hazard Types ({selectedHazards.length}/{HAZARD_LAYERS.length})</label>
                      <div className="flex gap-2">
                        <button onClick={selectAllHazards} className="text-[10px] text-sky-600 font-bold hover:underline">Select All</button>
                        <span className="text-slate-300">|</span>
                        <button onClick={clearAllHazards} className="text-[10px] text-rose-600 font-bold hover:underline">Clear All</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {HAZARD_LAYERS.map((h) => {
                        const isAct = selectedHazards.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            onClick={() => toggleHazard(h.id)}
                            className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between border transition-all ${
                              isAct
                                ? 'bg-amber-50 text-amber-900 border-amber-300 font-black'
                                : 'bg-slate-50 text-slate-500 border-slate-200 opacity-60'
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

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setSelectedDivision('All');
                      selectAllHazards();
                      setSearchQuery('');
                    }}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                  >
                    Reset Filters
                  </button>
                  <button
                    onClick={() => setIsFilterModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs shadow-md transition-all"
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
            <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-slate-900 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                      🗺️
                    </div>
                    <div>
                      <h3 className="text-base font-black tracking-tight">GIS & Map Layers Control</h3>
                      <p className="text-xs text-slate-500">Configure satellite rasters, overlays & visual layers</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsLayerModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">Base Raster Tile Provider</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).map((key) => {
                        const isAct = activeLayer === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setActiveLayer(key)}
                            className={`py-2.5 px-3 rounded-xl font-bold text-xs border text-left transition-all ${
                              isAct
                                ? 'bg-[#f9a825] text-white border-[#f9a825] shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {MAP_LAYERS[key].name.split('(')[0].trim()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="block font-bold text-slate-700">Analytical Map Overlays</label>
                    
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-800"><MaterialIcon name="water" className="w-4 h-4 inline-block align-middle" /> River Basins Flow Polyline</span>
                      <button
                        onClick={() => setIsRiverLayerActive(!isRiverLayerActive)}
                        className={`px-3 py-1 rounded-lg font-black text-xs transition-all ${
                          isRiverLayerActive ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isRiverLayerActive ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-800"><MaterialIcon name="local_fire_department" className="w-4 h-4 inline-block align-middle" /> Hazard Heatmap Density</span>
                      <button
                        onClick={() => setIsHeatmapActive(!isHeatmapActive)}
                        className={`px-3 py-1 rounded-lg font-black text-xs transition-all ${
                          isHeatmapActive ? 'bg-[#f9a825] text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isHeatmapActive ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-800">Doppler Weather Radar Simulation</span>
                      <button
                        onClick={() => setIsRadarActive(!isRadarActive)}
                        className={`px-3 py-1 rounded-lg font-black text-xs transition-all ${
                          isRadarActive ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isRadarActive ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-800"><MaterialIcon name="bolt" className="w-4 h-4 inline-block align-middle" /> High Contrast Raster Boost</span>
                      <button
                        onClick={() => setIsHighContrastBoost(!isHighContrastBoost)}
                        className={`px-3 py-1 rounded-lg font-black text-xs transition-all ${
                          isHighContrastBoost ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isHighContrastBoost ? 'Active' : 'Normal'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setIsLayerModalOpen(false)}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs shadow-md"
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
            <div className="fixed inset-0 z-[2200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 pointer-events-auto overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                className="bg-white rounded-3xl p-5 sm:p-7 max-w-4xl w-full shadow-2xl border border-slate-200 text-slate-900 flex flex-col gap-5 my-auto"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#f9a825]/15 text-[#f9a825] border border-[#f9a825]/30 flex items-center justify-center font-black text-xl shrink-0">
                      <MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#f9a825] text-slate-950 font-black text-[10px] tracking-wide uppercase">
                          Geospatial Export
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400">
                          {exportScale === 3 ? 'Ultra-HD 4K (300 DPI)' : exportScale === 2 ? 'HD 2K (200 DPI)' : 'Standard HD'}
                        </span>
                      </div>
                      <h3 className="text-xl font-black tracking-tight text-slate-900 mt-0.5">
                        Capture High-Resolution Hazard Map Report
                      </h3>
                      <p className="text-xs text-slate-500">
                        Export visible map view with active vector overlays, legend keys, and verified metadata watermarks
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsExportModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center text-base transition-colors shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Body: Grid with Preview & Settings */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Image Preview Canvas Viewport (7 Cols) */}
                  <div className="lg:col-span-7 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-[#f9a825]" /> Captured Map Image Preview
                      </span>
                      {capturedPreviewUrl && (
                        <span className="text-[11px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          ✓ High-Res Image Ready
                        </span>
                      )}
                    </div>

                    <div className="relative aspect-[16/10] bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-800 shadow-inner flex items-center justify-center group">
                      {isGeneratingSnapshot ? (
                        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
                          <div className="w-10 h-10 border-4 border-[#f9a825] border-t-transparent rounded-full animate-spin"></div>
                          <div>
                            <p className="font-black text-sm text-white">Rendering High-Resolution Canvas...</p>
                            <p className="text-xs text-slate-400 mt-1">Applying raster layers, vector polygons & watermark headers</p>
                          </div>
                        </div>
                      ) : capturedPreviewUrl ? (
                        <>
                          <img
                            src={capturedPreviewUrl}
                            alt="Captured Hazard Map Report"
                            className="w-full h-full object-contain bg-slate-900"
                          />
                          <a
                            href={capturedPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl text-xs font-bold backdrop-blur-md border border-slate-700 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MaterialIcon name="search" className="w-4 h-4 inline-block align-middle" /><span>View Full Resolution</span>
                          </a>
                        </>
                      ) : (
                        <div className="text-center text-slate-400 p-6">
                          <p className="font-bold text-sm">No Preview Captured</p>
                          <button
                            onClick={() => generateMapSnapshot()}
                            className="mt-2 px-3 py-1.5 bg-[#f9a825] text-slate-950 font-bold text-xs rounded-xl"
                          >
                            Generate Map Image
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs flex items-center justify-between text-slate-600">
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
                        <label className="block font-bold text-slate-700 mb-1">Custom Report Header Title</label>
                        <input
                          type="text"
                          value={customReportTitle}
                          onChange={(e) => setCustomReportTitle(e.target.value)}
                          placeholder="e.g. Flood Situation Report - Sylhet Division"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:border-[#f9a825] transition-colors"
                        />
                      </div>

                      {/* Resolution Selector */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1.5">Output Image Quality & Scale</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => {
                              setExportScale(3);
                              generateMapSnapshot(3);
                            }}
                            className={`py-2 px-2.5 rounded-xl font-black text-xs border transition-all text-center ${
                              exportScale === 3
                                ? 'bg-[#f9a825] text-white border-[#f9a825] shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Ultra 4K (3x)
                          </button>
                          <button
                            onClick={() => {
                              setExportScale(2);
                              generateMapSnapshot(2);
                            }}
                            className={`py-2 px-2.5 rounded-xl font-black text-xs border transition-all text-center ${
                              exportScale === 2
                                ? 'bg-[#f9a825] text-white border-[#f9a825] shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <MaterialIcon name="photo_camera" className="w-4 h-4 inline-block align-middle" /> 2K HD (2x)
                          </button>
                          <button
                            onClick={() => {
                              setExportScale(1.5);
                              generateMapSnapshot(1.5);
                            }}
                            className={`py-2 px-2.5 rounded-xl font-black text-xs border transition-all text-center ${
                              exportScale === 1.5
                                ? 'bg-[#f9a825] text-white border-[#f9a825] shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <MaterialIcon name="smartphone" className="w-4 h-4 inline-block align-middle" /> HD (1.5x)
                          </button>
                        </div>
                      </div>

                      {/* Format Selector */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1.5">Image Format</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setExportFormat('png')}
                            className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                              exportFormat === 'png'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            PNG (Lossless Quality)
                          </button>
                          <button
                            onClick={() => setExportFormat('jpeg')}
                            className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                              exportFormat === 'jpeg'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            JPEG (Compact Size)
                          </button>
                        </div>
                      </div>

                      {/* Watermark & Legend Toggles */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="block font-bold text-slate-700">Watermark & Legend Overlays</label>
                        <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                          <span className="font-semibold text-slate-800"><MaterialIcon name="shield" className="w-4 h-4 inline-block align-middle" /> Official HazardNet Banner</span>
                          <input
                            type="checkbox"
                            checked={includeWatermarkHeader}
                            onChange={(e) => {
                              setIncludeWatermarkHeader(e.target.checked);
                            }}
                            className="w-4 h-4 accent-[#f9a825] rounded cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                          <span className="font-semibold text-slate-800">Hazard Severity Index Key</span>
                          <input
                            type="checkbox"
                            checked={includeOverlayLegend}
                            onChange={(e) => {
                              setIncludeOverlayLegend(e.target.checked);
                            }}
                            className="w-4 h-4 accent-[#f9a825] rounded cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Action Toolbar */}
                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <button
                        onClick={handleDownloadImage}
                        disabled={isGeneratingSnapshot || !capturedPreviewUrl}
                        className="w-full py-3 bg-[#f9a825] hover:bg-[#d08305] disabled:opacity-50 text-white font-black rounded-2xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Download className="w-4 h-4" /> Download High-Resolution Map Report
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleCopyImageToClipboard}
                          disabled={isGeneratingSnapshot || !capturedBlob}
                          className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-600" /> Copy Image
                        </button>
                        <button
                          onClick={handleShareReport}
                          disabled={isGeneratingSnapshot || !capturedBlob}
                          className="py-2.5 px-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Share2 className="w-3.5 h-3.5" /> Share Report
                        </button>
                      </div>

                      <button
                        onClick={() => generateMapSnapshot()}
                        disabled={isGeneratingSnapshot}
                        className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl text-[11px] border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
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

                    <MapLegendUI
            isLegendOpen={isLegendOpen}
            setIsLegendOpen={setIsLegendOpen}
            isRadarActive={isRadarActive}
            setIsRadarActive={setIsRadarActive}
            liveDistrictsData={liveDistrictsData as any}
            handleSelectDistrict={handleSelectDistrict as any}
            selectedHazards={selectedHazards}
            toggleHazard={toggleHazard}
          />

          {/* Bottom-Center Floating Clear Search & Inspect Pill */}
          <AnimatePresence>
          {(searchQuery || inspectedPoint || measurePoints.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 20, x: "-50%" }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-20 sm:bottom-12 left-1/2 z-[1000] pointer-events-auto flex items-center gap-2 max-w-[90vw]"
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
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-full shadow-xl flex items-center gap-2 transition-all hover:scale-105"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-[10px]"><MaterialIcon name="close" className="w-4 h-4" /></span>
                  <span>Clear Active Overlays & Filter</span>
                </span>
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Bottom-Right Hazard Actions Menu */}
          <div className="absolute bottom-20 sm:bottom-12 right-3 sm:right-6 z-[1000] pointer-events-auto flex flex-col items-end gap-2">
            <AnimatedSocialIcons icons={hazardActions} iconSize={18} />
          </div>

          {/* Coordinates Readout */}
          <div className="absolute bottom-4 right-24 z-[1000] bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200 text-[11px] font-mono font-bold text-slate-700 shadow-lg pointer-events-auto hidden sm:flex items-center gap-3">
            <span>Lat: {currentCoords.lat.toFixed(4)}° N</span>
            <span>Lng: {currentCoords.lng.toFixed(4)}° E</span>
            <span className="text-slate-300">|</span>
            <span>Zoom: {currentCoords.zoom}</span>
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
          className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2">
            
            <span className="font-extrabold text-slate-700 text-[11px] uppercase tracking-wider font-mono">
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
                    const target = liveDistrictsData.find((d) => d.id === preset.id);
                    if (target) handleSelectDistrict(target);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                    isAct
                      ? 'bg-[#f9a825] border-[#f9a825] text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
