import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/reportes/route";
import { GET as scores } from "@/app/api/colonias/scores/route";
import { LIMITES } from "@/lib/ratelimit";
import {
  UA_CHROME, cuerpoValido, db, envejecerReportes, filasReportes, get, ipNueva, json, post, reiniciar, crearColonia,
} from "./helpers";

let col: number;
beforeEach(async () => {
  await reiniciar();
  col = await crearColonia({ nombre: "Del Fresno", municipio: "Guadalajara" });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/reportes: caso válido", () => {
  it("201 al crear y guarda el reporte con identificadores anónimos", async () => {
    const res = await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 2, sintomas: ["Mal olor", "Sedimentos"] })));
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ ok: true, actualizado: false });
    expect(res.headers.get("cache-control")).toBe("no-store");

    const [r] = await filasReportes(col);
    expect(r.gravedad).toBe(2);
    expect(r.sintomas).toEqual(["Mal olor", "Sedimentos"]);
    expect(r.estado).toBe("visible");
    expect(r.sospechoso).toBe(false);
    expect(r.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(r.red_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(r.red_sem).toMatch(/^[0-9a-f]{32}$/);
    expect(r.ua_familia).toBe("chrome-android");
    expect(r.tiempo_ms).toBe(15000);
    expect(r.canal).toBe("sin_cabeceras"); // sin Origin ni Sec-Fetch-Site
  });

  it("NO guarda la IP ni el User-Agent en ninguna columna", async () => {
    const ip = "203.0.113.77";
    await POST(post("/api/reportes", cuerpoValido(col, { comentario: "hola" }), { ip, ua: "AgenteMuyRaro/9.9 (secreto)" }));
    const { rows } = await db.query("SELECT row_to_json(r)::text AS t FROM reportes r");
    expect(rows).toHaveLength(1);
    expect(rows[0].t).not.toContain(ip);
    expect(rows[0].t).not.toContain("203.0.113");
    expect(rows[0].t).not.toContain("AgenteMuyRaro");
    expect(rows[0].t).not.toContain("secreto");
  });

  it("acepta los valores límite: gravedad 1 y 4, sintomas vacío, sin comentario ni tiempo_ms", async () => {
    for (const g of [1, 4]) {
      const r = await POST(post("/api/reportes", { colonia_id: col, gravedad: g }));
      expect(r.status).toBe(201);
    }
    const filas = await filasReportes(col);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.tiempo_ms === null && f.sintomas.length === 0 && f.comentario === null)).toBe(true);
  });

  it("canal 'web' cuando Origin coincide con el host de la petición", async () => {
    const r = await POST(post("/api/reportes", cuerpoValido(col), {
      headers: { host: "agua.test", origin: "https://agua.test", "sec-fetch-site": "same-origin" },
    }));
    expect(r.status).toBe(201);
    expect((await filasReportes(col))[0].canal).toBe("web");
  });

  it("un reporte válido aparece enseguida en el cálculo (se invalida la caché de scores)", async () => {
    // basta un reporte para que la colonia aparezca
    for (let i = 0; i < 1; i++) await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 3 })));
    const lista = await json<{ id: number }[]>(await scores());
    expect(lista.map((s) => s.id)).toContain(col);
  });
});

