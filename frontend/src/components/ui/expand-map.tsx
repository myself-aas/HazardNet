"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  Layers,
  MapPin,
  Satellite,
  Compass,
} from "lucide-react";
import L from "leaflet";

export interface LocationMapProps {
  location?: string;
  coordinates?: string;
  lat?: number;
  lng?: number;
  hazardType?: string;
  severity?: number;
  risk?: "Low" | "Moderate" | "High" | string;
  division?: string;
  elevation?: number;
  className?: string;
  defaultZoom?: number;
}

type MiniMapLayer = "satellite" | "streets" | "dark" | "topo";

const MINI_MAP_LAYERS: Record<
  MiniMapLayer,
  { name: string; url: string; subdomains?: string; maxZoom: number; label: string }
> = {
  satellite: {
    name: "HD Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    label: "Sat",
  },
  streets: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: "abc",
    maxZoom: 19,
    label: "Street",
  },
  dark: {
    name: "Dark GIS",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 19,
    label: "Dark",
  },
  topo: {
    name: "Topographic",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: "abc",
    maxZoom: 17,
    label: "Topo",
  },
};

// Helper to extract [lat, lng] from props or coordinate string
function parseLatLng(lat?: number, lng?: number, coordinates?: string): [number, number] {
  if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
    return [lat, lng];
  }
  if (coordinates) {
    const match = coordinates.match(/([0-9.]+)[°\s]*([NS])?[,\s]+([0-9.]+)[°\s]*([EW])?/i);
    if (match) {
      let parsedLat = parseFloat(match[1]);
      if (match[2]?.toUpperCase() === "S") parsedLat = -parsedLat;
      let parsedLng = parseFloat(match[3]);
      if (match[4]?.toUpperCase() === "W") parsedLng = -parsedLng;
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        return [parsedLat, parsedLng];
      }
    }
  }
  return [24.7471, 90.4203]; // Default fallback: Mymensingh/Central Bangladesh
}

