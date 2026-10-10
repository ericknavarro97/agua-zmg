/**
 * Límites de tasa en Postgres (tabla rate_limits), sin Redis.
 * Ventana fija atómica: una fila por (clave, ventana) con INSERT ... ON CONFLICT.
 * Las claves llevan hashes (huella/red), nunca IP en claro. `pnpm purge` borra las ventanas viejas.
 */
import type { Pool } from "pg";

/**
 * Cuenta una petición y devuelve el contador `n` tras contarla (atómico, seguro con peticiones paralelas).
 * Al pasar `tope` deja de escribir y devuelve `tope + 1`: un atacante no amplifica escrituras en la base.
 * Uso: `if (await contar(...) > tope) -> rechazar`.
 */
export async function contar(pool: Pool, clave: string, tope: number, ventanaSeg: number): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `INSERT INTO rate_limits AS l (clave, ventana, n)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $3::float8) * $3::float8), 1)
     ON CONFLICT (clave, ventana) DO UPDATE SET n = l.n + 1 WHERE l.n <= $2::int
     RETURNING n`,
    [clave, tope, ventanaSeg],
  );
  return rows.length ? rows[0].n : tope + 1;
}

/** Lee el contador de la ventana actual sin incrementarlo (0 si no hay). */
export async function leer(pool: Pool, clave: string, ventanaSeg: number): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT n FROM rate_limits
      WHERE clave = $1
        AND ventana = to_timestamp(floor(extract(epoch FROM now()) / $2::float8) * $2::float8)`,
    [clave, ventanaSeg],
  );
  return rows.length ? rows[0].n : 0;
}

/** Límites de /api/reportes. Valores iniciales razonados, NO medidos: recalibrar con tráfico real. */
export const LIMITES = {
  /** Envíos por hora de una misma huella (incluye reenvíos). Más: 429. */
  huellaHora: 8,
  /** Reportes por hora de una misma red (/24 o /48): sobre el límite blando entran a revisión... */
  redBlandoHora: 20,
  /** ...y sobre el duro se rechazan con 429. */
  redDuroHora: 120,
  /** Volumen global por hora sobre el cual todo entra a revisión (interruptor; nunca rechaza). */
  // Variable vacía o no numérica (p. ej. `LIMITE_GLOBAL_HORA=` en un .env): valor por defecto.
  // Antes `Number("")` daba 0 y TODO reporte entraba a revisión.
  globalBlandoHora: Number(process.env.LIMITE_GLOBAL_HORA) > 0 ? Number(process.env.LIMITE_GLOBAL_HORA) : 3000,
  /** Colonias distintas que una huella puede reportar por día. */
  coloniasPorDia: 3,
  /** Intentos fallidos de admin por red en 15 min antes de bloquear. */
  adminFallosVentana: 10,
} as const;
