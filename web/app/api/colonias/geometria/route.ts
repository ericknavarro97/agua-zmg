import { pool } from "@/lib/db";
import { coincideEtag, etagDe, responderComprimido, type CuerpoComprimido } from "@/lib/oficial-http";
import { municipioCanonico } from "@/lib/oficial-normalizar";

// Geometría casi estática de las colonias (FeatureCollection). Pesa ~1.4 MB en JSON y ~300 KB en gzip
// con los 2,170 polígonos reales (ver data/README.md); se sirve ya comprimida (br/gzip) y con ETag.
// La consulta PostGIS (simplificar 2,170 polígonos) se hace UNA vez por nivel de detalle y versión de los datos;
// El municipio se filtra en memoria. Así variar los parámetros no puede forzar consultas pesadas ni agotar
// el pool de conexiones (que comparten /api/reportes y /api/salud).
//   ?municipio=A,B     solo esos municipios (nombres oficiales o variantes: "Tlaquepaque", "Tonala"...)
//   ?detalle=completo|alto|medio|bajo   simplificación (por defecto medio)

// Tolerancia de ST_SimplifyPreserveTopology en grados (1e-5 ~ 1.1 m) y decimales de coordenadas
const DETALLE = {
  completo: { tol: 0, dec: 6 },
  alto: { tol: 0.00001, dec: 5 },
  medio: { tol: 0.00003, dec: 5 },
  bajo: { tol: 0.0001, dec: 4 },
} as const;


type Fila = { id: number; area: number | null; municipio: string | null; fuente: string; json: string };
type Base = { version: string; filas: Fila[]; fuentes: Map<string, unknown> };
type Entrada = { version: string; etag: string; cuerpo: CuerpoComprimido };

// Geometría completa por nivel de detalle (la única que consulta la base)
const bases = new Map<string, Base>();
const basesEnCurso = new Map<string, Promise<Base>>();
// Cuerpos ya armados por combinación de filtros; tope por bytes (el FIFO evita que combinaciones nuevas crezcan sin límite)
const cache = new Map<string, Entrada>();
const MAX_BYTES_CACHE = 48 * 1024 * 1024;
let bytesCache = 0;
// Versión de los datos: una sola consulta en vuelo aunque lleguen muchas peticiones a la vez
let versionEnCurso: Promise<string> | null = null;

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=604800";
const ATRIBUCION = 'Límites aproximados, no oficiales. Ver "fuentes_geom" para la procedencia de cada polígono.';

/** Versión barata del contenido (de TODA la tabla): cambia si se importan/actualizan/borran colonias. */
function versionDatos(): Promise<string> {
  versionEnCurso ??= pool
    .query(`SELECT count(*)::int AS n, coalesce(max(actualizada_en)::text, '') AS ult, coalesce(sum(id), 0)::text AS sid FROM colonias`)
    .then((v) => `${v.rows[0].n}|${v.rows[0].ult}|${v.rows[0].sid}`)
    .finally(() => {
      versionEnCurso = null;
    });
  return versionEnCurso;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const detalleKey = (url.searchParams.get("detalle") ?? "medio") as keyof typeof DETALLE;
  // hasOwn y no `in`: `in` acepta claves heredadas («constructor», «toString»), que dejarían tolerancia y decimales
  // indefinidos y una respuesta sin polígonos cacheada un día
  if (!Object.hasOwn(DETALLE, detalleKey)) {
    return Response.json({ error: `detalle inválido; usa ${Object.keys(DETALLE).join("|")}` }, { status: 400 });
  }
  let municipios: string[] | null = null;
  const m = url.searchParams.get("municipio");
  if (m) {
    municipios = [...new Set(m.split(",").map((x) => x.trim()).filter(Boolean))].map((x) => municipioCanonico(x) ?? "");
    if (municipios.some((x) => !x)) {
      return Response.json({ error: "municipio no reconocido (usa nombres de la ZMG)" }, { status: 400 });
    }
    municipios.sort();
  }
  const clave = JSON.stringify([municipios, detalleKey]);

  const version = await versionDatos();
  const etag = etagDe(`${clave}|${version}`);
  const cabeceras = { ETag: etag, "Cache-Control": CACHE_CONTROL, "Content-Type": "application/geo+json; charset=utf-8" };
  if (coincideEtag(req, etag)) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL } });

  let e = cache.get(clave);
  if (!e || e.version !== version) {
    // Una consulta por nivel de detalle como mucho (compartida); armar el cuerpo filtrado es solo memoria
    e = armar(clave, etag, version, await baseDe(detalleKey, version), municipios);
  }
  return responderComprimido(req, e.cuerpo, cabeceras);
}

