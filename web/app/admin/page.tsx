import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { pool } from "@/lib/db";
import { bitacora, colaRevision, resumenModeracion, type ReporteAdmin } from "@/lib/moderation";
import { COOKIE_SESION, adminHabilitado, sesionValida } from "../api/admin/auth";
import { Acciones, BuscarColonia, LoginForm, Salir } from "./Acciones";

export const metadata: Metadata = {
  title: "Moderación · Agua ZMG",
  robots: { index: false, follow: false },
};

// Panel mínimo de moderación (server-side). Protegido por ADMIN_TOKEN: sin él, la página no existe (404).
export default function AdminPage() {
  return (
    <main id="contenido" className="mx-auto w-full max-w-4xl p-4 text-sm">
      <h1 className="mb-1 text-xl font-semibold">Moderación</h1>
      <p className="mb-4 text-slate-600">
        Los reportes en revisión no cuentan en el mapa hasta que una persona decida. Se oculta por <strong>cómo</strong> llegó
        el reporte (ráfaga, datos personales, spam), nunca por lo que dice. Cada acción queda en una bitácora que no se puede editar.
      </p>
      <Suspense fallback={<p>Cargando…</p>}>
        <Panel />
      </Suspense>
    </main>
  );
}

async function Panel() {
  // Todo esto depende de la petición (cookie, ADMIN_TOKEN, hora): nunca se prerenderiza
  await connection();
  const sesion = (await cookies()).get(COOKIE_SESION)?.value;
  if (!adminHabilitado()) {
    console.warn("[admin] ADMIN_TOKEN no configurado o demasiado corto (mínimo 16): el panel está deshabilitado");
    notFound();
  }
  if (!sesionValida(sesion)) return <LoginForm />;

  const [resumen, cola, bit] = await Promise.all([resumenModeracion(pool), colaRevision(pool), bitacora(pool)]);
  const porColonia = new Map<number, ReporteAdmin[]>();
  for (const r of cola) porColonia.set(r.colonia_id, [...(porColonia.get(r.colonia_id) ?? []), r]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <Dato k="Visibles" v={resumen.por_estado.visible ?? 0} />
          <Dato k="En revisión" v={resumen.por_estado.revision ?? 0} />
          <Dato k="Ocultos" v={resumen.por_estado.oculto ?? 0} />
          <Dato k="Últimas 24 h" v={resumen.reportes_24h} />
        </dl>
        <Salir />
      </div>

      {resumen.retencion_vencida > 0 && (
        <p role="alert" className="mb-4 rounded border border-amber-600 bg-amber-50 p-2 text-amber-950">
          Retención vencida: {resumen.retencion_vencida} reporte(s) de más de 31 días aún conservan identificadores o comentario.
          La tarea diaria <code>pnpm purge</code> no está corriendo; el aviso de privacidad promete borrarlos a los 30 días.
        </p>
      )}

      {resumen.sospechosos_7d.length > 0 && (
        <p className="mb-4 rounded border border-slate-300 p-2">
          Marcados como sospechosos en 7 días (no cuentan y no están en la cola):{" "}
          {resumen.sospechosos_7d.map((s) => `${s.motivo}: ${s.n}`).join(" · ")}
        </p>
      )}

      <h2 className="mb-2 text-lg font-semibold">Cola de revisión ({cola.length})</h2>
      {porColonia.size === 0 && <p className="mb-6 text-slate-600">No hay reportes en revisión.</p>}
      {[...porColonia.entries()].map(([id, rs]) => (
        <section key={id} className="mb-4 rounded border border-slate-300 p-3">
          <h3 className="mb-2 font-medium">
            {rs[0].colonia} <span className="text-slate-500">({rs[0].municipio ?? "—"}, id {id})</span> · {rs.length} reportes
          </h3>
          <Acciones reportes={JSON.parse(JSON.stringify(rs))} />
        </section>
      ))}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Ver reportes de una colonia</h2>
      <BuscarColonia />

      <h2 className="mb-2 mt-6 text-lg font-semibold">Bitácora reciente</h2>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="py-1 pr-2">Fecha</th><th className="pr-2">Actor</th><th className="pr-2">Acción</th>
            <th className="pr-2">Reportes</th><th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {bit.map((b) => (
            <tr key={b.id} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-2 whitespace-nowrap">{new Date(b.creado_en).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</td>
              <td className="pr-2">{b.actor}</td>
              <td className="pr-2">{b.accion}</td>
              <td className="pr-2">{b.n_reportes} (col. {b.colonia_id ?? "varias"})</td>
              <td>{b.motivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Dato({ k, v }: { k: string; v: number }) {
  return (
    <div>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-lg font-semibold">{v}</dd>
    </div>
  );
}
