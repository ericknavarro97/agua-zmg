import Link from "next/link";
import { GRAVEDADES } from "@/lib/severity";
import { Muestra } from "./niveles";

/** Leyenda visible también en móvil. Cada nivel tiene color, trama y nombre escrito. */
export default function Leyenda({ className = "" }: { className?: string }) {
  return (
    <section aria-label="Leyenda del mapa" className={`rounded-xl bg-white/95 p-2.5 text-xs shadow-lg ring-1 ring-slate-300 backdrop-blur ${className}`}>
      <p className="mb-1 font-semibold text-slate-900">Gravedad que reportan los vecinos</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {GRAVEDADES.map((g) => (
          <li key={g.nivel} className="flex items-center gap-1.5">
            <Muestra nivel={g.nivel} />
            <span>
              {g.nivel} {g.etiqueta}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Muestra nivel={null} />
          <span>Sin datos suficientes</span>
        </li>
      </ul>
      <p className="mt-1 text-slate-700">
        Color tenue = pocos reportes (confianza baja). Gris no significa agua buena.
      </p>
      <p className="mt-1 font-medium text-slate-900">
        Ningún nivel significa que el agua sea segura para beber. <Link href="/que-hacer" className="text-sky-800 underline">Qué hacer</Link>
      </p>
    </section>
  );
}
