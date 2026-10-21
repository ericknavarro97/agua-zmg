"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buscarColoniasConTotal, coloniaEnPunto, coloniasCercanas, construirIndice, unirBbox,
  type Bbox,
} from "./geo";
import Leyenda from "./Leyenda";
import ListaColonias from "./ListaColonias";
import MapView, { type EstadoMapa, type Foco } from "./MapView";
import NavPrincipal from "./NavPrincipal";
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
/**
 * Tras un reporte, cuándo volver a pedir los niveles. El servidor los recalcula como mucho cada 10 s y en segundo plano
 * (MIN_REFRESCO_MS en lib/aggregation.ts): la primera petición dispara el recálculo y la segunda ya lo recibe.
 */
const ESPERAS_TRAS_REPORTE_MS = [15_000, 30_000];

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
  // La persona tocó «Reportar» antes de elegir colonia: al elegirla, se abre directo el formulario
  const [quiereReportar, setQuiereReportar] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  const campoBusqueda = useRef<HTMLInputElement>(null);

  // Altura real del dock -> variable CSS: la lista y los controles del mapa en móvil no quedan tapados
  useEffect(() => {
    const el = dock.current;
    const r = raiz.current;
    if (!el || !r || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      r.style.setProperty("--alto-dock", `${el.offsetHeight}px`);
      // Dock casi a pantalla completa (hoja abierta en móvil): los controles del mapa no caben encima
      r.toggleAttribute("data-dock-alto", el.offsetHeight > r.offsetHeight * 0.6);
    };
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
  // Tras un reporte se vuelve a pedir pasados unos segundos, sin la caché del navegador ni la de la CDN.
  const fresco = useRef(false);
  const trasReportar = useCallback(() => {
    for (const ms of ESPERAS_TRAS_REPORTE_MS) {
      window.setTimeout(() => {
        fresco.current = true;
        setTickScores((t) => t + 1);
      }, ms);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    const forzar = fresco.current;
    fresco.current = false;
    fetch(forzar ? `/api/colonias/scores?fresco=${Date.now()}` : "/api/colonias/scores", forzar ? { cache: "no-store" } : undefined)
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

  // La intención de reportar solo aplica a la primera colonia que se elija después
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sel != null) setQuiereReportar(false);
  }, [sel]);

  const cerrar = useCallback(() => {
    setSelElegida(null);
    setQuiereReportar(false);
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


  function pedirReporte() {
    // Para reportar hace falta saber de qué colonia: se busca primero y el formulario se abre al elegirla
    setQuiereReportar(true);
    setMsgUbicacion({ tipo: "info", texto: "Primero elige tu colonia: escribe su nombre o usa tu ubicación." });
    campoBusqueda.current?.focus();
  }

  const accionDock = "flex shrink-0 items-center justify-center rounded-[15px] bg-white/[0.08] text-white hover:bg-white/15";
  const pildora =
    "pointer-events-auto inline-flex h-11 items-center rounded-full bg-white px-4 text-sm text-tinta shadow-[0_4px_16px_rgba(11,34,51,0.16)] md:h-[2.875rem]";

  // Resumen de arriba: corto a la vista; completo (con la condición de confianza) para lectores de pantalla
  const resumenCompleto =
    resumen.conNivel === 0
      ? "Todavía no hay colonias con nivel publicado."
      : `${resumen.conNivel} ${resumen.conNivel === 1 ? "colonia con nivel publicado" : "colonias con nivel publicado"}; ${resumen.afectadas} en nivel moderado o más con confianza media o alta.`;

  // Avisos de esta pantalla, todos en un solo lugar: arriba dentro del dock
  const avisos: { clave: string; contenido: ReactNode; tipo: "alerta" | "info"; vivo?: boolean }[] = [];
  if (msgUbicacion)
    avisos.push({
      clave: "ubicacion",
      tipo: msgUbicacion.tipo === "error" ? "alerta" : "info",
      vivo: true,
      contenido: (
        <>
          <p>{msgUbicacion.texto}</p>
          {msgUbicacion.tipo === "cerca" && msgUbicacion.cercanas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {msgUbicacion.cercanas.map(({ f, km }) => (
                <li key={f.properties.id}>
                  <button
                    type="button"
                    onClick={() => seleccionar(f.properties.id)}
                    className="min-h-9 text-left text-white underline"
                  >
                    {f.properties.nombre} ({f.properties.municipio}) · a unos {km < 1 ? "menos de 1" : Math.round(km)} km
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    });
  if (!enLinea)
    avisos.push({ clave: "offline", tipo: "alerta", vivo: true, contenido: "Sin conexión: lo que ves puede estar desactualizado." });
  if (errorScores && cargaGeo === "ok")
    avisos.push({
      clave: "scores",
      tipo: "alerta",
      vivo: true,
      contenido: (
        <>
          No pudimos actualizar los niveles.{" "}
          <button type="button" onClick={cargarScores} className="font-semibold text-acento underline">
            Reintentar
          </button>
        </>
      ),
    });
  if (avisoEnlace) avisos.push({ clave: "enlace", tipo: "alerta", vivo: true, contenido: avisoEnlace });
  if (!sel) {
    if (mapaRespaldo)
      avisos.push({ clave: "calles", tipo: "info", contenido: "No pudimos cargar el mapa de calles; mostramos solo las colonias." });
    if (geomRespaldo)
      avisos.push({
        clave: "geom",
        tipo: "info",
        contenido: "Parte de los límites son de respaldo (áreas estadísticas, no colonias) y aproximados.",
      });
    if (cargaGeo === "ok" && resumen.conNivel === 0 && !errorScores && vista === "mapa" && mapaEstado === "listo")
      avisos.push({
        clave: "vacio",
        tipo: "info",
        contenido: "Aún no hay colonias con nivel publicado. Elige la tuya y sé la primera persona en reportar.",
      });
  }

  const buscador = (
    <>
      <div className="relative min-w-0 flex-1">
        <label htmlFor="buscar" className="sr-only">Busca tu colonia</label>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2"
          fill="none"
          stroke="var(--gris-dock)"
          strokeWidth="2.4"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <line x1="15.5" y1="15.5" x2="21" y2="21" />
        </svg>
        <input
          ref={campoBusqueda}
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
          placeholder={sel ? "Busca otra colonia…" : "Busca tu colonia…"}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="resultados-busqueda"
          aria-expanded={listaAbierta}
          aria-activedescendant={listaAbierta && idxActivo >= 0 ? `res-${resultados[idxActivo].properties.id}` : undefined}
          enterKeyHint="search"
          className="h-[3.25rem] w-full rounded-[15px] border border-transparent bg-white/[0.08] pl-10 pr-3 text-base text-white outline-none placeholder:text-gris-dock focus:border-white/40 md:h-12 md:text-[0.9375rem]"
        />
        {/* Resultados hacia arriba: el dock está abajo */}
        {sinCoincidencias && (
          <p className="absolute bottom-full z-30 mb-2 w-full min-w-[15rem] rounded-2xl bg-white px-3.5 py-2.5 text-sm text-tinta shadow-[0_16px_40px_rgba(11,34,51,0.3)]">
            No encontramos colonias con ese nombre. Revisa cómo está escrito o prueba con otra parte del nombre.
          </p>
        )}
        {listaAbierta && (
          <div className="absolute bottom-full z-30 mb-2 w-full min-w-[15rem] overflow-hidden rounded-2xl bg-white text-tinta shadow-[0_16px_40px_rgba(11,34,51,0.3)]">
            <ul id="resultados-busqueda" role="listbox" aria-label="Colonias encontradas" className="max-h-64 overflow-auto p-1.5">
              {resultados.map((f, i) => (
                <li
                  key={f.properties.id}
                  id={`res-${f.properties.id}`}
                  role="option"
                  aria-selected={i === idxActivo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => seleccionar(f.properties.id)}
                  className={`flex min-h-11 cursor-pointer items-center rounded-xl px-3 py-2 text-left text-[0.9375rem] hover:bg-niebla ${i === idxActivo ? "bg-acento" : ""}`}
                >
                  <span>
                    {f.properties.nombre}
                    <span className="sr-only">, </span>
                    <span className="mono-etiqueta ml-2 !text-[0.65rem] text-texto-tenue">{f.properties.municipio}</span>
                  </span>
                </li>
              ))}
            </ul>
            {totalResultados > resultados.length && (
              <p className="border-t border-borde px-3.5 py-2 text-xs text-texto-tenue">
                {totalResultados - resultados.length} colonias más: escribe más letras para afinar.
              </p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={usarUbicacion}
        aria-label={ubicando ? "Buscando tu ubicación" : "Usar mi ubicación para encontrar mi colonia"}
        title="Usar mi ubicación"
        disabled={ubicando || cargaGeo !== "ok"}
        className={`${accionDock} h-[3.25rem] w-[3.25rem] disabled:opacity-50 md:h-12 md:w-12`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-[19px] w-[19px] ${ubicando ? "animate-pulse" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
    </>
  );

  // Controles de la esquina superior derecha (se pasan a la navegación flotante)
  const controles = (
    <>
      {/* En móvil el filtro de municipio está en la lista (no cabe junto al logo) */}
      <div className="hidden md:block">
        <label htmlFor="municipio" className="sr-only">Municipio</label>
        <select
          id="municipio"
          value={municipio}
          onChange={(e) => cambiarMunicipio(e.target.value)}
          className={`${pildora} max-w-[14rem] cursor-pointer appearance-none pr-9`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%230b2233' stroke-width='1.8'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 14px center",
            backgroundSize: "11px",
          }}
        >
          <option value="">Todos los municipios</option>
          {municipios.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => cambiarVista(vista === "mapa" ? "lista" : "mapa")}
        disabled={mapaFallo && vista === "lista"}
        className={`${pildora} font-medium disabled:hidden`}
      >
        {vista === "mapa" ? "Ver lista" : "Ver mapa"}
      </button>
    </>
  );

  return (
    <div ref={raiz} className="mapa-dock relative isolate flex-1 overflow-clip bg-[#eef0f2]">
      <h1 className="sr-only">¿Cómo está el agua en tu colonia? Mapa de lo que reportan los vecinos en la Zona Metropolitana de Guadalajara</h1>

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
          municipios={municipios}
          onMunicipio={cambiarMunicipio}
          consulta={busqueda}
          seleccionId={sel}
          onSeleccionar={seleccionar}
        />
      )}

      <NavPrincipal variante="mapa" extra={controles} />

      {/* Resumen: al centro en pantallas anchas, bajo el logo en las demás */}
      {cargaGeo === "ok" && (
        <p
          title={resumenCompleto}
          className={`mono-etiqueta pointer-events-none absolute left-3 top-[4.25rem] z-20 rounded-xl ${sel ? "max-md:hidden" : ""} bg-tinta px-2.5 py-1.5 !text-[0.65rem] text-[#e6edf2] md:left-4 md:top-[4.75rem] lg:left-1/2 lg:top-[1.375rem] lg:-translate-x-1/2 lg:rounded-2xl lg:px-3.5 lg:py-2 lg:!text-xs`}
        >
          <span aria-hidden="true">
            {resumen.conNivel === 0 ? (
              "Aún sin colonias con nivel"
            ) : (
              <>
                {resumen.conNivel} <span className="lg:hidden">con nivel</span>
                <span className="hidden lg:inline">{resumen.conNivel === 1 ? "colonia con nivel" : "colonias con nivel"}</span>
                {" · "}
                {resumen.afectadas} <span className="lg:hidden">moderado+</span>
                <span className="hidden lg:inline">moderado o más</span>
              </>
            )}
          </span>
          <span className="sr-only">{resumenCompleto}</span>
        </p>
      )}

      {vista === "mapa" && <Leyenda variante="tarjeta" className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 md:block" />}

      {/* Estados de carga / error / vacío */}
      {cargaGeo !== "ok" && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center p-6 pb-56">
          <div role="status" className="max-w-sm rounded-[20px] bg-white p-5 text-center text-tinta shadow-[0_16px_44px_rgba(11,34,51,0.25)]">
            {cargaGeo === "cargando" && (
              <span aria-hidden="true" className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-4 border-borde border-t-tinta" />
            )}
            <p className="font-medium">{textoCarga}</p>
            {cargaGeo === "error" && (
              <>
                <button
                  type="button"
                  onClick={() => setIntentoGeo((i) => i + 1)}
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[15px] bg-tinta px-4 text-sm font-semibold text-white hover:bg-[#13334a]"
                >
                  Reintentar
                </button>
                <p className="mt-3 text-sm text-[#3b4f5c]">
                  Mientras tanto, lee <Link href="/que-hacer" className="text-marca underline">qué hacer con agua turbia</Link> y{" "}
                  <Link href="/denunciar" className="text-marca underline">dónde denunciar</Link>.
                </p>
              </>
            )}
            {cargaGeo === "cargando" && !enLinea && <p className="mt-2 text-sm text-[#3b4f5c]">Parece que no hay internet.</p>}
          </div>
        </div>
      )}

      <p className="mono-etiqueta pointer-events-none absolute bottom-4 left-4 z-10 hidden rounded-lg bg-white/90 px-2.5 py-1.5 !text-[0.6875rem] text-[#334155] md:block">
        Información ciudadana, no oficial
      </p>

      {/* Dock: buscar, ubicarme y reportar; con una colonia elegida, crece hacia arriba con su ficha */}
      <section
        ref={dock}
        aria-label={coloniaSel ? `Colonia ${coloniaSel.properties.nombre}` : "Buscar y reportar"}
        className={`oscuro absolute inset-x-3 bottom-3.5 z-20 flex max-h-[calc(100%-5.5rem)] flex-col rounded-3xl bg-tinta text-white shadow-[0_14px_40px_rgba(11,34,51,0.4)] md:inset-x-auto md:bottom-5 md:left-1/2 md:max-h-[calc(100%-6.5rem)] md:w-[40rem] md:max-w-[calc(100%-2rem)] md:-translate-x-1/2 md:rounded-[22px] md:shadow-[0_16px_44px_rgba(11,34,51,0.4)] ${
          coloniaSel ? "" : "p-3 md:p-2.5"
        }`}
      >
        {avisos.length > 0 && (
          <div className={`flex shrink-0 flex-col gap-1.5 ${coloniaSel ? "px-2.5 pt-2.5" : "pb-2.5"}`}>
            {avisos.map((a) => (
              <div
                key={a.clave}
                role={a.vivo ? "status" : undefined}
                className={`rounded-xl bg-white/[0.07] px-3 py-2 text-[0.8125rem] leading-snug text-[#e6edf2] ${
                  a.tipo === "alerta" ? "border-l-[3px] border-acento" : ""
                }`}
              >
                {a.contenido}
              </div>
            ))}
          </div>
        )}

        {coloniaSel ? (
          <PanelColonia
            key={coloniaSel.properties.id}
            colonia={coloniaSel.properties}
            score={scores[coloniaSel.properties.id]}
            modoInicial={quiereReportar ? "reportar" : "ficha"}
            buscador={buscador}
            onCerrar={cerrar}
            onReportado={trasReportar}
          />
        ) : (
          <>
            <Leyenda variante="fila" className="md:hidden" />
            <div className="flex items-center gap-2">
              {buscador}
              <button
                type="button"
                onClick={pedirReporte}
                className="hidden h-12 shrink-0 rounded-[15px] bg-acento px-5 text-[0.9375rem] font-bold text-tinta hover:bg-acento-fuerte md:block"
              >
                Reportar el agua de mi colonia
              </button>
            </div>
            <button
              type="button"
              onClick={pedirReporte}
              className="mt-2 h-[3.25rem] w-full rounded-[15px] bg-acento text-base font-bold text-tinta hover:bg-acento-fuerte md:hidden"
            >
              Reportar el agua de mi colonia
            </button>
            <p className="mono-etiqueta mt-2.5 px-1 text-center !text-[0.6rem] text-gris-dock md:hidden">
              Información ciudadana, no oficial
            </p>
          </>
        )}
      </section>

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
