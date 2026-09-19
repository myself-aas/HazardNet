// Extracted from LiveMapView.tsx (P2 decomposition, first slice).
// Pure, component-independent map primitives: river polylines data,
// hazard layer registry, and the Leaflet marker icon builder.
import L from 'leaflet';
import { getSeverityColor } from '../../services/geolocationService';

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

/**
 * Accessible name for a district hazard marker.
 *
 * Exported because the *element* that carries it is Leaflet's own wrapper
 * (`.leaflet-marker-icon`, which has `role="button"` + `tabindex="0"` and its own
 * Enter/Space handling), not the icon's inner HTML. `LiveMapView.attachMarkerA11y`
 * applies it there. Keeping the wording here — next to the marker it describes, and
 * shared with nothing else — stops the label and the icon drifting apart.
 */
export const hazardMarkerLabel = (
  severity: number,
  hazardType: string,
  districtName: string,
  riskLevel?: string,
) => {
  const hazardDef = HAZARD_LAYERS.find((h) => h.id === hazardType) || { name: hazardType };
  const effectiveRisk = riskLevel || (severity >= 0.7 ? 'High' : severity >= 0.4 ? 'Moderate' : 'Low');
  return `${districtName} District, Risk: ${effectiveRisk}, Hazard: ${hazardDef.name}, Severity: ${(severity * 100).toFixed(0)}%`;
};

// Custom High-Contrast Marker Generator for Leaflet
export const createCustomIcon = (severity: number, isSelected: boolean, hazardType: string, districtName: string) => {
  const hazardDef = HAZARD_LAYERS.find((h) => h.id === hazardType) || { name: hazardType };
  const color = getSeverityColor(severity);
  const glowColor = color;
  // The accessible name is NOT set here any more. Leaflet's own wrapper
  // (`.leaflet-marker-icon`) already carries `role="button"` + `tabindex="0"` and handles
  // Enter/Space; `LiveMapView` sets the name on that wrapper in `attachMarkerA11y`. Putting
  // the same role/tabindex on this inner div created a second interactive element inside
  // the first — the `nested-interactive` violation that fired on 53 markers per map route.
  const html = isSelected ? `
    <div
      style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.98);
      border: 3px solid #f64137;
      box-shadow: 0 6px 24px rgba(0,0,0,0.25), 0 0 20px ${glowColor};
      color: #17171b;
      font-family: var(--hds-font-family-heading);
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      outline: none;
    ">
      <span style="color: #17171b; letter-spacing: -0.2px;">${districtName}: <span style="color: #0284c7;">${hazardDef.name}</span></span>
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
    <div
      style="
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #ffffff;
      border: 3px solid ${color};
      box-shadow: 0 4px 14px rgba(0,0,0,0.2), 0 0 12px ${glowColor};
      color: #17171b;
      font-family: var(--hds-font-family-heading);
      font-size: 11px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s ease;
      outline: none;
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
