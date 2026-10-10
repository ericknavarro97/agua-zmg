// Serialización CSV (RFC 4180) del resumen público, separada de la ruta para poder probarla.
import { LICENCIA } from "./comun";
import type { FilaResumen } from "./datos";

export const COLUMNAS = [
  "id", "nombre", "municipio", "score", "nivel", "confianza",
  "n_reportes", "n_huellas", "ultimo_reporte", "fecha_corte", "licencia",
] as const;

/** Escapa una celda. Evita inyección de fórmulas en Excel/Sheets (=, +, -, @, tab, CR al inicio). */
export function celda(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCsv(filas: FilaResumen[], corte: string, licencia: string = LICENCIA.nombre): string {
  const lineas = [COLUMNAS.join(",")];
  for (const f of filas) {
    lineas.push(
      [f.id, f.nombre, f.municipio, f.score, f.nivel, f.confianza, f.n, f.n_huellas, f.ultimo, corte, licencia]
        .map(celda)
        .join(","),
    );
  }
  return lineas.join("\r\n") + "\r\n";
}
