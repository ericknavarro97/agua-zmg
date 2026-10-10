import { z } from "zod";
import { pool } from "@/lib/db";
import { leerCuerpoAcotado } from "@/lib/fingerprint";
import { bitacora, borrarComentarios, colaRevision, moderar, reportesDeColonia, resumenModeracion } from "@/lib/moderation";
import { autenticar } from "../auth";

const sinCache = { "Cache-Control": "no-store" };

// GET  /api/admin/moderacion                 -> { resumen, cola (en revisión), bitacora }
// GET  /api/admin/moderacion?colonia_id=N    -> { reportes } de esa colonia (cualquier estado)
// POST /api/admin/moderacion {accion: ocultar|restaurar|degradar|borrar_comentario, ids, motivo, alias?} -> { cambiados }
// Nunca devuelve huellas ni redes. Requiere sesión o `Authorization: Bearer <ADMIN_TOKEN>`.
export async function GET(request: Request) {
  const a = await autenticar(request);
  if (!a.ok) return a.respuesta;
  const col = new URL(request.url).searchParams.get("colonia_id");
  if (col !== null) {
    const id = Number(col);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "colonia_id inválido" }, { status: 400, headers: sinCache });
    return Response.json({ reportes: await reportesDeColonia(pool, id) }, { headers: sinCache });
  }
  const [resumen, cola, bit] = await Promise.all([resumenModeracion(pool), colaRevision(pool), bitacora(pool)]);
  return Response.json({ resumen, cola, bitacora: bit }, { headers: sinCache });
}

const Body = z.object({
  accion: z.enum(["ocultar", "restaurar", "degradar", "borrar_comentario"]),
  ids: z.array(z.number().int().positive()).min(1).max(500),
  motivo: z.string().trim().min(10).max(200),
  alias: z.string().regex(/^[\w.-]{1,30}$/).optional(),
});

export async function POST(request: Request) {
  const a = await autenticar(request);
  if (!a.ok) return a.respuesta;
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Tipo de contenido no admitido" }, { status: 415, headers: sinCache });
  }
  const texto = await leerCuerpoAcotado(request, 16 * 1024);
  let json: unknown = null;
  try {
    json = JSON.parse(texto ?? "");
  } catch {
    /* falla la validación */
  }
  const p = Body.safeParse(json);
  if (!p.success) {
    return Response.json({ error: "Datos inválidos (motivo de 10 a 200 caracteres, hasta 500 reportes)" }, { status: 400, headers: sinCache });
  }
  const { accion, ids, motivo, alias } = p.data;
  if (accion === "borrar_comentario") {
    const borrados = await borrarComentarios(pool, ids, `mod:${alias ?? "admin"}`, motivo);
    return Response.json({ cambiados: borrados }, { headers: sinCache });
  }
  const cambiados = await moderar(pool, ids, accion, `mod:${alias ?? "admin"}`, motivo, "moderacion_manual");
  return Response.json({ cambiados }, { headers: sinCache });
}
