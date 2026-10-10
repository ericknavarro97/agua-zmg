import { describe, expect, it } from "vitest";
import { RAFAGA, limpiarComentario, veredictoRafaga } from "./moderation";

describe("limpiarComentario", () => {
  it("enmascara teléfonos, correos, enlaces y @usuarios", () => {
    const { texto, redactado } = limpiarComentario(
      "Llama al 33 1234 5678 o al (33) 3668-2482, escribe a juan.perez@correo.com, mira https://malo.example/x y www.otro.com.mx o @vecino_77",
    );
    expect(texto).not.toMatch(/\d{4}/);
    expect(texto).not.toContain("@correo");
    expect(texto).toContain("[teléfono]");
    expect(texto).toContain("[correo]");
    expect(texto).toContain("[enlace]");
    expect(texto).toContain("[usuario]");
    expect(redactado).toBe(true);
  });
  it("quita HTML y caracteres de control", () => {
    const { texto } = limpiarComentario("<script>alert(1)</script>Agua <b>turbia</b>\u0000 ‮ hoy");
    expect(texto).not.toMatch(/[<>]/);
    expect(texto).toContain("Agua turbia");
    expect(texto).not.toContain("‮");
  });
  it("no toca un comentario normal y lo deja nulo si queda vacío", () => {
    expect(limpiarComentario("Sale café por la mañana").redactado).toBe(false);
    expect(limpiarComentario("<br>").texto).toBeNull();
  });
  it("respeta los 500 caracteres", () => {
    expect(limpiarComentario("a ".repeat(400)).texto!.length).toBeLessThanOrEqual(500);
  });
});

type Fila = Parameters<typeof veredictoRafaga>[0][number];
const fila = (i: number, o: Partial<Fila> = {}): Fila => ({
  huella: `h${i}`, red_hash: `r${i}`, ua_familia: ["chrome-android", "safari-ios", "chrome-windows", "firefox-linux"][i % 4],
  tiempo_ms: 9000 + ((i * 7919) % 40000), comentario_hash: null, canal: "web", ep: 1000 + i * 60 + ((i * 37) % 50), ...o,
});

describe("veredictoRafaga", () => {
  it("una crisis real (30 vecinos distintos en una hora) hace pico pero NO es sospechosa", () => {
    const v = veredictoRafaga(Array.from({ length: 30 }, (_, i) => fila(i)), 0);
    expect(v.pico).toBe(true);
    expect(v.sospechosa).toBe(false);
  });
  it("una red que rota User-Agent, con formularios rápidos, es sospechosa", () => {
    const filas = Array.from({ length: 30 }, (_, i) => fila(i, { red_hash: i < 3 ? `r${i}` : "r0", tiempo_ms: 800 + (i % 5) * 100 }));
    const v = veredictoRafaga(filas, 0);
    expect(v.sospechosa).toBe(true);
    expect(v.senales).toEqual(expect.arrayContaining(["pocas_redes", "formulario_rapido"]));
  });
  it("copiar/pegar + sin tiempo de formulario desde muchas redes es sospechosa", () => {
    const filas = Array.from({ length: 20 }, (_, i) => fila(i, { tiempo_ms: null, comentario_hash: "mismo" }));
    const v = veredictoRafaga(filas, 0);
    expect(v.senales).toEqual(expect.arrayContaining(["sin_tiempo_formulario", "comentario_repetido"]));
    expect(v.sospechosa).toBe(true);
  });
  it("tráfico normal (3 reportes) no hace pico", () => {
    expect(veredictoRafaga(Array.from({ length: 3 }, (_, i) => fila(i)), 0.5).pico).toBe(false);
  });
  it("el umbral sube con la tasa típica de la colonia", () => {
    expect(veredictoRafaga([], 10).umbral).toBe(Math.ceil(10 + 4 * Math.sqrt(10)));
    expect(veredictoRafaga([], 0).umbral).toBe(RAFAGA.picoMinimo);
  });
  it("LÍMITE CONOCIDO: 30 redes, navegadores variados y tiempos humanos NO se detectan", () => {
    const v = veredictoRafaga(Array.from({ length: 30 }, (_, i) => fila(i)), 0);
    expect(v.sospechosa).toBe(false);
  });
});
