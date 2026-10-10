"use client";

import { useMemo, useState } from "react";
import { GRAVEDADES } from "@/lib/severity";
import { normalizar } from "./geo";
import { Muestra, etiquetaNivel, haceCuanto } from "./niveles";
import type { FeatureColonia, Score } from "./tipos";

const POR_PAGINA = 60;

/**
 * Lista alterna al mapa: para lectores de pantalla, teclado y conexiones lentas.
 * Primero las colonias con nivel más alto; sin nivel, por orden alfabético.
 */
export default function ListaColonias({
  features,
  scores,
  municipio,
  consulta,
  seleccionId,
  conPanel = false,
  onSeleccionar,
}: {
  features: FeatureColonia[];
  scores: Record<number, Score>;
  municipio: string;
  consulta: string;
  seleccionId: number | null;
  /** Hay una colonia abierta: en escritorio su panel (a la derecha) tapa parte de la lista */
  conPanel?: boolean;
  onSeleccionar: (id: number) => void;
}) {
  const [pagina, setPagina] = useState(1);
  const [soloConNivel, setSoloConNivel] = useState(false);

  const filas = useMemo(() => {
    const q = normalizar(consulta);
    return features
      .filter((f) => (!municipio || f.properties.municipio === municipio))
      .filter((f) => (q.length < 2 ? true : normalizar(f.properties.nombre).includes(q)))
      .filter((f) => (soloConNivel ? !!scores[f.properties.id] : true))
      .sort((a, b) => {
        const sa = scores[a.properties.id]?.score ?? 0;
        const sb = scores[b.properties.id]?.score ?? 0;
        if (sa !== sb) return sb - sa;
        return a.properties.nombre.localeCompare(b.properties.nombre, "es");
      });
  }, [features, scores, municipio, consulta, soloConNivel]);

  const visibles = filas.slice(0, POR_PAGINA * pagina);

  return (
    <section aria-labelledby="lista-t" className={`absolute inset-0 overflow-y-auto bg-slate-50 px-3 pb-6 pt-[calc(var(--alto-tarjeta,9.5rem)+0.25rem)] md:pt-3 md:pl-[26rem] ${
        conPanel ? "md:pr-[27.5rem]" : "md:pr-4"
      }`}
    >
      <h2 id="lista-t" className="mb-2 text-lg font-bold md:mt-3">Lista de colonias</h2>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={soloConNivel}
          onChange={(e) => { setSoloConNivel(e.target.checked); setPagina(1); }}
          className="h-5 w-5"
        />
        Mostrar solo colonias con nivel publicado
      </label>
      <p className="mb-2 text-sm text-slate-700" role="status">
        {filas.length} {filas.length === 1 ? "colonia" : "colonias"}
        {municipio ? ` en ${municipio}` : ""}.
      </p>
      {filas.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200">
          No encontramos colonias con ese filtro. Prueba con otro nombre o quita el municipio.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg bg-white ring-1 ring-slate-300">
          {visibles.map((f) => {
            const s = scores[f.properties.id];
            const nivel = s?.nivel ?? null;
            return (
              <li key={f.properties.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionar(f.properties.id)}
                  aria-current={seleccionId === f.properties.id ? "true" : undefined}
                  className={`flex min-h-14 w-full items-center gap-x-3 px-3 py-2 text-left hover:bg-slate-50 ${
                    // Con el panel abierto en pantallas medianas sobra poco ancho: el nivel baja a una segunda línea
                    conPanel ? "md:max-xl:flex-wrap md:max-xl:gap-y-1" : ""
                  } ${seleccionId === f.properties.id ? "bg-sky-50" : ""}`}
                >
                  <Muestra nivel={nivel} grande />
                  <span className={`min-w-0 flex-1 ${conPanel ? "md:max-xl:min-w-[7rem]" : ""}`}>
                    <span className="block truncate font-medium">{f.properties.nombre}</span>
                    <span className="block truncate text-xs text-slate-600">
                      {f.properties.municipio}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right text-xs ${conPanel ? "md:max-xl:w-full md:max-xl:text-left" : ""}`}>
                    <span className="block font-semibold">
                      {nivel ? `${nivel}. ${GRAVEDADES[nivel - 1].etiqueta}` : etiquetaNivel(null)}
                    </span>
                    {s && (
                      <span className="block text-slate-600">
                        {s.n} rep. · {s.confianza} · {haceCuanto(s.ultimo)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {visibles.length < filas.length && (
        <button
          type="button"
          onClick={() => setPagina(pagina + 1)}
          className="mt-3 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-medium"
        >
          Mostrar más ({filas.length - visibles.length} restantes)
        </button>
      )}
    </section>
  );
}
