/**
 * Agregación robusta de reportes ciudadanos -> score por colonia (método "v2").
 * Ver docs/research/anti-abuso.md §6. El cálculo es una función pura (`agregar`) que se prueba sin base;
 * el SQL solo prepara grupos compactos (colonia, día, red, gravedad) para no traer cada reporte.
 *
 * Qué cuenta: SOLO reportes con estado='visible' y sospechoso=false, de los últimos VENTANA_DIAS.
 *
 * Receta (todos los parámetros están en PARAMS; cambiar uno exige subir METODO):
 *  1. Peso de cada reporte x = min(1, kDia/n_dia, kSem/n_sem) * f_concentrada * f_rapido
 *     - n_dia: reportes de la MISMA red (/24 o /48) en esa colonia el mismo día; n_sem: en la semana.
 *       Limita cuánta influencia puede tener una sola red, sin identificar a nadie.
 *     - f_concentrada: una red con >= 6 reportes en un día en la misma colonia pesa x0.25.
 *     - f_rapido: formulario enviado en < 5 s pesa x0.5 (el cliente declara el tiempo: señal débil).
 *  2. Decaimiento: w = x * 2^(-edad_dias / vida_media).
 *  3. Media recortada por MASA de peso: se descarta el 20 % del peso en cada extremo de la escala 1-4.
 *  4. Contracción bayesiana hacia un prior: lambda = n_eff / (n_eff + C); score = lambda*recortada + (1-lambda)*prior.
 *     El prior es la media recortada global de colonias reales con n_eff >= 6, acotada a [1.5, 2.5]
 *     (un atacante no puede moverla fuera de ese rango).
 *  5. Publicable: n_eff >= 1 (un reporte completo; uno enviado en < 5 s pesa 0.5 y por sí solo no alcanza).
 *     Desde v2 basta UN reporte: la contracción del paso 4 evita que decida solo el color, y la confianza
 *     "baja" (n_eff < 6) lo pinta tenue y con trama.
 *  6. Confianza: baja / media / alta con los umbrales de PARAMS.confianza.
 *
 * LÍMITE CONOCIDO: quien aparente ser muchos vecinos distintos (muchas redes, tiempos humanos, varios
 * días) no se distingue de vecinos reales. Ver scripts/simular-ataques.ts, que lo mide.
 */
import type { Pool } from "pg";
import { VENTANA_DIAS, VIDA_MEDIA_DIAS } from "./severity";

export const METODO = "v2";

export const PARAMS = {
  ventanaDias: VENTANA_DIAS,
  vidaMediaDias: VIDA_MEDIA_DIAS,
  /** Fracción del PESO que se recorta en cada extremo. 0.2 tolera ~1 de cada 5 reportes falsos extremos. */
  alfa: 0.2,
  /** Pseudo-reportes del prior (con n_eff = 3 el prior pesa 40 %; con 12, 14 %). Valor inicial, recalibrar. */
  C: 2,
  /** Prior acotado: quien reporta es una muestra autoseleccionada con problema, por eso no se centra en 2.5. */
  priorMin: 1.5,
  priorMax: 2.5,
  priorDef: 2.0,
  /** Tope de peso por (colonia, red, día) y por (colonia, red semanal). */
  kDia: 2,
  kSem: 3,
  /** Una red con >= 6 reportes en el día en una colonia deja de parecer un hogar. */
  concentrada: 6,
  fConcentrada: 0.25,
  rapidoMs: 5000,
  fRapido: 0.5,
  /** Para publicar una colonia en el mapa (v2: desde un reporte; antes 3 y 3). */
  minEvidencia: 1,
  minHuellas: 1,
  confianza: {
    /** n_eff por debajo de esto: confianza baja (el color puede variar un nivel entero con tan pocos datos). */
    mediaNEff: 6,
    altaNEff: 12,
    /** Un día "corrobora" si aporta al menos esta evidencia; exigir varios días obliga a sostener el esfuerzo. */
    diaCorrob: 1.5,
    mediaDias: 2,
    altaDias: 3,
    /** Redes semanales distintas mínimas. */
    mediaRedes: 4,
    altaRedes: 8,
    /** Si un día aporta más de esta fracción de la evidencia, la confianza es baja (pico no corroborado). */
    maxDia: 0.6,
    /** Si la media recortada y la mediana difieren más, la distribución es bimodal: no pasa de "media". */
    discrepancia: 0.75,
  },
} as const;

export type Confianza = "baja" | "media" | "alta";

