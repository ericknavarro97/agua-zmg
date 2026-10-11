"use client";

import Link from "next/link";

/**
 * Barra fija abajo en móvil para las páginas informativas: ir al índice y volver al mapa a reportar.
 * El índice es un <details>: el botón lo abre antes de desplazarse, porque el ancla sola no lo despliega.
 */
export default function BarraInfoMovil({ conIndice }: { conIndice: boolean }) {
  function irAlIndice(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = document.getElementById("indice");
    if (!(el instanceof HTMLDetailsElement)) return;
    e.preventDefault();
    el.open = true;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
    el.querySelector("summary")?.focus({ preventScroll: true });
  }

  return (
    <div className="oscuro fixed inset-x-3 bottom-3 z-30 flex gap-2 rounded-[22px] bg-tinta p-2 shadow-[0_14px_40px_rgba(11,34,51,0.4)] md:hidden">
      {conIndice && (
        <a
          href="#indice"
          onClick={irAlIndice}
          className="mono-etiqueta flex h-[3.125rem] items-center rounded-[15px] bg-white/10 px-[18px] !text-[0.78rem] text-white"
        >
          Índice
        </a>
      )}
      <Link
        href="/"
        className="flex h-[3.125rem] flex-1 items-center justify-center rounded-[15px] bg-acento text-base font-bold text-tinta"
      >
        Reportar en el mapa
      </Link>
    </div>
  );
}
