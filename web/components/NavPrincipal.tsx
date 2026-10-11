"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

const PRINCIPALES = [
  { href: "/", texto: "Mapa" },
  { href: "/que-hacer", texto: "Qué hacer" },
  { href: "/denunciar", texto: "Denunciar" },
];
const SECUNDARIOS = [
  { href: "/metodologia", texto: "Metodología" },
  { href: "/datos", texto: "Datos abiertos" },
  { href: "/privacidad", texto: "Privacidad" },
  { href: "/acerca", texto: "Acerca de" },
];
const ANCHO_MENU = 232;

/**
 * Navegación en una píldora blanca. En las páginas informativas va fija arriba, con «Reportar en el mapa»;
 * sobre el mapa flota en la esquina y deja a la derecha los controles que pase el mapa (`extra`).
 * En escritorio los enlaces secundarios viven en «Más»; en móvil todo va en el menú de hamburguesa.
 */
export default function NavPrincipal({
  variante = "pagina",
  extra,
}: {
  variante?: "pagina" | "mapa";
  extra?: ReactNode;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [izquierdaMenu, setIzquierdaMenu] = useState<number | null>(null);
  const caja = useRef<HTMLElement>(null);
  const pildora = useRef<HTMLElement>(null);

  // Cerrar el menú al navegar, con Escape o al hacer clic fuera
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAbierto(false);
  }, [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("mousedown", fuera);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("mousedown", fuera);
    };
  }, [abierto]);

  function alternar() {
    // En escritorio el menú se alinea con el borde derecho de la píldora (donde está «Más»)
    const p = pildora.current;
    if (p) setIzquierdaMenu(Math.max(0, p.offsetLeft + p.offsetWidth - ANCHO_MENU));
    setAbierto(!abierto);
  }

  const actual = (href: string) => (ruta === href ? "page" : undefined);
  const pastilla = (activa: boolean) =>
    `inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-2xl px-3 text-sm ${
      activa ? "bg-tinta text-white" : "text-tinta hover:bg-niebla"
    }`;
  const sombra =
    variante === "mapa" ? "shadow-[0_4px_16px_rgba(11,34,51,0.16)]" : "shadow-[0_4px_16px_rgba(11,34,51,0.12)]";

  const hamburguesa = (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={abierto}
      aria-controls="menu-principal"
      aria-label={abierto ? "Cerrar el menú" : "Abrir el menú"}
      className={`pointer-events-auto flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-full bg-white md:hidden ${sombra}`}
    >
      <span aria-hidden="true" className="h-0.5 w-4 bg-tinta" />
      <span aria-hidden="true" className="h-0.5 w-4 bg-tinta" />
      <span aria-hidden="true" className="h-0.5 w-4 bg-tinta" />
    </button>
  );

  const menu = abierto && (
    <ul
      id="menu-principal"
      style={izquierdaMenu != null ? ({ "--izq-menu": `${izquierdaMenu}px` } as React.CSSProperties) : undefined}
      className={`pointer-events-auto absolute z-50 flex ${
        variante === "mapa" ? "right-0 top-[calc(100%+0.5rem)]" : "right-3 top-[calc(100%-2px)]"
      } w-[14.5rem] flex-col rounded-[18px] border border-borde bg-white p-1.5 shadow-[0_16px_40px_rgba(11,34,51,0.28)] md:right-auto md:left-[var(--izq-menu,1rem)]`}
    >
      {[...PRINCIPALES, ...SECUNDARIOS].map((l) => (
        // Los principales ya están en la píldora en escritorio: en el menú solo hacen falta en móvil
        <li key={l.href} className={PRINCIPALES.includes(l) ? "md:hidden" : ""}>
          <Link
            href={l.href}
            aria-current={actual(l.href)}
            className={`flex min-h-11 items-center rounded-xl px-3.5 text-[0.9375rem] text-tinta ${
              ruta === l.href ? "bg-acento font-bold" : "hover:bg-niebla"
            }`}
          >
            {l.texto}
          </Link>
        </li>
      ))}
    </ul>
  );

  const nav = (
    <nav
      ref={pildora}
      aria-label="Principal"
      className={`pointer-events-auto flex h-11 shrink-0 items-center gap-0.5 rounded-full bg-white pl-3.5 pr-1.5 md:h-12 md:pl-4 ${sombra}`}
    >
      <Link
        href="/"
        aria-current={actual("/")}
        className="mr-1 flex min-h-11 items-center gap-1.5 whitespace-nowrap text-base font-bold text-tinta md:mr-2.5"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="var(--marca)">
          <path d="M12 2.5c-3.2 4.2-6 7.6-6 11a6 6 0 0 0 12 0c0-3.4-2.8-6.8-6-11Z" />
        </svg>
        Agua ZMG
      </Link>
      <ul className="hidden items-center gap-0.5 md:flex">
        {PRINCIPALES.slice(1).map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={actual(l.href)} className={pastilla(ruta === l.href)}>
              {l.texto}
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={abierto}
            aria-controls="menu-principal"
            className={pastilla(SECUNDARIOS.some((l) => l.href === ruta))}
          >
            Más<span aria-hidden="true">▾</span>
          </button>
        </li>
      </ul>
    </nav>
  );

  if (variante === "mapa") {
    return (
      <header
        ref={caja}
        className="pointer-events-none absolute inset-x-3 top-3.5 z-30 flex items-start justify-between gap-2 md:inset-x-4 md:top-4"
      >
        {nav}
        <div className="flex items-center gap-1.5">
          {extra}
          {hamburguesa}
        </div>
        {menu}
      </header>
    );
  }

  return (
    <header ref={caja} className="sticky top-0 z-30 flex items-center gap-2.5 bg-niebla/90 p-3 backdrop-blur-md">
      {nav}
      <span className="flex-1" />
      <Link
        href="/"
        className="hidden h-12 items-center rounded-full bg-acento px-5 text-[0.9375rem] font-bold text-tinta shadow-[0_4px_16px_rgba(11,34,51,0.12)] hover:bg-acento-fuerte md:flex"
      >
        Reportar en el mapa
      </Link>
      {hamburguesa}
      {menu}
    </header>
  );
}
