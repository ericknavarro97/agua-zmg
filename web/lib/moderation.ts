/**
 * Moderación y detección de ráfagas (docs/research/anti-abuso.md §7-§8).
 * Principios:
 *  - DEGRADAR antes que ocultar: lo automático solo manda reportes a 'revision' (no cuentan hasta que una
 *    persona decide); ocultar es decisión humana.
 *  - Se oculta por CÓMO llegó el reporte (ráfaga, datos personales, spam), nunca por QUÉ dice.
 *  - Todo cambio pasa por la función SQL moderar() y queda en la bitácora moderacion_log (solo agregado).
 */
import type { Pool } from "pg";
import { invalidarCacheScores } from "./aggregation";

type Db = Pick<Pool, "query">;

// --- Saneamiento del comentario -----------------------------------------------------------------

/**
 * Deja el comentario sin HTML y sin datos personales: teléfonos, correos, enlaces y @usuarios se enmascaran.
 * Los falsos positivos (p. ej. una fecha de 8 dígitos) son aceptables: es más seguro enmascarar de más.
 */
export function limpiarComentario(entrada: string): { texto: string | null; redactado: boolean } {
  let t = entrada.normalize("NFC");
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "");
  t = t.replace(/<[^>]*>/g, " ").replace(/[<>]/g, " "); // sin HTML
  t = t
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[enlace]")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|mx|org|net|me|ly|gob|io|co|info|app)\b(?:\/\S*)?/gi, "[enlace]")
    .replace(/\(?\+?\d(?:[\s().-]*\d){7,}/g, "[teléfono]") // 8 o más dígitos, con separadores
    .replace(/(^|\s)@\w{3,}/g, "$1[usuario]");
  t = t.replace(/\s+/g, " ").trim().slice(0, 500);
  return { texto: t || null, redactado: t !== entrada.trim().replace(/\s+/g, " ") };
}

// --- Moderación ---------------------------------------------------------------------------------

export type AccionModeracion = "degradar" | "ocultar" | "restaurar";

/** Cambia el estado de reportes y registra en la bitácora, en una transacción (función SQL moderar()). */
export async function moderar(
  db: Db,
  ids: number[],
  accion: AccionModeracion,
  actor: string,
  motivo: string,
  regla?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { rows } = await db.query<{ n: number }>("SELECT moderar($1::bigint[], $2, $3, $4, $5) AS n", [
    ids,
    accion,
    actor,
    motivo,
    regla ?? null,
  ]);
  invalidarCacheScores();
  return rows[0].n;
}

/**
 * Borra el texto del comentario de reportes (datos personales o de terceros que el saneamiento no detecta:
 * nombres, calles, CURP). El reporte sigue contando con su gravedad y síntomas. Deja huella en la bitácora
 * (acción 'nota', regla 'borrar_comentario') sin copiar el texto. Devuelve cuántos comentarios se borraron.
 */
export async function borrarComentarios(db: Db, ids: number[], actor: string, motivo: string): Promise<number> {
  if (ids.length === 0) return 0;
  if (motivo.trim().length < 10) throw new Error("el motivo es obligatorio (minimo 10 caracteres)");
  if (!actor.startsWith("mod:")) throw new Error("actor invalido: el borrado es decision humana");
  const { rows } = await db.query<{ n: number }>(
    `WITH previos AS (
       SELECT id, colonia_id FROM reportes WHERE id = ANY ($1::bigint[]) AND comentario IS NOT NULL FOR UPDATE
     ), cambios AS (
       UPDATE reportes r SET comentario = NULL, comentario_hash = NULL
         FROM previos p WHERE r.id = p.id RETURNING r.id
     ), ins AS (
       INSERT INTO moderacion_log (actor, accion, colonia_id, reporte_ids, regla, motivo)
       SELECT $2::text, 'nota',
              CASE WHEN count(DISTINCT p.colonia_id) = 1 THEN min(p.colonia_id) END,
              array_agg(p.id ORDER BY p.id), 'borrar_comentario', $3::text
         FROM previos p HAVING count(*) > 0
     )
     SELECT count(*)::int AS n FROM cambios`,
    [ids, actor, `comentario borrado: ${motivo.trim()}`.slice(0, 300)],
  );
  return rows[0].n;
}

