import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/colonias/geometria/route";
import { crearColonia, db, get, json, reiniciar } from "./helpers";

type Feature = {
  type: "Feature"; id: number;
  properties: { id: number; nombre: string; municipio: string | null; fuente_geom: string };
  geometry: { type: string; coordinates: unknown };
};
type FC = { type: "FeatureCollection"; features: Feature[]; fuentes_geom: Record<string, { clave: string; aviso: string; representa: string }>; atribucion: string };

const geo = (q = "", h: Record<string, string> = {}) => GET(get(`/api/colonias/geometria${q}`, h));

beforeEach(reiniciar);

describe("GET /api/colonias/geometria: contrato", () => {
  it("sin colonias devuelve un FeatureCollection vacío (no un error)", async () => {
    const res = await geo();
    expect(res.status).toBe(200);
    const fc = await json<FC>(res);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([]);
    expect(fc.fuentes_geom).toEqual({});
  });

  it("cada Feature trae id numérico = colonias.id y properties {id, nombre, municipio, fuente_geom}", async () => {
    const a = await crearColonia({ nombre: "Del Fresno", municipio: "Guadalajara" });
    const b = await crearColonia({ nombre: "Centro", municipio: "Zapopan", fuente: "iieg" });
    const fc = await json<FC>(await geo());
    expect(fc.features).toHaveLength(2);
    for (const f of fc.features) {
      expect(f.type).toBe("Feature");
      expect(typeof f.id).toBe("number");
      expect(f.properties.id).toBe(f.id);
      expect(Object.keys(f.properties).sort()).toEqual(["fuente_geom", "id", "municipio", "nombre"]);
      expect(f.geometry.type).toMatch(/Polygon/);
    }
    const porId = Object.fromEntries(fc.features.map((f) => [f.id, f.properties]));
    expect(porId[a]).toEqual({ id: a, nombre: "Del Fresno", municipio: "Guadalajara", fuente_geom: "ine_colonias" });
    expect(porId[b].fuente_geom).toBe("iieg");
  });

  it("declara la procedencia: atribución con 'no oficiales' y fuentes_geom de cada fuente presente", async () => {
    await crearColonia({ fuente: "ine_colonias" });
    await crearColonia({ fuente: "iieg" });
    const fc = await json<FC>(await geo());
    expect(fc.atribucion).toMatch(/no oficiales/i);
    expect(Object.keys(fc.fuentes_geom).sort()).toEqual(["iieg", "ine_colonias"]);
    expect(fc.fuentes_geom.ine_colonias.aviso).toMatch(/aproximados/i);
    expect(fc.fuentes_geom.ine_colonias.representa).toBe("colonia");
  });

  it("la fuente 'inegi_ageb' se marca como área estadística (no colonia)", async () => {
    await crearColonia({ fuente: "inegi_ageb" });
    const fc = await json<FC>(await geo());
    expect(fc.fuentes_geom.inegi_ageb.representa).toBe("area_estadistica");
    expect(fc.fuentes_geom.inegi_ageb.aviso).toMatch(/NO son colonias/);
  });

  it("Content-Type GeoJSON, ETag y caché pública", async () => {
    await crearColonia();
    const res = await geo();
    expect(res.headers.get("content-type")).toMatch(/application\/geo\+json/);
    expect(res.headers.get("etag")).toMatch(/^"/);
    expect(res.headers.get("cache-control")).toMatch(/public/);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
    expect(res.headers.get("vary")).toMatch(/Accept-Encoding/i);
  });

  it("el nombre no se interpreta como HTML ni rompe el JSON", async () => {
    await crearColonia({ nombre: `Colonia "Las Rosas" <b>x</b> \\ ñandú` });
    const fc = await json<FC>(await geo());
    expect(fc.features[0].properties.nombre).toBe(`Colonia "Las Rosas" <b>x</b> \\ ñandú`);
  });
});

describe("GET /api/colonias/geometria: filtros", () => {
  beforeEach(async () => {
    await crearColonia({ nombre: "Real GDL", municipio: "Guadalajara" });
    await crearColonia({ nombre: "Real ZAP", municipio: "Zapopan" });
    await crearColonia({ nombre: "Real TLQ", municipio: "San Pedro Tlaquepaque" });
    await crearColonia({ nombre: "Real TON", municipio: "Tonalá" });
  });
  const nombres = async (q: string) => (await json<FC>(await geo(q))).features.map((f) => f.properties.nombre).sort();

  it("sin filtros devuelve todas las colonias", async () => {
    const fc = await json<FC>(await geo());
    expect(fc.features).toHaveLength(4);
  });

  it("?municipio= filtra por un municipio", async () => {
    expect(await nombres("?municipio=Zapopan")).toEqual(["Real ZAP"]);
  });

  it("acepta variantes de nombre, con o sin acentos y mayúsculas", async () => {
    expect(await nombres("?municipio=tonala")).toEqual(["Real TON"]);
    expect(await nombres("?municipio=TONALÁ")).toEqual(["Real TON"]);
    expect(await nombres("?municipio=Tlaquepaque")).toEqual(["Real TLQ"]);
    expect(await nombres("?municipio=San%20Pedro%20Tlaquepaque")).toEqual(["Real TLQ"]);
  });

  it("acepta varios municipios separados por coma", async () => {
    expect(await nombres("?municipio=Zapopan,Tonala")).toEqual(["Real TON", "Real ZAP"]);
  });

  it("fuentes_geom solo lista las fuentes de lo que se devuelve", async () => {
    const fc = await json<FC>(await geo("?municipio=Guadalajara"));
    expect(Object.keys(fc.fuentes_geom)).toEqual(["ine_colonias"]);
  });

  it("municipio desconocido o con basura: 400", async () => {
    for (const m of ["Narnia", "Zapopan,Narnia", "'; DROP TABLE colonias;--"]) {
      const res = await geo(`?municipio=${encodeURIComponent(m)}`);
      expect(res.status, m).toBe(400);
    }
    expect((await db.query("SELECT count(*)::int AS n FROM colonias")).rows[0].n).toBe(4);
  });

  it("?detalle= inválido: 400; válidos: 200", async () => {
    expect((await geo("?detalle=ultra")).status).toBe(400);
    for (const d of ["completo", "alto", "medio", "bajo"]) expect((await geo(`?detalle=${d}`)).status).toBe(200);
    // claves heredadas de Object: con `in` pasaban y devolvían todo sin polígonos, cacheado un día
    for (const d of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect((await geo(`?detalle=${d}`)).status, d).toBe(400);
  });
});

describe("GET /api/colonias/geometria: compresión y caché condicional", () => {
  it("304 con If-None-Match y sin cuerpo", async () => {
    await crearColonia();
    const r1 = await geo();
    const etag = r1.headers.get("etag")!;
    const r2 = await geo("", { "if-none-match": etag });
    expect(r2.status).toBe(304);
    expect(await r2.text()).toBe("");
    expect(r2.headers.get("etag")).toBe(etag);
  });

  it("el ETag depende de los parámetros (municipios distintos son contenidos distintos)", async () => {
    await crearColonia({ municipio: "Zapopan" });
    await crearColonia({ municipio: "Tonalá" });
    const a = (await geo("?municipio=Zapopan")).headers.get("etag");
    const b = (await geo("?municipio=Tonala")).headers.get("etag");
    expect(a).not.toBe(b);
    // un ETag de otra variante no vale para ésta
    expect((await geo("?municipio=Tonala", { "if-none-match": a! })).status).toBe(200);
  });

  it("el ETag cambia cuando se agregan colonias (la caché no sirve datos viejos)", async () => {
    await crearColonia({ nombre: "Primera" });
    const e1 = (await geo()).headers.get("etag")!;
    await crearColonia({ nombre: "Segunda" });
    const r = await geo("", { "if-none-match": e1 });
    expect(r.status).toBe(200);
    expect((await json<FC>(r)).features).toHaveLength(2);
  });

  it("comprime con gzip y brotli cuando el cuerpo es grande, y el resultado es el mismo JSON", async () => {
    for (let i = 0; i < 60; i++) await crearColonia({ nombre: `Colonia número ${i} con un nombre largo para ocupar espacio` });
    const plano = await json<FC>(await geo());
    const gz = await geo("", { "accept-encoding": "gzip" });
    expect(gz.headers.get("content-encoding")).toBe("gzip");
    expect(await json<FC>(gz)).toEqual(plano);
    const br = await geo("", { "accept-encoding": "br, gzip" });
    expect(br.headers.get("content-encoding")).toBe("br");
    expect(await json<FC>(br)).toEqual(plano);
    expect(plano.features).toHaveLength(60);
  });

  it("con muchas peticiones simultáneas con caché fría, todas reciben el mismo contenido", async () => {
    for (let i = 0; i < 10; i++) await crearColonia();
    const rs = await Promise.all(Array.from({ length: 20 }, () => geo()));
    const cuerpos = await Promise.all(rs.map((r) => r.text()));
    expect(new Set(cuerpos).size).toBe(1);
    expect(new Set(rs.map((r) => r.headers.get("etag"))).size).toBe(1);
  });
});
