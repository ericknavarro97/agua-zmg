import { GRAVEDADES } from "@/lib/severity";
import type { Confianza, TipoFuente } from "./tipos";

/** Limita el score al nivel entero 1-4 */
export function nivelDeScore(score: number | null | undefined): number | null {
  if (score == null || Number.isNaN(score)) return null;
  return Math.min(4, Math.max(1, Math.round(score)));
}

export function etiquetaNivel(nivel: number | null): string {
  return nivel ? GRAVEDADES[nivel - 1].etiqueta : "Sin datos suficientes";
}

export function colorNivel(nivel: number | null): string {
  return nivel ? GRAVEDADES[nivel - 1].color : "#cbd5e1";
}

/** Muestra de nivel: color + trama (no depende solo del color) */
export function Muestra({ nivel, grande = false }: { nivel: number | null; grande?: boolean }) {
  return <span aria-hidden="true" className={`sw sw-${nivel ?? 0} ${grande ? "sw-lg" : ""}`} />;
}

/** Nivel con muestra y etiqueta escrita */
export function ChipNivel({ nivel, extra }: { nivel: number | null; extra?: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <Muestra nivel={nivel} grande />
      <span>
        {nivel ? `Nivel ${nivel}: ` : ""}
        {etiquetaNivel(nivel)}
      </span>
      {extra && <span className="font-normal text-slate-600">{extra}</span>}
    </span>
  );
}

export const CONFIANZA: Record<Confianza, { etiqueta: string; explicacion: string }> = {
  baja: {
    etiqueta: "Confianza baja",
    explicacion:
      "Hay pocos reportes, o llegaron todos muy juntos o de pocas personas distintas. Tómalo como un indicio, no como un hecho. El color se ve tenue en el mapa y estas colonias no se cuentan como «afectadas» en el resumen.",
  },
  media: {
    etiqueta: "Confianza media",
    explicacion:
      "Hay varios reportes de personas distintas y en más de un día, pero todavía no los suficientes para estar muy seguros.",
  },
  alta: {
    etiqueta: "Confianza alta",
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
