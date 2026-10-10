import { beforeEach, describe, expect, it } from "vitest";
import { GET as scores } from "@/app/api/colonias/scores/route";
import { POST } from "@/app/api/reportes/route";
import { PARAMS, invalidarCacheScores } from "@/lib/aggregation";
import {
  crearColonia, cuerpoValido, db, ipNueva, json, post, reiniciar, sembrar, sembrarVecinos,
} from "./helpers";

type Score = {
  id: number; score: number; nivel: number; n: number; n_huellas: number;
  confianza: "baja" | "media" | "alta"; ultimo: string;
};
// La caché de scores (30 s) se invalida para leer siempre el estado actual de la base sembrada
const lista = async () => {
  invalidarCacheScores();
  return json<Score[]>(await scores());
};
const de = async (id: number) => (await lista()).find((s) => s.id === id);

beforeEach(reiniciar);

describe("GET /api/colonias/scores: contrato", () => {
  it("sin reportes devuelve un arreglo vacío y cabeceras de caché pública", async () => {
    await crearColonia();
    const res = await scores();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
    expect(res.headers.get("cache-control")).toMatch(/public/);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
  });

  it("cada elemento tiene exactamente las claves del contrato y tipos correctos (sin huellas ni redes)", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 3, 8, { dias: 3 });
    const [s] = await lista();
    expect(Object.keys(s).sort()).toEqual(["confianza", "id", "n", "n_huellas", "nivel", "score", "ultimo"]);
    expect(typeof s.score).toBe("number");
    expect(s.score).toBeGreaterThanOrEqual(1);
    expect(s.score).toBeLessThanOrEqual(4);
    expect(Number.isInteger(s.nivel)).toBe(true);
    expect([1, 2, 3, 4]).toContain(s.nivel);
    expect(Number.isInteger(s.n)).toBe(true);
    expect(Number.isInteger(s.n_huellas)).toBe(true);
    expect(["baja", "media", "alta"]).toContain(s.confianza);
    expect(new Date(s.ultimo).toISOString()).toBe(s.ultimo);
    expect(s.n).toBe(8);
    expect(s.n_huellas).toBe(8);
  });

  it("devuelve las colonias ordenadas por id", async () => {
    const ids = [await crearColonia(), await crearColonia(), await crearColonia()];
    for (const id of [...ids].reverse()) await sembrarVecinos(id, 2, 4);
    expect((await lista()).map((s) => s.id)).toEqual(ids);
  });

  it("un reporte reciente deja a la colonia con ultimo = ese reporte", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 2, 3, { edadBase: 3 });
    await sembrar({ colonia: c, gravedad: 2, edadDias: 0.001 });
    const s = (await de(c))!;
    expect(Date.now() - new Date(s.ultimo).getTime()).toBeLessThan(5 * 60_000);
  });
});

describe("mínimo publicable", () => {
  it("2 reportes (aunque sean críticos) NO publican la colonia", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 4, 2);
    expect(await de(c)).toBeUndefined();
  });

  it("3 vecinos distintos SÍ la publican, con confianza baja", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 3, 3);
    const s = (await de(c))!;
    expect(s).toBeDefined();
    expect(s.confianza).toBe("baja");
    expect(s.n_huellas).toBe(3);
  });

  it("muchas filas de solo 2 huellas NO publican (exige 3 huellas distintas, no 3 filas)", async () => {
    const c = await crearColonia();
    // 2 huellas, 6 reportes en días distintos y desde redes distintas: la evidencia efectiva alcanza,
    // pero hay solo 2 personas/dispositivos
    for (let d = 0; d < 3; d++) {
      for (const h of ["A", "B"]) await sembrar({ colonia: c, gravedad: 3, edadDias: d + 0.2, huella: h, red: `r${d}${h}` });
    }
    expect(await de(c)).toBeUndefined();
    // la tercera huella la publica
    await sembrar({ colonia: c, gravedad: 3, edadDias: 0.5, huella: "C", red: "rC" });
    expect(await de(c)).toBeDefined();
  });

  it("3 huellas pero poca evidencia efectiva (una sola red) NO publican", async () => {
    const c = await crearColonia();
    // 3 dispositivos detrás de la misma red el mismo día: pesan como mucho kDia = 2 y luego se reducen
    for (let i = 0; i < 3; i++) await sembrar({ colonia: c, gravedad: 4, huella: `h${i}`, red: "misma", redSem: "misma-sem" });
    expect(await de(c)).toBeUndefined();
  });

  it("reportes fuera de la ventana (más de 14 días) no cuentan", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 4, 6, { edadBase: PARAMS.ventanaDias + 1 });
    expect(await de(c)).toBeUndefined();
  });

  it("los reportes viejos no cuentan en n/n_huellas aunque la colonia sí se publique", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 2, 5, { edadBase: 0 });
    await sembrarVecinos(c, 2, 5, { edadBase: PARAMS.ventanaDias + 2, prefijo: "viejo" });
    const s = (await de(c))!;
    expect(s.n).toBe(5);
    expect(s.n_huellas).toBe(5);
  });
});

