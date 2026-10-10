"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

export default function NavPrincipal() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

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

  const enlace = (href: string) =>
    `inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium hover:bg-white/15 sm:px-3 ${
      ruta === href ? "bg-white/20 underline underline-offset-4" : ""
    }`;

  return (
    <header className="relative z-40 bg-marca text-white shadow">
      <nav aria-label="Principal" className="mx-auto flex max-w-6xl items-center gap-1 px-2 py-1 sm:px-4">
        <Link href="/" className="mr-1 flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-base font-bold sm:mr-2 sm:gap-2">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
            <path d="M12 2.5c-3.2 4.2-6 7.6-6 11a6 6 0 0 0 12 0c0-3.4-2.8-6.8-6-11Z" />
          </svg>
          Agua ZMG
        </Link>
        <ul className="flex items-center">
          {PRINCIPALES.map((l) => (
            <li key={l.href} className={l.href === "/" ? "hidden sm:block" : ""}>
              <Link href={l.href} aria-current={ruta === l.href ? "page" : undefined} className={enlace(l.href)}>
                {l.texto}
              </Link>
            </li>
          ))}
        </ul>
        <div ref={caja} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            aria-controls="menu-mas"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium hover:bg-white/15"
          >
            Más
            <span aria-hidden="true">▾</span>
          </button>
          {abierto && (
            <ul
              id="menu-mas"
              className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg bg-white py-1 text-slate-900 shadow-xl ring-1 ring-slate-300"
            >
              {SECUNDARIOS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={ruta === l.href ? "page" : undefined}
                    className={`flex min-h-11 items-center px-4 text-sm hover:bg-slate-100 ${ruta === l.href ? "font-bold" : ""}`}
                  >
                    {l.texto}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </header>
  );
}
