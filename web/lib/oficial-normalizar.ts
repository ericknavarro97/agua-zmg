/**
 * Normalización de nombres de colonia y municipio, y similitud para vincular
 * datos externos con la cartografía. Sin dependencias ni extensiones de BD
 * (equivale a unaccent + pg_trgm, pero idéntico en la importación y en las pruebas).
 */

/** Quita acentos y diéresis (la ñ también pasa a n, igual en ambos lados de la comparación). */
export function quitarAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizarTexto(s: string | null | undefined): string {
  if (!s) return "";
  return quitarAcentos(s)
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Municipios ----------

const MUNICIPIOS: { canon: string; alias: string[] }[] = [
  { canon: "Guadalajara", alias: ["guadalajara"] },
  { canon: "Zapopan", alias: ["zapopan"] },
  { canon: "San Pedro Tlaquepaque", alias: ["san pedro tlaquepaque", "tlaquepaque"] },
  { canon: "Tonalá", alias: ["tonala"] },
  { canon: "Tlajomulco de Zúñiga", alias: ["tlajomulco de zuniga", "tlajomulco"] },
  { canon: "El Salto", alias: ["el salto"] },
  { canon: "Juanacatlán", alias: ["juanacatlan"] },
  { canon: "Ixtlahuacán de los Membrillos", alias: ["ixtlahuacan de los membrillos", "ixtlahuacan"] },
  { canon: "Zapotlanejo", alias: ["zapotlanejo"] },
];

/** Nombre oficial del municipio de la ZMG, o null si no se reconoce. */
export function municipioCanonico(s: string | null | undefined): string | null {
  const n = normalizarTexto(s);
  if (!n) return null;
  return MUNICIPIOS.find((m) => m.alias.includes(n))?.canon ?? null;
}

/** Clave de comparación del municipio ("" si viene vacío); desconocidos conservan su forma normalizada. */
export function claveMunicipio(s: string | null | undefined): string {
  const c = municipioCanonico(s);
  return normalizarTexto(c ?? s);
}

// ---------- Nombres de colonia ----------

const ABREV: Record<string, string> = {
  sta: "santa", sto: "santo", sn: "san", gral: "general", dr: "doctor", pte: "poniente",
  ote: "oriente", nte: "norte", sec: "seccion", secc: "seccion", etapa: "etapa",
};
const ORDINAL: Record<string, string> = {
  primera: "1", primero: "1", "1a": "1", "1ra": "1", segunda: "2", segundo: "2", "2a": "2", "2da": "2",
  tercera: "3", tercero: "3", "3a": "3", "3ra": "3", cuarta: "4", cuarto: "4", "4a": "4", "4ta": "4",
  quinta: "5", quinto: "5", "5a": "5", "5ta": "5", sexta: "6", sexto: "6", "6a": "6", "6ta": "6",
  septima: "7", octava: "8", novena: "9", decima: "10",
  // números en palabra: "Zona de Industrias Uno" y "... Dos" son colonias distintas
  uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
};
/** Palabras genéricas que se ignoran solo al inicio del nombre. */
const PREFIJOS = new Set(["colonia", "col", "fraccionamiento", "fracc", "frac", "barrio", "residencial", "coto", "privada"]);
const VACIAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
const DIRECCIONES = new Set(["norte", "sur", "oriente", "poniente", "centro"]);
/** Artículos que `tokensNucleo` descarta pero que NO son intercambiables: "El Fresno" != "Del Fresno". */
const ARTICULOS = new Set(["el", "la", "las", "los", "del"]);

/**
 * Forma "núcleo" para comparar: sin acentos, abreviaturas y ordinales expandidos,
 * sin prefijos genéricos iniciales ("Colonia", "Fracc.") ni artículos.
 * Devuelve tokens; nunca vacío salvo entrada vacía.
 */
export function tokensNucleo(nombre: string | null | undefined): string[] {
  let t = normalizarTexto(nombre).split(" ").filter(Boolean);
  t = t.map((w) => ORDINAL[w] ?? ABREV[w] ?? w);
  while (t.length > 1 && PREFIJOS.has(t[0])) t = t.slice(1);
  const sinArt = t.filter((w) => !VACIAS.has(w));
  return sinArt.length ? sinArt : t;
}

export function nucleo(nombre: string | null | undefined): string {
  return tokensNucleo(nombre).join(" ");
}

/** Artículos (en orden) del nombre ya sin prefijos genéricos; dos nombres solo son equivalentes si coinciden. */
function articulos(nombre: string | null | undefined): string {
  let t = normalizarTexto(nombre).split(" ").filter(Boolean).map((w) => ORDINAL[w] ?? ABREV[w] ?? w);
  while (t.length > 1 && PREFIJOS.has(t[0])) t = t.slice(1);
  return t.filter((w) => ARTICULOS.has(w)).join("|");
}

/**
 * Comparación palabra por palabra de dos núcleos: mismo número de palabras, en el mismo orden, y cada par igual
 * o parecido (errata, singular/plural). Evita que una palabra de más ("Nilo", "Country", "Alamo") o el orden
 * invertido ("Centro Barranquitas") pasen por una coincidencia solo porque los trigramas se parecen.
 */
function palabrasCompatibles(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i] || similitud(w, b[i]) >= 0.5);
}

const ROMANO = /^(?=[ivx]+$)(?:x{0,2})(?:ix|iv|v?i{0,3})$/;

/** Tokens que distinguen colonias casi homónimas: números (sección/etapa), romanos y puntos cardinales. */
function distintivos(tokens: string[]): string {
  return tokens.filter((w) => /\d/.test(w) || ROMANO.test(w) || DIRECCIONES.has(w)).sort().join("|");
}

