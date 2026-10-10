/**
 * scripts/import-oficial.ts: vinculación alta/media/baja, filas sin vincular, archivos de salida,
 * idempotencia y rechazo de filas inválidas. Trabaja en un directorio temporal (no toca data/oficial).
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { correrScript, crearBase, crearSandbox, escribir, insertarColonia, type BaseTemporal, type Sandbox } from "../lib/_db";

let bd: BaseTemporal;
let sb: Sandbox;
const ids: Record<string, number> = {};
let ruta: string;

beforeAll(async () => {
  bd = await crearBase();
  sb = crearSandbox();
  ruta = join(sb.dirOficial, "mediciones_externas.csv");
});
afterAll(async () => {
  sb?.limpiar();
  await bd?.borrar();
});
beforeEach(async () => {
  await bd.pool.query("TRUNCATE mediciones_externas RESTART IDENTITY");
  await bd.pool.query("DELETE FROM colonias");
  let x = -103.5;
  const col = async (clave: string, nombre: string, municipio: string) => {
    ids[clave] = await insertarColonia(bd.pool, nombre, municipio, (x += 0.02), 20.6);
  };
  await col("bosque", "Jardines del Bosque", "Guadalajara");
  await col("fresno", "Del Fresno", "Guadalajara");
  await col("oblatos", "Balcones de Oblatos Primera Seccion", "Guadalajara");
  await col("haciendas", "Haciendas del Valle", "Zapopan");
  await col("centro1", "Centro", "Zapopan");
  await col("centro2", "Centro", "Zapopan");
  for (const f of ["no_vinculadas.csv", "vinculos_a_revisar.csv"]) rmSync(join(sb.dirOficial, f), { force: true });
});

const CAB = "colonia,municipio,fuente,tipo_fuente,fecha,parametro,valor,unidad,url,notas";
const URL1 = "https://ejemplo.invalid/fuente";
/** Fila CSV: colonia, municipio, parametro, valor, extras. */
const fila = (colonia: string, municipio: string, parametro = "turbiedad", valor = "12", o: Record<string, string> = {}) =>
  [colonia, municipio, o.fuente ?? "Fuente de prueba", o.tipo ?? "oficial", o.fecha ?? "2026-10-01", parametro, valor, o.unidad ?? "NTU", o.url ?? URL1, o.notas ?? ""]
    .map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
const csv = (...filas: string[]) => [CAB, ...filas].join("\n") + "\n";

