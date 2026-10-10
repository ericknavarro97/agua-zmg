/**
 * Autenticación del panel de moderación. Sin ADMIN_TOKEN (o con uno corto) el admin queda DESHABILITADO:
 * no hay token por defecto. Dos vías: `Authorization: Bearer <ADMIN_TOKEN>` (curl/scripts) o la cookie de
 * sesión firmada que entrega POST /api/admin/sesion (HttpOnly, SameSite=Strict, 8 h).
 * Los intentos fallidos se limitan por red (tabla rate_limits) y todas las comparaciones son en tiempo constante.
 */
import { createHash, createHmac } from "node:crypto";
import { pool } from "@/lib/db";
import { diaLocal, identidades, igualesSeguro, ipCliente, origenPermitido } from "@/lib/fingerprint";
import { LIMITES, contar, leer } from "@/lib/ratelimit";

export const COOKIE_SESION = "agua_admin";
const SESION_SEG = 8 * 3600;
const VENTANA_FALLOS_SEG = 900;
const TOKEN_MIN = 16;

export function adminHabilitado(): boolean {
  return (process.env.ADMIN_TOKEN ?? "").length >= TOKEN_MIN;
}

/** Clave de sesión derivada del token: rotar ADMIN_TOKEN invalida todas las sesiones. */
const claveSesion = () => createHash("sha256").update("sesion|" + process.env.ADMIN_TOKEN).digest();
const firma = (exp: string) => createHmac("sha256", claveSesion()).update("admin|" + exp).digest("hex");

export function emitirSesion(ahoraMs = Date.now()): string {
  const exp = String(Math.floor(ahoraMs / 1000) + SESION_SEG);
  return `${exp}.${firma(exp)}`;
}

export function sesionValida(valor: string | undefined, ahoraMs = Date.now()): boolean {
  if (!adminHabilitado() || !valor) return false;
  const [exp, f] = valor.split(".");
  if (!exp || !f || !/^\d+$/.test(exp)) return false;
  if (!igualesSeguro(f, firma(exp))) return false;
  return Number(exp) * 1000 > ahoraMs;
}

export function cabeceraCookie(valor: string | null): string {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const base = `${COOKIE_SESION}=${valor ?? ""}; Path=/; HttpOnly; SameSite=Strict${seguro}`;
  return valor === null ? `${base}; Max-Age=0` : `${base}; Max-Age=${SESION_SEG}`;
}

function cookieDe(h: Headers): string | undefined {
  const c = h.get("cookie") ?? "";
  const m = c.split(/;\s*/).find((x) => x.startsWith(COOKIE_SESION + "="));
  return m?.slice(COOKIE_SESION.length + 1);
}

const claveFallos = (h: Headers) => {
  const id = identidades(ipCliente(h) ?? "0.0.0.0", "", diaLocal());
  return `adm:f:${id.redHash}`;
};

/** Cuenta un intento fallido de esta red. */
export async function registrarFallo(h: Headers): Promise<void> {
  await contar(pool, claveFallos(h), LIMITES.adminFallosVentana, VENTANA_FALLOS_SEG);
}

export async function bloqueado(h: Headers): Promise<boolean> {
  return (await leer(pool, claveFallos(h), VENTANA_FALLOS_SEG)) >= LIMITES.adminFallosVentana;
}

/** Compara un token candidato con ADMIN_TOKEN en tiempo constante. */
export function tokenCorrecto(candidato: string): boolean {
  return adminHabilitado() && igualesSeguro(candidato, process.env.ADMIN_TOKEN as string);
}

export type Auth = { ok: true; via: "cookie" | "bearer" } | { ok: false; respuesta: Response };

const sinCache = { "Cache-Control": "no-store" };
const err = (status: number, error: string) => ({
  ok: false as const,
  respuesta: Response.json({ error }, { status, headers: sinCache }),
});

/**
 * Verifica la petición del admin. Con cookie exige además mismo origen (anti-CSRF) en métodos que cambian estado.
 * La credencial correcta SIEMPRE pasa: el bloqueo por red solo frena a quien falla, y solo cuentan como fallo los
 * intentos con credencial presente e incorrecta. Si no, cualquiera de la misma /24 (o detrás de la misma
 * IP compartida) dejaría sin panel al moderador con peticiones anónimas. La fuerza bruta se frena porque
 * el token es largo (>= 16, ver README) y porque los fallos acumulados devuelven 429 sin más pistas.
 */
export async function autenticar(request: Request): Promise<Auth> {
  if (!adminHabilitado()) return err(404, "No encontrado"); // deshabilitado: no se anuncia
  const h = request.headers;

  const bearer = /^Bearer\s+(.+)$/i.exec(h.get("authorization") ?? "")?.[1];
  if (bearer && tokenCorrecto(bearer)) return { ok: true, via: "bearer" };

  const cookie = cookieDe(h);
  if (!bearer && sesionValida(cookie)) {
    if (request.method !== "GET" && request.method !== "HEAD" && origenPermitido(h) !== "web") {
      return err(403, "Origen no permitido");
    }
    return { ok: true, via: "cookie" };
  }

  // Sin credenciales (petición anónima): 401 sin contar. Con credencial incorrecta: cuenta y puede bloquear.
  if (!bearer && !cookie) return err(401, "No autorizado");
  if (await bloqueado(h)) return err(429, "Demasiados intentos. Intenta más tarde.");
  await registrarFallo(h);
  return err(401, "No autorizado");
}
