/**
 * Moderación: saneamiento de comentarios, veredicto de ráfagas (puro) y función SQL moderar() con su
 * bitácora de solo agregado (base desechable propia).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { calcularScores, invalidarCacheScores, scoresConCache } from "../../lib/aggregation";
import {
  RAFAGA, aplicarRafaga, bitacora, colaRevision, evaluarRafaga, limpiarComentario, moderar, rafagaEnCurso,
  reportesDeColonia, reportesOfensores, reportesRecientes, resumenModeracion, veredictoRafaga,
} from "../../lib/moderation";
import { crearBase, insertarColonia, insertarReporte, type BaseTemporal } from "./_db";

describe("limpiarComentario (casos adicionales)", () => {
  it("enmascara números de teléfono con distintos formatos", () => {
    for (const t of ["3312345678", "33-1234-5678", "(33) 1234 5678", "+52 33 1234 5678", "33.1234.5678"]) {
      const { texto, redactado } = limpiarComentario(`llámame al ${t} gracias`);
      expect(texto, t).toBe("llámame al [teléfono] gracias");
      expect(redactado).toBe(true);
    }
  });
  it("no enmascara cifras cortas de calidad del agua", () => {
    const { texto, redactado } = limpiarComentario("Turbiedad de 40 NTU, norma 3 NTU, 2 días sin agua, calle 5 de mayo 123");
    expect(texto).toBe("Turbiedad de 40 NTU, norma 3 NTU, 2 días sin agua, calle 5 de mayo 123");
    expect(redactado).toBe(false);
  });
  it("enmascara correos, enlaces con y sin esquema y @usuarios, sin dejar rastro", () => {
    const { texto } = limpiarComentario("mira http://a.b/c?x=1 y bit.ly/xyz o foo.com/ruta o a@b.mx @juanito");
    expect(texto).not.toMatch(/http|bit\.ly|foo\.com|a@b|juanito/);
  });
  it("quita HTML, scripts, controles y caracteres bidireccionales de ocultamiento", () => {
    const { texto } = limpiarComentario("<img src=x onerror=alert(1)>Agua‮txet​\u0007 sucia<<>>");
    expect(texto).not.toMatch(/[<>‮​\u0007]/);
    expect(texto).toContain("Agua");
  });
  it("solo espacios o vacío -> texto nulo y no 'redactado'", () => {
    expect(limpiarComentario("")).toEqual({ texto: null, redactado: false });
    expect(limpiarComentario("   \n\t ")).toEqual({ texto: null, redactado: false });
  });
  it("normaliza a NFC y colapsa espacios; recorta a 500", () => {
    expect(limpiarComentario("Zapópan   huele   mal").texto).toBe("Zapópan huele mal");
    expect(limpiarComentario("x".repeat(2000)).texto).toHaveLength(500);
  });
  it("conserva acentos, ñ y signos de español", () => {
    expect(limpiarComentario("¡Está turbia! ¿Quién responde? Año nuevo.").texto).toBe("¡Está turbia! ¿Quién responde? Año nuevo.");
  });
  it("es idempotente: limpiar dos veces no cambia el resultado", () => {
    const una = limpiarComentario("Llama al 33 1234 5678 <b>ya</b> a@b.com").texto!;
    expect(limpiarComentario(una).texto).toBe(una);
  });
});

describe("veredictoRafaga (casos adicionales)", () => {
  type Fila = Parameters<typeof veredictoRafaga>[0][number];
  const fila = (i: number, o: Partial<Fila> = {}): Fila => ({
    huella: `h${i}`, red_hash: `r${i}`, ua_familia: ["chrome-android", "safari-ios", "chrome-windows", "firefox-linux"][i % 4],
    tiempo_ms: 9000 + ((i * 7919) % 40000), comentario_hash: null, canal: "web", ep: 1000 + i * 60 + ((i * 37) % 50), ...o,
  });
  it("sin reportes: no hay pico ni señales", () => {
    const v = veredictoRafaga([], 0);
    expect(v).toMatchObject({ n: 0, pico: false, sospechosa: false, senales: [] });
  });
  it("un pico con una sola señal NO es sospechoso (puede ser una crisis real)", () => {
    const filas = Array.from({ length: 12 }, (_, i) => fila(i, { comentario_hash: i < 4 ? "igual" : null }));
    const v = veredictoRafaga(filas, 0);
    expect(v.pico).toBe(true);
    expect(v.senales).toEqual(["comentario_repetido"]);
    expect(v.sospechosa).toBe(false);
  });
  it("varias señales sin pico tampoco son sospechosas", () => {
    const filas = Array.from({ length: 5 }, (_, i) => fila(i, { comentario_hash: "igual", tiempo_ms: 500, ep: 1000 + i * 10 }));
    const v = veredictoRafaga(filas, 0);
    expect(v.pico).toBe(false);
    expect(v.sospechosa).toBe(false);
  });
  it("bot torpe: ráfaga desde una red, UA igual, ritmo regular, sin tiempo y comentario repetido", () => {
    const filas = Array.from({ length: 30 }, (_, i) =>
      fila(i, { red_hash: "una", ua_familia: "chrome-windows", tiempo_ms: null, comentario_hash: "spam", ep: 1000 + i * 2 }));
    const v = veredictoRafaga(filas, 0);
    expect(v.sospechosa).toBe(true);
    expect(v.senales).toEqual(expect.arrayContaining(["pocas_redes", "ua_homogeneo", "ritmo_regular", "sin_tiempo_formulario", "comentario_repetido"]));
  });
  it("el umbral crece con la tasa típica de la colonia (una colonia muy activa necesita más para ser pico)", () => {
    const filas = Array.from({ length: 15 }, (_, i) => fila(i));
    expect(veredictoRafaga(filas, 0).pico).toBe(true);
    expect(veredictoRafaga(filas, 25).pico).toBe(false);
    expect(veredictoRafaga([], 0).umbral).toBe(RAFAGA.picoMinimo);
  });
  it("las métricas son números o null, serializables y sin identificadores", () => {
    const v = veredictoRafaga(Array.from({ length: 10 }, (_, i) => fila(i)), 1);
    for (const m of Object.values(v.metricas)) expect(m === null || typeof m === "number").toBe(true);
    expect(JSON.stringify(v)).not.toMatch(/h\d|r\d/);
  });
});

// --- Base de datos ------------------------------------------------------------------------------

let bd: BaseTemporal;
let col: number;
beforeAll(async () => { bd = await crearBase(); });
afterAll(async () => { await bd?.borrar(); });
beforeEach(async () => {
  // la bitácora es inmutable por triggers: para limpiar entre pruebas se desactivan un momento
  await bd.pool.query("ALTER TABLE moderacion_log DISABLE TRIGGER moderacion_log_no_mod");
  await bd.pool.query("ALTER TABLE moderacion_log DISABLE TRIGGER moderacion_log_no_trunc");
  await bd.pool.query("TRUNCATE moderacion_log, reportes RESTART IDENTITY CASCADE");
  await bd.pool.query("ALTER TABLE moderacion_log ENABLE TRIGGER moderacion_log_no_mod");
  await bd.pool.query("ALTER TABLE moderacion_log ENABLE TRIGGER moderacion_log_no_trunc");
  await bd.pool.query("DELETE FROM colonias");
  col = await insertarColonia(bd.pool, "Lomas");
  invalidarCacheScores();
});

const estados = async (ids: number[]) =>
  (await bd.pool.query("SELECT id::int AS id, estado, motivo FROM reportes WHERE id = ANY($1) ORDER BY id", [ids])).rows;
const nuevo = (o: Partial<Parameters<typeof insertarReporte>[1]> = {}) => insertarReporte(bd.pool, { colonia_id: col, ...o });

describe("moderar()", () => {
  it("el sistema degrada visible -> revision y deja bitácora con estado anterior", async () => {
    const a = await nuevo();
    const b = await nuevo();
    expect(await moderar(bd.pool, [a, b], "degradar", "sistema", "ráfaga sospechosa de prueba", "regla_x")).toBe(2);
    expect((await estados([a, b])).map((r) => r.estado)).toEqual(["revision", "revision"]);
    const log = await bitacora(bd.pool);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: "sistema", accion: "degradar", colonia_id: col, n_reportes: 2, regla: "regla_x" });
    const crudo = (await bd.pool.query("SELECT estado_antes, estado_despues FROM moderacion_log")).rows[0];
    expect(crudo.estado_despues).toBe("revision");
    expect(crudo.estado_antes).toEqual({ [a]: "visible", [b]: "visible" });
  });
  it("el sistema NO puede ocultar ni restaurar (decisión humana)", async () => {
    const a = await nuevo();
    await expect(moderar(bd.pool, [a], "ocultar", "sistema", "intento automático de ocultar")).rejects.toThrow(/decision humana/);
    await expect(moderar(bd.pool, [a], "restaurar", "sistema", "intento automático de restaurar")).rejects.toThrow(/decision humana/);
    expect((await estados([a]))[0].estado).toBe("visible");
  });
  it("un moderador oculta y restaura; restaurar borra el motivo del reporte", async () => {
    const a = await nuevo();
    expect(await moderar(bd.pool, [a], "ocultar", "mod:ana", "contiene datos personales")).toBe(1);
    expect(await estados([a])).toEqual([{ id: a, estado: "oculto", motivo: "contiene datos personales" }]);
    expect(await moderar(bd.pool, [a], "restaurar", "mod:ana", "falsa alarma, es legítimo")).toBe(1);
    expect(await estados([a])).toEqual([{ id: a, estado: "visible", motivo: null }]);
    expect((await bitacora(bd.pool)).map((e) => e.accion)).toEqual(["restaurar", "ocultar"]);
  });
  it("transiciones inválidas no cambian nada ni ensucian la bitácora (devuelven 0)", async () => {
    const a = await nuevo();
    expect(await moderar(bd.pool, [a], "restaurar", "mod:ana", "ya estaba visible, nada que hacer")).toBe(0);
    await moderar(bd.pool, [a], "ocultar", "mod:ana", "motivo suficientemente largo");
    expect(await moderar(bd.pool, [a], "degradar", "sistema", "ya está oculto, no se toca")).toBe(0);
    expect(await moderar(bd.pool, [a], "ocultar", "mod:ana", "ya estaba oculto del todo")).toBe(0);
    expect((await estados([a]))[0].estado).toBe("oculto");
    expect(await bitacora(bd.pool)).toHaveLength(1);
  });
  it("valida motivo (>= 10 caracteres), actor y acción", async () => {
    const a = await nuevo();
    await expect(moderar(bd.pool, [a], "ocultar", "mod:ana", "corto")).rejects.toThrow(/motivo/);
    await expect(moderar(bd.pool, [a], "ocultar", "cualquiera", "motivo suficientemente largo")).rejects.toThrow(/actor/);
    await expect(moderar(bd.pool, [a], "borrar" as never, "mod:ana", "motivo suficientemente largo")).rejects.toThrow(/accion/);
    expect((await estados([a]))[0].estado).toBe("visible");
  });
  it("sin ids no consulta la base y devuelve 0; ids inexistentes devuelven 0", async () => {
    const roto = { query: async () => { throw new Error("no debía consultar"); } };
    expect(await moderar(roto, [], "degradar", "sistema", "sin ids, no hace nada")).toBe(0);
    expect(await moderar(bd.pool, [999999], "degradar", "sistema", "id inexistente en la base")).toBe(0);
  });
  it("la bitácora es de solo agregado: UPDATE, DELETE y TRUNCATE fallan", async () => {
    const a = await nuevo();
    await moderar(bd.pool, [a], "degradar", "sistema", "ráfaga sospechosa de prueba");
    await expect(bd.pool.query("UPDATE moderacion_log SET motivo = 'alterado por alguien'")).rejects.toThrow(/solo de agregado/);
    await expect(bd.pool.query("DELETE FROM moderacion_log")).rejects.toThrow(/solo de agregado/);
    await expect(bd.pool.query("TRUNCATE moderacion_log")).rejects.toThrow(/solo de agregado/);
    expect(await bitacora(bd.pool)).toHaveLength(1);
  });
  it("mover reportes de varias colonias deja colonia_id nulo en la bitácora", async () => {
    const otra = await insertarColonia(bd.pool, "Otra", "Zapopan", -103.1, 20.7);
    const a = await nuevo();
    const b = await insertarReporte(bd.pool, { colonia_id: otra });
    await moderar(bd.pool, [a, b], "degradar", "sistema", "ráfaga sospechosa en dos colonias");
    expect((await bitacora(bd.pool))[0].colonia_id).toBeNull();
  });
  it("moderar invalida la caché de scores: el cambio se ve de inmediato", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) ids.push(await nuevo({ red_hash: `r${i}`, red_sem: `s${i}`, hace_horas: 1 + i }));
    expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(1);
    await moderar(bd.pool, ids, "ocultar", "mod:ana", "todos eran de una sola persona");
    expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(0);
    await moderar(bd.pool, ids, "restaurar", "mod:ana", "revisado, eran legítimos");
    expect(await scoresConCache(bd.pool, 60_000)).toHaveLength(1);
  });
  it("ocultar los reportes quita la colonia de los scores publicados", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) ids.push(await nuevo({ red_hash: `r${i}`, red_sem: `s${i}`, hace_horas: 1 + i }));
    expect(await calcularScores(bd.pool)).toHaveLength(1);
    await moderar(bd.pool, ids, "degradar", "sistema", "ráfaga sospechosa en revisión");
    expect(await calcularScores(bd.pool)).toHaveLength(0); // no queda ningún reporte contable
  });
});

describe("ráfagas contra la base", () => {
  /** Inserta `k` reportes de la última hora desde una sola red con User-Agent igual y comentario repetido. */
  async function bot(k: number) {
    for (let i = 0; i < k; i++) {
      await nuevo({
        gravedad: 4, huella: `bot-${i}`, red_hash: "una-red", red_sem: "una-red-s", ua_familia: "chrome-windows",
        canal: "sin_cabeceras", comentario_hash: "spam", hace_horas: i / 120, // todos en la última hora, ritmo regular
      });
    }
  }
  it("una crisis real (muchos vecinos distintos) no se degrada", async () => {
    for (let i = 0; i < 25; i++) {
      await nuevo({ huella: `v${i}`, red_hash: `rv${i}`, red_sem: `sv${i}`, ua_familia: ["chrome-android", "safari-ios"][i % 2],
        tiempo_ms: 8000 + i * 997, hace_horas: (i * 37 % 55) / 60 + (i % 7) / 100 });
    }
    const e = await aplicarRafaga(bd.pool, col);
    expect(e.pico).toBe(true);
    expect(e.sospechosa).toBe(false);
    expect((await colaRevision(bd.pool))).toHaveLength(0);
    expect(await rafagaEnCurso(bd.pool, col)).toBe(false);
  });
  it("un bot torpe se degrada a 'revision' (no se oculta) y queda registrado por regla", async () => {
    await bot(30);
    const e = await evaluarRafaga(bd.pool, col);
    expect(e.sospechosa).toBe(true);
    const aplicada = await aplicarRafaga(bd.pool, col);
    expect(aplicada.senales.length).toBeGreaterThanOrEqual(2);
    const cola = await colaRevision(bd.pool);
    expect(cola).toHaveLength(30);
    expect((await bd.pool.query("SELECT count(*)::int AS n FROM reportes WHERE estado='oculto'")).rows[0].n).toBe(0);
    const log = await bitacora(bd.pool);
    expect(log[0]).toMatchObject({ actor: "sistema", accion: "degradar", regla: "rafaga_sospechosa", n_reportes: 30 });
    expect(await calcularScores(bd.pool)).toEqual([]);
  });
  it("tras detectar la ráfaga, rafagaEnCurso es verdadera hasta que un moderador actúa", async () => {
    await bot(30);
    await aplicarRafaga(bd.pool, col);
    expect(await rafagaEnCurso(bd.pool, col)).toBe(true);
    const cola = await colaRevision(bd.pool);
    await moderar(bd.pool, cola.map((r) => r.id), "ocultar", "mod:ana", "confirmado: era un bot");
    expect(await rafagaEnCurso(bd.pool, col)).toBe(false);
  });
  it("una colonia distinta no se ve afectada por la ráfaga de otra", async () => {
    const otra = await insertarColonia(bd.pool, "Otra", "Zapopan", -103.1, 20.7);
    await bot(30);
    await aplicarRafaga(bd.pool, col);
    expect(await rafagaEnCurso(bd.pool, otra)).toBe(false);
  });
  it("la ráfaga degrada SOLO a los reportes que la causaron: los vecinos con pinta de navegador siguen visibles", async () => {
    await bot(60);
    const vecinosHonestos: number[] = [];
    for (let i = 0; i < 5; i++) {
      vecinosHonestos.push(
        await nuevo({
          gravedad: 3, huella: `honesto-${i}`, red_hash: `red-honesta-${i}`, red_sem: `sem-honesta-${i}`,
          ua_familia: ["chrome-android", "safari-ios"][i % 2], canal: "web", tiempo_ms: 11000 + i * 1500, hace_horas: 0.3 + i / 100,
        }),
      );
    }
    const e = await aplicarRafaga(bd.pool, col);
    expect(e.sospechosa).toBe(true);
    expect((await estados(vecinosHonestos)).map((r) => r.estado)).toEqual(Array(5).fill("visible"));
    expect((await colaRevision(bd.pool))).toHaveLength(60);
    // y un vecino que llega después, con pinta de navegador y red propia, tampoco entra a revisión
    expect(await rafagaEnCurso(bd.pool, col, { redHash: "red-nueva", canal: "web", tiempoMs: 12000 })).toBe(false);
    // pero un envío sin cabeceras, sin tiempo de formulario o desde la red atacante sí
    expect(await rafagaEnCurso(bd.pool, col, { redHash: "red-nueva", canal: "sin_cabeceras", tiempoMs: 12000 })).toBe(true);
    expect(await rafagaEnCurso(bd.pool, col, { redHash: "red-nueva", canal: "web", tiempoMs: null })).toBe(true);
    expect(await rafagaEnCurso(bd.pool, col, { redHash: "una-red", canal: "web", tiempoMs: 12000 })).toBe(true);
  });
  it("los reportes ya en revisión NO alimentan la ráfaga: no se puede re-disparar con los propios reportes degradados", async () => {
    for (let i = 0; i < 40; i++) await nuevo({ huella: `r${i}`, red_hash: "una", ua_familia: "chrome-windows", canal: "sin_cabeceras", estado: "revision", hace_horas: 0.1 });
    expect((await evaluarRafaga(bd.pool, col)).n).toBe(0);
  });
  it("los reportes ya ocultos o sospechosos no cuentan para evaluar la ráfaga", async () => {
    for (let i = 0; i < 30; i++) await nuevo({ huella: `s${i}`, red_hash: "una", ua_familia: "chrome-windows", sospechoso: true, hace_horas: 0.1 });
    for (let i = 0; i < 30; i++) await nuevo({ huella: `o${i}`, red_hash: "una", ua_familia: "chrome-windows", estado: "oculto", hace_horas: 0.1 });
    expect((await evaluarRafaga(bd.pool, col)).n).toBe(0);
  });
});