// --- Detección de ráfagas -----------------------------------------------------------------------

/** Valores iniciales razonados, NO medidos: recalibrar en modo sombra con datos reales. */
export const RAFAGA = {
  ventanaMin: 60,
  /** Pico mínimo de reportes en la ventana, además del umbral estadístico lambda + 4*sqrt(lambda). */
  picoMinimo: 8,
  /** Se necesitan al menos 2 señales de baja diversidad: un pico solo puede ser una crisis real. */
  senalesMinimas: 2,
  uaHomogeneo: { n: 15, fraccion: 0.95 },
  ritmoRegular: { n: 6, cvMax: 0.35 },
  formularioRapido: { n: 5, medianaMs: 4000 },
  sinTiempo: { n: 10, fraccion: 0.9 },
  sinCabeceras: { n: 10, fraccion: 0.9 },
  comentarioRepetido: 3,
  /** Reportes de una misma red en la hora a partir de los cuales esa red se considera origen de la ráfaga. */
  redConcentrada: 4,
} as const;

export type EvalRafaga = {
  n: number;
  umbral: number;
  pico: boolean;
  sospechosa: boolean;
  senales: string[];
  metricas: Record<string, number | null>;
};

type FilaUlt = {
  huella: string | null;
  red_hash: string | null;
  ua_familia: string | null;
  tiempo_ms: number | null;
  comentario_hash: string | null;
  canal: string;
  ep: number;
};

/** Función pura: de los reportes de la última hora y la tasa típica por hora a un veredicto. */
export function veredictoRafaga(filas: FilaUlt[], lambdaHora: number): EvalRafaga {
  const n = filas.length;
  const umbral = Math.max(RAFAGA.picoMinimo, Math.ceil(lambdaHora + 4 * Math.sqrt(lambdaHora)));
  const pico = n >= umbral;

  const huellas = new Set(filas.map((f, i) => f.huella ?? `anon:${i}`));
  const redes = new Set(filas.map((f, i) => f.red_hash ?? `anon:${i}`));
  const rhoRed = huellas.size ? redes.size / huellas.size : 1;

  const porUa = new Map<string, number>();
  for (const f of filas) porUa.set(f.ua_familia ?? "?", (porUa.get(f.ua_familia ?? "?") ?? 0) + 1);
  const uaDom = n ? Math.max(...porUa.values()) / n : 0;

  const ts = filas.map((f) => f.ep).sort((a, b) => a - b);
  const dts = ts.slice(1).map((t, i) => t - ts[i]);
  const media = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
  const sd = dts.length > 1 ? Math.sqrt(dts.reduce((a, d) => a + (d - media) ** 2, 0) / (dts.length - 1)) : 0;
  const cv = media > 0 ? sd / media : null;

  const tiempos = filas.map((f) => f.tiempo_ms).filter((x): x is number => x != null).sort((a, b) => a - b);
  const medTiempo = tiempos.length ? tiempos[Math.floor((tiempos.length - 1) / 2)] : null;
  const sinTiempo = n ? filas.filter((f) => f.tiempo_ms == null).length / n : 0;
  const sinCab = n ? filas.filter((f) => f.canal === "sin_cabeceras").length / n : 0;

  const porCom = new Map<string, number>();
  for (const f of filas) if (f.comentario_hash) porCom.set(f.comentario_hash, (porCom.get(f.comentario_hash) ?? 0) + 1);
  const dup = porCom.size ? Math.max(...porCom.values()) : 0;

  const senales: string[] = [];
  if (n >= RAFAGA.picoMinimo && rhoRed < 0.5) senales.push("pocas_redes"); // un mismo origen rotando User-Agent
  if (n >= RAFAGA.uaHomogeneo.n && uaDom >= RAFAGA.uaHomogeneo.fraccion) senales.push("ua_homogeneo");
  if (n >= RAFAGA.ritmoRegular.n && cv != null && cv < RAFAGA.ritmoRegular.cvMax) senales.push("ritmo_regular");
  if (tiempos.length >= RAFAGA.formularioRapido.n && medTiempo! < RAFAGA.formularioRapido.medianaMs) senales.push("formulario_rapido");
  if (n >= RAFAGA.sinTiempo.n && sinTiempo >= RAFAGA.sinTiempo.fraccion) senales.push("sin_tiempo_formulario");
  if (n >= RAFAGA.sinCabeceras.n && sinCab >= RAFAGA.sinCabeceras.fraccion) senales.push("sin_cabeceras_navegador");
  if (dup >= RAFAGA.comentarioRepetido) senales.push("comentario_repetido");

  const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
  return {
    n,
    umbral,
    pico,
    sospechosa: pico && senales.length >= RAFAGA.senalesMinimas,
    senales,
    metricas: {
      n,
      lambda_hora: r2(lambdaHora),
      umbral,
      rho_red: r2(rhoRed),
      ua_dominante: r2(uaDom),
      cv_intervalos: r2(cv),
      mediana_tiempo_ms: medTiempo,
      sin_tiempo: r2(sinTiempo),
      sin_cabeceras: r2(sinCab),
      comentarios_repetidos: dup,
    },
  };
}

