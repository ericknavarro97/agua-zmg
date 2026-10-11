import Link from "next/link";
import { REPO_URL } from "@/lib/sitio";

const ENLACES = [
  { href: "/metodologia", texto: "Metodología" },
  { href: "/datos", texto: "Datos" },
  { href: "/privacidad", texto: "Privacidad" },
  { href: "/acerca", texto: "Acerca de" },
];

/** Pie con el aviso permanente de que esto no es información oficial */
export default function PieSitio() {
  return (
    <footer className="border-t border-borde px-5 pb-28 pt-5 text-sm text-[#3b4f5c] md:pb-7">
      <div className="mx-auto flex max-w-[72.5rem] flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
        <p>
          <strong className="text-tinta">Información ciudadana, no oficial.</strong> No es consejo médico ni sustituye un
          análisis de laboratorio.
        </p>
        <ul className="mono-etiqueta flex flex-wrap gap-x-[18px] gap-y-1.5 !text-[0.78rem] !tracking-[0.03em]">
          {ENLACES.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-block py-1 text-marca underline-offset-2 hover:underline">
                {l.texto}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block py-1 text-marca underline-offset-2 hover:underline"
            >
              Código<span className="sr-only"> (GitHub, abre en otra pestaña)</span>
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
