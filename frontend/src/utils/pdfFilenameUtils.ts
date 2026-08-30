export interface PdfFilenameContext {
  region?: string;
  district?: string;
  division?: string;
  hazard?: string;
  hazardType?: string;
  docType?: string;
  documentType?: string;
  dispatchRef?: string;
  customPrefix?: string;
  [key: string]: string | undefined;
}

export interface PlaceholderDefinition {
  tag: string;
  label: string;
  description: string;
  category: 'location' | 'date' | 'metadata';
  getExample: (context?: PdfFilenameContext) => string;
}

/**
 * Standard placeholders supported in PDF export filename templates
 */
export const AVAILABLE_FILENAME_PLACEHOLDERS: PlaceholderDefinition[] = [
  {
    tag: '{date}',
    label: 'Date (YYYY-MM-DD)',
    description: 'Current ISO date in YYYY-MM-DD format',
    category: 'date',
    getExample: () => new Date().toISOString().slice(0, 10),
  },
  {
    tag: '{region}',
    label: 'Region / District',
    description: 'Selected district or region name (e.g., Sylhet, Kurigram, National)',
    category: 'location',
    getExample: (ctx) => ctx?.region || ctx?.district || ctx?.division || 'Sylhet',
  },
  {
    tag: '{hazard}',
    label: 'Hazard Type',
    description: 'Active hazard event (e.g., Flash_Flood, Monsoon_Flood, Cyclone)',
    category: 'metadata',
    getExample: (ctx) => (ctx?.hazard || ctx?.hazardType || 'Flash_Flood').replace(/\s+/g, '_'),
  },
  {
    tag: '{docType}',
    label: 'Document Type',
    description: 'Classification (e.g., Advisory_Directive, Situation_Report)',
    category: 'metadata',
    getExample: (ctx) => (ctx?.docType || ctx?.documentType || 'Directive').replace(/\s+/g, '_'),
  },
  {
    tag: '{time}',
    label: 'Time (HH-MM)',
    description: 'Current 24-hour time stamp (e.g., 14-30)',
    category: 'date',
    getExample: () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    },
  },
  {
    tag: '{ref}',
    label: 'SOD Dispatch Ref',
    description: 'SOD 2019 reference code (e.g., HN-BD-2026-X8Y9)',
    category: 'metadata',
    getExample: (ctx) => ctx?.dispatchRef || `HN-BD-${new Date().getFullYear()}-REF01`,
  },
  {
    tag: '{year}',
    label: 'Year (YYYY)',
    description: 'Current 4-digit year',
    category: 'date',
    getExample: () => String(new Date().getFullYear()),
  },
  {
    tag: '{month}',
    label: 'Month (MM)',
    description: 'Current 2-digit month (01-12)',
    category: 'date',
    getExample: () => String(new Date().getMonth() + 1).padStart(2, '0'),
  },
  {
    tag: '{day}',
    label: 'Day (DD)',
    description: 'Current 2-digit day of month (01-31)',
    category: 'date',
    getExample: () => String(new Date().getDate()).padStart(2, '0'),
  },
];

/**
 * Standard preset filename templates for quick user selection
 */
export const FILENAME_PRESET_TEMPLATES = [
  {
    id: 'standard-official',
    name: 'Official SOD Directive',
    template: 'HazardNet_{docType}_{region}_{date}.pdf',
    description: 'Recommended for official government & public safety dispatches',
  },
  {
    id: 'district-situation',
    name: 'District Situation Report',
    template: '{region}_{hazard}_Report_{date}.pdf',
    description: 'Concise hazard & district situation report naming',
  },
  {
    id: 'timestamped-archive',
    name: 'Timestamped Archive',
    template: 'HN_{region}_{date}_{time}.pdf',
    description: 'Includes exact hour-minute stamp for time-series logging',
  },
  {
    id: 'dispatch-reference',
    name: 'Dispatch Reference Tagged',
    template: 'HazardNet_{ref}_{region}_{hazard}.pdf',
    description: 'Prefixed with verified SOD dispatch audit ID',
  },
];

/**
 * Resolves a template string containing placeholders like {date}, {region}, {hazard}, etc.
 * into a safe, valid PDF filename.
 */
export function formatFilenameWithPlaceholders(
  template: string,
  context: PdfFilenameContext = {}
): string {
  if (!template || template.trim() === '') {
    template = 'HazardNet_{docType}_{region}_{date}.pdf';
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hours}-${minutes}`;
  const datetimeStr = `${dateStr}_${timeStr}`;

  const cleanString = (val?: string, fallback = 'Unknown'): string => {
    if (!val) return fallback;
    return val
      .trim()
      .replace(/[\s\t\n/\\:;*?"<>|]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const rawRegion = context.region || context.district || context.division || 'Bangladesh';
  const regionVal = cleanString(rawRegion, 'Bangladesh');

  const rawHazard = context.hazard || context.hazardType || 'Disaster_Advisory';
  const hazardVal = cleanString(rawHazard, 'Disaster');

  const rawDocType = context.docType || context.documentType || 'Directive';
  const docTypeVal = cleanString(rawDocType, 'Directive');

  const refVal = cleanString(
    context.dispatchRef || `HN-BD-${year}-${now.getTime().toString(36).slice(-4).toUpperCase()}`,
    `HN-${year}`
  );

  const replacements: Record<string, string> = {
    '{date}': dateStr,
    '{YYYY-MM-DD}': dateStr,
    '{time}': timeStr,
    '{datetime}': datetimeStr,
    '{year}': year,
    '{YYYY}': year,
    '{month}': month,
    '{MM}': month,
    '{day}': day,
    '{DD}': day,
    '{region}': regionVal,
    '{district}': regionVal,
    '{location}': regionVal,
    '{hazard}': hazardVal,
    '{hazardType}': hazardVal,
    '{hazard_type}': hazardVal,
    '{type}': docTypeVal,
    '{docType}': docTypeVal,
    '{doctype}': docTypeVal,
    '{documentType}': docTypeVal,
    '{ref}': refVal,
    '{dispatchRef}': refVal,
  };

  let resolved = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    resolved = resolved.replace(new RegExp(escaped, 'gi'), value);
  }

  // Sanitize filename: remove characters forbidden in filenames on OS / filesystems
  resolved = resolved.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  resolved = resolved.replace(/_+/g, '_');

  // If filename ended up empty or just underscores
  if (!resolved || resolved === '_' || resolved.toLowerCase() === '.pdf') {
    resolved = `HazardNet_${regionVal}_${dateStr}`;
  }

  // Ensure it ends with .pdf
  if (!resolved.toLowerCase().endsWith('.pdf')) {
    resolved = `${resolved}.pdf`;
  }

  return resolved;
}
