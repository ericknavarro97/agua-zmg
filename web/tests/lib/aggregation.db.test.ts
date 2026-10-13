/** Carga de reportes desde Postgres: qué cuenta y qué no (base desechable propia). */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PARAMS, calcularScores, cargarGrupos, cargarResumen, invalidarCacheScores, refrescarScoresPronto, scoresConCache,
} from "../../lib/aggregation";
import { crearBase, insertarColonia, insertarReporte, type BaseTemporal } from "./_db";

let bd: BaseTemporal;
beforeAll(async () => { bd = await crearBase(); });
afterAll(async () => { await bd?.borrar(); });
beforeEach(async () => {
  await bd.pool.query("TRUNCATE reportes, rate_limits RESTART IDENTITY CASCADE");
  await bd.pool.query("DELETE FROM colonias");
  invalidarCacheScores();
});

/** `k` vecinos distintos (huella y red propias) en `col`. */
async function vecinos(col: number, k: number, o: { gravedad?: number; hace_horas?: number; estado?: string; sospechoso?: boolean } = {}) {
  for (let i = 0; i < k; i++) {
    await insertarReporte(bd.pool, {
      colonia_id: col, gravedad: o.gravedad ?? 3, huella: `h-${col}-${i}-${Math.random()}`,
      red_hash: `r-${col}-${i}-${Math.random()}`, red_sem: `s-${col}-${i}-${Math.random()}`,
      hace_horas: (o.hace_horas ?? 1) + i * 20, estado: o.estado, sospechoso: o.sospechoso,
    });
  }
}

describe("qué reportes cuentan", () => {
  it("visibles y no sospechosos de la ventana se publican", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 6);
    const s = await calcularScores(bd.pool);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: c, n: 6, nHuellas: 6, nivel: 3 });
    expect(s[0].score).toBeGreaterThanOrEqual(1);
    expect(s[0].score).toBeLessThanOrEqual(4);
  });
  it("estado revision u oculto, y sospechosos, NO cuentan", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 5, { estado: "revision" });
    await vecinos(c, 5, { estado: "oculto" });
    await vecinos(c, 5, { sospechoso: true });
    expect(await calcularScores(bd.pool)).toEqual([]);
    const r = await cargarResumen(bd.pool);
    expect(r.size).toBe(0);
    expect(await cargarGrupos(bd.pool)).toEqual([]);
  });
  it("fuera de la ventana de 14 días no cuentan; dentro sí", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 4, { hace_horas: PARAMS.ventanaDias * 24 + 5 });
    expect(await calcularScores(bd.pool)).toEqual([]);
    await vecinos(c, 4, { hace_horas: 24 * 5 });
    expect((await calcularScores(bd.pool))[0].n).toBe(4);
  });
  it("pocas huellas distintas: se publica igual, con las huellas contadas bien", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    for (let i = 0; i < 6; i++) {
      await insertarReporte(bd.pool, { colonia_id: c, huella: i < 3 ? `a` : `b`, red_hash: `r${i}`, red_sem: `s${i}`, hace_horas: i * 30 });
    }
    // misma huella, el índice único (colonia, huella, dia) permite una por día: la fila 0..2 comparten huella
    const r = await cargarResumen(bd.pool);
    expect(r.get(c)!.nHuellas).toBe(2);
    const s = await calcularScores(bd.pool);
    expect(s).toHaveLength(1);
    expect(s[0].nHuellas).toBe(2);
  });
  it("filas sin huella (anonimizadas) cuentan como una huella cada una", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    for (let i = 0; i < 4; i++) await insertarReporte(bd.pool, { colonia_id: c, huella: null, hace_horas: i * 30 });
    const r = await cargarResumen(bd.pool);
    expect(r.get(c)!.nHuellas).toBe(4);
    expect(r.get(c)!.n).toBe(4);
    expect(await calcularScores(bd.pool)).toHaveLength(1);
  });
  it("el día se calcula en hora de Guadalajara, no en UTC", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    // 04:00 UTC del 8-oct = 22:00 del 7-oct en Guadalajara
    const ahora = new Date("2026-10-08T12:00:00Z");
    await bd.pool.query(
      `INSERT INTO reportes (colonia_id, gravedad, huella, red_hash, red_sem, creado_en)
       VALUES ($1, 3, 'x', 'rx', 'sx', '2026-10-08T04:00:00Z')`, [c]);
    const grupos = await cargarGrupos(bd.pool, ahora);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].dia).toBe("2026-10-07");
    expect(grupos[0].edadDias).toBeCloseTo(8 / 24, 3);
  });
  it("las filas sin red cuentan como redes propias (no se penalizan entre sí)", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    for (let i = 0; i < 5; i++) await insertarReporte(bd.pool, { colonia_id: c, huella: `d-${i}`, hace_horas: 1 });
    const grupos = await cargarGrupos(bd.pool);
    expect(new Set(grupos.map((g) => g.red)).size).toBe(5);
  });
  it("reportes rápidos se cuentan por tiempo_ms < rapidoMs", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    // Unos segundos en el pasado: con hace_horas 0 el reloj de Postgres (microsegundos) puede quedar por delante del de
    // Node (milisegundos) y la consulta (creado_en <= ahora) dejaría fuera el último reporte, sobre todo en CI rápido.
    const base = { colonia_id: c, red_hash: "r", red_sem: "s", hace_horas: 0.01 };
    await insertarReporte(bd.pool, { ...base, huella: "a", tiempo_ms: PARAMS.rapidoMs - 1 });
    await insertarReporte(bd.pool, { ...base, huella: "b", tiempo_ms: PARAMS.rapidoMs });
    await insertarReporte(bd.pool, { ...base, huella: "c", tiempo_ms: null });
    const [g] = await cargarGrupos(bd.pool);
    expect(g.n).toBe(3);
    expect(g.nRapidos).toBe(1);
  });
  it("una red que manda muchos reportes pesa poco frente a vecinos distintos", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 8, { gravedad: 2 });
    for (let i = 0; i < 40; i++) {
      await insertarReporte(bd.pool, { colonia_id: c, gravedad: 4, huella: `atk-${i}`, red_hash: "una-red", red_sem: "una-red-sem", hace_horas: 1 });
    }
    const [s] = await calcularScores(bd.pool);
    expect(s.n).toBe(48);
    expect(s.nivel).toBe(2);
  });
});

