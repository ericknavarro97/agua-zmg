/** Aplica db/migrations/*.sql en orden, una sola vez cada una. Uso: pnpm migrate */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const dir = join(process.cwd(), "..", "db", "migrations");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())",
  );
  const hechas = new Set((await pool.query("SELECT nombre FROM schema_migrations")).rows.map((r) => r.nombre));
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (hechas.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log(`aplicada ${f}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
