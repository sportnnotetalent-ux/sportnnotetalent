/**
 * Escaping for files the app writes (security W4, CL-27). PURE.
 *  - CSV: a cell a spreadsheet would run as a formula (=, +, -, @, or a leading
 *    tab / CR) gets a ' first; quotes and separators are quoted as usual.
 *  - iCalendar: backslash, ; and , escaped, newlines as \n, and a bare CR
 *    dropped (it could start a new property).
 */
export function csvCell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const icsText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n?/g, '\n').replace(/\n/g, '\\n');
