"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { GRAVEDADES } from "@/lib/severity";
import { Muestra } from "./niveles";

const DE_MAYOR_A_MENOR = [...GRAVEDADES].reverse();

/**
 * Leyenda del mapa. Cada nivel tiene color, trama y nombre escrito.
 * - `tarjeta` (escritorio): columna a la derecha del mapa, de Crítica a Leve, con sus aclaraciones.
 * - `fila` (móvil, dentro del dock): solo las muestras y «Limpia → Crítica»; las aclaraciones van detrás de «Ver más».
 */
export default function Leyenda({ variante, className = "" }: { variante: "tarjeta" | "fila"; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const idDetalle = useId();

  if (variante === "tarjeta") {
    return (
      <section
        aria-label="Leyenda del mapa"
        className={`w-44 rounded-2xl bg-white p-3 text-[0.8125rem] text-tinta shadow-[0_4px_16px_rgba(11,34,51,0.16)] ${className}`}
      >
        <p className="mono-etiqueta mb-2 !text-[0.6875rem] text-texto-tenue">Lo que reportan</p>
        <ul className="flex flex-col gap-2">
          {DE_MAYOR_A_MENOR.map((g) => (
            <li key={g.nivel} className="flex items-center gap-2">
              <Muestra nivel={g.nivel} grande />
              <span>
                <span className="sr-only">Nivel {g.nivel}: </span>
                {g.etiqueta}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2 text-texto-tenue">
            <Muestra nivel={null} grande />
            Sin datos
          </li>
        </ul>
        <p className="mt-2.5 border-t border-borde pt-2 text-xs leading-snug text-texto-tenue">
          Gris no significa agua buena. Color tenue: pocos reportes.{" "}
          <Link href="/metodologia" className="text-marca underline">
            Cómo se calcula
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Leyenda del mapa" className={`text-gris-dock ${className}`}>
      <div className="flex items-center gap-1.5 px-1 pb-3 pt-0.5">
        {GRAVEDADES.map((g) => (
          <Muestra key={g.nivel} nivel={g.nivel} />
        ))}
        <Muestra nivel={null} />
        <span className="mono-etiqueta ml-1 min-w-0 flex-1 !text-[0.65rem] !tracking-[0.02em]">
          <span aria-hidden="true">Limpia → Crítica · Gris = sin datos</span>
          <span className="sr-only">
            Del verde al vino: {GRAVEDADES.map((g) => g.etiqueta).join(", ")}. Gris: sin datos suficientes.
          </span>
        </span>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-controls={idDetalle}
          className="mono-etiqueta -my-2 inline-flex min-h-9 shrink-0 items-center rounded-lg px-1.5 !text-[0.65rem] text-acento"
        >
          {abierta ? "Ver menos" : "Ver más"}
        </button>
      </div>
      <div id={idDetalle} hidden={!abierta} className="px-1 pb-3 text-[0.8125rem] leading-snug text-texto-dock">
        <p>Color tenue = pocos reportes (confianza baja). Gris no significa agua buena.</p>
        <p className="mt-1 font-medium text-white">
          Ningún nivel significa que el agua sea segura para beber.{" "}
          <Link href="/que-hacer" className="text-acento underline">
            Qué hacer
          </Link>{" "}
          ·{" "}
          <Link href="/metodologia" className="text-acento underline">
            Cómo se calcula
          </Link>
        </p>
      </div>
    </section>
  );
}