describe("solo cuentan los reportes visibles y no sospechosos", () => {
  it("revisión, ocultos y sospechosos no suman ni al score ni a n", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 4, { dias: 2 });
    const antes = (await de(c))!;
    for (let i = 0; i < 30; i++) {
      await sembrar({ colonia: c, gravedad: 4, estado: "revision", huella: `rev${i}`, red: `rr${i}` });
      await sembrar({ colonia: c, gravedad: 4, estado: "oculto", huella: `oc${i}`, red: `ro${i}` });
      await sembrar({ colonia: c, gravedad: 4, sospechoso: true, huella: `so${i}`, red: `rs${i}` });
    }
    invalidarCacheScores();
    const despues = (await de(c))!;
    expect(despues.score).toBeCloseTo(antes.score, 6);
    expect(despues.n).toBe(antes.n);
    expect(despues.n_huellas).toBe(antes.n_huellas);
  });

  it("una colonia que solo tiene reportes no contables no aparece", async () => {
    const c = await crearColonia();
    for (let i = 0; i < 10; i++) await sembrar({ colonia: c, gravedad: 4, estado: "revision" });
    expect(await de(c)).toBeUndefined();
  });
});

describe("confianza", () => {
  it("baja con poca evidencia (< 6) y con todo concentrado en un solo día", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 3, 5);
    expect((await de(c))!.confianza).toBe("baja");
    const d = await crearColonia();
    await sembrarVecinos(d, 3, 14, { dias: 1 }); // 14 vecinos, pero el mismo día: pico no corroborado
    expect((await de(d))!.confianza).toBe("baja");
  });

  it("media cuando hay evidencia y días, pero aún pocas redes semanales", async () => {
    const c = await crearColonia();
    // 6 vecinos en 2 días: n_eff 6, 2 días corroborando, 6 redes (< 8 y < 4 días... )
    await sembrarVecinos(c, 3, 6, { dias: 2 });
    expect((await de(c))!.confianza).toBe("media");
  });

  it("alta con >= 12 de evidencia, >= 3 días corroborando y >= 8 redes", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 3, 16, { dias: 4 });
    const s = (await de(c))!;
    expect(s.confianza).toBe("alta");
    expect(s.nivel).toBe(3);
  });

  it("una distribución muy dividida (mitad leve, mitad crítica) no pasa de 'media'", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 8, { dias: 4, prefijo: "leve" });
    await sembrarVecinos(c, 4, 8, { dias: 4, prefijo: "grave" });
    expect((await de(c))!.confianza).not.toBe("alta");
  });
});

describe("decaimiento con la antigüedad", () => {
  it("lo reciente pesa más que lo viejo (misma cantidad, orden invertido)", async () => {
    // A: viejo leve, reciente grave.  B: viejo grave, reciente leve.
    const a = await crearColonia();
    const b = await crearColonia();
    await sembrarVecinos(a, 1, 8, { dias: 2, edadBase: 9, prefijo: "a-viejo" });
    await sembrarVecinos(a, 4, 8, { dias: 2, edadBase: 0, prefijo: "a-nuevo" });
    await sembrarVecinos(b, 4, 8, { dias: 2, edadBase: 9, prefijo: "b-viejo" });
    await sembrarVecinos(b, 1, 8, { dias: 2, edadBase: 0, prefijo: "b-nuevo" });
    const sa = (await de(a))!;
    const sb = (await de(b))!;
    expect(sa.score).toBeGreaterThan(sb.score + 0.4);
    // con vida media de 7 días, 9 días de diferencia ≈ un factor 2.4 de peso
    expect(sa.score).toBeGreaterThan(2.5);
    expect(sb.score).toBeLessThan(2.5);
  });

  it("un reporte reciente cambia más el score que el mismo reporte hace 12 días", async () => {
    const base = async () => {
      const c = await crearColonia();
      await sembrarVecinos(c, 2, 8, { dias: 3, edadBase: 1 });
      return c;
    };
    const sinOutlier = await base();
    const reciente = await base();
    const antiguo = await base();
    // 4 vecinos críticos: algo que mueve el score aunque se recorte la cola
    await sembrarVecinos(reciente, 4, 4, { prefijo: "rec", edadBase: 0 });
    await sembrarVecinos(antiguo, 4, 4, { prefijo: "ant", edadBase: 12 });
    const s0 = (await de(sinOutlier))!.score;
    const sr = (await de(reciente))!.score;
    const sa = (await de(antiguo))!.score;
    expect(sr - s0).toBeGreaterThan(sa - s0);
  });
});

