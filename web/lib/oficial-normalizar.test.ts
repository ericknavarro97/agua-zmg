import { describe, expect, it } from "vitest";
import {
  IndiceColonias, claveMunicipio, municipioCanonico, normalizarTexto, nucleo, similitud,
} from "./oficial-normalizar";

describe("normalizarTexto", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizarTexto("  Álamo  Industrial, Norte. ")).toBe("alamo industrial norte");
    expect(normalizarTexto("BLANCO Y CUÉLLAR")).toBe("blanco y cuellar");
    expect(normalizarTexto(null)).toBe("");
  });
});

describe("municipios", () => {
  it("unifica variantes", () => {
    expect(municipioCanonico("Tlaquepaque")).toBe("San Pedro Tlaquepaque");
    expect(municipioCanonico("TLAJOMULCO DE ZUÑIGA")).toBe("Tlajomulco de Zúñiga");
    expect(municipioCanonico("Tonala")).toBe("Tonalá");
    expect(municipioCanonico("Acatic")).toBeNull();
    expect(claveMunicipio("Tonalá")).toBe(claveMunicipio("TONALA"));
  });
});

describe("nucleo", () => {
  it("ignora prefijos, artículos, abreviaturas y ordinales", () => {
    expect(nucleo("Colonia Las Águilas")).toBe("aguilas");
    expect(nucleo("Fracc. Sta. María")).toBe("santa maria");
    expect(nucleo("Balcones de Oblatos Primera Sección")).toBe(nucleo("Balcones de Oblatos 1a Seccion"));
  });
});

describe("similitud", () => {
  it("1 para iguales, bajo para distintos", () => {
    expect(similitud("lomas", "lomas")).toBe(1);
    expect(similitud("lomas del sur", "rancho nuevo")).toBeLessThan(0.2);
    expect(similitud("arcos de zapopan", "arcos zapopan")).toBeGreaterThan(0.5);
  });
});

