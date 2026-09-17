/**
 * CSV export for the alert list (Phase 5).
 *
 * Why a hand-rolled CSV instead of a library: the export must run offline (a union
 * parishad office downloads the list once and prints it) and must be *exact* — a
 * spreadsheet is a place where a hazard warning gets quoted in a report, so the file
 * carries the same values the screen showed, no rounding, no reformatting.
 *
 * Two details that matter in practice:
 *  - **BOM.** Excel on Windows assumes the system codepage unless a UTF-8 BOM is
 *    present, and Bengali district names then arrive as mojibake. The BOM is written
 *    for exactly that reason.
 *  - **RFC 4180 quoting.** Fields containing a comma, quote or newline are quoted and
 *    inner quotes doubled; a driver-variable list with a comma would otherwise shift
 *    every later column.
 */

import type { AlertRecord } from './alerts';

export interface CsvColumn {
  /** Dot path into the alert record, or a literal column name. */
  key: keyof AlertRecord | string;
  header: string;
}

const valueAt = (alert: AlertRecord, key: string): unknown => {
  if (key in alert) return (alert as unknown as Record<string, unknown>)[key];
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, alert);
};

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function alertsToCsv(alerts: AlertRecord[], columns: CsvColumn[]): string {
  const header = columns.map((column) => csvCell(column.header)).join(',');
  const rows = alerts.map((alert) =>
    columns.map((column) => csvCell(valueAt(alert, String(column.key)))).join(','));
  return [header, ...rows].join('\r\n');
}

export interface DownloadCsvOptions {
  filename: string;
  columns: CsvColumn[];
  /** Injected in tests so the DOM is never touched. */
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  click?: (anchor: HTMLAnchorElement) => void;
  documentRef?: Document;
}

/** Trigger a CSV download. Returns false when there is no DOM (SSR/tests). */
export function downloadAlertsCsv(alerts: AlertRecord[], options: DownloadCsvOptions): boolean {
  const csv = alertsToCsv(alerts, options.columns);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const doc = options.documentRef || (typeof document !== 'undefined' ? document : undefined);
  if (!doc) return false;

  const createUrl = options.createObjectUrl
    || (typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL.bind(URL) : null);
  if (!createUrl) return false;
  const url = createUrl(blob);

  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = options.filename.endsWith('.csv') ? options.filename : `${options.filename}.csv`;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  if (options.click) options.click(anchor);
  else anchor.click();
  doc.body.removeChild(anchor);

  const revoke = options.revokeObjectUrl
    || (typeof URL !== 'undefined' && URL.revokeObjectURL ? URL.revokeObjectURL.bind(URL) : null);
  revoke?.(url);
  return true;
}
