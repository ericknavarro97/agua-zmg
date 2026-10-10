/**
 * Capa «datos externos»: pinta cada colonia con la misma escala de colores y tramas del mapa (1 a 4),
 * pero según CUÁNTOS datos externos tiene, no según gravedad.
 */


/** Cantidad de datos -> nivel de la escala (1 a 4) */
export function nivelExterno(n: number): 1 | 2 | 3 | 4 {
  return n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1;
}
