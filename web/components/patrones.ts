// Tramas que se dibujan sobre el color de cada nivel en el mapa, para que la
// gravedad no dependa solo del color (daltonismo, pantallas con poco contraste, impresión).
// Deben verse igual que las muestras .sw-N de globals.css.

const T = 24; // tamaño del mosaico en píxeles del bitmap (se muestra a la mitad: pixelRatio 2)

export type Patron = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

function lienzo(): CanvasRenderingContext2D | null {
  const c = document.createElement("canvas");
  c.width = T;
  c.height = T;
  return c.getContext("2d", { willReadFrequently: true });
}

function diagonales(ctx: CanvasRenderingContext2D, paso: number, sentido: 1 | -1) {
  ctx.beginPath();
  for (let k = -T; k <= T * 2; k += paso) {
    if (sentido === 1) {
      ctx.moveTo(k, T);
      ctx.lineTo(k + T, 0);
    } else {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + T, T);
    }
  }
  ctx.stroke();
}

export function crearPatron(nivel: 0 | 1 | 2 | 3 | 4): Patron | null {
  const ctx = lienzo();
  if (!ctx) return null;
  ctx.clearRect(0, 0, T, T);
  if (nivel === 0) {
    // Líneas horizontales (Limpia)
    ctx.strokeStyle = "rgba(0,50,20,0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const y of [6, 18]) {
      ctx.moveTo(0, y);
      ctx.lineTo(T, y);
    }
    ctx.stroke();
  } else if (nivel === 1) {
    // Puntos
    ctx.fillStyle = "rgba(60,40,0,0.32)";
    for (const [x, y] of [[6, 6], [18, 18]]) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (nivel === 2) {
    // Rayas diagonales
    ctx.strokeStyle = "rgba(90,40,0,0.3)";
    ctx.lineWidth = 1.8;
    diagonales(ctx, 12, 1);
  } else if (nivel === 3) {
    // Rejilla cruzada
    ctx.strokeStyle = "rgba(80,0,0,0.3)";
    ctx.lineWidth = 1.5;
    diagonales(ctx, 12, 1);
    diagonales(ctx, 12, -1);
  } else {
    // Rejilla blanca densa sobre rojo oscuro
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.2;
    diagonales(ctx, 12, 1);
    diagonales(ctx, 12, -1);
  }
  const img = ctx.getImageData(0, 0, T, T);
  return { width: T, height: T, data: img.data };
}

export const NOMBRE_PATRON = (nivel: number) => `patron-${nivel}`;
