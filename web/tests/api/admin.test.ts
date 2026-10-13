import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/moderacion/route";
import { DELETE as cerrarSesion, POST as abrirSesion } from "@/app/api/admin/sesion/route";
import { COOKIE_SESION, emitirSesion } from "@/app/api/admin/auth";
import { GET as scores } from "@/app/api/colonias/scores/route";
import { invalidarCacheScores } from "@/lib/aggregation";
import { LIMITES } from "@/lib/ratelimit";
import { crearColonia, db, get, ipNueva, json, post, reiniciar, sembrar, sembrarVecinos, texto } from "./helpers";

const TOKEN = "token-admin-de-pruebas-0123456789";

function pedir(metodo: "GET" | "POST", ruta: string, o: { cuerpo?: unknown; headers?: Record<string, string | null>; ip?: string } = {}) {
  const h: Record<string, string | null> = { "x-forwarded-for": o.ip ?? ipNueva(), ...o.headers };
  if (metodo === "GET") {
    const hh = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== null)) as Record<string, string>;
    return get(ruta, hh);
  }
  return post(ruta, o.cuerpo, { ip: h["x-forwarded-for"] ?? undefined, headers: h });
}
const bearer = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

beforeEach(reiniciar);
afterEach(() => vi.unstubAllEnvs());

describe("admin deshabilitado (sin ADMIN_TOKEN o demasiado corto)", () => {
  it.each([["sin definir", ""], ["token corto (15)", "a".repeat(15)]])("404 en todos los endpoints: %s", async (_n, token) => {
    vi.stubEnv("ADMIN_TOKEN", token);
    const g = await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer(token || "x") }));
    expect(g.status).toBe(404);
    const p = await POST(pedir("POST", "/api/admin/moderacion", { cuerpo: { accion: "ocultar", ids: [1], motivo: "motivo largo ok" }, headers: bearer(token || "x") }));
    expect(p.status).toBe(404);
    const s = await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: { token: token || "x" } }));
    expect(s.status).toBe(404);
    expect(s.headers.get("set-cookie")).toBeNull();
  });

  it("no se puede entrar con una cookie fabricada cuando está deshabilitado", async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    const cookie = `${COOKIE_SESION}=${emitirSesion()}`;
    vi.stubEnv("ADMIN_TOKEN", "");
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { cookie } }))).status).toBe(404);
  });

  it("no hay token por defecto: ni vacío, ni 'admin', ni 'changeme' abren nada", async () => {
    for (const t of ["", "admin", "changeme", "undefined", "null"]) {
      const res = await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer(t || "x") }));
      expect(res.status).toBe(404);
    }
  });
});

