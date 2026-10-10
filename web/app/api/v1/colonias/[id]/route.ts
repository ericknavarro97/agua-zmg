import { cabecerasPublicas, error, memorizar, metadatos, opciones } from "../../_lib/comun";
import { coloniaDetalle } from "../../_lib/datos";

// GET /api/v1/colonias/[id]  ->  agregados de reportes (30 días) + datos externos con su fuente
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/colonias/[id]">) {
  const { id: idTexto } = await ctx.params;
  if (!/^\d{1,9}$/.test(idTexto)) return error(400, "id inválido");
  const id = Number(idTexto);

  try {
    const detalle = await memorizar(`det:${id}`, 60_000, () => coloniaDetalle(id));
    if (!detalle) return error(404, "Colonia no encontrada");
    const cuerpo = {
      ...detalle,
      metadata: metadatos(),
    };
    return new Response(JSON.stringify(cuerpo), {
      headers: cabecerasPublicas("application/json; charset=utf-8"),
    });
  } catch (e) {
    console.error("[api/v1/colonias/id]", e);
    return error(503, "Servicio no disponible, intenta de nuevo en un momento");
  }
}

export function OPTIONS() {
  return opciones();
}
