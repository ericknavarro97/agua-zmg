// Utilidades geográficas propias (sin turf). Todo corre en el navegador:
// la ubicación del usuario nunca se envía al servidor.
import type { ColoniaProps, FeatureColonia } from "./tipos";

export type Bbox = [number, number, number, number]; // [oeste, sur, este, norte]
type Anillo = number[][];

function poligonos(g: GeoJSON.Geometry): Anillo[][] {
  if (g.type === "Polygon") return [g.coordinates as Anillo[]];
  if (g.type === "MultiPolygon") return g.coordinates as Anillo[][];
  return [];
}

export function bbox(g: GeoJSON.Geometry): Bbox {
  let w = 180, s = 90, e = -180, n = -90;
  for (const poly of poligonos(g)) {
    for (const [x, y] of poly[0] ?? []) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}

export function unirBbox(a: Bbox | null, b: Bbox): Bbox {
  if (!a) return b;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Área aproximada (grados²) de los anillos exteriores menos los huecos; sirve para comparar colonias anidadas */
export function areaAprox(g: GeoJSON.Geometry): number {
  let total = 0;
  for (const poly of poligonos(g)) {
    poly.forEach((anillo, i) => {
      let a = 0;
      for (let k = 0, j = anillo.length - 1; k < anillo.length; j = k++) {
        a += anillo[j][0] * anillo[k][1] - anillo[k][0] * anillo[j][1];
      }
      total += (i === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  }
  return total;
}

function dentroDeAnillo(x: number, y: number, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Punto en polígono (traza de rayos) con soporte de huecos y MultiPolygon */
export function puntoEnGeometria(x: number, y: number, g: GeoJSON.Geometry): boolean {
  for (const poly of poligonos(g)) {
    if (!poly[0] || !dentroDeAnillo(x, y, poly[0])) continue;
    let enHueco = false;
    for (let h = 1; h < poly.length; h++) {
      if (dentroDeAnillo(x, y, poly[h])) { enHueco = true; break; }
    }
    if (!enHueco) return true;
  }
  return false;
}

export type Indice = {
  bbox: Bbox;
  area: number;
  centro: [number, number];
};

/** Precalcula bbox, área y centro de cada colonia (una sola vez al cargar) */
export function construirIndice(features: FeatureColonia[]): Map<number, Indice> {
  const m = new Map<number, Indice>();
  for (const f of features) {
    const b = bbox(f.geometry);
    m.set(f.properties.id, { bbox: b, area: areaAprox(f.geometry), centro: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] });
  }
  return m;
}

/**
 * Colonia que contiene el punto. Si hay varias (polígonos anidados en la fuente),
 * devuelve la de menor área, que es la más específica.
 */
export function coloniaEnPunto(
  lng: number,
  lat: number,
  features: FeatureColonia[],
  indice: Map<number, Indice>,
): FeatureColonia | null {
  let mejor: FeatureColonia | null = null;
  let mejorArea = Infinity;
  for (const f of features) {
    const ix = indice.get(f.properties.id);
    if (!ix) continue;
    const [w, s, e, n] = ix.bbox;
    if (lng < w || lng > e || lat < s || lat > n) continue;
    if (ix.area < mejorArea && puntoEnGeometria(lng, lat, f.geometry)) {
      mejor = f;
      mejorArea = ix.area;
    }
  }
  return mejor;
}

/** Distancia aproximada en km entre dos puntos (equirectangular, suficiente para la ZMG) */
export function distanciaKm(a: [number, number], b: [number, number]): number {
  const kx = 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.57);
}

export function coloniasCercanas(
  lng: number,
  lat: number,
  features: FeatureColonia[],
  indice: Map<number, Indice>,
  max = 3,
  maxKm = 3,
): { f: FeatureColonia; km: number }[] {
  const out: { f: FeatureColonia; km: number }[] = [];
  for (const f of features) {
    const ix = indice.get(f.properties.id);
    if (!ix) continue;
    const km = distanciaKm([lng, lat], ix.centro);
    if (km <= maxKm) out.push({ f, km });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, max);
}

/** Minúsculas y sin acentos: la fuente trae los nombres sin acentos */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Búsqueda por nombre: primero la coincidencia exacta, luego los que empiezan con el texto y al final los que lo
 * contienen (dentro de cada grupo, en el orden de entrada). Devuelve también el total de coincidencias.
 */
export function buscarColoniasConTotal(
  features: FeatureColonia[],
  texto: string,
  max = 8,
): { items: FeatureColonia[]; total: number } {
  const q = normalizar(texto);
  if (q.length < 2) return { items: [], total: 0 };
  const exactas: FeatureColonia[] = [];
  const empieza: FeatureColonia[] = [];
  const contiene: FeatureColonia[] = [];
  for (const f of features) {
    const nombre = normalizar(f.properties.nombre);
    if (nombre === q) exactas.push(f);
    else if (nombre.startsWith(q)) empieza.push(f);
    else if (nombre.includes(q)) contiene.push(f);
  }
  const todos = [...exactas, ...empieza, ...contiene];
  return { items: todos.slice(0, max), total: todos.length };
}

export function buscarColonias(features: FeatureColonia[], texto: string, max = 8): FeatureColonia[] {
  return buscarColoniasConTotal(features, texto, max).items;
}

export type { ColoniaProps };
