import { useEffect, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { ALL_64_DISTRICTS, DistrictData } from '../data/bangladeshDistricts';

export type DistrictGeo = DistrictData;

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

export interface UseMapMeasurementsProps {
  measureGroupRef: React.RefObject<L.LayerGroup | null>;
  measurePoints: [number, number][];
  setMeasurePoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
}

export function useMapMeasurements({
  measureGroupRef,
  measurePoints,
  setMeasurePoints,
}: UseMapMeasurementsProps) {
  // Path analysis result
  const pathAnalysis = useMemo(() => {
    return analyzePathBetweenPoints(measurePoints);
  }, [measurePoints]);

  // Total measured distance calculation
  const totalMeasuredKm = useMemo(() => {
    return measurePoints.reduce((acc, curr, idx) => {
      if (idx === 0) return 0;
      const prev = measurePoints[idx - 1];
      return acc + calculateDistanceKm(prev[0], prev[1], curr[0], curr[1]);
    }, 0);
  }, [measurePoints]);

  // Render measurement markers and polyline overlay
  useEffect(() => {
    if (!measureGroupRef.current) return;
    measureGroupRef.current.clearLayers();

    if (measurePoints.length > 0) {
      measurePoints.forEach((pt, index) => {
        const isStart = index === 0;
        const isEnd = index === measurePoints.length - 1 && measurePoints.length > 1;

        const pointIcon = L.divIcon({
          html: `
            <div style="
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: ${isStart ? '#16a34a' : isEnd ? '#dc2626' : '#f64137'};
              border: 3px solid #ffffff;
              box-shadow: 0 4px 14px rgba(0,0,0,0.35);
              color: #ffffff;
              font-family: var(--hds-font-family-heading);
              font-size: 11px;
              font-weight: 900;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              P${index + 1}
            </div>
          `,
          className: 'measure-point-icon',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(pt, { icon: pointIcon, zIndexOffset: 4000 });
        measureGroupRef.current?.addLayer(marker);
      });

      // Connecting Polyline & Midpoint Analysis Leaflet Popup
      if (measurePoints.length >= 2) {
        const line = L.polyline(measurePoints, {
          color: '#f64137',
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
                border: 3px solid #f64137;
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

          const escapeHtml = (str: string) =>
            String(str || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');

          const popupContent = `
            <div style="padding: 10px; font-family: var(--hds-font-family-heading); color: #17171b; min-width: 250px; max-width: 290px;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #d1d1d1; padding-bottom: 6px; margin-bottom: 8px;">
                <strong style="font-size: 12px; color: #17171b; font-weight: 900; display: flex; align-items: center; gap: 4px;">
                  📏 Path Measurement
                </strong>
                <span style="font-size: 11px; font-weight: 900; background: #f64137; color: #ffffff; padding: 2px 8px; border-radius: 9999px;">
                  ${analysis.totalDistanceKm.toFixed(1)} km
                </span>
              </div>
              
              <div style="font-size: 11px; line-height: 1.6; color: #444447;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-weight: 800; color: #17171b; background: #f6f6f6; padding: 6px 8px; border-radius: 8px; border: 1px solid #d1d1d1;">
                  <span style="color: #0284c7;">📍 ${escapeHtml(analysis.startDistrict?.name || 'P1')}</span>
                  <span style="color: #77777a;">➔</span>
                  <span style="color: #d97706;">🎯 ${escapeHtml(analysis.endDistrict?.name || 'P2')}</span>
                </div>
                
                <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 10px; font-weight: 700; color: #77777a; text-transform: uppercase;">Path Severity Risk:</span>
                  <span style="font-size: 10px; font-weight: 900; color: ${riskBadgeColor}; background: ${riskBadgeColor}15; padding: 2px 6px; border-radius: 4px; border: 1px solid ${riskBadgeColor}30;">
                    ${(analysis.maxSeverity * 100).toFixed(0)}% • ${analysis.riskRating}
                  </span>
                </div>

                <div style="margin-top: 6px;">
                  <span style="font-size: 10px; font-weight: 700; color: #77777a; text-transform: uppercase;">Hazards Encountered:</span>
                  <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                    ${
                      analysis.hazardsDetected.length > 0
                        ? analysis.hazardsDetected.map(h => `<span style="font-size: 9px; font-weight: 800; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px;">⚠️ ${escapeHtml(h)}</span>`).join('')
                        : '<span style="font-size: 10px; color: #16a34a; font-weight: 700;">✓ Low Hazard Risk</span>'
                    }
                  </div>
                </div>

                <div style="margin-top: 8px; font-size: 10px; color: #77777a; border-top: 1px dashed #b9b9bb; padding-top: 6px;">
                  Districts transited (${analysis.districtsAlongPath.length}): ${escapeHtml(analysis.districtsAlongPath.map(d => d.district.name).join(', '))}
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
  }, [measurePoints, measureGroupRef]);

  const addPoint = useCallback((lat: number, lng: number) => {
    setMeasurePoints((prev) => [...prev, [lat, lng]]);
  }, [setMeasurePoints]);

  const clearMeasurements = useCallback(() => {
    setMeasurePoints([]);
    if (measureGroupRef.current) {
      measureGroupRef.current.clearLayers();
    }
  }, [setMeasurePoints, measureGroupRef]);

  const removeLastPoint = useCallback(() => {
    setMeasurePoints((prev) => prev.slice(0, -1));
  }, [setMeasurePoints]);

  return {
    pathAnalysis,
    totalMeasuredKm,
    addPoint,
    clearMeasurements,
    removeLastPoint,
  };
}
