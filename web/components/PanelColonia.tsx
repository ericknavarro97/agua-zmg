"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import Compartir from "./Compartir";
import ComentariosVecinos from "./ComentariosVecinos";
import DatosOficiales from "./DatosOficiales";
import FormularioReporte from "./FormularioReporte";
import { CONFIANZA, ChipNivel, etiquetaNivel, haceCuanto, haceCuantoCorto, Muestra, MuestraSinAgua, nivelDeScore } from "./niveles";
import Sparkline from "./Sparkline";
import type { ColoniaProps, DetalleColonia, Score } from "./tipos";

// Procedencia de los límites de la colonia (claves de la tabla fuentes_geom)
const FUENTES_GEOM: Record<string, string> = {
  ine_colonias: "catálogo de colonias del INE (corte de 2020), aproximado y no oficial; puede faltar alguna colonia nueva",
  iieg: "colonias del IIEG; aproximado, verifica la licencia antes de reutilizar",
  inegi_ageb: "área estadística (AGEB) del INEGI de respaldo: NO es una colonia, solo una aproximación",
};

type Carga = { estado: "cargando" } | { estado: "error" } | { estado: "ok"; d: DetalleColonia };
/** Ficha compacta, con el historial y los datos abiertos, o con el formulario de reporte */
export type ModoPanel = "ficha" | "detalle" | "reportar";

/**
 * Ficha de una colonia dentro del dock oscuro: nombre, nivel y cifras siempre a la vista; el historial
 * y el formulario se abren en una hoja clara que crece hacia arriba. `buscador` son los controles de búsqueda
 * del mapa, que en escritorio siguen en la fila de acciones.
 */
