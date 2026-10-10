import { GRAVEDADES } from "@/lib/severity";
import { etiquetaNivel, nivelDeScore } from "./niveles";
import type { PuntoSerie } from "./tipos";

const W = 300;
const H = 96;
const PAD = { l: 54, r: 8, t: 8, b: 20 };
const DIAS = 30;

function claveDia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Gravedad promedio por día en los últimos 30 días (línea) y número de reportes (barras).
 * Accesible: el SVG tiene título y descripción, y hay una tabla con los mismos datos.
 */
export default function Sparkline({ serie }: { serie: PuntoSerie[] }) {
  const porDia = new Map(serie.map((p) => [p.dia, p]));
  const hoy = new Date();
  const dias: { dia: string; n: number; score: number | null }[] = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    const k = claveDia(d);
    const p = porDia.get(k);
    dias.push({ dia: k, n: p?.n ?? 0, score: p?.score ?? null });
  }
  const conDatos = dias.filter((d) => d.n > 0 && d.score != null);
  const totalN = dias.reduce((a, d) => a + d.n, 0);
  const maxN = Math.max(1, ...dias.map((d) => d.n));

  const x = (i: number) => PAD.l + (i / (DIAS - 1)) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + ((4 - s) / 3) * (H - PAD.t - PAD.b);
  const baseY = H - PAD.b;

  // Línea por tramos continuos (los días sin reportes cortan la línea)
  const tramos: string[] = [];
  let actual = "";
  dias.forEach((d, i) => {
    if (d.n > 0 && d.score != null) {
      actual += `${actual ? "L" : "M"}${x(i).toFixed(1)},${y(d.score).toFixed(1)}`;
    } else if (actual) {
      tramos.push(actual);
      actual = "";
    }
  });
  if (actual) tramos.push(actual);

  const resumen =
    conDatos.length === 0
      ? "No hay reportes en los últimos 30 días."
      : `${totalN} reportes en ${conDatos.length} días de los últimos 30. Gravedad promedio más reciente: ${etiquetaNivel(
          nivelDeScore(conDatos[conDatos.length - 1].score),
        )}.`;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-md"
        role="img"
        aria-labelledby="spark-t spark-d"
      >
        <title id="spark-t">Reportes de los últimos 30 días</title>
        <desc id="spark-d">{resumen}</desc>
        {/* Líneas guía de cada nivel */}
        {[1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(n)} y2={y(n)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.l - 5} y={y(n) + 3} textAnchor="end" fontSize={9} fill="#475569">
              {GRAVEDADES[n - 1].etiqueta}
            </text>
          </g>
        ))}
        {/* Barras: cantidad de reportes */}
        {dias.map((d, i) =>
          d.n > 0 ? (
            <rect
              key={d.dia}
              x={x(i) - 2}
              y={baseY - (d.n / maxN) * 14}
              width={4}
              height={(d.n / maxN) * 14}
              fill="#94a3b8"
              opacity={0.7}
            />
          ) : null,
        )}
        {tramos.map((t, i) => (
          <path key={i} d={t} fill="none" stroke="#0f172a" strokeWidth={1.5} strokeLinejoin="round" />
        ))}
        {dias.map((d, i) =>
          d.n > 0 && d.score != null ? (
            <circle
              key={d.dia}
              cx={x(i)}
              cy={y(d.score)}
              r={3.2}
              fill={GRAVEDADES[(nivelDeScore(d.score) ?? 1) - 1].color}
              stroke="#0f172a"
              strokeWidth={1}
            />
          ) : null,
        )}
        <text x={PAD.l} y={H - 5} fontSize={9} fill="#475569">hace 30 días</text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize={9} fill="#475569">hoy</text>
      </svg>
      <figcaption className="mt-1 text-xs text-slate-600">
        {resumen} Las barras grises muestran cuántos reportes hubo cada día.
      </figcaption>
      {conDatos.length > 0 && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer py-1 text-sky-800 underline">Ver los datos en tabla</summary>
          <table className="mt-2 w-full border-collapse text-left">
            <caption className="sr-only">Reportes por día en los últimos 30 días</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b py-1 pr-2">Día</th>
                <th scope="col" className="border-b py-1 pr-2">Reportes</th>
                <th scope="col" className="border-b py-1">Gravedad promedio</th>
              </tr>
            </thead>
            <tbody>
              {[...conDatos].reverse().map((d) => (
                <tr key={d.dia}>
                  <td className="border-b py-1 pr-2">{d.dia}</td>
                  <td className="border-b py-1 pr-2">{d.n}</td>
                  <td className="border-b py-1">{etiquetaNivel(nivelDeScore(d.score))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