export async function evaluarRafaga(db: Db, coloniaId: number): Promise<EvalRafaga> {
  const [ult, base] = await Promise.all([
    db.query<FilaUlt>(
      `SELECT huella, red_hash, ua_familia, tiempo_ms, comentario_hash, canal,
              extract(epoch FROM creado_en)::float8 AS ep
         FROM reportes
        WHERE colonia_id = $1 AND estado = 'visible' AND NOT sospechoso
          AND creado_en >= now() - make_interval(mins => $2::int)
        ORDER BY creado_en LIMIT 2000`,
      [coloniaId, RAFAGA.ventanaMin],
    ),
    // tasa típica por hora en los 7 días previos a la última hora
    db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reportes
        WHERE colonia_id = $1 AND estado <> 'oculto' AND NOT sospechoso
          AND creado_en >= now() - interval '7 days' - make_interval(mins => $2::int)
          AND creado_en <  now() - make_interval(mins => $2::int)`,
      [coloniaId, RAFAGA.ventanaMin],
    ),
  ]);
  return veredictoRafaga(ult.rows, base.rows[0].n / (7 * 24));
}

type FilaCandidata = {
  id: string;
  red_hash: string | null;
  tiempo_ms: number | null;
  comentario_hash: string | null;
  canal: string;
};

/**
 * Función pura: de los reportes visibles de la hora y las señales de la ráfaga, cuáles ALIMENTARON la señal.
 * Solo esos se degradan: un vecino con navegador, tiempo de formulario plausible y una red propia no paga por
 * una ráfaga ajena (si no, bastaría disparar el detector para sacar del mapa a una colonia entera).
 */
export function reportesOfensores(filas: FilaCandidata[], senales: string[]): number[] {
  const porRed = new Map<string, number>();
  const porCom = new Map<string, number>();
  for (const f of filas) {
    if (f.red_hash) porRed.set(f.red_hash, (porRed.get(f.red_hash) ?? 0) + 1);
    if (f.comentario_hash) porCom.set(f.comentario_hash, (porCom.get(f.comentario_hash) ?? 0) + 1);
  }
  const sinCab = senales.includes("sin_cabeceras_navegador");
  const sinTiempo = senales.includes("sin_tiempo_formulario");
  return filas
    .filter(
      (f) =>
        (f.red_hash != null && (porRed.get(f.red_hash) ?? 0) >= RAFAGA.redConcentrada) ||
        (sinCab && f.canal === "sin_cabeceras") ||
        (sinTiempo && f.tiempo_ms == null) ||
        (f.comentario_hash != null && (porCom.get(f.comentario_hash) ?? 0) >= RAFAGA.comentarioRepetido),
    )
    .map((f) => Number(f.id));
}

/**
 * Se llama tras guardar un reporte. Si la ráfaga es sospechosa, DEGRADA (no oculta) los reportes de la última
 * hora de esa colonia que causaron las señales (ver reportesOfensores): pasan a 'revision' y no cuentan hasta
 * que un moderador decida. Los reportes con pinta de vecino real se dejan visibles.
 */
export async function aplicarRafaga(db: Db, coloniaId: number): Promise<EvalRafaga> {
  const e = await evaluarRafaga(db, coloniaId);
  if (!e.sospechosa) return e;
  const { rows } = await db.query<FilaCandidata>(
    `SELECT id::text AS id, red_hash, tiempo_ms, comentario_hash, canal FROM reportes
      WHERE colonia_id = $1 AND estado = 'visible' AND NOT sospechoso
        AND creado_en >= now() - make_interval(mins => $2::int)`,
    [coloniaId, RAFAGA.ventanaMin],
  );
  const ids = reportesOfensores(rows, e.senales);
  if (ids.length === 0) {
    // Ráfaga distribuida (una por red, con pinta de navegador): no se castiga a nadie a ciegas; queda para el moderador
    console.warn(`[rafaga] colonia ${coloniaId}: señales ${e.senales.join(", ")} sin reportes atribuibles; sin degradar`);
    return e;
  }
  await moderar(db, ids, "degradar", "sistema", `ráfaga sospechosa: ${e.senales.join(", ")}`, "rafaga_sospechosa");
  return e;
}

/**
 * ¿Hay una ráfaga detectada en esta colonia en la última hora y sin decisión humana posterior?
 * Si la hay, los reportes nuevos con el mismo perfil entran directamente a 'revision' (la decisión de degradar
 * ya está en la bitácora; así no se llena de una fila por reporte). Cuando un moderador actúa sobre la colonia,
 * deja de aplicar. Con `perfil`, un reporte que NO se parece a la ráfaga (navegador real, tiempo de formulario,
 * red con pocos reportes) sigue entrando visible; sin `perfil` se considera que aplica a todo.
 */
export async function rafagaEnCurso(
  db: Db,
  coloniaId: number,
  perfil?: { redHash: string | null; canal: string; tiempoMs: number | null },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM moderacion_log s
      WHERE s.colonia_id = $1 AND s.regla = 'rafaga_sospechosa' AND s.actor = 'sistema'
        AND s.creado_en > now() - make_interval(mins => $2::int)
        AND NOT EXISTS (SELECT 1 FROM moderacion_log m
                         WHERE m.colonia_id = s.colonia_id AND m.actor LIKE 'mod:%' AND m.creado_en > s.creado_en)
      LIMIT 1`,
    [coloniaId, RAFAGA.ventanaMin],
  );
  if (rows.length === 0) return false;
  if (!perfil) return true;
  if (perfil.canal === "sin_cabeceras" || perfil.tiempoMs == null || !perfil.redHash) return true;
  // Con pinta de navegador: solo si su red ya acumula reportes en la hora (el nuevo sería uno más)
  const { rows: r } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reportes
      WHERE colonia_id = $1 AND red_hash = $2 AND estado <> 'oculto'
        AND creado_en >= now() - make_interval(mins => $3::int)`,
    [coloniaId, perfil.redHash, RAFAGA.ventanaMin],
  );
  return r[0].n + 1 >= RAFAGA.redConcentrada;
}

// --- Lectura para el panel de administración ----------------------------------------------------
// Nunca se exponen huella, red_hash ni red_sem: el moderador decide por el contenido y por cómo llegó.

export type ReporteAdmin = {
  id: number;
  colonia_id: number;
  colonia: string;
  municipio: string | null;
  gravedad: number;
  sintomas: string[];
  comentario: string | null;
  creado_en: Date;
  estado: string;
  sospechoso: boolean;
  motivo: string | null;
  canal: string;
  tiempo_ms: number | null;
};

const COLS_REPORTE = `r.id::int AS id, r.colonia_id, c.nombre AS colonia, c.municipio, r.gravedad::int AS gravedad,
  r.sintomas, r.comentario, r.creado_en, r.estado, r.sospechoso, r.motivo, r.canal, r.tiempo_ms`;

export async function resumenModeracion(db: Db) {
  const [estados, sosp, dia, vencidos] = await Promise.all([
    db.query<{ estado: string; n: number }>("SELECT estado, count(*)::int AS n FROM reportes GROUP BY estado"),
    db.query<{ motivo: string; n: number }>(
      `SELECT COALESCE(motivo, '(sin motivo)') AS motivo, count(*)::int AS n FROM reportes
        WHERE sospechoso AND creado_en > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC`,
    ),
    db.query<{ n: number }>("SELECT count(*)::int AS n FROM reportes WHERE creado_en > now() - interval '24 hours'"),
    // Retención: reportes de más de 31 días que aún conservan identificadores o comentario (la tarea purge no corrió)
    db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reportes
        WHERE creado_en < now() - interval '31 days' AND (anonimizado_en IS NULL OR comentario IS NOT NULL)`,
    ),
  ]);
  return {
    por_estado: Object.fromEntries(estados.rows.map((r) => [r.estado, r.n])) as Record<string, number>,
    sospechosos_7d: sosp.rows,
    reportes_24h: dia.rows[0].n,
    retencion_vencida: vencidos.rows[0].n,
  };
}

