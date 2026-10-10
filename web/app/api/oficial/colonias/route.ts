import { pool } from "@/lib/db";
import { jsonConEtag } from "@/lib/oficial-http";

// Qué colonias tienen datos externos vinculados, para marcarlas en el mapa. No dice nada de gravedad.
// Solo vínculos de confianza alta o media: uno dudoso marcaría en el mapa una colonia que quizá no es.
// `medicion` = al menos una fila trae un valor numérico (el resto son listados administrativos o menciones).
const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=3600, stale-if-error=86400";

export async function GET(req: Request) {
  const { rows } = await pool.query(
    `SELECT colonia_id AS id, count(*)::int AS n, bool_or(valor IS NOT NULL) AS medicion
       FROM mediciones_externas
      WHERE colonia_id IS NOT NULL AND confianza_vinculo IN ('alta', 'media')
      GROUP BY colonia_id
      ORDER BY colonia_id`,
  );
  return jsonConEtag(req, rows, CACHE);
}
