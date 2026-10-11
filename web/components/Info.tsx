import type { ReactNode } from "react";
import BarraInfoMovil from "./BarraInfoMovil";
import { NOMBRE_FUENTE } from "./fuentes";

/**
 * Enlace a una fuente externa: una ficha pequeña, con aviso de pestaña nueva para lectores de pantalla.
 * Sin texto propio, el nombre accesible incluye cuál es la fuente (no todos los enlaces «fuente» suenan igual).
 */
export function Fuente({ href, children }: { href: string; children?: ReactNode }) {
  const nombre = children == null ? NOMBRE_FUENTE[href] : undefined;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="fuente">
      {children ?? "fuente"}
      <span className="sr-only">{nombre ? `: ${nombre}` : ""} (abre en otra pestaña)</span>
    </a>
  );
}

/** Etiqueta para datos que vienen de notas de prensa y no de un documento oficial */
export function SegunMedios() {
  return <span className="text-sm text-texto-tenue"> (según medios)</span>;
}

// Cada tono lleva su etiqueta escrita: el color nunca es la única pista de qué tipo de aviso es
const TONOS = {
  info: { clase: "bg-[#e3edf3] text-tinta", etiqueta: "Nota" },
  alerta: { clase: "bg-[#fbf1d3] text-[#3d2c00]", etiqueta: "Aviso" },
  peligro: { clase: "bg-[#f6e0e4] text-[#4a0f22]", etiqueta: "Importante" },
  ok: { clase: "bg-[#e2f1e7] text-[#0f3b22]", etiqueta: "Bien" },
  destacado: { clase: "oscuro aviso-oscuro bg-tinta text-[#e6edf2]", etiqueta: "Lo primero" },
} as const;

export function Aviso({
  tono = "info",
  titulo,
  etiqueta,
  children,
}: {
  tono?: keyof typeof TONOS;
  titulo?: string;
  /** Sustituye la etiqueta del tono («Nota», «Aviso»…) */
  etiqueta?: string;
  children: ReactNode;
}) {
  const t = TONOS[tono];
  return (
    <aside className={`flex flex-col gap-2.5 rounded-[20px] px-[22px] py-5 text-[1.03rem] leading-[1.55] ${t.clase}`}>
      <p className="mono-etiqueta opacity-75">{etiqueta ?? t.etiqueta}</p>
      {titulo && <p className="text-[1.1875rem] font-bold leading-[1.3]">{titulo}</p>}
      <div className="flex flex-col gap-2.5">{children}</div>
    </aside>
  );
}

export function AvisoSalud() {
  return (
    <Aviso tono="alerta" titulo="Aviso de salud">
      <p>
        Esta guía es informativa y <strong>no sustituye el consejo, diagnóstico ni tratamiento de un profesional de la
        salud</strong>. Si tú o alguien de tu familia tiene síntomas, acude a una unidad de salud o llama al{" "}
        <a href="tel:911">9-1-1</a> en caso de emergencia. La información viene de fuentes públicas citadas en cada punto y
        se verificó el 8 de octubre de 2026; puede cambiar. Los teléfonos y datos de contacto deben confirmarse en el sitio
        oficial de cada institución. Agua ZMG no es una autoridad ni un laboratorio: los reportes ciudadanos que ves en el
        mapa no son mediciones oficiales ni sustituyen un análisis de laboratorio.
      </p>
    </Aviso>
  );
}

type ItemIndice = { id: string; texto: string };

/**
 * Contenedor de cada página informativa: portada oscura con la etiqueta de la sección y, si hay índice,
 * una columna con él (fija al hacer scroll en pantallas anchas; plegable arriba del texto en las angostas).
 */
export function Pagina({
  etiqueta,
  titulo,
  resumen,
  indice,
  children,
}: {
  /** Sección y tipo de página, en la línea pequeña sobre el título */
  etiqueta?: string;
  titulo: string;
  resumen?: ReactNode;
  indice?: ItemIndice[];
  children: ReactNode;
}) {
  return (
    <>
      <section className="oscuro mx-3 rounded-[28px] bg-tinta px-[clamp(1.25rem,5vw,3.5rem)] py-[clamp(1.75rem,5vw,3.75rem)] text-white">
        <div className="mx-auto flex max-w-[67.5rem] flex-col gap-4">
          {etiqueta && <p className="mono-etiqueta text-acento">{etiqueta}</p>}
          <h1 className="max-w-[55rem] text-[clamp(2.125rem,6vw,3.875rem)] font-bold leading-[1.02] tracking-[-0.02em] text-balance">
            {titulo}
          </h1>
          {resumen && (
            <p className="max-w-[45rem] text-[clamp(1.0625rem,2vw,1.25rem)] leading-normal text-texto-dock text-pretty">
              {resumen}
            </p>
          )}
        </div>
      </section>
      <div className="mx-auto flex max-w-[72.5rem] flex-wrap items-start gap-x-12 gap-y-8 px-5 pb-[4.5rem] pt-8">
        {indice && indice.length > 0 && <Indice items={indice} />}
        <article className="prosa min-w-0 max-w-[46.25rem] flex-[999_1_32.5rem]">{children}</article>
      </div>
      <BarraInfoMovil conIndice={!!indice?.length} />
    </>
  );
}

/** Índice de la página (enlaces a anclas): columna fija desde pantallas anchas, plegable en las angostas */
function Indice({ items }: { items: ItemIndice[] }) {
  const cabecera = (
    <>
      <span>En esta página</span>
      <span className="text-acento">{items.length}</span>
    </>
  );
  const lista = (
    <ol className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.id}>
          <a
            href={`#${it.id}`}
            className="flex gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[0.9375rem] leading-[1.35] text-[#e6edf2] hover:bg-white/10"
          >
            <span aria-hidden="true" className="font-mono text-xs font-medium leading-[1.6] text-acento">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{it.texto}</span>
          </a>
        </li>
      ))}
    </ol>
  );
  const caja = "oscuro w-full rounded-[20px] bg-tinta px-2 pb-2 pt-1.5 text-[#e6edf2]";
  const fila = "mono-etiqueta flex min-h-11 items-center justify-between px-2.5 text-gris-dock";
  return (
    <>
      {/* Pantallas anchas: siempre abierto y fijo junto al texto */}
      <nav
        aria-label="En esta página"
        className={`${caja} sticky top-[5.25rem] hidden max-h-[calc(100dvh-6.5rem)] flex-[1_1_15rem] self-start overflow-y-auto lg:block`}
      >
        <p className={fila}>{cabecera}</p>
        {lista}
      </nav>
      {/* Pantallas angostas: cerrado para no empujar el contenido (sin JavaScript también funciona) */}
      <nav aria-label="En esta página" className="w-full lg:hidden">
        <details id="indice" className={`${caja} scroll-mt-[5.25rem]`}>
          <summary className={`${fila} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{cabecera}</summary>
          {lista}
        </details>
      </nav>
    </>
  );
}

/** Teléfono con enlace tel: (se quita lo que no sea dígito para marcar) */
export function Tel({ numero, marcar }: { numero: string; marcar?: string }) {
  return (
    <a href={`tel:${(marcar ?? numero).replace(/[^\d+]/g, "")}`} className="font-semibold whitespace-nowrap">
      {numero}
    </a>
  );
}