describe("robustez frente a brigadeo (pocas huellas / pocas redes)", () => {
  /** 8 vecinos honestos reportan "leve" (1) en 3 días distintos. */
  async function colonia_base() {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 8, { dias: 3, prefijo: "honesto" });
    return c;
  }

  it("200 reportes críticos desde 2 redes (200 huellas) NO mueven el score lo que moverían 200 vecinos distintos", async () => {
    const base = await colonia_base();
    const sBase = (await de(base))!.score;

    // Ataque: 200 huellas pero solo 2 redes (rotando User-Agent), repartidas en 2 días
    const atacada = await colonia_base();
    for (let i = 0; i < 200; i++) {
      const red = i % 2 === 0 ? "red-atacante-1" : "red-atacante-2";
      await sembrar({
        colonia: atacada, gravedad: 4, edadDias: (i % 4 < 2 ? 0 : 1) + 0.1, huella: `bot-${i}`, red: `${red}-d${i % 4 < 2 ? 0 : 1}`, redSem: red,
      });
    }

    // Control: 200 vecinos realmente distintos reportan crítico
    const real = await colonia_base();
    await sembrarVecinos(real, 4, 200, { dias: 5, prefijo: "vecino" });

    invalidarCacheScores();
    const sAtaque = (await de(atacada))!.score;
    const sReal = (await de(real))!.score;

    const desplazamientoAtaque = sAtaque - sBase;
    const desplazamientoReal = sReal - sBase;
    // 200 vecinos distintos llevan el score casi a 4
    expect(sReal).toBeGreaterThan(3.5);
    // el ataque mueve una fracción mínima de eso
    expect(desplazamientoAtaque).toBeLessThan(0.15 * desplazamientoReal);
    expect(desplazamientoAtaque).toBeLessThan(0.5);
    expect((await de(atacada))!.nivel).toBe(1);
  });

  it("un solo origen con 200 huellas no puede publicar una colonia vacía", async () => {
    const c = await crearColonia();
    for (let i = 0; i < 200; i++) {
      await sembrar({ colonia: c, gravedad: 4, huella: `bot-${i}`, red: "red-unica-d0", redSem: "red-unica" });
    }
    expect(await de(c)).toBeUndefined();
  });

  it("5 redes distintas con 40 reportes cada una pesan como 5 redes, no como 200 reportes", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 8, { dias: 3, prefijo: "honesto" });
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 40; i++) {
        await sembrar({ colonia: c, gravedad: 4, huella: `r${r}-${i}`, red: `red${r}`, redSem: `red${r}-sem` });
      }
    }
    const s = (await de(c))!;
    // 8 leves honestos + (5 redes x ~3 de peso máximo, aún reducido por concentración): sigue lejos de 4
    expect(s.score).toBeLessThan(2.6);
    // pero el conteo crudo SÍ refleja todas las filas (el score no depende de él)
    expect(s.n).toBe(208);
  });

  it("repetir el mismo reporte en 3 días con una sola red no multiplica su peso (tope semanal)", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 8, { dias: 3, prefijo: "honesto" });
    const antes = (await de(c))!.score;
    for (let d = 0; d < 3; d++) {
      for (let i = 0; i < 30; i++) {
        await sembrar({ colonia: c, gravedad: 4, edadDias: d + 0.1, huella: `x-${d}-${i}`, red: `mia-d${d}`, redSem: "mia-sem" });
      }
    }
    const despues = (await de(c))!.score;
    expect(despues - antes).toBeLessThan(0.3);
  });

  it("los reportes con formulario instantáneo (< 5 s) pesan la mitad que los normales", async () => {
    const lentos = await crearColonia();
    const rapidos = await crearColonia();
    for (const [col, ms] of [[lentos, 20000], [rapidos, 1000]] as const) {
      await sembrarVecinos(col, 1, 4, { dias: 2, prefijo: `h${col}` });
      for (let i = 0; i < 4; i++) {
        await sembrar({ colonia: col, gravedad: 4, huella: `t${col}-${i}`, red: `t${col}-${i}`, tiempoMs: ms, edadDias: 0.2 });
      }
    }
    // los lentos pesan el doble, así que su score tiene que estar más cerca de 4
    expect((await de(lentos))!.score).toBeGreaterThan((await de(rapidos))!.score);
  });

  it("por la API real: 200 envíos desde una sola red rotando User-Agent no publican la colonia", async () => {
    const c = await crearColonia();
    let ok = 0, limitados = 0;
    for (let i = 0; i < 200; i++) {
      const res = await POST(post("/api/reportes", cuerpoValido(c, { gravedad: 4, tiempo_ms: 6000 + i * 211 }), {
        ip: `198.51.100.${(i % 250) + 1}`,
        ua: `Mozilla/5.0 (Linux; Android 14; Bot${i}) Chrome/126.0 Mobile Safari/537.36`,
      }));
      if (res.status === 429) limitados++;
      else ok++;
    }
    expect(limitados).toBeGreaterThan(0); // el tope duro de red (120/hora) frenó el resto
    expect(ok).toBeLessThanOrEqual(120);
    expect(await de(c)).toBeUndefined();
  });

  it("por la API real: el ataque tampoco mueve una colonia con vecinos honestos", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 8, { dias: 3, prefijo: "honesto" });
    const antes = (await de(c))!.score;
    for (let i = 0; i < 150; i++) {
      await POST(post("/api/reportes", cuerpoValido(c, { gravedad: 4, tiempo_ms: 6000 + i * 211 }), {
        ip: `198.51.100.${(i % 250) + 1}`,
        ua: `Mozilla/5.0 (Linux; Android 14; Bot${i}) Chrome/126.0 Mobile Safari/537.36`,
      }));
    }
    const despues = (await de(c))!.score;
    expect(despues - antes).toBeLessThan(0.3);
  });

  it("LÍMITE CONOCIDO: muchas redes con comportamiento humano sí mueven el score (no se distingue de vecinos reales)", async () => {
    const c = await crearColonia();
    await sembrarVecinos(c, 1, 8, { dias: 3, prefijo: "honesto" });
    // Un atacante que aparenta 60 vecinos distintos durante 4 días
    await sembrarVecinos(c, 4, 60, { dias: 4, prefijo: "falso" });
    const s = (await de(c))!;
    // Documenta el límite: es el comportamiento esperado, y la metodología lo declara
    expect(s.score).toBeGreaterThan(3);
  });
});

