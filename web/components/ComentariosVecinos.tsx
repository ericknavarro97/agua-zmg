"use client";

import { useState } from "react";
import { etiquetaNivel, fechaCorta, Muestra } from "./niveles";
import type { ComentarioPublico } from "./tipos";

const VISIBLES = 3;

/** Lo que cuentan los vecinos (comentarios que su autor aceptó mostrar). Solo día y gravedad: sin hora ni identificadores. */
export default function ComentariosVecinos({ comentarios }: { comentarios: ComentarioPublico[] }) {
  const [verTodo, setVerTodo] = useState(false);
  if (comentarios.length === 0) return null;
  const mostrados = verTodo ? comentarios : comentarios.slice(0, VISIBLES);
  return (
    <section aria-labelledby="coment-t" className="mt-5">
      <h3 id="coment-t" className="text-sm font-bold">Lo que cuentan los vecinos</h3>
      <p className="mt-1 text-xs text-slate-600">Comentarios de personas que reportaron, sin verificar. Pueden contener errores.</p>
      <ul className="mt-2 space-y-2">
        {mostrados.map((c, i) => (
          <li key={`${c.dia}-${i}`} className="rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <Muestra nivel={c.gravedad} />
              <span className="font-medium text-slate-800">{etiquetaNivel(c.gravedad)}</span>
              <span>· {fechaCorta(c.dia)}</span>
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-slate-900">{c.texto}</p>
          </li>
        ))}
      </ul>
      {comentarios.length > VISIBLES && (
        <button
          type="button"
          onClick={() => setVerTodo(!verTodo)}
          className="mt-2 inline-flex min-h-6 items-center py-1 text-sm font-medium text-sky-800 underline"
          aria-expanded={verTodo}
        >
          {verTodo ? "Ver menos" : `Ver los ${comentarios.length} comentarios`}
        </button>
      )}
    </section>
  );
}
