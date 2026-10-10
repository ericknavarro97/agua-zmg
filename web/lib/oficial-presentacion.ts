/**
 * Cómo se presenta un dato externo en la UI: qué advertencia lleva y con qué jerarquía.
 * Regla de salud pública: una prueba ciudadana (tira reactiva, kit) nunca se muestra como "medición" firme.
 */

export interface DatoParaPresentar {
  tipo: string;
  parametro: string;
  valor: number | string | null;
  notas?: string | null;
}

export const AVISO_CIUDADANA =
  "Prueba ciudadana (por ejemplo, con tira reactiva): es orientativa y no sustituye un análisis de laboratorio acreditado.";

/** Palabras de las notas que marcan un valor como dudoso o por confirmar */
const DUDOSO = /indicio a confirmar|no como medici[oó]n|semicuantitativ|tira reactiva|por confirmar|sin verificar/i;

/** ¿El dato es un indicio sin confirmar (y no una medición firme)? */
export function esIndicio(d: DatoParaPresentar): boolean {
  if (d.tipo === "ciudadana") return true;
  return !!d.notas && DUDOSO.test(d.notas);
}

/** Etiqueta del valor numérico: "Valor reportado" solo para fuentes que no son pruebas ciudadanas o dudosas. */
export function etiquetaValor(d: DatoParaPresentar): string {
  return esIndicio(d) ? "Indicio sin confirmar" : "Valor reportado";
}

/** Textos de advertencia que deben verse junto al dato (aviso fijo por tipo + notas de la fuente). */
export function advertencias(d: DatoParaPresentar): string[] {
  const out: string[] = [];
  if (d.tipo === "ciudadana") out.push(AVISO_CIUDADANA);
  const n = d.notas?.trim();
  if (n) out.push(n);
  return out;
}
