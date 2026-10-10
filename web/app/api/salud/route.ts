import { pool } from "@/lib/db";
import { configuracionValida } from "@/lib/fingerprint";
import pkg from "../../../package.json";

// Chequeo de salud para monitores externos (UptimeRobot, Better Stack, balanceador).
// Nunca se cachea: debe reflejar el estado real de la base en cada llamada.
const ESPERA_DB_MS = 3000;

// Versión: SHA del commit si el build lo inyecta (APP_VERSION o Vercel), si no, la de package.json
function version(): string {
  const sha = process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? `${pkg.version}+${sha.slice(0, 12)}` : pkg.version;
}

async function baseResponde(): Promise<boolean> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const limite = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error("timeout")), ESPERA_DB_MS);
    });
    const { rows } = await Promise.race([pool.query("SELECT 1 AS ok"), limite]);
    return rows[0]?.ok === 1;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

export async function GET(request: Request) {
  // Leer la URL marca la ruta como dinámica (corre en cada petición, no en el build)
  new URL(request.url);
  const db = await baseResponde();
  // Sin HASH_SALT válido la app arranca pero todos los reportes responden 503: no se declara sana
  const config = configuracionValida();
  const ok = db && config;
  // 503 cuando la base no responde o falta configuración, para que los monitores externos alerten
  return Response.json(
    { ok, db, ...(config ? {} : { config: false }), version: version() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
