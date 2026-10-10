/**
 * Identidades anónimas y endurecimiento de la petición.
 * Regla: la IP y el User-Agent completo solo existen en memoria durante la petición;
 * a la base solo llegan HMAC con clave derivada de HASH_SALT (que vive fuera de la base).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

const SALT_DEV = "dev-solo-local-no-usar-en-produccion-0000";
const SALTS_PROHIBIDAS = new Set(["dev-salt", "cambia-esto", "changeme", "secret"]);

/** ¿Es un valor de ejemplo o de desarrollo (público en el repo)? Con él los HMAC se invertirían por fuerza bruta. */
export function saltDeEjemplo(s: string): boolean {
  const t = s.trim().toLowerCase();
  return SALTS_PROHIBIDAS.has(t) || t.startsWith("cambia-esto") || t.startsWith("dev-solo-local") || /^(.)\1+$/.test(t);
}

/** ¿La configuración obligatoria para guardar reportes es válida? (/api/salud la usa para no dar "ok" en falso). */
export function configuracionValida(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const s = process.env.HASH_SALT;
  return !!s && s.length >= 32 && !saltDeEjemplo(s);
}

/** Secreto maestro. En producción es obligatorio (>= 32 caracteres); en desarrollo hay un valor local. */
function secreto(): string {
  const s = process.env.HASH_SALT;
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < 32 || saltDeEjemplo(s)) {
      throw new Error("HASH_SALT es obligatorio en producción (>= 32 caracteres aleatorios; no uses el valor de ejemplo)");
    }
    return s;
  }
  return s && !saltDeEjemplo(s) ? s : SALT_DEV;
}

const hmac = (clave: string, dato: string) => createHmac("sha256", clave).update(dato).digest("hex");

/** Día calendario en hora de Guadalajara (la huella rota a medianoche local, no a las 18:00). */
export function diaLocal(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(ahora); // YYYY-MM-DD
}

/** Semana ISO ("YYYY-Www") de un día YYYY-MM-DD. */
export function semanaIso(dia: string): string {
  const d = new Date(dia + "T00:00:00Z");
  const jueves = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
  const ini = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 1));
  const sem = Math.floor((jueves.getTime() - ini.getTime()) / 86400000 / 7) + 1;
  return `${jueves.getUTCFullYear()}-W${String(sem).padStart(2, "0")}`;
}

/**
 * IP del cliente contando DESDE LA DERECHA de x-forwarded-for: lo que escribe el cliente queda a la
 * izquierda y se ignora. TRUSTED_PROXY_HOPS = proxies de confianza delante de la app (Vercel: 1).
 * Devuelve null si no hay una IP válida (los reportes sin IP comparten una sola "red": falla cerrada).
 */
export function ipCliente(h: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  const xs = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const n = Number.isInteger(hops) && hops >= 1 ? hops : 1;
  const ip = xs[xs.length - n];
  return ip && (isIPv4(ip) || isIPv6(ip)) ? ip : null;
}

