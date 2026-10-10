import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_TOKEN_SERVIDOR, URL_BASE, arrancar, type Servidor } from "./setup/servidor";
import { crearColonia, db, envejecerReportes, reiniciar } from "./helpers";

// Pruebas HTTP contra un `next dev` REAL en el puerto 3201 (ver setup/servidor.ts). Cubren lo que las pruebas de
// handlers no ven: el enrutado de Next, el proxy.ts (cabeceras / 404 del panel), el cuerpo real de las peticiones y
// la serialización HTTP. Se omiten con TAPI_SIN_SERVIDOR=1.
const omitir = process.env.TAPI_SIN_SERVIDOR === "1";

let srv: Servidor | null = null;
const url = (r: string) => `${URL_BASE}${r}`;
const H_JSON = { "content-type": "application/json" };
let ipSeq = 0;
// IPs de redes /24 distintas entre sí
const ip = () => `203.1.${ipSeq++ & 255}.10`;
const reportar = (cuerpo: unknown, h: Record<string, string> = {}) =>
  fetch(url("/api/reportes"), { method: "POST", headers: { ...H_JSON, "x-forwarded-for": ip(), "user-agent": "Mozilla/5.0 Chrome/126.0 Android", ...h }, body: JSON.stringify(cuerpo) });

describe.skipIf(omitir)("servidor real (next dev :3201), admin habilitado", () => {
  let col: number;
  beforeAll(async () => {
    await reiniciar();
    col = await crearColonia({ nombre: "Del Fresno", municipio: "Guadalajara" });
    srv = await arrancar({ ADMIN_TOKEN: ADMIN_TOKEN_SERVIDOR });
  }, 180_000);
  afterAll(async () => {
    await srv?.parar();
    srv = null;
  }, 30_000);

  it("GET /api/salud: 200, JSON, sin caché y con cabeceras de seguridad de proxy.ts", async () => {
    const r = await fetch(url("/api/salud"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, db: true });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("rutas inexistentes: 404; método no permitido: 405", async () => {
    expect((await fetch(url("/api/no-existe"))).status).toBe(404);
    expect((await fetch(url("/api/reportes"))).status).toBe(405);
    expect((await fetch(url("/api/salud"), { method: "POST" })).status).toBe(405);
  });

  it("flujo completo por HTTP: reportar → score → detalle → geometría → API pública", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await reportar({ colonia_id: col, gravedad: 3, sintomas: ["Mal olor"], hp: "", tiempo_ms: 12_000 + i * 500 });
      expect(r.status).toBe(201);
      expect(await r.json()).toEqual({ ok: true, actualizado: false });
    }
    const sc = await fetch(url("/api/colonias/scores"));
    expect(sc.status).toBe(200);
    const lista = await sc.json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: col, nivel: 3, n: 3, n_huellas: 3, confianza: "baja" });

    const d = await (await fetch(url(`/api/colonias/${col}`))).json();
    expect(d).toMatchObject({ id: col, nombre: "Del Fresno", reportes: { n: 3, nivel: 3 } });
    expect((await fetch(url("/api/colonias/abc"))).status).toBe(400);
    expect((await fetch(url("/api/colonias/99999"))).status).toBe(404);

    const g = await fetch(url("/api/colonias/geometria?municipio=guadalajara"), { headers: { "accept-encoding": "gzip" } });
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toMatch(/geo\+json/);
    const fc = await g.json();
    expect(fc.features.map((f: { id: number }) => f.id)).toEqual([col]);

    const v1 = await fetch(url("/api/v1/colonias?con_datos=1&sin_geometria=1"));
    expect(v1.status).toBe(200);
    expect(v1.headers.get("access-control-allow-origin")).toBe("*");
    expect((await v1.json()).features[0].properties).toMatchObject({ id: col, nivel: 3, n: 3 });

    const csv = await fetch(url("/api/v1/resumen.csv"));
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(await csv.text()).toContain("Del Fresno");
    const e = csv.headers.get("etag")!;
    expect((await fetch(url("/api/v1/resumen.csv"), { headers: { "if-none-match": e } })).status).toBe(304);

    const pre = await fetch(url("/api/v1/colonias"), { method: "OPTIONS", headers: { origin: "https://otro.example", "access-control-request-method": "GET" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("POST /api/reportes por HTTP: actualización, inválidos, origen cruzado, tipo y tamaño", async () => {
    const mismo = { "x-forwarded-for": "203.9.9.9" };
    expect((await reportar({ colonia_id: col, gravedad: 2 }, mismo)).status).toBe(201);
    // reenvío inmediato: no se aplica y se avisa (429 + Retry-After), no se finge un 200
    const pronto = await reportar({ colonia_id: col, gravedad: 3 }, mismo);
    expect(pronto.status).toBe(429);
    expect(pronto.headers.get("retry-after")).toBe("30");
    await envejecerReportes();
    expect((await reportar({ colonia_id: col, gravedad: 3 }, mismo)).status).toBe(200);
    expect((await reportar({ colonia_id: col, gravedad: 9 })).status).toBe(400);
    expect((await reportar({ colonia_id: 99999, gravedad: 2 })).status).toBe(404);
    expect((await reportar({ colonia_id: col, gravedad: 2 }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await reportar({ colonia_id: col, gravedad: 2 }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await reportar({ colonia_id: col, gravedad: 2 }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await reportar({ colonia_id: col, gravedad: 2, relleno: "a".repeat(10_000) })).status).toBe(413);
    // mismo origen declarado por el navegador (Origin = host de la petición)
    expect((await reportar({ colonia_id: col, gravedad: 2 }, { origin: URL_BASE, "sec-fetch-site": "same-origin" })).status).toBe(201);
    // un cuerpo enorme por flujo no tumba el servidor
    const enorme = await fetch(url("/api/reportes"), { method: "POST", headers: { ...H_JSON, "x-forwarded-for": ip() }, body: "x".repeat(2_000_000) });
    expect(enorme.status).toBe(413);
    expect((await fetch(url("/api/salud"))).status).toBe(200);
  });

  it("429 por HTTP al pasar el límite por huella; la respuesta no cachea", async () => {
    const mismo = { "x-forwarded-for": "203.9.9.50" };
    const estados: number[] = [];
    for (let i = 0; i < 10; i++) {
      estados.push((await reportar({ colonia_id: col, gravedad: 2 }, mismo)).status);
      await envejecerReportes(); // supera el mínimo de 30 s entre reenvíos para probar el límite por hora
    }
    expect(estados.slice(0, 8).every((s) => s === 201 || s === 200)).toBe(true);
    expect(estados.slice(8)).toEqual([429, 429]);
  });

  it("honeypot por HTTP: misma respuesta que un reporte normal, queda marcado", async () => {
    const r = await reportar({ colonia_id: col, gravedad: 4, hp: "http://spam.example", tiempo_ms: 20_000 });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, actualizado: false });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM reportes WHERE motivo = 'honeypot' AND sospechoso");
    expect(rows[0].n).toBe(1);
  });

  it("admin por HTTP: 401 sin token, 401 con token malo, 200 con Bearer correcto, noindex", async () => {
    const sin = await fetch(url("/api/admin/moderacion"), { headers: { "x-forwarded-for": ip() } });
    expect(sin.status).toBe(401);
    expect(sin.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect((await fetch(url("/api/admin/moderacion"), { headers: { authorization: "Bearer malo-malo-malo-malo", "x-forwarded-for": ip() } })).status).toBe(401);
    const ok = await fetch(url("/api/admin/moderacion"), { headers: { authorization: `Bearer ${ADMIN_TOKEN_SERVIDOR}`, "x-forwarded-for": ip() } });
    expect(ok.status).toBe(200);
    expect(Object.keys(await ok.json()).sort()).toEqual(["bitacora", "cola", "resumen"]);
  });

  it("admin por HTTP: sesión por cookie extremo a extremo", async () => {
    const red = ip();
    const login = await fetch(url("/api/admin/sesion"), { method: "POST", headers: { ...H_JSON, "x-forwarded-for": red }, body: JSON.stringify({ token: ADMIN_TOKEN_SERVIDOR }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const r = await fetch(url("/api/admin/moderacion"), { headers: { cookie, "x-forwarded-for": red } });
    expect(r.status).toBe(200);
  });

  it("la página /admin existe con el panel habilitado y no se indexa", async () => {
    const r = await fetch(url("/admin"));
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(r.headers.get("content-security-policy")).toBeTruthy();
    await r.text();
  }, 60_000);

  it("el servidor sigue sano al final y sin errores 500 en el log", async () => {
    expect((await fetch(url("/api/salud"))).status).toBe(200);
    expect(srv!.log()).not.toMatch(/ 500 in /);
  });
});

describe.skipIf(omitir)("servidor real (next dev :3201), admin deshabilitado (sin ADMIN_TOKEN)", () => {
  beforeAll(async () => {
    await reiniciar();
    srv = await arrancar({ ADMIN_TOKEN: "" });
  }, 180_000);
  afterAll(async () => {
    await srv?.parar();
    srv = null;
  }, 30_000);

  it("/admin y /api/admin/* devuelven 404 (no se anuncia que exista)", async () => {
    const pagina = await fetch(url("/admin"));
    expect(pagina.status).toBe(404);
    await pagina.text();
    const api = await fetch(url("/api/admin/moderacion"), { headers: { authorization: "Bearer cualquier-cosa-1234567890" } });
    expect(api.status).toBe(404);
    const ses = await fetch(url("/api/admin/sesion"), { method: "POST", headers: H_JSON, body: JSON.stringify({ token: "cualquier-cosa-1234567890" }) });
    expect(ses.status).toBe(404);
  }, 60_000);

  it("el resto de la API funciona igual", async () => {
    expect((await fetch(url("/api/salud"))).status).toBe(200);
    expect((await fetch(url("/api/colonias/scores"))).status).toBe(200);
  });
});
