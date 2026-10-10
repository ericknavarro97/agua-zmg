/** scripts/purge.ts: retención de identificadores y comentarios, idempotencia, lotes y --dry-run. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { correrScript, crearBase, crearSandbox, insertarColonia, insertarReporte, type BaseTemporal, type Sandbox } from "../lib/_db";

let bd: BaseTemporal;
let sb: Sandbox;
let col: number;
beforeAll(async () => {
  bd = await crearBase();
  sb = crearSandbox();
});
afterAll(async () => {
  sb?.limpiar();
  await bd?.borrar();
});
beforeEach(async () => {
  await bd.pool.query("TRUNCATE reportes, rate_limits RESTART IDENTITY CASCADE");
  await bd.pool.query("DELETE FROM colonias");
  col = await insertarColonia(bd.pool, "Lomas");
});

const purge = (args: string[] = [], env: Record<string, string> = {}) =>
  correrScript("purge.ts", args, { cwd: sb.cwd, url: bd.url, env });
const dias = (d: number) => d * 24;

/** Reporte con TODOS los identificadores y un comentario. */
const completo = (hace: number, o: Parameters<typeof insertarReporte>[1] extends infer T ? Partial<T> : never = {}) =>
  insertarReporte(bd.pool, {
    colonia_id: col, gravedad: 3, huella: `huella-${hace}-${Math.random()}`, red_hash: "red", red_sem: "sem", ua_familia: "chrome-android",
    comentario: "Mi dirección es privada", comentario_hash: "ch", hace_horas: hace, ...o,
  });
const leer = async (id: number) =>
  (await bd.pool.query("SELECT * FROM reportes WHERE id = $1", [id])).rows[0];

describe("anonimización por antigüedad", () => {
  it("a los 30 días borra identificadores y comentario; conserva gravedad, síntomas, colonia y fecha", async () => {
    const viejo = await completo(dias(31));
    await bd.pool.query("UPDATE reportes SET sintomas = ARRAY['Mal olor'] WHERE id = $1", [viejo]);
    const antes = await leer(viejo);
    const r = purge();
    expect(r.status, r.stderr).toBe(0);
    const d = await leer(viejo);
    expect(d).toMatchObject({
      huella: null, red_hash: null, red_sem: null, ua_familia: null, comentario_hash: null, comentario: null,
      gravedad: 3, colonia_id: col, sintomas: ["Mal olor"],
    });
    expect(d.anonimizado_en).toBeInstanceOf(Date);
    expect(d.creado_en).toEqual(antes.creado_en);
  });

  it("los reportes recientes (< 30 días) no se tocan, ni siquiera el de 29 días", async () => {
    const ids = [await completo(1), await completo(dias(14)), await completo(dias(29))];
    const antes = await Promise.all(ids.map(leer));
    const r = purge();
    expect(r.status, r.stderr).toBe(0);
    expect(await Promise.all(ids.map(leer))).toEqual(antes);
  });

  it("se anonimizan reportes de cualquier estado (visible, revisión, oculto) y sospechosos", async () => {
    const ids = [
      await completo(dias(40), { estado: "visible" }),
      await completo(dias(40), { estado: "revision" }),
      await completo(dias(40), { estado: "oculto" }),
      await completo(dias(40), { sospechoso: true }),
    ];
    purge();
    for (const id of ids) expect(await leer(id)).toMatchObject({ huella: null, red_hash: null, comentario: null });
    // y conservan su estado: la purga no "restaura" ni oculta nada
    expect((await Promise.all(ids.map(leer))).map((x) => x.estado)).toEqual(["visible", "revision", "oculto", "visible"]);
  });

  it("--dias=N cambia el umbral", async () => {
    const a = await completo(dias(16));
    const b = await completo(dias(10));
    expect(purge(["--dias=15"]).status).toBe(0);
    expect(await leer(a)).toMatchObject({ huella: null });
    expect(await leer(b)).toMatchObject({ huella: expect.any(String) });
  });

  it("es idempotente: segunda corrida no cambia nada (ni la marca de tiempo)", async () => {
    const id = await completo(dias(40));
    purge();
    const una = await leer(id);
    const r = purge();
    expect(r.stdout).toMatch(/reportes_anonimizados: 0/);
    expect(await leer(id)).toEqual(una);
  });

  it("procesa por lotes: más de 5000 filas viejas quedan todas anonimizadas", async () => {
    await bd.pool.query(
      `INSERT INTO reportes (colonia_id, gravedad, huella, red_hash, red_sem, ua_familia, comentario, comentario_hash, creado_en, dia)
       SELECT $1, 2, 'h' || g, 'r', 's', 'chrome-android', 'texto', 'c', now() - interval '45 days' - (g || ' seconds')::interval, current_date - 45
         FROM generate_series(1, 5200) g`, [col]);
    const r = purge();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/reportes_anonimizados: 5200/);
    expect(r.stdout).toMatch(/comentarios_borrados: 5200/);
    const { rows } = await bd.pool.query(
      "SELECT count(*)::int AS n FROM reportes WHERE huella IS NOT NULL OR red_hash IS NOT NULL OR comentario IS NOT NULL OR anonimizado_en IS NULL");
    expect(rows[0].n).toBe(0);
  }, 90_000);

  it("la anonimización conserva el reporte en la agregación (solo cuenta como huella propia)", async () => {
    const viejo = await completo(dias(31));
    purge();
    const { rows } = await bd.pool.query("SELECT count(*)::int AS n FROM reportes WHERE id = $1 AND huella IS NULL", [viejo]);
    expect(rows[0].n).toBe(1); // sigue existiendo: la purga no borra reportes
  });
});

