/** scripts/migrate.ts: desde cero, idempotente, transaccional y compatible con una base antigua. */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DIR_MIGRACIONES, correrScript, crearBase, crearSandbox, type BaseTemporal, type Sandbox } from "../lib/_db";

const archivos = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();
const bases: BaseTemporal[] = [];
const sandboxes: Sandbox[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const b of bases.splice(0)) await b.borrar();
  for (const s of sandboxes.splice(0)) s.limpiar();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function baseVacia() {
  const b = await crearBase(false);
  bases.push(b);
  const s = crearSandbox();
  sandboxes.push(s);
  return { b, s };
}
const migrar = (b: BaseTemporal, s: Sandbox) => correrScript("migrate.ts", [], { cwd: s.cwd, url: b.url });
const q = async <T = Record<string, unknown>>(b: BaseTemporal, sql: string, p: unknown[] = []) => (await b.pool.query(sql, p)).rows as T[];

describe("migrate.ts desde cero", () => {
  it("aplica todas las migraciones en orden y crea el esquema completo", async () => {
    const { b, s } = await baseVacia();
    const r = migrar(b, s);
    expect(r.status, r.stderr).toBe(0);
    const aplicadas = r.stdout.split("\n").filter((l) => l.startsWith("aplicada ")).map((l) => l.slice(9).trim());
    expect(aplicadas).toEqual(archivos);
    expect((await q<{ nombre: string }>(b, "SELECT nombre FROM schema_migrations ORDER BY nombre")).map((x) => x.nombre)).toEqual(archivos);

    const tablas = (await q<{ t: string }>(b, "SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public'")).map((x) => x.t);
    for (const t of ["colonias", "reportes", "rate_limits", "moderacion_log", "fuentes_geom", "mediciones_externas", "schema_migrations"]) {
      expect(tablas, t).toContain(t);
    }
    expect((await q(b, "SELECT 1 FROM pg_extension WHERE extname='postgis'")).length).toBe(1);
    expect((await q(b, "SELECT 1 FROM pg_proc WHERE proname='moderar'")).length).toBe(1);
    expect((await q<{ n: number }>(b, "SELECT count(*)::int AS n FROM fuentes_geom"))[0].n).toBe(6);
    // lo «demo» ya no existe: ni la columna, ni la fuente de polígonos
    expect(await q(b, "SELECT 1 FROM information_schema.columns WHERE table_name='colonias' AND column_name='demo'")).toHaveLength(0);
    expect(await q(b, "SELECT 1 FROM fuentes_geom WHERE clave='demo'")).toHaveLength(0);
  });

  it("segunda corrida: no aplica nada, no falla y no cambia el registro", async () => {
    const { b, s } = await baseVacia();
    expect(migrar(b, s).status).toBe(0);
    const antes = await q(b, "SELECT nombre, aplicada_en FROM schema_migrations ORDER BY nombre");
    const r = migrar(b, s);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain("aplicada ");
    expect(await q(b, "SELECT nombre, aplicada_en FROM schema_migrations ORDER BY nombre")).toEqual(antes);
  });

  it("migrar 5 veces seguidas deja la misma estructura", async () => {
    const { b, s } = await baseVacia();
    const esquema = async () => (await q<{ x: string }>(b,
      "SELECT table_name || '.' || column_name || ':' || data_type AS x FROM information_schema.columns WHERE table_schema='public' ORDER BY 1")).map((r) => r.x);
    migrar(b, s);
    const primero = await esquema();
    for (let i = 0; i < 4; i++) expect(migrar(b, s).status).toBe(0);
    expect(await esquema()).toEqual(primero);
  });

  it("cada archivo .sql es idempotente por sí solo (aplicado dos veces seguidas no falla)", async () => {
    // Se aplica en orden y cada archivo dos veces seguidas; no se reaplican los anteriores sobre el esquema final
    // (p. ej. 003 usa la columna demo, que 006 elimina, y nunca se vuelve a correr en una base migrada).
    const { b } = await baseVacia();
    for (const f of archivos) {
      const sql = readFileSync(join(DIR_MIGRACIONES, f), "utf8");
      await b.pool.query(sql);
      await expect(b.pool.query(sql), f).resolves.toBeDefined();
    }
  });

  it("retoma donde se quedó: solo aplica las pendientes", async () => {
    const { b, s } = await baseVacia();
    await b.pool.query("CREATE TABLE schema_migrations (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())");
    await b.pool.query(readFileSync(join(DIR_MIGRACIONES, archivos[0]), "utf8"));
    await b.pool.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [archivos[0]]);
    const r = migrar(b, s);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain(`aplicada ${archivos[0]}`);
    expect(r.stdout).toContain(`aplicada ${archivos[1]}`);
  });
});