describe("prior global", () => {
  it("el prior global está acotado [1.5, 2.5]: colonias reales extremas no lo sacan de ese rango", async () => {
    // colonia real con casi cero evidencia, 3 vecinos 'críticos', frente a muchas colonias críticas
    const chica = await crearColonia();
    await sembrarVecinos(chica, 4, 3);
    for (let k = 0; k < 4; k++) {
      const g = await crearColonia();
      await sembrarVecinos(g, 4, 20, { dias: 4, prefijo: `grave${k}` });
    }
    // lambda = 3/(3+C): score = lambda*4 + (1-lambda)*prior, prior <= 2.5
    const lambda = 3 / (3 + PARAMS.C);
    const maximo = lambda * 4 + (1 - lambda) * PARAMS.priorMax;
    expect((await de(chica))!.score).toBeLessThanOrEqual(maximo + 1e-6);
  });
});

describe("la API pública de reportes nunca expone identificadores", () => {
  it("el JSON de scores no contiene huellas ni hashes de red", async () => {
    const c = await crearColonia();
    await sembrar({ colonia: c, gravedad: 3, huella: "HUELLA-SECRETA-1", red: "RED-SECRETA-1" });
    await sembrar({ colonia: c, gravedad: 3, huella: "HUELLA-SECRETA-2", red: "RED-SECRETA-2" });
    await sembrar({ colonia: c, gravedad: 3, huella: "HUELLA-SECRETA-3", red: "RED-SECRETA-3" });
    const txt = JSON.stringify(await lista());
    expect(txt).not.toMatch(/SECRETA/);
    expect(txt.length).toBeGreaterThan(10);
    void db; void ipNueva;
  });
});
