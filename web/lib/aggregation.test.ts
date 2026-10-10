import { describe, expect, it } from "vitest";
import { PARAMS, agregar, confianzaDe, priorGlobal, recortada, type Grupo, type ResumenColonia } from "./aggregation";

// Constructor de grupos: cada reporte honesto viene de una red distinta (n = 1 por grupo).
let seq = 0;
function rep(
  coloniaId: number,
  gravedad: 1 | 2 | 3 | 4,
  edadDias: number,
  o: { red?: string; redSem?: string; n?: number; nRapidos?: number } = {},
): Grupo {
  const red = o.red ?? `red-${seq++}`;
  const dia = `2026-10-${String(8 - Math.floor(edadDias)).padStart(2, "0")}`;
  return { coloniaId, dia, red, redSem: o.redSem ?? red, gravedad, n: o.n ?? 1, nRapidos: o.nRapidos ?? 0, edadDias };
}
const resumen = (gs: Grupo[]): Map<number, ResumenColonia> => {
  const m = new Map<number, ResumenColonia>();
  for (const g of gs) {
    const r = m.get(g.coloniaId) ?? { n: 0, nHuellas: 0, ultimoMs: Date.UTC(2026, 9, 8) };
    r.n += g.n;
    r.nHuellas += g.n; // en estos casos cada reporte es una huella
    m.set(g.coloniaId, r);
  }
  return m;
};
const uno = (gs: Grupo[]) => agregar(gs, resumen(gs))[0];

/** `k` vecinos honestos repartidos en `dias` días. */
const vecinos = (col: number, gravedad: 1 | 2 | 3 | 4, k: number, dias: number) =>
  Array.from({ length: k }, (_, i) => rep(col, gravedad, (i % dias) + 0.2));

describe("recortada", () => {
  it("ignora los extremos (20 % del peso por cola)", () => {
    // 8 reportes en 2 y 1 en 1 y 1 en 4: la media simple sería 2.1; recortada = 2
    const r = recortada([1, 8, 0, 1])!;
    expect(r.media).toBeCloseTo(2, 5);
    expect(r.mediana).toBe(2);
  });
  it("sin peso devuelve null", () => expect(recortada([0, 0, 0, 0])).toBeNull());
});

describe("agregar: publicación mínima", () => {
  it("2 reportes críticos no se publican", () => {
    expect(agregar(vecinos(1, 4, 2, 2), resumen(vecinos(1, 4, 2, 2)))).toHaveLength(0);
  });
  it("exige 3 huellas distintas aunque haya evidencia suficiente", () => {
    const gs = vecinos(1, 3, 4, 2);
    const r = new Map([[1, { n: 4, nHuellas: 2, ultimoMs: 0 }]]);
    expect(agregar(gs, r)).toHaveLength(0);
    r.set(1, { n: 4, nHuellas: 3, ultimoMs: 0 });
    expect(agregar(gs, r)).toHaveLength(1);
  });
  it("4 vecinos 'leve' se publican con confianza baja y color 1", () => {
    const s = uno(vecinos(1, 1, 4, 1));
    expect(s.nivel).toBe(1);
    expect(s.confianza).toBe("baja");
  });
});

describe("agregar: confianza", () => {
  it("12 vecinos 'grave' en 4 días y 12 redes: alta, color 3", () => {
    const s = uno(vecinos(1, 3, 12, 4));
    expect(s.nivel).toBe(3);
    expect(s.confianza).toBe("alta");
  });
  it("un solo día nunca pasa de baja (ráfaga de una tarde)", () => {
    expect(uno(vecinos(1, 3, 30, 1)).confianza).toBe("baja");
  });
  it("dos días y 8 reportes: media", () => {
    expect(uno(vecinos(1, 3, 8, 2)).confianza).toBe("media");
  });
  it("reportes fuera de la ventana no llegan al agregador (la consulta los excluye)", () => {
    // confianzaDe es pura sobre estadísticas; con nEff<6 es baja
    expect(confianzaDe({ nEff: 5, diasCorrob: 3, redesSem: 9, maxDia: 0.3, recortada: 3, mediana: 3 })).toBe("baja");
  });
});

