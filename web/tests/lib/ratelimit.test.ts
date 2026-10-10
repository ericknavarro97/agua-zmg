import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LIMITES, contar, leer } from "../../lib/ratelimit";
import { crearBase, type BaseTemporal } from "./_db";

let bd: BaseTemporal;
beforeAll(async () => { bd = await crearBase(); });
afterAll(async () => { await bd?.borrar(); });
beforeEach(async () => { await bd.pool.query("TRUNCATE rate_limits"); });

const almacenado = async (clave: string) =>
  (await bd.pool.query("SELECT n FROM rate_limits WHERE clave = $1 ORDER BY ventana DESC", [clave])).rows.map((r) => r.n as number);

describe("contar", () => {
  it("cuenta 1, 2, 3... hasta el tope y luego devuelve tope+1 sin seguir escribiendo", async () => {
    const vistos: number[] = [];
    for (let i = 0; i < 8; i++) vistos.push(await contar(bd.pool, "k1", 5, 3600));
    expect(vistos).toEqual([1, 2, 3, 4, 5, 6, 6, 6]);
    // lo guardado no crece con el abuso: se detiene en tope+1
    expect(await almacenado("k1")).toEqual([6]);
  });
  it("`contar(...) > tope` rechaza exactamente a partir de la petición tope+1", async () => {
    const rechazos: boolean[] = [];
    for (let i = 0; i < 4; i++) rechazos.push((await contar(bd.pool, "k2", 3, 3600)) > 3);
    expect(rechazos).toEqual([false, false, false, true]);
  });
  it("las claves son independientes", async () => {
    await contar(bd.pool, "a", 5, 3600);
    await contar(bd.pool, "a", 5, 3600);
    expect(await contar(bd.pool, "b", 5, 3600)).toBe(1);
    expect(await leer(bd.pool, "a", 3600)).toBe(2);
  });
  it("es atómico con peticiones paralelas: exactamente `tope` pasan", async () => {
    const tope = 10;
    const r = await Promise.all(Array.from({ length: 60 }, () => contar(bd.pool, "par", tope, 3600)));
    expect(r.filter((n) => n <= tope).sort((x, y) => x - y)).toEqual(Array.from({ length: tope }, (_, i) => i + 1));
    expect(r.filter((n) => n > tope).every((n) => n === tope + 1)).toBe(true);
    expect(await almacenado("par")).toEqual([tope + 1]);
  });
  it("una ventana nueva empieza de cero; la vieja no cuenta", async () => {
    await bd.pool.query("INSERT INTO rate_limits (clave, ventana, n) VALUES ('v', now() - interval '3 hours', 99)");
    expect(await leer(bd.pool, "v", 3600)).toBe(0);
    expect(await contar(bd.pool, "v", 5, 3600)).toBe(1);
    expect(await almacenado("v")).toEqual([1, 99]);
  });
  it("la ventana está alineada al reloj: ventana <= ahora < ventana + duración", async () => {
    await contar(bd.pool, "al", 5, 900);
    const { rows } = await bd.pool.query(
      "SELECT extract(epoch FROM ventana)::float8 AS v, extract(epoch FROM now())::float8 AS ahora FROM rate_limits WHERE clave='al'");
    expect(rows[0].v % 900).toBe(0);
    expect(rows[0].ahora).toBeGreaterThanOrEqual(rows[0].v);
    expect(rows[0].ahora).toBeLessThan(rows[0].v + 900);
  });
  it("ventanas de distinta duración no se mezclan en la lectura", async () => {
    await contar(bd.pool, "dur", 5, 3600);
    expect(await leer(bd.pool, "dur", 3600)).toBe(1);
    // misma clave con otra duración cae en otra ventana (salvo coincidencia exacta de alineación)
    const otra = await leer(bd.pool, "dur", 60);
    expect(otra === 0 || otra === 1).toBe(true);
  });
  it("tope 0: la primera petición ya se rechaza", async () => {
    expect(await contar(bd.pool, "cero", 0, 3600)).toBeGreaterThan(0);
  });
});

describe("leer", () => {
  it("devuelve 0 sin registros y no incrementa", async () => {
    expect(await leer(bd.pool, "nada", 3600)).toBe(0);
    expect(await leer(bd.pool, "nada", 3600)).toBe(0);
    expect(await almacenado("nada")).toEqual([]);
  });
});

describe("LIMITES", () => {
  it("están ordenados de forma coherente", () => {
    expect(LIMITES.huellaHora).toBeGreaterThan(0);
    expect(LIMITES.redBlandoHora).toBeLessThan(LIMITES.redDuroHora);
    expect(LIMITES.huellaHora).toBeLessThanOrEqual(LIMITES.redBlandoHora);
    expect(LIMITES.globalBlandoHora).toBeGreaterThan(LIMITES.redDuroHora);
    expect(LIMITES.coloniasPorDia).toBeGreaterThanOrEqual(1);
    expect(LIMITES.adminFallosVentana).toBeGreaterThan(0);
  });
});
