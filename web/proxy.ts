import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cabeceras de seguridad para todas las respuestas (en Next 16 "middleware" se llama "proxy").
//
// CSP SIN nonce, a propósito: un nonce por petición obliga a renderizar TODAS las páginas de forma dinámica
// y rompe el HTML estático/prerenderizado (cacheComponents) que hace barato servir esto en una crisis.
// A cambio, script-src lleva 'unsafe-inline' (los scripts de arranque de Next son en línea). Lo que sí
// bloquea: scripts y estilos de otros orígenes, <object>, <base> ajeno, formularios hacia fuera, y que otro
// sitio nos meta en un iframe (salvo /embed). Si algún día se necesita CSP estricta, hay que pasar a nonce
// (ver docs de Next: guides/content-security-policy) y pagar el costo de renderizado dinámico.

/**
 * Orígenes de teselas, estilos, glifos y sprites del mapa base. Ajustable con CSP_MAPA_ORIGENES (separados por espacio).
 * `||` y no `??`: una variable definida pero vacía (docker-compose o un .env con `CSP_MAPA_ORIGENES=`) dejaría el mapa
 * sin ningún origen permitido.
 */
const MAPA_ORIGENES = (
  process.env.CSP_MAPA_ORIGENES ||
  "https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://tiles.openfreemap.org"
)
  .split(/\s+/)
  .filter(Boolean);

/** Quién puede incrustar /embed/* en un iframe. Por defecto cualquiera (medios, colectivos). */
const EMBED_ANCESTORS = process.env.CSP_EMBED_ANCESTORS || "*";

export function csp(pathname: string, dev = process.env.NODE_ENV !== "production"): string {
  const esEmbed = pathname === "/embed" || pathname.startsWith("/embed/");
  const mapa = MAPA_ORIGENES.join(" ");
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${mapa}`,
    "font-src 'self' data:",
    // MapLibre descarga estilo, teselas y glifos con fetch; en desarrollo también el websocket de HMR
    `connect-src 'self' ${mapa}${dev ? " ws: wss:" : ""}`,
    // MapLibre crea su Web Worker desde un blob
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${esEmbed ? EMBED_ANCESTORS : "'none'"}`,
  ];
  if (!dev) directivas.push("upgrade-insecure-requests");
  return directivas.join("; ");
}

/** El panel de moderación solo existe si ADMIN_TOKEN está configurado (mínimo 16 caracteres). */
const adminHabilitado = () => (process.env.ADMIN_TOKEN ?? "").length >= 16;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const esAdminPagina = pathname === "/admin" || pathname.startsWith("/admin/");
  // Deshabilitado: 404 real desde el proxy (la página se genera por streaming y ya no podría cambiar su estado)
  const res = esAdminPagina && !adminHabilitado()
    ? new NextResponse("No encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    : NextResponse.next();
  const h = res.headers;

  h.set("Content-Security-Policy", csp(pathname));
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // geolocation=(self): la página puede pedir ubicación; ningún iframe de terceros
  h.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    // Sin includeSubDomains ni preload: no se sabe aún en qué dominio vivirá. Subirlo cuando se defina.
    h.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (esAdminPagina || pathname.startsWith("/api/admin")) {
    h.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: [
    // Todo salvo estáticos de Next, imágenes optimizadas, favicon y los workers de MapLibre
    "/((?!_next/static|_next/image|favicon.ico|maplibre/).*)",
  ],
};
