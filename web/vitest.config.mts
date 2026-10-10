import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tres proyectos:
//  - unit: pruebas puras junto al código (lib/, app/**), sin base de datos.
//  - api:  integración contra una base propia (agua_tapi, migrada desde cero en el globalSetup).
//  - tlib: librerías y scripts (tests/lib, tests/scripts); cada archivo crea su propia base desechable
//          agua_tlib_* (tests/lib/_db.ts), así que no usa globalSetup y puede correr en paralelo.
// Debe coincidir con tests/api/setup/entorno.ts (lo verifica tests/api/salud.test.ts); aquí no se importa
// porque este archivo es .mts y un .ts importado volvería a cargarse como CommonJS.
const DB_URL = `${process.env.TAPI_PG_BASE ?? "postgres://agua:agua@localhost:5433"}/agua_tapi`;
const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.{ts,tsx}"] },
      },
      {
        resolve: { alias },
        test: {
          name: "api",
          include: ["tests/api/**/*.test.ts"],
          globalSetup: ["./tests/api/setup/global.ts"],
          // Todos los archivos comparten la misma base: se ejecutan uno tras otro
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
          // Entorno fijo y explícito: nada de lo que haya en la shell o en .env.local debe colarse
          env: {
            DATABASE_URL: DB_URL,
            HASH_SALT: "tapi-sal-de-pruebas-0123456789-abcdefghij",
            TRUSTED_PROXY_HOPS: "1",
            ORIGENES_PERMITIDOS: "",
            ANTIABUSO_RELAJADO: "",
            MODO_ATAQUE: "",
            LIMITE_GLOBAL_HORA: "",
            ADMIN_TOKEN: "",
            NEXT_PUBLIC_SITE_URL: "",
            DATOS_LICENCIA_NOMBRE: "",
            DATOS_LICENCIA_URL: "",
            APP_VERSION: "",
            VERCEL_GIT_COMMIT_SHA: "",
          },
        },
      },
      {
        resolve: { alias },
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
      },
    ],
  },
});
