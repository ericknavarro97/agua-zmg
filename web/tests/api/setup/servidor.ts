/**
 * Arranca un `next dev -p 3201` REAL para las pruebas HTTP de extremo a extremo.
 *
 * Por qué una copia: Next 16 solo permite UN `next dev` por carpeta (candado en .next/dev/lock) y la persona
 * que desarrolla suele tener el suyo en :3000. La copia vive en el directorio temporal del sistema:
 * código fuente copiado + node_modules CLONADO (copy-on-write en APFS/btrfs/xfs; Turbopack no admite un
 * symlink a node_modules fuera de la raíz). El clon se hace una sola vez y se reutiliza.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_URL } from "./entorno";

export const PUERTO = 3201;
export const URL_BASE = `http://localhost:${PUERTO}`;
export const ADMIN_TOKEN_SERVIDOR = "token-admin-servidor-0123456789ab";

const WEB = fileURLToPath(new URL("../../../", import.meta.url));
const COPIA = join(tmpdir(), "agua-zmg-tapi-servidor");
const CODIGO = ["app", "components", "lib", "public", "next.config.ts", "proxy.ts", "package.json", "tsconfig.json", "next-env.d.ts"];

/** Sincroniza el código y asegura el node_modules clonado. Devuelve la carpeta de la copia. */
export function prepararCopia(): string {
  mkdirSync(COPIA, { recursive: true });
  for (const f of CODIGO) {
    rmSync(join(COPIA, f), { recursive: true, force: true });
    if (existsSync(join(WEB, f))) cpSync(join(WEB, f), join(COPIA, f), { recursive: true });
  }
  // node_modules se vuelve a clonar solo si cambió el lockfile
  const lock = statSync(join(WEB, "pnpm-lock.yaml"));
  const sello = `${lock.size}:${lock.mtimeMs}`;
  const archivoSello = join(COPIA, ".sello-lock");
  const vigente = existsSync(join(COPIA, "node_modules")) && existsSync(archivoSello) && readFileSync(archivoSello, "utf8") === sello;
  if (!vigente) {
    rmSync(join(COPIA, "node_modules"), { recursive: true, force: true });
    const args = process.platform === "darwin" ? ["-cR"] : ["-R", "--reflink=auto"];
    execFileSync("cp", [...args, join(WEB, "node_modules"), join(COPIA, "node_modules")], { stdio: "pipe" });
    writeFileSync(archivoSello, sello);
  }
  return COPIA;
}

export type Servidor = { proceso: ChildProcess; log: () => string; parar: () => Promise<void> };

/** Arranca el servidor con el entorno indicado y espera a que /api/salud responda. */
export async function arrancar(env: Record<string, string>): Promise<Servidor> {
  const cwd = prepararCopia();
  // ¿ya hay algo en el puerto? Mejor fallar claro que probar contra otro servidor
  const ocupado = await fetch(`${URL_BASE}/api/salud`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
  if (ocupado) throw new Error(`El puerto ${PUERTO} ya está en uso; libéralo para correr las pruebas de servidor real.`);

  const base = { ...process.env } as Record<string, string | undefined>;
  delete base.NODE_ENV; // vitest pone NODE_ENV=test; `next dev` debe decidir el suyo
  const proceso = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PUERTO)], {
    cwd,
    detached: true, // propio grupo de procesos: se mata solo lo que arrancamos aquí
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...base,
      DATABASE_URL: DB_URL,
      HASH_SALT: "tapi-sal-de-pruebas-0123456789-abcdefghij",
      TRUSTED_PROXY_HOPS: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      ...env,
    } as unknown as NodeJS.ProcessEnv,
  });
  let salida = "";
  proceso.stdout?.on("data", (d) => (salida += d));
  proceso.stderr?.on("data", (d) => (salida += d));

  const parar = async () => {
    if (proceso.pid && proceso.exitCode === null) {
      try {
        process.kill(-proceso.pid, "SIGTERM");
      } catch {
        /* ya terminó */
      }
      await new Promise<void>((r) => {
        const t = setTimeout(() => {
          try {
            if (proceso.pid) process.kill(-proceso.pid, "SIGKILL");
          } catch {
            /* nada */
          }
          r();
        }, 5000);
        proceso.once("exit", () => {
          clearTimeout(t);
          r();
        });
      });
    }
    // Esperar a que el puerto quede libre
    for (let i = 0; i < 50; i++) {
      const vivo = await fetch(`${URL_BASE}/api/salud`, { signal: AbortSignal.timeout(500) }).then(() => true, () => false);
      if (!vivo) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  };
  process.once("exit", () => {
    try {
      if (proceso.pid) process.kill(-proceso.pid, "SIGKILL");
    } catch {
      /* nada */
    }
  });

  const limite = Date.now() + 90_000;
  for (;;) {
    if (proceso.exitCode !== null) throw new Error(`next dev terminó (${proceso.exitCode}):\n${salida}`);
    try {
      const r = await fetch(`${URL_BASE}/api/salud`, { signal: AbortSignal.timeout(20_000) });
      if (r.status === 200) break;
    } catch {
      /* aún no escucha */
    }
    if (Date.now() > limite) {
      await parar();
      throw new Error(`next dev no respondió en 90 s:\n${salida}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { proceso, log: () => salida, parar };
}
