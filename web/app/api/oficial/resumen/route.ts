import { pool } from "@/lib/db";
import { jsonConEtag } from "@/lib/oficial-http";

// Qué hay en la tabla de datos externos y cuánto se pudo vincular a colonias (transparencia sobre la cobertura).
const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=3600, stale-if-error=86400";

export async function GET(req: Request) {
  const [tot, porParam, porFuente] = await Promise.all([
    pool.query(`SELECT count(*)::int AS filas,
                       count(*) FILTER (WHERE ambito = 'colonia')::int AS filas_de_colonia,
                       count(*) FILTER (WHERE colonia_id IS NOT NULL)::int AS vinculadas,
                       count(*) FILTER (WHERE confianza_vinculo = 'alta' AND colonia_id IS NOT NULL)::int AS vinculo_alta,
                       count(*) FILTER (WHERE confianza_vinculo = 'media' AND colonia_id IS NOT NULL)::int AS vinculo_media,
                       count(*) FILTER (WHERE confianza_vinculo = 'baja' AND colonia_id IS NOT NULL)::int AS vinculo_baja,
                       count(DISTINCT colonia_id)::int AS colonias_con_dato,
                       max(importada_en) AS importado_en
                  FROM mediciones_externas`),
    pool.query(`SELECT parametro, count(*)::int AS filas, count(valor)::int AS con_valor
                  FROM mediciones_externas GROUP BY 1 ORDER BY 2 DESC`),
    pool.query(`SELECT fuente, tipo_fuente, count(*)::int AS filas, min(url) AS url_ejemplo
                  FROM mediciones_externas GROUP BY 1, 2 ORDER BY 3 DESC`),
  ]);
  return jsonConEtag(req, { totales: tot.rows[0], por_parametro: porParam.rows, por_fuente: porFuente.rows }, CACHE);
}