describe("migrate.ts sobre una base antigua con datos", () => {
  it("una base solo con 001 (sin schema_migrations) conserva sus datos reales, los clasifica como desconocida y elimina lo demo", async () => {
    const { b, s } = await baseVacia();
    await b.pool.query(readFileSync(join(DIR_MIGRACIONES, archivos[0]), "utf8"));
    const wkt = "ST_GeomFromText('MULTIPOLYGON(((-103.3 20.6,-103.29 20.6,-103.29 20.61,-103.3 20.61,-103.3 20.6)))', 4326)";
    await b.pool.query(`INSERT INTO colonias (nombre, municipio, geom, demo) VALUES ('Real vieja', 'Zapopan', ${wkt}, false), ('Demo vieja', 'Zapopan', ${wkt}, true)`);
    const c = (await q<{ id: number }>(b, "SELECT id FROM colonias WHERE NOT demo"))[0].id;
    await b.pool.query("INSERT INTO reportes (colonia_id, gravedad, huella) VALUES ($1, 3, 'h-antigua')", [c]);

    const r = migrar(b, s);
    expect(r.status, r.stderr).toBe(0);
    const cols = await q<{ nombre: string; fuente_geom: string }>(b, "SELECT nombre, fuente_geom FROM colonias ORDER BY nombre");
    expect(cols).toEqual([{ nombre: "Real vieja", fuente_geom: "desconocida" }]);
    const rep = await q<{ huella: string; estado: string; sospechoso: boolean; canal: string }>(b, "SELECT huella, estado, sospechoso, canal FROM reportes");
    expect(rep).toEqual([{ huella: "h-antigua", estado: "visible", sospechoso: false, canal: "web" }]);
  });

  it("la fuente_geom 'demo' ya no es válida tras migrar; las demás siguen aceptándose", async () => {
    const { b, s } = await baseVacia();
    migrar(b, s);
    const wkt = "ST_GeomFromText('MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)))', 4326)";
    await expect(b.pool.query(`INSERT INTO colonias (nombre, geom, fuente_geom) VALUES ('x', ${wkt}, 'demo')`)).rejects.toThrow();
    for (const f of ["ine_colonias", "iieg", "inegi_ageb", "sepomex", "osm", "desconocida"]) {
      await expect(b.pool.query(`INSERT INTO colonias (nombre, geom, fuente_geom) VALUES ($1, ${wkt}, $1)`, [f]), f).resolves.toBeDefined();
    }
    // la columna demo ya no existe, así que tampoco se puede escribir
    await expect(b.pool.query(`INSERT INTO colonias (nombre, geom, demo) VALUES ('y', ${wkt}, true)`)).rejects.toThrow(/demo/);
  });

  it("006_quitar_demo: borra las colonias demo y sus reportes, elimina columna/regla/trigger/fuente y conserva lo real", async () => {
    const { b, s } = await baseVacia();
    const f006 = archivos.find((f) => f.startsWith("006_"));
    expect(f006, "debe existir la migración 006").toBeDefined();
    const previas = archivos.filter((f) => f < f006!);
    expect(previas).toHaveLength(5);

    // estado real previo a 006: 001..005 aplicadas y registradas
    await b.pool.query("CREATE TABLE schema_migrations (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())");
    for (const f of previas) {
      await b.pool.query(readFileSync(join(DIR_MIGRACIONES, f), "utf8"));
      await b.pool.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [f]);
    }
    const wkt = "ST_GeomFromText('MULTIPOLYGON(((-103.3 20.6,-103.29 20.6,-103.29 20.61,-103.3 20.61,-103.3 20.6)))', 4326)";
    await b.pool.query(
      `INSERT INTO colonias (nombre, municipio, geom, demo, fuente_geom) VALUES
         ('Real A', 'Zapopan', ${wkt}, false, 'ine_colonias'),
         ('Real B', 'Guadalajara', ${wkt}, false, 'desconocida'),
         ('Demo A', 'Zapopan', ${wkt}, true, 'demo'),
         ('Demo B', 'Guadalajara', ${wkt}, true, 'demo')`);
    const id = async (nombre: string) => (await q<{ id: number }>(b, "SELECT id FROM colonias WHERE nombre=$1", [nombre]))[0].id;
    const [realA, realB, demoA, demoB] = [await id("Real A"), await id("Real B"), await id("Demo A"), await id("Demo B")];
    for (const [cid, h] of [[realA, "h-ra"], [realB, "h-rb"], [demoA, "h-da1"], [demoA, "h-da2"], [demoB, "h-db"]] as const) {
      await b.pool.query("INSERT INTO reportes (colonia_id, gravedad, huella) VALUES ($1, 2, $2)", [cid, h]);
    }
    expect((await q<{ n: number }>(b, "SELECT count(*)::int AS n FROM reportes"))[0].n).toBe(5);
    expect(await q(b, "SELECT 1 FROM fuentes_geom WHERE clave='demo'")).toHaveLength(1);

    const r = migrar(b, s);
    expect(r.status, r.stderr).toBe(0);
    const aplicadas = r.stdout.split("\n").filter((l) => l.startsWith("aplicada ")).map((l) => l.slice(9).trim());
    // 006 y las posteriores (007: comentario_publico); lo que importa aquí es que 006 sí se aplicó
    expect(aplicadas[0]).toBe(f006);

    // colonias demo y sus reportes desaparecen; las reales (y los suyos) se conservan intactos
    expect((await q<{ nombre: string }>(b, "SELECT nombre FROM colonias ORDER BY nombre")).map((x) => x.nombre)).toEqual(["Real A", "Real B"]);
    expect((await q<{ huella: string }>(b, "SELECT huella FROM reportes ORDER BY huella")).map((x) => x.huella)).toEqual(["h-ra", "h-rb"]);
    expect((await q<{ n: number }>(b, "SELECT count(*)::int AS n FROM reportes WHERE colonia_id = ANY($1)", [[demoA, demoB]]))[0].n).toBe(0);
    expect((await q<{ nombre: string; fuente_geom: string }>(b, "SELECT nombre, fuente_geom FROM colonias ORDER BY nombre"))).toEqual([
      { nombre: "Real A", fuente_geom: "ine_colonias" },
      { nombre: "Real B", fuente_geom: "desconocida" },
    ]);

    // la columna, la regla, el trigger/función y la fuente 'demo' ya no existen
    expect(await q(b, "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='colonias' AND column_name='demo'")).toHaveLength(0);
    expect(await q(b, "SELECT 1 FROM pg_constraint WHERE conname='colonias_demo_coherente_chk'")).toHaveLength(0);
    expect(await q(b, "SELECT 1 FROM pg_trigger WHERE tgname='colonias_marca_demo_trg'")).toHaveLength(0);
    expect(await q(b, "SELECT 1 FROM pg_proc WHERE proname='colonias_marca_demo'")).toHaveLength(0);
    expect(await q(b, "SELECT 1 FROM fuentes_geom WHERE clave='demo'")).toHaveLength(0);
    // y fuente_geom='demo' queda prohibida
    await expect(b.pool.query(`INSERT INTO colonias (nombre, geom, fuente_geom) VALUES ('x', ${wkt}, 'demo')`)).rejects.toThrow();
  });
});