describe("admin habilitado: autenticación", () => {
  beforeEach(() => vi.stubEnv("ADMIN_TOKEN", TOKEN));

  it("sin credenciales: 401 y sin datos", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3, estado: "revision", comentario: "NO-DEBE-SALIR" });
    const res = await GET(pedir("GET", "/api/admin/moderacion"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await texto(res)).not.toContain("NO-DEBE-SALIR");
  });

  it("token incorrecto: 401; correcto: 200 con resumen, cola y bitácora", async () => {
    const ip = ipNueva();
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer("incorrecto-incorrecto") }))).status).toBe(401);
    const ok = await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer() }));
    expect(ok.status).toBe(200);
    const d = await json(ok);
    expect(Object.keys(d).sort()).toEqual(["bitacora", "cola", "resumen"]);
    expect(ok.headers.get("cache-control")).toBe("no-store");
  });

  it("el esquema 'bearer' no distingue mayúsculas; otros esquemas y el token en la URL NO sirven", async () => {
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { authorization: `bearer ${TOKEN}` } }))).status).toBe(200);
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { authorization: `Basic ${TOKEN}` } }))).status).toBe(401);
    expect((await GET(pedir("GET", `/api/admin/moderacion?token=${TOKEN}`))).status).toBe(401);
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { authorization: TOKEN } }))).status).toBe(401);
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { "x-admin-token": TOKEN } }))).status).toBe(401);
  });

  it("un prefijo o una variante del token no sirve", async () => {
    for (const t of [TOKEN.slice(0, -1), TOKEN + "x", TOKEN.toUpperCase()]) {
      expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer(t) }))).status, t).toBe(401);
    }
  });

  it(`tras ${LIMITES.adminFallosVentana} intentos fallidos la red recibe 429 al fallar, pero la credencial correcta sigue entrando; otra red no se afecta`, async () => {
    const ip = ipNueva();
    for (let i = 0; i < LIMITES.adminFallosVentana; i++) {
      expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer("mal-" + i) }))).status).toBe(401);
    }
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer("mal-otra-vez") }))).status).toBe(429);
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer() }))).status).toBe(200);
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { ip, cuerpo: { token: TOKEN } }))).status).toBe(200);
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { ip, cuerpo: { token: "mal-mal-mal-mal-mal" } }))).status).toBe(429);
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer() }))).status).toBe(200);
  });

  it("las peticiones anónimas NO cuentan: no se puede dejar sin panel al moderador de la misma red con GET sin credenciales", async () => {
    const ip = ipNueva();
    const sesion = await abrirSesion(pedir("POST", "/api/admin/sesion", { ip, cuerpo: { token: TOKEN } }));
    const cookie = sesion.headers.get("set-cookie")!.split(";")[0];
    for (let i = 0; i < LIMITES.adminFallosVentana * 3; i++) {
      expect((await GET(pedir("GET", "/api/admin/moderacion", { ip }))).status).toBe(401);
    }
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer() }))).status).toBe(200);
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: { cookie } }))).status).toBe(200);
    // y quien falla de verdad sigue recibiendo 401 (no 429): lo anónimo no gastó el cupo de la red
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer("mal-mal-mal-mal-mal") }))).status).toBe(401);
  });

  it("la cookie válida sigue entrando aunque la red esté bloqueada por intentos fallidos ajenos", async () => {
    const ip = ipNueva();
    const sesion = await abrirSesion(pedir("POST", "/api/admin/sesion", { ip, cuerpo: { token: TOKEN } }));
    const cookie = sesion.headers.get("set-cookie")!.split(";")[0];
    for (let i = 0; i < LIMITES.adminFallosVentana; i++) await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer("mal-" + i) }));
    expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: { cookie } }))).status).toBe(200);
  });

  it("un acierto no reinicia el bloqueo de otra red ni gasta cupo", async () => {
    const ip = ipNueva();
    for (let i = 0; i < 20; i++) expect((await GET(pedir("GET", "/api/admin/moderacion", { ip, headers: bearer() }))).status).toBe(200);
  });
});

