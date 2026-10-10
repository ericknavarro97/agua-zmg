import Link from "next/link";

/** Pie con el aviso permanente de que esto no es información oficial */
export default function PieSitio() {
  return (
    <footer className="border-t border-slate-300 bg-white px-4 py-3 text-xs text-slate-700">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="text-slate-900">Información ciudadana, no oficial.</strong> No es consejo médico ni
          sustituye un análisis de laboratorio.
        </p>
        <ul className="flex flex-wrap gap-x-4">
          <li><Link href="/metodologia" className="inline-block py-1 underline">Metodología</Link></li>
          <li><Link href="/datos" className="inline-block py-1 underline">Datos</Link></li>
          <li><Link href="/privacidad" className="inline-block py-1 underline">Privacidad</Link></li>
          <li><Link href="/acerca" className="inline-block py-1 underline">Acerca de</Link></li>
        </ul>
      </div>
    </footer>
  );
}
