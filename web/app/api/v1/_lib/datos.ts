// Consultas de la API pública. Solo AGREGADOS: nunca se leen ni se devuelven huellas,
// hashes de red, comentarios ni ninguna columna que identifique reportes.
//
// El score sale de lib/aggregation.ts (el mismo cálculo que usa el mapa en /api/colonias/scores),
// así mapa y API pública nunca difieren. Aquí solo se une con los datos de cada colonia.
import { cargarSerie, paraContrato, scoresConCache } from "../../../../lib/aggregation";
import { pool } from "../../../../lib/db";
import { claveMunicipio } from "../../../../lib/oficial-normalizar";

/**
 * Parámetros que cambian la CONSULTA (y por tanto la clave de memoria). Los filtros por municipio
 * y "solo con datos" se aplican después, en memoria, para que un cliente no pueda forzar una
 * consulta distinta a la base con cada valor de ?municipio=.
 */
export type Base = {
  /** incluir polígonos (GeoJSON); false = solo propiedades */
  geometria: boolean;
};

export type Filtro = {
  /** municipio en forma normalizada (ver `leerMunicipio`); exacto, no subcadena */
  municipioNorm?: string;
  /** solo colonias que alcanzan el mínimo publicable */
  soloConDatos: boolean;
};

/** `norm`: municipio normalizado (minúsculas, sin acentos), para filtrar */
type ConFiltro = { norm: string; conDatos: boolean };

export function filtrar<T extends ConFiltro>(items: T[], f: Filtro): T[] {
  return items.filter((i) => (!f.soloConDatos || i.conDatos) && (!f.municipioNorm || i.norm === f.municipioNorm));
}

type ScorePublico = ReturnType<typeof paraContrato>;

async function scoresPorId(): Promise<Map<number, ScorePublico>> {
  const todos = await scoresConCache(pool);
  return new Map(todos.map((s) => [s.id, paraContrato(s)]));
}

/** Propiedades de reporte de una colonia; todo null si aún no alcanza el mínimo publicable. */
function propsScore(s: ScorePublico | undefined) {
  return {
    score: s?.score ?? null,
    nivel: s?.nivel ?? null,
    confianza: s?.confianza ?? null,
    // el conteo va con el score: null mientras la colonia no alcanza el mínimo publicable
    n: s?.n ?? null,
    n_huellas: s?.n_huellas ?? null,
    ultimo: s?.ultimo ?? null,
  };
}

/**
 * Features de GeoJSON ya serializadas (texto), con score/nivel/confianza/n por colonia.
 * Se devuelven como texto para no parsear y volver a serializar los polígonos.
 */
export async function coloniasFeatures(o: Base): Promise<(ConFiltro & { json: string })[]> {
  const geom = o.geometria ? "ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geom, 0.00005), 5)" : "NULL";
  const [scores, { rows }] = await Promise.all([
    scoresPorId(),
    pool.query(
      `SELECT c.id, c.nombre, c.municipio, c.fuente_geom, ${geom} AS geometry
         FROM colonias c ORDER BY c.id`,
    ),
  ]);
  return rows.map((r) => {
    const s = scores.get(r.id);
    const props = { id: r.id, nombre: r.nombre, municipio: r.municipio, fuente_geom: r.fuente_geom, ...propsScore(s) };
    return {
      norm: claveMunicipio(r.municipio),
      conDatos: !!s,
      json: `{"type":"Feature","id":${r.id},"properties":${JSON.stringify(props)},"geometry":${r.geometry ?? "null"}}`,
    };
  });
}

export type FilaResumen = {
  id: number;
  nombre: string;
  municipio: string | null;
  score: number | null;
  nivel: number | null;
  confianza: string | null;
  n: number | null;
  n_huellas: number | null;
  ultimo: string | null;
};

/** Una fila por colonia, sin geometría (para CSV). */
export async function coloniasResumen(): Promise<(ConFiltro & { fila: FilaResumen })[]> {
  const [scores, { rows }] = await Promise.all([
    scoresPorId(),
    pool.query(
      `SELECT c.id, c.nombre, c.municipio FROM colonias c
        ORDER BY c.municipio NULLS LAST, c.nombre, c.id`,
    ),
  ]);
  return rows.map((r) => {
    const s = scores.get(r.id);
    return {
      norm: claveMunicipio(r.municipio),
      conDatos: !!s,
      fila: { id: r.id, nombre: r.nombre, municipio: r.municipio, ...propsScore(s) },
    };
  });
}

/** Detalle de una colonia: agregados de todos sus reportes, la serie diaria completa y los datos externos vinculados. */
export async function coloniaDetalle(id: number) {
  const { rows } = await pool.query(
    `SELECT id, nombre, municipio, fuente_geom FROM colonias WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const c = rows[0];
  const s = (await scoresPorId()).get(id);

  const [serie, oficial] = await Promise.all([
    // Misma serie que el mapa (/api/colonias/[id]): mismos topes por red que el score, con cualquier cantidad de reportes
    cargarSerie(pool, id),
    // Datos externos: NO entran al score; cada fila lleva su fuente y URL
    pool.query(
      // Solo vínculos 'alta' y 'media' (uno 'baja' es una coincidencia dudosa de nombre) y sin filas repetidas de la misma fuente
      `SELECT fuente, tipo_fuente AS tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha, parametro,
              valor, unidad, url, confianza_vinculo, notas
         FROM (
           SELECT DISTINCT ON (m.fuente, m.parametro, m.fecha, m.valor, m.unidad) m.*
             FROM mediciones_externas m
            WHERE m.colonia_id = $1 AND m.confianza_vinculo IN ('alta', 'media')
            ORDER BY m.fuente, m.parametro, m.fecha, m.valor, m.unidad,
                     CASE m.confianza_vinculo WHEN 'alta' THEN 1 ELSE 2 END, m.id
         ) t
        ORDER BY fecha DESC NULLS LAST, id
        LIMIT 500`,
      [id],
    ),
  ]);

  return {
    id: c.id as number,
    nombre: c.nombre as string,
    municipio: c.municipio as string | null,
    fuente_geom: c.fuente_geom as string,
    reportes: { ...propsScore(s), serie },
    oficial: oficial.rows as {
      fuente: string; tipo: string; fecha: string | null; parametro: string;
      valor: number | null; unidad: string | null; url: string; confianza_vinculo: string | null;
      /** advertencias de la fuente (p. ej. "listado administrativo, NO es una medición", "histórico") */
      notas: string | null;
    }[],
  };
}