describe("migrate.ts es transaccional", () => {
  function sandboxConMigraciones(archivosSql: Record<string, string>) {
    const raiz = mkdtempSync(join(tmpdir(), "agua-tlib-mig-"));
    dirs.push(raiz);
    mkdirSync(join(raiz, "web"), { recursive: true });
    mkdirSync(join(raiz, "db", "migrations"), { recursive: true });
    for (const [n, c] of Object.entries(archivosSql)) writeFileSync(join(raiz, "db", "migrations", n), c);
    return join(raiz, "web");
  }

  it("una migración que falla se revierte por completo, se detiene y las anteriores quedan registradas", async () => {
    const b = await crearBase(false);
    bases.push(b);
    const cwd = sandboxConMigraciones({
      "001_ok.sql": "CREATE TABLE t_ok (id int);",
      "002_mala.sql": "CREATE TABLE t_parcial (id int); SELECT 1/0;",
      "003_despues.sql": "CREATE TABLE t_nunca (id int);",
      "LEEME.txt": "no es sql",
    });
    const r = correrScript("migrate.ts", [], { cwd, url: b.url });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/division by zero/);
    expect((await q<{ nombre: string }>(b, "SELECT nombre FROM schema_migrations")).map((x) => x.nombre)).toEqual(["001_ok.sql"]);
    const tablas = (await q<{ t: string }>(b, "SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public'")).map((x) => x.t);
    expect(tablas).toContain("t_ok");
    expect(tablas).not.toContain("t_parcial");
    expect(tablas).not.toContain("t_nunca");
  });

  it("aplica en orden de nombre, no de creación, e ignora lo que no es .sql", async () => {
    const b = await crearBase(false);
    bases.push(b);
    const cwd = sandboxConMigraciones({
      "010_b.sql": "INSERT INTO orden VALUES ('010');",
      "002_a.sql": "CREATE TABLE orden (v text); INSERT INTO orden VALUES ('002');",
      "nota.md": "ignorar",
    });
    const r = correrScript("migrate.ts", [], { cwd, url: b.url });
    expect(r.status, r.stderr).toBe(0);
    expect((await q<{ v: string }>(b, "SELECT v FROM orden")).map((x) => x.v)).toEqual(["002", "010"]);
  });

  it("sin conexión a la base termina con error (no se queda colgado)", async () => {
    const { s } = await baseVacia();
    const r = correrScript("migrate.ts", [], { cwd: s.cwd, url: "postgres://agua:agua@localhost:1/nada" });
    expect(r.status).not.toBe(0);
  });
});
