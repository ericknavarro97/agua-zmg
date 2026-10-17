"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { GRAVEDADES, SIN_DATOS_COLOR } from "@/lib/severity";
import type { Bbox, Indice } from "./geo";
import { nivelExterno } from "./externos";
import { NOMBRE_PATRON, crearPatron } from "./patrones";
import type { Externo, Geo, Score } from "./tipos";

// Mapa base: OpenFreeMap (gratuito, sin llave). El servidor público de OSM no admite tráfico alto.
// Se puede cambiar con NEXT_PUBLIC_MAP_STYLE_URL.
const ESTILO_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/positron";
const CENTRO: [number, number] = [-103.3496, 20.6597];

const ESTILO_VACIO: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "fondo", type: "background", paint: { "background-color": "#e8eef3" } }],
};

const TEXTOS_ES: Record<string, string> = {
  "NavigationControl.ZoomIn": "Acercar",
  "NavigationControl.ZoomOut": "Alejar",
  "NavigationControl.ResetBearing": "Orientar al norte",
  "AttributionControl.ToggleAttribution": "Mostrar créditos del mapa",
  "AttributionControl.MapFeedback": "Comentarios sobre el mapa",
  "FullscreenControl.Enter": "Pantalla completa",
  "FullscreenControl.Exit": "Salir de pantalla completa",
  "MapLibreCanvasMap": "Mapa de colonias. Si prefieres una lista, usa el botón «Lista» de arriba.",
};

export type Foco = { bbox: Bbox; nonce: number; zoomMax?: number; conPanel?: boolean };
export type EstadoMapa = "cargando" | "listo" | "error";

type Props = {
  geo: Geo | null;
  scores: Record<number, Score>;
  externos: Record<number, Externo>;
  seleccionId: number | null;
  municipio: string;
  visible: boolean;
  foco: Foco | null;
  ubicacion: [number, number] | null;
  indice: Map<number, Indice>;
  onSeleccionar: (id: number) => void;
  onEstado: (e: EstadoMapa) => void;
  onRespaldo: (usandoRespaldo: boolean) => void;
};

/** Descarga el estilo del mapa base con tiempo límite; si falla se usa un fondo liso y las colonias siguen visibles */
async function cargarEstilo(): Promise<{ estilo: StyleSpecification; respaldo: boolean }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(ESTILO_URL, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(String(res.status));
    return { estilo: (await res.json()) as StyleSpecification, respaldo: false };
  } catch {
    return { estilo: ESTILO_VACIO, respaldo: true };
  }
}

// -1 = sin datos (el 0 es un nivel válido: «Limpia»)
const NIVEL_ESTADO = ["coalesce", ["feature-state", "nivel"], -1] as const;
// El resaltado al pasar el mouse se aplica en todas las capas de relleno (base, tramas y datos externos)
const FUENTES_HOVER = ["colonias", "colonias-nivel", "colonias-externos"] as const;
const COLORES_NIVEL = GRAVEDADES.flatMap((g) => [g.nivel, g.color]);