/** Geometría completa de un nivel de detalle: una sola consulta por (detalle, versión), compartida entre peticiones. */
async function baseDe(detalle: keyof typeof DETALLE, version: string): Promise<Base> {
  const hecha = bases.get(detalle);
  if (hecha && hecha.version === version) return hecha;
  const k = `${detalle}|${version}`;
  let p = basesEnCurso.get(k);
  if (!p) {
    p = consultar(detalle, version).finally(() => basesEnCurso.delete(k));
    basesEnCurso.set(k, p);
  }
  return p;
}

async function consultar(detalle: keyof typeof DETALLE, version: string): Promise<Base> {
  const { tol, dec } = DETALLE[detalle];
  // Los features van primero las colonias más grandes: las anidadas (más chicas) se dibujan encima
  const { rows } = await pool.query(
    `SELECT id, area_m2::float8 AS area, municipio, fuente_geom AS fuente, jsonb_build_object(
       'type', 'Feature', 'id', id,
       'properties', jsonb_build_object('id', id, 'nombre', nombre, 'municipio', municipio, 'fuente_geom', fuente_geom),
       'geometry', ST_AsGeoJSON(CASE WHEN $1::float8 > 0 THEN ST_SimplifyPreserveTopology(geom, $1::float8) ELSE geom END, $2::int)::jsonb
     ) AS feature
       FROM colonias ORDER BY area_m2 DESC NULLS FIRST, id`,
    [tol, dec],
  );
  const fuentes = await pool.query("SELECT clave, titulo, representa, anio, licencia, url, aviso FROM fuentes_geom");
  const base: Base = {
    version,
    filas: rows.map((r) => ({
      id: r.id, area: r.area, municipio: r.municipio, fuente: r.fuente, json: JSON.stringify(r.feature),
    })),
    fuentes: new Map(fuentes.rows.map((f) => [f.clave as string, f])),
  };
  bases.set(detalle, base);
  return base;
}

/** Filtra en memoria y arma el FeatureCollection (concatenando los features ya serializados). */
function armar(
  clave: string, etag: string, version: string, base: Base, municipios: string[] | null,
): Entrada {
  const sel = base.filas.filter((f) => (municipios === null || (f.municipio !== null && municipios.includes(f.municipio))));
  const fuentes = Object.fromEntries(
    [...new Set(sel.map((f) => f.fuente))].filter((c) => base.fuentes.has(c)).map((c) => [c, base.fuentes.get(c)]),
  );
  const plano = Buffer.from(
    `{"type":"FeatureCollection","atribucion":${JSON.stringify(ATRIBUCION)},"features":[${sel.map((f) => f.json).join(",")}],"fuentes_geom":${JSON.stringify(fuentes)}}`,
  );
  const e: Entrada = { version, etag, cuerpo: { plano } };
  const previo = cache.get(clave);
  if (previo) bytesCache -= previo.cuerpo.plano.length;
  cache.delete(clave);
  while (cache.size > 0 && bytesCache + plano.length > MAX_BYTES_CACHE) {
    const k = cache.keys().next().value!;
    bytesCache -= cache.get(k)!.cuerpo.plano.length;
    cache.delete(k);
  }
  cache.set(clave, e);
  bytesCache += plano.length;
  return e;
}