/** Reportes agrupados por (colonia, día local, red, red semanal, gravedad). */
export type Grupo = {
  coloniaId: number;
  dia: string;
  red: string;
  redSem: string;
  gravedad: 1 | 2 | 3 | 4;
  n: number;
  nRapidos: number;
  /** Edad media del grupo en días. */
  edadDias: number;
};

export type ResumenColonia = { n: number; nHuellas: number; ultimoMs: number };

export type ScoreDetallado = {
  id: number;
  score: number;
  nivel: 1 | 2 | 3 | 4;
  n: number;
  nHuellas: number;
  confianza: Confianza;
  ultimo: string;
  // diagnóstico (no se publica en /api/colonias/scores)
  nEff: number;
  recortada: number;
  mediana: number;
  diasCorrob: number;
  redesSem: number;
  maxDia: number;
};

type Parcial = {
  coloniaId: number;
  recortada: number;
  mediana: number;
  nEff: number;
  diasCorrob: number;
  redesSem: number;
  maxDia: number;
};

const suma = (xs: Iterable<number>) => {
  let s = 0;
  for (const x of xs) s += x;
  return s;
};

/** Media recortada por masa de peso y mediana ponderada sobre la escala ordinal 1-4. */
export function recortada(bins: readonly number[], alfa = PARAMS.alfa): { media: number; mediana: number } | null {
  const W = suma(bins);
  if (!(W > 0)) return null;
  const lo = alfa * W;
  const hi = W - lo;
  let cum = 0;
  let kept = 0;
  let sum = 0;
  let mediana = 4;
  let hayMediana = false;
  for (let g = 1; g <= 4; g++) {
    const a = cum;
    const b = cum + bins[g - 1];
    const m = Math.max(0, Math.min(b, hi) - Math.max(a, lo));
    kept += m;
    sum += g * m;
    if (!hayMediana && b >= W / 2 && bins[g - 1] > 0) {
      mediana = g;
      hayMediana = true;
    }
    cum = b;
  }
  return { media: sum / kept, mediana };
}

function parcial(coloniaId: number, gs: Grupo[], p = PARAMS): Parcial | null {
  const nDia = new Map<string, number>();
  const nSem = new Map<string, number>();
  for (const g of gs) {
    nDia.set(g.red + "|" + g.dia, (nDia.get(g.red + "|" + g.dia) ?? 0) + g.n);
    nSem.set(g.redSem, (nSem.get(g.redSem) ?? 0) + g.n);
  }
  const bins = [0, 0, 0, 0];
  const porDia = new Map<string, number>();
  const redes = new Set<string>();
  let nEff = 0;
  for (const g of gs) {
    const kd = nDia.get(g.red + "|" + g.dia)!;
    const ks = nSem.get(g.redSem)!;
    const tope = Math.min(1, p.kDia / kd, p.kSem / ks);
    const conc = kd >= p.concentrada ? p.fConcentrada : 1;
    // los reportes rápidos pesan menos: n lentos * 1 + n rápidos * fRapido
    const unidades = g.n - g.nRapidos * (1 - p.fRapido);
    const x = unidades * tope * conc;
    bins[g.gravedad - 1] += x * Math.pow(2, -g.edadDias / p.vidaMediaDias);
    porDia.set(g.dia, (porDia.get(g.dia) ?? 0) + x);
    redes.add(g.redSem);
    nEff += x;
  }
  const r = recortada(bins, p.alfa);
  if (!r) return null;
  const dias = [...porDia.values()];
  return {
    coloniaId,
    recortada: r.media,
    mediana: r.mediana,
    nEff,
    diasCorrob: dias.filter((v) => v >= p.confianza.diaCorrob).length,
    redesSem: redes.size,
    maxDia: nEff > 0 ? Math.max(...dias) / nEff : 0,
  };
}

/** Prior global acotado a [priorMin, priorMax] a partir de colonias con evidencia suficiente. */
export function priorGlobal(ps: Parcial[], p = PARAMS): number {
  const base = ps.filter((x) => x.nEff >= 6);
  const den = suma(base.map((x) => x.nEff));
  const m = den > 0 ? suma(base.map((x) => x.recortada * x.nEff)) / den : p.priorDef;
  return Math.min(p.priorMax, Math.max(p.priorMin, m));
}

