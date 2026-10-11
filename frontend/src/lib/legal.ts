/**
 * Public-facing legal text (PRODUCT_SPEC §1.7).
 *
 * The disclaimer is required on **every public surface, including SMS and exports**,
 * so it lives in one constant that the alert list, the alert detail page, the printed
 * evidence card and the CSV/PDF exports all render. Parity is maintained with the
 * backend's `REQUIRED_DISCLAIMER` so the site and the API cannot drift into saying different things.
 *
 * The emergency numbers are Bangladesh's: 999 national emergency, 1090 disaster
 * response, 16123 agriculture helpline. They are part of the disclaimer, not a
 * separate widget, because a reader who needs them is exactly the reader who is
 * looking at a severe alert.
 */

export const ALERT_DISCLAIMER =
  'HazardNet is a research-based decision-support tool. It is not an official warning service. ' +
  'Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local ' +
  'administration. In an emergency call 999 (national emergency), 1090 (disaster response), ' +
  'or 16123 (agriculture helpline).';

/** The same text with the numbers split out, for UI rendering as a list. */
export const EMERGENCY_NUMBERS = [
  { number: '999', label: 'National emergency' },
  { number: '1090', label: 'Disaster Management (DDM)' },
  { number: '16123', label: 'Krishi Call Centre' },
] as const;

export const OFFICIAL_SOURCES = [
  { name: 'Bangladesh Meteorological Department', short: 'BMD' },
  { name: 'Flood Forecasting and Warning Centre', short: 'FFWC' },
] as const;
