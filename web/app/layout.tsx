import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes alojadas en el repo (app/fuentes, licencia OFL): el build no descarga nada y quien visita no contacta a Google.
// Solo el subconjunto latino (incluye á, é, ñ, ¿, ¡): ~77 KB la de texto (variable) y ~10 KB cada peso de la mono.
const fuenteTexto = localFont({
  src: "./fuentes/BricolageGrotesque-latin.woff2",
  weight: "400 700",
  display: "swap",
  variable: "--fuente-texto",
});
const fuenteMono = localFont({
  src: [
    { path: "./fuentes/IBMPlexMono-400-latin.woff2", weight: "400" },
    { path: "./fuentes/IBMPlexMono-500-latin.woff2", weight: "500" },
  ],
  display: "swap",
  variable: "--fuente-mono",
  // La mono solo aparece en etiquetas pequeñas: no vale la pena precargarla
  preload: false,
});

// URL pública del sitio (para enlaces absolutos de Open Graph). Configúrala en producción.
// `||` y no `??`: una variable definida pero vacía (`NEXT_PUBLIC_SITE_URL=`) haría `new URL("")` y tumbaría todas las páginas.
const SITIO =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

// Aviso en el build de producción: sin URL pública las vistas previas al compartir apuntarían a localhost
if (process.env.NEXT_PHASE === "phase-production-build" && SITIO.includes("localhost")) {
  console.warn("[layout] AVISO: NEXT_PUBLIC_SITE_URL no está definida; Open Graph usará " + SITIO + ". Defínela al construir.");
}

const DESCRIPCION =
  "Mapa ciudadano de la calidad del agua en la Zona Metropolitana de Guadalajara. Los vecinos reportan cómo llega el agua a su colonia; información ciudadana, no oficial.";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: "Agua ZMG: mapa ciudadano de la calidad del agua",
    template: "%s | Agua ZMG",
  },
  description: DESCRIPCION,
  applicationName: "Agua ZMG",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Agua ZMG",
    title: "¿Cómo está el agua en tu colonia?",
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: "¿Cómo está el agua en tu colonia?",
    description: DESCRIPCION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2233",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${fuenteTexto.variable} ${fuenteMono.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenido"
          className="salto sr-only rounded-full bg-white px-4 py-2 font-medium text-tinta shadow focus:not-sr-only"
        >
          Saltar al contenido
        </a>
        {/* Cada sección pone su navegación: el mapa la lleva flotando sobre él, las páginas informativas arriba */}
        {children}
      </body>
    </html>
  );
}