/** Reportes en revisión, los más viejos primero, hasta `limite` en total. */
export async function colaRevision(db: Db, limite = 200): Promise<ReporteAdmin[]> {
  const { rows } = await db.query<ReporteAdmin>(
    `SELECT ${COLS_REPORTE} FROM reportes r JOIN colonias c ON c.id = r.colonia_id
      WHERE r.estado = 'revision' ORDER BY r.creado_en LIMIT $1`,
    [limite],
  );
  return rows;
}

/** Los reportes más recientes de TODAS las colonias (cualquier estado) para la tabla del panel, y cuántos hay en total. */
export async function reportesRecientes(db: Db, limite = 200): Promise<{ reportes: ReporteAdmin[]; total: number }> {
  const [{ rows }, tot] = await Promise.all([
    db.query<ReporteAdmin>(
      `SELECT ${COLS_REPORTE} FROM reportes r JOIN colonias c ON c.id = r.colonia_id
        ORDER BY r.creado_en DESC, r.id DESC LIMIT $1`,
      [limite],
    ),
    db.query<{ n: number }>("SELECT count(*)::int AS n FROM reportes"),
  ]);
  return { reportes: rows, total: tot.rows[0].n };
}

/** Reportes de una colonia (cualquier estado), los más recientes primero. */
export async function reportesDeColonia(db: Db, coloniaId: number, limite = 100): Promise<ReporteAdmin[]> {
  const { rows } = await db.query<ReporteAdmin>(
    `SELECT ${COLS_REPORTE} FROM reportes r JOIN colonias c ON c.id = r.colonia_id
      WHERE r.colonia_id = $1 ORDER BY r.creado_en DESC LIMIT $2`,
    [coloniaId, limite],
  );
  return rows;
}

export type EntradaBitacora = {
  id: number;
  creado_en: Date;
  actor: string;
  accion: string;
  colonia_id: number | null;
  n_reportes: number;
  regla: string | null;
  motivo: string;
};

export async function bitacora(db: Db, limite = 30): Promise<EntradaBitacora[]> {
  const { rows } = await db.query<EntradaBitacora>(
    `SELECT id::int AS id, creado_en, actor, accion, colonia_id, cardinality(reporte_ids) AS n_reportes, regla, motivo
       FROM moderacion_log ORDER BY id DESC LIMIT $1`,
    [limite],
  );
  return rows;
}