describe("reportesOfensores (función pura)", () => {
  const f = (id: number, o: Partial<Parameters<typeof reportesOfensores>[0][number]> = {}) => ({
    id: String(id), red_hash: `r${id}`, tiempo_ms: 12000, comentario_hash: null, canal: "web", ...o,
  });
  it("una red con muchos reportes, los envíos sin cabeceras y los comentarios repetidos son ofensores; el resto no", () => {
    const filas = [
      ...[1, 2, 3, 4].map((i) => f(i, { red_hash: "mala" })),
      f(5, { canal: "sin_cabeceras" }),
      f(6, { tiempo_ms: null }),
      f(7, { comentario_hash: "x" }), f(8, { comentario_hash: "x" }), f(9, { comentario_hash: "x" }),
      f(10), f(11), f(12, { comentario_hash: "x2" }),
    ];
    expect(reportesOfensores(filas, ["pocas_redes", "sin_cabeceras_navegador", "sin_tiempo_formulario"])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("sin la señal correspondiente, canal y tiempo por sí solos no condenan a nadie", () => {
    const filas = [f(1, { canal: "sin_cabeceras" }), f(2, { tiempo_ms: null }), f(3)];
    expect(reportesOfensores(filas, ["pocas_redes", "ritmo_regular"])).toEqual([]);
  });
});

describe("lecturas del panel de administración", () => {
  it("resumen, cola y reportes de colonia no exponen huella, red_hash ni red_sem", async () => {
    const a = await nuevo({ huella: "SECRETA-huella", red_hash: "SECRETA-red", red_sem: "SECRETA-sem", comentario: "hola", estado: "revision" });
    await nuevo({ sospechoso: true });
    const todo = JSON.stringify({
      cola: await colaRevision(bd.pool),
      col: await reportesDeColonia(bd.pool, col),
      res: await resumenModeracion(bd.pool),
    });
    expect(todo).not.toContain("SECRETA");
    expect(todo).not.toMatch(/"huella"|"red_hash"|"red_sem"/);
    expect((await colaRevision(bd.pool)).map((r) => r.id)).toEqual([a]);
  });
  it("resumenModeracion cuenta por estado, motivos de sospecha y las últimas 24 h", async () => {
    await nuevo();
    await nuevo({ estado: "revision" });
    await nuevo({ hace_horas: 30 });
    await bd.pool.query("UPDATE reportes SET sospechoso = true, motivo = 'honeypot' WHERE id = (SELECT min(id) FROM reportes)");
    const r = await resumenModeracion(bd.pool);
    expect(r.por_estado).toEqual({ visible: 2, revision: 1 });
    expect(r.sospechosos_7d).toEqual([{ motivo: "honeypot", n: 1 }]);
    expect(r.reportes_24h).toBe(2);
    expect(r.retencion_vencida).toBe(0);
  });
  it("resumenModeracion avisa de retención vencida (más de 31 días sin anonimizar)", async () => {
    await nuevo({ hace_horas: 24 * 40 });
    await nuevo({ hace_horas: 24 * 5 });
    expect((await resumenModeracion(bd.pool)).retencion_vencida).toBe(1);
    await bd.pool.query("UPDATE reportes SET anonimizado_en = now(), comentario = NULL");
    expect((await resumenModeracion(bd.pool)).retencion_vencida).toBe(0);
  });
  it("colaRevision va de los más viejos a los más nuevos y respeta el límite", async () => {
    const viejo = await nuevo({ estado: "revision", hace_horas: 10 });
    const nuevoR = await nuevo({ estado: "revision", hace_horas: 1 });
    expect((await colaRevision(bd.pool)).map((r) => r.id)).toEqual([viejo, nuevoR]);
    expect((await colaRevision(bd.pool, 1)).map((r) => r.id)).toEqual([viejo]);
  });
  it("reportesDeColonia ordena del más reciente al más viejo, de cualquier estado", async () => {
    const a = await nuevo({ hace_horas: 5 });
    const b = await nuevo({ hace_horas: 1, estado: "oculto" });
    expect((await reportesDeColonia(bd.pool, col)).map((r) => r.id)).toEqual([b, a]);
  });
  it("reportesRecientes lista todas las colonias y estados, del más reciente al más antiguo, con comentario y sin identificadores", async () => {
    const otra = await insertarColonia(bd.pool, "Otra colonia");
    const a = await nuevo({ hace_horas: 5, comentario: "comentario uno", huella: "SECRETA-huella", red_hash: "SECRETA-red" });
    const b = await insertarReporte(bd.pool, { colonia_id: otra, hace_horas: 3, estado: "oculto" });
    const c = await nuevo({ hace_horas: 1, estado: "revision" });
    const { reportes, total } = await reportesRecientes(bd.pool);
    expect(reportes.map((r) => r.id)).toEqual([c, b, a]);
    expect(total).toBe(3);
    expect(reportes.find((r) => r.id === a)).toMatchObject({ comentario: "comentario uno", colonia: "Lomas" });
    expect(reportes.find((r) => r.id === b)).toMatchObject({ colonia: "Otra colonia", estado: "oculto" });
    expect(JSON.stringify(reportes)).not.toContain("SECRETA");
  });
  it("reportesRecientes respeta el límite pero informa el total", async () => {
    for (let i = 0; i < 5; i++) await nuevo({ hace_horas: i });
    const { reportes, total } = await reportesRecientes(bd.pool, 2);
    expect(reportes).toHaveLength(2);
    expect(total).toBe(5);
  });
});