describe("rate_limits", () => {
  it("borra ventanas de más de 2 días y conserva las recientes", async () => {
    await bd.pool.query(
      `INSERT INTO rate_limits (clave, ventana, n) VALUES
        ('vieja', now() - interval '3 days', 5), ('limite', now() - interval '2 days 1 hour', 1),
        ('ayer', now() - interval '1 day', 5), ('hoy', now(), 1)`);
    const r = purge();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/rate_limits_borrados: 2/);
    expect((await bd.pool.query("SELECT clave FROM rate_limits ORDER BY clave")).rows.map((x) => x.clave)).toEqual(["ayer", "hoy"]);
  });
});

describe("--dry-run", () => {
  it("informa cuánto haría y no cambia nada", async () => {
    const id = await completo(dias(40));
    await bd.pool.query("INSERT INTO rate_limits (clave, ventana, n) VALUES ('vieja', now() - interval '3 days', 5)");
    const antes = await leer(id);
    const r = purge(["--dry-run"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/dry-run/);
    expect(r.stdout).toMatch(/por_anonimizar: 1/);
    expect(r.stdout).toMatch(/comentarios: 1/);
    expect(r.stdout).toMatch(/rate_limits: 1/);
    expect(await leer(id)).toEqual(antes);
    expect((await bd.pool.query("SELECT count(*)::int AS n FROM rate_limits")).rows[0].n).toBe(1);
  });
});

describe("validación de argumentos", () => {
  it("--dias menor que la ventana de cálculo (14) o no entero se rechaza sin tocar datos", async () => {
    const id = await completo(dias(40));
    for (const d of ["13", "0", "-5", "abc", "20.5"]) {
      const r = purge([`--dias=${d}`]);
      expect(r.status, d).toBe(1);
      expect(r.stderr, d).toMatch(/--dias debe ser un entero >= 14/);
    }
    expect(await leer(id)).toMatchObject({ huella: expect.any(String) });
  });
  it("--dias=14 (el mínimo permitido) funciona", async () => {
    expect(purge(["--dias=14"]).status).toBe(0);
  });
  it("sin DATABASE_URL termina con error claro", async () => {
    const r = correrScript("purge.ts", [], { cwd: sb.cwd, url: "", env: { DATABASE_URL: "" } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DATABASE_URL/);
  });
});

describe("alias de package.json", () => {
  it("`pnpm purge` existe (si no, pnpm ejecutaría el comando purge del sistema operativo)", async () => {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts.purge).toMatch(/scripts\/purge\.ts/);
  });
});
