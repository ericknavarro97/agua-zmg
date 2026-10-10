/**
 * Propiedades de la agregación (función pura `agregar`). Se usan generadores pseudoaleatorios con
 * semilla fija (sin dependencias): si una propiedad falla, el mensaje indica la semilla para reproducirla.
 */
import { describe, expect, it } from "vitest";
import {
  PARAMS, agregar, confianzaDe, paraContrato, priorGlobal, recortada, type Grupo, type ResumenColonia,
} from "../../lib/aggregation";

// --- utilidades ------------------------------------------------------------------------------

/** mulberry32: PRNG determinista. */
function prng(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Gravedad = 1 | 2 | 3 | 4;
let contador = 0;
const dia = (edad: number) => `2026-10-${String(Math.max(1, 8 - Math.floor(edad))).padStart(2, "0")}`;

/** Un grupo de `n` reportes de una red propia (cada red distinta = vecinos distintos). */
function g(col: number, gravedad: Gravedad, edadDias = 0.2, o: Partial<Grupo> = {}): Grupo {
  const red = o.red ?? `r${contador++}`;
  return { coloniaId: col, dia: dia(edadDias), red, redSem: o.redSem ?? red, gravedad, n: 1, nRapidos: 0, edadDias, ...o };
}
const ULTIMO = Date.UTC(2026, 9, 8);
/** Resumen: cada fila es una huella distinta salvo que se pase `huellas`. */
function resumen(gs: Grupo[], huellas?: Map<number, number>): Map<number, ResumenColonia> {
  const m = new Map<number, ResumenColonia>();
  for (const x of gs) {
    const r = m.get(x.coloniaId) ?? { n: 0, nHuellas: 0, ultimoMs: ULTIMO };
    r.n += x.n;
    r.nHuellas += x.n;
    m.set(x.coloniaId, r);
  }
  if (huellas) for (const [k, v] of huellas) m.get(k)!.nHuellas = v;
  return m;
}
const calc = (gs: Grupo[], huellas?: Map<number, number>) => agregar(gs, resumen(gs, huellas));
const de = (gs: Grupo[], col: number) => calc(gs).find((s) => s.id === col);
const vecinos = (col: number, grav: Gravedad, k: number, dias = 3) =>
  Array.from({ length: k }, (_, i) => g(col, grav, (i % dias) + 0.2));

/** Escenario aleatorio: varias colonias con reportes variados (algunos de redes repetidas, rápidos). */
function escenario(rng: () => number): Grupo[] {
  const out: Grupo[] = [];
  const ncol = 1 + Math.floor(rng() * 8);
  for (let c = 1; c <= ncol; c++) {
    const k = Math.floor(rng() * 40);
    const redes = 1 + Math.floor(rng() * 12);
    for (let i = 0; i < k; i++) {
      const edad = rng() * 14;
      const red = `c${c}-red${Math.floor(rng() * redes)}`;
      const n = 1 + Math.floor(rng() * 3);
      out.push({
        coloniaId: c, dia: dia(edad), red, redSem: red.slice(0, -1) + "S",
        gravedad: (1 + Math.floor(rng() * 4)) as Gravedad, n, nRapidos: Math.floor(rng() * (n + 1)), edadDias: edad,
      });
    }
  }
  return out;
}

const SEMILLAS = Array.from({ length: 300 }, (_, i) => i + 1);

// --- acotación -------------------------------------------------------------------------------

describe("acotación 1-4", () => {
  it("con escenarios aleatorios, score y nivel siempre quedan en rango y son finitos", () => {
    let publicadas = 0;
    for (const s of SEMILLAS) {
      for (const x of calc(escenario(prng(s)))) {
        publicadas++;
        expect(Number.isFinite(x.score), `semilla ${s}`).toBe(true);
        expect(x.score, `semilla ${s}`).toBeGreaterThanOrEqual(1);
        expect(x.score, `semilla ${s}`).toBeLessThanOrEqual(4);
        expect([1, 2, 3, 4]).toContain(x.nivel);
        expect(x.nivel).toBe(Math.min(4, Math.max(1, Math.round(x.score))));
        expect(["baja", "media", "alta"]).toContain(x.confianza);
        expect(x.nEff).toBeGreaterThanOrEqual(PARAMS.minEvidencia);
      }
    }
    // la prueba es útil solo si realmente se publicó algo
    expect(publicadas).toBeGreaterThan(100);
  });
  it("todo 4 -> score <= 4; todo 1 -> score >= 1 (el prior no lo saca del rango)", () => {
    const cuatro = de(vecinos(1, 4, 30), 1)!;
    const uno = de(vecinos(1, 1, 30), 1)!;
    expect(cuatro.score).toBeLessThanOrEqual(4);
    expect(cuatro.score).toBeGreaterThan(3.5);
    expect(uno.score).toBeGreaterThanOrEqual(1);
    expect(uno.score).toBeLessThan(1.5);
  });
  it("el resultado sale ordenado por id y sin repetir colonias", () => {
    const gs = [...vecinos(9, 2, 5), ...vecinos(3, 3, 5), ...vecinos(5, 1, 5)];
    expect(calc(gs).map((x) => x.id)).toEqual([3, 5, 9]);
  });
  it("sin grupos -> sin resultados", () => {
    expect(agregar([], new Map())).toEqual([]);
  });
});

// --- monotonía -------------------------------------------------------------------------------

describe("monotonía", () => {
  it("subir la gravedad de un reporte nunca baja el score (300 escenarios)", () => {
    let comparaciones = 0;
    for (const s of SEMILLAS) {
      const rng = prng(s * 7919);
      const base = escenario(rng);
      if (!base.length) continue;
      const i = Math.floor(rng() * base.length);
      if (base[i].gravedad === 4) continue;
      const subido = base.map((x, j) => (j === i ? { ...x, gravedad: (x.gravedad + 1) as Gravedad } : x));
      const antes = calc(base);
      const despues = calc(subido);
      // mismos pesos -> mismas colonias publicables
      expect(despues.map((x) => x.id), `semilla ${s}`).toEqual(antes.map((x) => x.id));
      for (const a of antes) {
        const b = despues.find((x) => x.id === a.id)!;
        expect(b.score, `semilla ${s} colonia ${a.id}`).toBeGreaterThanOrEqual(a.score - 1e-9);
        comparaciones++;
      }
    }
    expect(comparaciones).toBeGreaterThan(100);
  });
  it("bajar la gravedad de un reporte nunca sube el score (simétrico)", () => {
    for (const s of SEMILLAS.slice(0, 150)) {
      const rng = prng(s * 104729);
      const base = escenario(rng);
      if (!base.length) continue;
      const i = Math.floor(rng() * base.length);
      if (base[i].gravedad === 1) continue;
      const bajado = base.map((x, j) => (j === i ? { ...x, gravedad: (x.gravedad - 1) as Gravedad } : x));
      const antes = calc(base);
      for (const b of calc(bajado)) {
        const a = antes.find((x) => x.id === b.id)!;
        expect(b.score, `semilla ${s}`).toBeLessThanOrEqual(a.score + 1e-9);
      }
    }
  });
  it("una colonia con reportes más graves puntúa más alto que otra equivalente con reportes leves", () => {
    for (const [leve, grave] of [[1, 2], [1, 3], [2, 3], [2, 4], [1, 4], [3, 4]] as [Gravedad, Gravedad][]) {
      const gs = [...vecinos(1, leve, 12), ...vecinos(2, grave, 12)];
      const r = calc(gs);
      expect(r.find((x) => x.id === 2)!.score, `${leve} vs ${grave}`).toBeGreaterThan(r.find((x) => x.id === 1)!.score);
    }
  });
  it("más evidencia coherente acerca el score a la media de los reportes (menos prior)", () => {
    const poca = de(vecinos(1, 4, 3, 3), 1)!;
    const mucha = de(vecinos(1, 4, 30, 3), 1)!;
    expect(mucha.score).toBeGreaterThan(poca.score);
  });
});

// --- mínimo de huellas y evidencia -----------------------------------------------------------

describe("mínimo publicable (evidencia efectiva y huellas)", () => {
  const tres = () => vecinos(1, 3, 3, 3);

  it("3 reportes de 3 redes y 3 huellas distintas se publican", () => {
    expect(calc(tres())).toHaveLength(1);
  });
  it("con solo 2 huellas distintas no se publica, aunque haya 3 filas", () => {
    const gs = tres();
    expect(calc(gs, new Map([[1, 2]]))).toHaveLength(0);
    expect(calc(gs, new Map([[1, 3]]))).toHaveLength(1);
  });
  it("una sola huella con muchas filas nunca alcanza", () => {
    const gs = vecinos(1, 4, 40, 5);
    expect(calc(gs, new Map([[1, 1]]))).toHaveLength(0);
    expect(calc(gs, new Map([[1, PARAMS.minHuellas - 1]]))).toHaveLength(0);
    expect(calc(gs, new Map([[1, PARAMS.minHuellas]]))).toHaveLength(1);
  });
  it("3 reportes de la misma red el mismo día suman poca evidencia efectiva y no se publican", () => {
    const gs = [g(1, 4, 0.2, { red: "misma", n: 3 })];
    expect(calc(gs, new Map([[1, 3]]))).toHaveLength(0);
  });
  it("la evidencia efectiva mínima es PARAMS.minEvidencia: 2.9 no, 3 sí", () => {
    // 2 reportes completos + uno de peso 0.9 (rápido: 0.5, y edad cero) => ajustamos con nRapidos
    const casi = [g(1, 2, 0), g(1, 2, 0), g(1, 2, 0, { nRapidos: 1 })]; // 2 + 0.5 = 2.5 < 3
    expect(calc(casi, new Map([[1, 3]]))).toHaveLength(0);
    expect(calc([...casi, g(1, 2, 0)], new Map([[1, 4]]))).toHaveLength(1); // 3.5
  });
  it("un resumen ausente para la colonia impide publicarla", () => {
    expect(agregar(tres(), new Map())).toEqual([]);
  });
  it("el mínimo de huellas no depende de la gravedad ni de la antigüedad", () => {
    for (const grav of [1, 2, 3, 4] as Gravedad[]) {
      expect(calc(vecinos(1, grav, 10, 4), new Map([[1, 2]]))).toHaveLength(0);
    }
  });
});

// --- recorte (winsorización/media recortada) -------------------------------------------------

describe("recorte de extremos", () => {
  it("recortada: invariante a escala, acotada por los valores presentes y entre 1 y 4", () => {
    for (const s of SEMILLAS) {
      const rng = prng(s * 31);
      const bins = [0, 0, 0, 0].map(() => (rng() < 0.3 ? 0 : rng() * 10));
      if (bins.every((b) => b === 0)) continue;
      const r = recortada(bins)!;
      const factor = 0.1 + rng() * 50;
      const r2 = recortada(bins.map((b) => b * factor))!;
      expect(r2.media, `semilla ${s}`).toBeCloseTo(r.media, 9);
      expect(r2.mediana).toBe(r.mediana);
      const presentes = bins.map((b, i) => (b > 0 ? i + 1 : 0)).filter(Boolean);
      expect(r.media).toBeGreaterThanOrEqual(Math.min(...presentes) - 1e-9);
      expect(r.media).toBeLessThanOrEqual(Math.max(...presentes) + 1e-9);
    }
  });
  it("alfa = 0 es la media ordinaria", () => {
    const bins = [3, 5, 2, 7];
    const media = (1 * 3 + 2 * 5 + 3 * 2 + 4 * 7) / 17;
    // `alfa` está tipado como el literal 0.2 (por `as const` en PARAMS): se fuerza el tipo en la prueba
    expect(recortada(bins, 0 as never)!.media).toBeCloseTo(media, 9);
  });
  it("hasta ~alfa del peso en un extremo no mueve la media recortada", () => {
    // 10 reportes de gravedad 2; añadir 2 de gravedad 4 (2/12 = 16.7 % < 20 %): sin efecto
    expect(recortada([0, 10, 0, 2])!.media).toBeCloseTo(2, 9);
    expect(recortada([2, 10, 0, 0])!.media).toBeCloseTo(2, 9);
    // 2.5 de 12.5 = 20 % exacto: sigue sin efecto
    expect(recortada([0, 10, 0, 2.5])!.media).toBeCloseTo(2, 9);
  });
  it("más allá de alfa el extremo sí influye, pero de forma acotada (no llega al valor del atacante)", () => {
    const r = recortada([0, 10, 0, 6])!.media;
    expect(r).toBeGreaterThan(2);
    expect(r).toBeLessThan(3);
    // y crece con el volumen sin superar 4
    const masivo = recortada([0, 10, 0, 1000])!.media;
    expect(masivo).toBeGreaterThan(r);
    expect(masivo).toBeLessThanOrEqual(4);
  });
  it("de extremo a extremo en la colonia: dos atacantes de 4 entre 10 vecinos de 2 no cambian el score", () => {
    const honestos = vecinos(1, 2, 10, 4);
    const base = de(honestos, 1)!;
    const atacado = de([...honestos, g(1, 4, 0.2), g(1, 4, 0.2)], 1)!;
    expect(atacado.recortada).toBeCloseTo(base.recortada, 9);
    expect(atacado.recortada).toBeCloseTo(2, 9);
    // la mediana tampoco se mueve
    expect(atacado.mediana).toBe(2);
    // el score cambia como mucho por el mayor peso de la evidencia (lambda), nunca por los 4
    expect(Math.abs(atacado.score - base.score)).toBeLessThan(0.1);
  });
  it("un atacante con 1 reporte en 30 no saca una colonia de 1 del nivel 1", () => {
    const x = de([...vecinos(1, 1, 29, 5), g(1, 4, 0.2)], 1)!;
    expect(x.nivel).toBe(1);
  });
  it("sin peso -> null", () => {
    expect(recortada([0, 0, 0, 0])).toBeNull();
  });
});

// --- topes por red, decaimiento, prior -------------------------------------------------------

describe("topes de influencia por red", () => {
  const base = () => vecinos(1, 2, 8, 4);
  it("una red que inunda en un día suma como máximo kDia de evidencia efectiva", () => {
    const sin = de(base(), 1)!;
    const con = de([...base(), g(1, 4, 0.2, { red: "inundador", n: 500 })], 1)!;
    expect(con.nEff - sin.nEff).toBeLessThanOrEqual(PARAMS.kDia + 1e-9);
    // y como llega concentrada pesa aún menos
    expect(con.nEff - sin.nEff).toBeLessThanOrEqual(PARAMS.kDia * PARAMS.fConcentrada + 1e-9);
  });
  it("una red que reporta todos los días de la semana suma como máximo kSem", () => {
    const dias = Array.from({ length: 7 }, (_, d) => g(1, 4, d + 0.2, { red: `diaria-${d}-igual`, redSem: "semana-1", dia: dia(d) }));
    // cada grupo es de una "red diaria" distinta pero comparten la red semanal
    const sin = de(base(), 1)!;
    const con = de([...base(), ...dias], 1)!;
    expect(con.nEff - sin.nEff).toBeLessThanOrEqual(PARAMS.kSem + 1e-9);
  });
  it("varios reportes de la misma red y día pesan menos que los mismos de redes distintas", () => {
    const juntos = de([...base(), g(1, 3, 0.2, { red: "x", n: 5 })], 1)!;
    const separados = de([...base(), ...Array.from({ length: 5 }, () => g(1, 3, 0.2))], 1)!;
    expect(juntos.nEff).toBeLessThan(separados.nEff);
  });
  it("los reportes rápidos pesan la mitad", () => {
    const lentos = de([...base(), g(1, 2, 0.2)], 1)!;
    const rapidos = de([...base(), g(1, 2, 0.2, { nRapidos: 1 })], 1)!;
    expect(lentos.nEff - rapidos.nEff).toBeCloseTo(1 - PARAMS.fRapido, 9);
  });
});

describe("decaimiento temporal", () => {
  it("los reportes recientes pesan más que los viejos", () => {
    // lo observable: lo reciente domina sobre lo viejo con la misma cantidad de reportes
    const viejosGraves = [...Array.from({ length: 6 }, (_, i) => g(1, 4, 12 + (i % 2) * 0.1)), ...Array.from({ length: 6 }, (_, i) => g(1, 1, 0.1 + i * 0.01))];
    const recientesGraves = [...Array.from({ length: 6 }, (_, i) => g(1, 4, 0.1 + i * 0.01)), ...Array.from({ length: 6 }, (_, i) => g(1, 1, 12 + (i % 2) * 0.1))];
    expect(de(recientesGraves, 1)!.score).toBeGreaterThan(de(viejosGraves, 1)!.score);
  });
});

describe("prior global", () => {
  const porColonia = (col: number, grav: Gravedad) =>
    Array.from({ length: 12 }, (_, i) => g(col, grav, (i % 4) + 0.2));
  it("queda acotado a [priorMin, priorMax] pase lo que pase", () => {
    const mk = (recortadaV: number) => ({ coloniaId: 1, recortada: recortadaV, mediana: 2, nEff: 10, diasCorrob: 3, redesSem: 9, maxDia: 0.3 });
    expect(priorGlobal([mk(4)])).toBe(PARAMS.priorMax);
    expect(priorGlobal([mk(1)])).toBe(PARAMS.priorMin);
    expect(priorGlobal([mk(2.2)])).toBeCloseTo(2.2, 9);
  });
  it("sin colonias reales con evidencia suficiente usa el valor por defecto", () => {
    expect(priorGlobal([])).toBe(PARAMS.priorDef);
    expect(priorGlobal([{ coloniaId: 1, recortada: 4, mediana: 4, nEff: 5.9, diasCorrob: 3, redesSem: 9, maxDia: 0.3 }])).toBe(PARAMS.priorDef);
  });
  it("colonias reales graves y numerosas sí suben el prior hasta el tope, y se nota en una colonia con poca evidencia", () => {
    const poca = vecinos(1, 2, 3, 3);
    const aislada = de(poca, 1)!;
    const rodeada = de([...poca, ...porColonia(2, 4), ...porColonia(3, 4)], 1)!;
    expect(rodeada.score).toBeGreaterThan(aislada.score);
    // pero nunca más de lo que permite el prior acotado: lambda*r + (1-lambda)*priorMax
    const lambda = rodeada.nEff / (rodeada.nEff + PARAMS.C);
    expect(rodeada.score).toBeLessThanOrEqual(lambda * rodeada.recortada + (1 - lambda) * PARAMS.priorMax + 1e-9);
  });
  it("un atacante que inunda UNA colonia no mueve el prior fuera del rango acotado", () => {
    const victima = vecinos(1, 2, 3, 3);
    const ataque = Array.from({ length: 200 }, (_, i) => g(2, 4, (i % 5) + 0.1));
    const x = de([...victima, ...ataque], 1)!;
    const lambda = x.nEff / (x.nEff + PARAMS.C);
    expect(x.score).toBeLessThanOrEqual(lambda * x.recortada + (1 - lambda) * PARAMS.priorMax + 1e-9);
  });
});

describe("contracción bayesiana", () => {
  it("con poca evidencia el score se queda entre la media recortada y el prior", () => {
    const x = de(vecinos(1, 4, 3, 3), 1)!;
    expect(x.score).toBeLessThan(x.recortada);
    expect(x.score).toBeGreaterThan(PARAMS.priorDef);
    const lambda = x.nEff / (x.nEff + PARAMS.C);
    expect(x.score).toBeCloseTo(lambda * 4 + (1 - lambda) * PARAMS.priorDef, 9);
  });
});

// --- confianza y contrato --------------------------------------------------------------------

describe("confianzaDe", () => {
  const ok = { nEff: 20, diasCorrob: 4, redesSem: 10, maxDia: 0.3, recortada: 3, mediana: 3 };
  it("alta cuando todo se cumple", () => expect(confianzaDe(ok)).toBe("alta"));
  it("baja con poca evidencia, pocos días corroborantes o un pico de un solo día", () => {
    expect(confianzaDe({ ...ok, nEff: PARAMS.confianza.mediaNEff - 0.01 })).toBe("baja");
    expect(confianzaDe({ ...ok, diasCorrob: 1 })).toBe("baja");
    expect(confianzaDe({ ...ok, maxDia: 0.61 })).toBe("baja");
  });
  it("media si falta diversidad de redes, días para 'alta', n_eff para 'alta' o hay discrepancia", () => {
    expect(confianzaDe({ ...ok, nEff: 8 })).toBe("media");
    expect(confianzaDe({ ...ok, redesSem: 5 })).toBe("media");
    expect(confianzaDe({ ...ok, diasCorrob: 2 })).toBe("media");
    expect(confianzaDe({ ...ok, recortada: 3.9, mediana: 2 })).toBe("media");
  });
  it("es monótona en nEff (más evidencia nunca baja la confianza), con el resto fijo", () => {
    const orden = { baja: 0, media: 1, alta: 2 };
    let previo = 0;
    for (let n = 0; n <= 30; n += 0.5) {
      const c = orden[confianzaDe({ ...ok, nEff: n })];
      expect(c).toBeGreaterThanOrEqual(previo);
      previo = c;
    }
  });
});

describe("paraContrato", () => {
  it("expone exactamente los campos del contrato y no filtra diagnóstico", () => {
    const x = de(vecinos(1, 3, 6, 3), 1)!;
    const c = paraContrato(x);
    expect(Object.keys(c).sort()).toEqual(["confianza", "id", "n", "n_huellas", "nivel", "score", "ultimo"]);
    expect(c.score).toBe(Number(x.score.toFixed(3)));
    expect(Number.isInteger(c.nivel)).toBe(true);
    expect(Number.isInteger(c.n_huellas)).toBe(true);
    expect(new Date(c.ultimo).toISOString()).toBe(c.ultimo);
    expect(JSON.stringify(c)).not.toMatch(/nEff|recortada|mediana|red/);
  });
});
