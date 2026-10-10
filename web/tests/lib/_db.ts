/**
 * Ayudas para pruebas con Postgres/PostGIS. Cada archivo de pruebas crea su PROPIA base desechable
 * (agua_tlib_<aleatorio>), le aplica db/migrations/*.sql y la borra al terminar.
 * Nunca toca otra base: el nombre se valida antes de borrar.
 *
 * Conexión de administración (para CREATE/DROP DATABASE), en este orden:
 *   TEST_ADMIN_DATABASE_URL, o TEST_DATABASE_URL / DATABASE_URL cambiando la base por "postgres",
 *   o postgres://agua:agua@localhost:5433/postgres (el contenedor local de docker-compose).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

export const RAIZ_WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RAIZ_REPO = resolve(RAIZ_WEB, "..");
export const DIR_MIGRACIONES = join(RAIZ_REPO, "db", "migrations");
const TSX = join(RAIZ_WEB, "node_modules", ".bin", "tsx");

const PREFIJO = "agua_tlib_";

function urlAdmin(): string {
  const explicita = process.env.TEST_ADMIN_DATABASE_URL;
  if (explicita) return explicita;
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (base) {
    const u = new URL(base);
    u.pathname = "/postgres";
    return u.toString();
  }
  return "postgres://agua:agua@localhost:5433/postgres";
}

export type BaseTemporal = {
  nombre: string;
  url: string;
  pool: Pool;
  /** Cierra el pool y borra la base. */
  borrar: () => Promise<void>;
};

/** Crea una base vacía (con PostGIS al migrar) y devuelve su pool. */
export async function crearBase(migrar = true): Promise<BaseTemporal> {
  const nombre = PREFIJO + randomBytes(5).toString("hex");
  const admin = new Pool({ connectionString: urlAdmin(), max: 1 });
  try {
    await admin.query(`CREATE DATABASE ${nombre}`);
  } catch (e) {
    await admin.end().catch(() => {});
    throw new Error(
      `No pude crear la base de pruebas (${(e as Error).message}). ¿Está Postgres/PostGIS arriba? ` +
        "Define TEST_ADMIN_DATABASE_URL si no es postgres://agua:agua@localhost:5433/postgres",
    );
  }
  const u = new URL(urlAdmin());
  u.pathname = "/" + nombre;
  const url = u.toString();
  const pool = new Pool({ connectionString: url, max: 5 });
  // un cliente ocioso que pierde la conexión (p. ej. al borrar la base) no debe tumbar el proceso de pruebas
  pool.on("error", () => {});
  admin.on("error", () => {});
  const borrar = async () => {
    if (!nombre.startsWith(PREFIJO)) throw new Error("nombre de base no permitido: " + nombre);
    await pool.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  };
  if (migrar) {
    try {
      await aplicarMigraciones(pool);
    } catch (e) {
      await borrar();
      throw e;
    }
  }
  return { nombre, url, pool, borrar };
}

/** Aplica las migraciones directamente (sin pasar por scripts/migrate.ts). */
export async function aplicarMigraciones(pool: Pool): Promise<void> {
  for (const f of readdirSync(DIR_MIGRACIONES).filter((x) => x.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(DIR_MIGRACIONES, f), "utf8"));
  }
}

/** Cuadrado de lado `lado` grados con esquina (x, y) como MultiPolygon WKT. */
export function cuadradoWkt(x: number, y: number, lado = 0.01): string {
  const x2 = x + lado;
  const y2 = y + lado;
  return `MULTIPOLYGON(((${x} ${y},${x2} ${y},${x2} ${y2},${x} ${y2},${x} ${y})))`;
}

/** Inserta una colonia y devuelve su id. */
export async function insertarColonia(pool: Pool, nombre: string, municipio = "Guadalajara", x = -103.35, y = 20.66): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO colonias (nombre, municipio, geom, fuente_geom)
     VALUES ($1, $2, ST_GeomFromText($3, 4326), $4) RETURNING id`,
    [nombre, municipio, cuadradoWkt(x, y), "ine_colonias"],
  );
  return rows[0].id as number;
}

export type ReporteFila = {
  colonia_id: number;
  gravedad?: number;
  huella?: string | null;
  red_hash?: string | null;
  red_sem?: string | null;
  ua_familia?: string | null;
  comentario?: string | null;
  comentario_hash?: string | null;
  tiempo_ms?: number | null;
  canal?: string;
  sospechoso?: boolean;
  estado?: string;
  /** Antigüedad en horas (por defecto, ahora). */
  hace_horas?: number;
};

/** Inserta un reporte con los valores dados; el `dia` se calcula como el día local de creado_en. */
export async function insertarReporte(pool: Pool, r: ReporteFila): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO reportes (colonia_id, gravedad, huella, red_hash, red_sem, ua_familia, comentario, comentario_hash,
                           tiempo_ms, canal, sospechoso, estado, creado_en, dia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             now() - make_interval(secs => $13::float8 * 3600),
             (now() - make_interval(secs => $13::float8 * 3600)) AT TIME ZONE 'America/Mexico_City')
     RETURNING id::int AS id`,
    [
      r.colonia_id, r.gravedad ?? 2, r.huella === undefined ? `h-${randomBytes(6).toString("hex")}` : r.huella,
      r.red_hash ?? null, r.red_sem ?? null, r.ua_familia ?? null, r.comentario ?? null, r.comentario_hash ?? null,
      r.tiempo_ms ?? null, r.canal ?? "web", r.sospechoso ?? false, r.estado ?? "visible", r.hace_horas ?? 0,
    ],
  );
  return rows[0].id as number;
}

// ---- Ejecutar scripts reales (scripts/*.ts) como procesos ----------------------------------------

export type Sandbox = {
  /** Directorio de trabajo para el script (equivale a web/). Contiene ../db y ../data/oficial. */
  cwd: string;
  dirOficial: string;
  limpiar: () => void;
};

/**
 * Árbol temporal <tmp>/web (cwd), <tmp>/db -> migraciones reales (enlace simbólico), <tmp>/data/oficial.
 * Así los scripts que resuelven rutas con process.cwd()/.. escriben en el temporal y no en data/oficial real.
 */
export function crearSandbox(): Sandbox {
  const raiz = mkdtempSync(join(tmpdir(), "agua-tlib-"));
  const cwd = join(raiz, "web");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(raiz, "data", "oficial"), { recursive: true });
  symlinkSync(join(RAIZ_REPO, "db"), join(raiz, "db"), "dir");
  return { cwd, dirOficial: join(raiz, "data", "oficial"), limpiar: () => rmSync(raiz, { recursive: true, force: true }) };
}

export type Salida = { status: number | null; stdout: string; stderr: string };

/** Ejecuta `tsx scripts/<nombre>` desde el sandbox con DATABASE_URL de la base temporal. */
export function correrScript(nombre: string, args: string[], o: { cwd: string; url: string; env?: Record<string, string> }): Salida {
  const script = join(RAIZ_WEB, "scripts", nombre);
  if (!existsSync(script)) throw new Error("no existe " + script);
  const r = spawnSync(TSX, [script, ...args], {
    cwd: o.cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: o.url, ...o.env },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function escribir(ruta: string, contenido: string): string {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, contenido);
  return ruta;
}
