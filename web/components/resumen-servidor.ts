import { cacheLife } from "next/cache";

export type ResumenNiveles = {
  conNivel: number;
  afectadas: number;
  porNivel: [number, number, number, number];
};

/**
 * Resumen agregado para la imagen Open Graph. Usa el endpoint de scores (el contrato de API),
 * así el resumen siempre coincide con lo que muestra el mapa. Si algo falla devuelve null y la
 * imagen sale sin cifras (mejor que mostrar un número equivocado).
 */
export async function obtenerResumen(): Promise<ResumenNiveles | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  try {
    const { GET } = await import("@/app/api/colonias/scores/route");
    const res = await GET();
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    const reales = data as { id: number; nivel: number; confianza: string }[];
    const porNivel: [number, number, number, number] = [0, 0, 0, 0];
    let afectadas = 0;
    for (const s of reales) {
      if (s.nivel >= 1 && s.nivel <= 4) porNivel[s.nivel - 1]++;
      if (s.nivel >= 2 && s.confianza !== "baja") afectadas++;
    }
    return { conNivel: reales.length, afectadas, porNivel };
  } catch {
    return null;
  }
}
