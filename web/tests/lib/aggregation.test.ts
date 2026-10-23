/**
 * Propiedades de la agregación (función pura `agregar`). Se usan generadores pseudoaleatorios con
 * semilla fija (sin dependencias): si una propiedad falla, el mensaje indica la semilla para reproducirla.
 */
import { describe, expect, it } from "vitest";
import {
  PARAMS, agregar, confianzaDe, nivelDe, paraContrato, recortada, serieDiaria, type Grupo, type ResumenColonia,
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

type Gravedad = 0 | 1 | 2 | 3 | 4;
let contador = 0;
const dia = (edad: number) => `2026-10-${String(Math.max(1, 8 - Math.floor(edad))).padStart(2, "0")}`;

/** Un grupo de `n` reportes de una red propia (cada red distinta = vecinos distintos). */
function g(col: number, gravedad: Gravedad, edadDias = 0.2, o: Partial<Grupo> = {}): Grupo {
  const red = o.red ?? `r${contador++}`;
  return { coloniaId: col, dia: dia(edadDias), red, redSem: o.redSem ?? red, gravedad, n: 1, nRapidos: 0, edadDias, ...o };
}
const ULTIMO = "2026-10-08";
/** Resumen: cada fila es una huella distinta salvo que se pase `huellas`. */
function resumen(gs: Grupo[], huellas?: Map<number, number>): Map<number, ResumenColonia> {
  const m = new Map<number, ResumenColonia>();
  for (const x of gs) {
    const r = m.get(x.coloniaId) ?? { n: 0, nHuellas: 0, ultimoDia: ULTIMO };
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
        gravedad: Math.floor(rng() * 5) as Gravedad, n, nRapidos: Math.floor(rng() * (n + 1)), edadDias: edad,
      });
    }
  }
  return out;
}

const SEMILLAS = Array.from({ length: 300 }, (_, i) => i + 1);

// --- acotación -------------------------------------------------------------------------------

describe("acotación 0-4", () => {
  it("con escenarios aleatorios, score y nivel siempre quedan en rango y son finitos", () => {
    let publicadas = 0;
    for (const s of SEMILLAS) {
      for (const x of calc(escenario(prng(s)))) {
        publicadas++;
        expect(Number.isFinite(x.score), `semilla ${s}`).toBe(true);
        expect(x.score, `semilla ${s}`).toBeGreaterThanOrEqual(0);
        expect(x.score, `semilla ${s}`).toBeLessThanOrEqual(4);
        expect([0, 1, 2, 3, 4]).toContain(x.nivel);
        expect(x.nivel).toBe(Math.min(4, Math.max(0, Math.round(x.score))));
        expect(["baja", "media", "alta"]).toContain(x.confianza);
        expect(x.nBruta).toBeGreaterThanOrEqual(PARAMS.minEvidencia);
        // la evidencia decaída nunca supera a la bruta
        expect(x.nEff).toBeLessThanOrEqual(x.nBruta + 1e-9);
      }
    }
    // la prueba es útil solo si realmente se publicó algo
    expect(publicadas).toBeGreaterThan(100);
  });
  it("todos dicen lo mismo -> el score es exactamente ese nivel (sin prior que lo mueva)", () => {
    for (const grav of [0, 1, 2, 3, 4] as Gravedad[]) {
      const x = de(vecinos(1, grav, 30), 1)!;
      expect(x.score, `gravedad ${grav}`).toBeCloseTo(grav, 9);
      expect(x.nivel).toBe(grav);
    }
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
      if (base[i].gravedad === 0) continue;
      const bajado = base.map((x, j) => (j === i ? { ...x, gravedad: (x.gravedad - 1) as Gravedad } : x));
      const antes = calc(base);
      for (const b of calc(bajado)) {
        const a = antes.find((x) => x.id === b.id)!;
        expect(b.score, `semilla ${s}`).toBeLessThanOrEqual(a.score + 1e-9);
      }
    }
  });
  it("una colonia con reportes más graves puntúa más alto que otra equivalente con reportes leves", () => {
    for (const [leve, grave] of [[0, 1], [0, 4], [1, 2], [1, 3], [2, 3], [2, 4], [1, 4], [3, 4]] as [Gravedad, Gravedad][]) {
      const gs = [...vecinos(1, leve, 12), ...vecinos(2, grave, 12)];
      const r = calc(gs);
      expect(r.find((x) => x.id === 2)!.score, `${leve} vs ${grave}`).toBeGreaterThan(r.find((x) => x.id === 1)!.score);
    }
  });
  it("más evidencia coherente no cambia el score: lo que sube es la confianza", () => {
    const poca = de(vecinos(1, 4, 3, 3), 1)!;
    const mucha = de(vecinos(1, 4, 30, 3), 1)!;
    expect(mucha.score).toBeCloseTo(poca.score, 9);
    expect(poca.confianza).toBe("baja");
    expect(mucha.confianza).not.toBe("baja");
  });
});

