export function csvCell(value: string): string {
  // Prefixa com apóstrofo quando o Excel/LibreOffice pode interpretar o campo
  // como fórmula, inclusive após espaços ou caracteres de controle.
  const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
