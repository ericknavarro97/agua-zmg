"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { GRAVEDADES } from "@/lib/severity";
import { Muestra } from "./niveles";

/**
 * Leyenda del mapa. Cada nivel tiene color, trama y nombre escrito. En móvil solo se ven los colores (ocupa poco
 * espacio) y las aclaraciones quedan detrás de «Ver más»; desde tablet se muestra todo.
 */
export default function Leyenda({ className = "" }: { className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const idDetalle = useId();
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
      <div id={idDetalle} className={abierta ? "" : "hidden md:block"}>
        <p className="mt-1 text-slate-700">
          Color tenue = pocos reportes (confianza baja). Gris no significa agua buena.
        </p>
        <p className="mt-1 font-medium text-slate-900">
          Ningún nivel significa que el agua sea segura para beber. <Link href="/que-hacer" className="text-sky-800 underline">Qué hacer</Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-controls={idDetalle}
        className="mt-1 inline-flex min-h-8 items-center font-medium text-sky-800 underline md:hidden"
      >
        {abierta ? "Ver menos" : "Ver más"}
      </button>
    </section>
  );
}