function v6ABigInt(ip: string): bigint {
  let s = ip.split("%")[0];
  if (s.includes(".")) {
    // ::ffff:1.2.3.4 y similares
    const i = s.lastIndexOf(":");
    const q = s.slice(i + 1).split(".").map(Number);
    s = s.slice(0, i + 1) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const [a, b] = s.split("::");
  const ga = a ? a.split(":") : [];
  const gb = b ? b.split(":") : [];
  const g = b === undefined ? ga : [...ga, ...Array(8 - ga.length - gb.length).fill("0"), ...gb];
  return g.reduce((acc, x) => (acc << BigInt(16)) | BigInt(parseInt(x || "0", 16)), BigInt(0));
}

/** `individual`: IPv4 completa o /64 de IPv6; `red`: /24 de IPv4 o /48 de IPv6. */
export function prefijos(ip: string): { individual: string; red: string } {
  if (isIPv6(ip)) {
    const n = v6ABigInt(ip);
    if (n >> BigInt(32) === BigInt(0xffff)) {
      // ::ffff:a.b.c.d es IPv4
      return prefijos([24, 16, 8, 0].map((s) => Number((n >> BigInt(s)) & BigInt(0xff))).join("."));
    }
    return { individual: "v6/64:" + (n >> BigInt(64)).toString(16), red: "v6/48:" + (n >> BigInt(80)).toString(16) };
  }
  const o = ip.split(".");
  return { individual: "v4:" + ip, red: "v4/24:" + o.slice(0, 3).join(".") };
}

/** Familia gruesa de navegador+SO: muy poca entropía, no identifica a nadie. */
export function uaFamilia(ua: string): string {
  const so = /iPhone|iPad|iOS/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows"
    : /Mac OS X|Macintosh/i.test(ua) ? "mac" : /Linux/i.test(ua) ? "linux" : "otro";
  const nav = /Edg\//.test(ua) ? "edge" : /Firefox\/|FxiOS/.test(ua) ? "firefox" : /SamsungBrowser/.test(ua) ? "samsung"
    : /(Chrome|CriOS)\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "otro";
  return `${nav}-${so}`;
}

export type Identidades = {
  /** Un reporte por colonia/día; tope por persona/dispositivo. */
  huella: string;
  /** Mismo origen de red ESE día (para ráfagas y topes diarios). */
  redHash: string;
  /** Mismo origen de red durante la semana ISO (frena ataques lentos). */
  redSem: string;
  uaFamilia: string;
};

/** HMAC con clave del día / de la semana derivada del secreto: no hay sales guardadas en la base. */
export function identidades(ip: string, ua: string, dia: string): Identidades {
  const kDia = hmac(secreto(), "dia:" + dia);
  const kSem = hmac(secreto(), "sem:" + semanaIso(dia));
  const p = prefijos(ip);
  return {
    huella: hmac(kDia, `h|${p.individual}|${ua}`),
    redHash: hmac(kDia, `r|${p.red}`).slice(0, 32),
    redSem: hmac(kSem, `r|${p.red}`).slice(0, 32),
    uaFamilia: uaFamilia(ua),
  };
}

/** HMAC diario del comentario normalizado (detecta copiar/pegar sin guardar nada extra). */
export function hashComentario(texto: string, dia: string): string {
  const k = hmac(secreto(), "dia:" + dia);
  return hmac(k, "c|" + texto.toLowerCase().replace(/\s+/g, " ").trim()).slice(0, 32);
}

/**
 * Huella diaria anónima (compatibilidad con el nombre anterior): ahora es HMAC con clave del día y la IP
 * se reduce a /32 (IPv4) o /64 (IPv6). No es reversible sin HASH_SALT.
 */
export function huellaDiaria(ip: string, userAgent: string, dia: string): string {
  return identidades(ip, userAgent, dia).huella;
}

/** Hosts desde los que se acepta el formulario: ORIGENES_PERMITIDOS (coma) + el host de la propia petición. */
function hostsPermitidos(h: Headers): string[] {
  const extra = (process.env.ORIGENES_PERMITIDOS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter(Boolean);
  const propios = [h.get("host"), h.get("x-forwarded-host")].filter((x): x is string => !!x);
  return [...extra, ...propios];
}

/**
 * Defensa contra envíos desde OTRO sitio web (CSRF / "drive-by"). Devuelve el canal, o null si hay que rechazar.
 * Sec-Fetch-Site lo pone el navegador y el JS de una página no lo puede alterar.
 * LÍMITE: no frena a un script (curl escribe las cabeceras que quiera); no se vende como anti-bot.
 */
export function origenPermitido(h: Headers): "web" | "sin_cabeceras" | null {
  const sfs = h.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin") return null; // cross-site, same-site o none: no es nuestro formulario
  const origin = h.get("origin");
  if (origin) {
    try {
      return hostsPermitidos(h).includes(new URL(origin).host) ? "web" : null;
    } catch {
      return null; // incluye "Origin: null"
    }
  }
  return sfs === "same-origin" ? "web" : "sin_cabeceras"; // sin Origin ni Sec-Fetch: no es un navegador moderno
}

/** Lee el cuerpo como texto sin pasar de `max` bytes (no se fía de Content-Length). null = demasiado grande. */
export async function leerCuerpoAcotado(request: Request, max: number): Promise<string | null> {
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > max) return null;
  if (!request.body) return "";
  const lector = request.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => {});
      return null;
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString("utf8");
}

/** Comparación de secretos en tiempo constante (se comparan los SHA-256 para no filtrar la longitud). */
export function igualesSeguro(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}
