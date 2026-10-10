"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buscarColoniasConTotal, coloniaEnPunto, coloniasCercanas, construirIndice, unirBbox,
  type Bbox,
} from "./geo";
import Leyenda from "./Leyenda";
import ListaColonias from "./ListaColonias";
import MapView, { type EstadoMapa, type Foco } from "./MapView";
import { etiquetaNivel } from "./niveles";
import PanelColonia from "./PanelColonia";
import type { Externo, FeatureColonia, Geo, Score } from "./tipos";

type CargaGeo = "cargando" | "ok" | "error" | "vacio";
type Vista = "mapa" | "lista";
type MensajeUbicacion =
  | { tipo: "error" | "info"; texto: string }
  | { tipo: "cerca"; texto: string; cercanas: { f: FeatureColonia; km: number }[] }
  | null;

const REFRESCO_SCORES_MS = 120_000;

const sinSuscripcion = () => () => {};
const suscribirConexion = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
type ConexionLenta = Navigator & { connection?: { saveData?: boolean } };

export default function AguaApp() {
  // Lecturas del navegador sin romper la hidratación (en el servidor valen "" / false / true)
  const busquedaUrl = useSyncExternalStore(sinSuscripcion, () => window.location.search, () => "");
  const ahorroDatos = useSyncExternalStore(sinSuscripcion, () => !!(navigator as ConexionLenta).connection?.saveData, () => false);
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  const params = useMemo(() => new URLSearchParams(busquedaUrl), [busquedaUrl]);
  const idDeUrl = Number(params.get("colonia"));

  const [resultadoGeo, setResultadoGeo] = useState<{ clave: string; geo: Geo | null } | null>(null);
  const [intentoGeo, setIntentoGeo] = useState(0);
  const [scores, setScores] = useState<Record<number, Score>>({});
  const [errorScores, setErrorScores] = useState(false);
  const [externos, setExternos] = useState<Record<number, Externo>>({});
  const [tickScores, setTickScores] = useState(0);
  const [selElegida, setSelElegida] = useState<number | null | undefined>(undefined);
  const [vistaElegida, setVistaElegida] = useState<Vista | null>(null);
  const [mapaFallo, setMapaFallo] = useState(false);
  const [municipio, setMunicipio] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [foco, setFoco] = useState<Foco | null>(null);
  const [ubicacion, setUbicacion] = useState<[number, number] | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [msgUbicacion, setMsgUbicacion] = useState<MensajeUbicacion>(null);
  const [anuncio, setAnuncio] = useState("");
  const [mapaEstado, setMapaEstado] = useState<EstadoMapa>("cargando");
  const [mapaRespaldo, setMapaRespaldo] = useState(false);
  const [activo, setActivo] = useState(-1);
  const nonce = useRef(0);
  const raiz = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);

  // Altura real de la tarjeta superior -> variable CSS que usa la lista en móvil para no quedar tapada
  useEffect(() => {
    const el = tarjeta.current;
    const r = raiz.current;
    if (!el || !r || typeof ResizeObserver === "undefined") return;
    const medir = () => r.style.setProperty("--alto-tarjeta", `${el.offsetHeight}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Vista: la elegida; si no, lista cuando hay ?vista=lista o ahorro de datos; si el mapa falla, lista
  const vista: Vista = mapaFallo ? "lista" : (vistaElegida ?? (params.get("vista") === "lista" || ahorroDatos ? "lista" : "mapa"));
  // Con ahorro de datos no se descarga el mapa hasta que la persona lo pida
  const mapaActivado = !(ahorroDatos && vistaElegida !== "mapa") && !mapaFallo;

  // Geometría de las colonias (el resultado guarda para qué petición es: así no hace falta un estado «cargando» manual)
  const claveGeo = `${intentoGeo}`;
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/colonias/geometria", { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Geo>;
      })
      .then((g) => setResultadoGeo({ clave: claveGeo, geo: g }))
      .catch((e) => {
        if (e?.name !== "AbortError") setResultadoGeo({ clave: claveGeo, geo: null });
      });
    return () => ctl.abort();
  }, [claveGeo]);

  const geoCrudo = resultadoGeo?.geo ?? null;
  const cargaGeo: CargaGeo =
    !resultadoGeo || resultadoGeo.clave !== claveGeo
      ? "cargando"
      : !resultadoGeo.geo
        ? "error"
        : resultadoGeo.geo.features?.length
          ? "ok"
          : "vacio";

  // Niveles por colonia: al cargar, cada 2 min con la pestaña visible, y a demanda
  const cargarScores = useCallback(() => setTickScores((t) => t + 1), []);
  useEffect(() => {
    let vivo = true;
    fetch("/api/colonias/scores")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Score[]>;
      })
      .then((data) => {
        if (!vivo) return;
        setScores(Object.fromEntries(data.map((s) => [s.id, s])));
        setErrorScores(false);
      })
      .catch(() => vivo && setErrorScores(true));
    return () => { vivo = false; };
  }, [tickScores]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setTickScores((x) => x + 1);
    }, REFRESCO_SCORES_MS);
    return () => clearInterval(t);
  }, []);

  // Colonias con datos externos (marca del mapa). Si falla, el mapa funciona igual sin la marca.
  useEffect(() => {
    let vivo = true;
    fetch("/api/oficial/colonias")
      .then((res) => (res.ok ? (res.json() as Promise<Externo[]>) : []))
      .then((data) => vivo && setExternos(Object.fromEntries(data.map((e) => [e.id, e]))))
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const features = useMemo<FeatureColonia[]>(() => geoCrudo?.features ?? [], [geoCrudo]);
  const geo = useMemo<Geo | null>(
    () => (geoCrudo ? { type: "FeatureCollection", features } : null),
    [geoCrudo, features],
  );
  const indice = useMemo(() => construirIndice(features), [features]);
  const porId = useMemo(() => new Map(features.map((f) => [f.properties.id, f])), [features]);
  const municipios = useMemo(
    () => [...new Set(features.map((f) => f.properties.municipio).filter((m): m is string => !!m))].sort((a, b) => a.localeCompare(b, "es")),
    [features],
  );
  // Colonia abierta: la que eligió la persona o, al inicio, la del enlace (?colonia=ID)
  const idInicial = Number.isInteger(idDeUrl) && idDeUrl > 0 ? idDeUrl : null;
  const inicialValida = idInicial != null && porId.has(idInicial) ? idInicial : null;
  const sel = selElegida !== undefined ? selElegida : inicialValida;
  const coloniaSel = sel != null ? porId.get(sel) ?? null : null;
  const avisoEnlace =
    cargaGeo === "ok" && selElegida === undefined && idInicial != null && inicialValida == null
      ? "No encontramos la colonia de ese enlace. Puede haber cambiado; búscala por su nombre."
      : mapaFallo
        ? "No pudimos iniciar el mapa (puede que tu navegador no tenga WebGL). Usa la lista de colonias."
        : "";
  const geomRespaldo = features.some((f) => /respaldo|ageb/i.test(f.properties.fuente_geom ?? ""));

  const resumen = useMemo(() => {
    const visibles = Object.values(scores).filter((s) => porId.has(s.id));
    return {
      conNivel: visibles.length,
      afectadas: visibles.filter((s) => s.nivel >= 2 && s.confianza !== "baja").length,
    };
  }, [scores, porId]);

  const enfocar = useCallback((b: Bbox, zoomMax?: number, conPanel = false) => {
    nonce.current += 1;
    setFoco({ bbox: b, nonce: nonce.current, zoomMax, conPanel });
  }, []);

  const bboxDe = useCallback(
    (filtro?: (f: FeatureColonia) => boolean): Bbox | null => {
      let acum: Bbox | null = null;
      for (const f of features) {
        if (filtro && !filtro(f)) continue;
        const ix = indice.get(f.properties.id);
        if (ix) acum = unirBbox(acum, ix.bbox);
      }
      return acum;
    },
    [features, indice],
  );

  const escribirUrl = useCallback((id: number | null) => {
    try {
      const u = new URL(window.location.href);
      if (id == null) u.searchParams.delete("colonia");
      else u.searchParams.set("colonia", String(id));
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* sin historial: no es grave */
    }
  }, []);

  const seleccionar = useCallback(
    (id: number, mover = true) => {
      const f = porId.get(id);
      if (!f) return;
      setSelElegida(id);
      escribirUrl(id);
      setBusqueda("");
      setMsgUbicacion(null);
      if (mover) {
        const ix = indice.get(id);
        if (ix) enfocar(ix.bbox, undefined, true);
      }
      const s = scores[id];
      setAnuncio(
        `${f.properties.nombre}, ${f.properties.municipio ?? ""}. ${s ? `Nivel ${s.nivel}, ${etiquetaNivel(s.nivel)}.` : "Sin datos suficientes."}`,
      );
    },
    [porId, indice, enfocar, escribirUrl, scores],
  );

  const cerrar = useCallback(() => {
    setSelElegida(null);
    escribirUrl(null);
  }, [escribirUrl]);

  // Cámara inicial: la colonia del enlace o toda la zona (memoizada para no mover el mapa en cada render)
  const bboxTotal = useMemo<Bbox | null>(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const ix of indice.values()) {
      xs.push(ix.centro[0]);
      ys.push(ix.centro[1]);
    }
    if (!xs.length) return null;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const q = (v: number[], p: number) => v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * p)))];
    return [q(xs, 0.03), q(ys, 0.03), q(xs, 0.97), q(ys, 0.97)];
  }, [indice]);
  const bboxInicial = inicialValida != null ? indice.get(inicialValida)?.bbox ?? null : null;
  const focoEfectivo = useMemo<Foco | null>(() => {
    if (foco) return foco;
    const b = bboxInicial ?? bboxTotal;
    return cargaGeo === "ok" && b ? { bbox: b, nonce: 0, conPanel: bboxInicial != null } : null;
  }, [foco, bboxInicial, bboxTotal, cargaGeo]);

  function cambiarMunicipio(m: string) {
    setMunicipio(m);
    const b = bboxDe(m ? (f) => f.properties.municipio === m : undefined);
    if (b) enfocar(b, 13);
    setAnuncio(m ? `Mostrando solo ${m}.` : "Mostrando todos los municipios.");
  }

  const { items: resultados, total: totalResultados } = useMemo(
    () => buscarColoniasConTotal(features.filter((f) => !municipio || f.properties.municipio === municipio), busqueda),
    [features, busqueda, municipio],
  );
  const listaAbierta = vista === "mapa" && resultados.length > 0;
  // Sin coincidencias: mensaje visible (la región sr-only de abajo solo la oyen los lectores de pantalla)
  const sinCoincidencias = vista === "mapa" && busqueda.trim().length >= 2 && resultados.length === 0;
  const idxActivo = activo < resultados.length ? activo : -1;

  function usarUbicacion() {
    if (!navigator.geolocation) {
      setMsgUbicacion({ tipo: "error", texto: "Tu navegador no permite usar la ubicación. Busca tu colonia por nombre." });
      return;
    }
    setUbicando(true);
    setMsgUbicacion({ tipo: "info", texto: "Buscando tu ubicación…" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicando(false);
        const { longitude: lng, latitude: lat } = pos.coords;
        setUbicacion([lng, lat]);
        // El cálculo se hace aquí, en tu dispositivo: la ubicación no se envía a ningún servidor
        const f = coloniaEnPunto(lng, lat, features, indice);
        if (f) {
          setMunicipio("");
          seleccionar(f.properties.id);
          setMsgUbicacion({ tipo: "info", texto: `Estás en ${f.properties.nombre}, ${f.properties.municipio ?? ""}.` });
        } else {
          const cercanas = coloniasCercanas(lng, lat, features, indice);
          setMsgUbicacion({
            tipo: "cerca",
            texto: cercanas.length
              ? "Tu ubicación no cae dentro de ninguna colonia del mapa (puede ser una colonia nueva, posterior a 2020). Colonias cercanas:"
              : "Tu ubicación parece estar fuera de la zona metropolitana de Guadalajara o de las colonias que tenemos. Busca tu colonia por nombre.",
            cercanas,
          });
          enfocar([lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01], 14);
        }
      },
      (err) => {
        setUbicando(false);
        setMsgUbicacion({
          tipo: "error",
          texto:
            err.code === err.PERMISSION_DENIED
              ? "No diste permiso para usar tu ubicación. No pasa nada: busca tu colonia por nombre."
              : err.code === err.TIMEOUT
                ? "Tardó demasiado en encontrar tu ubicación. Inténtalo otra vez o busca tu colonia por nombre."
                : "No pudimos obtener tu ubicación. Busca tu colonia por nombre.",
        });
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  function cambiarVista(v: Vista) {
    setVistaElegida(v);
    setAnuncio(v === "mapa" ? "Vista de mapa." : "Vista de lista.");
  }

  const alErrorMapa = useCallback((e: EstadoMapa) => {
    setMapaEstado(e);
    if (e === "error") setMapaFallo(true);
  }, []);

  const textoCarga =
    cargaGeo === "cargando"
      ? "Cargando el mapa de colonias…"
      : cargaGeo === "error"
        ? enLinea
          ? "No pudimos cargar las colonias. Puede ser un problema temporal de nuestro lado."
          : "Sin conexión a internet. Revisa tu red e inténtalo de nuevo."
        : cargaGeo === "vacio"
          ? "Todavía no hay colonias cargadas en esta instalación."
          : "";

  const btnBase =
    "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium";

  return (
    <div ref={raiz} className="relative flex-1 overflow-clip bg-slate-200">
      {mapaActivado && (
        <MapView
          geo={geo}
          scores={scores}
          externos={externos}
          seleccionId={sel}
          municipio={municipio}
          visible={vista === "mapa"}
          foco={focoEfectivo}
          ubicacion={ubicacion}
          indice={indice}
          onSeleccionar={seleccionar}
          onEstado={alErrorMapa}
          onRespaldo={setMapaRespaldo}
        />
      )}

      {vista === "lista" && cargaGeo === "ok" && (
        <ListaColonias
          features={features}
          scores={scores}
          municipio={municipio}
          consulta={busqueda}
          seleccionId={sel}
          conPanel={coloniaSel != null}
          onSeleccionar={seleccionar}
        />
      )}

      {/* Tarjeta superior: título, búsqueda y controles */}
      <div ref={tarjeta} className="absolute inset-x-0 top-0 z-10 p-2 md:inset-x-auto md:left-3 md:top-3 md:w-[23rem] md:p-0">
        <div className="rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-300 backdrop-blur">
          <div className={sel ? "hidden md:block" : ""}>
            <h1 className="text-base font-bold leading-tight text-slate-900 md:text-lg">¿Cómo está el agua en tu colonia?</h1>
            <p className="mt-1 text-xs text-slate-700">
              <span className="hidden md:inline">Mapa de lo que reportan los vecinos en la Zona Metropolitana de Guadalajara.{" "}</span>
              {cargaGeo === "ok" && (
                <strong>
                  {resumen.conNivel === 0
                    ? "Todavía no hay colonias con nivel publicado."
                    : `${resumen.conNivel} ${resumen.conNivel === 1 ? "colonia con nivel publicado" : "colonias con nivel publicado"}; ${resumen.afectadas} en nivel moderado o más con confianza media o alta.`}
                </strong>
              )}{" "}
              Información ciudadana, no oficial.
            </p>
          </div>

          <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="buscar" className="sr-only">Busca tu colonia</label>
            <input
              id="buscar"
              type="search"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setActivo(-1); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && listaAbierta) {
                  e.preventDefault();
                  setActivo((idxActivo + 1) % resultados.length);
                } else if (e.key === "ArrowUp" && listaAbierta) {
                  e.preventDefault();
                  setActivo(idxActivo <= 0 ? resultados.length - 1 : idxActivo - 1);
                } else if (e.key === "Enter" && resultados.length) {
                  seleccionar(resultados[idxActivo >= 0 ? idxActivo : 0].properties.id);
                } else if (e.key === "Escape" && busqueda) {
                  // Limpia el texto sin que el Escape llegue al panel de la colonia abierta
                  e.preventDefault();
                  setBusqueda("");
                  setActivo(-1);
                }
              }}
              placeholder="Busca tu colonia…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="resultados-busqueda"
              aria-expanded={listaAbierta}
              aria-activedescendant={listaAbierta && idxActivo >= 0 ? `res-${resultados[idxActivo].properties.id}` : undefined}
              enterKeyHint="search"
              className="h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base outline-none placeholder:text-slate-600 focus:border-sky-700"
            />
            {sinCoincidencias && (
              <p className="absolute z-30 mt-1 w-full min-w-[15rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-lg">
                No encontramos colonias con ese nombre. Revisa cómo está escrito o prueba con otra parte del nombre.
              </p>
            )}
            {listaAbierta && (
              <div className="absolute z-30 mt-1 w-full min-w-[15rem] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
                <ul id="resultados-busqueda" role="listbox" aria-label="Colonias encontradas" className="max-h-64 overflow-auto">
                  {resultados.map((f, i) => (
                    <li
                      key={f.properties.id}
                      id={`res-${f.properties.id}`}
                      role="option"
                      aria-selected={i === idxActivo}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => seleccionar(f.properties.id)}
                      className={`flex min-h-11 cursor-pointer items-center px-3 py-2 text-left text-sm hover:bg-slate-100 ${i === idxActivo ? "bg-sky-100" : ""}`}
                    >
                      <span>
                        {f.properties.nombre}
                        <span className="sr-only">, </span>
                        <span className="ml-2 text-xs text-slate-600">{f.properties.municipio}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {totalResultados > resultados.length && (
                  <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-700">
                    {totalResultados - resultados.length} colonias más: escribe más letras para afinar.
                  </p>
                )}
              </div>
            )}
          </div>
            <button
              type="button"
              onClick={usarUbicacion}
              aria-label="Usar mi ubicación para encontrar mi colonia"
              disabled={ubicando || cargaGeo !== "ok"}
              className={`${btnBase} shrink-0 bg-sky-800 text-white hover:bg-sky-900 disabled:opacity-50`}
            >
              {ubicando ? "Buscando…" : "Mi ubicación"}
            </button>
          </div>

          <div className={`mt-2 items-center gap-2 ${sel ? "hidden md:flex" : "flex"}`}>
            <label htmlFor="municipio" className="sr-only">Municipio</label>
            <select
              id="municipio"
              value={municipio}
              onChange={(e) => cambiarMunicipio(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-400 bg-white px-2 text-sm"
            >
              <option value="">Todos los municipios</option>
              {municipios.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div role="group" aria-label="Tipo de vista" className="flex overflow-hidden rounded-lg border border-slate-400">
              {(["mapa", "lista"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  onClick={() => cambiarVista(v)}
                  className={`${btnBase} rounded-none ${vista === v ? "bg-slate-900 text-white" : "bg-white text-slate-900 hover:bg-slate-100"}`}
                >
                  {v === "mapa" ? "Mapa" : "Lista"}
                </button>
              ))}
            </div>
          </div>

          {msgUbicacion && (
            <div role="status" className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-950 ring-1 ring-sky-200">
              <p>{msgUbicacion.texto}</p>
              {msgUbicacion.tipo === "cerca" && msgUbicacion.cercanas.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {msgUbicacion.cercanas.map(({ f, km }) => (
                    <li key={f.properties.id}>
                      <button
                        type="button"
                        onClick={() => seleccionar(f.properties.id)}
                        className="min-h-9 text-left text-sky-900 underline"
                      >
                        {f.properties.nombre} ({f.properties.municipio}) · a unos {km < 1 ? "menos de 1" : Math.round(km)} km
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={sel ? "hidden md:block" : ""}>
            {!enLinea && (
              <p role="status" className="mt-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-950 ring-1 ring-amber-400">
                Sin conexión: lo que ves puede estar desactualizado.
              </p>
            )}
            {errorScores && cargaGeo === "ok" && (
              <p role="status" className="mt-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-950 ring-1 ring-amber-400">
                No pudimos actualizar los niveles.{" "}
                <button type="button" onClick={cargarScores} className="underline">Reintentar</button>
              </p>
            )}
            {mapaRespaldo && (
              <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs text-slate-800 ring-1 ring-slate-300">
                No pudimos cargar el mapa de calles; mostramos solo las colonias.
              </p>
            )}
            {geomRespaldo && (
              <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs text-slate-800 ring-1 ring-slate-300">
                Parte de los límites son de respaldo (áreas estadísticas, no colonias) y aproximados.
              </p>
            )}
            {avisoEnlace && (
              <p role="status" className="mt-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-950 ring-1 ring-amber-400">
                {avisoEnlace}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Estados de carga / error / vacío */}
      {cargaGeo !== "ok" && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center p-6 pt-52">
          <div role="status" className="max-w-sm rounded-xl bg-white p-5 text-center shadow-xl ring-1 ring-slate-300">
            {cargaGeo === "cargando" && (
              <span aria-hidden="true" className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-sky-800" />
            )}
            <p className="font-medium text-slate-900">{textoCarga}</p>
            {cargaGeo === "error" && (
              <>
                <button
                  type="button"
                  onClick={() => setIntentoGeo((i) => i + 1)}
                  className={`${btnBase} mt-3 bg-sky-800 text-white hover:bg-sky-900`}
                >
                  Reintentar
                </button>
                <p className="mt-3 text-sm text-slate-700">
                  Mientras tanto, lee <Link href="/que-hacer" className="text-sky-800 underline">qué hacer con agua turbia</Link> y{" "}
                  <Link href="/denunciar" className="text-sky-800 underline">dónde denunciar</Link>.
                </p>
              </>
            )}
            {cargaGeo === "cargando" && !enLinea && (
              <p className="mt-2 text-sm text-slate-700">Parece que no hay internet.</p>
            )}
          </div>
        </div>
      )}

      {cargaGeo === "ok" && resumen.conNivel === 0 && !errorScores && !sel && vista === "mapa" && mapaEstado === "listo" && (
        <p className="pointer-events-none absolute inset-x-4 top-[15rem] z-[5] mx-auto hidden max-w-sm rounded-xl bg-white/95 p-3 text-center text-sm text-slate-800 shadow ring-1 ring-slate-300 md:block md:top-auto md:bottom-24 md:left-3 md:mx-0 md:max-w-[23rem] md:text-left">
          Aún no hay colonias con nivel publicado. Elige la tuya y sé la primera persona en reportar.
        </p>
      )}

      {vista === "mapa" && (
        <Leyenda
          className={`absolute bottom-2 left-2 right-14 z-10 md:bottom-3 md:left-3 md:right-auto md:w-[23rem] ${sel ? "hidden md:block" : ""}`}
        />
      )}

      {coloniaSel && (
        <PanelColonia
          key={coloniaSel.properties.id}
          colonia={coloniaSel.properties}
          score={scores[coloniaSel.properties.id]}
          onCerrar={cerrar}
          onReportado={cargarScores}
        />
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {busqueda.trim().length >= 2
          ? resultados.length
            ? `${totalResultados} ${totalResultados === 1 ? "colonia encontrada" : "colonias encontradas"}.`
            : "No hay colonias con ese nombre."
          : anuncio}
      </div>
    </div>
  );
}

