"use client";

import { useState } from "react";
import { TIPOS_FUENTE, fechaCorta } from "./niveles";
import type { DatoOficial, TipoFuente } from "./tipos";
import { advertencias, esIndicio, etiquetaValor } from "@/lib/oficial-presentacion";

const ORDEN: TipoFuente[] = ["oficial", "academica", "periodistica", "ciudadana"];
const VISIBLES = 4;

const PARAMETROS: Record<string, string> = {
  reporte_calidad_deficiente: "Colonia incluida en un listado por mala calidad del agua",
  turbiedad: "Turbiedad",
  cloro_residual_libre: "Cloro residual libre",
  plomo: "Plomo",
  mercurio: "Mercurio",
  aluminio: "Aluminio",
  fluoruros: "Fluoruros",
  nitritos: "Nitritos",
  e_coli: "E. coli",
};

// Límites de la NOM-127-SSA1-2021 (DOF 02-05-2022), leídos en el texto de la norma el 2026-10-08.
// Solo se muestran como referencia junto a un valor numérico.
const LIMITES: Record<string, string> = {
  turbiedad: "Límite de la NOM-127: 4.0 UNT, que baja a 3.0 UNT a partir del segundo año de vigencia de la norma.",
  plomo: "Límite de la NOM-127: 0.01 mg/L.",
  cloro_residual_libre: "Rango de la NOM-127: 0.2 a 1.5 mg/L.",
};

function nombreParametro(p: string): string {
  if (PARAMETROS[p]) return PARAMETROS[p];
  const t = p.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Solo enlaces http(s): los datos vienen de fuera */
function urlSegura(u: string | null): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
  } catch {
    return null;
  }
}

const VINCULO: Record<DatoOficial["confianza_vinculo"], string> = {
  alta: "la fuente nombra esta colonia",
  media: "el nombre de la colonia es parecido, puede haber diferencias de escritura",
  baja: "la coincidencia con esta colonia es dudosa",
};

function Fila({ d }: { d: DatoOficial }) {
  const tipo = TIPOS_FUENTE[d.tipo] ?? TIPOS_FUENTE.ciudadana;
  const url = urlSegura(d.url);
  const esListado = d.parametro === "reporte_calidad_deficiente";
  const tieneValor = d.valor != null && d.valor !== "";
  const indicio = esIndicio(d);
  const avisos = advertencias(d);
  return (
    <li className={`rounded-xl border-l-4 bg-white p-3 text-sm shadow-sm ring-1 ring-borde ${tipo.clase.split(" ")[0]}`}>
      <p className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tipo.clase}`}>{tipo.etiqueta}</span>
        <span className="text-xs text-texto-tenue">{fechaCorta(d.fecha)}</span>
      </p>
      <p className="mt-1 font-semibold text-tinta">{nombreParametro(d.parametro)}</p>
      {tieneValor ? (
        <p className="text-tinta">
          {etiquetaValor(d)}: <strong>{String(d.valor)} {d.unidad ?? ""}</strong>
          {LIMITES[d.parametro] && !indicio && <span className="block text-xs text-texto-tenue">{LIMITES[d.parametro]}</span>}
        </p>
      ) : esListado ? (
        <p className="text-xs text-[#3b4f5c]">
          Es un listado administrativo (por ejemplo, para descuentos). <strong>No es una medición.</strong>
        </p>
      ) : (
        <p className="text-xs text-[#3b4f5c]">La fuente señala el hallazgo pero no publica el valor.</p>
      )}
      {avisos.length > 0 && (
        <div className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-950 ring-1 ring-amber-300">
          <p className="font-semibold">{indicio ? "Aviso: no es una medición confirmada" : "Aviso de la fuente"}</p>
          {avisos.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-[#3b4f5c]">
        Fuente:{" "}
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-marca underline">
            {d.fuente}
            <span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        ) : (
          d.fuente
        )}
      </p>
      <p className="text-xs text-texto-tenue">Vínculo con esta colonia ({d.confianza_vinculo}): {VINCULO[d.confianza_vinculo]}.</p>
    </li>
  );
}

export default function DatosOficiales({ datos }: { datos: DatoOficial[] }) {
  const [verTodo, setVerTodo] = useState(false);
  const ordenados = [...datos].sort((a, b) => {
    const t = ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo);
    if (t !== 0) return t;
    return (b.fecha ?? "").localeCompare(a.fecha ?? "");
  });
  const mostrados = verTodo ? ordenados : ordenados.slice(0, VISIBLES);

  return (
    <section aria-labelledby="oficial-t" className="mt-5">
      <h3 id="oficial-t" className="text-sm font-bold">Reportes publicados</h3>
      <p className="mt-1 text-xs text-texto-tenue">
        Cada uno trae su fuente y <strong>no cuenta para el nivel de gravedad</strong> de los reportes de vecinos.
        Muchos son listados y no mediciones, y las pruebas ciudadanas son orientativas. Revisa siempre la fuente.
      </p>
      {ordenados.length === 0 ? (
        <p className="mt-2 rounded-xl bg-niebla p-3 text-xs text-[#3b4f5c]">
          No tenemos reportes publicados ligados a esta colonia. Eso no significa que el agua sea buena:
          significa que no hay datos publicados que podamos enlazar.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {mostrados.map((d, i) => (
              <Fila key={`${d.fuente}-${d.parametro}-${d.fecha}-${i}`} d={d} />
            ))}
          </ul>
          {ordenados.length > VISIBLES && (
            <button
              type="button"
              onClick={() => setVerTodo(!verTodo)}
              className="mt-2 inline-flex min-h-6 items-center py-1 text-sm font-medium text-marca underline"
              aria-expanded={verTodo}
            >
              {verTodo ? "Ver menos" : `Ver los ${ordenados.length} datos`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
