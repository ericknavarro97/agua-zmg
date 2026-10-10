/** Tipos y forma pública de los datos externos (tabla mediciones_externas). */

export type TipoFuente = "oficial" | "academica" | "periodistica" | "ciudadana";
export type ConfianzaVinculo = "alta" | "media" | "baja";

/** Fila tal como sale de mediciones_externas (solo columnas públicas). */
export interface FilaOficial {
  fuente: string;
  tipo_fuente: TipoFuente;
  fecha: string | null; // 'YYYY-MM-DD' (la consulta usa to_char)
  parametro: string;
  valor: number | null;
  unidad: string | null;
  url: string;
  notas: string | null;
  confianza_vinculo: ConfianzaVinculo | null;
}

/**
 * Forma del contrato de GET /api/colonias/[id] (campo `oficial`). `tipo` = tipo_fuente.
 * Se añade `notas` (no está en el contrato mínimo) porque lleva advertencias que la UI debe poder mostrar
 * (p. ej. "listado administrativo, NO es una medición").
 */
export function aContratoOficial(f: FilaOficial) {
  return {
    fuente: f.fuente,
    tipo: f.tipo_fuente,
    fecha: f.fecha,
    parametro: f.parametro,
    valor: f.valor,
    unidad: f.unidad,
    url: f.url,
    confianza_vinculo: f.confianza_vinculo,
    notas: f.notas,
  };
}
