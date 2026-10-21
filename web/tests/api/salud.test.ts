import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/salud/route";
import { pool } from "@/lib/db";
import { DB_NOMBRE, DB_URL } from "./setup/entorno";
import { db, get, json } from "./helpers";
import pkg from "../../package.json";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("entorno de pruebas", () => {
  it("las pruebas corren contra agua_tapi y NUNCA contra agua_zmg", async () => {
    expect(process.env.DATABASE_URL).toBe(DB_URL);
    expect(DB_NOMBRE).toBe("agua_tapi");
    const { rows } = await db.query("SELECT current_database() AS d");
    expect(rows[0].d).toBe("agua_tapi");
    expect((await pool.query("SELECT current_database() AS d")).rows[0].d).toBe("agua_tapi");
  });

  it("la base se migró desde cero con todas las migraciones", async () => {
    const { rows } = await db.query("SELECT nombre FROM schema_migrations ORDER BY nombre");
    expect(rows.map((r) => r.nombre)).toEqual(["001_init.sql", "002_antiabuso.sql", "003_colonias_fuentes.sql", "004_mediciones_externas.sql", "005_indice_huella.sql", "006_quitar_demo.sql", "007_comentarios_publicos.sql", "008_nivel_limpia.sql", "009_sin_agua.sql"]);
  });
});

describe("GET /api/salud", () => {
  it("200 {ok:true, db:true, version} sin caché", async () => {
    const res = await GET(get("/api/salud"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, db: true, version: pkg.version });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("la versión incluye el SHA corto del commit si el build lo inyecta", async () => {
    vi.stubEnv("APP_VERSION", "abcdef1234567890zzz");
    expect((await json(await GET(get("/api/salud")))).version).toBe(`${pkg.version}+abcdef123456`);
  });

  it("503 {ok:false, db:false} si la base devuelve error (para que los monitores alerten)", async () => {
    vi.spyOn(pool, "query").mockRejectedValue(new Error("connection refused"));
    const res = await GET(get("/api/salud"));
    expect(res.status).toBe(503);
    expect(await json(res)).toMatchObject({ ok: false, db: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("503 {ok:false, db:true, config:false} en producción sin HASH_SALT válido (o con el de ejemplo)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const sal of ["", "corta", "cambia-esto-por-un-valor-aleatorio-de-32-o-mas-caracteres"]) {
      vi.stubEnv("HASH_SALT", sal);
      const res = await GET(get("/api/salud"));
      expect(res.status).toBe(503);
      expect(await json(res)).toEqual({ ok: false, db: true, config: false, version: pkg.version });
    }
    vi.stubEnv("HASH_SALT", "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6");
    expect((await GET(get("/api/salud"))).status).toBe(200);
  });

  it("503 si la base no contesta en 3 s (no se queda colgado), sin filtrar el error", async () => {
    vi.spyOn(pool, "query").mockImplementation((() => new Promise(() => {})) as never);
    vi.useFakeTimers();
    const p = GET(get("/api/salud"));
    await vi.advanceTimersByTimeAsync(3100);
    const res = await p;
    expect(res.status).toBe(503);
    const cuerpo = await json(res);
    expect(cuerpo).toEqual({ ok: false, db: false, version: pkg.version });
  });
});