describe("POST /api/reportes: actualización el mismo día", () => {
  const mismo = { ip: "203.0.113.9" };

  it("un reenvío inmediato responde 429 con Retry-After, NO cambia el reporte ni crea otro", async () => {
    expect((await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 1 }), mismo))).status).toBe(201);
    const res = await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 4 }), mismo));
    expect(res.status).toBe(429); // antes fingía 200 'actualizado' y descartaba el cambio en silencio
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await json(res)).error).toMatch(/hace unos segundos/);
    const filas = await filasReportes(col);
    expect(filas).toHaveLength(1);
    expect(filas[0].gravedad).toBe(1); // mínimo 30 s entre actualizaciones: no se puede martillar
  });

  it("el mínimo de 30 s cuenta desde la ÚLTIMA actualización, no desde la creación", async () => {
    await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 1 }), mismo));
    await db.query("UPDATE reportes SET creado_en = creado_en - interval '2 minutes'");
    expect((await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 3 }), mismo))).status).toBe(200);
    // recién actualizado: otro reenvío inmediato se rechaza aunque el reporte se creó hace 2 min
    const res = await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 4 }), mismo));
    expect(res.status).toBe(429);
    expect((await filasReportes(col))[0].gravedad).toBe(3);
    // pasados 30 s desde esa actualización, vuelve a permitirse
    await db.query("UPDATE reportes SET actualizado_en = actualizado_en - interval '1 minute'");
    expect((await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 4 }), mismo))).status).toBe(200);
    expect((await filasReportes(col))[0].gravedad).toBe(4);
  });

  it("existe el índice (huella, dia) que usa guardar() para el cupo de colonias por día", async () => {
    const { rows } = await db.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'reportes' AND indexname = 'reportes_huella_dia_idx'");
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/\(huella, dia\)/);
  });

  it("pasados 30 s, el reenvío actualiza gravedad, síntomas y comentario del MISMO reporte", async () => {
    await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 1, sintomas: ["Mal olor"] }), mismo));
    await db.query("UPDATE reportes SET creado_en = creado_en - interval '2 minutes'");
    const res = await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 4, sintomas: ["Sedimentos"], comentario: "empeoró" }), mismo));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, actualizado: true });
    const filas = await filasReportes(col);
    expect(filas).toHaveLength(1);
    expect(filas[0].gravedad).toBe(4);
    expect(filas[0].sintomas).toEqual(["Sedimentos"]);
    expect(filas[0].comentario).toBe("empeoró");
  });

  it("reenviar NO revive un reporte oculto por un moderador", async () => {
    await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 1 }), mismo));
    await db.query("UPDATE reportes SET estado = 'oculto', creado_en = creado_en - interval '2 minutes'");
    const res = await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 4 }), mismo));
    expect(res.status).toBe(200);
    const [f] = await filasReportes(col);
    expect(f.estado).toBe("oculto");
    expect(f.gravedad).toBe(1);
  });

  it("reportar con otra huella (otro dispositivo) en la misma colonia crea otro reporte", async () => {
    await POST(post("/api/reportes", cuerpoValido(col), mismo));
    const res = await POST(post("/api/reportes", cuerpoValido(col), { ip: "203.0.113.10" }));
    expect(res.status).toBe(201);
    expect(await filasReportes(col)).toHaveLength(2);
  });
});

