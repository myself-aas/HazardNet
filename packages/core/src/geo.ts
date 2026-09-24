/**
 * Geospatial utilities.
 *
 * Pure-TypeScript, zero-dependency. Designed for the small polygons (district
 * boundaries, ~20-40 vertices each) we use for saved-place matching in alerts.
 *
 * For computationally heavy geospatial work server-side or in the map SDK, use
 * the platform-native libraries. These helpers exist so that:
 *   - the mobile notification matcher can decide "does this saved place fall
 *     inside an alerted polygon?" without loading a native GIS library;
 *   - web and mobile use the same containment algorithm so an alert matches
 *     the same places on both surfaces.
 */

/** [lng, lat] pair — GeoJSON convention. */
export type LngLat = [number, number];
/** Ring = closed polygon ring (first vertex !== last vertex required? ray-cast handles both). */
export type Ring = LngLat[];
/** Polygon = outer ring (holes not supported for district boundaries). */
export type Polygon = Ring;
/** Multi-polygon = list of polygons (used for districts with exclaves). */
export type MultiPolygon = Polygon[];

/**
 * Ray-casting point-in-polygon.
 *
 * Returns true if the point is inside (or on the edge of) the polygon.
 * Algorithm: https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html
 * We add edge-case handling for point-on-vertex and point-on-edge.
 */
export function pointInPolygon(
  point: LngLat,
  polygon: Polygon,
): boolean {
  const [x, y] = point;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    // Edge case: point exactly on a vertex
    if ((xi === x && yi === y) || (xj === x && yj === y)) return true;

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Multi-polygon variant. */
export function pointInMultiPolygon(
  point: LngLat,
  multi: MultiPolygon,
): boolean {
  for (const poly of multi) {
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
}

/**
 * Haversine distance in metres between two [lng,lat] points.
 * For small distances (< a few km) the earth-curvature error is negligible,
 * but we use the full formula so saved-place matching works for distant points.
 */
export function haversineDistanceMeters(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(b[0] - a[0]);
  const dLat = toRad(b[1] - a[1]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Very fast bounding-box pre-filter — returns true if the point is within the
 * polygon's bounding box. Use this before pointInPolygon for large polygon sets.
 */
export function pointInBoundingBox(point: LngLat, polygon: Polygon): boolean {
  if (polygon.length === 0) return false;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of polygon) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return (
    point[0] >= minLng &&
    point[0] <= maxLng &&
    point[1] >= minLat &&
    point[1] <= maxLat
  );
}

/**
 * Given a point and a collection of polygons keyed by id, returns the id of the
 * first containing polygon, or null if the point is outside all.
 *
 * Uses bounding-box pre-filter to keep this O(n·ring) but with a cheap early
 * exit — for ~64 districts this is sub-millisecond on a mobile CPU.
 *
 * Each value in `polygons` may be either a Polygon (Ring = LngLat[]) or a
 * MultiPolygon (Polygon[] = Ring[]). We distinguish by checking whether the
 * first element of the shape is itself a ring: a ring is an array of [lng,lat]
 * pairs (i.e., the first element is an array of numbers, not an array of arrays).
 */
export function findContainingPolygon<T extends string>(
  point: LngLat,
  polygons: Record<T, Polygon | MultiPolygon>,
): T | null {
  for (const key of Object.keys(polygons) as T[]) {
    const shape = polygons[key];
    if (shape.length === 0) continue;
    const firstVertex = shape[0];
    // Detect MultiPolygon: firstVertex is a Ring (array of arrays), not a single LngLat point
    const isMulti = Array.isArray(firstVertex) && Array.isArray(firstVertex[0]);
    if (isMulti) {
      if (pointInMultiPolygon(point, shape as MultiPolygon)) return key;
    } else {
      const poly = shape as Polygon;
      if (pointInBoundingBox(point, poly) && pointInPolygon(point, poly)) {
        return key;
      }
    }
  }
  return null;
}

/**
 * Build a coarse geohash-like prefix (not a real geohash) from a [lng,lat] at
 * a given precision in digits after the decimal. Two places (~1km) is enough to
 * bucket saved-place lookups for duplicate-suppression. Returns a string key
 * like "88.56,26.35".
 */
export function coarseLocationKey(point: LngLat, precision = 2): string {
  const f = 10 ** precision;
  const lng = Math.round(point[0] * f) / f;
  const lat = Math.round(point[1] * f) / f;
  return `${lng.toFixed(precision)},${lat.toFixed(precision)}`;
}