export function confianzaDe(x: Pick<Parcial, "nEff" | "diasCorrob" | "redesSem" | "maxDia" | "recortada" | "mediana">, p = PARAMS): Confianza {
  const c = p.confianza;
  // Un solo día con más del 60 % de la evidencia es un pico NO corroborado (puede ser real o un ataque
  // que llega encima de reportes honestos de otros días): se pinta con trama hasta que otros días lo confirmen.
  if (x.nEff < c.mediaNEff || x.diasCorrob < c.mediaDias || x.maxDia > c.maxDia) return "baja";
  if (x.nEff < c.altaNEff || x.redesSem < c.mediaRedes || x.diasCorrob < c.altaDias) return "media";
  if (x.redesSem < c.altaRedes || Math.abs(x.recortada - x.mediana) > c.discrepancia) return "media";
  return "alta";
}

/** Núcleo puro: de grupos + resumen por colonia a los scores publicables (ordenados por id). */
export function agregar(
  grupos: Grupo[],
  resumen: Map<number, ResumenColonia>,
  p = PARAMS,
): ScoreDetallado[] {
  const porColonia = new Map<number, Grupo[]>();
  for (const g of grupos) {
    const l = porColonia.get(g.coloniaId);
    if (l) l.push(g);
    else porColonia.set(g.coloniaId, [g]);
  }
  const parciales: Parcial[] = [];
  for (const [id, gs] of porColonia) {
    const x = parcial(id, gs, p);
    if (x) parciales.push(x);
  }
  const m0 = priorGlobal(parciales, p);

  const out: ScoreDetallado[] = [];
  for (const x of parciales) {
    const r = resumen.get(x.coloniaId);
    if (!r) continue;
    // Publicable: evidencia efectiva Y huellas distintas (no solo filas)
    if (x.nEff < p.minEvidencia || r.nHuellas < p.minHuellas) continue;
    const lambda = x.nEff / (x.nEff + p.C);
    const score = lambda * x.recortada + (1 - lambda) * m0;
    out.push({
      id: x.coloniaId,
      score,
      nivel: Math.min(4, Math.max(1, Math.round(score))) as 1 | 2 | 3 | 4,
      n: r.n,
      nHuellas: r.nHuellas,
      confianza: confianzaDe(x, p),
      ultimo: new Date(r.ultimoMs).toISOString(),
      nEff: x.nEff,
      recortada: x.recortada,
      mediana: x.mediana,
      diasCorrob: x.diasCorrob,
      redesSem: x.redesSem,
      maxDia: x.maxDia,
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Forma pública del contrato de GET /api/colonias/scores. */
export function paraContrato(s: ScoreDetallado) {
  return {
    id: s.id,
    score: Number(s.score.toFixed(3)),
    nivel: s.nivel,
    n: s.n,
    n_huellas: s.nHuellas,
    confianza: s.confianza,
    ultimo: s.ultimo,
  };
}

// --- Carga desde Postgres ---------------------------------------------------------------------

/**
 * Lee los reportes contables de la ventana, ya agrupados. Las filas sin red (anteriores a la migración 002) cuentan cada una como su propia red: no se penalizan por no tener red.
 * El día se calcula en hora de Guadalajara a partir de creado_en.
 */
export async function cargarGrupos(pool: Pool, ahora = new Date(), p = PARAMS): Promise<Grupo[]> {
  const { rows } = await pool.query(
    `SELECT r.colonia_id,
            to_char((r.creado_en AT TIME ZONE 'America/Mexico_City')::date, 'YYYY-MM-DD') AS dia,
            COALESCE(r.red_hash, 'h:' || COALESCE(r.huella, r.id::text)) AS red,
            COALESCE(r.red_sem,  'h:' || COALESCE(r.huella, r.id::text)) AS red_sem,
            r.gravedad::int AS gravedad,
            count(*)::int AS n,
            (count(*) FILTER (WHERE r.tiempo_ms IS NOT NULL AND r.tiempo_ms < $3))::int AS n_rapidos,
            avg(extract(epoch FROM r.creado_en))::float8 AS epoch_medio
       FROM reportes r
      WHERE r.estado = 'visible' AND NOT r.sospechoso
        AND r.creado_en > $1::timestamptz - make_interval(days => $2::int)
        AND r.creado_en <= $1::timestamptz
      GROUP BY 1, 2, 3, 4, 5`,
    [ahora.toISOString(), p.ventanaDias, p.rapidoMs],
  );
  const ahoraS = ahora.getTime() / 1000;
  return rows.map((r) => ({
    coloniaId: r.colonia_id,
    dia: r.dia,
    red: r.red,
    redSem: r.red_sem,
    gravedad: r.gravedad,
    n: r.n,
    nRapidos: r.n_rapidos,
    edadDias: Math.max(0, (ahoraS - r.epoch_medio) / 86400),
  }));
}

export async function cargarResumen(pool: Pool, ahora = new Date(), p = PARAMS): Promise<Map<number, ResumenColonia>> {
  const { rows } = await pool.query(
    `SELECT colonia_id, count(*)::int AS n,
            count(DISTINCT huella)::int AS n_huellas,
            (extract(epoch FROM max(creado_en)) * 1000)::float8 AS ultimo_ms
       FROM reportes
      WHERE estado = 'visible' AND NOT sospechoso
        AND creado_en > $1::timestamptz - make_interval(days => $2::int)
        AND creado_en <= $1::timestamptz
      GROUP BY colonia_id`,
    [ahora.toISOString(), p.ventanaDias],
  );
  // Las filas sin huella (anonimizadas) cuentan como una huella cada una
  const sinHuella = await pool.query(
    `SELECT colonia_id, count(*)::int AS n FROM reportes
      WHERE estado = 'visible' AND NOT sospechoso AND huella IS NULL
        AND creado_en > $1::timestamptz - make_interval(days => $2::int)
        AND creado_en <= $1::timestamptz
      GROUP BY colonia_id`,
    [ahora.toISOString(), p.ventanaDias],
  );
  const extra = new Map<number, number>(sinHuella.rows.map((r) => [r.colonia_id, r.n]));
  return new Map(
    rows.map((r) => [
      r.colonia_id,
      { n: r.n, nHuellas: r.n_huellas + (extra.get(r.colonia_id) ?? 0), ultimoMs: r.ultimo_ms },
    ]),
  );
}

export async function calcularScores(pool: Pool, ahora = new Date()): Promise<ScoreDetallado[]> {
  const [grupos, resumen] = await Promise.all([cargarGrupos(pool, ahora), cargarResumen(pool, ahora)]);
  return agregar(grupos, resumen);
}

// --- Caché en memoria (por instancia) con una sola consulta en vuelo ---------------------------
// Stale-while-revalidate: al vencer (o al marcarse sucia) se sigue sirviendo el valor anterior mientras UNA
// consulta recalcula en segundo plano. Así ni el volumen de reportes ni un atacante rotando User-Agent
// obligan a cada visita a esperar el recálculo completo.

const TTL_MS = 30_000;
/** Aun marcada sucia por reportes nuevos, no se recalcula más seguido que esto. */
const MIN_REFRESCO_MS = 10_000;
/** Pasado esto el valor viejo ya no se sirve: se espera el recálculo (p. ej. si fallaron los anteriores). */
const MAX_VIEJO_MS = 5 * 60_000;

type Entrada = { en: number; datos: Promise<ScoreDetallado[]>; sucia: boolean };
let cache: Entrada | null = null;
let recalculando: Promise<ScoreDetallado[]> | null = null;
/** Sube en cada invalidación: un cálculo que empezó antes no debe dejar su resultado en la caché. */
let generacion = 0;

function lanzar(pool: Pool): Promise<ScoreDetallado[]> {
  const g = generacion;
  const en = Date.now();
  const datos = calcularScores(pool);
  recalculando = datos;
  datos.then(
    () => {
      if (recalculando === datos) recalculando = null;
      if (g === generacion) cache = { en, datos, sucia: false };
    },
    () => {
      if (recalculando === datos) recalculando = null; // un fallo no se queda en caché
    },
  );
  return datos;
}

/** Evita recalcular en cada visita: como mucho una vez cada 30 s por instancia (10 s si hubo reportes nuevos). */
export function scoresConCache(pool: Pool, ttlMs = TTL_MS): Promise<ScoreDetallado[]> {
  if (!cache) return recalculando ?? lanzar(pool); // fría: las visitas simultáneas comparten una sola consulta
  const edad = Date.now() - cache.en;
  const vencida = edad >= ttlMs || (cache.sucia && edad >= MIN_REFRESCO_MS);
  if (!vencida) return cache.datos;
  if (edad >= MAX_VIEJO_MS) return recalculando ?? lanzar(pool); // demasiado viejo: se espera lo nuevo
  if (!recalculando) lanzar(pool); // segundo plano; si falla se sigue sirviendo lo anterior
  return cache.datos;
}

/** La moderación llama esto para que el cambio se vea de inmediato en esta instancia. */
export function invalidarCacheScores(): void {
  cache = null;
  recalculando = null;
  generacion++;
}

/** Hubo un reporte nuevo: se refresca en cuanto pasen unos segundos, sin descartar lo que ya hay. */
export function refrescarScoresPronto(): void {
  if (cache) cache.sucia = true;
}
