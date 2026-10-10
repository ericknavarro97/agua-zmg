import { ImageResponse } from "next/og";
import { obtenerResumen } from "@/components/resumen-servidor";
import { GRAVEDADES } from "@/lib/severity";

export const alt = "Agua ZMG: mapa ciudadano de la calidad del agua en la Zona Metropolitana de Guadalajara";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Imagen que se ve al compartir el enlace. Muestra la gravedad agregada (cuántas colonias hay en cada nivel).
export default async function Image() {
  const r = await obtenerResumen();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c4a6e",
          color: "white",
          padding: "48px 64px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#bae6fd", letterSpacing: 1 }}>AGUA ZMG</div>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 800, lineHeight: 1.05, marginTop: 12 }}>
            ¿Cómo está el agua en tu colonia?
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#e0f2fe", marginTop: 14 }}>
            Mapa de lo que reportan los vecinos en la Zona Metropolitana de Guadalajara
          </div>
        </div>

        {r && r.conNivel > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 28, color: "#e0f2fe", marginBottom: 14 }}>
              {`${r.conNivel} ${r.conNivel === 1 ? "colonia con nivel publicado" : "colonias con nivel publicado"}, según reportes de vecinos`}
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {GRAVEDADES.map((g, i) => (
                <div
                  key={g.nivel}
                  style={{
                    display: "flex",
                    flex: 1,
                    flexDirection: "column",
                    background: "white",
                    color: "#0f172a",
                    borderRadius: 16,
                    padding: "14px 18px",
                    borderLeft: `18px solid ${g.color}`,
                  }}
                >
                  <div style={{ display: "flex", fontSize: 50, fontWeight: 800 }}>{String(r.porNivel[i])}</div>
                  <div style={{ display: "flex", fontSize: 24 }}>{`${g.nivel} · ${g.etiqueta}`}</div>
                  <div style={{ display: "flex", fontSize: 17, color: "#475569", marginTop: 4 }}>{g.detalle}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 34, color: "#e0f2fe" }}>
            Reporta cómo llega el agua a tu casa y avisa a tus vecinos.
          </div>
        )}

        <div style={{ display: "flex", fontSize: 24, color: "#bae6fd" }}>
          Información ciudadana, no oficial. No es consejo médico ni análisis de laboratorio.
        </div>
      </div>
    ),
    { ...size },
  );
}