function correr(contenido: string, args: string[] = []) {
  escribir(ruta, contenido);
  const r = correrScript("import-oficial.ts", ["--archivo", ruta, ...args], { cwd: sb.cwd, url: bd.url });
  const m = r.stdout.match(/^\{[\s\S]*?^\}/m);
  return { r, resumen: m ? (JSON.parse(m[0]) as Record<string, any>) : ({} as Record<string, any>) }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const med = async () =>
  (await bd.pool.query(
    `SELECT colonia_texto, municipio_texto, ambito, colonia_id, confianza_vinculo, metodo_vinculo, parametro, valor, tipo_fuente, notas, url
       FROM mediciones_externas ORDER BY id`)).rows;
const porTexto = (rows: Awaited<ReturnType<typeof med>>, t: string) => rows.find((x) => x.colonia_texto === t);

describe("vinculación por confianza", () => {
  it("alta / media / baja / sin vincular, cada una con el motivo correcto", async () => {
    const { r, resumen } = correr(csv(
      fila("JARDINES DEL BOSQUE", "Guadalajara"),            // alta: igual salvo mayúsculas
      fila("Col. Del Fresno", "Guadalajara", "plomo", "0.5", { unidad: "mg/L" }), // media: igual en forma núcleo
      fila("Hacienda del Valle", "Zapopan"),                  // baja: singular/plural
      fila("Centro", "Zapopan"),                              // homónimos en el municipio
      fila("No Existe Esta", "Guadalajara"),                  // sin coincidencia
      fila("Algo", "Acatic"),                                 // municipio sin cartografía
    ));
    expect(r.status, r.stderr).toBe(0);
    const m = await med();
    expect(m).toHaveLength(6);

    expect(porTexto(m, "JARDINES DEL BOSQUE")).toMatchObject({ colonia_id: ids.bosque, confianza_vinculo: "alta", metodo_vinculo: "nombre_exacto", ambito: "colonia" });
    expect(porTexto(m, "Col. Del Fresno")).toMatchObject({ colonia_id: ids.fresno, confianza_vinculo: "media", metodo_vinculo: "nombre_nucleo" });
    expect(porTexto(m, "Hacienda del Valle")).toMatchObject({ colonia_id: ids.haciendas, confianza_vinculo: "baja" });
    for (const t of ["Centro", "No Existe Esta", "Algo"]) {
      expect(porTexto(m, t), t).toMatchObject({ colonia_id: null, confianza_vinculo: null, ambito: "colonia" });
    }
    expect(resumen).toMatchObject({
      filas_importadas: 6, filas_de_colonia: 6, no_vinculadas: 3, colonias_reales_con_dato: 3,
      vinculadas_por_confianza: { alta: 1, media: 1, baja: 1 },
      no_vinculadas_por_motivo: { homonimos_en_municipio: 1, sin_coincidencia: 1, municipio_sin_cartografia: 1 },
    });
  });

  it("no cruza municipios", async () => {
    correr(csv(fila("Jardines del Bosque", "Zapopan")));
    expect((await med())[0].colonia_id).toBeNull();
  });

  it("filas sin colonia quedan como ámbito municipio o zmg, nunca vinculadas a una colonia", async () => {
    const { r, resumen } = correr(csv(
      fila("", "Zapopan", "turbiedad", "5"),
      fila("", "", "caudal", "100", { unidad: "L/s" }),
      fila("", "Tlaquepaque", "turbiedad", "6"),
    ));
    expect(r.status, r.stderr).toBe(0);
    const m = await med();
    expect(m.map((x) => x.ambito)).toEqual(["municipio", "zmg", "municipio"]);
    expect(m.every((x) => x.colonia_id === null)).toBe(true);
    expect(resumen.por_ambito).toEqual({ municipio: 2, zmg: 1 });
  });

  it("las filas 'reporte_calidad_deficiente' (sin valor) se guardan como lo que son: sin valor numérico", async () => {
    correr(csv(fila("Jardines del Bosque", "Guadalajara", "reporte_calidad_deficiente", "", { unidad: "", notas: "NO es una medición" })));
    expect((await med())[0]).toMatchObject({ parametro: "reporte_calidad_deficiente", valor: null, confianza_vinculo: "alta" });
  });
});

describe("archivos de salida", () => {
  it("no_vinculadas.csv lista cada colonia/fuente con su motivo y candidatos; vinculos_a_revisar.csv solo media y baja", async () => {
    const { r } = correr(csv(
      fila("Jardines del Bosque", "Guadalajara"),
      fila("Col. Del Fresno", "Guadalajara"),
      fila("Col. Del Fresno", "Guadalajara", "plomo", "1"),   // mismo (colonia, fuente): una sola fila en el reporte
      fila("Hacienda del Valle", "Zapopan"),
      fila("Centro", "Zapopan"),
      fila("Algo", "Acatic"),
    ));
    expect(r.status, r.stderr).toBe(0);
    const no = readFileSync(join(sb.dirOficial, "no_vinculadas.csv"), "utf8").trim().split("\n");
    expect(no[0]).toBe("colonia,municipio,fuente,tipo_fuente,parametros,filas,motivo,candidatos_cartografia,url");
    expect(no).toHaveLength(3); // Algo (Acatic) y Centro (Zapopan)
    expect(no.join("\n")).toMatch(/Algo,Acatic,.*municipio_sin_cartografia/);
    expect(no.join("\n")).toMatch(/Centro,Zapopan,.*homonimos_en_municipio/);
    expect(no.join("\n")).toContain("Centro (id " + ids.centro1 + ")");
    // ordenado por municipio y luego colonia
    expect(no[1].startsWith("Algo,Acatic")).toBe(true);

    const rev = readFileSync(join(sb.dirOficial, "vinculos_a_revisar.csv"), "utf8").trim().split("\n");
    expect(rev[0]).toBe("colonia_fuente,municipio_fuente,fuente,colonia_id,colonia_cartografia,confianza_vinculo,metodo,similitud");
    expect(rev).toHaveLength(3); // Col. Del Fresno (media) y Hacienda (baja); la alta no aparece
    expect(rev.join("\n")).not.toContain("Jardines del Bosque");
    expect(rev.join("\n")).toMatch(/Col. Del Fresno,Guadalajara,.*media/);
    expect(rev.join("\n")).toMatch(/Hacienda del Valle,Zapopan,.*baja/);
  });

  it("--sin-salida no escribe archivos", async () => {
    const { r } = correr(csv(fila("Centro", "Zapopan")), ["--sin-salida"]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(sb.dirOficial, "no_vinculadas.csv"))).toBe(false);
    expect(existsSync(join(sb.dirOficial, "vinculos_a_revisar.csv"))).toBe(false);
  });

  it("un archivo que no es el principal escribe salidas con sufijo y no pisa las principales", async () => {
    const otro = join(sb.dirOficial, "mediciones_historicas_pre2025.csv");
    escribir(otro, csv(fila("Centro", "Zapopan")));
    const r = correrScript("import-oficial.ts", ["--archivo", otro], { cwd: sb.cwd, url: bd.url });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(sb.dirOficial, "no_vinculadas_mediciones_historicas_pre2025.csv"))).toBe(true);
    expect(existsSync(join(sb.dirOficial, "no_vinculadas.csv"))).toBe(false);
  });

  it("los campos con comas, comillas y saltos de línea sobreviven ida y vuelta", async () => {
    const raro = 'Fuente "X", S.A.\nsegunda línea';
    correr(csv(fila("Colonia, con coma", "Zapopan", "turbiedad", "3", { fuente: raro, notas: 'dijo "hola"' })));
    const { rows } = await bd.pool.query("SELECT fuente, notas, colonia_texto FROM mediciones_externas");
    expect(rows[0]).toEqual({ fuente: raro, notas: 'dijo "hola"', colonia_texto: "Colonia, con coma" });
    const no = readFileSync(join(sb.dirOficial, "no_vinculadas.csv"), "utf8");
    expect(no).toContain('"Colonia, con coma"');
  });
});

