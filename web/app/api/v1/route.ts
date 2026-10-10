import { cabecerasPublicas, metadatos, opciones } from "./_lib/comun";

// GET /api/v1  ->  índice de la API pública (qué hay, licencia, dónde está la documentación)
export async function GET(request: Request) {
  // Detrás de un proxy (o en Docker) request.url trae el host interno (p. ej. 0.0.0.0:3000):
  // se prefiere la URL pública configurada y, si no, las cabeceras que manda el proxy.
  const h = request.headers;
  // Las cabeceras vienen del cliente: solo se aceptan con forma de host y de http/https, para que no se
  // cuelen enlaces tipo "javascript://…" en una respuesta cacheable.
  const hostBruto = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const host = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(hostBruto) ? hostBruto : null;
  const protoBruto = h.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const proto = protoBruto === "http" || protoBruto === "https" ? protoBruto : new URL(request.url).protocol.replace(":", "");
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : new URL(request.url).origin)).replace(/\/+$/, "");
  const cuerpo = {
    nombre: "API pública de Agua ZMG",
    endpoints: {
      colonias: `${base}/api/v1/colonias`,
      colonia: `${base}/api/v1/colonias/{id}`,
      resumen_csv: `${base}/api/v1/resumen.csv`,
      especificacion_openapi: `${base}/openapi.json`,
    },
    metadata: metadatos(),
  };
  const cabeceras = cabecerasPublicas("application/json; charset=utf-8");
  // Sin URL pública fija la respuesta depende de la cabecera Host del cliente: que la caché no la mezcle
  if (!process.env.NEXT_PUBLIC_SITE_URL) cabeceras.Vary = "Host, X-Forwarded-Host, X-Forwarded-Proto";
  return new Response(JSON.stringify(cuerpo), { headers: cabeceras });
}

export function OPTIONS() {
  return opciones();
}