describe("IndiceColonias", () => {
  const idx = new IndiceColonias([
    { id: 1, nombre: "Americana", municipio: "Guadalajara" },
    { id: 2, nombre: "Balcones de Oblatos Primera Seccion", municipio: "Guadalajara" },
    { id: 3, nombre: "Balcones de Oblatos Segunda Seccion", municipio: "Guadalajara" },
    { id: 4, nombre: "San Juan", municipio: "San Pedro Tlaquepaque" },
    { id: 5, nombre: "San Juan", municipio: "San Pedro Tlaquepaque" },
    { id: 6, nombre: "Alamo Industrial Norte", municipio: "Guadalajara" },
    { id: 7, nombre: "Alamo Industrial Sur", municipio: "Guadalajara" },
    { id: 8, nombre: "Lomas del Gallo", municipio: "Zapopan" },
  ]);

  it("alta: igual salvo acentos/mayúsculas", () => {
    const r = idx.vincular("AMERICANA", "Guadalajara");
    expect(r).toMatchObject({ ok: true, id: 1, confianza: "alta" });
  });
  it("no vincula homónimos en el mismo municipio", () => {
    expect(idx.vincular("San Juan", "Tlaquepaque")).toMatchObject({ ok: false, motivo: "homonimos_en_municipio" });
  });
  it("no cruza municipios", () => {
    expect(idx.vincular("Lomas del Gallo", "Guadalajara").ok).toBe(false);
    expect(idx.vincular("Lomas del Gallo", "Zapopan")).toMatchObject({ ok: true, id: 8 });
  });
  it("no confunde secciones ni puntos cardinales", () => {
    expect(idx.vincular("Balcones de Oblatos Segunda Sección", "Guadalajara")).toMatchObject({ ok: true, id: 3 });
    expect(idx.vincular("Álamo Industrial Sur", "Guadalajara")).toMatchObject({ ok: true, id: 7 });
    const r = idx.vincular("Alamo Industrial Poniente", "Guadalajara");
    expect(r.ok).toBe(false);
  });
  it("media por núcleo (ordinal abreviado)", () => {
    expect(idx.vincular("Balcones de Oblatos 1a Sección", "Guadalajara")).toMatchObject({ ok: true, id: 2, confianza: "media" });
  });
  it("fuzzy: singular/plural solo es 'baja'; romanos distintos no se vinculan", () => {
    const i2 = new IndiceColonias([
      { id: 10, nombre: "Haciendas del Valle", municipio: "Zapopan" },
      { id: 11, nombre: "Valdepeñas II", municipio: "Zapopan" },
      { id: 12, nombre: "Fovissste Estadio", municipio: "Guadalajara" },
    ]);
    expect(i2.vincular("Hacienda del Valle", "Zapopan")).toMatchObject({ ok: true, id: 10, confianza: "baja" });
    expect(i2.vincular("Valdepeñas", "Zapopan").ok).toBe(false);
    expect(i2.vincular("Fovisste Estadio", "Guadalajara")).toMatchObject({ ok: true, id: 12, confianza: "media" });
  });
  it("'El' y 'Del' no son equivalentes (El Fresno != Del Fresno; Del Carmen != El Carmen)", () => {
    const i = new IndiceColonias([
      { id: 20, nombre: "Del Fresno", municipio: "Guadalajara" },
      { id: 21, nombre: "El Carmen", municipio: "Guadalajara" },
      { id: 22, nombre: "Las Aguilas", municipio: "Guadalajara" },
    ]);
    expect(i.vincular("El Fresno", "Guadalajara").ok).toBe(false);
    expect(i.vincular("Fresno", "Guadalajara").ok).toBe(false);
    expect(i.vincular("Del Carmen", "Guadalajara").ok).toBe(false);
    // con los mismos artículos sí (prefijo genérico aparte)
    expect(i.vincular("Colonia Del Fresno", "Guadalajara")).toMatchObject({ ok: true, id: 20, confianza: "media" });
    expect(i.vincular("Colonia Las Águilas", "Guadalajara")).toMatchObject({ ok: true, id: 22 });
  });
  it("no vincula por parecido cuando sobra o falta una palabra, cambia el orden o el número en palabra", () => {
    const i = new IndiceColonias([
      { id: 30, nombre: "Jardines del Sur", municipio: "Guadalajara" },
      { id: 31, nombre: "Alamo Industrial", municipio: "San Pedro Tlaquepaque" },
      { id: 32, nombre: "Zona Industrial", municipio: "Guadalajara" },
      { id: 33, nombre: "Lomas de Zapopan", municipio: "Zapopan" },
      { id: 34, nombre: "Centro Barranquitas", municipio: "Guadalajara" },
      { id: 35, nombre: "Lomas Dos", municipio: "Zapopan" },
    ]);
    expect(i.vincular("Jardines del Nilo Sur", "Guadalajara").ok).toBe(false);
    expect(i.vincular("Industrial", "Tlaquepaque").ok).toBe(false);
    expect(i.vincular("Zona de Industrias Uno", "Guadalajara").ok).toBe(false);
    expect(i.vincular("Zona de Industrias Dos", "Guadalajara").ok).toBe(false);
    expect(i.vincular("Lomas del Country Zapopan", "Zapopan").ok).toBe(false);
    expect(i.vincular("Barranquitas Centro", "Guadalajara").ok).toBe(false);
    expect(i.vincular("Lomas", "Zapopan").ok).toBe(false);
  });
  it("los números en palabra cuentan como distintivos", () => {
    expect(nucleo("Lomas Dos")).toBe("lomas 2");
    expect(nucleo("Lomas II")).not.toBe(nucleo("Lomas Uno"));
  });
  it("municipio desconocido o vacío no vincula", () => {
    expect(idx.vincular("Americana", "Acatic")).toMatchObject({ ok: false });
    expect(idx.vincular("Americana", null)).toMatchObject({ ok: false });
  });
});
