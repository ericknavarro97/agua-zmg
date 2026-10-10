import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas de librerías y scripts (tests/lib, tests/scripts). Cada archivo que usa Postgres crea su propia
// base desechable (agua_tlib_*) con tests/lib/_db.ts, así que no dependen de globalSetup ni se pisan entre sí.
// Uso: pnpm exec vitest run --config tests/lib/vitest.config.ts
// Ya forma parte de vitest.config.mts (proyecto "tlib", lo que corren `pnpm test` y la CI); este archivo
// queda solo para correr únicamente estas pruebas.
const raiz = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: raiz,
  resolve: { alias: { "@": raiz } },
  test: {
    name: "tlib",
    include: ["tests/lib/**/*.test.ts", "tests/scripts/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Entorno fijo: nada de la shell o de .env.local debe colarse
    env: {
      HASH_SALT: "tlib-sal-de-pruebas-0123456789-abcdefghij",
      TRUSTED_PROXY_HOPS: "1",
      ORIGENES_PERMITIDOS: "",
    },
  },
});
