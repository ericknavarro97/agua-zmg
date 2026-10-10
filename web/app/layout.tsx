import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavPrincipal from "@/components/NavPrincipal";
import PieSitio from "@/components/PieSitio";

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
  themeColor: "#0c4a6e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenido"
          className="salto sr-only rounded-md bg-white px-4 py-2 font-medium text-slate-900 shadow focus:not-sr-only"
        >
          Saltar al contenido
        </a>
        <NavPrincipal />
        {children}
        <PieSitio />
      </body>
    </html>
  );
}
