/**
 * Simula los escenarios de ataque de docs/research/anti-abuso.md contra la ruta REAL POST /api/reportes
 * (handler importado, con Request reales: Content-Type, Origin, X-Forwarded-For, User-Agent) y mide el efecto
 * en el score publicado, comparándolo con el método anterior (promedio ponderado por decaimiento, 3 reportes mínimo).
 *
 * Uso (BASE DESECHABLE: crea y borra colonias 'SIM ...'; nunca la apuntes a datos reales):
 *   DATABASE_URL=postgres://.../agua_seg pnpm exec tsx scripts/simular-ataques.ts --confirmo-base-desechable [--json]
 *   (opcional) --solo=S1,S3   para correr solo algunos escenarios
 *
 * Limitaciones que el reporte declara: (1) las peticiones pasan por el handler, no por la red, y el reloj es el
 * real, así que un "ataque lento" de varios días solo se puede modelar con el agregador puro (escenario S11);
 * (2) los umbrales son valores iniciales sin calibrar con tráfico real.
 */
import { Pool } from "pg";
import { agregar, calcularScores, type Grupo } from "../lib/aggregation";
import { moderar } from "../lib/moderation";

if (!process.argv.includes("--confirmo-base-desechable")) {
  console.error("Esta simulación escribe y borra datos. Corre con --confirmo-base-desechable sobre una base de pruebas.");
  process.exit(1);
}
const url = process.env.DATABASE_URL ?? "";
if (!url || /\/agua_zmg(\?|$)/.test(url)) {
  console.error("DATABASE_URL falta o apunta a agua_zmg (la base de desarrollo). Usa una base propia.");
  process.exit(1);
}
// La simulación mide las defensas reales: nunca con los límites relajados de desarrollo
delete process.env.ANTIABUSO_RELAJADO;
delete process.env.MODO_ATAQUE;
process.env.TRUSTED_PROXY_HOPS = "1";

const solo = process.argv.find((a) => a.startsWith("--solo="))?.slice(7).split(",");
const salidaJson = process.argv.includes("--json");

type ResultadoEscenario = {
  id: string;
  titulo: string;
  http: Record<string, number>;
  filas: { visibles: number; revision: number; sospechosos: number };
  antes: string;
  despuesV1: string;
  despuesAnterior: string;
  nota: string;
};
const resultados: ResultadoEscenario[] = [];

const UAS = [
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
];
const uaRotando = (i: number) => `Mozilla/5.0 (Linux; Android 14; SIM-${i}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.${i}.0 Mobile Safari/537.36`;
const ipRed = (i: number) => `10.${(i >> 8) & 255}.${i & 255}.7`; // /24 distinto por i
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const azar = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

