"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Compartir from "./Compartir";
import DatosOficiales from "./DatosOficiales";
import FormularioReporte from "./FormularioReporte";
import { CONFIANZA, ChipNivel, etiquetaNivel, haceCuanto, nivelDeScore } from "./niveles";
import Sparkline from "./Sparkline";
import type { ColoniaProps, DetalleColonia, Score } from "./tipos";

// Procedencia de los límites de la colonia (claves de la tabla fuentes_geom)
const FUENTES_GEOM: Record<string, string> = {
  ine_colonias: "catálogo de colonias del INE (corte de 2020), aproximado y no oficial; puede faltar alguna colonia nueva",
  iieg: "colonias del IIEG; aproximado, verifica la licencia antes de reutilizar",
  inegi_ageb: "área estadística (AGEB) del INEGI de respaldo: NO es una colonia, solo una aproximación",
};

type Carga = { estado: "cargando" } | { estado: "error" } | { estado: "ok"; d: DetalleColonia };

/**
 * Panel de una colonia. En móvil es una hoja inferior (se arrastra/expande);
 * en escritorio, una tarjeta lateral.
 */
export default function PanelColonia({
  colonia,
  score,
  onCerrar,
  onReportado,
}: {
  colonia: ColoniaProps;
  score?: Score;
  onCerrar: () => void;
  onReportado: () => void;
}) {
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [expandido, setExpandido] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const arrastre = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Detalle de la colonia
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/colonias/${colonia.id}`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<DetalleColonia>;
      })
      .then((d) => setCarga({ estado: "ok", d }))
      .catch((e) => {
        if (e?.name !== "AbortError") setCarga({ estado: "error" });
      });
    return () => ctl.abort();
  }, [colonia.id, intento]);

  // Foco al título al abrir (lectores de pantalla y teclado) y Escape para cerrar
  useEffect(() => {
    titulo.current?.focus({ preventScroll: true });
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Escape dentro de un campo (buscador, comentario, selector) solo es de ese campo
      const t = e.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select")) return;
      onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  const alReportar = useCallback(() => {
    onReportado();
    setCarga({ estado: "cargando" });
    setIntento((i) => i + 1);
  }, [onReportado]);

  const detalle = carga.estado === "ok" ? carga.d : null;
  const rep = detalle?.reportes;
  const nivel = rep ? (rep.nivel ?? nivelDeScore(rep.score)) : score ? score.nivel : null;
  const confianza = rep?.confianza ?? score?.confianza ?? null;
  const n = rep?.n ?? score?.n ?? 0;
  const huellas = rep?.n_huellas ?? score?.n_huellas ?? 0;
  const ultimo = rep?.ultimo ?? score?.ultimo ?? null;

  function alSoltar(e: React.PointerEvent) {
    if (arrastre.current == null) return;
    const dy = e.clientY - arrastre.current;
    arrastre.current = null;
    if (dy < -30) setExpandido(true);
    else if (dy > 30) {
      if (expandido) setExpandido(false);
      else onCerrar();
    }
  }

  return (
    <aside
      aria-label={`Información de ${colonia.nombre}`}
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.25)] transition-[height] duration-200 md:inset-y-3 md:left-auto md:right-3 md:h-auto md:w-[26rem] md:rounded-2xl md:shadow-2xl ${
        expandido ? "h-[88%]" : "h-[52%]"
      }`}
    >
      {/* Asa de la hoja (solo móvil) */}
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        onPointerDown={(e) => { arrastre.current = e.clientY; }}
        onPointerUp={alSoltar}
        onPointerCancel={() => { arrastre.current = null; }}
        aria-expanded={expandido}
        aria-label={expandido ? "Reducir panel" : "Ampliar panel"}
        className="flex h-8 w-full shrink-0 touch-none items-center justify-center md:hidden"
      >
        <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-slate-400" />
      </button>

      {/* relative: los sr-only absolutos de dentro (radios, "abre en otra pestaña") deben recortarse aquí y no estirar el desbordamiento del contenedor raíz */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1 md:pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 ref={titulo} tabIndex={-1} className="text-xl font-bold leading-tight outline-none">
              {colonia.nombre}
            </h2>
            <p className="text-sm text-slate-600">{colonia.municipio}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={`Cerrar información de ${colonia.nombre}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-slate-700 hover:bg-slate-100"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* Formulario arriba del todo: es lo primero que se ve al abrir una colonia */}
        <div ref={formRef}>
          <FormularioReporte coloniaId={colonia.id} nombre={colonia.nombre} onReportado={alReportar} />
        </div>

        {/* Estado actual */}
        <div className="mt-3 rounded-lg border border-slate-300 p-3 text-sm" aria-live="polite">
          {nivel ? (
            <>
              <ChipNivel nivel={nivel} />
              {confianza && (
                <p className="mt-2">
                  <strong>{CONFIANZA[confianza].etiqueta}.</strong>{" "}
                  <span className="text-slate-700">{CONFIANZA[confianza].explicacion}</span>
                </p>
              )}
              <p className="mt-2 text-xs text-slate-600">
                {n} {n === 1 ? "reporte" : "reportes"} de {huellas} {huellas === 1 ? "dispositivo distinto" : "dispositivos distintos"}
                {ultimo ? `; el último, ${haceCuanto(ultimo)}` : ""}. Los más recientes pesan más.
              </p>
            </>
          ) : (
            <>
              <ChipNivel nivel={null} />
              <p className="mt-2 text-slate-700">
                Aún no hay suficientes reportes de esta colonia para mostrar un nivel.{" "}
                <strong>Sin reportes no significa que el agua sea buena</strong>: significa que todavía no sabemos.
              </p>
            </>
          )}
          <p className="mt-2 text-xs text-slate-600">
            Es lo que reportan vecinos, no una medición oficial ni un análisis de laboratorio.{" "}
            <strong>Ningún nivel significa que el agua sea segura para beber:</strong> mira{" "}
            <Link href="/que-hacer" className="text-sky-800 underline">qué hacer</Link>.{" "}
            <Link href="/metodologia" className="text-sky-800 underline">Cómo se calcula</Link>.
          </p>
        </div>

        {/* Serie de 30 días */}
        <section aria-labelledby="serie-t" className="mt-5">
          <h3 id="serie-t" className="text-sm font-bold">Últimos 30 días</h3>
          {carga.estado === "cargando" && <p className="mt-2 animate-pulse text-xs text-slate-600">Cargando el historial…</p>}
          {carga.estado === "error" && (
            <p className="mt-2 text-xs text-slate-700">
              No pudimos cargar el historial ni los reportes publicados.{" "}
              <button type="button" onClick={() => { setCarga({ estado: "cargando" }); setIntento((i) => i + 1); }} className="text-sky-800 underline">
                Reintentar
              </button>
            </p>
          )}
          {rep && nivel && <Sparkline serie={rep.serie} />}
          {rep && !nivel && (
            <p className="mt-2 text-xs text-slate-700">
              El historial se muestra cuando la colonia reúne reportes suficientes de vecinos distintos.
            </p>
          )}
        </section>

        {detalle && <DatosOficiales datos={detalle.oficial} />}

        <Compartir
          id={colonia.id}
          nombre={colonia.nombre}
          municipio={colonia.municipio}
          etiquetaNivel={nivel ? etiquetaNivel(nivel) : null}
        />

        <p className="mt-5 text-xs text-slate-600">
          ¿El agua te enferma o ya la reportaste y nadie responde? Mira{" "}
          <Link href="/que-hacer" className="text-sky-800 underline">qué hacer</Link> y{" "}
          <Link href="/denunciar" className="text-sky-800 underline">dónde denunciar</Link>.
        </p>
        {colonia.fuente_geom && (
          <p className="mt-2 text-xs text-slate-600">
            Límites de la colonia: {FUENTES_GEOM[colonia.fuente_geom] ?? "aproximados y no oficiales"}.
          </p>
        )}
      </div>
    </aside>
  );
}
