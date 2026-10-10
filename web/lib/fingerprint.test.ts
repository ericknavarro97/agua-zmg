import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diaLocal, hashComentario, saltDeEjemplo, identidades, igualesSeguro, ipCliente, leerCuerpoAcotado, origenPermitido, prefijos, semanaIso } from "./fingerprint";

const env = process.env as Record<string, string | undefined>;
let guardado: Record<string, string | undefined>;
beforeEach(() => {
  guardado = { NODE_ENV: env.NODE_ENV, HASH_SALT: env.HASH_SALT, ORIGENES_PERMITIDOS: env.ORIGENES_PERMITIDOS };
});
afterEach(() => Object.assign(env, guardado));

const h = (o: Record<string, string>) => new Headers(o);

describe("ipCliente", () => {
  it("cuenta desde la derecha: lo que escribe el cliente se ignora", () => {
    expect(ipCliente(h({ "x-forwarded-for": "6.6.6.6, 201.1.2.3" }), 1)).toBe("201.1.2.3");
    expect(ipCliente(h({ "x-forwarded-for": "6.6.6.6, 201.1.2.3, 10.0.0.1" }), 2)).toBe("201.1.2.3");
  });
  it("devuelve null con basura o sin cabecera", () => {
    expect(ipCliente(h({ "x-forwarded-for": "no-es-ip" }), 1)).toBeNull();
    expect(ipCliente(h({}), 1)).toBeNull();
  });
});

describe("identidades", () => {
  const dia = "2026-10-08";
  it("misma IP/UA el mismo día -> misma huella; otro día -> otra", () => {
    expect(identidades("201.1.2.3", "ua", dia).huella).toBe(identidades("201.1.2.3", "ua", dia).huella);
    expect(identidades("201.1.2.3", "ua", dia).huella).not.toBe(identidades("201.1.2.3", "ua", "2026-10-09").huella);
  });
  it("cambiar el UA cambia la huella pero NO la red", () => {
    const a = identidades("201.1.2.3", "ua-1", dia);
    const b = identidades("201.1.2.3", "ua-2", dia);
    expect(a.huella).not.toBe(b.huella);
    expect(a.redHash).toBe(b.redHash);
    expect(a.redSem).toBe(b.redSem);
  });
  it("mismo /24 -> misma red; la huella sigue siendo distinta", () => {
    const a = identidades("201.1.2.3", "ua", dia);
    const b = identidades("201.1.2.200", "ua", dia);
    expect(a.redHash).toBe(b.redHash);
    expect(a.huella).not.toBe(b.huella);
  });
  it("IPv6: mismo /64 -> misma huella; mismo /48 -> misma red", () => {
    const a = identidades("2001:db8:aaaa:1::1", "ua", dia);
    const b = identidades("2001:db8:aaaa:1:ffff::9", "ua", dia);
    const c = identidades("2001:db8:aaaa:2::1", "ua", dia);
    expect(a.huella).toBe(b.huella);
    expect(a.redHash).toBe(c.redHash);
    expect(a.huella).not.toBe(c.huella);
  });
  it("::ffff:a.b.c.d se trata como IPv4", () => {
    expect(prefijos("::ffff:201.1.2.3")).toEqual(prefijos("201.1.2.3"));
  });
  it("la red semanal es estable dentro de la semana ISO y cambia entre semanas", () => {
    expect(identidades("1.2.3.4", "ua", "2026-10-05").redSem).toBe(identidades("1.2.3.4", "ua", "2026-10-11").redSem);
    expect(identidades("1.2.3.4", "ua", "2026-10-11").redSem).not.toBe(identidades("1.2.3.4", "ua", "2026-10-12").redSem);
    expect(semanaIso("2026-10-08")).toBe("2026-W41");
  });
  it("el hash depende de HASH_SALT", () => {
    env.HASH_SALT = "sal-a-0123456789abcdef0123456789abcdef";
    const a = identidades("1.2.3.4", "ua", dia).huella;
    env.HASH_SALT = "sal-b-0123456789abcdef0123456789abcdef";
    expect(identidades("1.2.3.4", "ua", dia).huella).not.toBe(a);
  });
  it("en producción exige HASH_SALT fuerte (nada de dev-salt)", () => {
    env.NODE_ENV = "production";
    delete env.HASH_SALT;
    expect(() => identidades("1.2.3.4", "ua", dia)).toThrow(/HASH_SALT/);
    env.HASH_SALT = "dev-salt";
    expect(() => identidades("1.2.3.4", "ua", dia)).toThrow(/HASH_SALT/);
    env.HASH_SALT = "corta";
    expect(() => identidades("1.2.3.4", "ua", dia)).toThrow(/HASH_SALT/);
    env.HASH_SALT = "x".repeat(40);
    expect(() => identidades("1.2.3.4", "ua", dia)).toThrow(/HASH_SALT/); // un solo carácter repetido
    env.HASH_SALT = "9f3ac1d27be84056a1c2e7d90b3f5a68c4d1e2f70a9b8c7d";
    expect(() => identidades("1.2.3.4", "ua", dia)).not.toThrow();
  });
  it("en producción rechaza el valor de ejemplo del .env.example (clave pública)", () => {
    env.NODE_ENV = "production";
    env.HASH_SALT = "cambia-esto-por-un-valor-aleatorio-de-32-o-mas-caracteres";
    expect(() => identidades("203.0.113.7", "UA", dia)).toThrow(/HASH_SALT/);
    expect(saltDeEjemplo(env.HASH_SALT)).toBe(true);
    env.HASH_SALT = "dev-solo-local-no-usar-en-produccion-0000";
    expect(() => identidades("203.0.113.7", "UA", dia)).toThrow(/HASH_SALT/);
  });
  it(".env.example no trae un HASH_SALT utilizable", async () => {
    const { readFileSync } = await import("node:fs");
    const txt = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const linea = txt.split("\n").find((l) => l.startsWith("HASH_SALT="));
    expect((linea ?? "").slice("HASH_SALT=".length).trim()).toBe("");
  });
  it("hashComentario ignora mayúsculas y espacios", () => {
    expect(hashComentario("Hola  Mundo", "2026-10-08")).toBe(hashComentario("hola mundo ", "2026-10-08"));
  });
});

