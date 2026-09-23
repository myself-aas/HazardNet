/**
 * Simplified Bangladesh division polygons for the SVG-fallback map.
 *
 * These are hand-drawn rectangular approximations of the 8 administrative
 * divisions, snapped to a [88.0–92.7 lon, 20.6–26.7 lat] bounding box that
 * covers Bangladesh. Each polygon is a rectangle (5 vertices, 4 unique
 * points) so SVG path generation is trivial and rendering is sub-1ms on
 * low-end Android.
 *
 * The real district-level GeoJSON (64 districts) will ship as an asset in
 * Phase 5b (tile pack). This file is sufficient for the offline-capable
 * fallback map and gives users a geographic surface to tap; severity
 * polygons (from alerts) are rendered as circles over matching divisions.
 *
 * Coordinate convention: [lng, lat] — matches @hazardnet/core geo.ts.
 *
 * BBOX_BANGLADESH = [88.0, 20.6, 92.7, 26.7] (minLng, minLat, maxLng, maxLat).
 */

export interface Division {
  id: string;
  name: string;
  /** Approximate centroid [lng, lat]. */
  center: [number, number];
  /** Outer polygon rectangle: [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  /** Approximate population for label sizing (millions). */
  popM: number;
}

export const BANGLADESH_BBOX: [number, number, number, number] = [88.0, 20.6, 92.7, 26.7];

export const DIVISIONS: Division[] = [
  // Rangpur — far north
  { id: 'rangpur',  name: 'Rangpur',  center: [89.2, 25.7], bbox: [88.5, 25.1, 89.9, 26.7], popM: 17.6 },
  // Rajshahi — NW
  { id: 'rajshahi', name: 'Rajshahi', center: [88.8, 24.6], bbox: [88.1, 24.0, 89.6, 25.2], popM: 20.4 },
  // Mymensingh — N-central
  { id: 'mymensingh', name: 'Mymensingh', center: [90.3, 24.9], bbox: [89.8, 24.4, 91.0, 25.5], popM: 12.4 },
  // Sylhet — NE
  { id: 'sylhet',   name: 'Sylhet',   center: [91.7, 24.9], bbox: [90.8, 24.1, 92.7, 25.6], popM: 11.3 },
  // Khulna — SW
  { id: 'khulna',   name: 'Khulna',   center: [89.4, 22.7], bbox: [88.3, 21.6, 89.9, 23.7], popM: 17.4 },
  // Dhaka — central
  { id: 'dhaka',    name: 'Dhaka',    center: [90.3, 23.8], bbox: [89.6, 23.1, 90.9, 24.3], popM: 44.2 },
  // Barisal / Barishal — S-central
  { id: 'barishal', name: 'Barishal', center: [90.3, 22.6], bbox: [89.8, 21.8, 90.9, 23.2], popM: 9.1 },
  // Chattogram — SE
  { id: 'chattogram', name: 'Chattogram', center: [91.8, 22.7], bbox: [90.8, 20.7, 92.7, 23.5], popM: 33.2 },
];

/**
 * Return which division (if any) contains a given [lng,lat] point. Uses a
 * simple bbox test — sufficient for alert→division lookup on alerts whose
 * district_name field we already have (we use this as a fallback).
 */
export function divisionForPoint(lng: number, lat: number): Division | null {
  for (const d of DIVISIONS) {
    const [w, s, e, n] = d.bbox;
    if (lng >= w && lng <= e && lat >= s && lat <= n) return d;
  }
  return null;
}

/** Look up a division by district name prefix (fuzzy match against alert district). */
export function divisionForDistrict(districtName: string): Division | null {
  const key = districtName.toLowerCase();
  // District-to-division mapping for the 4 mock alerts + common ones.
  const DISTRICT_TO_DIV: Record<string, string> = {
    kurigram: 'rangpur',
    cox: 'chattogram', coxs: 'chattogram', "cox's": 'chattogram',
    dhaka: 'dhaka',
    rajshahi: 'rajshahi',
    chattogram: 'chattogram', chittagong: 'chattogram',
    sylhet: 'sylhet', khulna: 'khulna', barisal: 'barishal', barishal: 'barishal',
    mymensingh: 'mymensingh',
    rangpur: 'rangpur',
  };
  for (const [pat, div] of Object.entries(DISTRICT_TO_DIV)) {
    if (key.includes(pat)) return DIVISIONS.find((d) => d.id === div) ?? null;
  }
  return null;
}