describe("POST /api/reportes: entradas inválidas", () => {
  const invalidos: [string, unknown][] = [
    ["gravedad 0", { colonia_id: 1, gravedad: 0 }],
    ["gravedad 5", { colonia_id: 1, gravedad: 5 }],
    ["gravedad decimal", { colonia_id: 1, gravedad: 2.5 }],
    ["gravedad como texto", { colonia_id: 1, gravedad: "3" }],
    ["gravedad ausente", { colonia_id: 1 }],
    ["colonia_id ausente", { gravedad: 2 }],
    ["colonia_id como texto", { colonia_id: "1", gravedad: 2 }],
    ["colonia_id 0", { colonia_id: 0, gravedad: 2 }],
    ["colonia_id negativo", { colonia_id: -3, gravedad: 2 }],
    ["colonia_id decimal", { colonia_id: 1.5, gravedad: 2 }],
    ["síntoma desconocido", { colonia_id: 1, gravedad: 2, sintomas: ["Fiebre"] }],
    ["sintomas no es arreglo", { colonia_id: 1, gravedad: 2, sintomas: "Mal olor" }],
    ["comentario de 501 caracteres", { colonia_id: 1, gravedad: 2, comentario: "a".repeat(501) }],
    ["comentario que no es texto", { colonia_id: 1, gravedad: 2, comentario: 123 }],
    ["tiempo_ms negativo", { colonia_id: 1, gravedad: 2, tiempo_ms: -1 }],
    ["tiempo_ms como texto", { colonia_id: 1, gravedad: 2, tiempo_ms: "5000" }],
    ["tiempo_ms absurdo (> 7 días)", { colonia_id: 1, gravedad: 2, tiempo_ms: 8 * 24 * 3600 * 1000 }],
    ["el cuerpo es un arreglo", [{ colonia_id: 1, gravedad: 2 }]],
    ["el cuerpo es null", null],
    ["el cuerpo es un número", 7],
  ];
  it.each(invalidos)("400: %s", async (_n, cuerpo) => {
    const res = await POST(post("/api/reportes", cuerpo));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBeTruthy();
    expect(await filasReportes()).toHaveLength(0);
  });

  it("400 con JSON roto o cuerpo vacío", async () => {
    expect((await POST(post("/api/reportes", null, { crudo: "{no es json" }))).status).toBe(400);
    expect((await POST(post("/api/reportes", null, { crudo: "" }))).status).toBe(400);
  });

  it("415 si el Content-Type no es JSON (un POST 'simple' text/plain no llega al parser)", async () => {
    const res = await POST(post("/api/reportes", cuerpoValido(col), { headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
    const sin = await POST(post("/api/reportes", cuerpoValido(col), { headers: { "content-type": null } }));
    expect(sin.status).toBe(415);
    expect(await filasReportes()).toHaveLength(0);
  });

  it("404 si la colonia no existe y no deja nada guardado", async () => {
    const res = await POST(post("/api/reportes", cuerpoValido(999999)));
    expect(res.status).toBe(404);
    expect(await filasReportes()).toHaveLength(0);
  });

  it("los errores no revelan detalles internos", async () => {
    const res = await POST(post("/api/reportes", { colonia_id: "x'; DROP TABLE reportes;--", gravedad: 2 }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await json(res))).not.toMatch(/zod|stack|select|pg_/i);
  });

  it("un colonia_id con inyección SQL como número válido no rompe nada", async () => {
    const res = await POST(post("/api/reportes", cuerpoValido(col, { comentario: "'); DROP TABLE reportes;--" })));
    expect(res.status).toBe(201);
    expect(await filasReportes(col)).toHaveLength(1);
  });
});

describe("POST /api/reportes: tamaño del cuerpo", () => {
  it("413 si el cuerpo pasa de 4 KB (por Content-Length)", async () => {
    const res = await POST(post("/api/reportes", null, { crudo: JSON.stringify({ ...cuerpoValido(col), relleno: "a".repeat(5000) }) }));
    expect(res.status).toBe(413);
    expect(await filasReportes()).toHaveLength(0);
  });

  it("413 también cuando NO hay Content-Length (flujo): no se fía de lo declarado", async () => {
    const grande = new TextEncoder().encode(JSON.stringify({ ...cuerpoValido(col), relleno: "a".repeat(100_000) }));
    const flujo = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < grande.length; i += 8192) c.enqueue(grande.slice(i, i + 8192));
        c.close();
      },
    });
    const req = new Request("http://localhost:3201/api/reportes", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ipNueva() },
      body: flujo,
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    expect((await POST(req)).status).toBe(413);
  });

  it("un cuerpo grande pero dentro del límite sí pasa (comentario de 500 caracteres)", async () => {
    const res = await POST(post("/api/reportes", cuerpoValido(col, { comentario: "a".repeat(500) })));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/reportes: Origin cruzado", () => {
  const malos: [string, Record<string, string>][] = [
    ["Origin de otro sitio", { origin: "https://evil.example" }],
    ["Origin: null (iframe sandbox)", { origin: "null" }],
    ["Origin ilegible", { origin: "no-es-url" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site (otro subdominio)", { "sec-fetch-site": "same-site" }],
    ["Sec-Fetch-Site: none", { "sec-fetch-site": "none" }],
    ["Sec-Fetch-Site same-origin pero Origin ajeno", { "sec-fetch-site": "same-origin", origin: "https://evil.example" }],
    ["Origin con mismo nombre pero otro puerto", { host: "agua.test", origin: "https://agua.test:8443" }],
    ["Origin que solo contiene el host como prefijo", { host: "agua.test", origin: "https://agua.test.evil.example" }],
  ];
  it.each(malos)("403: %s", async (_n, headers) => {
    const res = await POST(post("/api/reportes", cuerpoValido(col), { headers }));
    expect(res.status).toBe(403);
    expect(await filasReportes()).toHaveLength(0);
  });

  it("ORIGENES_PERMITIDOS añade hosts extra (acepta URL completa y barra final)", async () => {
    vi.stubEnv("ORIGENES_PERMITIDOS", "https://otro.test/, www.agua.test");
    const ok1 = await POST(post("/api/reportes", cuerpoValido(col), { headers: { origin: "https://otro.test" } }));
    const ok2 = await POST(post("/api/reportes", cuerpoValido(col), { headers: { origin: "https://www.agua.test" } }));
    const no = await POST(post("/api/reportes", cuerpoValido(col), { headers: { origin: "https://evil.example" } }));
    expect([ok1.status, ok2.status, no.status]).toEqual([201, 201, 403]);
  });

  it("el Origin ajeno se rechaza ANTES de gastar cupo de límites", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 12; i++) await POST(post("/api/reportes", cuerpoValido(col), { ip, headers: { origin: "https://evil.example" } }));
    const ok = await POST(post("/api/reportes", cuerpoValido(col), { ip }));
    expect(ok.status).toBe(201);
  });
});

describe("POST /api/reportes: honeypot y tiempo mínimo", () => {
  it("honeypot lleno: responde 201 igual que uno normal, pero se guarda marcado", async () => {
    const normal = await POST(post("/api/reportes", cuerpoValido(col)));
    const bot = await POST(post("/api/reportes", cuerpoValido(col, { hp: "http://spam.example" })));
    expect(bot.status).toBe(normal.status);
    expect(await json(bot)).toEqual(await json(normal));
    const filas = await filasReportes(col);
    expect(filas).toHaveLength(2);
    const marcado = filas.find((f) => f.sospechoso)!;
    expect(marcado.motivo).toBe("honeypot");
    expect(marcado.estado).toBe("visible");
  });

  it.each([["hp con texto", "x"], ["hp numérico", 1], ["hp verdadero", true], ["hp objeto", { a: 1 }]])("%s cuenta como honeypot lleno", async (_n, hp) => {
    const res = await POST(post("/api/reportes", cuerpoValido(col, { hp })));
    expect(res.status).toBe(201);
    expect((await filasReportes(col))[0].motivo).toBe("honeypot");
  });

  it("hp vacío, ausente, null o false NO es sospechoso", async () => {
    for (const hp of ["", undefined, null, false]) {
      const body = cuerpoValido(col);
      if (hp === undefined) delete (body as Record<string, unknown>).hp;
      else (body as Record<string, unknown>).hp = hp;
      expect((await POST(post("/api/reportes", body))).status).toBe(201);
    }
    expect((await filasReportes(col)).filter((f) => f.sospechoso)).toHaveLength(0);
  });

  it("tiempo_ms bajo (< 2000): 201 pero marcado 'tiempo_bajo'", async () => {
    const res = await POST(post("/api/reportes", cuerpoValido(col, { tiempo_ms: 300 })));
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ ok: true, actualizado: false });
    const [f] = await filasReportes(col);
    expect(f.sospechoso).toBe(true);
    expect(f.motivo).toBe("tiempo_bajo");
    expect(f.tiempo_ms).toBe(300);
  });

  it("el umbral es 2000 ms: 1999 sospechoso, 2000 normal", async () => {
    await POST(post("/api/reportes", cuerpoValido(col, { tiempo_ms: 1999 })));
    await POST(post("/api/reportes", cuerpoValido(col, { tiempo_ms: 2000 })));
    const filas = await filasReportes(col);
    expect(filas.map((f) => f.sospechoso)).toEqual([true, false]);
  });

  it("los reportes sospechosos NO cuentan: ni en n, ni en scores, ni en el detalle", async () => {
    for (let i = 0; i < 10; i++) await POST(post("/api/reportes", cuerpoValido(col, { gravedad: 4, hp: "bot" })));
    expect(await json(await scores())).toEqual([]);
    const { GET: detalle } = await import("@/app/api/colonias/[id]/route");
    const d = await json(await detalle(get(`/api/colonias/${col}`), { params: Promise.resolve({ id: String(col) }) }));
    expect(d.reportes.n).toBeNull(); // sin mínimo publicable no se expone ningún conteo
    expect(d.reportes.serie).toEqual([]);
  });

  it("el cupo de un sospechoso sí gasta límites (no es una vía libre para martillar)", async () => {
    const ip = "203.0.113.60";
    const estados: number[] = [];
    for (let i = 0; i < LIMITES.huellaHora + 1; i++) {
      estados.push((await POST(post("/api/reportes", cuerpoValido(col, { hp: "x" }), { ip }))).status);
    }
    expect(estados.at(-1)).toBe(429);
  });
});