// --- mínimo de huellas y evidencia -----------------------------------------------------------

describe("mínimo publicable (evidencia efectiva y huellas)", () => {
  const uno = () => vecinos(1, 3, 1, 1);

  it("el mínimo es un reporte completo (desde v2)", () => {
    expect(PARAMS.minEvidencia).toBe(1);
    expect(PARAMS.minHuellas).toBe(1);
    expect(calc(uno())).toHaveLength(1);
  });
  it("un reporte aislado se pinta con el nivel que dice, con confianza baja (v3; en v2 un «leve» salía «moderada»)", () => {
    for (const grav of [0, 1, 2, 3, 4] as Gravedad[]) {
      const [s] = calc(vecinos(1, grav, 1, 1));
      expect(s.confianza).toBe("baja");
      expect(s.nivel, `gravedad ${grav}`).toBe(grav);
    }
  });
  it("1, 3, 6 y 12 críticos: el nivel es crítico siempre y la confianza nunca baja al sumar evidencia", () => {
    const orden = { baja: 0, media: 1, alta: 2 } as const;
    const xs = [1, 3, 6, 12].map((n) => calc(vecinos(1, 4, n, Math.min(n, 4)))[0]);
    for (const x of xs) expect(x.nivel).toBe(4);
    for (let i = 1; i < xs.length; i++) expect(orden[xs[i].confianza]).toBeGreaterThanOrEqual(orden[xs[i - 1].confianza]);
    expect(xs[3].confianza).not.toBe("baja");
  });
  it("la huella no es un requisito aparte: basta con que el resumen exista y tenga al menos una", () => {
    expect(calc(uno(), new Map([[1, 1]]))).toHaveLength(1);
    expect(calc(uno(), new Map([[1, PARAMS.minHuellas]]))).toHaveLength(1);
  });
  it("un reporte enviado en menos de 5 s pesa 0.5 y no alcanza por sí solo; dos sí", () => {
    const rapido = [g(1, 4, 0, { nRapidos: 1 })];
    expect(calc(rapido, new Map([[1, 1]]))).toHaveLength(0);
    expect(calc([...rapido, g(1, 4, 0, { nRapidos: 1 })], new Map([[1, 2]]))).toHaveLength(1);
  });
  it("3 reportes de la misma red el mismo día pesan poco, pero ya publican con confianza baja", () => {
    const gs = [g(1, 4, 0.2, { red: "misma", n: 3 })];
    const [s] = calc(gs, new Map([[1, 3]]));
    expect(s.nEff).toBeLessThan(3);
    expect(s.confianza).toBe("baja");
  });
  it("un resumen ausente para la colonia impide publicarla", () => {
    expect(agregar(uno(), new Map())).toEqual([]);
  });
});

// --- recorte (winsorización/media recortada) -------------------------------------------------

