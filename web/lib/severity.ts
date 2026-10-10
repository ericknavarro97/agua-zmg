/**
 * Aviso fijo junto a cualquier nivel: la escala describe cómo se ve y huele el agua, no su aptitud de uso.
 * El desabasto se reporta con el síntoma "Sin agua / baja presión", no con un nivel.
 */
export const AVISO_NIVELES =
  "Ningún nivel significa que el agua sea segura para beber o cocinar. La escala describe cómo se ve y huele el agua, no si hay agua.";

export const GRAVEDADES = [
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

export const SIN_DATOS_COLOR = "#d5dde7";

/** Mínimo de reportes recientes para pintar una colonia */
export const MIN_REPORTES = 3;
/** Ventana en días y vida media del peso de cada reporte */
export const VENTANA_DIAS = 14;
export const VIDA_MEDIA_DIAS = 7;

export function colorParaScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return SIN_DATOS_COLOR;
  const nivel = Math.min(4, Math.max(1, Math.round(score)));
  return GRAVEDADES[nivel - 1].color;
}
