import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Genera .next/standalone/server.js: imagen Docker mínima para el plan B (VPS)
  // y para cualquier hosting con Node. Vercel usa su propio empaquetado: verificarlo en el primer
  // despliegue de prueba (no se ha probado en Vercel).
  output: "standalone",
  // Raíz de trazado fija en web/: sin ella, un lockfile en un directorio padre
  // cambia la ruta de server.js dentro de standalone.
  outputFileTracingRoot: path.join(__dirname),
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Las cabeceras de seguridad (CSP, HSTS, Permissions-Policy…) las fija proxy.ts para todas las
      // respuestas; aquí NO se repiten para no duplicarlas.
      {
        // Los workers de MapLibre se copian con `pnpm copy:maplibre` (sin hash en el nombre):
        // caché de un día, revalidable, para no servirlos viejos tras actualizar la librería.
        source: "/maplibre/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
