/**
 * Equirectangular (plate carrée) projection for the SVG-fallback map.
 *
 * For a regional map spanning only 4.7° of latitude, equirectangular is
 * visually indistinguishable from Mercator and is by far the cheapest to
 * compute. We expose project/unproject and SVG path helpers.
 */

export interface ViewBox {
  /** West lng, south lat, east lng, north lat */
  bbox: [number, number, number, number];
  /** SVG canvas size in px. */
  width: number;
  height: number;
  /** Optional padding inside the canvas (in px). */
  padding?: number;
}

export interface Projector {
  /** Geo [lng,lat] → SVG [x,y] */
  project: (lng: number, lat: number) => [number, number];
  /** SVG [x,y] → Geo [lng,lat] */
  unproject: (x: number, y: number) => [number, number];
  /** Width/height of the drawable area inside padding */
  drawW: number;
  drawH: number;
  pad: number;
}

export function makeProjector(vb: ViewBox): Projector {
  const pad = vb.padding ?? 0;
  const [w, s, e, n] = vb.bbox;
  const drawW = vb.width - pad * 2;
  const drawH = vb.height - pad * 2;
  const lngSpan = e - w;
  const latSpan = n - s;
  return {
    project(lng, lat) {
      const x = pad + ((lng - w) / lngSpan) * drawW;
      const y = pad + (1 - (lat - s) / latSpan) * drawH;
      return [x, y];
    },
    unproject(x, y) {
      const lng = w + ((x - pad) / drawW) * lngSpan;
      const lat = s + (1 - (y - pad) / drawH) * latSpan;
      return [lng, lat];
    },
    drawW, drawH, pad,
  };
}

/** Convert a bbox rectangle to an SVG path's "d" attribute. */
export function rectPath(
  p: Projector,
  bbox: [number, number, number, number],
): string {
  const [w, s, e, n] = bbox;
  const [x1, y1] = p.project(w, n);
  const [x2, y2] = p.project(e, s);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} H${x2.toFixed(1)} V${y2.toFixed(1)} H${x1.toFixed(1)} Z`;
}
