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
  municipios,
  onMunicipio,
  consulta,
  seleccionId,
  onSeleccionar,
}: {
  features: FeatureColonia[];
  scores: Record<number, Score>;
  municipio: string;
  /** En móvil el filtro de municipio vive aquí (en escritorio está arriba a la derecha) */
  municipios: string[];
  onMunicipio: (m: string) => void;
  consulta: string;
  seleccionId: number | null;
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
    // Deja libre la franja de arriba (navegación) y la de abajo (el dock, que mide --alto-dock)
    <section
      aria-labelledby="lista-t"
      className="absolute inset-0 overflow-y-auto bg-niebla px-3 pb-[calc(var(--alto-dock,12rem)+2rem)] pt-[7.5rem] md:pt-24"
    >
      <div className="mx-auto max-w-3xl">
        <h2 id="lista-t" className="text-2xl font-bold tracking-[-0.01em] text-tinta">Lista de colonias</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label htmlFor="municipio-lista" className="sr-only">Municipio</label>
          <select
            id="municipio-lista"
            value={municipio}
            onChange={(e) => { onMunicipio(e.target.value); setPagina(1); }}
            className="h-11 w-full rounded-xl border border-borde bg-white px-3 text-sm text-tinta md:hidden"
          >
            <option value="">Todos los municipios</option>
            {municipios.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm text-tinta">
            <input
              type="checkbox"
              checked={soloConNivel}
              onChange={(e) => { setSoloConNivel(e.target.checked); setPagina(1); }}
              className="h-5 w-5 accent-[#0b2233]"
            />
            Mostrar solo colonias con nivel publicado
          </label>
        </div>
        <p className="mono-etiqueta mb-2 mt-2 text-texto-tenue" role="status">
          {filas.length} {filas.length === 1 ? "colonia" : "colonias"}
          {municipio ? ` en ${municipio}` : ""}
        </p>
        {filas.length === 0 ? (
          <p className="rounded-2xl border border-borde bg-white p-4 text-sm text-[#3b4f5c]">
            No encontramos colonias con ese filtro. Prueba con otro nombre o quita el municipio.
          </p>
        ) : (
          <ul className="divide-y divide-[#e6ebef] overflow-hidden rounded-[18px] border border-borde bg-white">
            {visibles.map((f) => {
              const s = scores[f.properties.id];
              const nivel = s?.nivel ?? null;
              const elegida = seleccionId === f.properties.id;
              return (
                <li key={f.properties.id}>
                  <button
                    type="button"
                    onClick={() => onSeleccionar(f.properties.id)}
                    aria-current={elegida ? "true" : undefined}
                    className={`flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left sm:flex-nowrap ${
                      elegida ? "bg-acento/40" : "hover:bg-niebla"
                    }`}
                  >
                    <Muestra nivel={nivel} grande />
                    <span className="min-w-[8rem] flex-1">
                      <span className="block truncate font-semibold text-tinta">{f.properties.nombre}</span>
                      <span className="mono-etiqueta block truncate !text-[0.65rem] text-texto-tenue">{f.properties.municipio}</span>
                    </span>
                    <span className="w-full shrink-0 pl-9 text-xs sm:w-auto sm:pl-0 sm:text-right">
                      <span className="block font-semibold text-tinta">
                        {nivel ? `${nivel}. ${GRAVEDADES[nivel - 1].etiqueta}` : etiquetaNivel(null)}
                      </span>
                      {s && (
                        <span className="block text-texto-tenue">
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
            className="mt-3 min-h-11 w-full rounded-[15px] border border-borde bg-white px-4 py-2 text-sm font-semibold text-tinta hover:bg-niebla"
          >
            Mostrar más ({filas.length - visibles.length} restantes)
          </button>
        )}
      </div>
    </section>
  );
}
