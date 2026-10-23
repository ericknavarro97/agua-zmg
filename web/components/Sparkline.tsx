import { GRAVEDADES } from "@/lib/severity";
import { etiquetaNivel, nivelDeScore } from "./niveles";
import type { PuntoSerie } from "./tipos";

const W = 300;
const H = 96;
const PAD = { l: 54, r: 8, t: 8, b: 20 };
/** Como mínimo se dibujan 30 días; con más historial, desde el primer reporte (hasta un año en la gráfica). */
const DIAS_MIN = 30;
const DIAS_MAX = 365;
const DIA_MS = 86_400_000;

/** Hoy en Guadalajara (YYYY-MM-DD), el mismo día local que usa el servidor para la serie */
const hoyGdl = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const aMs = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
const aDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Historial de una colonia: gravedad promedio por día (línea) y número de reportes (barras), desde el primer reporte
 * (mínimo 30 días). Desde el método v5 ningún reporte deja de contar, así que la gráfica no se corta a 30 días.
 * Accesible: el SVG tiene título y descripción, y hay una tabla con los mismos datos.
 */
export default function Sparkline({ serie }: { serie: PuntoSerie[] }) {
  const porDia = new Map(serie.map((p) => [p.dia, p]));
  const hoyMs = aMs(hoyGdl());
  const primero = serie.length ? Math.min(...serie.map((p) => aMs(p.dia))) : hoyMs;
  const DIAS = Math.min(DIAS_MAX, Math.max(DIAS_MIN, Math.round((hoyMs - primero) / DIA_MS) + 1));
  const dias: { dia: string; n: number; score: number | null }[] = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const k = aDia(hoyMs - i * DIA_MS);
    const p = porDia.get(k);
    dias.push({ dia: k, n: p?.n ?? 0, score: p?.score ?? null });
  }
  const conDatos = dias.filter((d) => d.n > 0 && d.score != null);
  const totalN = dias.reduce((a, d) => a + d.n, 0);
  const maxN = Math.max(1, ...dias.map((d) => d.n));

  const x = (i: number) => PAD.l + (i / (DIAS - 1)) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + ((4 - s) / 4) * (H - PAD.t - PAD.b);
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
      ? `No hay reportes en los últimos ${DIAS} días.`
      : `${totalN} ${totalN === 1 ? "reporte" : "reportes"} en ${conDatos.length} ${conDatos.length === 1 ? "día" : "días"} de los últimos ${DIAS}. Gravedad promedio más reciente: ${etiquetaNivel(
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
        <title id="spark-t">Historial de reportes: últimos {DIAS} días</title>
        <desc id="spark-d">{resumen}</desc>
        {/* Líneas guía de cada nivel */}
        {GRAVEDADES.map(({ nivel: n, etiqueta }) => (
          <g key={n}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(n)} y2={y(n)} stroke="#d9e0e5" strokeWidth={1} />
            <text x={PAD.l - 5} y={y(n) + 3} textAnchor="end" fontSize={9} fill="#52646f">
              {etiqueta}
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
              fill="#9fb3c2"
              opacity={0.7}
            />
          ) : null,
        )}
        {tramos.map((t, i) => (
          <path key={i} d={t} fill="none" stroke="#0b2233" strokeWidth={1.5} strokeLinejoin="round" />
        ))}
        {dias.map((d, i) =>
          d.n > 0 && d.score != null ? (
            <circle
              key={d.dia}
              cx={x(i)}
              cy={y(d.score)}
              r={3.2}
              fill={GRAVEDADES[nivelDeScore(d.score) ?? 0].color}
              stroke="#0b2233"
              strokeWidth={1}
            />
          ) : null,
        )}
        <text x={PAD.l} y={H - 5} fontSize={9} fill="#52646f">hace {DIAS - 1} días</text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize={9} fill="#52646f">hoy</text>
      </svg>
      <figcaption className="mt-1 text-xs text-texto-tenue">
        {resumen} Las barras grises muestran cuántos reportes hubo cada día.
      </figcaption>
      {conDatos.length > 0 && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer py-1 text-marca underline">Ver los datos en tabla</summary>
          <table className="mt-2 w-full border-collapse text-left">
            <caption className="sr-only">Reportes por día en los últimos {DIAS} días</caption>
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
