const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * One CSV cell, quoted, with spreadsheet formula injection neutralised.
 *
 * Quoting alone is NOT enough: Excel and LibreOffice still evaluate a leading
 * '=' / '+' / '-' / '@' inside a quoted cell, and several columns come from the
 * public form or imported spreadsheets, so they are attacker-controlled. A leading
 * single quote makes the cell text. A lone '-' (the "no value" placeholder) cannot
 * form a formula and is left alone so it does not export as "'-".
 */
export function escapeCsvCell(cell: unknown): string {
  if (cell == null) return '""';
  let str = String(cell).replace(/[\r\n]+/g, ' ');
  if (str !== '-' && FORMULA_TRIGGER.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/** Joins cells into one CSV line. */
export function csvLine(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}
