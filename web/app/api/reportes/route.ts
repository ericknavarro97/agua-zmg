import { z } from "zod";
import { pool } from "@/lib/db";
import { SINTOMAS } from "@/lib/severity";
import {
  diaLocal,
  hashComentario,
  identidades,
  ipCliente,
  leerCuerpoAcotado,
  origenPermitido,
} from "@/lib/fingerprint";
import { LIMITES, contar } from "@/lib/ratelimit";
import { aplicarRafaga, limpiarComentario, rafagaEnCurso } from "@/lib/moderation";
import { refrescarScoresPronto } from "@/lib/aggregation";

// Defensas en capas, de lo barato a lo caro (docs/research/anti-abuso.md §5):
//  1) Content-Type JSON y cuerpo <= 4 KB  2) Origin / Sec-Fetch-Site  3) validación zod
//  4) honeypot y tiempo mínimo -> el reporte se guarda MARCADO y NO cuenta, con la misma respuesta 201
//  5) límites por huella y por red (429 duros; los blandos mandan el reporte a revisión)
//  6) cupo de colonias por día sin carreras (candado asesor)  7) detección de ráfagas
// No se guarda IP ni User-Agent: solo HMAC diarios (ver lib/fingerprint.ts).

const MAX_BODY_BYTES = 4096;
/** Un humano necesita más que esto para elegir la gravedad y enviar. Valor inicial, recalibrar con tiempo_ms real. */
const TIEMPO_MIN_MS = 2000;

const Body = z.object({
  // tope = máximo de integer en Postgres (más allá, la consulta falla con 500)
  colonia_id: z.number().int().positive().max(2147483647),
  gravedad: z.number().int().min(1).max(4),
  sintomas: z.array(z.enum(SINTOMAS)).max(SINTOMAS.length).default([]),
  comentario: z.string().trim().max(500).optional(),
  // honeypot: campo oculto que un humano nunca llena (DEBE venir vacío)
  hp: z.unknown().optional(),
  tiempo_ms: z.number().finite().min(0).max(7 * 24 * 3600 * 1000).optional(),
});

const respuesta = (cuerpo: object, status: number, extra: Record<string, string> = {}) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store", ...extra } });

/** Mínimo entre dos envíos de la misma huella a la misma colonia el mismo día (se mide desde la última actualización). */
const REENVIO_MIN_S = 30;

type Nuevo = {
  coloniaId: number;
  gravedad: number;
  sintomas: string[];
  comentario: string | null;
  comentarioHash: string | null;
  huella: string;
  redHash: string;
  redSem: string;
  uaFamilia: string;
  tiempoMs: number | null;
  canal: "web" | "sin_cabeceras";
  dia: string;
  estado: "visible" | "revision";
  sospechoso: boolean;
  motivo: string | null;
};

