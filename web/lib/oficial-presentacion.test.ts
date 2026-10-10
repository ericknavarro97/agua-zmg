import { describe, expect, it } from "vitest";
import { AVISO_CIUDADANA, advertencias, esIndicio, etiquetaValor } from "./oficial-presentacion";

describe("presentación de datos externos", () => {
  const plomo = {
    tipo: "ciudadana",
    parametro: "plomo",
    valor: 20,
    notas: "Tira reactiva semicuantitativa. Tratar como indicio a confirmar en laboratorio, no como medicion certificada.",
  };

  it("una prueba ciudadana (plomo 20 mg/L) es un indicio sin confirmar, no un valor firme", () => {
    expect(esIndicio(plomo)).toBe(true);
    expect(etiquetaValor(plomo)).toBe("Indicio sin confirmar");
  });
  it("lleva el aviso fijo de tira reactiva y las notas de la fuente", () => {
    const a = advertencias(plomo);
    expect(a[0]).toBe(AVISO_CIUDADANA);
    expect(a[0]).toMatch(/no sustituye un análisis de laboratorio/);
    expect(a[1]).toMatch(/indicio a confirmar/);
  });
  it("un dato oficial sin advertencias conserva \"Valor reportado\" y no muestra avisos", () => {
    const d = { tipo: "oficial", parametro: "turbiedad", valor: 12, notas: null };
    expect(esIndicio(d)).toBe(false);
    expect(etiquetaValor(d)).toBe("Valor reportado");
    expect(advertencias(d)).toEqual([]);
  });
  it("una nota de tira reactiva en una fuente no ciudadana también marca el indicio", () => {
    expect(esIndicio({ tipo: "periodistica", parametro: "plomo", valor: 5, notas: "medido con tira reactiva" })).toBe(true);
  });
  it("las filas ciudadanas sin valor (mercurio, nitritos...) también llevan el aviso", () => {
    expect(advertencias({ tipo: "ciudadana", parametro: "mercurio", valor: null, notas: null })).toEqual([AVISO_CIUDADANA]);
  });
  it("un valor con unidad o fecha SIN VERIFICAR (turbiedad 40 UNT) se trata como indicio", () => {
    const d = { tipo: "academica", parametro: "turbiedad", valor: 40, notas: "unidad asumida UNT/NTU (SIN VERIFICAR)" };
    expect(esIndicio(d)).toBe(true);
    expect(etiquetaValor(d)).toBe("Indicio sin confirmar");
  });
});