describe("caché de scores", () => {
  it("sirve el mismo resultado durante el TTL y se recalcula al invalidar", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 3, { gravedad: 2 });
    const a = await scoresConCache(bd.pool, 60_000);
    expect(a).toHaveLength(1);
    await vecinos(await insertarColonia(bd.pool, "Otra", "Zapopan", -103.1, 20.7), 4);
    expect(await scoresConCache(bd.pool, 60_000)).toBe(a); // misma promesa/resultado en caché
    invalidarCacheScores();
    expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(2);
  });
  it("una sola consulta en vuelo para llamadas simultáneas", async () => {
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 3);
    const [a, b] = await Promise.all([scoresConCache(bd.pool, 60_000), scoresConCache(bd.pool, 60_000)]);
    expect(a).toBe(b);
  });
  it("un fallo no se queda en caché", async () => {
    const roto = { query: async () => { throw new Error("bd caída"); } } as unknown as typeof bd.pool;
    await expect(scoresConCache(roto, 60_000)).rejects.toThrow(/bd caída/);
    const c = await insertarColonia(bd.pool, "Lomas");
    await vecinos(c, 3);
    expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(1);
  });
  describe("stale-while-revalidate (un reporte aceptado no obliga a recalcular en cada visita)", () => {
    afterEach(() => vi.useRealTimers());
    const hay = async (pool: typeof bd.pool) => {
      let n = 0;
      const espia = { query: (...a: Parameters<typeof bd.pool.query>) => { n++; return (pool.query as (...x: unknown[]) => unknown)(...a); } } as unknown as typeof bd.pool;
      return { espia, consultas: () => n };
    };

    it("marcada sucia, antes de 10 s sigue sirviendo lo mismo; después sirve lo viejo al instante y recalcula en segundo plano", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const c = await insertarColonia(bd.pool, "Lomas");
      await vecinos(c, 3, { gravedad: 2 });
      const a = await scoresConCache(bd.pool, 60_000);
      expect(a).toHaveLength(1);
      await vecinos(await insertarColonia(bd.pool, "Otra", "Zapopan", -103.1, 20.7), 4);

      refrescarScoresPronto();
      vi.setSystemTime(Date.now() + 5_000);
      expect(await scoresConCache(bd.pool, 60_000)).toBe(a); // aún no toca

      vi.setSystemTime(Date.now() + 6_000); // 11 s desde el cálculo
      const durante = await scoresConCache(bd.pool, 60_000);
      expect(durante).toBe(a); // no espera: devuelve lo viejo
      await vi.waitFor(async () => expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(2));
    });

    it("sin reportes nuevos (no sucia) y dentro del TTL no recalcula nunca, y varias visitas lanzan UNA sola consulta de refresco", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const c = await insertarColonia(bd.pool, "Lomas");
      await vecinos(c, 3);
      const { espia, consultas } = await hay(bd.pool);
      await scoresConCache(espia, 60_000);
      const base = consultas();
      vi.setSystemTime(Date.now() + 20_000);
      for (let i = 0; i < 20; i++) await scoresConCache(espia, 60_000);
      expect(consultas()).toBe(base);

      refrescarScoresPronto();
      vi.setSystemTime(Date.now() + 20_000);
      await Promise.all(Array.from({ length: 20 }, () => scoresConCache(espia, 60_000)));
      await vi.waitFor(() => expect(consultas()).toBe(base * 2));
    });

    it("invalidar (moderación) descarta lo viejo: la siguiente visita espera datos nuevos", async () => {
      const c = await insertarColonia(bd.pool, "Lomas");
      await vecinos(c, 3);
      expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(1);
      await bd.pool.query("UPDATE reportes SET estado = 'oculto'");
      invalidarCacheScores();
      expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(0);
    });

    it("pasados 5 min el valor viejo ya no se sirve", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const c = await insertarColonia(bd.pool, "Lomas");
      await vecinos(c, 3);
      await scoresConCache(bd.pool, 60_000);
      await bd.pool.query("UPDATE reportes SET estado = 'oculto'");
      vi.setSystemTime(Date.now() + 6 * 60_000);
      expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(0);
    });
  });
});