export default function MapView(props: Props) {
  const { geo, scores, externos, seleccionId, municipio, visible, foco, ubicacion } = props;
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  // Inicializa el mapa (una sola vez, sin bloquear el resto de la página)
  useEffect(() => {
    let cancelado = false;
    let map: MLMap | null = null;

    (async () => {
      try {
        const [ml, { estilo, respaldo }] = await Promise.all([import("maplibre-gl"), cargarEstilo()]);
        if (cancelado || !contenedor.current) return;
        // Turbopack no resuelve el worker de MapLibre; se sirve desde /public (script copy:maplibre)
        ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        cb.current.onRespaldo(respaldo);

        map = new ml.Map({
          container: contenedor.current,
          center: CENTRO,
          zoom: 10,
          minZoom: 8,
          style: estilo,
          locale: TEXTOS_ES,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        mapa.current = map;
        map.touchZoomRotate.disableRotation();
        map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");

        map.on("load", () => {
          if (!map) return;
          const primeraEtiqueta = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

          // Tramas por nivel
          for (const n of [0, 1, 2, 3, 4] as const) {
            const p = crearPatron(n);
            if (p) map.addImage(NOMBRE_PATRON(n), p, { pixelRatio: 2 });
          }

          map.addSource("colonias", { type: "geojson", data: { type: "FeatureCollection", features: [] }, tolerance: 0.8 });
          map.addSource("colonias-nivel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addSource("colonias-externos", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addSource("ubicacion", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

          // Transparentes en reposo (se ven calles y contornos para ubicar la colonia); fuertes al pasar el mouse
          const HOVER = ["boolean", ["feature-state", "hover"], false];
          const opacidad = (baja: unknown, resto: unknown) => [
            "case",
            HOVER, ["case", ["==", NIVEL_ESTADO, -1], 0.45, 0.82],
            ["==", NIVEL_ESTADO, -1], 0.08,
            ["==", ["feature-state", "conf"], 1], baja,
            resto,
          ];

          map.addLayer(
            {
              id: "colonias-fill",
              type: "fill",
              source: "colonias",
              paint: {
                "fill-color": ["match", NIVEL_ESTADO, ...COLORES_NIVEL, SIN_DATOS_COLOR] as never,
                "fill-opacity": opacidad(0.2, 0.34) as never,
              },
            },
            primeraEtiqueta,
          );
          // Tramas solo en colonias con nivel (fuente aparte, pequeña)
          map.addLayer(
            {
              id: "colonias-patron",
              type: "fill",
              source: "colonias-nivel",
              paint: {
                "fill-pattern": ["match", ["get", "nivel"], 0, "patron-0", 2, "patron-2", 3, "patron-3", 4, "patron-4", "patron-1"] as never,
                "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0, 12.5, ["case", HOVER, 0.9, ["match", ["get", "conf"], "baja", 0.3, 0.5]]] as never,
              },
            },
            primeraEtiqueta,
          );
          // Datos externos: misma escala de color y trama que la gravedad, pero por cantidad de datos (solo colonias sin nivel)
          map.addLayer(
            {
              id: "externos-fill",
              type: "fill",
              source: "colonias-externos",
              paint: {
                "fill-color": ["match", ["get", "nivel"], ...COLORES_NIVEL, SIN_DATOS_COLOR] as never,
                "fill-opacity": ["case", HOVER, 0.85, 0.34] as never,
              },
            },
            primeraEtiqueta,
          );
          map.addLayer(
            {
              id: "externos-patron",
              type: "fill",
              source: "colonias-externos",
              paint: {
                "fill-pattern": ["match", ["get", "nivel"], 2, "patron-2", 3, "patron-3", 4, "patron-4", "patron-1"] as never,
                "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0, 12.5, ["case", HOVER, 0.9, 0.5]] as never,
              },
            },
            primeraEtiqueta,
          );
          map.addLayer(
            {
              id: "colonias-line",
              type: "line",
              source: "colonias",
              paint: {
                "line-color": "#64748b",
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.16, 12, 0.38, 15, 0.7] as never,
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.25, 13, 0.8, 16, 1.5] as never,
              },
            },
            primeraEtiqueta,
          );
          map.addLayer({
            id: "colonias-sel-borde",
            type: "line",
            source: "colonias",
            filter: ["==", ["id"], -1],
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 },
            layout: { "line-join": "round" },
          });
          map.addLayer({
            id: "colonias-sel",
            type: "line",
            source: "colonias",
            filter: ["==", ["id"], -1],
            paint: { "line-color": "#0f172a", "line-width": 3.5 },
            layout: { "line-join": "round" },
          });
          map.addLayer({
            id: "ubicacion-halo",
            type: "circle",
            source: "ubicacion",
            paint: { "circle-radius": 16, "circle-color": "#0369a1", "circle-opacity": 0.2 },
          });
          map.addLayer({
            id: "ubicacion-punto",
            type: "circle",
            source: "ubicacion",
            paint: { "circle-radius": 7, "circle-color": "#0369a1", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
          });

          // Interacción
          let hover: number | null = null;
          const quitarHover = () => {
            if (hover != null) for (const source of FUENTES_HOVER) map!.setFeatureState({ source, id: hover }, { hover: false });
            hover = null;
          };
          map.on("mousemove", "colonias-fill", (e: MapLayerMouseEvent) => {
            map!.getCanvas().style.cursor = "pointer";
            const id = elegirMasEspecifica(e, cb.current.indice);
            if (id == null || id === hover) return;
            quitarHover();
            hover = id;
            for (const source of FUENTES_HOVER) map!.setFeatureState({ source, id }, { hover: true });
          });
          map.on("mouseleave", "colonias-fill", () => {
            map!.getCanvas().style.cursor = "";
            quitarHover();
          });
          map.on("click", "colonias-fill", (e: MapLayerMouseEvent) => {
            const id = elegirMasEspecifica(e, cb.current.indice);
            if (id != null) cb.current.onSeleccionar(id);
          });

          setListo(true);
          cb.current.onEstado("listo");
        });

        map.on("error", (ev) => {
          // Los errores de teselas del mapa base (sin red) no deben tirar la app: las colonias no dependen de ellas
          const msg = String((ev.error as { message?: string } | undefined)?.message ?? "");
          if (/style|sprite|glyph/i.test(msg) && !mapa.current?.isStyleLoaded()) cb.current.onRespaldo(true);
        });
      } catch {
        if (!cancelado) cb.current.onEstado("error");
      }
    })();

    return () => {
      cancelado = true;
      map?.remove();
      mapa.current = null;
      setListo(false);
    };
  }, []);

  // Geometría
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m || !geo) return;
    (m.getSource("colonias") as GeoJSONSource).setData(geo);
  }, [listo, geo]);

  // Nivel y confianza de cada colonia (feature-state) + fuente de tramas
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m || !geo) return;
    const conNivel: GeoJSON.Feature[] = [];
    for (const f of geo.features) {
      const s = scores[f.properties.id];
      const nivel = s ? s.nivel : -1;
      const conf = s ? (s.confianza === "baja" ? 1 : s.confianza === "media" ? 2 : 3) : 0;
      m.setFeatureState({ source: "colonias", id: f.properties.id }, { nivel, conf });
      if (s) {
        conNivel.push({
          type: "Feature",
          id: f.properties.id,
          properties: { nivel: s.nivel, conf: s.confianza, municipio: f.properties.municipio },
          geometry: f.geometry,
        });
      }
    }
    (m.getSource("colonias-nivel") as GeoJSONSource).setData({ type: "FeatureCollection", features: conNivel });
  }, [listo, geo, scores]);

  // Datos externos: relleno por cantidad (fuente aparte). Si la colonia ya tiene nivel de gravedad, manda el nivel.
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m || !geo) return;
    const features: GeoJSON.Feature[] = [];
    for (const f of geo.features) {
      const e = externos[f.properties.id];
      if (e && !scores[f.properties.id]) {
        features.push({
          type: "Feature",
          id: f.properties.id,
          properties: { municipio: f.properties.municipio, nivel: nivelExterno(e.n) },
          geometry: f.geometry,
        });
      }
    }
    (m.getSource("colonias-externos") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [listo, geo, externos, scores]);

  // Filtro por municipio de la capa de datos
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    for (const capa of ["externos-fill", "externos-patron"]) {
      m.setFilter(capa, (municipio ? ["==", ["get", "municipio"], municipio] : null) as never);
    }
  }, [listo, municipio, externos, geo]);

  // Filtro por municipio
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    const filtro = municipio ? (["==", ["get", "municipio"], municipio] as never) : null;
    for (const capa of ["colonias-fill", "colonias-line"]) m.setFilter(capa, filtro);
    m.setFilter(
      "colonias-patron",
      municipio ? (["==", ["get", "municipio"], municipio] as never) : null,
    );
  }, [listo, municipio, geo, scores]);

  // Colonia seleccionada
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    const f = ["==", ["id"], seleccionId ?? -1] as never;
    m.setFilter("colonias-sel", f);
    m.setFilter("colonias-sel-borde", f);
  }, [listo, seleccionId]);

  // Mover la cámara
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m || !foco) return;
    const movil = window.innerWidth < 768;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alto = m.getContainer().clientHeight;
    m.fitBounds(
      [[foco.bbox[0], foco.bbox[1]], [foco.bbox[2], foco.bbox[3]]],
      {
        // Se reserva el espacio de lo que flota encima: la navegación arriba, el dock abajo (crece con la ficha
        // de la colonia) y, en escritorio, la leyenda a la derecha
        padding: movil
          ? foco.conPanel
            ? { top: 80, bottom: Math.round(alto * 0.55), left: 24, right: 24 }
            : { top: 110, bottom: 210, left: 16, right: 16 }
          : foco.conPanel
            ? { top: 90, bottom: Math.min(360, Math.round(alto * 0.5)), left: 60, right: 220 }
            : { top: 90, bottom: 140, left: 60, right: 220 },
        maxZoom: foco.zoomMax ?? 15,
        animate: !reducir,
        duration: 700,
      },
    );
  }, [listo, foco]);

  // Al volver de la vista de lista el contenedor cambia de tamaño
  useEffect(() => {
    if (visible) mapa.current?.resize();
  }, [visible]);

  // Punto de «mi ubicación»
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    (m.getSource("ubicacion") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: ubicacion
        ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ubicacion } }]
        : [],
    });
  }, [listo, ubicacion]);

  // MapLibre fuerza position:relative en su contenedor: se envuelve en un div absoluto
  return (
    <div className={`absolute inset-0 ${visible ? "" : "hidden"}`} aria-hidden={visible ? undefined : true}>
      <div ref={contenedor} className="h-full w-full" />
    </div>
  );
}

/** Si hay polígonos anidados bajo el clic, se elige el de menor área (el más específico) */
function elegirMasEspecifica(e: MapLayerMouseEvent, indice: Map<number, Indice>): number | null {
  let mejor: number | null = null;
  let area = Infinity;
  for (const f of e.features ?? []) {
    const id = (typeof f.id === "number" ? f.id : Number((f.properties as { id?: number })?.id)) as number;
    if (!Number.isFinite(id)) continue;
    const a = indice.get(id)?.area ?? Infinity;
    if (mejor == null || a < area) {
      mejor = id;
      area = a;
    }
  }
  return mejor;
}
