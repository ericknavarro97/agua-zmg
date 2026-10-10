import type { ReactNode } from "react";
import { NOMBRE_FUENTE } from "./fuentes";

/**
 * Enlace a una fuente externa: siempre visible, con aviso de pestaña nueva para lectores de pantalla.
 * Sin texto propio, el nombre accesible incluye cuál es la fuente (no todos los enlaces "[fuente]" suenan igual).
 */
export function Fuente({ href, children }: { href: string; children?: ReactNode }) {
  const nombre = children == null ? NOMBRE_FUENTE[href] : undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="whitespace-nowrap text-sm"
    >
      [{children ?? "fuente"}
      <span className="sr-only">{nombre ? `: ${nombre}` : ""} (abre en otra pestaña)</span>]
    </a>
  );
}

/** Etiqueta para datos que vienen de notas de prensa y no de un documento oficial */
export function SegunMedios() {
  return <span className="text-sm text-slate-600"> (según medios)</span>;
}

const TONOS = {
  info: "border-sky-600 bg-sky-50 text-sky-950",
  alerta: "border-amber-600 bg-amber-50 text-amber-950",
  peligro: "border-red-700 bg-red-50 text-red-950",
  ok: "border-emerald-700 bg-emerald-50 text-emerald-950",
} as const;

export function Aviso({
  tono = "info",
  titulo,
  children,
}: {
  tono?: keyof typeof TONOS;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`not-prose my-5 rounded-lg border-l-4 p-4 text-base leading-relaxed ${TONOS[tono]}`}>
      {titulo && <p className="mb-1 font-bold">{titulo}</p>}
      <div className="[&_a]:underline [&_p+p]:mt-2">{children}</div>
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

/** Contenedor de cada página informativa */
export function Pagina({
  titulo,
  resumen,
  children,
}: {
  titulo: string;
  resumen?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article>
      <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{titulo}</h1>
      {resumen && <p className="mt-3 text-lg leading-relaxed text-slate-700">{resumen}</p>}
      <div className="prosa">{children}</div>
    </article>
  );
}

/** Índice de la página (enlaces a anclas); `plegable` lo deja cerrado para no empujar el contenido en móvil */
export function Indice({ items, plegable = false }: { items: { id: string; texto: string }[]; plegable?: boolean }) {
  const lista = (
    <ul className="columns-1 gap-8 text-base sm:columns-2">
      {items.map((i) => (
        <li key={i.id} className="py-0.5">
          <a href={`#${i.id}`} className="text-sky-800 underline">{i.texto}</a>
        </li>
      ))}
    </ul>
  );
  return (
    <nav aria-label="En esta página" className="my-6 rounded-lg bg-white p-4 ring-1 ring-slate-300">
      {plegable ? (
        <details>
          <summary className="cursor-pointer py-1 font-bold text-slate-900">En esta página ({items.length} secciones)</summary>
          <div className="mt-2">{lista}</div>
        </details>
      ) : (
        <>
          <p className="mb-2 font-bold text-slate-900">En esta página</p>
          {lista}
        </>
      )}
    </nav>
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
