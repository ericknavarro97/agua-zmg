import { describe, expect, it } from "vitest";
import { F, NOMBRE_FUENTE } from "./fuentes";

describe("nombres accesibles de las fuentes", () => {
  it("cada URL citada tiene un nombre descriptivo y distinto", () => {
    const nombres = Object.values(F).map((u) => NOMBRE_FUENTE[u]);
    expect(nombres.every((n) => typeof n === "string" && n.length > 3)).toBe(true);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