describe("POST /api/reportes: saneamiento del comentario", () => {
  const guardado = async (comentario: string) => {
    const res = await POST(post("/api/reportes", cuerpoValido(col, { comentario })));
    expect(res.status).toBe(201);
    const filas = await filasReportes(col);
    const f = filas.at(-1)!;
    await db.query("DELETE FROM reportes");
    return f.comentario as string | null;
  };

  it("enmascara teléfonos con distintos formatos", async () => {
    for (const t of ["33 1234 5678", "(33) 1234-5678", "+52 33 1234 5678", "3312345678", "33.1234.5678"]) {
      const c = await guardado(`llámame al ${t} por favor`);
      expect(c, t).toContain("[teléfono]");
      expect(c, t).not.toMatch(/\d{4}/);
    }
  });

  it("enmascara correos, enlaces y @usuarios", async () => {
    const c = (await guardado("escribe a vecino.molesto+x@correo.com.mx o ve https://malo.example/ruta?x=1 y www.otro.com y @mi_usuario"))!;
    expect(c).toContain("[correo]");
    expect(c).toContain("[enlace]");
    expect(c).toContain("[usuario]");
    expect(c).not.toMatch(/@correo|malo\.example|otro\.com|mi_usuario/);
  });

  it("enmascara dominios sin esquema (agua.mx, algo.com/x)", async () => {
    const c = (await guardado("mira agua-mala.mx o fb.com/grupo"))!;
    expect(c).not.toMatch(/agua-mala\.mx|fb\.com/);
  });

  it("quita HTML y etiquetas <script>", async () => {
    const c = (await guardado("<script>alert(1)</script><b>agua</b> turbia <img src=x onerror=alert(1)>"))!;
    expect(c).not.toMatch(/[<>]/);
    expect(c).toContain("agua");
    expect(c).toContain("turbia");
  });

  it("quita caracteres de control y de dirección de texto invisibles", async () => {
    const c = (await guardado("a\u0000b‮c​d"))!;
    expect(c).toBe("abcd");
  });

  it("un comentario sólo con espacios queda en NULL", async () => {
    expect(await guardado("      ")).toBeNull();
  });

  it("deja intacto un comentario normal", async () => {
    expect(await guardado("Sale café desde el lunes en la calle Juárez")).toBe("Sale café desde el lunes en la calle Juárez");
  });

  it("guarda el hash del comentario normalizado (mismo texto con otro espaciado, mismo hash)", async () => {
    await POST(post("/api/reportes", cuerpoValido(col, { comentario: "Agua   TURBIA" })));
    await POST(post("/api/reportes", cuerpoValido(col, { comentario: "agua turbia" })));
    const filas = await filasReportes(col);
    expect(filas[0].comentario_hash).toBeTruthy();
    expect(filas[0].comentario_hash).toBe(filas[1].comentario_hash);
  });
});

