import { pool } from "@/lib/db";
import { jsonConEtag } from "@/lib/oficial-http";
import { municipioCanonico } from "@/lib/oficial-normalizar";
import { type FilaOficial, aContratoOficial } from "@/lib/oficial";

// Datos externos (oficiales, académicos, periodísticos, ciudadanos) ya vinculados a colonias reales.
// Filtros: ?colonia_id= ?municipio= ?parametro= ?tipo= ?min_vinculo=alta|media|baja
// ?ambito=colonia|municipio|zmg (por defecto colonia) ?limit= (máx. 500) ?offset=
const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400";
const AMBITOS = ["colonia", "municipio", "zmg"];
const TIPOS = ["oficial", "academica", "periodistica", "ciudadana"];
const ORDEN_VINCULO = { alta: 1, media: 2, baja: 3 } as const;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const err = (msg: string) => jsonConEtag(req, { error: msg }, "no-store", 400);

  const ambito = q.get("ambito") ?? "colonia";
  if (!AMBITOS.includes(ambito)) return err("ambito inválido");
  const tipo = q.get("tipo");
  if (tipo && !TIPOS.includes(tipo)) return err("tipo inválido");
  // Por defecto sin vínculos 'baja' (coincidencia dudosa de nombre); se piden de forma explícita con ?min_vinculo=baja
  const minVinculo = q.get("min_vinculo") ?? "media";
  // hasOwn y no `in`: `in` acepta claves heredadas («constructor», «toString») que luego rompen la consulta
  if (!Object.hasOwn(ORDEN_VINCULO, minVinculo)) return err("min_vinculo inválido");
  const coloniaId = q.get("colonia_id");
  if (coloniaId && !/^\d{1,9}$/.test(coloniaId)) return err("colonia_id inválido");
  const municipioTxt = q.get("municipio");
  const municipio = municipioTxt ? municipioCanonico(municipioTxt) : null;
  if (municipioTxt && !municipio) return err("municipio no reconocido");
  const parametro = q.get("parametro");
  // Texto libre hacia SQL: sin NUL (Postgres lo rechaza con un error) y con largo acotado
  if (parametro && (parametro.includes("\0") || parametro.length > 100)) return err("parametro inválido");
  const limit = Math.min(500, Math.max(1, Math.floor(Number(q.get("limit") ?? 200)) || 200));
  // Entero seguro y con tope: 1e21, Infinity o más de 2^63 no caben en el bigint de OFFSET
  const offset = Math.min(1_000_000, Math.max(0, Math.floor(Number(q.get("offset") ?? 0)) || 0));

  let rows;
  try {
    ({ rows } = await pool.query(
    `SELECT m.colonia_id, c.nombre AS colonia, c.municipio AS municipio_colonia, m.municipio_texto, m.ambito,
            m.fuente, m.tipo_fuente, to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.parametro, m.valor, m.unidad, m.url, m.notas,
            m.confianza_vinculo
       FROM mediciones_externas m LEFT JOIN colonias c ON c.id = m.colonia_id
      WHERE m.ambito = $1
        AND ($1 <> 'colonia' OR m.colonia_id IS NOT NULL)
        AND ($2::text IS NULL OR m.tipo_fuente = $2)
        AND ($3::text IS NULL OR m.parametro = $3)
        AND ($4::int IS NULL OR m.colonia_id = $4)
        AND ($5::text IS NULL OR c.municipio = $5 OR (m.ambito <> 'colonia' AND m.municipio_texto = $5))
        AND ($1 <> 'colonia' OR CASE m.confianza_vinculo WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END <= $6::int)
        AND ($1 <> 'colonia' OR NOT EXISTS (
              SELECT 1 FROM mediciones_externas o
               WHERE o.colonia_id = m.colonia_id AND o.fuente = m.fuente AND o.parametro = m.parametro
                 AND o.fecha IS NOT DISTINCT FROM m.fecha AND o.valor IS NOT DISTINCT FROM m.valor
                 AND o.unidad IS NOT DISTINCT FROM m.unidad AND o.id <> m.id
                 AND (CASE o.confianza_vinculo WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END
                        < CASE m.confianza_vinculo WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END
                      OR (o.confianza_vinculo IS NOT DISTINCT FROM m.confianza_vinculo AND o.id < m.id))))
      ORDER BY m.fecha DESC NULLS LAST, m.id DESC
      LIMIT $7 OFFSET $8`,
    [ambito, tipo, parametro, coloniaId, municipio, ORDEN_VINCULO[minVinculo as keyof typeof ORDEN_VINCULO], limit, offset],
    ));
  } catch (e) {
    console.error("[oficial]", e instanceof Error ? e.message : e);
    return jsonConEtag(req, { error: "Servicio no disponible, intenta más tarde" }, "no-store", 503);
  }
  return jsonConEtag(
    req,
    {
      aviso:
        "Datos de terceros, con calidad muy desigual. 'reporte_calidad_deficiente' es un listado administrativo o una queja, NO una medición. Revisa 'tipo', 'notas' y la 'url' de cada fuente. Por defecto solo se devuelven vínculos 'alta' y 'media'; con ?min_vinculo=baja aparecen también los 'baja', que significan 'posible colonia' (el nombre de la fuente coincide poco).",
      n: rows.length,
      limit,
      offset,
      datos: rows.map((r) => ({
        colonia_id: r.colonia_id,
        colonia: r.colonia,
        municipio: r.municipio_colonia ?? (r.municipio_texto || null),
        ambito: r.ambito,
        ...aContratoOficial(r as FilaOficial),
      })),
    },
    CACHE,
  );
}
