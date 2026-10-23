import { describe, expect, it } from "vitest";
import { PARAMS } from "../../lib/aggregation";
import {
  GRAVEDADES, SIN_DATOS_COLOR, SINTOMAS, VIDA_MEDIA_DIAS, colorParaScore,
} from "../../lib/severity";

describe("GRAVEDADES", () => {
  it("son cinco niveles consecutivos 0-4 con etiqueta, detalle y color propios", () => {
    expect(GRAVEDADES.map((g) => g.nivel)).toEqual([0, 1, 2, 3, 4]);
    for (const g of GRAVEDADES) {
      expect(g.etiqueta.length).toBeGreaterThan(0);
      expect(g.detalle.length).toBeGreaterThan(0);
      expect(g.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(GRAVEDADES.map((g) => g.color)).size).toBe(5);
    expect(new Set(GRAVEDADES.map((g) => g.etiqueta)).size).toBe(5);
  });
  it("el color de 'sin datos' no se confunde con ninguna gravedad", () => {
    expect(GRAVEDADES.map((g) => g.color)).not.toContain(SIN_DATOS_COLOR);
  });
});

describe("SINTOMAS", () => {
  it("no hay síntomas repetidos ni vacíos", () => {
    expect(new Set(SINTOMAS).size).toBe(SINTOMAS.length);
    for (const s of SINTOMAS) expect(s.trim()).toBe(s);
    expect(SINTOMAS.every((s) => s.length > 0)).toBe(true);
  });
});

describe("colorParaScore", () => {
  it("null/undefined -> color de sin datos", () => {
    expect(colorParaScore(null)).toBe(SIN_DATOS_COLOR);
    expect(colorParaScore(undefined)).toBe(SIN_DATOS_COLOR);
  });
  it("redondea al nivel más cercano (el índice es el nivel)", () => {
    expect(colorParaScore(0)).toBe(GRAVEDADES[0].color);
    expect(colorParaScore(0.49)).toBe(GRAVEDADES[0].color);
    expect(colorParaScore(1)).toBe(GRAVEDADES[1].color);
    expect(colorParaScore(1.49)).toBe(GRAVEDADES[1].color);
    expect(colorParaScore(1.5)).toBe(GRAVEDADES[2].color);
    expect(colorParaScore(2.4)).toBe(GRAVEDADES[2].color);
    expect(colorParaScore(3.49)).toBe(GRAVEDADES[3].color);
    expect(colorParaScore(4)).toBe(GRAVEDADES[4].color);
  });
  it("acota valores fuera de 0-4 en lugar de fallar", () => {
    expect(colorParaScore(-10)).toBe(GRAVEDADES[0].color);
    expect(colorParaScore(17)).toBe(GRAVEDADES[4].color);
    expect(colorParaScore(Infinity)).toBe(GRAVEDADES[4].color);
  });
  it("NaN se trata como sin datos (no lanza)", () => {
    expect(colorParaScore(NaN)).toBe(SIN_DATOS_COLOR);
  });
  it("es monótona: un score mayor nunca da un nivel menor", () => {
    const idx = (s: number) => GRAVEDADES.findIndex((g) => g.color === colorParaScore(s));
    let previo = -1;
    for (let s = -0.5; s <= 4.5; s += 0.05) {
      const i = idx(s);
      expect(i).toBeGreaterThanOrEqual(previo);
      previo = i;
    }
  });
});

describe("vida media", () => {
  it("la agregación usa la misma vida media y ya no tiene ventana (v5)", () => {
    expect(PARAMS.vidaMediaDias).toBe(VIDA_MEDIA_DIAS);
    expect(PARAMS).not.toHaveProperty("ventanaDias");
  });
});