async function main() {
  // Importar la ruta y la conexión DESPUÉS de fijar el entorno
  const { pool } = await import("../lib/db");
  const { POST } = await import("../app/api/reportes/route");
  const db: Pool = pool;

  let contadorColonia = 0;
  const coloniasCreadas: number[] = [];

  async function nuevaColonia(nombre: string): Promise<number> {
    contadorColonia++;
    const w = -103.35 + contadorColonia * 0.01;
    const wkt = `MULTIPOLYGON(((${w} 20.65,${w + 0.008} 20.65,${w + 0.008} 20.658,${w} 20.658,${w} 20.65)))`;
    const { rows } = await db.query(
      `INSERT INTO colonias (nombre, municipio, geom) VALUES ($1, 'SIM', ST_GeomFromText($2, 4326)) RETURNING id`,
      [`SIM ${nombre}`, wkt],
    );
    coloniasCreadas.push(rows[0].id);
    return rows[0].id;
  }

  /** Vecinos honestos de fondo: redes y huellas distintas, repartidos en `dias` días, ya anteriores a la última hora. */
  async function fondoHonesto(colonia: number, gravedad: number, k: number, dias: number) {
    for (let i = 0; i < k; i++) {
      await db.query(
        `INSERT INTO reportes (colonia_id, gravedad, huella, red_hash, red_sem, ua_familia, tiempo_ms, canal, creado_en, dia)
         VALUES ($1, $2, $3, $4, $4, 'chrome-android', $5, 'web',
                 now() - make_interval(hours => $6::int), (now() - make_interval(hours => $6::int))::date)`,
        [colonia, gravedad, `simh-${colonia}-${i}`, `simr-${colonia}-${i}`, azar(8000, 40000), 3 + (i % dias) * 24 + azar(0, 5)],
      );
    }
  }

  async function scoreV1(colonia: number): Promise<string> {
    const s = (await calcularScores(db)).find((x) => x.id === colonia);
    return s ? `${s.score.toFixed(2)} (color ${s.nivel}, confianza ${s.confianza}, n=${s.n}, huellas=${s.nHuellas})` : "no publicable";
  }

  /** Método anterior: promedio con decaimiento de TODOS los reportes de 14 días, publicable con >= 3. */
  async function scoreAnterior(colonia: number): Promise<string> {
    const { rows } = await db.query(
      `SELECT SUM(gravedad * w) / SUM(w) AS score, COUNT(*)::int AS n FROM (
         SELECT gravedad, exp(-extract(epoch FROM (now() - creado_en)) / 86400.0 / 7 * ln(2)) AS w
           FROM reportes WHERE colonia_id = $1 AND creado_en > now() - interval '14 days') r
       HAVING COUNT(*) >= 3`,
      [colonia],
    );
    if (!rows.length) return "no publicable";
    const sc = Number(rows[0].score);
    return `${sc.toFixed(2)} (color ${Math.min(4, Math.max(0, Math.round(sc)))}, n=${rows[0].n})`;
  }

  async function filasDespuesDe(colonia: number, idBase: number) {
    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE estado = 'visible' AND NOT sospechoso)::int AS visibles,
              count(*) FILTER (WHERE estado = 'revision')::int AS revision,
              count(*) FILTER (WHERE sospechoso)::int AS sospechosos
         FROM reportes WHERE colonia_id = $1 AND id > $2`,
      [colonia, idBase],
    );
    return rows[0] as { visibles: number; revision: number; sospechosos: number };
  }
  const idMax = async () => Number((await db.query("SELECT COALESCE(max(id), 0) AS m FROM reportes")).rows[0].m);

  type Envio = { ip: string; ua: string; body: Record<string, unknown>; extra?: Record<string, string>; sinCabeceras?: boolean };
  async function enviar(e: Envio): Promise<number> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-forwarded-for": e.ip,
      "user-agent": e.ua,
      ...(e.sinCabeceras ? {} : { "sec-fetch-site": "same-origin", origin: "http://localhost", host: "localhost" }),
      ...(e.extra ?? {}),
    };
    const res = await POST(new Request("http://localhost/api/reportes", { method: "POST", headers, body: JSON.stringify(e.body) }));
    return res.status;
  }
  const cuenta = (codigos: number[]) => {
    const h: Record<string, number> = {};
    for (const c of codigos) h[c] = (h[c] ?? 0) + 1;
    return h;
  };

  async function limpiarEstado() {
    await db.query("DELETE FROM rate_limits");
  }

  async function escenario(
    id: string,
    titulo: string,
    nota: string,
    fondo: { gravedad: number; k: number; dias: number } | null,
    ataque: (colonia: number) => Promise<number[]>,
    despues?: (colonia: number) => Promise<string | void>,
  ) {
    if (solo && !solo.includes(id)) return;
    await limpiarEstado();
    const col = await nuevaColonia(`${id} ${titulo}`.slice(0, 60));
    if (fondo) await fondoHonesto(col, fondo.gravedad, fondo.k, fondo.dias);
    const antes = await scoreV1(col);
    const base = await idMax();
    const codigos = await ataque(col);
    const filas = await filasDespuesDe(col, base);
    const despuesV1 = await scoreV1(col);
    const despuesAnterior = await scoreAnterior(col);
    const extra = despues ? await despues(col) : undefined; // p. ej. un moderador humano actúa DESPUÉS de medir
    resultados.push({ id, titulo, http: cuenta(codigos), filas, antes, despuesV1, despuesAnterior, nota: [nota, extra].filter(Boolean).join(" ") });
  }

  try {
    // S1 -------------------------------------------------------------------------------------------
    await escenario(
      "S1", "Brigadeo de 200 reportes 'críticos' desde una red rotando User-Agent",
      "Una colonia tranquila (6 vecinos 'leve'). Un atacante con una IP rota 200 User-Agent y declara tiempos plausibles.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 200; i++) {
          out.push(await enviar({ ip: "10.9.9.7", ua: uaRotando(i), body: { colonia_id: c, gravedad: 4, sintomas: [], tiempo_ms: azar(9000, 30000), hp: "" } }));
        }
        return out;
      },
    );

    // S2 -------------------------------------------------------------------------------------------
    await escenario(
      "S2", "Mismo dispositivo reenviando 200 veces",
      "Misma IP y User-Agent: una sola huella; el cupo por hora y la restricción única lo reducen a un reporte.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 200; i++) out.push(await enviar({ ip: "10.8.8.7", ua: UAS[0], body: { colonia_id: c, gravedad: 4, tiempo_ms: 12000 } }));
        return out;
      },
    );

    // S3 -------------------------------------------------------------------------------------------
    await escenario(
      "S3", "Ráfaga de 120 reportes desde 120 redes, mismo navegador y formulario rápido",
      "Botnet torpe: IP distinta en cada envío, pero un solo tipo de cliente y 3 s de formulario.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 120; i++) {
          out.push(await enviar({ ip: ipRed(100 + i), ua: UAS[0], body: { colonia_id: c, gravedad: 4, tiempo_ms: 3000, hp: "" } }));
          await dormir(azar(0, 15));
        }
        return out;
      },
    );

    // S4 -------------------------------------------------------------------------------------------
    await escenario(
      "S4", "100 bots con el honeypot lleno (100 IPs distintas)",
      "Responden 201 como un reporte normal, pero se guardan marcados y no cuentan.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 100; i++) {
          out.push(await enviar({ ip: ipRed(300 + i), ua: UAS[i % UAS.length], body: { colonia_id: c, gravedad: 4, hp: "http://spam.example", tiempo_ms: azar(9000, 30000) } }));
        }
        return out;
      },
    );

    // S5 -------------------------------------------------------------------------------------------
    await escenario(
      "S5", "100 bots que envían el formulario en 200 ms",
      "tiempo_ms < 2 s: mismo tratamiento que el honeypot.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 100; i++) {
          out.push(await enviar({ ip: ipRed(500 + i), ua: UAS[i % UAS.length], body: { colonia_id: c, gravedad: 4, tiempo_ms: 200 } }));
        }
        return out;
      },
    );

    // S6 -------------------------------------------------------------------------------------------
    await escenario(
      "S6", "Atacante sofisticado: 60 redes, navegadores variados, tiempos humanos",
      "LÍMITE CONOCIDO (docs/research/anti-abuso.md §12): se parece a 60 vecinos reales; solo una persona o datos externos lo distinguen.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 60; i++) {
          out.push(await enviar({ ip: ipRed(700 + i), ua: UAS[i % UAS.length], body: { colonia_id: c, gravedad: 4, tiempo_ms: azar(8000, 60000), hp: "" } }));
          await dormir(azar(0, 40));
        }
        return out;
      },
      async (c) => {
        // Un moderador humano compara con la colonia vecina/datos externos y oculta lo que no tiene sentido
        const { rows } = await db.query("SELECT id FROM reportes WHERE colonia_id = $1 AND gravedad = 4", [c]);
        await moderar(db, rows.map((r) => Number(r.id)), "ocultar", "mod:simulacion", "simulación: ocultar ataque confirmado por revisión humana", "rafaga_confirmada");
        return `Tras ocultarlos un moderador (acción humana, queda en bitácora): v1 = ${await scoreV1(c)}.`;
      },
    );

    // S7 -------------------------------------------------------------------------------------------
    await escenario(
      "S7", "Crisis real: 40 vecinos distintos reportan 'grave' en una hora",
      "Control de falsos positivos: una ráfaga orgánica NO debe mandarse a revisión.",
      null,
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 40; i++) {
          out.push(await enviar({
            ip: ipRed(900 + i),
            ua: UAS[i % UAS.length],
            body: { colonia_id: c, gravedad: i % 5 === 0 ? 4 : 3, sintomas: i % 2 ? ["Mal olor"] : [], tiempo_ms: azar(8000, 70000), hp: "" },
          }));
          await dormir(azar(0, 40));
        }
        return out;
      },
    );

    // S8 -------------------------------------------------------------------------------------------
    await escenario(
      "S8", "Carrera: 9 colonias en paralelo con la misma huella",
      "El cupo (3 colonias/día) se aplica bajo candado; antes se saltaba (8 de 9 pasaban).",
      null,
      async (c) => {
        const otras: number[] = [c];
        for (let i = 0; i < 8; i++) otras.push(await nuevaColonia(`S8 extra ${i}`));
        const out = await Promise.all(otras.map((id) => enviar({ ip: "10.7.7.7", ua: UAS[1], body: { colonia_id: id, gravedad: 3, tiempo_ms: 15000 } })));
        return out;
      },
    );

    // S9 -------------------------------------------------------------------------------------------
    await escenario(
      "S9", "Envío desde otro sitio web / formas inválidas",
      "text/plain (415), Origin ajeno (403), Sec-Fetch-Site cross-site (403), cuerpo de 5 KB (413), JSON roto (400).",
      null,
      async (c) => {
        const body = { colonia_id: c, gravedad: 4, tiempo_ms: 15000 };
        const ok = { "user-agent": UAS[2], "x-forwarded-for": "10.6.6.7" };
        const pedir = async (headers: Record<string, string>, cuerpo: string) =>
          (await POST(new Request("http://localhost/api/reportes", { method: "POST", headers: { ...ok, ...headers }, body: cuerpo }))).status;
        return [
          await pedir({ "content-type": "text/plain" }, JSON.stringify(body)),
          await pedir({ "content-type": "application/json", origin: "https://sitio-malo.example", host: "localhost" }, JSON.stringify(body)),
          await pedir({ "content-type": "application/json", "sec-fetch-site": "cross-site" }, JSON.stringify(body)),
          await pedir({ "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "http://localhost", host: "localhost" }, JSON.stringify({ ...body, comentario: "x".repeat(5000) })),
          await pedir({ "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "http://localhost", host: "localhost" }, "{roto"),
        ];
      },
    );

    // S10 ------------------------------------------------------------------------------------------
    await escenario(
      "S10", "Falsificar X-Forwarded-For para aparentar 30 redes",
      "El cliente escribe un valor distinto a la izquierda, pero el proxy de confianza añade la IP real a la derecha: se cuenta la de la derecha.",
      { gravedad: 1, k: 6, dias: 3 },
      async (c) => {
        const out: number[] = [];
        for (let i = 0; i < 30; i++) {
          out.push(await enviar({ ip: `${ipRed(1200 + i)}, 10.5.5.7`, ua: uaRotando(i), body: { colonia_id: c, gravedad: 4, tiempo_ms: azar(9000, 30000) } }));
        }
        return out;
      },
    );

    // S11 (modelo con el agregador puro) -----------------------------------------------------------
    if (!solo || solo.includes("S11")) {
      const dia = (e: number) => `2026-10-${String(8 - Math.floor(e)).padStart(2, "0")}`;
      const honestos: Grupo[] = Array.from({ length: 6 }, (_, i) => ({
        coloniaId: 1, dia: dia((i % 3) + 0.3), red: `h${i}`, redSem: `h${i}`, gravedad: 1, n: 1, nRapidos: 0, edadDias: (i % 3) + 0.3,
      }));
      const resumenDe = (gs: Grupo[]) => new Map([[1, { n: gs.reduce((a, g) => a + g.n, 0), nHuellas: gs.reduce((a, g) => a + g.n, 0), ultimoMs: Date.now() }]]);
      const fmt = (gs: Grupo[]) => {
        const s = agregar(gs, resumenDe(gs))[0];
        return s ? `${s.score.toFixed(2)} (color ${s.nivel}, confianza ${s.confianza}, n_eff=${s.nEff.toFixed(1)})` : "no publicable";
      };
      const antes = fmt(honestos);
      // 1 falso 'crítico' por día, 14 días, desde 14 redes diarias que comparten la misma red semanal
      const lentoMismaRed: Grupo[] = Array.from({ length: 14 }, (_, d) => ({
        coloniaId: 1, dia: dia(d + 0.1), red: `a${d}`, redSem: "ataque-semana", gravedad: 4, n: 1, nRapidos: 0, edadDias: d + 0.1,
      }));
      // 1 falso por día durante 14 días desde 14 redes TOTALMENTE distintas
      const lentoRedesDistintas: Grupo[] = lentoMismaRed.map((g, i) => ({ ...g, redSem: `b${i}` }));
      const sinProteccion = (extra: Grupo[]) => {
        const todos = [...honestos, ...extra];
        const w = (e: number) => Math.pow(2, -e / 7);
        const num = todos.reduce((a, g) => a + g.gravedad * g.n * w(g.edadDias), 0);
        const den = todos.reduce((a, g) => a + g.n * w(g.edadDias), 0);
        return `${(num / den).toFixed(2)} (color ${Math.round(num / den)})`;
      };
      resultados.push({
        id: "S11a", titulo: "Ataque lento (MODELO): 1 falso 'crítico' por día durante 14 días, misma red semanal",
        http: {}, filas: { visibles: 14, revision: 0, sospechosos: 0 },
        antes, despuesV1: fmt([...honestos, ...lentoMismaRed]), despuesAnterior: sinProteccion(lentoMismaRed),
        nota: "Modelo con el agregador puro (no pasa por HTTP). El tope semanal por red limita la influencia.",
      });
      resultados.push({
        id: "S11b", titulo: "Ataque lento (MODELO): 1 falso 'crítico' por día durante 14 días, 14 redes distintas",
        http: {}, filas: { visibles: 14, revision: 0, sospechosos: 0 },
        antes, despuesV1: fmt([...honestos, ...lentoRedesDistintas]), despuesAnterior: sinProteccion(lentoRedesDistintas),
        nota: "LÍMITE CONOCIDO: indistinguible de 14 vecinos reales en 14 días. Modelo, no pasa por HTTP.",
      });
    }
  } finally {
    if (coloniasCreadas.length) await db.query("DELETE FROM colonias WHERE id = ANY($1::int[])", [coloniasCreadas]);
    await db.query("DELETE FROM rate_limits");
    await db.end();
  }

  // --- Salida ----------------------------------------------------------------------------------
  if (salidaJson) {
    console.log(JSON.stringify(resultados, null, 2));
    return;
  }
  for (const r of resultados) {
    console.log(`\n== ${r.id}: ${r.titulo}`);
    if (Object.keys(r.http).length) console.log(`   HTTP: ${Object.entries(r.http).map(([k, v]) => `${k} x${v}`).join(", ")}`);
    console.log(`   Filas del ataque: ${r.filas.visibles} cuentan, ${r.filas.revision} en revisión, ${r.filas.sospechosos} sospechosas (no cuentan)`);
    console.log(`   Score antes del ataque:         ${r.antes}`);
    console.log(`   Score después (v1):             ${r.despuesV1}`);
    console.log(`   Score después (método anterior): ${r.despuesAnterior}`);
    console.log(`   ${r.nota}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
