import { describe, expect, it } from "vitest";
import { AVISO_NIVELES, GRAVEDADES } from "./severity";

describe("textos de la escala de gravedad", () => {
  it("ningún nivel sugiere que el agua sirva para beber, cocinar o usarla", () => {
    for (const g of GRAVEDADES) {
      expect(g.detalle).not.toMatch(/la uso|cocina|aseo|apta/i);
    }
  });
  it("el nivel 4 no mezcla desabasto ni diagnóstico de daño a la salud con calidad", () => {
    const d = GRAVEDADES[3].detalle;
    expect(d).not.toMatch(/no hay agua|sin agua|da[ñn]o a la salud/i);
  });
  it("el aviso fijo aclara que ningún nivel es agua segura para beber", () => {
    expect(AVISO_NIVELES).toMatch(/Ningún nivel significa que el agua sea segura para beber/);
  });
});
