import { beforeAll, describe, expect, it } from "vitest";
import { GET as indice, OPTIONS as opcionesIndice } from "@/app/api/v1/route";
import { GET as coloniasV1, OPTIONS as opcionesColonias } from "@/app/api/v1/colonias/route";
import { GET as detalleV1, OPTIONS as opcionesDetalle } from "@/app/api/v1/colonias/[id]/route";
import { GET as csvV1, OPTIONS as opcionesCsv } from "@/app/api/v1/resumen.csv/route";
import { crearColonia, db, get, json, reiniciar, sembrar, sembrarVecinos, texto } from "./helpers";

// Esta API guarda datos en memoria 60 s por proceso: se siembra UNA vez y todas las pruebas leen lo mismo.
let fresno: number, sinDatos: number, formula: number, ton: number;

type Feat = { id: number; properties: Record<string, unknown>; geometry: unknown };
type Meta = {
  licencia: { estado: string; nombre: string; url: string }; atribucion: string; aviso: string;
  n_colonias?: number;
};
type FC = { type: string; metadata: Meta; features: Feat[] };

beforeAll(async () => {
  await reiniciar();
  fresno = await crearColonia({ nombre: "Del Fresno", municipio: "Guadalajara" });
  sinDatos = await crearColonia({ nombre: "Sin Datos", municipio: "Zapopan" });
  formula = await crearColonia({ nombre: `=HYPERLINK("http://evil.example","clic")`, municipio: "Tonalá" });
  ton = await crearColonia({ nombre: "Centro Tonalá", municipio: "Tonalá" });
  await sembrarVecinos(fresno, 3, 9, { dias: 3 });
  await sembrar({ colonia: formula, gravedad: 2, comentario: "COMENTARIO-PRIVADO", huella: "HUELLA-SECRETA-X", red: "RED-SECRETA-X" });
  await db.query(
    `INSERT INTO mediciones_externas (hash_fila, colonia_id, confianza_vinculo, colonia_texto, municipio_texto, fuente, tipo_fuente,
                                      fecha, parametro, valor, unidad, url)
     VALUES ('h1', $1, 'alta', 'Del Fresno', 'Guadalajara', 'SIAPA', 'oficial', '2026-10-02', 'turbiedad', 40, 'NTU', 'https://example.org/siapa')`,
    [fresno],
  );
  // Fila con advertencia: la API pública debe entregarla junto al dato (valor null sin nota es ambiguo)
  await db.query(
    `INSERT INTO mediciones_externas (hash_fila, colonia_id, confianza_vinculo, colonia_texto, municipio_texto, fuente, tipo_fuente,
                                      fecha, parametro, valor, unidad, url, notas)
     VALUES ('h2', $1, 'media', 'El Fresno', 'Guadalajara', 'IMDEC', 'ciudadana', '2026-09-01', 'plomo', NULL, NULL, 'https://example.org/imdec',
             'tira reactiva semicuantitativa, no sustituye laboratorio')`,
    [fresno],
  );
});

const gj = async (q = "", h: Record<string, string> = {}) => coloniasV1(get(`/api/v1/colonias${q}`, h));
const det = (id: string | number) => detalleV1(get(`/api/v1/colonias/${id}`), { params: Promise.resolve({ id: String(id) }) } as never);
const csv = (q = "", h: Record<string, string> = {}) => csvV1(get(`/api/v1/resumen.csv${q}`, h));

