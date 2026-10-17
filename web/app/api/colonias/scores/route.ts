import { pool } from "@/lib/db";
import { paraContrato, scoresConCache } from "@/lib/aggregation";

// Gravedad por colonia (0 limpia a 4 crítica) con agregación robusta (lib/aggregation.ts, método v3): tope de
// peso por red, decaimiento, media recortada y confianza baja/media/alta.
// Solo cuenta estado='visible' y sospechoso=false. Se publica toda colonia con al menos un reporte
// completo; la confianza dice qué tan respaldado está. No expone huellas, redes ni comentarios.
export async function GET() {
  const scores = await scoresConCache(pool);
  return Response.json(scores.map(paraContrato), {
    headers: {
      "Cache-Control": "public, max-age=20, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400",
    },
  });
}
