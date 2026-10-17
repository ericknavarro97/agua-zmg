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
    corta: "pocos reportes o de pocas personas. Tómalo como un indicio, no como un hecho.",
    explicacion:
      "Hay pocos reportes, o llegaron todos muy juntos o de pocas personas distintas. Tómalo como un indicio, no como un hecho. El color se ve tenue en el mapa y estas colonias no se cuentan como «afectadas» en el resumen.",
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

/** Hace cuánto, en palabras */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return "sin reportes recientes";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const horas = Math.round(ms / 3_600_000);
  if (horas < 1) return "hace menos de una hora";
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** Hace cuánto, abreviado para las cifras del dock («<1 h», «5 h», «3 d») */
export function haceCuantoCorto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const horas = Math.round(ms / 3_600_000);
  if (horas < 1) return "<1 h";
  if (horas < 24) return `${horas} h`;
  return `${Math.round(horas / 24)} d`;
}