describe("cabeceras comunes: CORS, caché, licencia", () => {
  it.each([
    ["índice", () => indice(get("/api/v1"))],
    ["colonias", () => gj()],
    ["detalle", () => det(fresno)],
    ["csv", () => csv()],
  ])("%s: CORS abierto, caché pública, licencia declarada", async (_n, f) => {
    const res = await f();
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toMatch(/public.*s-maxage/);
    expect(res.headers.get("x-licencia")).toBeTruthy();
    expect(res.headers.get("link")).toMatch(/rel="license"/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("access-control-expose-headers")).toMatch(/X-Licencia/);
  });

  it.each([["índice", opcionesIndice], ["colonias", opcionesColonias], ["detalle", opcionesDetalle], ["csv", opcionesCsv]])(
    "OPTIONS (preflight) %s: 204 con CORS",
    async (_n, f) => {
      const res = f();
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toMatch(/GET/);
    },
  );

  it("la licencia es provisional ('sin confirmar') mientras no se defina DATOS_LICENCIA_NOMBRE", async () => {
    const m = (await json<FC>(await gj())).metadata;
    expect(m.licencia.estado).toBe("provisional");
    expect(m.licencia.nombre).toBeTruthy();
    expect(m.licencia.url).toMatch(/^https:\/\//);
    expect(m.atribucion).toMatch(/aproximados/i);
    expect(m.aviso).toMatch(/Sin reportes no significa/);
  });

  it("los errores también llevan CORS y no se cachean", async () => {
    const res = await det("abc");
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/v1", () => {
  it("lista los endpoints con la URL base de la petición", async () => {
    const d = await json(await indice(get("/api/v1", { host: "agua.test", "x-forwarded-proto": "https" })));
    expect(d.endpoints.colonias).toBe("https://agua.test/api/v1/colonias");
    expect(d.endpoints.resumen_csv).toBe("https://agua.test/api/v1/resumen.csv");
    expect(d.metadata.version_api).toBe("v1");
    expect(d.metadata.licencia).toBeTruthy();
  });
});

describe("GET /api/v1/colonias", () => {
  it("es un FeatureCollection con score/nivel/confianza/n por colonia y geometría", async () => {
    const res = await gj();
    expect(res.headers.get("content-type")).toMatch(/application\/geo\+json/);
    const fc = await json<FC>(res);
    expect(fc.type).toBe("FeatureCollection");
    const f = fc.features.find((x) => x.id === fresno)!;
    expect(f.properties).toMatchObject({ id: fresno, nombre: "Del Fresno", municipio: "Guadalajara", fuente_geom: "ine_colonias", n: 9, n_huellas: 9 });
    expect(typeof f.properties.score).toBe("number");
    expect([1, 2, 3, 4]).toContain(f.properties.nivel);
    expect(["baja", "media", "alta"]).toContain(f.properties.confianza);
    expect(f.geometry).toBeTruthy();
    expect(fc.metadata.n_colonias).toBe(fc.features.length);
  });

  it("las colonias sin mínimo publicable tienen todo en null (no se publica '1 reporte')", async () => {
    const fc = await json<FC>(await gj());
    for (const id of [sinDatos, formula]) {
      const f = fc.features.find((x) => x.id === id)!;
      expect(f.properties).toMatchObject({ score: null, nivel: null, confianza: null, n: null, n_huellas: null, ultimo: null });
    }
  });

  it("?con_datos=1 deja solo las colonias publicables", async () => {
    const fc = await json<FC>(await gj("?con_datos=1"));
    expect(fc.features.map((f) => f.id)).toEqual([fresno]);
  });

  it("?sin_geometria=1 devuelve geometry null y pesa menos", async () => {
    const fc = await json<FC>(await gj("?sin_geometria=1"));
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features.every((f) => f.geometry === null)).toBe(true);
  });

  it("?municipio= filtra, acepta variantes y rechaza lo desconocido con 400", async () => {
    const t = await json<FC>(await gj("?municipio=tonala"));
    expect(t.features.map((f) => f.id).sort()).toEqual([formula, ton].sort());
    expect((await json<FC>(await gj("?municipio=Zapopan"))).features.map((f) => f.id)).toEqual([sinDatos]);
    const mala = await gj("?municipio=Narnia");
    expect(mala.status).toBe(400);
    expect(mala.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("un valor raro en los parámetros no rompe la respuesta", async () => {
    expect((await gj("?con_datos=banana&sin_geometria=%00&x=" + "a".repeat(2000))).status).toBe(200);
  });

  it("ETag + If-None-Match → 304 con CORS", async () => {
    const r1 = await gj();
    const etag = r1.headers.get("etag")!;
    expect(etag).toBeTruthy();
    const r2 = await gj("", { "if-none-match": etag });
    expect(r2.status).toBe(304);
    expect(r2.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("sirve gzip cuando el cliente lo acepta", async () => {
    const gz = await gj("", { "accept-encoding": "gzip" });
    const plano = await json<FC>(await gj());
    // si el cuerpo es grande se comprime; en cualquier caso el contenido decodificado coincide
    expect(await json<FC>(gz)).toEqual(plano);
  });

  it("NO expone huellas, redes ni comentarios", async () => {
    const txt = await texto(await gj());
    expect(txt).not.toMatch(/SECRETA|PRIVADO|huella"|red_hash|red_sem/);
  });
});

describe("GET /api/v1/colonias/[id]", () => {
  it("devuelve agregados, serie (solo si ya es publicable) y datos externos con su fuente", async () => {
    const res = await det(fresno);
    expect(res.status).toBe(200);
    const d = await json(res);
    expect(d).toMatchObject({ id: fresno, nombre: "Del Fresno", municipio: "Guadalajara" });
    expect(d.reportes.n).toBe(9);
    expect(d.reportes.serie).toHaveLength(3);
    expect(d.oficial).toEqual([
      { fuente: "SIAPA", tipo: "oficial", fecha: "2026-10-02", parametro: "turbiedad", valor: 40, unidad: "NTU", url: "https://example.org/siapa", confianza_vinculo: "alta", notas: null },
      { fuente: "IMDEC", tipo: "ciudadana", fecha: "2026-09-01", parametro: "plomo", valor: null, unidad: null, url: "https://example.org/imdec", confianza_vinculo: "media", notas: "tira reactiva semicuantitativa, no sustituye laboratorio" },
    ]);
    expect(d.metadata.licencia).toBeTruthy();
  });

  it("no entrega vínculos 'baja' ni filas repetidas de la misma fuente", async () => {
    await db.query(
      `INSERT INTO mediciones_externas (hash_fila, colonia_id, confianza_vinculo, colonia_texto, municipio_texto, fuente, tipo_fuente,
                                        fecha, parametro, valor, unidad, url)
       VALUES ('b1', $1, 'baja', 'Tonala Industrial', 'Tonalá', 'SIAPA', 'oficial', '2026-10-02', 'reporte_calidad_deficiente', NULL, NULL, 'https://example.org/l'),
              ('b2', $1, 'media', 'Centro', 'Tonalá', 'CEDHJ', 'oficial', '2026-08-04', 'reporte_calidad_deficiente', NULL, NULL, 'https://example.org/c'),
              ('b3', $1, 'alta', 'Centro Tonala', 'Tonalá', 'CEDHJ', 'oficial', '2026-08-04', 'reporte_calidad_deficiente', NULL, NULL, 'https://example.org/c')`,
      [ton],
    );
    const d = await json(await det(ton));
    expect(d.oficial).toHaveLength(1);
    expect(d.oficial[0]).toMatchObject({ fuente: "CEDHJ", confianza_vinculo: "alta" });
  });

  it("colonia sin mínimo publicable: n/score null y serie vacía", async () => {
    const d = await json(await det(formula));
    expect(d.reportes).toMatchObject({ n: null, score: null, nivel: null, confianza: null, serie: [] });
  });

  it.each(["abc", "1.5", "-1", "1234567890", "1e3"])("400 con id %j", async (id) => {
    expect((await det(id)).status).toBe(400);
  });

  it("404 si no existe", async () => {
    expect((await det(987654)).status).toBe(404);
  });

  it("no expone huellas ni comentarios", async () => {
    const txt = await texto(await det(formula));
    expect(txt).not.toMatch(/SECRETA|PRIVADO/);
  });
});

describe("GET /api/v1/resumen.csv", () => {
  const filas = (t: string) => t.trim().split("\r\n");

  it("CSV con cabecera fija, una fila por colonia", async () => {
    const res = await csv();
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="agua-zmg-resumen-\d{4}-\d{2}-\d{2}\.csv"$/);
    const t = await texto(res);
    const l = filas(t);
    expect(l[0]).toBe("id,nombre,municipio,score,nivel,confianza,n_reportes,n_huellas,ultimo_reporte,fecha_corte,licencia");
    expect(l).toHaveLength(1 + 4); // 4 colonias
    const f = l.find((x) => x.startsWith(`${fresno},`))!;
    expect(f).toMatch(/^\d+,Del Fresno,Guadalajara,[\d.]+,[1-4],(baja|media|alta),9,9,/);
  });

  it("neutraliza fórmulas de hoja de cálculo (nombre que empieza con '=')", async () => {
    const t = await texto(await csv());
    expect(t).toContain(`"'=HYPERLINK(""http://evil.example"",""clic"")"`);
    expect(t).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it("NO incluye huellas, redes ni comentarios", async () => {
    const t = await texto(await csv());
    expect(t).not.toMatch(/SECRETA|PRIVADO|red_hash|[0-9a-f]{32}/i);
    // las únicas columnas con "huella" son el conteo agregado
    expect(t.split("\r\n")[0]).not.toMatch(/(^|,)(huella|red_hash|red_sem|comentario)(,|$)/);
  });

  it("?con_datos=1 y ?municipio= funcionan; municipio desconocido: 400", async () => {
    expect(filas(await texto(await csv("?con_datos=1")))).toHaveLength(2);
    expect(filas(await texto(await csv("?municipio=Tonala")))).toHaveLength(3);
    expect((await csv("?municipio=Narnia")).status).toBe(400);
  });

  it("las colonias sin mínimo publicable salen con celdas vacías (no con ceros)", async () => {
    const l = filas(await texto(await csv()));
    const f = l.find((x) => x.startsWith(`${sinDatos},`))!;
    expect(f).toMatch(/^\d+,Sin Datos,Zapopan,,,,,,,\d{4}-\d{2}-\d{2},/);
  });

  it("ETag + If-None-Match → 304", async () => {
    const etag = (await csv()).headers.get("etag")!;
    expect((await csv("", { "if-none-match": etag })).status).toBe(304);
  });
});
