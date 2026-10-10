import { bandera, error, leerMunicipio, memorizar, opciones, responderPublico } from "../_lib/comun";
import { aCsv } from "../_lib/csv";
import { coloniasResumen, filtrar } from "../_lib/datos";

// GET /api/v1/resumen.csv  ->  una fila por colonia, solo agregados.
// SIN huellas, SIN comentarios, SIN ningún dato personal. Parámetros: municipio, con_datos=1
export async function GET(request: Request) {
  const url = new URL(request.url);
  const municipioNorm = leerMunicipio(url);
  if (municipioNorm === null) return error(400, "municipio no reconocido (usa nombres de la ZMG, p. ej. Zapopan o Tlaquepaque)");
  const filtro = { municipioNorm, soloConDatos: bandera(url, "con_datos") };
  // Fecha de corte en hora de Guadalajara
  const corte = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

  try {
    const clave = `csv:${filtro.municipioNorm ?? ""}|${filtro.soloConDatos}|${corte}`;
    return await responderPublico(
      request,
      clave,
      "text/csv; charset=utf-8",
      async () => {
        const todas = await memorizar("csv", 60_000, () => coloniasResumen());
        return aCsv(filtrar(todas, filtro).map((x) => x.fila), corte);
      },
      { "Content-Disposition": `attachment; filename="agua-zmg-resumen-${corte}.csv"` },
    );
  } catch (e) {
    console.error("[api/v1/resumen.csv]", e);
    return error(503, "Servicio no disponible, intenta de nuevo en un momento");
  }
}

export function OPTIONS() {
  return opciones();
}
