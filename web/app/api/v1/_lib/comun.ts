// Importaciones relativas (no "@/…") para que vitest las resuelva sin configuración de alias.
import { municipioCanonico, normalizarTexto } from "../../../../lib/oficial-normalizar";
import { coincideEtag, etagDe, responderComprimido, type CuerpoComprimido } from "../../../../lib/oficial-http";
import { METODO } from "../../../../lib/aggregation";

// Utilidades compartidas de la API pública /api/v1: CORS, caché, licencia y una
// memoria de corta vida para que un pico de tráfico (o ?x=1,2,3 para saltarse el CDN)
// no se traduzca en una consulta a la base por cada petición.

/** Licencia de los DATOS de la API. Se confirma definiendo DATOS_LICENCIA_NOMBRE (y DATOS_LICENCIA_URL). */
export const LICENCIA = {
  // `||` y no `??`: docker-compose pasa las variables sin definir como cadena vacía
  nombre: process.env.DATOS_LICENCIA_NOMBRE || "ODbL-1.0",
  url: process.env.DATOS_LICENCIA_URL || "https://opendatacommons.org/licenses/odbl/1-0/",
  // Mientras no se defina DATOS_LICENCIA_NOMBRE, la licencia se declara «provisional»
  estado: process.env.DATOS_LICENCIA_NOMBRE ? "confirmada" : "provisional",
} as const;

export const ATRIBUCION =
  "Agua ZMG, mapa ciudadano de la calidad del agua en la ZMG (reportes de vecinos). " +
  "Límites de colonias: aproximados, derivados del catálogo de colonias del INE (corte dic-2020), no oficiales.";

export const AVISO =
  "Reportes ciudadanos sin verificar: reflejan percepción, no mediciones de laboratorio. " +
  "No es información oficial ni consejo médico. Sin reportes no significa que el agua sea buena.";

export function metadatos(extra: Record<string, unknown> = {}) {
  return {
    version_api: "v1",
    // Versión del método de cálculo: dentro de v1 cambió el rango de nivel (0-4) y el formato de `ultimo` (día);
    // con esto un cliente puede detectar el método que produjo los datos (docs/API.md, «Cambios del contrato»)
    metodo: METODO,
    generado: new Date().toISOString(),
    licencia: LICENCIA,
    atribucion: ATRIBUCION,
    aviso: AVISO,
    ...extra,
  };
}

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "Link, X-Licencia, X-Atribucion, ETag",
};

/** 1 min en el navegador, 5 min en el CDN; si la base cae, el CDN sirve lo último hasta 1 h. */
export const CACHE_PUBLICO =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600";

export function cabecerasPublicas(contentType: string): Record<string, string> {
  return {
    ...CORS,
    "Content-Type": contentType,
    "Cache-Control": CACHE_PUBLICO,
    Link: `<${LICENCIA.url}>; rel="license"`,
    "X-Licencia": LICENCIA.nombre,
    // Los encabezados HTTP solo admiten Latin-1: la atribución completa va en el cuerpo
    "X-Atribucion": "Agua ZMG (agua-zmg), reportes ciudadanos",
    "X-Content-Type-Options": "nosniff",
  };
}

export function opciones(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export function error(status: number, mensaje: string): Response {
  return Response.json(
    { error: mensaje },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

/**
 * Lee ?municipio=. Acepta el nombre oficial o variantes ("Tlaquepaque", "Tonala"...). Devuelve:
 * `undefined` si no viene, `null` si no se reconoce (responder 400) o el nombre normalizado para filtrar.
 * Validar contra la lista de municipios mantiene acotado el número de variantes que se guardan en memoria.
 */
export function leerMunicipio(url: URL): string | null | undefined {
  const crudo = url.searchParams.get("municipio")?.trim();
  if (!crudo) return undefined;
  const canon = municipioCanonico(crudo);
  return canon ? normalizarTexto(canon) : null;
}

/** Interpreta ?clave=1|true|si como booleano. */
export function bandera(url: URL, clave: string): boolean {
  const v = url.searchParams.get(clave)?.toLowerCase();
  return v === "1" || v === "true" || v === "si" || v === "sí";
}

// ---- Memoria de corta vida (por proceso) ----------------------------------------------------

type Entrada<T> = { valor: T; en: number };
const MAX_VIEJO_MS = 60 * 60 * 1000; // si la base falla, se sirve lo último hasta 1 h

/**
 * Crea una memoria con capacidad `max`. `memorizar(clave, ttlMs, calcular)` devuelve el valor guardado si
 * tiene menos de `ttlMs`; si no, lo recalcula (una sola vez aunque lleguen muchas peticiones a la vez).
 * Si recalcular falla y hay un valor de hasta 1 h, lo devuelve en vez de propagar el error
 * ("stale-if-error" también dentro del proceso).
 */
export function crearMemoria(max: number) {
  const memoria = new Map<string, Entrada<unknown>>();
  const enVuelo = new Map<string, Promise<unknown>>();
  return async function memorizar<T>(clave: string, ttlMs: number, calcular: () => Promise<T>): Promise<T> {
    const e = memoria.get(clave) as Entrada<T> | undefined;
    if (e && Date.now() - e.en < ttlMs) return e.valor;
    const previa = enVuelo.get(clave) as Promise<T> | undefined;
    if (previa) return previa;
    const p = calcular()
      .then((valor) => {
        memoria.delete(clave);
        if (memoria.size >= max) memoria.delete(memoria.keys().next().value as string);
        memoria.set(clave, { valor, en: Date.now() });
        return valor;
      })
      .catch((err) => {
        if (e && Date.now() - e.en < MAX_VIEJO_MS) return e.valor;
        throw err;
      })
      .finally(() => enVuelo.delete(clave));
    enVuelo.set(clave, p);
    return p;
  };
}

/** Datos base (listas ya consultadas a la base): pocas combinaciones. */
export const memorizar = crearMemoria(16);
const memorizarCuerpo = crearMemoria(12);

type CuerpoPublico = CuerpoComprimido & { etag: string };

/**
 * Respuesta pública pesada (GeoJSON, CSV): el cuerpo, su ETag y sus versiones br/gzip se calculan UNA vez por
 * minuto y por combinación de parámetros; el resto de peticiones reutiliza todo. `If-None-Match` -> 304.
 */
export async function responderPublico(
  request: Request,
  clave: string,
  contentType: string,
  construir: () => Promise<string>,
  extra: Record<string, string> = {},
): Promise<Response> {
  const c = await memorizarCuerpo<CuerpoPublico>(clave, 60_000, async () => {
    const plano = Buffer.from(await construir(), "utf8");
    return { plano, etag: etagDe(plano) };
  });
  if (coincideEtag(request, c.etag)) {
    return new Response(null, { status: 304, headers: { ...CORS, ETag: c.etag, "Cache-Control": CACHE_PUBLICO } });
  }
  return responderComprimido(request, c, { ...cabecerasPublicas(contentType), ETag: c.etag, ...extra });
}
