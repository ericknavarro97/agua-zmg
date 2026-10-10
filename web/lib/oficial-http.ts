import { createHash } from "node:crypto";
import { brotliCompress, constants, gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/** ETag fuerte a partir de un contenido (o de una versión + parámetros). */
export function etagDe(contenido: string | Uint8Array): string {
  return `"${createHash("sha1").update(contenido).digest("base64url").slice(0, 22)}"`;
}

/** ¿El If-None-Match del cliente coincide con este ETag? (acepta lista y prefijo débil W/) */
export function coincideEtag(req: Request, etag: string): boolean {
  const h = req.headers.get("if-none-match");
  if (!h) return false;
  return h.split(",").some((x) => {
    const v = x.trim().replace(/^W\//, "");
    return v === etag || v === "*";
  });
}

/** Las versiones comprimidas se guardan como promesa: peticiones simultáneas comparten un solo cálculo. */
export type CuerpoComprimido = { plano: Buffer; gzip?: Promise<Buffer>; br?: Promise<Buffer> };

/** Elige la mejor codificación que acepta el cliente y comprime una sola vez (se reutiliza de la caché). */
export async function responderComprimido(
  req: Request,
  cuerpo: CuerpoComprimido,
  headers: Record<string, string>,
): Promise<Response> {
  const acepta = req.headers.get("accept-encoding") ?? "";
  const h = new Headers({ ...headers, Vary: "Accept-Encoding" });
  let datos = cuerpo.plano;
  // Por debajo de ~1 KB comprimir no compensa
  if (cuerpo.plano.length > 1024) {
    if (/\bbr\b/.test(acepta)) {
      // Calidad 9: casi igual de pequeño que 11 pero ~5x más rápido de calcular
      cuerpo.br ??= brotliAsync(cuerpo.plano, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
      datos = await cuerpo.br;
      h.set("Content-Encoding", "br");
    } else if (/\bgzip\b/.test(acepta)) {
      cuerpo.gzip ??= gzipAsync(cuerpo.plano, { level: 9 });
      datos = await cuerpo.gzip;
      h.set("Content-Encoding", "gzip");
    }
  }
  h.set("Content-Length", String(datos.length));
  return new Response(new Uint8Array(datos), { status: 200, headers: h });
}

/** JSON con ETag y 304 si el cliente ya lo tiene. */
export function jsonConEtag(req: Request, datos: unknown, cacheControl: string, status = 200): Response {
  const cuerpo = JSON.stringify(datos);
  const etag = etagDe(cuerpo);
  const base = { ETag: etag, "Cache-Control": cacheControl };
  if (status === 200 && coincideEtag(req, etag)) return new Response(null, { status: 304, headers: base });
  return new Response(cuerpo, { status, headers: { ...base, "Content-Type": "application/json; charset=utf-8" } });
}
