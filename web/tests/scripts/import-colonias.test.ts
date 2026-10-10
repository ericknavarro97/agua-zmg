/**
 * scripts/import-colonias.ts con GeoJSON de ejemplo: polígonos inválidos, duplicados, homónimos,
 * nombres con acentos, SRID distinto y las salvaguardas de procedencia.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { correrScript, crearBase, crearSandbox, escribir, insertarReporte, type BaseTemporal, type Sandbox } from "../lib/_db";

let bd: BaseTemporal;
let sb: Sandbox;
beforeAll(async () => {
  bd = await crearBase();
  sb = crearSandbox();
});
afterAll(async () => {
  sb?.limpiar();
  await bd?.borrar();
});
beforeEach(async () => {
  await bd.pool.query("TRUNCATE reportes, mediciones_externas RESTART IDENTITY CASCADE");
  await bd.pool.query("DELETE FROM colonias");
});

// --- fabricación de GeoJSON -----------------------------------------------------------------------

type Props = Record<string, unknown>;
const anillo = (x: number, y: number, l = 0.01) => [[[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]]];
const poligono = (x: number, y: number, l = 0.01) => ({ type: "Polygon", coordinates: anillo(x, y, l) });
const feat = (properties: Props | null, geometry: unknown) => ({ type: "Feature", properties, geometry });
const coleccion = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

let n = 0;
function archivo(contenido: string, nombre = `col-${n++}.geojson`): string {
  return escribir(join(sb.cwd, nombre), contenido);
}

type Reporte = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function importar(contenido: string, args: string[] = ["--fuente-geom", "ine_colonias"]): { r: ReturnType<typeof correrScript>; rep: Reporte } {
  const ruta = archivo(contenido);
  const salida = join(sb.cwd, `rep-${n++}.json`);
  const r = correrScript("import-colonias.ts", [ruta, ...args, "--reporte", salida], { cwd: sb.cwd, url: bd.url });
  let rep: Reporte = {};
  try { rep = JSON.parse(readFileSync(salida, "utf8")); } catch { /* falló antes de reportar */ }
  return { r, rep };
}
const filas = async () =>
  (await bd.pool.query("SELECT id, nombre, municipio, fuente_geom, anio_fuente, clave, ST_IsValid(geom) AS valida, GeometryType(geom) AS tipo FROM colonias ORDER BY id")).rows;