describe("idempotencia", () => {
  const datos = () => csv(
    fila("Jardines del Bosque", "Guadalajara"),
    fila("Col. Del Fresno", "Guadalajara"),
    fila("Centro", "Zapopan"),
  );

  it("importar dos veces el mismo archivo no duplica filas", async () => {
    correr(datos());
    const antes = await med();
    const { r } = correr(datos());
    expect(r.status, r.stderr).toBe(0);
    expect(await med()).toEqual(antes);
    expect((await bd.pool.query("SELECT count(*)::int AS n FROM mediciones_externas")).rows[0].n).toBe(3);
  });

  it("filas realmente idénticas dentro del archivo se conservan como filas distintas (hash con contador)", async () => {
    correr(csv(fila("Jardines del Bosque", "Guadalajara"), fila("Jardines del Bosque", "Guadalajara")));
    expect(await med()).toHaveLength(2);
    correr(csv(fila("Jardines del Bosque", "Guadalajara"), fila("Jardines del Bosque", "Guadalajara")));
    expect(await med()).toHaveLength(2);
  });

  it("el vínculo se recalcula en cada corrida si cambia la cartografía", async () => {
    correr(datos());
    expect(porTexto(await med(), "Col. Del Fresno")).toMatchObject({ colonia_id: ids.fresno });
    // aparece otra colonia con el mismo núcleo: ahora es ambiguo y debe dejar de vincularse
    await insertarColonia(bd.pool, "Del Fresno", "Guadalajara", -103.9, 20.6);
    correr(datos());
    expect(porTexto(await med(), "Col. Del Fresno")).toMatchObject({ colonia_id: null, confianza_vinculo: null });
  });

  it("--replace borra solo las filas del mismo archivo que ya no vienen", async () => {
    correr(datos());
    await bd.pool.query(
      `INSERT INTO mediciones_externas (hash_fila, fuente, tipo_fuente, parametro, url, archivo_origen)
       VALUES ('ajena', 'otra', 'oficial', 'p', 'https://x.invalid', 'otro_archivo.csv')`);
    const { r, resumen } = correr(csv(fila("Jardines del Bosque", "Guadalajara")), ["--replace"]);
    expect(r.status, r.stderr).toBe(0);
    expect(resumen.filas_eliminadas_por_replace).toBe(2);
    expect((await med()).map((x) => x.colonia_texto)).toEqual(["Jardines del Bosque", ""]);
  });

  it("--dry-run no cambia la base", async () => {
    const { r } = correr(datos(), ["--dry-run"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("dry-run");
    expect(await med()).toEqual([]);
  });

  it("borrar una colonia deja la medición con colonia_id NULL (no se pierde el dato)", async () => {
    correr(csv(fila("Jardines del Bosque", "Guadalajara")));
    await bd.pool.query("DELETE FROM colonias WHERE id = $1", [ids.bosque]);
    expect(await med()).toMatchObject([{ colonia_id: null }]);
  });
});

describe("validación de filas y de archivo", () => {
  it("rechaza filas inválidas (tipo, URL, fecha, valor, columnas) con su número de línea y sigue con las buenas", async () => {
    const { r, resumen } = correr(
      csv(
        fila("Jardines del Bosque", "Guadalajara"),
        fila("A", "Zapopan", "turbiedad", "1", { tipo: "inventada" }),
        fila("B", "Zapopan", "turbiedad", "1", { url: "ftp://nada" }),
        fila("C", "Zapopan", "turbiedad", "1", { url: "" }),
        fila("D", "Zapopan", "turbiedad", "1", { fecha: "01/10/2026" }),
        fila("E", "Zapopan", "turbiedad", "mucho"),
        fila("F", "Zapopan", "", "1"),
        "solo,tres,columnas",
      ),
    );
    expect(r.status, r.stderr).toBe(0);
    expect(resumen.filas_importadas).toBe(1);
    expect(resumen.filas_rechazadas).toBe(7);
    expect(r.stderr).toMatch(/mediciones_externas\.csv:3 tipo_fuente inválido/);
    expect(r.stderr).toMatch(/:4 sin URL/);
    expect(r.stderr).toMatch(/:6 fecha inválida/);
    expect(r.stderr).toMatch(/:7 valor no numérico/);
    expect(r.stderr).toMatch(/:9 tiene 3 columnas/);
    expect(await med()).toHaveLength(1);
  });

  it("encabezado inesperado -> error y no importa nada", async () => {
    const { r } = correr("colonia,municipio,otra\nA,B,C\n");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/encabezado inesperado/);
    expect(await med()).toEqual([]);
  });

  it("soporta BOM y finales de línea CRLF", async () => {
    const { r } = correr("﻿" + csv(fila("Jardines del Bosque", "Guadalajara")).replace(/\n/g, "\r\n"));
    expect(r.status, r.stderr).toBe(0);
    expect(await med()).toHaveLength(1);
    expect((await med())[0].confianza_vinculo).toBe("alta");
  });

  it("archivo inexistente -> error", async () => {
    const r = correrScript("import-oficial.ts", ["--archivo", join(sb.dirOficial, "nada.csv")], { cwd: sb.cwd, url: bd.url });
    expect(r.status).toBe(1);
  });

  it("una base sin colonias reales avisa y no vincula nada", async () => {
    await bd.pool.query("DELETE FROM colonias");
    const { r } = correr(csv(fila("Jardines del Bosque", "Guadalajara")));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/AVISO/);
    expect((await med())[0].colonia_id).toBeNull();
  });

  it("--todos exige los tres archivos de data/oficial", async () => {
    const r = correrScript("import-oficial.ts", ["--todos", "--sin-salida"], { cwd: sb.cwd, url: bd.url });
    expect(r.status).toBe(1); // en el sandbox no existen
  });
});
