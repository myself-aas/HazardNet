/**
 * Data attribution registry for the live map (Phase A, 2026-10-05).
 *
 * Pattern borrowed from gods-eye-view's `src/data/dataCredits.js`: every external
 * source the map draws from registers one credit, and the layers panel's
 * "Data attribution" lightbox lists exactly the credits of what is on screen.
 * A credit that no active layer names never appears; a source that lands on the
 * map must name one. Licences stay with the providers — this registry is a
 * pointer, not a re-licence.
 */

export interface DataCredit {
  id: string;
  /** Human-facing credit line shown in the attribution lightbox. */
  label: string;
  /** Where the licence or source terms live. */
  href: string;
  licence: string;
}

export const DATA_CREDITS: Record<string, DataCredit> = {
  osm: {
    id: 'osm',
    label: '© OpenStreetMap contributors',
    href: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL 1.0',
  },
  opentopomap: {
    id: 'opentopomap',
    label: 'Map style © OpenTopoMap, elevation SRTM',
    href: 'https://opentopomap.org/about',
    licence: 'CC BY-SA 3.0',
  },
  esri: {
    id: 'esri',
    label: 'Powered by Esri. Source: Esri, Maxar, Earthstar Geographics and the GIS User Community',
    href: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
    licence: 'Esri Master Agreement',
  },
  forecasts: {
    id: 'forecasts',
    label: 'HazardNet weekly hazard forecast product',
    href: 'https://www.kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts',
    licence: 'CC BY-NC 4.0',
  },
  gibs: {
    id: 'gibs',
    label:
      "Recent imagery: We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)",
    href: 'https://gibs.earthdata.nasa.gov',
    licence: 'NASA GIBS / EOSDIS terms (imagery is NASA, free to use)',
  },
} as const;

/** Resolve ids to credits, dropping unknown ids rather than rendering blanks. */
export function activeCredits(ids: string[]): DataCredit[] {
  const seen = new Set<string>();
  const out: DataCredit[] = [];
  for (const id of ids) {
    const credit = DATA_CREDITS[id];
    if (credit && !seen.has(id)) {
      seen.add(id);
      out.push(credit);
    }
  }
  return out;
}
