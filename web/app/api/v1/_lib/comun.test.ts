import { describe, expect, it, vi } from "vitest";
import { crearMemoria, leerMunicipio } from "./comun";

describe("leerMunicipio", () => {
  const u = (q: string) => new URL("http://x/api/v1/colonias" + q);
  it("undefined si no viene", () => {
    expect(leerMunicipio(u(""))).toBeUndefined();
    expect(leerMunicipio(u("?municipio="))).toBeUndefined();
  });
  it("reconoce variantes oficiales y null si no es de la ZMG", () => {
    expect(leerMunicipio(u("?municipio=Tonal%C3%A1"))).toBe("tonala");
    expect(leerMunicipio(u("?municipio=Tlaquepaque"))).toBe("san pedro tlaquepaque");
    expect(leerMunicipio(u("?municipio=Monterrey"))).toBeNull();
  });
});

describe("crearMemoria", () => {
  it("reutiliza el valor y calcula una sola vez ante peticiones simultáneas", async () => {
    const mem = crearMemoria(4);
    const calcular = vi.fn(async () => 42);
    const [a, b] = await Promise.all([mem("k", 1000, calcular), mem("k", 1000, calcular)]);
    expect([a, b]).toEqual([42, 42]);
    await mem("k", 1000, calcular);
    expect(calcular).toHaveBeenCalledTimes(1);
  });
  it("si recalcular falla, devuelve el valor anterior", async () => {
    const mem = crearMemoria(4);
    await mem("k", 0, async () => "bueno");
    await expect(mem("k", 0, async () => { throw new Error("db caída"); })).resolves.toBe("bueno");
  });
  it("sin valor previo, propaga el error", async () => {
    const mem = crearMemoria(4);
    await expect(mem("k", 0, async () => { throw new Error("db caída"); })).rejects.toThrow("db caída");
  });
  it("respeta la capacidad", async () => {
    const mem = crearMemoria(2);
    const f = vi.fn(async () => 1);
    await mem("a", 10_000, f); await mem("b", 10_000, f); await mem("c", 10_000, f);
    await mem("a", 10_000, f); // "a" fue expulsada: se recalcula
    expect(f).toHaveBeenCalledTimes(4);
  });
});
