import { APPLE_SEVERITY } from '@hazardnet/design-system';
import { ALL_64_DISTRICTS, DistrictData } from '../data/bangladeshDistricts';

export interface LocationDetectionResult {
  lat: number;
  lng: number;
  snappedLat?: number;
  snappedLng?: number;
  isSnappedToBoundary?: boolean;
  method: 'gps' | 'ip' | 'fallback';
  accuracyMeters?: number;
  city?: string;
  country?: string;
  isp?: string;
  nearestDistrict: DistrictData;
  distanceKm: number;
  rawIp?: string;
}

export function isValidCoordinate(val: any): val is number {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
}

export function isValidLatLng(lat: any, lng: any): boolean {
  return (
    isValidCoordinate(lat) &&
    isValidCoordinate(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Severity → the one Apple severity scale.
 *
 * This used to interpolate a continuous green→yellow→red gradient. Two things
 * were wrong with that. First, the endpoints it interpolated between were the
 * stock Tailwind green-600, yellow-500 and red-600, while the comments beside
 * them claimed the Apple severity values — so the maps quietly ran a second
 * colour system that no legend described. Second, a continuous ramp is not
 * decodable: a reader cannot tell 0.62 from 0.71 by eye, and no key could
 * help them.
 *
 * The product already defines five severity tiers, each with a label, so the
 * index is quantised onto those tiers instead. The map now matches its legend,
 * and the value is one of five things a reader can actually name.
 *
 * Thresholds follow the alert ladder: a tier starts where its band starts.
 */
export type SeverityTier = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

/**
 * The one severity table. The map markers, the map legend and anything else
 * that paints severity all read THIS — previously the marker thresholds
 * (0.5 / 0.8) and the legend text ("<0.50", ">0.75") were written out
 * separately and had drifted apart, so the key did not describe the map.
 *
 * `cssVar` flips with the theme. `hex` and `label` are read from
 * APPLE_SEVERITY rather than transcribed here, so this table cannot drift from
 * the design system the way the old gradient endpoints did.
 */
export const SEVERITY_TIERS = [
  { tier: 'low', min: 0, cssVar: '--ap-sev-low' },
  { tier: 'moderate', min: 0.2, cssVar: '--ap-sev-moderate' },
  { tier: 'high', min: 0.4, cssVar: '--ap-sev-high' },
  { tier: 'veryHigh', min: 0.6, cssVar: '--ap-sev-very-high' },
  { tier: 'extreme', min: 0.8, cssVar: '--ap-sev-extreme' },
].map((t) => ({
  ...t,
  hex: APPLE_SEVERITY[t.tier as SeverityTier].text,
  label: APPLE_SEVERITY[t.tier as SeverityTier].label,
})) as readonly { tier: SeverityTier; min: number; cssVar: string; hex: string; label: string }[];

/** Inclusive lower bound of each tier, rendered the way the legend states it. */
export function severityTierRange(index: number): string {
  const lo = SEVERITY_TIERS[index].min;
  const hi = index === SEVERITY_TIERS.length - 1 ? 1 : SEVERITY_TIERS[index + 1].min;
  return `${lo.toFixed(2)}\u2013${hi.toFixed(2)}`;
}

/** Normalise a 0–1 index (or a 0–100 percentage) onto a named tier. */
export function getSeverityTier(severity: number): SeverityTier {
  const normalized = severity > 1 ? severity / 100 : severity;
  const s = Math.max(0, Math.min(1, normalized));
  // Walk down so the highest matching lower bound wins.
  for (let i = SEVERITY_TIERS.length - 1; i > 0; i -= 1) {
    if (s >= SEVERITY_TIERS[i].min) return SEVERITY_TIERS[i].tier;
  }
  return 'low';
}

/**
 * Theme-aware severity paint, for anything rendered into the DOM — SVG `fill`
 * and `stroke`, CSS custom properties, Leaflet's SVG renderer. Prefer this.
 */
export function getSeverityVar(severity: number): string {
  const tier = getSeverityTier(severity);
  return `var(${SEVERITY_TIERS.find((t) => t.tier === tier)!.cssVar})`;
}

/**
 * Literal severity hex, for the few consumers that cannot resolve a CSS
 * variable — canvas, a `<meta name="theme-color">`, an exported image. This
 * returns the LIGHT value and therefore does not follow the theme; reach for
 * `getSeverityVar` unless you know the consumer cannot take one.
 */
export function getSeverityColor(severity: number): string {
  const tier = getSeverityTier(severity);
  return SEVERITY_TIERS.find((t) => t.tier === tier)!.hex;
}

// Helper to generate organic realistic district boundary polygons (20 vertices)
export const getDistrictBoundaryCoordinates = (
  dist: DistrictData,
  includeLat?: number,
  includeLng?: number
): [number, number][] => {
  if (!dist || !isValidLatLng(dist.lat, dist.lng)) {
    return [];
  }
  let seed = 0;
  const distId = dist.id || dist.name || 'district';
  for (let i = 0; i < distId.length; i++) {
    seed = (seed << 5) - seed + distId.charCodeAt(i);
    seed |= 0;
  }
  const absSeed = Math.abs(seed);

  // Realistic district radius scale (~18 to 24 km radius)
  const baseRadius = 0.16 + (absSeed % 60) / 1000;

  // Check if an external user location point needs to be dynamically enclosed inside the polygon
  let targetAngle = 0;
  let maxRequiredDist = 0;
  let shouldEnclose = false;

  if (isValidCoordinate(includeLat) && isValidCoordinate(includeLng) && isValidLatLng(includeLat, includeLng)) {
    const dLatTarget = includeLat - dist.lat;
    const dLngTarget = includeLng - dist.lng;
    const targetDist = Math.sqrt(dLatTarget * dLatTarget + dLngTarget * dLngTarget);
    if (targetDist > 0) {
      targetAngle = Math.atan2(dLatTarget, dLngTarget);
      // Ensure boundary extends at least 0.04 degrees (~4.5 km) beyond the target point
      maxRequiredDist = targetDist + 0.04;
      shouldEnclose = maxRequiredDist > baseRadius;
    }
  }

  const numPoints = 20;
  const coords: [number, number][] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;

    // Multi-frequency noise for natural irregular boundary shape
    const h1 = Math.sin(angle * 3 + absSeed) * 0.035;
    const h2 = Math.cos(angle * 5 + absSeed * 0.7) * 0.025;
    const h3 = Math.sin(angle * 2 - absSeed * 0.3) * 0.015;

    let r = baseRadius + h1 + h2 + h3;

    // Smoothly expand polygon toward target point if location is outside default boundary
    if (shouldEnclose) {
      let diff = Math.abs(angle - targetAngle);
      while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
      if (diff < Math.PI / 1.8) {
        const factor = Math.cos((diff / (Math.PI / 1.8)) * (Math.PI / 2));
        const neededExtra = Math.max(0, maxRequiredDist - r);
        r += neededExtra * Math.pow(factor, 1.4);
      }
    }

    // Aspect ratio adjustment for Bangladesh orientation
    const latScale = 0.92 + (absSeed % 10) / 100;
    const lngScale = 1.05 - (absSeed % 10) / 100;

    const dLat = Math.sin(angle) * r * latScale;
    const dLng = Math.cos(angle) * r * lngScale;

    const pointLat = Number((dist.lat + dLat).toFixed(4));
    const pointLng = Number((dist.lng + dLng).toFixed(4));

    if (isValidLatLng(pointLat, pointLng)) {
      coords.push([pointLat, pointLng]);
    }
  }

  return coords;
};

// Project point (lat, lng) onto district boundary if needed for geometric queries
export function snapCoordinateToDistrictBoundary(
  lat: number,
  lng: number,
  boundaryCoords: [number, number][]
): { lat: number; lng: number } {
  if (!boundaryCoords || boundaryCoords.length < 3) {
    return { lat, lng };
  }
  let minDistanceSq = Infinity;
  let snappedLat = lat;
  let snappedLng = lng;

  for (let i = 0; i < boundaryCoords.length; i++) {
    const p1 = boundaryCoords[i];
    const p2 = boundaryCoords[(i + 1) % boundaryCoords.length];

    const dx = p2[1] - p1[1];
    const dy = p2[0] - p1[0];
    const lenSq = dx * dx + dy * dy;

    let t = lenSq === 0 ? 0 : ((lng - p1[1]) * dx + (lat - p1[0]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLat = p1[0] + t * dy;
    const projLng = p1[1] + t * dx;

    const distSq = (lat - projLat) * (lat - projLat) + (lng - projLng) * (lng - projLng);
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      snappedLat = projLat;
      snappedLng = projLng;
    }
  }

  return { lat: Number(snappedLat.toFixed(5)), lng: Number(snappedLng.toFixed(5)) };
}

// Haversine formula for spherical distance in KM
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!isValidLatLng(lat1, lon1) || !isValidLatLng(lat2, lon2)) {
    return NaN;
  }
  const R = 6371; // Earth radius in km
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
}

export function findNearestDistrict(lat: number, lng: number): { district: DistrictData; distanceKm: number } {
  const defaultDistrict = ALL_64_DISTRICTS.find((d) => d.id === 'dhaka') || ALL_64_DISTRICTS[0];
  if (!isValidLatLng(lat, lng)) {
    return { district: defaultDistrict, distanceKm: 0 };
  }

  let minDistance = Infinity;
  let closest = defaultDistrict;

  for (const d of ALL_64_DISTRICTS) {
    if (!isValidLatLng(d.lat, d.lng)) continue;
    const dist = calculateDistanceKm(lat, lng, d.lat, d.lng);
    if (!isNaN(dist) && dist < minDistance) {
      minDistance = dist;
      closest = d;
    }
  }

  return { district: closest, distanceKm: isFinite(minDistance) ? minDistance : 0 };
}

export async function detectExactPinpointLocation(): Promise<LocationDetectionResult> {
  // 1. High-Precision GPS positioning
  if ('geolocation' in navigator) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (isValidLatLng(lat, lng)) {
        const { district, distanceKm } = findNearestDistrict(lat, lng);

        return {
          lat,
          lng,
          method: 'gps',
          accuracyMeters: accuracy,
          nearestDistrict: district,
          distanceKm,
        };
      }
    } catch (err) {
      console.warn('GPS Geolocation unavailable or permission denied; using strictly on-device Dhaka fallback:', err);
    }
  }

  // 2. Strictly On-Device Fallback to Central Bangladesh (Dhaka)
  // Third-party IP lookup (ipapi.co) was removed to enforce strict on-device location privacy.
  const defaultDistrict = ALL_64_DISTRICTS.find((d) => d.id === 'dhaka') || ALL_64_DISTRICTS[0];

  return {
    lat: defaultDistrict.lat,
    lng: defaultDistrict.lng,
    method: 'fallback',
    nearestDistrict: defaultDistrict,
    distanceKm: 0,
    city: 'Dhaka',
    country: 'Bangladesh',
  };
}