describe("agregar: resistencia a brigadeo", () => {
  const honestos = vecinos(1, 1, 4, 2); // colonia tranquila
  it("30 reportes falsos de UNA red no mueven el color", () => {
    const antes = uno(honestos).score;
    const falsos = Array.from({ length: 30 }, () => rep(1, 4, 0.1, { red: "red-atacante", redSem: "sem-atacante" }));
    const gs = [...honestos, ...falsos.map((f) => ({ ...f }))];
    // se agrupan como lo hace la consulta SQL: un solo grupo con n = 30
    const agrupado = [...honestos, { ...falsos[0], n: 30 }];
    const despues = uno(agrupado).score;
    expect(gs.length).toBe(34);
    expect(despues - antes).toBeLessThan(0.5);
    expect(uno(agrupado).nivel).toBeLessThanOrEqual(2);
  });
  it("200 reportes de una red tampoco, y no suben la confianza", () => {
    const agrupado = [...honestos, rep(1, 4, 0.1, { red: "x", redSem: "x", n: 200 })];
    const s = uno(agrupado);
    expect(s.nivel).toBeLessThanOrEqual(2);
    expect(s.confianza).toBe("baja");
  });
  it("ataque lento: 1 falso por día desde la misma red semanal pesa como máximo kSem", () => {
    const lentos = Array.from({ length: 14 }, (_, i) => rep(1, 4, i + 0.1, { red: `d${i}`, redSem: "misma-semana" }));
    const s = uno([...honestos, ...lentos]);
    // 14 falsos pero la red semanal aporta como máximo 3 de evidencia
    expect(s.nEff).toBeLessThanOrEqual(honestos.length + PARAMS.kSem + 1e-9);
  });
  it("LÍMITE CONOCIDO: 30 falsos desde 30 redes distintas SÍ mueven el color (indistinguibles de vecinos)", () => {
    const falsos = Array.from({ length: 30 }, () => rep(1, 4, 0.1));
    const s = uno([...honestos, ...falsos]);
    expect(s.nivel).toBeGreaterThanOrEqual(3);
    // pero un pico de un solo día concentra > 60 % de la evidencia: se pinta con trama (confianza baja)
    expect(s.confianza).toBe("baja");
    expect(s.maxDia).toBeGreaterThan(PARAMS.confianza.maxDia);
  });
  it("formularios rapidos pesan menos", () => {
    const lentos = uno(vecinos(1, 3, 6, 2)).nEff;
    const rapidos = uno(vecinos(1, 3, 6, 2).map((g) => ({ ...g, nRapidos: 1 }))).nEff;
    expect(rapidos).toBeCloseTo(lentos * PARAMS.fRapido, 5);
  });
});

describe("prior", () => {
  it("el prior queda acotado aunque todas las colonias sean graves", () => {
    const ps = Array.from({ length: 5 }, (_, i) => ({ coloniaId: i, recortada: 4, mediana: 4, nEff: 20, diasCorrob: 4, redesSem: 20, maxDia: 0.2 }));
    expect(priorGlobal(ps)).toBe(PARAMS.priorMax);
  });
});

describe("decaimiento", () => {
  it("un reporte de hace 7 días pesa la mitad", () => {
    const viejo = [rep(1, 4, 7), rep(1, 4, 7), rep(1, 4, 7), rep(1, 1, 0.01), rep(1, 1, 0.01), rep(1, 1, 0.01)];
    const s = uno(viejo);
    // los graves pesan 0.5 cada uno y los leves ~1: la media recortada se inclina a leve
    expect(s.recortada).toBeLessThan(2.5);
  });
});
