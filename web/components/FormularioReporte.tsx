"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GRAVEDADES, SINTOMAS } from "@/lib/severity";
import { Muestra, MuestraSinAgua } from "./niveles";

type Estado = "idle" | "enviando" | "ok" | "actualizado" | "error";
/** Un nivel 0-4, o «Hoy no llegó agua» (se envía como gravedad null y no entra en el color). */
type Eleccion = number | "sin_agua";

const CLAVE_LS = "agua-zmg:reportes-hoy";

/** Convenience por persona: recordar en este navegador qué colonias ya reportó hoy (no se envía a ningún lado) */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function yaReporto(id: number): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_LS) ?? "{}") as Record<string, string>;
    return raw[id] === hoyLocal();
  } catch {
    return false;
  }
}
function recordar(id: number) {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_LS) ?? "{}") as Record<string, string>;
    const hoy = hoyLocal();
    const limpio: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (v === hoy) limpio[k] = v;
    limpio[id] = hoy;
    localStorage.setItem(CLAVE_LS, JSON.stringify(limpio));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function mensajeDeError(status: number | null, reenvioPronto = false): string {
  // 429 con Retry-After: corrigió su reporte demasiado pronto (no es el límite diario)
  if (status === 429 && reenvioPronto) {
    return "Ya enviaste un reporte para esta colonia hace unos segundos. Espera un momento y vuelve a enviar para corregirlo; tu respuesta sigue aquí.";
  }
  switch (status) {
    case 400:
      return "Algo de lo que enviaste no es válido. Revisa que hayas elegido cómo llega el agua y que el comentario no pase de 500 caracteres.";
    case 404:
      return "No encontramos esa colonia. Puede que el mapa se haya actualizado: recarga la página y vuelve a elegirla.";
    case 429:
      return "Ya llegaste al límite de reportes por ahora. Es una medida contra el abuso: puedes volver a intentarlo más tarde. Gracias por tu paciencia.";
    case null:
      return "No pudimos conectarnos. Revisa tu internet y vuelve a intentarlo; tu respuesta sigue aquí, no se perdió.";
    default:
      return "Algo falló de nuestro lado. Intenta de nuevo en unos minutos; tu respuesta sigue aquí.";
  }
}

