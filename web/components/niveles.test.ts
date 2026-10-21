import { describe, expect, it } from "vitest";
import { diasDesde, haceCuanto, haceCuantoCorto } from "./niveles";

// La API publica solo el día del último reporte (YYYY-MM-DD, hora de Guadalajara); «hoy» es el día local de Guadalajara
describe("haceCuanto con días", () => {
  // 2026-10-21 18:00 en Guadalajara (UTC-6) = 2026-10-22 00:00 UTC: en UTC ya es mañana, en Guadalajara sigue siendo hoy
  const ahora = new Date("2026-10-22T00:00:00Z");

  it("cuenta días en hora de Guadalajara, no en UTC", () => {
    expect(diasDesde("2026-10-21", ahora)).toBe(0);
    expect(diasDesde("2026-10-20", ahora)).toBe(1);
    expect(diasDesde("2026-10-11", ahora)).toBe(10);
  });

  it("dice hoy, ayer o hace N días; nunca horas", () => {
    expect(haceCuanto("2026-10-21", ahora)).toBe("hoy");
    expect(haceCuanto("2026-10-20", ahora)).toBe("ayer");
    expect(haceCuanto("2026-10-18", ahora)).toBe("hace 3 días");
    expect(haceCuantoCorto("2026-10-21", ahora)).toBe("hoy");
    expect(haceCuantoCorto("2026-10-18", ahora)).toBe("3 d");
  });

  it("sin dato o con dato inválido no inventa", () => {
    expect(haceCuanto(null, ahora)).toBe("sin reportes recientes");
    expect(haceCuantoCorto(undefined, ahora)).toBeNull();
    expect(haceCuanto("no-es-fecha", ahora)).toBe("");
  });
});
