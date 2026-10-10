import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { DB_ADMIN_URL, DB_NOMBRE, DB_URL } from "./entorno";

const WEB = fileURLToPath(new URL("../../../", import.meta.url));

/** Crea agua_tapi desde cero y aplica TODAS las migraciones con el migrador real (scripts/migrate.ts). */
export async function setup() {
  // Defensa: el nombre es constante, pero si alguien lo cambia no se debe poder apuntar a una base real
  if (!/^agua_tapi/.test(DB_NOMBRE)) throw new Error("La base de pruebas debe llamarse agua_tapi*");
  const admin = new Client({ connectionString: DB_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NOMBRE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DB_NOMBRE}`);
  } finally {
    await admin.end();
  }
  // Sin --env-file: así DATABASE_URL de .env.local (agua_zmg) no puede intervenir
  execFileSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], {
    cwd: WEB,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
}

export async function teardown() {
  if (process.env.TAPI_CONSERVAR_DB === "1") return;
  const admin = new Client({ connectionString: DB_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NOMBRE} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