describe("importación básica", () => {
  it("importa polígonos, normaliza nombres en mayúsculas y municipios, y guarda procedencia", async () => {
    const { r, rep } = importar(coleccion(
      feat({ NOMBRE: "LOMAS DE SAN PEDRO", MUNICIPIO: "ZAPOPAN" }, poligono(-103.40, 20.70)),
      feat({ nombre: "Jardines del Bosque", municipio: "Tlaquepaque" }, poligono(-103.38, 20.64)),
      feat({ nombre: "Tonalá Centro", municipio: "tonala" }, poligono(-103.24, 20.62)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep).toMatchObject({ leidas: 3, nuevas: 3, actualizadas: 0, fuente_geom: "ine_colonias", anio_fuente: 2020 });
    const f = await filas();
    expect(f.map((x) => [x.nombre, x.municipio])).toEqual([
      ["Lomas de San Pedro", "Zapopan"],
      ["Jardines del Bosque", "San Pedro Tlaquepaque"],
      ["Tonalá Centro", "Tonalá"],
    ]);
    for (const x of f) expect(x).toMatchObject({ fuente_geom: "ine_colonias", anio_fuente: 2020, valida: true, tipo: "MULTIPOLYGON" });
  });

  it("conserva los acentos y la ñ de los nombres", async () => {
    const nombres = ["Peñita de Jaltemba", "Álamo Industrial", "Miravalle Ñandú", "Jardines de la Paz Güémez", "Colonia Año Nuevo"];
    const { r } = importar(coleccion(...nombres.map((nombre, i) => feat({ nombre, municipio: "Guadalajara" }, poligono(-103.4 + i * 0.02, 20.6)))));
    expect(r.status, r.stderr).toBe(0);
    expect((await filas()).map((x) => x.nombre).sort()).toEqual([...nombres].sort());
    // y la clave de upsert es insensible a acentos y mayúsculas
    const { rep } = importar(coleccion(feat({ nombre: "PENITA DE JALTEMBA", municipio: "GUADALAJARA" }, poligono(-103.4, 20.6))));
    expect(rep.nuevas).toBe(0);
  });

  it("acepta MultiPolygon y los guarda como MultiPolygon", async () => {
    const { r } = importar(coleccion(feat({ nombre: "Dos Partes", municipio: "Zapopan" },
      { type: "MultiPolygon", coordinates: [anillo(-103.4, 20.7), anillo(-103.3, 20.7)] })));
    expect(r.status, r.stderr).toBe(0);
    expect((await filas())[0].tipo).toBe("MULTIPOLYGON");
  });

  it("detecta la fuente de la propiedad 'fuente' cuando no se pasa --fuente-geom", async () => {
    const { r, rep } = importar(coleccion(feat({ nombre: "Uno", municipio: "Zapopan", fuente: "Catálogo de colonias del INE" }, poligono(-103.4, 20.7))), []);
    expect(r.status, r.stderr).toBe(0);
    expect(rep.fuente_geom).toBe("ine_colonias");
  });

  it("sin fuente detectable o con --fuente-geom inválida termina con error y no escribe nada", async () => {
    const g = coleccion(feat({ nombre: "Uno", municipio: "Zapopan" }, poligono(-103.4, 20.7)));
    const a = importar(g, []);
    expect(a.r.status).toBe(1);
    expect(a.r.stderr).toMatch(/No pude detectar la fuente/);
    const b = importar(g, ["--fuente-geom", "inventada"]);
    expect(b.r.status).toBe(1);
    expect(b.r.stderr).toMatch(/inválida/);
    expect(await filas()).toEqual([]);
  });

  it("formato no soportado -> error claro", async () => {
    const ruta = archivo("a,b,c", "datos.csv");
    const r = correrScript("import-colonias.ts", [ruta, "--fuente-geom", "ine_colonias"], { cwd: sb.cwd, url: bd.url });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Formato no soportado/);
  });
});

describe("calidad de los datos de entrada", () => {
  it("repara polígonos inválidos (corbata) y los cuenta; ninguno queda inválido en la base", async () => {
    const corbata = { type: "Polygon", coordinates: [[[-103.4, 20.7], [-103.39, 20.71], [-103.39, 20.7], [-103.4, 20.71], [-103.4, 20.7]]] };
    const { r, rep } = importar(coleccion(
      feat({ nombre: "Corbata", municipio: "Zapopan" }, corbata),
      feat({ nombre: "Sana", municipio: "Zapopan" }, poligono(-103.3, 20.7)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep.geometrias_invalidas_corregidas).toBe(1);
    expect(rep.invalidas_en_bd).toBe(0);
    const f = await filas();
    expect(f).toHaveLength(2);
    expect(f.every((x) => x.valida)).toBe(true);
  });

  it("omite sin geometría, no polígonos, sin nombre, nombres basura y polígonos vacíos o degenerados", async () => {
    const { r, rep } = importar(coleccion(
      feat({ nombre: "Sin Geometria", municipio: "Zapopan" }, null),
      feat({ nombre: "Es un punto", municipio: "Zapopan" }, { type: "Point", coordinates: [-103.4, 20.7] }),
      feat({ municipio: "Zapopan" }, poligono(-103.4, 20.7)),
      feat({ nombre: "Sin nombre", municipio: "Zapopan" }, poligono(-103.5, 20.7)),
      feat({ nombre: "S/N", municipio: "Zapopan" }, poligono(-103.51, 20.7)),
      feat({ nombre: "---", municipio: "Zapopan" }, poligono(-103.52, 20.7)),
      feat({ nombre: "Linea degenerada", municipio: "Zapopan" }, { type: "Polygon", coordinates: [[[-103.4, 20.7], [-103.39, 20.7], [-103.38, 20.7], [-103.4, 20.7]]] }),
      feat({ nombre: "Buena", municipio: "Zapopan" }, poligono(-103.3, 20.7)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep).toMatchObject({ leidas: 8, omitidas_sin_geometria: 2, omitidas_sin_nombre: 4, omitidas_vacias: 1, nuevas: 1 });
    expect((await filas()).map((x) => x.nombre)).toEqual(["Buena"]);
  });

  it("duplicados exactos (mismo nombre normalizado, municipio y geometría) se unifican en una sola fila", async () => {
    const { r, rep } = importar(coleccion(
      feat({ nombre: "Las Águilas", municipio: "Zapopan" }, poligono(-103.4, 20.7)),
      feat({ nombre: "LAS AGUILAS", municipio: "ZAPOPAN" }, poligono(-103.4, 20.7)),
      feat({ nombre: "las águilas", municipio: "Zapopan" }, poligono(-103.4, 20.7)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep.duplicados_exactos_unificados).toBe(2);
    expect(rep.nuevas).toBe(1);
    expect(await filas()).toHaveLength(1);
  });

  it("homónimos distintos en el mismo municipio se conservan como colonias separadas (con id de fuente o sin él)", async () => {
    const { r, rep } = importar(coleccion(
      feat({ nombre: "Centro", municipio: "Zapopan", ID: "10" }, poligono(-103.4, 20.7)),
      feat({ nombre: "Centro", municipio: "Zapopan", ID: "11" }, poligono(-103.2, 20.7)),
      feat({ nombre: "San Juan", municipio: "Tonalá" }, poligono(-103.3, 20.6)),
      feat({ nombre: "San Juan", municipio: "Tonalá" }, poligono(-103.25, 20.6)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep.homonimos_desambiguados).toBe(4);
    const f = await filas();
    expect(f).toHaveLength(4);
    expect(new Set(f.map((x) => x.clave)).size).toBe(4);
    // la clave de los que traían id lo incluye
    expect(f.filter((x) => x.nombre === "Centro").map((x) => x.clave).sort()).toEqual(["zapopan|centro#10", "zapopan|centro#11"]);
  });

  it("el mismo nombre en municipios distintos NO es un homónimo", async () => {
    const { r, rep } = importar(coleccion(
      feat({ nombre: "Centro", municipio: "Zapopan" }, poligono(-103.4, 20.7)),
      feat({ nombre: "Centro", municipio: "Guadalajara" }, poligono(-103.35, 20.67)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep.homonimos_desambiguados).toBe(0);
    expect(await filas()).toHaveLength(2);
  });

  it("cuenta municipios ausentes o fuera de la ZMG sin descartar la colonia", async () => {
    const { r, rep } = importar(coleccion(
      feat({ nombre: "Sin Muni" }, poligono(-103.4, 20.7)),
      feat({ nombre: "Fuera", municipio: "Acatic" }, poligono(-103.0, 20.7)),
    ));
    expect(r.status, r.stderr).toBe(0);
    expect(rep).toMatchObject({ sin_municipio: 1, municipio_no_zmg: 1, nuevas: 2 });
  });

  it("reporta solapes entre colonias de la BD", async () => {
    const { rep } = importar(coleccion(
      feat({ nombre: "Grande", municipio: "Zapopan" }, poligono(-103.4, 20.7, 0.02)),
      feat({ nombre: "Anidada", municipio: "Zapopan" }, poligono(-103.395, 20.705, 0.005)),
      feat({ nombre: "Parcial", municipio: "Zapopan" }, poligono(-103.39, 20.71, 0.02)),
    ));
    expect(rep.solapes.anidados_95pct_o_mas).toBe(1);
    expect(rep.solapes.graves_25_a_95pct + rep.solapes.leves_5_a_25pct).toBeGreaterThanOrEqual(1);
  });
});

describe("SRID distinto de 4326", () => {
  it("--srid 32613 (UTM 13N) reproyecta a lon/lat y cae donde debe (Guadalajara)", async () => {
    // coordenadas UTM calculadas con PostGIS a partir de un cuadrado conocido de Guadalajara
    const { rows } = await bd.pool.query(
      `SELECT ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromText('POLYGON((-103.36 20.66,-103.35 20.66,-103.35 20.67,-103.36 20.67,-103.36 20.66))'), 4326), 32613)) AS g`);
    const geom = JSON.parse(rows[0].g);
    expect(Math.abs(geom.coordinates[0][0][0])).toBeGreaterThan(1000); // metros, no grados
    const { r } = importar(coleccion(feat({ nombre: "En UTM", municipio: "Guadalajara" }, geom)), ["--fuente-geom", "ine_colonias", "--srid", "32613"]);
    expect(r.status, r.stderr).toBe(0);
    const c = (await bd.pool.query("SELECT ST_X(ST_Centroid(geom)) AS x, ST_Y(ST_Centroid(geom)) AS y, ST_SRID(geom) AS srid, ST_IsValid(geom) AS v FROM colonias")).rows[0];
    expect(c.srid).toBe(4326);
    expect(c.v).toBe(true);
    expect(c.x).toBeCloseTo(-103.355, 4);
    expect(c.y).toBeCloseTo(20.665, 4);
  });

  it("sin --srid, coordenadas en metros se rechazan con un mensaje útil y no se guarda basura", async () => {
    const { rows } = await bd.pool.query(
      `SELECT ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromText('POLYGON((-103.36 20.66,-103.35 20.66,-103.35 20.67,-103.36 20.67,-103.36 20.66))'), 4326), 32613)) AS g`);
    const { r } = importar(coleccion(feat({ nombre: "En UTM", municipio: "Guadalajara" }, JSON.parse(rows[0].g))));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/fuera de rango.*--srid/);
    expect(await filas()).toEqual([]);
  });
});

describe("idempotencia y actualización", () => {
  const base = () => coleccion(
    feat({ nombre: "Uno", municipio: "Zapopan" }, poligono(-103.4, 20.7)),
    feat({ nombre: "Dos", municipio: "Zapopan" }, poligono(-103.3, 20.7)),
  );

  it("reimportar lo mismo no duplica, no cambia ids ni gasta la secuencia", async () => {
    importar(base());
    const antes = await filas();
    const seqAntes = (await bd.pool.query("SELECT last_value::int AS v FROM colonias_id_seq")).rows[0].v;
    const { r, rep } = importar(base());
    expect(r.status, r.stderr).toBe(0);
    expect(rep).toMatchObject({ nuevas: 0, actualizadas: 0, sin_cambios: 2 });
    expect(await filas()).toEqual(antes);
    expect((await bd.pool.query("SELECT last_value::int AS v FROM colonias_id_seq")).rows[0].v).toBe(seqAntes);
  });

  it("si el polígono cambió, actualiza la misma fila (mismo id) y los reportes siguen apuntando a ella", async () => {
    importar(base());
    const id = (await bd.pool.query("SELECT id FROM colonias WHERE nombre='Uno'")).rows[0].id as number;
    await insertarReporte(bd.pool, { colonia_id: id, gravedad: 3 });
    const { rep } = importar(coleccion(
      feat({ nombre: "Uno", municipio: "Zapopan" }, poligono(-103.4, 20.7, 0.02)),
      feat({ nombre: "Dos", municipio: "Zapopan" }, poligono(-103.3, 20.7)),
    ));
    expect(rep).toMatchObject({ nuevas: 0, actualizadas: 1, sin_cambios: 1 });
    expect((await bd.pool.query("SELECT id FROM colonias WHERE nombre='Uno'")).rows[0].id).toBe(id);
    expect((await bd.pool.query("SELECT count(*)::int AS n FROM reportes WHERE colonia_id=$1", [id])).rows[0].n).toBe(1);
  });

  it("--dry-run hace todo y revierte", async () => {
    const { r, rep } = importar(base(), ["--fuente-geom", "ine_colonias", "--dry-run"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("dry-run");
    expect(rep.nuevas).toBe(2);
    expect(await filas()).toEqual([]);
  });

  it("--replace elimina lo que ya no viene, salvo colonias con reportes (que conserva y avisa)", async () => {
    importar(base());
    const dos = (await bd.pool.query("SELECT id FROM colonias WHERE nombre='Dos'")).rows[0].id as number;
    await insertarReporte(bd.pool, { colonia_id: dos });
    const tres = coleccion(feat({ nombre: "Tres", municipio: "Zapopan" }, poligono(-103.2, 20.7)));
    const { r, rep } = importar(tres, ["--fuente-geom", "ine_colonias", "--replace"]);
    expect(r.status, r.stderr).toBe(0);
    expect(rep.replace_eliminadas).toBe(1); // "Uno"
    expect(rep.replace_conservadas_con_reportes).toHaveLength(1);
    expect(rep.replace_conservadas_con_reportes[0]).toContain("Dos");
    expect((await filas()).map((x) => x.nombre).sort()).toEqual(["Dos", "Tres"]);
  });

  it("sin --replace nunca borra", async () => {
    importar(base());
    importar(coleccion(feat({ nombre: "Tres", municipio: "Zapopan" }, poligono(-103.2, 20.7))));
    expect(await filas()).toHaveLength(3);
  });

  it("una fuente no pisa el polígono de otra salvo --sobrescribir-fuente", async () => {
    importar(base());
    const otra = coleccion(feat({ nombre: "Uno", municipio: "Zapopan" }, poligono(-103.4, 20.7, 0.03)));
    const a = importar(otra, ["--fuente-geom", "iieg"]);
    expect(a.rep.bloqueadas_por_otra_fuente).toBe(1);
    expect((await bd.pool.query("SELECT fuente_geom FROM colonias WHERE nombre='Uno'")).rows[0].fuente_geom).toBe("ine_colonias");
    const b = importar(otra, ["--fuente-geom", "iieg", "--sobrescribir-fuente"]);
    expect(b.r.status, b.r.stderr).toBe(0);
    expect((await bd.pool.query("SELECT fuente_geom FROM colonias WHERE nombre='Uno'")).rows[0].fuente_geom).toBe("iieg");
  });
});