/** ¿Dos nombres tienen los mismos números y puntos cardinales? ("Sección 1" != "Sección 2"; "Norte" != "Sur") */
export function mismosDistintivos(a: string, b: string): boolean {
  return distintivos(tokensNucleo(a)) === distintivos(tokensNucleo(b));
}

// ---------- Similitud tipo pg_trgm ----------

function trigramas(s: string): Set<string> {
  const out = new Set<string>();
  for (const palabra of s.split(" ").filter(Boolean)) {
    const p = `  ${palabra} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** Similitud de trigramas 0..1 (misma definición que pg_trgm.similarity). */
export function similitud(a: string, b: string): number {
  const A = trigramas(a);
  const B = trigramas(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------- Vinculación ----------

export type Confianza = "alta" | "media" | "baja";

export interface ColoniaIndexada {
  id: number;
  nombre: string;
  municipio: string | null;
}

export type ResultadoVinculo =
  | { ok: true; id: number; confianza: Confianza; metodo: string; similitud: number; candidato: string }
  | { ok: false; motivo: string; candidatos: string[] };

/**
 * Índice en memoria de colonias reales para vincular (nombre, municipio) de una fuente externa.
 *  - alta:  nombre idéntico tras quitar acentos/mayúsculas/puntuación y único en el municipio.
 *  - media: idéntico en su forma núcleo (prefijos, abreviaturas, ordinales; mismos artículos "el/la/del...") o casi idéntico (>= 0.92, p. ej. una errata) con margen.
 *  - baja:  similar (>= 0.55) pero no concluyente. Debe mostrarse como "posible", nunca como dato firme.
 *  - Sin vínculo: homónimos en el municipio, municipio desconocido o ninguna coincidencia razonable.
 */
export class IndiceColonias {
  private porMunicipio = new Map<string, { c: ColoniaIndexada; exacto: string; nuc: string; art: string }[]>();
  /** Umbrales (ajustados con los datos reales; ver data/README.md) */
  static readonly SIM_MEDIA = 0.92; // más bajo confunde singular/plural ("Villa" vs "Villas") que pueden ser distintas
  static readonly SIM_BAJA = 0.55;
  static readonly MARGEN = 0.08;

  constructor(colonias: ColoniaIndexada[]) {
    for (const c of colonias) {
      const k = claveMunicipio(c.municipio);
      const arr = this.porMunicipio.get(k) ?? [];
      arr.push({ c, exacto: normalizarTexto(c.nombre), nuc: nucleo(c.nombre), art: articulos(c.nombre) });
      this.porMunicipio.set(k, arr);
    }
  }

  vincular(nombre: string, municipio: string | null): ResultadoVinculo {
    const km = claveMunicipio(municipio);
    const lista = this.porMunicipio.get(km);
    if (!km || !lista) return { ok: false, motivo: "municipio_sin_cartografia", candidatos: [] };
    const ex = normalizarTexto(nombre);
    if (!ex) return { ok: false, motivo: "nombre_vacio", candidatos: [] };

    const exactos = lista.filter((x) => x.exacto === ex);
    if (exactos.length === 1) {
      return { ok: true, id: exactos[0].c.id, confianza: "alta", metodo: "nombre_exacto", similitud: 1, candidato: exactos[0].c.nombre };
    }
    if (exactos.length > 1) {
      return { ok: false, motivo: "homonimos_en_municipio", candidatos: exactos.map((x) => `${x.c.nombre} (id ${x.c.id})`) };
    }

    const nuc = nucleo(nombre);
    const art = articulos(nombre);
    // Mismo núcleo Y mismos artículos: "El Fresno" no se vincula con "Del Fresno" (podrían ser colonias distintas)
    const delNucleo = lista.filter((x) => x.nuc === nuc && x.art === art);
    if (delNucleo.length === 1) {
      return { ok: true, id: delNucleo[0].c.id, confianza: "media", metodo: "nombre_nucleo", similitud: similitud(ex, delNucleo[0].exacto), candidato: delNucleo[0].c.nombre };
    }
    if (delNucleo.length > 1) {
      return { ok: false, motivo: "homonimos_en_municipio", candidatos: delNucleo.map((x) => `${x.c.nombre} (id ${x.c.id})`) };
    }

    // Difuso: mismos números/puntos cardinales y similitud de trigramas
    const cand = lista
      .filter((x) => x.art === art && mismosDistintivos(nombre, x.c.nombre))
      .filter((x) => palabrasCompatibles(tokensNucleo(nombre), tokensNucleo(x.c.nombre)))
      .map((x) => ({ x, s: similitud(nuc, x.nuc) }))
      .sort((a, b) => b.s - a.s);
    const mejor = cand[0];
    if (!mejor || mejor.s < IndiceColonias.SIM_BAJA) {
      return { ok: false, motivo: "sin_coincidencia", candidatos: cand.slice(0, 3).map((c) => `${c.x.c.nombre} (sim ${c.s.toFixed(2)})`) };
    }
    const margen = mejor.s - (cand[1]?.s ?? 0);
    const base = { ok: true as const, id: mejor.x.c.id, similitud: Number(mejor.s.toFixed(3)), candidato: mejor.x.c.nombre };
    if (mejor.s >= IndiceColonias.SIM_MEDIA && margen >= IndiceColonias.MARGEN) {
      return { ...base, confianza: "media", metodo: "similitud" };
    }
    if (margen < 0.03) {
      return { ok: false, motivo: "ambigua", candidatos: cand.slice(0, 3).map((c) => `${c.x.c.nombre} (sim ${c.s.toFixed(2)})`) };
    }
    return { ...base, confianza: "baja", metodo: "similitud" };
  }
}
