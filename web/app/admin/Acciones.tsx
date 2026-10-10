"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Reporte = {
  id: number;
  colonia_id: number;
  gravedad: number;
  sintomas: string[];
  comentario: string | null;
  creado_en: string;
  estado: string;
  sospechoso: boolean;
  motivo: string | null;
  canal: string;
  tiempo_ms: number | null;
};

const fecha = (s: string) => new Date(s).toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
const boton = "rounded border border-slate-400 px-2 py-1 hover:bg-slate-100 disabled:opacity-50";

export function LoginForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = await fetch("/api/admin/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (r.ok) router.refresh();
    else setError(r.status === 429 ? "Demasiados intentos. Espera unos minutos." : "Token incorrecto.");
  }
  return (
    <form onSubmit={entrar} className="flex max-w-sm flex-col gap-2">
      <label htmlFor="token">Token de administración</label>
      <input
        id="token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
        className="rounded border border-slate-400 p-2"
      />
      <button className={boton} type="submit">Entrar</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </form>
  );
}

export function Salir() {
  const router = useRouter();
  return (
    <button
      className={boton}
      onClick={async () => {
        await fetch("/api/admin/sesion", { method: "DELETE" });
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}

/** Lista de reportes con selección; ocultar / restaurar exigen motivo (mínimo 10 caracteres). */
export function Acciones({ reportes }: { reportes: Reporte[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function alternar(id: number) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  }

  async function aplicar(accion: "ocultar" | "restaurar" | "borrar_comentario") {
    const ids = sel.size ? [...sel] : reportes.map((r) => r.id);
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
      <ul className="mb-2 divide-y divide-slate-200">
        {reportes.map((r) => (
          <li key={r.id} className="flex gap-2 py-1">
            <input type="checkbox" aria-label={`Seleccionar reporte ${r.id}`} checked={sel.has(r.id)} onChange={() => alternar(r.id)} />
            <div>
              <div>
                Gravedad <strong>{r.gravedad}</strong> · {r.estado}
                {r.sospechoso ? " · sospechoso" : ""} · {fecha(r.creado_en)} · canal {r.canal}
                {r.tiempo_ms != null ? ` · ${(r.tiempo_ms / 1000).toFixed(1)} s` : ""}
              </div>
              {r.sintomas.length > 0 && <div className="text-slate-600">Síntomas: {r.sintomas.join(", ")}</div>}
              {r.comentario && <div className="text-slate-600">&ldquo;{r.comentario}&rdquo;</div>}
              {r.motivo && <div className="text-slate-500">Motivo de revisión: {r.motivo}</div>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (obligatorio)"
          aria-label="Motivo" className="min-w-64 flex-1 rounded border border-slate-400 p-1"
        />
        <button className={boton} disabled={ocupado} onClick={() => aplicar("restaurar")}>
          Restaurar {sel.size ? `(${sel.size})` : "todos"}
        </button>
        <button className={boton} disabled={ocupado} onClick={() => aplicar("ocultar")}>
          Ocultar {sel.size ? `(${sel.size})` : "todos"}
        </button>
        <button className={boton} disabled={ocupado} onClick={() => aplicar("borrar_comentario")}>
          Borrar comentario {sel.size ? `(${sel.size})` : "de todos"}
        </button>
      </div>
      {msg && <p role="status" className="mt-1">{msg}</p>}
    </div>
  );
}

/** Busca los reportes de una colonia (cualquier estado) para ocultar uno individual. */
export function BuscarColonia() {
  const [id, setId] = useState("");
  const [rs, setRs] = useState<Reporte[] | null>(null);
  const [msg, setMsg] = useState("");
  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await fetch(`/api/admin/moderacion?colonia_id=${encodeURIComponent(id)}`);
    if (!r.ok) return setMsg("No se pudo consultar (" + r.status + ").");
    setRs((await r.json()).reportes);
  }
  return (
    <div>
      <form onSubmit={buscar} className="mb-2 flex gap-2">
        <input
          value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" placeholder="id de colonia"
          aria-label="Id de colonia" className="rounded border border-slate-400 p-1"
        />
        <button className={boton} type="submit">Buscar</button>
      </form>
      {msg && <p role="status">{msg}</p>}
      {rs && (rs.length === 0 ? <p>Sin reportes.</p> : <Acciones reportes={rs} />)}
    </div>
  );
}