export default function FormularioReporte({
  coloniaId,
  nombre,
  onReportado,
  enfocar = false,
}: {
  coloniaId: number;
  nombre: string;
  onReportado: () => void;
  /** Llevar el foco al título al montarse (cuando la persona pidió reportar) */
  enfocar?: boolean;
}) {
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);
  const [sintomas, setSintomas] = useState<string[]>([]);
  const [comentario, setComentario] = useState("");
  const [hp, setHp] = useState(""); // señuelo anti-bots: una persona nunca lo ve ni lo llena
  const [estado, setEstado] = useState<Estado>("idle");
  const [mensaje, setMensaje] = useState("");
  const [hoyYa, setHoyYa] = useState(() => yaReporto(coloniaId)); // el formulario solo se monta en el navegador, tras una acción
  const abierto = useRef(0);

  const tituloForm = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    abierto.current = Date.now(); // para tiempo_ms
  }, [coloniaId]);
  useEffect(() => {
    if (enfocar) tituloForm.current?.focus({ preventScroll: true });
  }, [enfocar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (eleccion === null || estado === "enviando") return;
    setEstado("enviando");
    setMensaje("");
    let status: number | null = null;
    let reenvioPronto = false;
    try {
      const res = await fetch("/api/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colonia_id: coloniaId,
          gravedad: eleccion === "sin_agua" ? null : eleccion,
          sintomas,
          comentario: comentario.trim() || undefined,
          hp,
          // tope del servidor: 7 días (una pestaña olvidada abierta no debe dar un error que no se puede corregir)
          tiempo_ms: Math.min(7 * 24 * 3600 * 1000, Math.max(0, Date.now() - abierto.current)),
        }),
      });
      status = res.status;
      reenvioPronto = res.headers.has("Retry-After");
      if (res.status === 201 || res.status === 200) {
        recordar(coloniaId);
        setHoyYa(true);
        setEstado(res.status === 200 ? "actualizado" : "ok");
        onReportado();
        return;
      }
    } catch {
      status = null;
    }
    setEstado("error");
    setMensaje(mensajeDeError(status, reenvioPronto));
  }

  if (estado === "ok" || estado === "actualizado") {
    return (
      <div role="status" className="mt-4 rounded-xl bg-[#e2f1e7] p-3.5 text-sm text-[#0f3b22]">
        <p className="font-semibold">
          {estado === "ok" ? "¡Gracias! Recibimos tu reporte." : "Listo, actualizamos tu reporte de hoy."}
        </p>
        {eleccion === "sin_agua" ? (
          <p className="mt-1">
            Lo verás en el panel de la colonia en unos minutos, junto con los demás vecinos a los que no les llegó agua. No
            cambia el color del mapa: el color describe cómo llega el agua cuando sí llega.
          </p>
        ) : (
          <p className="mt-1">
            Se sumará al mapa en unos minutos. Con pocos reportes el color se ve tenue y se afirma conforme más vecinos
            reportan. Comparte el mapa con tus vecinos: mientras más reportes, más confiable es el color.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-4 space-y-4" aria-labelledby="form-t" noValidate>
      <h3 ref={tituloForm} id="form-t" tabIndex={-1} className="text-lg font-bold outline-none">Reporta el agua en {nombre}</h3>
      {hoyYa && (
        <p className="rounded-xl bg-[#e3edf3] p-2.5 text-xs text-tinta">
          Hoy ya enviaste un reporte de esta colonia desde este navegador. Si envías otro, actualiza el de hoy en lugar de sumar uno nuevo.
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-semibold">¿Cómo llega el agua a tu casa hoy?</legend>
        <p className="mb-2 text-xs text-[#3b4f5c]">
          Elige según cómo se ve y huele. Si hoy no llegó agua, elige «Hoy no llegó agua» al final: se cuenta aparte y no
          cambia el color. Si llega con poca presión, elige lo que ves y marca abajo «Sin agua / baja presión». Ningún nivel
          significa que el agua sea segura para beber.
        </p>
        <div className="space-y-2">
          {GRAVEDADES.map((g) => (
            <label
              key={g.nivel}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white p-2.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-700 ${
                eleccion === g.nivel ? "border-tinta" : "border-borde hover:border-[#b9c6cf]"
              }`}
            >
              <input
                type="radio"
                name="gravedad"
                value={g.nivel}
                className="sr-only"
                checked={eleccion === g.nivel}
                onChange={() => setEleccion(g.nivel)}
              />
              <Muestra nivel={g.nivel} grande />
              <span>
                <strong>{g.etiqueta}</strong>
                <span className="block text-xs text-[#3b4f5c]">{g.detalle}</span>
              </span>
              {eleccion === g.nivel && <span className="mono-etiqueta ml-auto !text-[0.6875rem]">Elegido</span>}
            </label>
          ))}
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed bg-white p-2.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-700 ${
              eleccion === "sin_agua" ? "border-tinta" : "border-borde hover:border-[#b9c6cf]"
            }`}
          >
            <input
              type="radio"
              name="gravedad"
              value="sin_agua"
              className="sr-only"
              checked={eleccion === "sin_agua"}
              onChange={() => setEleccion("sin_agua")}
            />
            <MuestraSinAgua grande />
            <span>
              <strong>Hoy no llegó agua</strong>
              <span className="block text-xs text-[#3b4f5c]">No hay agua que describir. Se cuenta aparte, no cambia el color</span>
            </span>
            {eleccion === "sin_agua" && <span className="mono-etiqueta ml-auto !text-[0.6875rem]">Elegido</span>}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">¿Qué notas? (opcional)</legend>
        <div className="flex flex-wrap gap-2">
          {SINTOMAS.map((s) => {
            const activo = sintomas.includes(s);
            return (
              <button
                type="button"
                key={s}
                aria-pressed={activo}
                onClick={() => setSintomas(activo ? sintomas.filter((x) => x !== s) : [...sintomas, s])}
                className={`min-h-9 rounded-full border px-3 py-1 text-sm ${
                  activo ? "border-tinta bg-tinta text-white" : "border-[#b9c6cf] bg-white text-tinta hover:border-tinta"
                }`}
              >
                {activo ? "✓ " : ""}
                {s}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="comentario" className="mb-1 block text-sm font-semibold">
          Comentario (opcional)
        </label>
        <textarea
          id="comentario"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Por ejemplo: sale café por las mañanas"
          aria-describedby="comentario-ayuda"
          className="w-full rounded-xl border border-[#b9c6cf] bg-white p-2.5 text-base outline-none placeholder:text-texto-tenue focus:border-tinta"
        />
        <p id="comentario-ayuda" className="mt-1 text-xs text-texto-tenue">
          <strong>Tu comentario se mostrará públicamente</strong> en la página de esta colonia en cuanto lo envíes, con el día y
          lo que elegiste arriba, sin tu nombre ni la hora. No escribas nombres, teléfonos ni tu dirección. {comentario.length}/500
        </p>
      </div>

      {/* Señuelo anti-bots: fuera de pantalla, sin foco y oculto para lectores de pantalla */}
      <div aria-hidden="true" inert className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Referencia interna
          <input
            type="text"
            name="referencia_interna"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </label>
      </div>

      <div aria-live="assertive">
        {estado === "error" && (
          <p role="alert" className="rounded-xl bg-[#f6e0e4] p-3 text-sm text-[#4a0f22]">
            {mensaje}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={eleccion === null || estado === "enviando"}
        className="min-h-12 w-full rounded-[15px] bg-tinta px-4 py-3 text-base font-bold text-white hover:bg-[#13334a] disabled:bg-[#9fb3c2] disabled:text-tinta"
      >
        {estado === "enviando" ? "Enviando…" : eleccion !== null ? "Enviar mi reporte" : "Elige cómo llega el agua para enviar"}
      </button>
      <p className="text-xs leading-relaxed text-texto-tenue">
        Sin cuenta ni nombre. No guardamos tu IP ni tu ubicación. Para evitar reportes repetidos guardamos una huella diaria
        (un código que no permite saber quién eres y que nunca se publica). Un reporte por colonia al día.{" "}
        <Link href="/privacidad" className="text-marca underline">Aviso de privacidad</Link>.
      </p>
    </form>
  );
}
