import { GRAVEDADES } from "@/lib/severity";
import type { Confianza, TipoFuente } from "./tipos";

/**
 * Limita el score al nivel entero 0-4. OJO: el nivel 0 («Limpia») es un nivel válido; «sin datos» es null.
 * Compara siempre con `!= null`, nunca por verdad (`nivel ? …` trataría «Limpia» como «sin datos»).
 */
export function nivelDeScore(score: number | null | undefined): number | null {
  if (score == null || Number.isNaN(score)) return null;
  return Math.min(4, Math.max(0, Math.round(score)));
}

export function etiquetaNivel(nivel: number | null): string {
  return nivel != null ? GRAVEDADES[nivel].etiqueta : "Sin datos suficientes";
}

export function colorNivel(nivel: number | null): string {
  return nivel != null ? GRAVEDADES[nivel].color : "#cbd5e1";
}

/** Muestra de nivel: color + trama (no depende solo del color). `sw-sd` = sin datos. */
export function Muestra({ nivel, grande = false, enorme = false }: { nivel: number | null; grande?: boolean; enorme?: boolean }) {
  return <span aria-hidden="true" className={`sw sw-${nivel ?? "sd"} ${enorme ? "sw-xl" : grande ? "sw-lg" : ""}`} />;
}

/** Reporte «Hoy no llegó agua» (gravedad null en un reporte): no es un nivel ni «sin datos». */
export const ETIQUETA_SIN_AGUA = "No llegó agua";

export function MuestraSinAgua({ grande = false }: { grande?: boolean }) {
  return <span aria-hidden="true" className={`sw sw-sa ${grande ? "sw-lg" : ""}`} />;
}

/** Nivel con muestra y etiqueta escrita */
export function ChipNivel({ nivel, extra }: { nivel: number | null; extra?: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <Muestra nivel={nivel} grande />
      <span>
        {nivel != null ? `Nivel ${nivel}: ` : ""}
        {etiquetaNivel(nivel)}
      </span>
      {extra && <span className="font-normal text-slate-600">{extra}</span>}
    </span>
  );
}

export const CONFIANZA: Record<Confianza, { etiqueta: string; corta: string; explicacion: string }> = {
  baja: {
    etiqueta: "Confianza baja",
    corta: "pocos reportes, de pocas personas o de hace varios días. Tómalo como un indicio, no como un hecho.",
    explicacion:
      "Hay pocos reportes, o son de hace varios días, o llegaron todos muy juntos o de pocas personas distintas. Tómalo como un indicio, no como un hecho. El color se ve tenue en el mapa y estas colonias no se cuentan como «afectadas» en el resumen.",
  },
  media: {
    etiqueta: "Confianza media",
    corta: "varios reportes de personas distintas y en más de un día, pero aún no los suficientes para estar muy seguros.",
    explicacion:
      "Hay varios reportes de personas distintas y en más de un día, pero todavía no los suficientes para estar muy seguros.",
  },
  alta: {
    etiqueta: "Confianza alta",
    corta: "muchos reportes de personas distintas durante varios días, y coinciden. Sigue sin ser un análisis de laboratorio.",
    explicacion:
      "Hay muchos reportes de personas distintas durante varios días y coinciden entre sí. Aun así, sigue siendo lo que reportan vecinos, no un análisis de laboratorio.",
  },
};

export const TIPOS_FUENTE: Record<TipoFuente, { etiqueta: string; descripcion: string; clase: string }> = {
  oficial: {
    etiqueta: "Autoridad",
    descripcion: "Lo emite o entrega una autoridad (SIAPA, CEDHJ, COPRISJAL...)",
    clase: "border-sky-700 bg-sky-50 text-sky-900",
  },
  academica: {
    etiqueta: "Académica",
    descripcion: "Universidad o centro de investigación",
    clase: "border-violet-700 bg-violet-50 text-violet-900",
  },
  periodistica: {
    etiqueta: "Periodística",
    descripcion: "Reporte de prensa sin documento original",
    clase: "border-amber-700 bg-amber-50 text-amber-900",
  },
  ciudadana: {
    etiqueta: "Ciudadana",
    descripcion: "Monitoreo vecinal u organización civil",
    clase: "border-emerald-700 bg-emerald-50 text-emerald-900",
  },
};

/** Fecha corta en español de México; tolera fechas inválidas */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Hoy en Guadalajara (YYYY-MM-DD), el mismo día local que usa el servidor */
function hoyGdl(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(ahora);
}

/** Días completos entre un día YYYY-MM-DD y hoy en Guadalajara (null si la fecha no es válida) */
export function diasDesde(dia: string, ahora = new Date()): number | null {
  const a = Date.parse(`${dia.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hoyGdl(ahora)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Hace cuánto, en palabras. La API publica solo el día del último reporte (nunca la hora). */
export function haceCuanto(dia: string | null | undefined, ahora = new Date()): string {
  if (!dia) return "sin reportes recientes";
  const d = diasDesde(dia, ahora);
  if (d == null) return "";
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

/** Hace cuánto, abreviado para las cifras del dock («hoy», «ayer», «3 d») */
export function haceCuantoCorto(dia: string | null | undefined, ahora = new Date()): string | null {
  if (!dia) return null;
  const d = diasDesde(dia, ahora);
  if (d == null) return null;
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `${d} d`;
}