/** Guarda el reporte sin carreras: el cupo de colonias/día se revisa bajo un candado por huella. */
async function guardar(r: Nuevo): Promise<"creado" | "actualizado" | "muy_pronto" | "limite" | "colonia_inexistente"> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["rep:" + r.huella]);
    const { rows: previos } = await c.query<{ colonia_id: number }>(
      "SELECT colonia_id FROM reportes WHERE huella = $1 AND dia = $2",
      [r.huella, r.dia],
    );
    const yaReporto = previos.some((p) => p.colonia_id === r.coloniaId);
    if (!yaReporto && previos.length >= LIMITES.coloniasPorDia) {
      await c.query("ROLLBACK");
      return "limite";
    }
    // Si ya reportó esa colonia hoy se actualiza en vez de duplicar. Reenviar NO revive un reporte oculto,
    // no cambia el estado de revisión y no se puede martillar (mínimo 30 s desde la última actualización).
    const res = await c.query<{ insertado: boolean }>(
      `INSERT INTO reportes AS x (colonia_id, gravedad, sintomas, comentario, comentario_hash, huella, dia,
                                  red_hash, red_sem, ua_familia, tiempo_ms, canal, estado, sospechoso, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (colonia_id, huella, dia) DO UPDATE
         SET gravedad = EXCLUDED.gravedad, sintomas = EXCLUDED.sintomas, comentario = EXCLUDED.comentario,
             comentario_hash = EXCLUDED.comentario_hash, tiempo_ms = EXCLUDED.tiempo_ms,
             sospechoso = EXCLUDED.sospechoso, actualizado_en = now(),
             motivo = CASE WHEN x.estado = 'visible' THEN (CASE WHEN EXCLUDED.sospechoso THEN EXCLUDED.motivo END) ELSE x.motivo END
       WHERE x.estado <> 'oculto' AND now() - COALESCE(x.actualizado_en, x.creado_en) > interval '${REENVIO_MIN_S} seconds'
       RETURNING (xmax = 0) AS insertado`,
      [
        r.coloniaId, r.gravedad, r.sintomas, r.comentario, r.comentarioHash, r.huella, r.dia,
        r.redHash, r.redSem, r.uaFamilia, r.tiempoMs, r.canal, r.estado, r.sospechoso, r.motivo,
      ],
    );
    if (!res.rows[0]) {
      // Sin filas: el reporte está oculto por un moderador (se responde como una actualización normal, sin
      // delatar la moderación) o es un reenvío demasiado seguido (no se aplicó: hay que avisarlo, no fingir éxito).
      const { rows } = await c.query<{ estado: string }>(
        "SELECT estado FROM reportes WHERE colonia_id = $1 AND huella = $2 AND dia = $3",
        [r.coloniaId, r.huella, r.dia],
      );
      await c.query("COMMIT");
      return rows[0]?.estado === "oculto" ? "actualizado" : "muy_pronto";
    }
    await c.query("COMMIT");
    return res.rows[0].insertado ? "creado" : "actualizado";
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    // 23503 = la colonia no existe
    if ((e as { code?: string }).code === "23503") return "colonia_inexistente";
    throw e;
  } finally {
    c.release();
  }
}