describe("admin: sesión por cookie", () => {
  beforeEach(() => vi.stubEnv("ADMIN_TOKEN", TOKEN));

  const iniciar = async (ip = ipNueva()) => {
    const res = await abrirSesion(pedir("POST", "/api/admin/sesion", { ip, cuerpo: { token: TOKEN } }));
    const set = res.headers.get("set-cookie")!;
    return { res, set, cookie: set.split(";")[0], ip };
  };

  it("el token correcto entrega una cookie HttpOnly, SameSite=Strict, de 8 h, sin exponer el token", async () => {
    const { res, set } = await iniciar();
    expect(res.status).toBe(200);
    expect(set).toMatch(new RegExp(`^${COOKIE_SESION}=\\d+\\.[0-9a-f]{64};`));
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).toMatch(/Max-Age=28800/);
    expect(set).not.toContain(TOKEN);
    expect(await texto(res)).not.toContain(TOKEN);
  });

  it("en producción la cookie lleva Secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await iniciar()).set).toMatch(/; Secure/);
  });

  it("token incorrecto: 401 sin cookie; cuerpo inválido: 400; sin JSON: 415", async () => {
    const mal = await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: { token: "mal-mal-mal-mal-mal" } }));
    expect(mal.status).toBe(401);
    expect(mal.headers.get("set-cookie")).toBeNull();
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: {} }))).status).toBe(400);
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: { token: 123 } }))).status).toBe(400);
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: null }))).status).toBe(400);
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: { token: "x" }, headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect((await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: { token: "x".repeat(5000) } }))).status).toBe(400);
  });

  it("iniciar sesión desde otro origen: 403", async () => {
    const res = await abrirSesion(pedir("POST", "/api/admin/sesion", { cuerpo: { token: TOKEN }, headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("con la cookie se puede leer (GET) sin cabecera Authorization", async () => {
    const { cookie } = await iniciar();
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { cookie } }))).status).toBe(200);
  });

  it("cookie manipulada, vencida, de otro token o malformada: 401", async () => {
    const { cookie } = await iniciar();
    const valor = cookie.slice(COOKIE_SESION.length + 1);
    const [exp, firma] = valor.split(".");
    const malas = [
      `${COOKIE_SESION}=${Number(exp) + 99999}.${firma}`, // cambia la expiración, misma firma
      `${COOKIE_SESION}=${exp}.${"0".repeat(64)}`,
      `${COOKIE_SESION}=${emitirSesion(Date.now() - 9 * 3600 * 1000)}`, // emitida hace 9 h: vencida
      `${COOKIE_SESION}=basura`,
      `${COOKIE_SESION}=.`,
      `${COOKIE_SESION}=`,
      `${COOKIE_SESION}=${exp}`,
    ];
    for (const c of malas) expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { cookie: c } }))).status, c).toBe(401);
  });

  it("rotar ADMIN_TOKEN invalida todas las sesiones abiertas", async () => {
    const { cookie } = await iniciar();
    vi.stubEnv("ADMIN_TOKEN", "otro-token-distinto-0123456789ab");
    expect((await GET(pedir("GET", "/api/admin/moderacion", { headers: { cookie } }))).status).toBe(401);
  });

  it("con cookie, las acciones que cambian estado exigen mismo origen (anti-CSRF)", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3, estado: "revision" });
    const { rows } = await db.query("SELECT id FROM reportes");
    const cuerpo = { accion: "ocultar", ids: [Number(rows[0].id)], motivo: "reporte de prueba falso" };
    const { cookie } = await iniciar();
    const sinOrigen = await POST(pedir("POST", "/api/admin/moderacion", { cuerpo, headers: { cookie } }));
    expect(sinOrigen.status).toBe(403);
    const ajeno = await POST(pedir("POST", "/api/admin/moderacion", { cuerpo, headers: { cookie, origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(ajeno.status).toBe(403);
    expect((await db.query("SELECT estado FROM reportes")).rows[0].estado).toBe("revision");
    const propio = await POST(pedir("POST", "/api/admin/moderacion", { cuerpo, headers: { cookie, host: "agua.test", origin: "https://agua.test", "sec-fetch-site": "same-origin" } }));
    expect(propio.status).toBe(200);
    expect((await db.query("SELECT estado FROM reportes")).rows[0].estado).toBe("oculto");
  });

  it("DELETE /sesion borra la cookie; desde otro origen: 403", async () => {
    const ok = await cerrarSesion(new Request("http://localhost:3201/api/admin/sesion", { method: "DELETE" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    const mal = await cerrarSesion(new Request("http://localhost:3201/api/admin/sesion", { method: "DELETE", headers: { origin: "https://evil.example" } }));
    expect(mal.status).toBe(403);
  });
});

describe("admin: moderación", () => {
  beforeEach(() => vi.stubEnv("ADMIN_TOKEN", TOKEN));
  const ids = async () => (await db.query("SELECT id FROM reportes ORDER BY id")).rows.map((r) => Number(r.id));
  const mod = (cuerpo: unknown, extra: Record<string, string | null> = {}) =>
    POST(pedir("POST", "/api/admin/moderacion", { cuerpo, headers: { ...bearer(), ...extra } }));
  const lista = async () => {
    invalidarCacheScores();
    return json<{ id: number; score: number }[]>(await scores());
  };

  it("la cola de revisión lista lo que está en 'revision', con el comentario y SIN huellas ni redes", async () => {
    const col = await crearColonia({ nombre: "Del Fresno" });
    await sembrar({ colonia: col, gravedad: 4, estado: "revision", comentario: "texto del vecino", huella: "HUELLA-SECRETA", red: "RED-SECRETA" });
    await sembrar({ colonia: col, gravedad: 2 });
    const res = await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer() }));
    const txt = await texto(res);
    const d = JSON.parse(txt);
    expect(d.cola).toHaveLength(1);
    expect(d.cola[0]).toMatchObject({ colonia: "Del Fresno", gravedad: 4, estado: "revision", comentario: "texto del vecino" });
    expect(txt).not.toMatch(/SECRETA|huella|red_hash|red_sem/);
    expect(d.resumen.por_estado).toEqual({ revision: 1, visible: 1 });
  });

  it("borrar_comentario deja el reporte contando pero sin texto, y queda en la bitácora sin copiar el comentario", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3, comentario: "Juan Pérez vive en Hidalgo 123" });
    const id = (await ids())[0];
    const r = await mod({ accion: "borrar_comentario", ids: [id], motivo: "menciona a una persona y su calle", alias: "marta" });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ cambiados: 1 });
    const fila = (await db.query("SELECT comentario, comentario_hash, estado, gravedad FROM reportes WHERE id = $1", [id])).rows[0];
    expect(fila).toMatchObject({ comentario: null, comentario_hash: null, estado: "visible", gravedad: 3 });
    const log = (await db.query("SELECT actor, accion, regla, motivo, colonia_id FROM moderacion_log")).rows;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: "mod:marta", accion: "nota", regla: "borrar_comentario", colonia_id: col });
    expect(JSON.stringify(log)).not.toMatch(/Juan|Hidalgo/);
    // idempotente: sin comentario no cambia nada ni ensucia la bitácora
    expect(await json(await mod({ accion: "borrar_comentario", ids: [id], motivo: "menciona a una persona y su calle" }))).toEqual({ cambiados: 0 });
    expect((await db.query("SELECT count(*)::int AS n FROM moderacion_log")).rows[0].n).toBe(1);
  });

  it("ocultar saca los reportes del score, restaurar los devuelve, y todo queda en la bitácora", async () => {
    const col = await crearColonia();
    await sembrarVecinos(col, 3, 4, { dias: 2 });
    expect((await lista()).map((s) => s.id)).toContain(col);
    const todos = await ids();

    const o = await mod({ accion: "ocultar", ids: todos.slice(0, 4), motivo: "reportes copiados entre sí", alias: "marta" });
    expect(o.status).toBe(200);
    expect(await json(o)).toEqual({ cambiados: 4 });
    expect((await lista()).map((s) => s.id)).not.toContain(col); // no queda ningún reporte visible: ya no se publica

    const antes = (await db.query("SELECT count(*)::int AS n FROM moderacion_log")).rows[0].n;
    const r = await mod({ accion: "restaurar", ids: todos.slice(0, 4), motivo: "se revisó y eran vecinos reales", alias: "marta" });
    expect(await json(r)).toEqual({ cambiados: 4 });
    expect((await lista()).map((s) => s.id)).toContain(col);

    const bit = (await json(await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer() })))).bitacora;
    expect(bit.slice(0, 2).map((b: { accion: string }) => b.accion)).toEqual(["restaurar", "ocultar"]);
    expect(bit[0]).toMatchObject({ actor: "mod:marta", n_reportes: 4, colonia_id: col, motivo: "se revisó y eran vecinos reales" });
    expect((await db.query("SELECT count(*)::int AS n FROM moderacion_log")).rows[0].n).toBe(antes + 1);
  });

  it("sin alias queda como 'mod:admin'", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3 });
    await mod({ accion: "degradar", ids: await ids(), motivo: "revisar este reporte" });
    expect((await db.query("SELECT actor FROM moderacion_log ORDER BY id DESC LIMIT 1")).rows[0].actor).toBe("mod:admin");
    expect((await db.query("SELECT estado FROM reportes")).rows[0].estado).toBe("revision");
  });

  it("acciones sin efecto (p. ej. ocultar algo ya oculto o ids inexistentes) devuelven cambiados=0 y no ensucian la bitácora", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3, estado: "oculto" });
    const antes = (await db.query("SELECT count(*)::int AS n FROM moderacion_log")).rows[0].n;
    expect(await json(await mod({ accion: "ocultar", ids: await ids(), motivo: "ya estaba oculto ok" }))).toEqual({ cambiados: 0 });
    expect(await json(await mod({ accion: "ocultar", ids: [987654], motivo: "id que no existe ok" }))).toEqual({ cambiados: 0 });
    expect((await db.query("SELECT count(*)::int AS n FROM moderacion_log")).rows[0].n).toBe(antes);
  });

  it("la bitácora es de solo agregado: ni UPDATE ni DELETE ni TRUNCATE", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3 });
    await mod({ accion: "ocultar", ids: await ids(), motivo: "para tener una fila" });
    await expect(db.query("UPDATE moderacion_log SET motivo = 'cambiado por alguien'")).rejects.toThrow(/solo de agregado/);
    await expect(db.query("DELETE FROM moderacion_log")).rejects.toThrow(/solo de agregado/);
    await expect(db.query("TRUNCATE moderacion_log")).rejects.toThrow(/solo de agregado/);
  });

  const invalidos: [string, unknown][] = [
    ["acción desconocida", { accion: "borrar", ids: [1], motivo: "motivo suficiente" }],
    ["sin ids", { accion: "ocultar", ids: [], motivo: "motivo suficiente" }],
    ["ids no numéricos", { accion: "ocultar", ids: ["1"], motivo: "motivo suficiente" }],
    ["ids negativos", { accion: "ocultar", ids: [-1], motivo: "motivo suficiente" }],
    ["más de 500 ids", { accion: "ocultar", ids: Array.from({ length: 501 }, (_, i) => i + 1), motivo: "motivo suficiente" }],
    ["motivo corto (< 10)", { accion: "ocultar", ids: [1], motivo: "corto" }],
    ["motivo vacío", { accion: "ocultar", ids: [1], motivo: "          " }],
    ["motivo largo (> 200)", { accion: "ocultar", ids: [1], motivo: "a".repeat(201) }],
    ["alias con espacios", { accion: "ocultar", ids: [1], motivo: "motivo suficiente", alias: "dos palabras" }],
    ["alias con caracteres peligrosos", { accion: "ocultar", ids: [1], motivo: "motivo suficiente", alias: "x'; DROP TABLE reportes;--" }],
    ["alias de más de 30", { accion: "ocultar", ids: [1], motivo: "motivo suficiente", alias: "a".repeat(31) }],
    ["sin cuerpo", null],
  ];
  it.each(invalidos)("400: %s", async (_n, cuerpo) => {
    const res = await mod(cuerpo);
    expect(res.status).toBe(400);
  });

  it("415 si el Content-Type no es JSON; 400 si el JSON está roto", async () => {
    expect((await mod({ accion: "ocultar", ids: [1], motivo: "motivo suficiente" }, { "content-type": "text/plain" })).status).toBe(415);
    const roto = await POST(post("/api/admin/moderacion", null, { crudo: "{no", headers: bearer() }));
    expect(roto.status).toBe(400);
  });

  it("POST sin credenciales: 401 y no cambia nada", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 3 });
    const res = await POST(pedir("POST", "/api/admin/moderacion", { cuerpo: { accion: "ocultar", ids: await ids(), motivo: "intento sin permiso" } }));
    expect(res.status).toBe(401);
    expect((await db.query("SELECT estado FROM reportes")).rows[0].estado).toBe("visible");
  });

  it("GET ?colonia_id= lista los reportes de la colonia en cualquier estado; valores inválidos: 400", async () => {
    const col = await crearColonia();
    await sembrar({ colonia: col, gravedad: 2 });
    await sembrar({ colonia: col, gravedad: 3, estado: "oculto" });
    await sembrar({ colonia: col, gravedad: 4, sospechoso: true, huella: "HUELLA-SECRETA" });
    const res = await GET(pedir("GET", `/api/admin/moderacion?colonia_id=${col}`, { headers: bearer() }));
    const txt = await texto(res);
    const d = JSON.parse(txt);
    expect(d.reportes).toHaveLength(3);
    expect(txt).not.toMatch(/SECRETA|"huella"|red_hash/);
    for (const v of ["abc", "0", "-1", "1.5", ""]) {
      expect((await GET(pedir("GET", `/api/admin/moderacion?colonia_id=${v}`, { headers: bearer() }))).status, v).toBe(400);
    }
  });

  it("las respuestas del admin nunca se cachean ni se indexan", async () => {
    const res = await GET(pedir("GET", "/api/admin/moderacion", { headers: bearer() }));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
