/** Serialize one CSV cell and neutralize spreadsheet formulas. */
export function csvCell(value) {
  const safe = /^[\s]*[=+\-@]/.test(String(value)) ? "'" + String(value) : String(value);
  return '"' + safe.replaceAll('"', '""') + '"';
}
