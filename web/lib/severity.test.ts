import { describe, expect, it } from "vitest";
import { AVISO_NIVELES, GRAVEDADES } from "./severity";

describe("textos de la escala de gravedad", () => {
  it("ningún nivel sugiere que el agua sirva para beber, cocinar o usarla", () => {
    for (const g of GRAVEDADES) {
      expect(g.detalle).not.toMatch(/la uso|cocina|aseo|apta/i);
    }
  });
  it("el nivel 4 no mezcla desabasto ni diagnóstico de daño a la salud con calidad", () => {
    const d = GRAVEDADES[4].detalle;
    expect(d).not.toMatch(/no hay agua|sin agua|da[ñn]o a la salud/i);
  });
  it("el índice de la escala es el nivel (0 limpia a 4 crítica)", () => {
    expect(GRAVEDADES.map((g) => g.nivel)).toEqual([0, 1, 2, 3, 4]);
    expect(GRAVEDADES[0].etiqueta).toBe("Limpia");
  });
  it("el aviso fijo aclara que ningún nivel es agua segura para beber", () => {
    expect(AVISO_NIVELES).toMatch(/Ningún nivel significa que el agua sea segura para beber/);
  });
});