export async function POST(request: Request) {
  const h = request.headers;

  // 1) forma: solo JSON declarado (un POST "simple" text/plain desde otro sitio no debe llegar al parser)
  if (!(h.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return respuesta({ error: "Tipo de contenido no admitido" }, 415);
  }
  // 2) origen: bloquea formularios incrustados en otros sitios (no frena scripts: curl puede mentir)
  const canal = origenPermitido(h);
  if (!canal) return respuesta({ error: "Origen no permitido" }, 403);

  const texto = await leerCuerpoAcotado(request, MAX_BODY_BYTES);
  if (texto === null) return respuesta({ error: "Solicitud demasiado grande" }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* json queda en null y falla la validación */
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return respuesta({ error: "Datos inválidos" }, 400);
  const b = parsed.data;

  // 3) identidades anónimas del día (la IP y el UA no se guardan)
  const dia = diaLocal();
  let id: ReturnType<typeof identidades>;
  try {
    id = identidades(ipCliente(h) ?? "0.0.0.0", h.get("user-agent") ?? "", dia);
  } catch (e) {
    // Producción sin HASH_SALT válido: se rechaza (falla cerrada) en vez de guardar identificadores débiles
    console.error("[reportes]", e instanceof Error ? e.message : e);
    return respuesta({ error: "Servicio no disponible por configuración" }, 503);
  }

  // 4) señales de bot declaradas por el cliente: el reporte se guarda marcado y NO cuenta,
  //    pero la respuesta es la misma que la de uno normal (no se le da pista al bot)
  const hpLleno = b.hp !== undefined && b.hp !== null && b.hp !== "" && b.hp !== false;
  const motivoSospecha = hpLleno ? "honeypot" : b.tiempo_ms !== undefined && b.tiempo_ms < TIEMPO_MIN_MS ? "tiempo_bajo" : null;

  // 5) límites de tasa (ventana fija en Postgres). En desarrollo se pueden relajar para pruebas locales.
  const relajado = process.env.NODE_ENV !== "production" && process.env.ANTIABUSO_RELAJADO === "1";
  let estado: "visible" | "revision" = "visible";
  let motivoEstado: string | null = null;
  if (!relajado) {
    if ((await contar(pool, `rep:h:${id.huella}`, LIMITES.huellaHora, 3600)) > LIMITES.huellaHora) {
      return respuesta({ error: "Demasiados envíos. Intenta más tarde." }, 429);
    }
    const nRed = await contar(pool, `rep:r:${id.redHash}`, LIMITES.redDuroHora, 3600);
    if (nRed > LIMITES.redDuroHora) {
      return respuesta({ error: "Demasiados envíos desde tu red. Intenta más tarde." }, 429);
    }
    const nGlobal = await contar(pool, "rep:g", LIMITES.globalBlandoHora, 3600);
    if (process.env.MODO_ATAQUE === "1") {
      estado = "revision";
      motivoEstado = "modo_ataque";
    } else if (nRed > LIMITES.redBlandoHora) {
      estado = "revision";
      motivoEstado = "limite_red_blando";
    } else if (nGlobal > LIMITES.globalBlandoHora) {
      estado = "revision";
      motivoEstado = "limite_global_blando";
    }
  }

  // Ráfaga ya detectada en esta colonia: lo nuevo entra directo a revisión (sin llenar la bitácora)
  if (
    estado === "visible" &&
    motivoSospecha === null &&
    (await rafagaEnCurso(pool, b.colonia_id, { redHash: id.redHash, canal, tiempoMs: b.tiempo_ms ?? null }))
  ) {
    estado = "revision";
    motivoEstado = "rafaga_en_curso";
  }

  // 6) comentario sin HTML y sin datos personales
  const com = b.comentario ? limpiarComentario(b.comentario).texto : null;

  // 7) guardar (cupo de colonias/día bajo candado)
  const res = await guardar({
    coloniaId: b.colonia_id,
    gravedad: b.gravedad,
    sintomas: b.sintomas,
    comentario: com,
    comentarioHash: com ? hashComentario(com, dia) : null,
    huella: id.huella,
    redHash: id.redHash,
    redSem: id.redSem,
    uaFamilia: id.uaFamilia,
    tiempoMs: b.tiempo_ms !== undefined ? Math.round(b.tiempo_ms) : null,
    canal,
    dia,
    estado,
    sospechoso: motivoSospecha !== null,
    motivo: motivoSospecha ?? motivoEstado,
  });
  if (res === "limite") return respuesta({ error: "Llegaste al límite de reportes de hoy" }, 429);
  if (res === "colonia_inexistente") return respuesta({ error: "Colonia no encontrada" }, 404);
  if (res === "muy_pronto") {
    return respuesta(
      { error: "Ya enviaste un reporte para esta colonia hace unos segundos. Espera un momento para corregirlo." },
      429,
      { "Retry-After": String(REENVIO_MIN_S) },
    );
  }

  // 8) ráfagas: si hay un pico anómalo con baja diversidad, lo de la última hora pasa a 'revision'.
  //    Un fallo del detector no debe perder el reporte.
  if (motivoSospecha === null && estado === "visible") {
    try {
      await aplicarRafaga(pool, b.colonia_id);
    } catch (e) {
      console.error("aplicarRafaga falló", e instanceof Error ? e.message : e);
    }
  }
  // Sin invalidar de golpe: con tráfico de crisis eso equivale a recalcular en cada visita (ver aggregation.ts)
  if (estado === "visible" && motivoSospecha === null) refrescarScoresPronto();

  return respuesta({ ok: true, actualizado: res === "actualizado" }, res === "creado" ? 201 : 200);
}
