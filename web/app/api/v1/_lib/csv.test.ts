import { describe, expect, it } from "vitest";
import { aCsv, celda, COLUMNAS } from "./csv";
import type { FilaResumen } from "./datos";

const fila = (o: Partial<FilaResumen>): FilaResumen => ({
  id: 1, nombre: "Centro", municipio: "Guadalajara",
  score: 2.5, nivel: 3, confianza: "media", n: 7, n_huellas: 6, ultimo: "2026-10-08T10:00:00Z", ...o,
});

describe("celda", () => {
  it("deja vacío null y undefined", () => {
    expect(celda(null)).toBe("");
    expect(celda(undefined)).toBe("");
  });
  it("entrecomilla comas, comillas y saltos de línea", () => {
    expect(celda('Lomas, "norte"')).toBe('"Lomas, ""norte"""');
    expect(celda("a\nb")).toBe('"a\nb"');
  });
  it("neutraliza fórmulas", () => {
    expect(celda("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(celda("+52 33")).toBe("'+52 33");
    expect(celda("@x")).toBe("'@x");
  });
});

describe("aCsv", () => {
  it("escribe encabezado y una fila por colonia con CRLF", () => {
    const csv = aCsv([fila({}), fila({ id: 2, nombre: "Sin datos", score: null, nivel: null, confianza: null, n: null, n_huellas: null, ultimo: null })], "2026-10-08", "ODbL-1.0");
    const lineas = csv.split("\r\n");
    expect(lineas[0]).toBe(COLUMNAS.join(","));
    expect(lineas[1]).toBe("1,Centro,Guadalajara,2.5,3,media,7,6,2026-10-08T10:00:00Z,2026-10-08,ODbL-1.0");
    expect(lineas[2]).toBe("2,Sin datos,Guadalajara,,,,,,,2026-10-08,ODbL-1.0");
    expect(lineas[3]).toBe("");
  });
  it("no incluye columnas sensibles", () => {
    const prohibidas = ["huella", "comentario", "ip", "red_hash", "ua_familia"];
    for (const c of COLUMNAS) expect(prohibidas).not.toContain(c);
  });
});
