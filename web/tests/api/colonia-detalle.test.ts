import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/colonias/[id]/route";
import { GET as oficial } from "@/app/api/oficial/route";
import { invalidarCacheScores } from "@/lib/aggregation";
import { crearColonia, db, get, json, reiniciar, sembrar, sembrarVecinos } from "./helpers";

const detalle = async (id: string | number, headers: Record<string, string> = {}) => {
  invalidarCacheScores();
  return GET(get(`/api/colonias/${id}`, headers), { params: Promise.resolve({ id: String(id) }) });
};

async function medicion(colonia: number | null, o: Partial<Record<string, unknown>> = {}) {
  const k = Math.random().toString(36).slice(2);
  await db.query(
    `INSERT INTO mediciones_externas (hash_fila, ambito, colonia_id, confianza_vinculo, colonia_texto, municipio_texto,
                                      fuente, tipo_fuente, fecha, parametro, valor, unidad, url, notas)
     VALUES ($1,'colonia',$2,$3,'Del Fresno','Guadalajara',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      k, colonia, colonia ? (o.confianza ?? "alta") : null, o.fuente ?? "SIAPA", o.tipo ?? "oficial",
      o.fecha ?? "2026-10-01", o.parametro ?? "turbiedad", o.valor ?? 12.5, o.unidad ?? "NTU",
      o.url ?? "https://example.org/fuente", o.notas ?? null,
    ],
  );
}

beforeEach(reiniciar);

describe("GET /api/colonias/[id]: validación", () => {
  it.each(["abc", "1.5", "-1", "1e3", "0x10", "1234567890", "", " 1", "1 OR 1=1", "%27"])("400 con id %j", async (id) => {
    const res = await detalle(id);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("404 si la colonia no existe", async () => {
    const res = await detalle(424242);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/colonias/[id]: contrato", () => {
  it("colonia sin reportes: n/n_huellas/score/nivel/confianza/ultimo = null, serie vacía, oficial vacío", async () => {
    const c = await crearColonia({ nombre: "Del Fresno", municipio: "Guadalajara" });
    const res = await detalle(c);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      id: c, nombre: "Del Fresno", municipio: "Guadalajara", fuente_geom: "ine_colonias",
      reportes: { n: null, n_huellas: null, score: null, nivel: null, confianza: null, ultimo: null, serie: [] },
      oficial: [],
    });
  });

  it("con reportes publicables incluye score, nivel, confianza, ultimo y la serie diaria", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 3, 9, { dias: 3 });
    const d = await json(await detalle(c));
    expect(d.reportes.n).toBe(9);
    expect(d.reportes.n_huellas).toBe(9);
    expect(typeof d.reportes.score).toBe("number");
    expect(d.reportes.nivel).toBeGreaterThanOrEqual(1);
    expect(["baja", "media", "alta"]).toContain(d.reportes.confianza);
    expect(new Date(d.reportes.ultimo).toISOString()).toBe(d.reportes.ultimo);
    expect(d.reportes.serie).toHaveLength(3);
    for (const p of d.reportes.serie) {
      expect(p.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.n).toBe(3);
      expect(p.score).toBe(3);
    }
    const dias = d.reportes.serie.map((p: { dia: string }) => p.dia);
    expect([...dias].sort()).toEqual(dias); // ascendente
  });

  it("score coincide con /api/colonias/scores para la misma colonia", async () => {
    const { GET: scores } = await import("@/app/api/colonias/scores/route");
    const c = await crearColonia();
    await sembrarVecinos(c, 2, 8, { dias: 3 });
    invalidarCacheScores();
    const lista = await json<{ id: number; score: number; nivel: number; confianza: string; n_huellas: number }[]>(await scores());
    const d = await json(await detalle(c));
    const s = lista.find((x) => x.id === c)!;
    expect(d.reportes.score).toBe(s.score);
    expect(d.reportes.nivel).toBe(s.nivel);
    expect(d.reportes.confianza).toBe(s.confianza);
    expect(d.reportes.n_huellas).toBe(s.n_huellas);
  });

  it("antes del mínimo publicable NO se expone nada del conteo: n, n_huellas, ultimo null y serie vacía (como /api/v1)", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 4, 2);
    const d = await json(await detalle(c));
    expect(d.reportes).toEqual({ n: null, n_huellas: null, score: null, nivel: null, confianza: null, ultimo: null, serie: [] });
  });

  it("un reporte aceptado solo en una colonia vacía no se delata con su gravedad ni su día", async () => {
    const c = await crearColonia();
    await sembrar({ colonia: c, gravedad: 4, edadDias: 0.01 });
    const d = await json(await detalle(c));
    expect(d.reportes.n).toBeNull();
    expect(d.reportes.serie).toEqual([]);
    expect(JSON.stringify(d)).not.toMatch(/"gravedad"|"dia"/);
  });

  it("la serie solo incluye reportes visibles y no sospechosos de los últimos 30 días", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 2, 8, { dias: 3, edadBase: 2 }); // publicable
    await sembrar({ colonia: c, gravedad: 4, edadDias: 1, estado: "revision" });
    await sembrar({ colonia: c, gravedad: 4, edadDias: 1, estado: "oculto" });
    await sembrar({ colonia: c, gravedad: 4, edadDias: 1, sospechoso: true });
    await sembrar({ colonia: c, gravedad: 4, edadDias: 40 });
    const d = await json(await detalle(c));
    expect(d.reportes.n).toBe(8);
    expect(d.reportes.serie.reduce((a: number, p: { n: number }) => a + p.n, 0)).toBe(8);
    for (const p of d.reportes.serie) expect(p.score).toBe(2);
  });

  it("no filtra huellas, redes, comentarios ni estados de moderación", async () => {
    const c = await crearColonia();
    for (let i = 0; i < 4; i++) {
      await sembrar({ colonia: c, gravedad: 3, huella: `HUELLA-SECRETA-${i}`, red: `RED-SECRETA-${i}`, comentario: `COMENTARIO-PRIVADO-${i}` });
    }
    const res = await detalle(c);
    const txt = JSON.stringify(await json(res));
    expect(txt).not.toMatch(/SECRETA|PRIVADO|huella"|red_hash|red_sem|revision|oculto/);
  });

  it("incluye datos oficiales vinculados con su fuente, URL y confianza del vínculo", async () => {
    const c = await crearColonia();
    await medicion(c, { fuente: "SIAPA", tipo: "oficial", parametro: "turbiedad", valor: 40, unidad: "NTU", confianza: "alta", url: "https://example.org/siapa" });
    await medicion(c, { fuente: "Nota X", tipo: "periodistica", parametro: "plomo", valor: 20, unidad: "mg/L", confianza: "media", notas: "tira reactiva, dudoso" });
    const d = await json(await detalle(c));
    expect(d.oficial).toHaveLength(2);
    for (const o of d.oficial) {
      expect(Object.keys(o).sort()).toEqual(["confianza_vinculo", "fecha", "fuente", "notas", "parametro", "tipo", "unidad", "url", "valor"]);
      expect(["oficial", "academica", "periodistica", "ciudadana"]).toContain(o.tipo);
      expect(["alta", "media", "baja"]).toContain(o.confianza_vinculo);
      expect(o.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const plomo = d.oficial.find((o: { parametro: string }) => o.parametro === "plomo");
    expect(plomo).toMatchObject({ confianza_vinculo: "media", tipo: "periodistica", notas: "tira reactiva, dudoso" });
  });

  it("no mezcla datos oficiales de otra colonia ni las filas sin vincular", async () => {
    const a = await crearColonia();
    const b = await crearColonia();
    await medicion(b, { fuente: "SOLO-B" });
    await medicion(null, { fuente: "SIN-VINCULAR" });
    const d = await json(await detalle(a));
    expect(d.oficial).toEqual([]);
  });

  it("no publica vínculos 'baja' (coincidencia dudosa de nombre) ni repite la misma fila de la misma fuente", async () => {
    const c = await crearColonia();
    await medicion(c, { fuente: "CEDHJ", parametro: "queja", valor: null, unidad: null, confianza: "baja" });
    await medicion(c, { fuente: "CEDHJ", parametro: "queja2", confianza: "media" });
    // misma fuente/parámetro/fecha/valor por dos nombres de origen: queda una sola, la de mejor vínculo
    await medicion(c, { fuente: "OTRA", parametro: "plomo", valor: 1, confianza: "media" });
    await medicion(c, { fuente: "OTRA", parametro: "plomo", valor: 1, confianza: "alta" });
    const d = await json(await detalle(c));
    expect(d.oficial.map((o: { confianza_vinculo: string }) => o.confianza_vinculo).sort()).toEqual(["alta", "media"]);
    expect(d.oficial.some((o: { parametro: string }) => o.parametro === "queja")).toBe(false);
    expect(d.oficial.filter((o: { fuente: string }) => o.fuente === "OTRA")).toHaveLength(1);
    expect(d.oficial.find((o: { fuente: string }) => o.fuente === "OTRA").confianza_vinculo).toBe("alta");
  });

  it("/api/oficial: por defecto sin vínculos 'baja' ni duplicados; con ?min_vinculo=baja aparecen", async () => {
    const c = await crearColonia();
    await medicion(c, { fuente: "CEDHJ", parametro: "queja", valor: null, unidad: null, confianza: "baja" });
    await medicion(c, { fuente: "OTRA", parametro: "plomo", valor: 1, confianza: "media" });
    await medicion(c, { fuente: "OTRA", parametro: "plomo", valor: 1, confianza: "alta" });
    const def = await json(await oficial(get(`/api/oficial?colonia_id=${c}`)));
    expect(def.datos.map((o: { confianza_vinculo: string }) => o.confianza_vinculo)).toEqual(["alta"]);
    const todos = await json(await oficial(get(`/api/oficial?colonia_id=${c}&min_vinculo=baja`)));
    expect(todos.datos.map((o: { confianza_vinculo: string }) => o.confianza_vinculo).sort()).toEqual(["alta", "baja"]);
  });
});

describe("GET /api/colonias/[id]: caché condicional", () => {
  it("devuelve ETag y responde 304 con If-None-Match", async () => {
    const c = await crearColonia();
    const r1 = await detalle(c);
    const etag = r1.headers.get("etag")!;
    expect(etag).toMatch(/^"/);
    expect(r1.headers.get("cache-control")).toMatch(/public/);
    const r2 = await detalle(c, { "if-none-match": etag });
    expect(r2.status).toBe(304);
    expect(await r2.text()).toBe("");
  });

  it("el ETag cambia cuando cambian los datos", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 3, 8, { dias: 3 });
    const e1 = (await detalle(c)).headers.get("etag");
    await sembrar({ colonia: c, gravedad: 2 });
    const e2 = (await detalle(c)).headers.get("etag");
    expect(e2).not.toBe(e1);
  });

  it("los errores nunca se cachean", async () => {
    expect((await detalle(999)).headers.get("cache-control")).toBe("no-store");
    expect((await detalle("x")).headers.get("cache-control")).toBe("no-store");
  });
});
