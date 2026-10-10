/**
 * Regresiones de la revisión de seguridad: ráfagas que no censuran a vecinos honestos, colonia_id fuera de rango,
 * /api/oficial con parámetros hostiles, /api/v1 con cabeceras reflejadas y geometría sin consultas por combinación.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/reportes/route";
import { GET as scores } from "@/app/api/colonias/scores/route";
import { GET as geometria } from "@/app/api/colonias/geometria/route";
import { GET as oficial } from "@/app/api/oficial/route";
import { GET as indiceV1 } from "@/app/api/v1/route";
import { invalidarCacheScores } from "@/lib/aggregation";
import { pool } from "@/lib/db";
import { crearColonia, cuerpoValido, db, get, ipNueva, json, post, reiniciar } from "./helpers";

beforeEach(reiniciar);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const navegador = { host: "agua.test", origin: "https://agua.test", "sec-fetch-site": "same-origin" };

describe("ráfaga: un atacante no puede sacar del mapa a una colonia con reportes basura", () => {
  it("5 vecinos honestos + 60 envíos de una sola IP rotando User-Agent + un 6º vecino: los 6 siguen visibles y la colonia sigue publicada", async () => {
    const col = await crearColonia();
    const honesto = (i: number) =>
      POST(post("/api/reportes", cuerpoValido(col, { tiempo_ms: 10000 + i * 1200 }), { headers: navegador }));
    for (let i = 0; i < 5; i++) expect((await honesto(i)).status).toBe(201);
    invalidarCacheScores();
    expect((await json<{ id: number; n: number }[]>(await scores())).find((s) => s.id === col)?.n).toBe(5);

    const ipAtacante = ipNueva();
    for (let i = 0; i < 60; i++) {
      const r = await POST(post("/api/reportes", { colonia_id: col, gravedad: 1 }, { ip: ipAtacante, ua: `y${i}` }));
      expect(r.status).toBe(201);
    }
    expect((await honesto(5)).status).toBe(201);

    const { rows } = await db.query(
      "SELECT canal, estado, count(*)::int AS n FROM reportes WHERE colonia_id = $1 GROUP BY 1, 2 ORDER BY 1, 2",
      [col],
    );
    const web = rows.filter((r) => r.canal === "web");
    expect(web).toEqual([{ canal: "web", estado: "visible", n: 6 }]); // ningún vecino honesto degradado
    expect(rows.filter((r) => r.canal === "sin_cabeceras").some((r) => r.estado === "visible" && r.n > 20)).toBe(false);

    invalidarCacheScores();
    const publicadas = await json<{ id: number }[]>(await scores());
    expect(publicadas.map((s) => s.id)).toContain(col);
  });
});

describe("POST /api/reportes: colonia_id fuera del rango de integer", () => {
  it.each([2147483648, 99999999999, 1e21])("colonia_id %s: 400 (no 500)", async (id) => {
    const r = await POST(post("/api/reportes", { colonia_id: id, gravedad: 3 }));
    expect(r.status).toBe(400);
  });
  it("2147483647 llega a la base y responde 404; 999999, también", async () => {
    expect((await POST(post("/api/reportes", { colonia_id: 2147483647, gravedad: 3 }))).status).toBe(404);
    expect((await POST(post("/api/reportes", { colonia_id: 999999, gravedad: 3 }))).status).toBe(404);
  });
});

describe("GET /api/oficial: parámetros hostiles", () => {
  const pedir = (q: string) => oficial(get(`/api/oficial${q}`));
  it.each(["1e21", "Infinity", "99999999999999999999", "9223372036854775807", "-5", "abc", "1.7"])("offset=%s: 200", async (v) => {
    const r = await pedir(`?offset=${v}`);
    expect(r.status).toBe(200);
    expect((await json<{ n: number }>(r)).n).toBe(0);
  });
  it("parametro con NUL o demasiado largo: 400; normal: 200", async () => {
    expect((await pedir("?parametro=%00")).status).toBe(400);
    expect((await pedir(`?parametro=${"x".repeat(101)}`)).status).toBe(400);
    expect((await pedir("?parametro=turbiedad")).status).toBe(200);
  });
  it("si la base falla responde 503 y no filtra el error", async () => {
    vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("secreto interno de la base"));
    const r = await pedir("");
    expect(r.status).toBe(503);
    expect(JSON.stringify(await json(r))).not.toContain("secreto");
  });
});

describe("GET /api/v1: las URLs no reflejan cabeceras con forma maliciosa", () => {
  const endpoints = async (h: Record<string, string>) =>
    Object.values((await json<{ endpoints: Record<string, string> }>(await indiceV1(get("/api/v1", h)))).endpoints);

  it("X-Forwarded-Proto distinto de http/https se ignora (nada de javascript://)", async () => {
    for (const u of await endpoints({ "x-forwarded-host": "evil.example", "x-forwarded-proto": "javascript" })) {
      expect(u).toMatch(/^https?:\/\//);
      expect(u).not.toMatch(/javascript/i);
    }
  });
  it("un X-Forwarded-Host con forma inválida se descarta", async () => {
    for (const malo of ["evil.example/x y", 'a"><script>', "evil.example, otro.example"]) {
      for (const u of await endpoints({ "x-forwarded-host": malo, "x-forwarded-proto": "https" })) {
        expect(u, malo).not.toMatch(/script|\s|"|otro\.example/);
      }
    }
  });
  it("con host y proto válidos se usan; sin NEXT_PUBLIC_SITE_URL la respuesta declara Vary", async () => {
    const r = await indiceV1(get("/api/v1", { host: "agua.test", "x-forwarded-proto": "https" }));
    expect((await json<{ endpoints: { colonias: string } }>(r)).endpoints.colonias).toBe("https://agua.test/api/v1/colonias");
    expect(r.headers.get("vary")).toMatch(/X-Forwarded-Host/i);
  });
});

describe("GET /api/colonias/geometria: variar los filtros no fuerza consultas pesadas", () => {
  it("40 combinaciones distintas de municipio hacen UNA sola consulta de geometría por nivel de detalle", async () => {
    await crearColonia({ municipio: "Zapopan" });
    await crearColonia({ municipio: "Guadalajara" });
    await crearColonia({ municipio: "Tonalá" });
    const espia = vi.spyOn(pool, "query");
    const munis = ["Zapopan", "Guadalajara", "Tonala", "Tlaquepaque", "Tlajomulco", "El Salto"];
    const combos: string[] = [];
    for (let mask = 1; mask < 64 && combos.length < 40; mask++) {
      const lista = munis.filter((_, i) => mask & (1 << i)).join(",");
      combos.push(`?municipio=${encodeURIComponent(lista)}&detalle=alto`);
    }
    const rs = await Promise.all(combos.map((q) => geometria(get(`/api/colonias/geometria${q}`))));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const pesadas = espia.mock.calls.filter(([sql]) => String(typeof sql === "string" ? sql : (sql as { text: string }).text).includes("ST_Simplify"));
    expect(pesadas.length).toBeLessThanOrEqual(1);
    // el resultado filtrado sigue siendo correcto
    const fc = await json<{ features: { properties: { municipio: string } }[] }>(
      await geometria(get("/api/colonias/geometria?municipio=Zapopan&detalle=alto")),
    );
    expect(fc.features.map((f) => f.properties.municipio)).toEqual(["Zapopan"]);
  });
});
