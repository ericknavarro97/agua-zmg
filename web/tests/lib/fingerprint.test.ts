import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diaLocal, hashComentario, huellaDiaria, identidades, igualesSeguro, ipCliente, leerCuerpoAcotado,
  origenPermitido, prefijos, semanaIso, uaFamilia,
} from "../../lib/fingerprint";

const env = process.env as Record<string, string | undefined>;
let guardado: Record<string, string | undefined>;
beforeEach(() => {
  guardado = {
    NODE_ENV: env.NODE_ENV, HASH_SALT: env.HASH_SALT, ORIGENES_PERMITIDOS: env.ORIGENES_PERMITIDOS,
    TRUSTED_PROXY_HOPS: env.TRUSTED_PROXY_HOPS,
  };
});
afterEach(() => {
  for (const [k, v] of Object.entries(guardado)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const IP = "201.144.7.93";
const DIA = "2026-10-08";

describe("huella: estable en el día, distinta entre días", () => {
  it("la misma persona (IP+UA) el mismo día da siempre la misma huella", () => {
    const a = identidades(IP, UA, DIA);
    for (let i = 0; i < 20; i++) expect(identidades(IP, UA, DIA)).toEqual(a);
    expect(huellaDiaria(IP, UA, DIA)).toBe(a.huella);
  });
  it("otro día cambia huella y red diaria: no se puede seguir a alguien entre días", () => {
    const a = identidades(IP, UA, "2026-10-08");
    const b = identidades(IP, UA, "2026-10-09");
    expect(a.huella).not.toBe(b.huella);
    expect(a.redHash).not.toBe(b.redHash);
  });
  it("la huella cambia con IP individual, con UA y con la sal", () => {
    const base = identidades(IP, UA, DIA).huella;
    expect(identidades("201.144.7.94", UA, DIA).huella).not.toBe(base);
    expect(identidades(IP, UA + " x", DIA).huella).not.toBe(base);
    env.HASH_SALT = "otra-sal-distinta-de-la-de-desarrollo-123456789";
    expect(identidades(IP, UA, DIA).huella).not.toBe(base);
  });
  it("la red semanal se conserva entre días de la misma semana ISO y cambia en otra semana", () => {
    // 2026-10-05 (lun) a 2026-10-11 (dom) = misma semana
    const dias = ["2026-10-05", "2026-10-08", "2026-10-11"].map((d) => identidades(IP, UA, d).redSem);
    expect(new Set(dias).size).toBe(1);
    expect(identidades(IP, UA, "2026-10-12").redSem).not.toBe(dias[0]);
  });
});

describe("privacidad: sin IP ni UA en claro", () => {
  it("ningún campo devuelto contiene la IP, el /24 ni el User-Agent", () => {
    const todo = JSON.stringify({ ...identidades(IP, UA, DIA), c: hashComentario("mi agua huele a cloro", DIA) });
    expect(todo).not.toContain(IP);
    expect(todo).not.toContain("201.144.7");
    expect(todo).not.toContain("Pixel");
    expect(todo).not.toContain("Mozilla");
  });
  it("huella, red y comentario son hexadecimales de longitud fija", () => {
    const i = identidades(IP, UA, DIA);
    expect(i.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(i.redHash).toMatch(/^[0-9a-f]{32}$/);
    expect(i.redSem).toMatch(/^[0-9a-f]{32}$/);
    expect(hashComentario("hola", DIA)).toMatch(/^[0-9a-f]{32}$/);
  });
  it("uaFamilia es una etiqueta gruesa sin versiones ni modelos", () => {
    const f = uaFamilia(UA);
    expect(f).toBe("chrome-android");
    expect(f).not.toMatch(/\d/);
    expect(uaFamilia("curl/8.4.0")).toBe("otro-otro");
    expect(uaFamilia("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1")).toBe("safari-ios");
  });
  it("el comentario normalizado es insensible a mayúsculas y espacios, pero no entre días", () => {
    expect(hashComentario("  Agua   TURBIA  hoy ", DIA)).toBe(hashComentario("agua turbia hoy", DIA));
    expect(hashComentario("agua turbia hoy", DIA)).not.toBe(hashComentario("agua turbia hoy", "2026-10-09"));
    expect(hashComentario("agua turbia", DIA)).not.toBe(hashComentario("agua limpia", DIA));
  });
});

describe("HASH_SALT en producción", () => {
  it("falta, es corta o es una sal prohibida: lanza", () => {
    env.NODE_ENV = "production";
    delete env.HASH_SALT;
    expect(() => identidades(IP, UA, DIA)).toThrow(/HASH_SALT/);
    for (const mala of ["corta", "dev-salt", "cambia-esto", "x".repeat(31)]) {
      env.HASH_SALT = mala;
      expect(() => identidades(IP, UA, DIA)).toThrow(/HASH_SALT/);
    }
  });
  it("una sal de 32+ caracteres funciona", () => {
    env.NODE_ENV = "production";
    env.HASH_SALT = "7c1e9a04b5d3f8261a0c9e7b4d2f6a83";
    expect(identidades(IP, UA, DIA).huella).toMatch(/^[0-9a-f]{64}$/);
  });
  it("en desarrollo una sal prohibida no se usa: cae a la local (resultado igual que sin sal)", () => {
    env.NODE_ENV = "test";
    delete env.HASH_SALT;
    const sinSal = identidades(IP, UA, DIA).huella;
    env.HASH_SALT = "cambia-esto";
    expect(identidades(IP, UA, DIA).huella).toBe(sinSal);
  });
});

describe("diaLocal y semanaIso", () => {
  it("el día rota a medianoche de Guadalajara (UTC-6), no a las 18:00 locales", () => {
    expect(diaLocal(new Date("2026-10-08T05:59:59Z"))).toBe("2026-10-07");
    expect(diaLocal(new Date("2026-10-08T06:00:00Z"))).toBe("2026-10-08");
    expect(diaLocal(new Date("2026-10-08T23:59:00Z"))).toBe("2026-10-08");
    expect(diaLocal(new Date("2026-10-09T05:59:00Z"))).toBe("2026-10-08");
  });
  it("semanas ISO conocidas (cambio de año incluido)", () => {
    expect(semanaIso("2026-10-08")).toBe("2026-W41");
    expect(semanaIso("2026-01-01")).toBe("2026-W01");
    expect(semanaIso("2025-12-29")).toBe("2026-W01");
    expect(semanaIso("2021-01-03")).toBe("2020-W53");
    expect(semanaIso("2024-12-30")).toBe("2025-W01");
    expect(semanaIso("2026-12-31")).toBe("2026-W53");
  });
  it("lunes a domingo comparten semana y el lunes siguiente cambia", () => {
    const lunes = Date.UTC(2026, 9, 5);
    const sem = (k: number) => semanaIso(new Date(lunes + k * 86400000).toISOString().slice(0, 10));
    for (let k = 1; k < 7; k++) expect(sem(k)).toBe(sem(0));
    expect(sem(7)).not.toBe(sem(0));
  });
});

describe("prefijos de red", () => {
  it("IPv4: individual = IP completa, red = /24", () => {
    expect(prefijos("201.144.7.93")).toEqual({ individual: "v4:201.144.7.93", red: "v4/24:201.144.7" });
  });
  it("IPv6: /64 individual, /48 de red", () => {
    const a = prefijos("2806:10b7:1:2:aaaa:bbbb:cccc:dddd");
    const mismo64 = prefijos("2806:10b7:1:2:1:2:3:4");
    const mismo48 = prefijos("2806:10b7:1:9::1");
    const otro48 = prefijos("2806:10b7:2:2::1");
    expect(mismo64.individual).toBe(a.individual);
    expect(mismo48.individual).not.toBe(a.individual);
    expect(mismo48.red).toBe(a.red);
    expect(otro48.red).not.toBe(a.red);
  });
  it("::ffff:a.b.c.d (IPv4 mapeada) equivale a la IPv4", () => {
    expect(prefijos("::ffff:201.144.7.93")).toEqual(prefijos("201.144.7.93"));
  });
  it("formas límite de IPv6 no lanzan y se agrupan bien ('::', sufijo IPv4, zona)", () => {
    expect(prefijos("::")).toEqual(prefijos("0:0:0:0:0:0:0:0"));
    expect(prefijos("64:ff9b::192.0.2.1").individual).toBe(prefijos("64:ff9b::c000:201").individual);
    expect(prefijos("fe80::1%eth0").individual).toBe(prefijos("fe80::1").individual);
  });
  it("abreviaturas '::' de IPv6 se expanden bien", () => {
    expect(prefijos("::1").individual).toBe(prefijos("0:0:0:0:0:0:0:1").individual);
    expect(prefijos("2001:db8::").red).toBe(prefijos("2001:db8:0:0:0:0:0:0").red);
  });
});

describe("ipCliente", () => {
  const h = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });
  it("ignora lo que el cliente escribe a la izquierda", () => {
    expect(ipCliente(h("1.1.1.1, 2.2.2.2, 201.144.7.93"), 1)).toBe("201.144.7.93");
    expect(ipCliente(h("1.1.1.1, 201.144.7.93, 10.0.0.1"), 2)).toBe("201.144.7.93");
  });
  it("hops inválido (0, negativo, NaN) vale 1", () => {
    for (const hops of [0, -3, NaN, 1.5]) expect(ipCliente(h("9.9.9.9, 201.144.7.93"), hops)).toBe("201.144.7.93");
  });
  it("usa TRUSTED_PROXY_HOPS por defecto", () => {
    env.TRUSTED_PROXY_HOPS = "2";
    expect(ipCliente(h("9.9.9.9, 201.144.7.93, 10.0.0.1"))).toBe("201.144.7.93");
  });
  it("devuelve null con cabecera ausente, vacía, con basura o con menos saltos de los esperados", () => {
    expect(ipCliente(h(), 1)).toBeNull();
    expect(ipCliente(h(""), 1)).toBeNull();
    expect(ipCliente(h("<script>"), 1)).toBeNull();
    expect(ipCliente(h("201.144.7.93"), 3)).toBeNull();
  });
  it("acepta IPv6", () => {
    expect(ipCliente(h("2806:10b7::1"), 1)).toBe("2806:10b7::1");
  });
});

describe("origenPermitido", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("misma procedencia desde el navegador -> web", () => {
    expect(origenPermitido(h({ host: "agua.example", origin: "https://agua.example", "sec-fetch-site": "same-origin" }))).toBe("web");
    expect(origenPermitido(h({ host: "agua.example", "sec-fetch-site": "same-origin" }))).toBe("web");
  });
  it("otro sitio (cross-site, same-site, none) o Origin ajeno/null -> rechazo", () => {
    expect(origenPermitido(h({ host: "agua.example", "sec-fetch-site": "cross-site" }))).toBeNull();
    expect(origenPermitido(h({ host: "agua.example", "sec-fetch-site": "same-site" }))).toBeNull();
    expect(origenPermitido(h({ host: "agua.example", "sec-fetch-site": "none" }))).toBeNull();
    expect(origenPermitido(h({ host: "agua.example", origin: "https://malo.example" }))).toBeNull();
    expect(origenPermitido(h({ host: "agua.example", origin: "null" }))).toBeNull();
  });
  it("sin Origin ni Sec-Fetch-Site -> canal sin_cabeceras (se acepta pero se marca)", () => {
    expect(origenPermitido(h({ host: "agua.example" }))).toBe("sin_cabeceras");
  });
  it("ORIGENES_PERMITIDOS añade hosts (con o sin esquema)", () => {
    env.ORIGENES_PERMITIDOS = "https://www.agua.example/, otro.example";
    expect(origenPermitido(h({ host: "interno:3000", origin: "https://www.agua.example" }))).toBe("web");
    expect(origenPermitido(h({ host: "interno:3000", origin: "https://otro.example" }))).toBe("web");
    expect(origenPermitido(h({ host: "interno:3000", origin: "https://malo.example" }))).toBeNull();
  });
  it("respeta x-forwarded-host como host propio", () => {
    expect(origenPermitido(h({ host: "interno", "x-forwarded-host": "agua.example", origin: "https://agua.example" }))).toBe("web");
  });
});

describe("leerCuerpoAcotado", () => {
  const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    new Request("http://x.test/", { method: "POST", body, headers, duplex: "half" } as RequestInit);
  it("lee un cuerpo pequeño", async () => {
    expect(await leerCuerpoAcotado(post('{"a":1}'), 100)).toBe('{"a":1}');
  });
  it("sin cuerpo -> cadena vacía", async () => {
    expect(await leerCuerpoAcotado(new Request("http://x.test/"), 100)).toBe("");
  });
  it("cuerpo mayor al máximo -> null, aunque no declare Content-Length", async () => {
    expect(await leerCuerpoAcotado(post("x".repeat(500)), 100)).toBeNull();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("x".repeat(60)));
        c.enqueue(new TextEncoder().encode("x".repeat(60)));
        c.close();
      },
    });
    expect(await leerCuerpoAcotado(post(stream), 100)).toBeNull();
  });
  it("Content-Length declarado mayor al máximo -> null sin leer", async () => {
    expect(await leerCuerpoAcotado(post("x", { "content-length": "999999" }), 100)).toBeNull();
  });
  it("exactamente el máximo pasa; UTF-8 se decodifica", async () => {
    expect(await leerCuerpoAcotado(post("a".repeat(100)), 100)).toHaveLength(100);
    expect(await leerCuerpoAcotado(post("Tonalá ñ"), 100)).toBe("Tonalá ñ");
  });
});

describe("igualesSeguro", () => {
  it("compara por valor, sin importar la longitud", () => {
    expect(igualesSeguro("secreto-123", "secreto-123")).toBe(true);
    expect(igualesSeguro("secreto-123", "secreto-124")).toBe(false);
    expect(igualesSeguro("a", "a".repeat(1000))).toBe(false);
    expect(igualesSeguro("", "")).toBe(true);
  });
});