describe("POST /api/reportes: límites de tasa", () => {
  it("429 al pasar 8 envíos por hora de la misma huella", async () => {
    const ip = "203.0.113.70";
    const estados: number[] = [];
    for (let i = 0; i < LIMITES.huellaHora + 2; i++) {
      estados.push((await POST(post("/api/reportes", cuerpoValido(col), { ip }))).status);
      await envejecerReportes(); // sin esto, el 2.º envío rebotaría por el mínimo de 30 s y no por el límite horario
    }
    expect(estados.slice(0, LIMITES.huellaHora).every((s) => s === 201 || s === 200)).toBe(true);
    expect(estados.slice(LIMITES.huellaHora)).toEqual([429, 429]);
  });

  it("una huella reporta hasta 3 colonias distintas por día; la 4ª recibe 429", async () => {
    const extra = [await crearColonia(), await crearColonia(), await crearColonia()];
    const ip = "203.0.113.71";
    const r1 = await POST(post("/api/reportes", cuerpoValido(col), { ip }));
    const r2 = await POST(post("/api/reportes", cuerpoValido(extra[0]), { ip }));
    const r3 = await POST(post("/api/reportes", cuerpoValido(extra[1]), { ip }));
    const r4 = await POST(post("/api/reportes", cuerpoValido(extra[2]), { ip }));
    expect([r1.status, r2.status, r3.status, r4.status]).toEqual([201, 201, 201, 429]);
    // actualizar una colonia ya reportada sigue permitido (pasado el mínimo de 30 s)
    await envejecerReportes();
    const act = await POST(post("/api/reportes", cuerpoValido(col), { ip }));
    expect(act.status).toBe(200);
    expect((await db.query("SELECT count(*)::int AS n FROM reportes")).rows[0].n).toBe(3);
  });

  it("el cupo de colonias/día se respeta aun con peticiones simultáneas (sin carreras)", async () => {
    const cols = [col, ...(await Promise.all([crearColonia(), crearColonia(), crearColonia(), crearColonia(), crearColonia()]))];
    const ip = "203.0.113.72";
    const resp = await Promise.all(cols.map((c) => POST(post("/api/reportes", cuerpoValido(c), { ip }))));
    const creados = resp.filter((r) => r.status === 201).length;
    expect(creados).toBe(LIMITES.coloniasPorDia);
    expect(resp.filter((r) => r.status === 429)).toHaveLength(cols.length - LIMITES.coloniasPorDia);
    expect((await db.query("SELECT count(*)::int AS n FROM reportes")).rows[0].n).toBe(LIMITES.coloniasPorDia);
  });

  it("una red (/24) con muchos dispositivos: sobre 20 entra a revisión y sobre 120 recibe 429", async () => {
    // 121 dispositivos (User-Agent distinto) detrás de la misma red /24: IPs distintas del mismo bloque
    const estados: number[] = [];
    for (let i = 0; i < 121; i++) {
      const res = await POST(post("/api/reportes", cuerpoValido(col, { tiempo_ms: 8000 + i * 137 }), {
        ip: `198.51.100.${(i % 250) + 1}`,
        ua: `Mozilla/5.0 (Linux; Android 14; Disp${i}) Chrome/126.0 Mobile Safari/537.36`,
      }));
      estados.push(res.status);
    }
    expect(estados.slice(0, 120).every((s) => s === 201)).toBe(true);
    expect(estados[120]).toBe(429);
    const { rows } = await db.query("SELECT motivo, count(*)::int AS n FROM reportes WHERE estado = 'revision' GROUP BY 1");
    const porMotivo = Object.fromEntries(rows.map((r) => [r.motivo, r.n]));
    // los envíos 21..120 (100) superan el límite blando de la red
    expect(porMotivo.limite_red_blando).toBe(100);
    // y todo lo que está en revisión NO cuenta
    expect(await json(await scores())).toEqual([]);
  });

  it("el límite de una red no afecta a otra red", async () => {
    for (let i = 0; i < LIMITES.huellaHora + 1; i++) await POST(post("/api/reportes", cuerpoValido(col), { ip: "203.0.113.80" }));
    const res = await POST(post("/api/reportes", cuerpoValido(col), { ip: "203.0.114.80" }));
    expect(res.status).toBe(201);
  });

  it("MODO_ATAQUE=1 manda todo a revisión (la respuesta no cambia) y nada cuenta", async () => {
    vi.stubEnv("MODO_ATAQUE", "1");
    const res = await POST(post("/api/reportes", cuerpoValido(col)));
    expect(res.status).toBe(201);
    const [f] = await filasReportes(col);
    expect(f.estado).toBe("revision");
    expect(f.motivo).toBe("modo_ataque");
  });

  it("ANTIABUSO_RELAJADO=1 apaga los límites solo fuera de producción", async () => {
    vi.stubEnv("ANTIABUSO_RELAJADO", "1");
    const ip = "203.0.113.90";
    const estados: number[] = [];
    for (let i = 0; i < LIMITES.huellaHora + 2; i++) {
      estados.push((await POST(post("/api/reportes", cuerpoValido(col), { ip }))).status);
      await envejecerReportes();
    }
    expect(estados).not.toContain(429);
    // en producción se ignora
    vi.stubEnv("NODE_ENV", "production");
    const prod: number[] = [];
    for (let i = 0; i < LIMITES.huellaHora + 1; i++) {
      prod.push((await POST(post("/api/reportes", cuerpoValido(col), { ip: "203.0.113.91" }))).status);
      await envejecerReportes();
    }
    expect(prod.slice(0, LIMITES.huellaHora).every((x) => x === 201 || x === 200)).toBe(true);
    expect(prod.at(-1)).toBe(429);
  });

  it("un LIMITE_GLOBAL_HORA vacío o inválido no manda todo a revisión (usa el valor por defecto)", async () => {
    vi.stubEnv("LIMITE_GLOBAL_HORA", "");
    vi.resetModules();
    const { LIMITES: L } = await import("@/lib/ratelimit");
    expect(L.globalBlandoHora).toBe(3000);
    vi.stubEnv("LIMITE_GLOBAL_HORA", "no-es-numero");
    vi.resetModules();
    expect((await import("@/lib/ratelimit")).LIMITES.globalBlandoHora).toBe(3000);
    vi.stubEnv("LIMITE_GLOBAL_HORA", "50");
    vi.resetModules();
    expect((await import("@/lib/ratelimit")).LIMITES.globalBlandoHora).toBe(50);
  });
});