export function LocationMap({
  location = "Mymensingh, Bangladesh",
  coordinates = "24.7471° N, 90.4203° E",
  lat,
  lng,
  hazardType = "Monsoon Flood",
  severity = 0.63,
  risk = "Moderate",
  division = "Mymensingh",
  elevation,
  className = "",
  defaultZoom = 11,
}: LocationMapProps) {
  const [targetLat, targetLng] = parseLatLng(lat, lng, coordinates);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeLayerKey, setActiveLayerKey] = useState<MiniMapLayer>("satellite");
  const [currentZoom, setCurrentZoom] = useState<number>(defaultZoom);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Color mapping based on hazard severity and risk level
  const isHighRisk = severity >= 0.7 || risk.toLowerCase().includes("high");
  const isModerateRisk = (severity >= 0.4 && severity < 0.7) || risk.toLowerCase().includes("moderate");
  const riskColor = isHighRisk ? "#e11d48" : isModerateRisk ? "#f59e0b" : "#10b981";
  const riskBg = isHighRisk ? "rgba(225, 29, 72, 0.2)" : isModerateRisk ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)";

  // Format coordinates string if not present
  const displayCoordinates = coordinates || `${targetLat.toFixed(4)}° N, ${targetLng.toFixed(4)}° E`;

  // Initialize and manage the mini Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [targetLat, targetLng],
        zoom: currentZoom,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: isExpanded,
        doubleClickZoom: true,
      });

      // Add default tile layer
      const layerConfig = MINI_MAP_LAYERS[activeLayerKey];
      const tileLayer = L.tileLayer(layerConfig.url, {
        maxZoom: layerConfig.maxZoom,
        subdomains: layerConfig.subdomains || "abc",
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      // Create Custom High-Contrast Pulsing Radar Pin
      const icon = L.divIcon({
        html: `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: -8px; border-radius: 50%; background: ${riskColor}; opacity: 0.4;" class="radar-ping-ring"></div>
            <div style="position: absolute; inset: -2px; border-radius: 50%; background: ${riskColor}; opacity: 0.75;" class="radar-ping-ring"></div>
            <div style="position: relative; width: 22px; height: 22px; border-radius: 50%; background: #ffffff; border: 3px solid ${riskColor}; box-shadow: 0 2px 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: ${riskColor}; font-size: 11px; font-weight: 900;">
              ●
            </div>
          </div>
        `,
        className: "mini-map-pin-icon",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([targetLat, targetLng], { icon }).addTo(map);
      markerRef.current = marker;

      // Add hazard impact radius circle (e.g. 6km to 12km based on severity)
      const radiusMeters = 5000 + Math.round(severity * 7000);
      const circle = L.circle([targetLat, targetLng], {
        radius: radiusMeters,
        color: riskColor,
        weight: 1.5,
        dashArray: "4, 6",
        fillColor: riskColor,
        fillOpacity: 0.14,
      }).addTo(map);
      circleRef.current = circle;

      map.on("zoomend", () => {
        setCurrentZoom(map.getZoom());
      });

      mapInstanceRef.current = map;
    } else {
      // Smooth update when lat/lng changes
      const map = mapInstanceRef.current;
      map.setView([targetLat, targetLng], currentZoom, { animate: true });

      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLng]);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([targetLat, targetLng]);
        circleRef.current.setRadius(5000 + Math.round(severity * 7000));
        circleRef.current.setStyle({ color: riskColor, fillColor: riskColor });
      }
    }

    return () => {
      // Map cleanup on unmount handled in dedicated unmount hook
    };
  }, [targetLat, targetLng, severity, riskColor]);

  // Clean up map instance on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Invalidate map size on container resize
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Handle Layer change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const layerConfig = MINI_MAP_LAYERS[activeLayerKey];
    const newTileLayer = L.tileLayer(layerConfig.url, {
      maxZoom: layerConfig.maxZoom,
      subdomains: layerConfig.subdomains || "abc",
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [activeLayerKey]);

  // Trigger Leaflet map invalidateSize when expanding/collapsing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  // Handle Map Zoom In
  const handleZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.zoomIn();
      }
    },
    []
  );

  // Handle Map Zoom Out
  const handleZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.zoomOut();
      }
    },
    []
  );

  // Handle Recenter
  const handleRecenter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([targetLat, targetLng], defaultZoom, { duration: 0.6 });
      }
    },
    [targetLat, targetLng, defaultZoom]
  );

  // Copy coordinates
  const handleCopyCoordinates = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(`${targetLat.toFixed(5)}, ${targetLng.toFixed(5)}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    },
    [targetLat, targetLng]
  );

  // Open in Google Maps
  const handleOpenExternal = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = `https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [targetLat, targetLng]
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-900 text-white select-none ${className}`}
    >
      {/* Map View Container with Dynamic Height */}
      <motion.div
        className="relative w-full overflow-hidden"
        animate={{ height: isExpanded ? 260 : 160 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        {/* Leaflet Map DOM mount element */}
        <div
          ref={mapContainerRef}
          role="region"
          aria-label={`Mini GIS Map for ${location}`}
          className="w-full h-full z-0 bg-slate-950 cursor-grab active:cursor-grabbing"
        />

        {/* Top HUD Controls Overlay */}
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between pointer-events-none">
          {/* Layer Selector & Indicator */}
          <div className="flex items-center gap-1 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-full border border-slate-700/80 shadow-xs pointer-events-auto">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: riskColor }}
            />
            <span className="text-[10px] font-mono font-bold tracking-tight text-slate-200">
              {MINI_MAP_LAYERS[activeLayerKey].label}
            </span>

            {/* Quick Layer Switch Toggle */}
            <div className="flex items-center gap-0.5 ml-1 border-l border-slate-700 pl-1">
              {(["satellite", "streets", "dark"] as MiniMapLayer[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveLayerKey(key);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                    activeLayerKey === key
                      ? "bg-amber-400 text-slate-950 shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                  aria-label={`Switch to ${MINI_MAP_LAYERS[key].name}`}
                  title={MINI_MAP_LAYERS[key].name}
                >
                  {MINI_MAP_LAYERS[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Action Icons: Zoom, Recenter, Expand */}
          <div className="flex items-center gap-1 pointer-events-auto">
            {/* Recenter button */}
            <button
              type="button"
              onClick={handleRecenter}
              className="w-7 h-7 rounded-full bg-slate-950/80 hover:bg-slate-800 text-slate-200 hover:text-white backdrop-blur-md border border-slate-700/80 flex items-center justify-center text-xs shadow-xs transition-colors cursor-pointer"
              title="Recenter Map on Target Coordinates"
              aria-label="Recenter Map"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-300" />
            </button>

            {/* Zoom In */}
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-7 h-7 rounded-full bg-slate-950/80 hover:bg-slate-800 text-slate-200 hover:text-white backdrop-blur-md border border-slate-700/80 flex items-center justify-center text-xs shadow-xs transition-colors cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {/* Zoom Out */}
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-7 h-7 rounded-full bg-slate-950/80 hover:bg-slate-800 text-slate-200 hover:text-white backdrop-blur-md border border-slate-700/80 flex items-center justify-center text-xs shadow-xs transition-colors cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            {/* Expand / Minimize Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="w-7 h-7 rounded-full bg-slate-950/80 hover:bg-slate-800 text-amber-400 hover:text-amber-300 backdrop-blur-md border border-slate-700/80 flex items-center justify-center text-xs shadow-xs transition-colors cursor-pointer"
              title={isExpanded ? "Collapse Mini Map" : "Expand Mini Map View"}
              aria-label={isExpanded ? "Collapse Mini Map" : "Expand Mini Map View"}
            >
              {isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Center Target Crosshair Grid Accent (Subtle overlay) */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
          <div className="w-8 h-8 rounded-full border border-dashed border-white/50" />
        </div>
      </motion.div>

      {/* Bottom Info & Telemetry Bar */}
      <div className="bg-slate-950/95 border-t border-slate-800 p-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-slate-100 truncate">{location}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
            <span>{displayCoordinates}</span>
            {typeof elevation === "number" && (
              <span className="text-slate-500">• {elevation}m MSL</span>
            )}
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopyCoordinates}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-[10px] font-bold flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
            title="Copy Coordinates to Clipboard"
            aria-label="Copy Coordinates"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenExternal}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            title="Open in Google Maps"
            aria-label="Open in Google Maps"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default LocationMap;
