import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { Pool } from "pg";
import { invalidarCacheScores } from "@/lib/aggregation";

/** Pool propio de las pruebas (siembra y verificación directa en SQL). */
export const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

/**
 * Vacía las tablas de datos. moderacion_log es solo de agregado (triggers que lo impiden): en pruebas se vacía
 * desactivando triggers SOLO en esa transacción (session_replication_role = replica). Si no se vaciara, la bitácora
 * de una prueba (p. ej. "ráfaga detectada en la colonia 1") se confundiría con la de otra, porque los ids se reinician.
 */
export async function reiniciar(): Promise<void> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role = replica");
    await c.query("TRUNCATE moderacion_log, reportes, mediciones_externas, rate_limits, colonias RESTART IDENTITY CASCADE");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  invalidarCacheScores();
}

let cuadro = 0;
/** Crea una colonia con un cuadrito como polígono. Devuelve su id. */
export async function crearColonia(
  o: { nombre?: string; municipio?: string | null; fuente?: string } = {},
): Promise<number> {
  const n = cuadro++;
  const x = -103.4 + (n % 50) * 0.002;
  const y = 20.6 + Math.floor(n / 50) * 0.002;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO colonias (nombre, municipio, fuente_geom, geom)
     VALUES ($1, $2, $3, ST_Multi(ST_MakeEnvelope($4, $5, $6, $7, 4326))) RETURNING id`,
    [
      o.nombre ?? `Colonia ${n}`,
      o.municipio === undefined ? "Zapopan" : o.municipio,
      o.fuente ?? "ine_colonias",
      x, y, x + 0.0015, y + 0.0015,
    ],
  );
  return rows[0].id;
}

export type SemillaReporte = {
  colonia: number;
  gravedad: 0 | 1 | 2 | 3 | 4;
  /** Antigüedad en días (puede ser fraccionaria). Por defecto, hace unos minutos. */
  edadDias?: number;
  huella?: string | null;
  red?: string | null;
  redSem?: string | null;
  estado?: "visible" | "revision" | "oculto";
  sospechoso?: boolean;
  tiempoMs?: number | null;
  comentario?: string | null;
  /** El autor aceptó mostrar el comentario (por defecto, no) */
  comentarioPublico?: boolean;
};

let serie = 0;
/** Inserta un reporte directo en la base (saltándose la API) con los campos que se quieran controlar. */
export async function sembrar(r: SemillaReporte): Promise<void> {
  const k = serie++;
  const edad = r.edadDias ?? 0.01;
  const huella = r.huella === undefined ? `huella-${k}` : r.huella;
  const red = r.red === undefined ? `red-${k}` : r.red;
  await db.query(
    `INSERT INTO reportes (colonia_id, gravedad, huella, red_hash, red_sem, estado, sospechoso, tiempo_ms, comentario,
                           comentario_publico, creado_en, dia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$11, now() - make_interval(secs => $10::float8),
             ((now() - make_interval(secs => $10::float8)) AT TIME ZONE 'America/Mexico_City')::date)`,
    [
      r.colonia, r.gravedad, huella, red, r.redSem === undefined ? red : r.redSem,
      r.estado ?? "visible", r.sospechoso ?? false, r.tiempoMs === undefined ? 20000 : r.tiempoMs,
      r.comentario ?? null, edad * 86400, r.comentarioPublico ?? false,
    ],
  );
}

/** `n` vecinos distintos (huella y red distintas), repartidos en `dias` días hacia atrás. */
export async function sembrarVecinos(
  colonia: number, gravedad: 0 | 1 | 2 | 3 | 4, n: number, o: { dias?: number; edadBase?: number; prefijo?: string } = {},
): Promise<void> {
  const dias = o.dias ?? 1;
  const p = o.prefijo ?? `v${serie}`;
  for (let i = 0; i < n; i++) {
    await sembrar({
      colonia, gravedad, edadDias: (o.edadBase ?? 0) + (i % dias) + 0.2,
      huella: `${p}-h${i}`, red: `${p}-r${i}`,
    });
  }
}

// --- Peticiones ---------------------------------------------------------------------------------

let ipSeq = 0;
/** IP de documentación (TEST-NET) distinta en cada llamada Y en una red /24 distinta. */
export function ipNueva(): string {
  const n = ipSeq++;
  return `203.${(n >> 8) & 255}.${n & 255}.10`;
}

export const UA_CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";

export type OpcionesPost = {
  ip?: string;
  ua?: string;
  headers?: Record<string, string | null>;
  /** Cuerpo ya serializado (para probar JSON roto, tamaños, etc.). */
  crudo?: string;
};

/** Construye un POST JSON a una ruta de la API. `headers` con valor null quita esa cabecera. */
export function post(ruta: string, cuerpo: unknown, o: OpcionesPost = {}): Request {
  const h = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": o.ip ?? ipNueva(),
    "user-agent": o.ua ?? UA_CHROME,
  });
  for (const [k, v] of Object.entries(o.headers ?? {})) {
    if (v === null) h.delete(k);
    else h.set(k, v);
  }
  return new Request(`http://localhost:3201${ruta}`, {
    method: "POST",
    headers: h,
    body: o.crudo ?? JSON.stringify(cuerpo),
  });
}

export function get(ruta: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3201${ruta}`, { headers });
}

/** Lee el cuerpo de una respuesta aunque venga comprimida (las rutas devuelven Response sin pasar por un servidor). */
export async function texto(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  const enc = res.headers.get("content-encoding");
  if (enc === "gzip") return gunzipSync(buf).toString("utf8");
  if (enc === "br") return brotliDecompressSync(buf).toString("utf8");
  return buf.toString("utf8");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function json<T = any>(res: Response): Promise<T> {
  return JSON.parse(await texto(res)) as T;
}

/** Cuerpo válido de reporte (tiempo_ms realista). */
export function cuerpoValido(colonia: number, extra: Record<string, unknown> = {}) {
  return { colonia_id: colonia, gravedad: 3, sintomas: [], hp: "", tiempo_ms: 15000, ...extra };
}

export async function filasReportes(colonia?: number) {
  const { rows } = await db.query(
    `SELECT * FROM reportes ${colonia ? "WHERE colonia_id = $1" : ""} ORDER BY id`,
    colonia ? [colonia] : [],
  );
  return rows;
}

/** Simula el paso de 2 min en los reportes existentes (para superar el mínimo de 30 s entre reenvíos de la misma huella). */
export async function envejecerReportes(): Promise<void> {
  await db.query(
    "UPDATE reportes SET creado_en = creado_en - interval '2 minutes', actualizado_en = actualizado_en - interval '2 minutes'",
  );
}
