/**
 * Aviso fijo junto a cualquier nivel: la escala describe cómo se ve y huele el agua, no su aptitud de uso.
 * El desabasto no es un nivel: se reporta con «Hoy no llegó agua» (gravedad NULL) o, si llega con poca presión,
 * con el síntoma "Sin agua / baja presión" junto al nivel de lo que se ve.
 */
export const AVISO_NIVELES =
  "Ningún nivel significa que el agua sea segura para beber o cocinar, ni siquiera «Limpia». La escala describe cómo se ve y huele el agua, no si hay agua.";

/** Escala 0-4: el índice del arreglo ES el nivel (GRAVEDADES[n].nivel === n). */
export const GRAVEDADES = [
  { nivel: 0, etiqueta: "Limpia", detalle: "Se ve clara y no huele raro", color: "#78b98f" },
  { nivel: 1, etiqueta: "Leve", detalle: "Turbia o con mal olor", color: "#f3d27a" },
  { nivel: 2, etiqueta: "Moderada", detalle: "Con color o sedimentos visibles", color: "#ec9a56" },
  { nivel: 3, etiqueta: "Grave", detalle: "Muy sucia o con olor fuerte", color: "#d4574f" },
  { nivel: 4, etiqueta: "Crítica", detalle: "Aspecto u olor alarmante, por ejemplo a químicos o combustible", color: "#7b2142" },
] as const;

export const SINTOMAS = [
  "Diarrea o malestar estomacal",
  "Irritación en piel",
  "Mal olor",
  "Color café o amarillo",
  "Sedimentos",
  "Sin cloro (sin olor a cloro)",
  "Sin agua / baja presión",
] as const;

/** Síntoma que acompaña siempre a un reporte «Hoy no llegó agua» (el servidor lo agrega si falta). */
export const SINTOMA_SIN_AGUA: (typeof SINTOMAS)[number] = "Sin agua / baja presión";

export const SIN_DATOS_COLOR = "#d5dde7";
/**
 * Vida media del peso de cada reporte: pierde la mitad cada 7 días. Desde el método v5 no hay ventana: un reporte
 * nunca deja de contar, solo pesa menos (hasta v4 se descartaban los de más de 14 días).
 */
export const VIDA_MEDIA_DIAS = 7;

export function colorParaScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return SIN_DATOS_COLOR;
  const nivel = Math.min(4, Math.max(0, Math.round(score)));
  return GRAVEDADES[nivel].color;
}
