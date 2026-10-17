import { pool } from "@/lib/db";
import { PARAMS, cargarSerie, scoresConCache } from "@/lib/aggregation";
import { jsonConEtag } from "@/lib/oficial-http";
import { type FilaOficial, aContratoOficial } from "@/lib/oficial";

const CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600";
const SIN_CACHE = "no-store";

// Detalle de una colonia: reportes ciudadanos (agregados, sin huellas) + comentarios públicos + datos externos vinculados.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: idTexto } = await ctx.params;
  if (!/^\d{1,9}$/.test(idTexto)) {
    return jsonConEtag(req, { error: "id inválido" }, SIN_CACHE, 400);
  }
  const id = Number(idTexto);

  const col = await pool.query(
    "SELECT id, nombre, municipio, fuente_geom FROM colonias WHERE id = $1",
    [id],
  );
  if (!col.rowCount) return jsonConEtag(req, { error: "colonia no encontrada" }, SIN_CACHE, 404);
  const c = col.rows[0] as { id: number; nombre: string; municipio: string | null; fuente_geom: string };

  // Los agregados (n, n_huellas, score, nivel) solo se publican si la colonia alcanza el mínimo publicable (igual que
  // /api/v1). La serie diaria y los comentarios públicos se muestran con cualquier cantidad de reportes (también en v1).
  const [scores, oficial] = await Promise.all([
    scoresConCache(pool),
    pool.query(
      // Solo vínculos 'alta' y 'media': uno 'baja' atribuiría el dato a una colonia que la fuente quizá no nombró.
      // Si la misma fuente repite el dato por dos nombres de origen, queda una sola fila (la de mejor vínculo).
      `SELECT fuente, tipo_fuente, to_char(fecha, 'YYYY-MM-DD') AS fecha, parametro, valor, unidad, url, notas, confianza_vinculo
         FROM (
           SELECT DISTINCT ON (m.fuente, m.parametro, m.fecha, m.valor, m.unidad) m.*
             FROM mediciones_externas m
            WHERE m.colonia_id = $1 AND m.confianza_vinculo IN ('alta', 'media')
            ORDER BY m.fuente, m.parametro, m.fecha, m.valor, m.unidad,
                     CASE m.confianza_vinculo WHEN 'alta' THEN 1 ELSE 2 END, m.id
         ) t
        ORDER BY fecha DESC NULLS LAST, id DESC LIMIT 200`,
      [id],
    ),
  ]);
  const s = scores.find((x) => x.id === id);

  // n, huellas y último salen del MISMO cálculo que el nivel (antes se volvían a consultar aparte y podían no
  // coincidir con el nivel en caché). La serie usa los mismos topes por red que el score (lib/aggregation.ts).
  const [serie, comentarios] = await Promise.all([
    cargarSerie(pool, id, 30),
    // Comentarios que su autor aceptó mostrar (el formulario lo avisa). Solo el día, sin hora ni identificadores.
    // Un reporte oculto o en revisión también retira su comentario. Misma ventana que el nivel.
    pool.query(
      `SELECT to_char((creado_en AT TIME ZONE 'America/Mexico_City')::date, 'YYYY-MM-DD') AS dia,
              gravedad::int AS gravedad, comentario AS texto
         FROM reportes
        WHERE colonia_id = $1 AND estado = 'visible' AND NOT sospechoso
          AND comentario IS NOT NULL AND comentario_publico
          AND creado_en > now() - make_interval(days => $2::int)
        ORDER BY creado_en DESC LIMIT 20`,
      [id, PARAMS.ventanaDias],
    ),
  ]);

  const cuerpo = {
    id: c.id,
    nombre: c.nombre,
    municipio: c.municipio,
    fuente_geom: c.fuente_geom,
    reportes: {
      n: s ? s.n : null,
      n_huellas: s ? s.nHuellas : null,
      score: s ? Number(s.score.toFixed(3)) : null,
      nivel: s ? s.nivel : null,
      confianza: s ? s.confianza : null,
      ultimo: s ? s.ultimo : null,
      serie,
    },
    comentarios: comentarios.rows as { dia: string; gravedad: number; texto: string }[],
    oficial: oficial.rows.map((o) => aContratoOficial(o as FilaOficial)),
  };
  return jsonConEtag(req, cuerpo, CACHE);
}