describe("recorte de extremos", () => {
  it("recortada: invariante a escala, acotada por los valores presentes y entre 0 y 4", () => {
    for (const s of SEMILLAS) {
      const rng = prng(s * 31);
      const bins = [0, 0, 0, 0, 0].map(() => (rng() < 0.3 ? 0 : rng() * 10));
      if (bins.every((b) => b === 0)) continue;
      const r = recortada(bins)!;
      const factor = 0.1 + rng() * 50;
      const r2 = recortada(bins.map((b) => b * factor))!;
      expect(r2.media, `semilla ${s}`).toBeCloseTo(r.media, 9);
      expect(r2.mediana).toBe(r.mediana);
      const presentes = bins.flatMap((b, i) => (b > 0 ? [i] : []));
      expect(r.media).toBeGreaterThanOrEqual(Math.min(...presentes) - 1e-9);
      expect(r.media).toBeLessThanOrEqual(Math.max(...presentes) + 1e-9);
    }
  });
  it("alfa = 0 es la media ordinaria", () => {
    const bins = [4, 3, 5, 2, 7];
    const media = (0 * 4 + 1 * 3 + 2 * 5 + 3 * 2 + 4 * 7) / 21;
    // `alfa` está tipado como el literal 0.2 (por `as const` en PARAMS): se fuerza el tipo en la prueba
    expect(recortada(bins, 0 as never)!.media).toBeCloseTo(media, 9);
  });
  it("hasta ~alfa del peso en un extremo no mueve la media recortada", () => {
    // 10 reportes de gravedad 2; añadir 2 de gravedad 4 (2/12 = 16.7 % < 20 %): sin efecto
    expect(recortada([0, 0, 10, 0, 2])!.media).toBeCloseTo(2, 9);
    expect(recortada([2, 0, 10, 0, 0])!.media).toBeCloseTo(2, 9);
    // 2.5 de 12.5 = 20 % exacto: sigue sin efecto
    expect(recortada([0, 0, 10, 0, 2.5])!.media).toBeCloseTo(2, 9);
  });
  it("más allá de alfa el extremo sí influye, pero de forma acotada (no llega al valor del atacante)", () => {
    const r = recortada([0, 0, 10, 0, 6])!.media;
    expect(r).toBeGreaterThan(2);
    expect(r).toBeLessThan(3);
    // y crece con el volumen sin superar 4
    const masivo = recortada([0, 0, 10, 0, 1000])!.media;
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
    // y como el score es la media recortada, tampoco cambia
    expect(atacado.score).toBeCloseTo(base.score, 9);
  });
  it("un atacante con 1 reporte en 30 no saca una colonia de 1 del nivel 1", () => {
    const x = de([...vecinos(1, 1, 29, 5), g(1, 4, 0.2)], 1)!;
    expect(x.nivel).toBe(1);
  });
  it("sin peso -> null", () => {
    expect(recortada([0, 0, 0, 0, 0])).toBeNull();
  });
});

// --- topes por red y decaimiento --------------------------------------------------------------

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
    // en peso sin decaer (nEff además decae con la edad del reporte)
    expect(lentos.nBruta - rapidos.nBruta).toBeCloseTo(1 - PARAMS.fRapido, 9);
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

describe("decaimiento de la evidencia (v3)", () => {
  it("n_eff es la suma de pesos YA decaídos: un reporte de hace 7 días aporta 0.5", () => {
    const x = de([g(1, 3, 7)], 1)!;
    expect(x.nEff).toBeCloseTo(0.5, 9);
    expect(x.nBruta).toBeCloseTo(1, 9);
  });
  it("un reporte viejo sigue publicando la colonia (se publica con la evidencia sin decaer, sin ventana desde v5)", () => {
    expect(calc([g(1, 3, 13.5)])).toHaveLength(1);
    // un reporte de hace 60 días sigue pintando la colonia con su nivel, con confianza baja
    const [x] = calc([g(1, 3, 60)]);
    expect(x.nivel).toBe(3);
    expect(x.confianza).toBe("baja");
  });
  it("muchos reportes de hace casi dos semanas ya no dan más que confianza baja (en v2 seguían en media)", () => {
    const viejos = Array.from({ length: 8 }, (_, i) => g(1, 4, 12.5 + (i % 4) * 0.2, { dia: dia(12.5 + (i % 4)) }));
    const recientes = Array.from({ length: 8 }, (_, i) => g(1, 4, (i % 4) + 0.2));
    expect(de(viejos, 1)!.confianza).toBe("baja");
    expect(de(recientes, 1)!.confianza).not.toBe("baja");
    // el color no cambia por la edad si todos dicen lo mismo
    expect(de(viejos, 1)!.nivel).toBe(4);
  });
});

