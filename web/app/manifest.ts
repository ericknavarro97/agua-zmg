import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agua ZMG: mapa ciudadano de la calidad del agua",
    short_name: "Agua ZMG",
    description: "Reporta y consulta cómo llega el agua a tu colonia en la Zona Metropolitana de Guadalajara.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f7",
    theme_color: "#0b2233",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