describe("diaLocal", () => {
  it("a las 02:00 UTC todavía es el día anterior en Guadalajara", () => {
    expect(diaLocal(new Date("2026-10-09T02:00:00Z"))).toBe("2026-10-08");
  });
});

describe("origenPermitido", () => {
  it("same-origin y Origin propio pasan", () => {
    expect(origenPermitido(h({ "sec-fetch-site": "same-origin", origin: "https://agua.example", host: "agua.example" }))).toBe("web");
  });
  it("cross-site, same-site, Origin ajeno y Origin: null se rechazan", () => {
    expect(origenPermitido(h({ "sec-fetch-site": "cross-site" }))).toBeNull();
    expect(origenPermitido(h({ "sec-fetch-site": "same-site" }))).toBeNull();
    expect(origenPermitido(h({ origin: "https://malo.example", host: "agua.example" }))).toBeNull();
    expect(origenPermitido(h({ origin: "null", host: "agua.example" }))).toBeNull();
  });
  it("sin cabeceras: canal sin_cabeceras (curl o navegador viejo)", () => {
    expect(origenPermitido(h({}))).toBe("sin_cabeceras");
  });
  it("ORIGENES_PERMITIDOS añade hosts", () => {
    env.ORIGENES_PERMITIDOS = "https://agua.example, otro.example";
    expect(origenPermitido(h({ origin: "https://otro.example", host: "interno:3000" }))).toBe("web");
  });
});

describe("leerCuerpoAcotado e igualesSeguro", () => {
  const req = (cuerpo: string) => new Request("http://x/", { method: "POST", body: cuerpo });
  it("lee hasta el máximo y rechaza si se pasa", async () => {
    expect(await leerCuerpoAcotado(req("hola"), 10)).toBe("hola");
    expect(await leerCuerpoAcotado(req("x".repeat(50)), 10)).toBeNull();
  });
  it("compara secretos", () => {
    expect(igualesSeguro("abc", "abc")).toBe(true);
    expect(igualesSeguro("abc", "abd")).toBe(false);
    expect(igualesSeguro("abc", "abcd")).toBe(false);
  });
});