export default function PanelColonia({
  colonia,
  score,
  modoInicial = "ficha",
  buscador,
  onCerrar,
  onReportado,
}: {
  colonia: ColoniaProps;
  score?: Score;
  modoInicial?: ModoPanel;
  buscador?: ReactNode;
  onCerrar: () => void;
  onReportado: () => void;
}) {
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [modo, setModo] = useState<ModoPanel>(modoInicial);
  const titulo = useRef<HTMLHeadingElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const irACompartir = useRef(false);
  // Si se abre directo en el formulario, el foco es del formulario (lo pone él al montarse), no del título
  const enfocarTitulo = useRef(modoInicial === "ficha");
  const idHoja = useId();

  // Detalle de la colonia. Tras reportar (intento > 0) se pide fresco: sin la caché del navegador y con una URL única
  // para saltar la de la CDN; así el historial y los comentarios muestran lo recién enviado.
  useEffect(() => {
    const ctl = new AbortController();
    const url = intento > 0 ? `/api/colonias/${colonia.id}?fresco=${Date.now()}` : `/api/colonias/${colonia.id}`;
    fetch(url, { signal: ctl.signal, cache: intento > 0 ? "no-store" : "default" })
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
    if (enfocarTitulo.current) titulo.current?.focus({ preventScroll: true });
    enfocarTitulo.current = false;
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

  // Al cambiar de hoja: arriba del todo; «compartir» baja hasta esa sección
  useEffect(() => {
    const h = hoja.current;
    if (!h) return;
    if (irACompartir.current) {
      irACompartir.current = false;
      document.getElementById("compartir-t")?.scrollIntoView({ block: "start" });
      return;
    }
    h.scrollTop = 0;
  }, [modo]);

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
  const ultimo = rep?.ultimo ?? score?.ultimo ?? null;
  const ultimoCorto = haceCuantoCorto(ultimo);
  // «Hoy no llegó agua»: se cuenta aparte y no entra en el nivel
  const sinAgua = detalle?.sin_agua?.n ?? 0;

  const resumen = nivel != null
    ? confianza
      ? `${CONFIANZA[confianza].etiqueta}: ${CONFIANZA[confianza].corta}`
      : "Es lo que reportan vecinos, no una medición oficial."
    : "Aún no hay suficientes reportes para mostrar un nivel. Sin reportes no significa que el agua sea buena.";
  const aclaracion = "Ningún nivel significa agua segura para beber.";

  const cajaNivel = (clase: string) => (
    <div className={`items-center gap-3 rounded-[14px] bg-white/[0.06] px-3 py-3 md:px-4 ${clase}`}>
      <Muestra nivel={nivel} enorme />
      <div className="flex-1">
        <p className="mono-etiqueta !text-[0.6875rem] text-gris-dock">{nivel != null ? `Nivel ${nivel}/4` : "Sin nivel"}</p>
        <p className="mt-0.5 whitespace-nowrap text-[1.375rem] font-bold leading-tight md:text-2xl">
          {nivel != null ? etiquetaNivel(nivel) : "Sin datos"}
        </p>
      </div>
      {nivel != null && confianza && (
        <div className="text-right md:hidden">
          <p className="mono-etiqueta !text-[0.6875rem] text-gris-dock">Confianza</p>
          <p className="mt-0.5 text-base font-semibold capitalize">{confianza}</p>
        </div>
      )}
    </div>
  );

  function alternar(m: Exclude<ModoPanel, "ficha">) {
    setModo((actual) => (actual === m ? "ficha" : m));
  }

  return (
    <article aria-label={`Información de ${colonia.nombre}`} className="flex min-h-0 flex-1 flex-col">
      {/* Cabecera: siempre visible */}
      <div
        className={`shrink-0 border-b border-white/[0.12] px-4 pt-4 md:px-[22px] md:pb-4 md:pt-5 ${modo === "ficha" ? "pb-4" : "pb-3"}`}
      >
        <div className="flex items-start gap-3 md:gap-[18px]">
          <div className="min-w-0 flex-1">
            <p className="mono-etiqueta !text-[0.7rem] text-gris-dock">{colonia.municipio ?? "Zona Metropolitana"}</p>
            <h2
              ref={titulo}
              tabIndex={-1}
              className="mt-1 text-[1.6875rem] font-bold leading-none outline-none md:text-[1.875rem]"
            >
              {colonia.nombre}
            </h2>
            <p className="mt-2.5 hidden max-w-[25rem] text-sm leading-[1.45] text-texto-dock text-pretty md:block">
              {resumen} {aclaracion}
            </p>
          </div>
          {cajaNivel("hidden md:flex")}
          <button
            type="button"
            onClick={onCerrar}
            aria-label={`Cerrar información de ${colonia.nombre}`}
            className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl leading-none hover:bg-white/20"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {cajaNivel(`mt-3.5 md:hidden ${modo === "ficha" ? "flex" : "hidden"}`)}
        {/* Con la hoja abierta, en móvil el nivel cabe en una línea para dejarle sitio */}
        {modo !== "ficha" && (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold md:hidden">
            <Muestra nivel={nivel} />
            {nivel != null ? `Nivel ${nivel}/4 · ${etiquetaNivel(nivel)}` : "Sin datos suficientes"}
            {nivel != null && confianza ? <span className="font-normal text-gris-dock">· confianza {confianza}</span> : null}
          </p>
        )}
      </div>

      {/* Cifras y acceso al historial */}
      <div className="mono-etiqueta flex shrink-0 flex-wrap items-center gap-x-[22px] gap-y-1 border-b border-white/[0.12] px-4 py-2.5 text-gris-dock md:px-[22px]">
        <p className="flex flex-wrap gap-x-[22px] gap-y-1">
          {n > 0 ? (
            <>
              <span><span className="text-white">{n}</span> {n === 1 ? "reporte" : "reportes"}</span>
              {ultimoCorto && (
                <span>
                  Último <span className="text-white">{ultimoCorto}</span>
                  <span className="sr-only"> ({haceCuanto(ultimo)})</span>
                </span>
              )}
            </>
          ) : sinAgua === 0 ? (
            <span>Sin reportes recientes</span>
          ) : null}
          {sinAgua > 0 && (
            <span>
              <span className="text-white">{sinAgua}</span> sin agua
              <span className="sr-only"> (reportes de que no llegó agua; no cambian el nivel)</span>
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => alternar("detalle")}
          aria-expanded={modo === "detalle"}
          aria-controls={idHoja}
          className="-my-2 ml-auto inline-flex min-h-10 items-center text-acento"
        >
          {modo === "detalle" ? (
            <>
              Ocultar<span className="sr-only"> el historial</span> ‹
            </>
          ) : (
            "Historial y más ›"
          )}
        </button>
      </div>
      {modo === "ficha" && (
        <p className="shrink-0 px-4 pt-2.5 text-sm leading-[1.45] text-texto-dock md:hidden">
          {resumen} {aclaracion}
        </p>
      )}

      {/* Hoja clara: historial completo o formulario */}
      {modo !== "ficha" && (
        <div
          ref={hoja}
          id={idHoja}
          // relative: los sr-only absolutos de dentro (radios, «abre en otra pestaña») se recortan aquí
          className="relative mx-2.5 mt-2.5 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl bg-niebla px-4 pb-5 pt-1 text-tinta"
        >
          {modo === "reportar" ? (
            <FormularioReporte coloniaId={colonia.id} nombre={colonia.nombre} onReportado={alReportar} enfocar />
          ) : (
            <>
              {/* Estado actual, con la explicación completa */}
              <div className="mt-3 rounded-xl border border-borde bg-white p-3 text-sm" aria-live="polite">
                <ChipNivel nivel={nivel} />
                {nivel != null ? (
                  <>
                    {confianza && (
                      <p className="mt-2">
                        <strong>{CONFIANZA[confianza].etiqueta}.</strong>{" "}
                        <span className="text-[#3b4f5c]">{CONFIANZA[confianza].explicacion}</span>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-texto-tenue">
                      {/* Sin «dispositivos distintos»: la huella rota cada día, así que contaría a la misma persona una vez por día */}
                      {n} {n === 1 ? "reporte" : "reportes"} en total
                      {ultimo ? `; el último, ${haceCuanto(ultimo)}` : ""}. Todos cuentan; los más recientes pesan más.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[#3b4f5c]">
                    Aún no hay suficientes reportes de esta colonia para mostrar un nivel.{" "}
                    <strong>Sin reportes no significa que el agua sea buena</strong>: significa que todavía no sabemos.
                  </p>
                )}
                {sinAgua > 0 && (
                  <p className="mt-2 flex items-start gap-2 text-[#3b4f5c]">
                    <MuestraSinAgua />
                    <span>
                      {sinAgua === 1 ? "1 reporte" : `${sinAgua} reportes`} de que <strong>no llegó agua</strong>
                      {detalle?.sin_agua?.ultimo ? ` (el último, ${haceCuanto(detalle.sin_agua.ultimo)})` : ""}.
                      Se cuentan aparte: no cambian el nivel.
                    </span>
                  </p>
                )}
                <p className="mt-2 text-xs text-texto-tenue">
                  Es lo que reportan vecinos, no una medición oficial ni un análisis de laboratorio.{" "}
                  <strong>Ningún nivel significa que el agua sea segura para beber:</strong> mira{" "}
                  <Link href="/que-hacer" className="text-marca underline">qué hacer</Link>.{" "}
                  <Link href="/metodologia" className="text-marca underline">Cómo se calcula</Link>.
                </p>
              </div>

              {/* Historial: desde el primer reporte (mínimo 30 días) */}
              <section aria-labelledby="serie-t" className="mt-5">
                <h3 id="serie-t" className="text-sm font-bold">Historial de reportes</h3>
                {carga.estado === "cargando" && (
                  <p className="mt-2 animate-pulse text-xs text-texto-tenue">Cargando el historial…</p>
                )}
                {carga.estado === "error" && (
                  <p className="mt-2 text-xs text-[#3b4f5c]">
                    No pudimos cargar el historial ni los reportes publicados.{" "}
                    <button
                      type="button"
                      onClick={() => { setCarga({ estado: "cargando" }); setIntento((i) => i + 1); }}
                      className="text-marca underline"
                    >
                      Reintentar
                    </button>
                  </p>
                )}
                {rep && rep.serie.length > 0 && <Sparkline serie={rep.serie} />}
                {rep && rep.serie.length === 0 && (
                  <p className="mt-2 text-xs text-[#3b4f5c]">Aún no hay reportes de vecinos en esta colonia.</p>
                )}
              </section>

              {detalle?.comentarios && <ComentariosVecinos comentarios={detalle.comentarios} />}

              {detalle && <DatosOficiales datos={detalle.oficial} />}

              <Compartir
                id={colonia.id}
                nombre={colonia.nombre}
                municipio={colonia.municipio}
                etiquetaNivel={nivel != null ? etiquetaNivel(nivel) : null}
                confianza={nivel != null ? confianza : null}
              />

              <p className="mt-5 text-xs text-texto-tenue">
                ¿El agua te enferma o ya la reportaste y nadie responde? Mira{" "}
                <Link href="/que-hacer" className="text-marca underline">qué hacer</Link> y{" "}
                <Link href="/denunciar" className="text-marca underline">dónde denunciar</Link>.
              </p>
              {colonia.fuente_geom && (
                <p className="mt-2 text-xs text-texto-tenue">
                  Límites de la colonia: {FUENTES_GEOM[colonia.fuente_geom] ?? "aproximados y no oficiales"}.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Acciones: en escritorio sigue el buscador; en móvil, compartir */}
      <div className="flex shrink-0 items-center gap-2 p-2.5">
        {buscador && <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">{buscador}</div>}
        <button
          type="button"
          onClick={() => {
            irACompartir.current = true;
            setModo("detalle");
          }}
          aria-label="Compartir esta colonia"
          className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-[15px] bg-white/[0.08] text-lg hover:bg-white/15 md:hidden"
        >
          <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          onClick={() => alternar("reportar")}
          aria-expanded={modo === "reportar"}
          aria-controls={idHoja}
          className={`h-[3.25rem] flex-1 rounded-[15px] px-5 text-base font-bold md:h-12 md:flex-none md:text-[0.9375rem] ${
            modo === "reportar" ? "bg-white/[0.12] text-white hover:bg-white/20" : "bg-acento text-tinta hover:bg-acento-fuerte"
          }`}
        >
          {modo === "reportar" ? "Ver la ficha" : "Reportar esta colonia"}
        </button>
      </div>
    </article>
  );
}
