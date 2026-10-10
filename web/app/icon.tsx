import { ImageResponse } from "next/og";

// Íconos de la app (pestaña del navegador y manifest PWA): una gota sobre azul.
export function generateImageMetadata() {
  return [
    { id: "32", contentType: "image/png", size: { width: 32, height: 32 } },
    { id: "192", contentType: "image/png", size: { width: 192, height: 192 } },
    { id: "512", contentType: "image/png", size: { width: 512, height: 512 } },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const lado = Number(await id) || 32;
  const gota = Math.round(lado * 0.62);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c4a6e",
          borderRadius: Math.round(lado * 0.2),
        }}
      >
        <svg width={gota} height={gota} viewBox="0 0 24 24">
          <path d="M12 2.5c-3.2 4.2-6 7.6-6 11a6 6 0 0 0 12 0c0-3.4-2.8-6.8-6-11Z" fill="#7dd3fc" />
        </svg>
      </div>
    ),
    { width: lado, height: lado },
  );
}
