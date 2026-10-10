import { describe, expect, it, vi } from "vitest";

// datos.ts importa el pool de pg; en esta prueba solo se usa la función pura `filtrar`
vi.mock("../../../../lib/db", () => ({ pool: {} }));
vi.mock("../../../../lib/aggregation", () => ({ paraContrato: () => ({}), scoresConCache: async () => [] }));

import { filtrar } from "./datos";

const items = [
  { norm: "guadalajara", conDatos: true, id: 1 },
  { norm: "san pedro tlaquepaque", conDatos: false, id: 2 },
  { norm: "tonala", conDatos: true, id: 3 },
];

describe("filtrar", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrar(items, { soloConDatos: false })).toHaveLength(3);
  });
  it("filtra por municipio normalizado (coincidencia exacta)", () => {
    expect(filtrar(items, { municipioNorm: "san pedro tlaquepaque", soloConDatos: false }).map((i) => i.id)).toEqual([2]);
    expect(filtrar(items, { municipioNorm: "tonala", soloConDatos: false }).map((i) => i.id)).toEqual([3]);
    expect(filtrar(items, { municipioNorm: "tlaquepaque", soloConDatos: false })).toEqual([]);
  });
  it("solo con datos", () => {
    expect(filtrar(items, { soloConDatos: true }).map((i) => i.id)).toEqual([1, 3]);
  });
  it("combina filtros", () => {
    expect(filtrar(items, { municipioNorm: "san pedro tlaquepaque", soloConDatos: true })).toEqual([]);
  });
});
