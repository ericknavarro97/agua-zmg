"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { GRAVEDADES } from "@/lib/severity";

export type FilaReporte = {
  id: number;
  colonia_id: number;
  colonia: string;
  municipio: string | null;
  gravedad: number;
  sintomas: string[];
  comentario: string | null;
  creado_en: string;
  estado: string;
  sospechoso: boolean;
  motivo: string | null;
  canal: string;
  tiempo_ms: number | null;
  comentario_publico: boolean;
};

const fecha = (s: string) =>
  new Date(s).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" });
const boton = "rounded border border-slate-400 px-2 py-1 hover:bg-slate-100 disabled:opacity-50";
const ESTADOS: Record<string, string> = { visible: "Visible", revision: "En revisión", oculto: "Oculto" };
const NIVELES = GRAVEDADES.map((g) => g.etiqueta);

/** Todos los reportes en una tabla (más recientes primero), con filtros y acciones sobre las filas marcadas. */
export default function TablaReportes({ reportes, total }: { reportes: FilaReporte[]; total: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState("");
  const [texto, setTexto] = useState("");
  const [soloComentarios, setSoloComentarios] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return reportes.filter(
      (r) =>
        (!estado || r.estado === estado) &&
        (!soloComentarios || !!r.comentario) &&
        (!q || `${r.colonia} ${r.municipio ?? ""} ${r.colonia_id}`.toLowerCase().includes(q)),
    );
  }, [reportes, estado, texto, soloComentarios]);

  const idsVisibles = filas.map((r) => r.id);
  const todasMarcadas = idsVisibles.length > 0 && idsVisibles.every((id) => sel.has(id));

  function alternar(id: number) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  }
  function alternarTodas() {
    const n = new Set(sel);
    for (const id of idsVisibles) {
      if (todasMarcadas) n.delete(id);
      else n.add(id);
    }
    setSel(n);
  }

  async function aplicar(accion: "ocultar" | "restaurar" | "borrar_comentario") {
    const ids = [...sel];
    if (ids.length === 0) return setMsg("Marca al menos un reporte.");
    if (motivo.trim().length < 10) return setMsg("Escribe el motivo (mínimo 10 caracteres).");
    const verbo = accion === "ocultar" ? "Ocultar" : accion === "restaurar" ? "Restaurar" : "Borrar el comentario de";
    if (!confirm(`${verbo} ${ids.length} reporte(s)?`)) return;
    setOcupado(true);
    setMsg("");
    const r = await fetch("/api/admin/moderacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ids, motivo: motivo.trim() }),
    });
    setOcupado(false);
    if (!r.ok) return setMsg("No se pudo aplicar (" + r.status + ").");
    const { cambiados } = await r.json();
    setMsg(`Listo: ${cambiados} reporte(s) cambiaron.`);
    setSel(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded border border-slate-400 p-1">
            <option value="">Todos</option>
            <option value="visible">Visibles</option>
            <option value="revision">En revisión</option>
            <option value="oculto">Ocultos</option>
          </select>
        </label>
        <input
          value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Filtrar por colonia, municipio o id"
          aria-label="Filtrar por colonia, municipio o id" className="min-w-56 flex-1 rounded border border-slate-400 p-1"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloComentarios} onChange={(e) => setSoloComentarios(e.target.checked)} />
          Solo con comentario
        </label>
        <span className="text-slate-600">
          {filas.length} de {reportes.length}
          {total > reportes.length ? ` (mostrando los ${reportes.length} más recientes de ${total})` : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-slate-300">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-100">
            <tr className="border-b border-slate-300">
              <th className="p-2">
                <input type="checkbox" aria-label="Marcar todos los reportes de la tabla" checked={todasMarcadas} onChange={alternarTodas} />
              </th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Colonia</th>
              <th className="p-2">Gravedad</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Síntomas</th>
              <th className="p-2">Comentario</th>
              <th className="p-2">Canal</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={8} className="p-3 text-slate-600">No hay reportes con ese filtro.</td></tr>
            )}
            {filas.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top">
                <td className="p-2">
                  <input type="checkbox" aria-label={`Seleccionar reporte ${r.id}`} checked={sel.has(r.id)} onChange={() => alternar(r.id)} />
                </td>
                <td className="whitespace-nowrap p-2">{fecha(r.creado_en)}</td>
                <td className="p-2">
                  <span className="font-medium">{r.colonia}</span>
                  <span className="block text-xs text-slate-600">{r.municipio ?? "—"} · id {r.colonia_id}</span>
                </td>
                <td className="whitespace-nowrap p-2">
                  <strong>{r.gravedad}</strong> {NIVELES[r.gravedad]}
                </td>
                <td className="whitespace-nowrap p-2">
                  {ESTADOS[r.estado] ?? r.estado}
                  {r.sospechoso ? " · sospechoso" : ""}
                  {r.motivo && <span className="block text-xs text-slate-600">{r.motivo}</span>}
                </td>
                <td className="p-2 text-slate-700">{r.sintomas.length ? r.sintomas.join(", ") : "—"}</td>
                <td className="min-w-48 max-w-xs p-2 text-slate-700">{r.comentario ? (
                    <>
                      &ldquo;{r.comentario}&rdquo;
                      <span className="block text-xs text-slate-600">{r.comentario_publico && r.estado === "visible" && !r.sospechoso ? "Público en la colonia" : "No público"}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}</td>
                <td className="whitespace-nowrap p-2 text-xs text-slate-600">
                  {r.canal}
                  {r.tiempo_ms != null ? ` · ${(r.tiempo_ms / 1000).toFixed(1)} s` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (obligatorio)"
          aria-label="Motivo de la acción sobre los reportes marcados" className="min-w-64 flex-1 rounded border border-slate-400 p-1"
        />
        <button className={boton} disabled={ocupado || sel.size === 0} onClick={() => aplicar("restaurar")}>Restaurar ({sel.size})</button>
        <button className={boton} disabled={ocupado || sel.size === 0} onClick={() => aplicar("ocultar")}>Ocultar ({sel.size})</button>
        <button className={boton} disabled={ocupado || sel.size === 0} onClick={() => aplicar("borrar_comentario")}>Borrar comentario ({sel.size})</button>
      </div>
      <p className="mt-1 text-xs text-slate-600">Las acciones solo afectan a los reportes marcados.</p>
      {msg && <p role="status" className="mt-1">{msg}</p>}
    </div>
  );
}
