import { z } from "zod";
import { leerCuerpoAcotado, origenPermitido } from "@/lib/fingerprint";
import {
  adminHabilitado,
  bloqueado,
  cabeceraCookie,
  emitirSesion,
  registrarFallo,
  tokenCorrecto,
} from "../auth";

const Body = z.object({ token: z.string().min(1).max(500) });
const sinCache = { "Cache-Control": "no-store" };

// Inicio de sesión del panel: cambia el ADMIN_TOKEN por una cookie HttpOnly firmada de 8 h.
export async function POST(request: Request) {
  if (!adminHabilitado()) return Response.json({ error: "No encontrado" }, { status: 404, headers: sinCache });
  const h = request.headers;
  if (!(h.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Tipo de contenido no admitido" }, { status: 415, headers: sinCache });
  }
  if (origenPermitido(h) === null) return Response.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  const texto = await leerCuerpoAcotado(request, 1024);
  let json: unknown = null;
  try {
    json = JSON.parse(texto ?? "");
  } catch {
    /* falla la validación */
  }
  const p = Body.safeParse(json);
  if (!p.success) return Response.json({ error: "Datos inválidos" }, { status: 400, headers: sinCache });
  if (!tokenCorrecto(p.data.token)) {
    // El token correcto siempre entra; el bloqueo por red solo frena a quien falla (ver auth.ts)
    if (await bloqueado(h)) {
      return Response.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429, headers: sinCache });
    }
    await registrarFallo(h);
    return Response.json({ error: "No autorizado" }, { status: 401, headers: sinCache });
  }
  return Response.json({ ok: true }, { headers: { ...sinCache, "Set-Cookie": cabeceraCookie(emitirSesion()) } });
}

// Cerrar sesión: borra la cookie.
export async function DELETE(request: Request) {
  if (origenPermitido(request.headers) === null) {
    return Response.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  return Response.json({ ok: true }, { headers: { ...sinCache, "Set-Cookie": cabeceraCookie(null) } });
}
