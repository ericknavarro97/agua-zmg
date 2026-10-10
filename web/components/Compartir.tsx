"use client";

import { useState, useSyncExternalStore } from "react";
import { GRAVEDADES } from "@/lib/severity";

const sinSuscripcion = () => () => {};

/**
 * Compartir una colonia: Web Share API si existe; si no, WhatsApp (wa.me) y copiar enlace.
 * El enlace usa ?colonia=ID, que abre y centra esa colonia en el mapa.
 */
export default function Compartir({
  id,
  nombre,
  municipio,
  etiquetaNivel,
}: {
  id: number;
  nombre: string;
  municipio: string | null;
  etiquetaNivel: string | null;
}) {
  // En el servidor no hay origen ni Web Share; en el navegador sí (sin romper la hidratación)
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => "");
  const puedeCompartir = useSyncExternalStore(sinSuscripcion, () => typeof navigator.share === "function", () => false);
  const url = origen ? `${origen}/?colonia=${id}` : "";
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);

  // La etiqueta sola se malinterpreta al compartirse: va con su definición corta
  const definicion = GRAVEDADES.find((g) => g.etiqueta === etiquetaNivel)?.detalle;
  const texto = etiquetaNivel
    ? `Agua en ${nombre}${municipio ? ` (${municipio})` : ""}: nivel «${etiquetaNivel}»${definicion ? ` (vecinos reportan: ${definicion.charAt(0).toLowerCase()}${definicion.slice(1)})` : ""}. Información ciudadana, no oficial. Suma tu reporte:`
    : `¿Cómo está el agua en ${nombre}${municipio ? ` (${municipio})` : ""}? Aún faltan reportes de vecinos. Reporta la tuya:`;

  async function compartir() {
    try {
      await navigator.share({ title: `Agua ZMG: ${nombre}`, text: texto, url });
    } catch {
      /* la persona canceló */
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`;
  const boton =
    "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50";

  return (
    <section aria-labelledby="compartir-t" className="mt-5">
      <h3 id="compartir-t" className="text-sm font-bold">Avisa a tus vecinos</h3>
      <p className="mt-1 text-xs text-slate-600">Mientras más vecinos reporten, más confiable es el mapa.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {puedeCompartir && (
          <button type="button" onClick={compartir} className={boton}>
            Compartir
          </button>
        )}
        <a href={wa} target="_blank" rel="noopener noreferrer" className={boton}>
          Enviar por WhatsApp
          <span className="sr-only"> (abre en otra pestaña)</span>
        </a>
        <button type="button" onClick={copiar} className={boton}>
          Copiar enlace
        </button>
      </div>
      <p role="status" className="mt-1 min-h-4 text-xs text-slate-700">
        {copiado === "si" && "Enlace copiado."}
        {copiado === "no" && `No se pudo copiar. El enlace es: ${url}`}
      </p>
    </section>
  );
}
