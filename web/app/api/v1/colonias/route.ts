import { bandera, error, leerMunicipio, memorizar, metadatos, opciones, responderPublico } from "../_lib/comun";
import { coloniasFeatures, filtrar } from "../_lib/datos";

// GET /api/v1/colonias  ->  GeoJSON con score/nivel/confianza/n por colonia.
// Parámetros (todos opcionales): municipio=<nombre oficial o variante>, con_datos=1, sin_geometria=1
export async function GET(request: Request) {
  const url = new URL(request.url);
  const municipioNorm = leerMunicipio(url);
  if (municipioNorm === null) return error(400, "municipio no reconocido (usa nombres de la ZMG, p. ej. Zapopan o Tlaquepaque)");
  const base = { geometria: !bandera(url, "sin_geometria") };
  const filtro = { municipioNorm, soloConDatos: bandera(url, "con_datos") };

  try {
    const clave = `geo:${base.geometria}|${filtro.municipioNorm ?? ""}|${filtro.soloConDatos}`;
    return await responderPublico(request, clave, "application/geo+json; charset=utf-8", async () => {
      // Lista base en memoria (60 s): los filtros se aplican sobre ella, sin volver a consultar la base
      const todas = await memorizar(`geo:${base.geometria}`, 60_000, () => coloniasFeatures(base));
      const features = filtrar(todas, filtro).map((f) => f.json);
      // GeoJSON admite "miembros extranjeros" (RFC 7946, 6.1): licencia y aviso viajan con los datos
      const metadata = metadatos({
        n_colonias: features.length,
      });
      // Las features ya vienen serializadas: se arma el texto sin volver a parsear los polígonos
      return `{"type":"FeatureCollection","metadata":${JSON.stringify(metadata)},"features":[${features.join(",")}]}`;
    });
  } catch (e) {
    console.error("[api/v1/colonias]", e);
    return error(503, "Servicio no disponible, intenta de nuevo en un momento");
  }
}

export function OPTIONS() {
  return opciones();
}
