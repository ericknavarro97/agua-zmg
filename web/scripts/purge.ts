/**
 * Retención de datos: anonimiza lo que identifica (aun siendo hashes diarios) y borra lo que ya no sirve.
 * Uso: pnpm purge [--dry-run] [--dias=30]
 *  - reportes de más de N días (30 por defecto): huella, red_hash, red_sem, ua_familia y comentario_hash -> NULL.
 *    El reporte conserva gravedad, síntomas y colonia (ya sin identificador).
 *  - comentarios de más de N días -> NULL (texto libre: el riesgo de datos personales no desaparece con el hash).
 *  - rate_limits con más de 2 días -> borrados.
 * N debe ser >= la ventana de cálculo (14 días), si no se perdería evidencia que aún cuenta en los scores.
 * Pensado para correr a diario (cron). Es idempotente y por lotes: no bloquea la tabla.
 */
import { Pool } from "pg";

const LOTE = 5000;

function arg(nombre: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a?.slice(nombre.length + 3);
}

async function main() {
  const seco = process.argv.includes("--dry-run");
  const dias = Number(arg("dias") ?? 30);
  if (!Number.isInteger(dias) || dias < 14) {
    throw new Error("--dias debe ser un entero >= 14 (la ventana de cálculo de los scores)");
  }
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (seco) {
      const { rows } = await pool.query(
        `SELECT
           (SELECT count(*) FROM reportes WHERE creado_en < now() - make_interval(days => $1::int) AND anonimizado_en IS NULL)::int AS por_anonimizar,
           (SELECT count(*) FROM reportes WHERE creado_en < now() - make_interval(days => $1::int) AND comentario IS NOT NULL)::int AS comentarios,
           (SELECT count(*) FROM rate_limits WHERE ventana < now() - interval '2 days')::int AS rate_limits`,
        [dias],
      );
      console.log("dry-run (no se cambió nada):", rows[0]);
      return;
    }

    let anonimizados = 0;
    for (;;) {
      const r = await pool.query(
        `WITH lote AS (
           SELECT id FROM reportes
            WHERE creado_en < now() - make_interval(days => $1::int) AND anonimizado_en IS NULL
            LIMIT ${LOTE} FOR UPDATE SKIP LOCKED
         )
         UPDATE reportes x
            SET huella = NULL, red_hash = NULL, red_sem = NULL, ua_familia = NULL, comentario_hash = NULL,
                anonimizado_en = now()
           FROM lote WHERE x.id = lote.id`,
        [dias],
      );
      anonimizados += r.rowCount ?? 0;
      if ((r.rowCount ?? 0) < LOTE) break;
    }

    let comentarios = 0;
    for (;;) {
      const r = await pool.query(
        `WITH lote AS (
           SELECT id FROM reportes
            WHERE creado_en < now() - make_interval(days => $1::int) AND comentario IS NOT NULL
            LIMIT ${LOTE} FOR UPDATE SKIP LOCKED
         )
         UPDATE reportes x SET comentario = NULL FROM lote WHERE x.id = lote.id`,
        [dias],
      );
      comentarios += r.rowCount ?? 0;
      if ((r.rowCount ?? 0) < LOTE) break;
    }

    const rl = await pool.query("DELETE FROM rate_limits WHERE ventana < now() - interval '2 days'");
    console.log({ dias, reportes_anonimizados: anonimizados, comentarios_borrados: comentarios, rate_limits_borrados: rl.rowCount });
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