describe("POST /api/reportes: configuración de producción", () => {
  it("en producción sin HASH_SALT válido falla cerrado con 503 y no guarda nada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const sal of ["", "cambia-esto", "dev-salt", "corta"]) {
      vi.stubEnv("HASH_SALT", sal);
      const res = await POST(post("/api/reportes", cuerpoValido(col)));
      expect(res.status, `sal=${JSON.stringify(sal)}`).toBe(503);
    }
    expect(await filasReportes()).toHaveLength(0);
  });

  it("en producción con HASH_SALT de 32+ caracteres funciona", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HASH_SALT", "9f3ac1d27be84056a1c2e7d90b3f5a68c4d1e2f70a9b8c7d");
    expect((await POST(post("/api/reportes", cuerpoValido(col)))).status).toBe(201);
  });

  it("TRUSTED_PROXY_HOPS cuenta desde la derecha: lo que escribe el cliente a la izquierda se ignora", async () => {
    // El cliente intenta aparentar otra IP en cada envío escribiendo X-Forwarded-For a la izquierda
    const estados: number[] = [];
    for (let i = 0; i < LIMITES.huellaHora + 1; i++) {
      estados.push((await POST(post("/api/reportes", cuerpoValido(col), {
        headers: { "x-forwarded-for": `1.2.3.${i + 1}, 203.0.113.99` }, // el proxy de confianza añadió 203.0.113.99
      }))).status);
    }
    expect(estados.at(-1)).toBe(429); // sigue siendo la misma huella
  });

  it("sin IP válida todos comparten una sola 'red' (falla cerrada)", async () => {
    const estados: number[] = [];
    for (let i = 0; i < LIMITES.huellaHora + 1; i++) {
      estados.push((await POST(post("/api/reportes", cuerpoValido(col), { headers: { "x-forwarded-for": "basura" } }))).status);
    }
    expect(estados.at(-1)).toBe(429);
  });
});

describe("la UA se reduce a una familia gruesa", () => {
  it("guarda 'safari-ios' y no el User-Agent completo", async () => {
    await POST(post("/api/reportes", cuerpoValido(col), {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    }));
    expect((await filasReportes(col))[0].ua_familia).toBe("safari-ios");
    void UA_CHROME;
  });
});
