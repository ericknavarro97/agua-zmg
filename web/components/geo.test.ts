import { describe, expect, it } from "vitest";
import { buscarColonias, buscarColoniasConTotal, coloniaEnPunto, coloniasCercanas, construirIndice, normalizar, puntoEnGeometria } from "./geo";
import type { FeatureColonia } from "./tipos";

const cuadro = (w: number, s: number, e: number, n: number): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});

const f = (id: number, nombre: string, geometry: GeoJSON.Geometry): FeatureColonia => ({
  type: "Feature",
  id,
  properties: { id, nombre, municipio: "Guadalajara" },
  geometry,
});

describe("puntoEnGeometria", () => {
  it("detecta puntos dentro y fuera de un polígono", () => {
    const g = cuadro(0, 0, 2, 2);
    expect(puntoEnGeometria(1, 1, g)).toBe(true);
    expect(puntoEnGeometria(3, 1, g)).toBe(false);
  });

  it("respeta los huecos", () => {
    const g: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
      ],
    };
    expect(puntoEnGeometria(2, 2, g)).toBe(true);
    expect(puntoEnGeometria(5, 5, g)).toBe(false);
  });

  it("soporta MultiPolygon", () => {
    const g: GeoJSON.MultiPolygon = { type: "MultiPolygon", coordinates: [cuadro(0, 0, 1, 1).coordinates, cuadro(5, 5, 6, 6).coordinates] };
    expect(puntoEnGeometria(5.5, 5.5, g)).toBe(true);
    expect(puntoEnGeometria(3, 3, g)).toBe(false);
  });
});

describe("coloniaEnPunto", () => {
  it("con polígonos anidados elige el de menor área", () => {
    const grande = f(1, "Grande", cuadro(0, 0, 10, 10));
    const chica = f(2, "Chica", cuadro(4, 4, 6, 6));
    const features = [grande, chica];
    const indice = construirIndice(features);
    expect(coloniaEnPunto(5, 5, features, indice)?.properties.id).toBe(2);
    expect(coloniaEnPunto(1, 1, features, indice)?.properties.id).toBe(1);
    expect(coloniaEnPunto(20, 20, features, indice)).toBeNull();
  });

  it("sugiere colonias cercanas ordenadas por distancia", () => {
    const a = f(1, "A", cuadro(-103.40, 20.60, -103.39, 20.61));
    const b = f(2, "B", cuadro(-103.30, 20.60, -103.29, 20.61));
    const features = [b, a];
    const cercanas = coloniasCercanas(-103.395, 20.62, features, construirIndice(features), 3, 15);
    expect(cercanas.map((c) => c.f.properties.id)).toEqual([1, 2]);
  });
});

describe("búsqueda por nombre", () => {
  const features = [f(1, "Las Pintas", cuadro(0, 0, 1, 1)), f(2, "Pinto", cuadro(2, 2, 3, 3)), f(3, "San Pintas", cuadro(4, 4, 5, 5))];
  it("ignora acentos y mayúsculas; primero los que empiezan con el texto", () => {
    expect(normalizar("  TonalÁ ")).toBe("tonala");
    const r = buscarColonias(features, "PINT");
    expect(r.map((x) => x.properties.id)).toEqual([2, 1, 3]);
  });
  it("exige al menos 2 caracteres", () => {
    expect(buscarColonias(features, "p")).toEqual([]);
  });
  it("pone primero la coincidencia exacta y informa el total aunque se recorte", () => {
    const fs = [
      f(1, "Centro Barranquitas", cuadro(0, 0, 1, 1)),
      f(2, "Centro Sur", cuadro(2, 2, 3, 3)),
      f(3, "Centro", cuadro(4, 4, 5, 5)),
      f(4, "Zona Centro", cuadro(6, 6, 7, 7)),
    ];
    const r = buscarColoniasConTotal(fs, "centro", 2);
    expect(r.items.map((x) => x.properties.id)).toEqual([3, 1]);
    expect(r.total).toBe(4);
  });
});