describe("sin ventana (v5): lo viejo cuenta, lo reciente manda", () => {
  it("con reportes recientes, un historial viejo casi no mueve el color", () => {
    const viejos = Array.from({ length: 10 }, (_, i) => g(1, 4, 60 + i));
    const recientes = Array.from({ length: 6 }, (_, i) => g(1, 0, i * 0.5 + 0.1));
    expect(de([...viejos, ...recientes], 1)!.nivel).toBe(0);
  });
  it("un pico de hoy sobre un historial largo sigue siendo un pico (maxDia sobre la evidencia decaída)", () => {
    // 2 meses de reportes honestos (1 al día) y hoy 20 falsos desde 20 redes: sin decaer el pico sería 25 % (no
    // saltaría la alarma del 60 %); sobre la evidencia decaída es ~67 %
    // claves de día propias: el helper `dia` junta todo lo de más de 7 días en el mismo día
    const historial = Array.from({ length: 60 }, (_, i) => g(1, 1, i + 1, { dia: `hist-${i + 1}` }));
    const pico = Array.from({ length: 20 }, () => g(1, 4, 0.1, { dia: "hoy" }));
    const x = de([...historial, ...pico], 1)!;
    expect(x.maxDia).toBeGreaterThan(PARAMS.confianza.maxDia);
    expect(x.confianza).toBe("baja");
  });
});

describe("nivel 0: agua limpia", () => {
  it("nivelDe redondea a 0-4", () => {
    expect(nivelDe(0)).toBe(0);
    expect(nivelDe(0.49)).toBe(0);
    expect(nivelDe(0.5)).toBe(1);
    expect(nivelDe(4)).toBe(4);
  });
  it("vecinos que dicen «limpia» en varios días: nivel 0 con confianza alta", () => {
    const x = de(vecinos(1, 0, 12, 4), 1)!;
    expect(x.nivel).toBe(0);
    expect(x.confianza).toBe("alta");
  });
  it("mitad limpia y mitad grave: queda en medio y la confianza no pasa de media (situación desigual)", () => {
    const x = de([...vecinos(1, 0, 10, 4), ...vecinos(1, 3, 10, 4)], 1)!;
    expect(x.nivel).toBeGreaterThanOrEqual(1);
    expect(x.nivel).toBeLessThanOrEqual(2);
    expect(x.confianza).not.toBe("alta");
  });
  it("cuando la crisis se resuelve, los reportes nuevos de «limpia» bajan el nivel antes de que caduquen los viejos", () => {
    const viejos = Array.from({ length: 8 }, (_, i) => g(1, 4, 9 + (i % 3), { dia: dia(9 + (i % 3)) }));
    const nuevos = Array.from({ length: 8 }, (_, i) => g(1, 0, (i % 3) + 0.2));
    expect(de(viejos, 1)!.nivel).toBe(4);
    expect(de([...viejos, ...nuevos], 1)!.nivel).toBeLessThanOrEqual(1);
  });
});

describe("serieDiaria", () => {
  it("un punto por día, ordenado, con el conteo crudo y la media del día", () => {
    const gs = [g(1, 2, 0.2), g(1, 4, 0.2), g(1, 0, 3.2), g(1, 0, 3.2)];
    const s = serieDiaria(gs);
    expect(s.map((p) => p.dia)).toEqual([dia(3.2), dia(0.2)]);
    expect(s[0]).toMatchObject({ n: 2, score: 0 });
    expect(s[1]).toMatchObject({ n: 2, score: 3 });
  });
  it("aplica los mismos topes por red que el score: 200 reportes de una red no dominan el día", () => {
    const honestos = Array.from({ length: 6 }, () => g(1, 1, 0.2));
    const ataque = g(1, 4, 0.2, { red: "atacante", redSem: "atacante", n: 200 });
    const [p] = serieDiaria([...honestos, ataque]);
    expect(p.n).toBe(206);
    expect(p.score).toBeLessThan(1.5);
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
    // solo el día (hora de Guadalajara), nunca la hora: con un reporte, la hora lo delataría
    expect(c.ultimo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(c)).not.toMatch(/nEff|recortada|mediana|red/);
  });
});
