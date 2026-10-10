/**
 * Importa datos externos (CSV de data/oficial/) a mediciones_externas y los vincula a
 * colonias reales por nombre normalizado + municipio. Idempotente (hash por fila).
 *
 *   pnpm import:oficial [--archivo ../data/oficial/mediciones_externas.csv] [--todos]
 *                       [--replace] [--dry-run] [--sin-salida]
 *
 *   --todos        importa los tres CSV de data/oficial (principal, sin_colonia, históricos)
 *   --replace      borra las filas del mismo archivo que ya no están en el CSV
 *   --dry-run      calcula y escribe los CSV de salida pero revierte la BD
 *   --sin-salida   no escribe no_vinculadas.csv / vinculos_a_revisar.csv
 *
 * Vinculación (ver web/lib/oficial-normalizar.ts): alta = nombre idéntico salvo acentos/mayúsculas/puntuación
 * y único en el municipio; media = idéntico en forma núcleo o muy similar; baja = parecido no concluyente.
 * Homónimos, municipio sin cartografía o sin parecido razonable NO se vinculan: van a no_vinculadas.csv.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Pool } from "pg";
import { IndiceColonias, municipioCanonico, type ResultadoVinculo } from "../lib/oficial-normalizar";

const COLUMNAS = ["colonia", "municipio", "fuente", "tipo_fuente", "fecha", "parametro", "valor", "unidad", "url", "notas"] as const;
const TIPOS = new Set(["oficial", "academica", "periodistica", "ciudadana"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

/** CSV RFC 4180: campos entre comillas, comillas dobles escapadas y saltos de línea dentro de comillas. */
function parseCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); if (fila.some((x) => x !== "")) filas.push(fila); }
  return filas;
}

function csvEscapar(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const aCsv = (cols: string[], filas: Record<string, unknown>[]) =>
  [cols.join(","), ...filas.map((f) => cols.map((c) => csvEscapar(f[c])).join(","))].join("\n") + "\n";

interface Fila {
  colonia: string; municipio: string; fuente: string; tipo_fuente: string; fecha: string;
  parametro: string; valor: string; unidad: string; url: string; notas: string;
}
interface Preparada extends Fila {
  hash: string; ambito: "colonia" | "municipio" | "zmg"; archivo: string;
  vinculo: ResultadoVinculo | null; valorNum: number | null;
}

function leerArchivo(ruta: string): { filas: Fila[]; rechazadas: string[] } {
  const [cab, ...datos] = parseCsv(readFileSync(ruta, "utf8"));
  if (!cab || COLUMNAS.some((c, i) => cab[i]?.trim() !== c)) {
    throw new Error(`${ruta}: encabezado inesperado (${cab?.join(",")}). Se esperaba: ${COLUMNAS.join(",")}`);
  }
  const filas: Fila[] = [];
  const rechazadas: string[] = [];
  datos.forEach((d, i) => {
    const f = Object.fromEntries(COLUMNAS.map((c, k) => [c, (d[k] ?? "").trim()])) as unknown as Fila;
    const n = i + 2;
    if (d.length !== COLUMNAS.length) return rechazadas.push(`${basename(ruta)}:${n} tiene ${d.length} columnas`), undefined;
    if (!TIPOS.has(f.tipo_fuente)) return rechazadas.push(`${basename(ruta)}:${n} tipo_fuente inválido "${f.tipo_fuente}"`), undefined;
    if (!/^https?:\/\//.test(f.url)) return rechazadas.push(`${basename(ruta)}:${n} sin URL de fuente`), undefined;
    if (!f.parametro || !f.fuente) return rechazadas.push(`${basename(ruta)}:${n} sin parámetro o fuente`), undefined;
    if (f.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return rechazadas.push(`${basename(ruta)}:${n} fecha inválida "${f.fecha}"`), undefined;
    if (f.valor && !Number.isFinite(Number(f.valor))) return rechazadas.push(`${basename(ruta)}:${n} valor no numérico "${f.valor}"`), undefined;
    filas.push(f);
  });
  return { filas, rechazadas };
}

async function main() {
  const dirOficial = join(process.cwd(), "..", "data", "oficial");
  const archivos = flag("todos")
    ? ["mediciones_externas.csv", "mediciones_sin_colonia.csv", "mediciones_historicas_pre2025.csv"].map((f) => join(dirOficial, f))
    : [arg("archivo") ?? join(dirOficial, "mediciones_externas.csv")];
  const esPrincipal = archivos.length > 1 || basename(archivos[0]) === "mediciones_externas.csv";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reales = (await client.query("SELECT id, nombre, municipio FROM colonias")).rows;
    if (!reales.length) console.warn("AVISO: la BD no tiene colonias reales; ninguna fila se vinculará (importa antes los polígonos).");
    const indice = new IndiceColonias(reales);

    const todas: Preparada[] = [];
    const rechazadas: string[] = [];
    for (const ruta of archivos) {
      const { filas, rechazadas: r } = leerArchivo(ruta);
      rechazadas.push(...r);
      const vistos = new Map<string, number>();
      for (const f of filas) {
        const base = createHash("sha1").update(COLUMNAS.map((c) => f[c]).join("␟")).digest("hex");
        const k = vistos.get(base) ?? 0;
        vistos.set(base, k + 1);
        const muniCanon = municipioCanonico(f.municipio);
        const ambito: Preparada["ambito"] = f.colonia ? "colonia" : muniCanon ? "municipio" : "zmg";
        todas.push({
          ...f, hash: k ? `${base}#${k}` : base, ambito, archivo: basename(ruta),
          valorNum: f.valor ? Number(f.valor) : null,
          vinculo: ambito === "colonia" ? indice.vincular(f.colonia, f.municipio) : null,
        });
      }
    }

    // Persistir (upsert por hash_fila; el vínculo se recalcula en cada corrida)
    for (let i = 0; i < todas.length; i += 200) {
      const b = todas.slice(i, i + 200);
      const v = (p: Preparada) => (p.vinculo?.ok ? p.vinculo : null);
      await client.query(
        `INSERT INTO mediciones_externas (hash_fila, ambito, colonia_id, confianza_vinculo, metodo_vinculo, similitud,
           colonia_texto, municipio_texto, fuente, tipo_fuente, fecha, parametro, valor, unidad, url, notas, archivo_origen)
         SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::real[], $7::text[], $8::text[],
           $9::text[], $10::text[], $11::date[], $12::text[], $13::float8[], $14::text[], $15::text[], $16::text[], $17::text[])
         ON CONFLICT (hash_fila) DO UPDATE SET
           ambito = EXCLUDED.ambito, colonia_id = EXCLUDED.colonia_id, confianza_vinculo = EXCLUDED.confianza_vinculo,
           metodo_vinculo = EXCLUDED.metodo_vinculo, similitud = EXCLUDED.similitud, notas = EXCLUDED.notas,
           archivo_origen = EXCLUDED.archivo_origen, importada_en = now()`,
        [
          b.map((p) => p.hash), b.map((p) => p.ambito), b.map((p) => v(p)?.id ?? null),
          b.map((p) => v(p)?.confianza ?? null), b.map((p) => v(p)?.metodo ?? null), b.map((p) => v(p)?.similitud ?? null),
          b.map((p) => p.colonia), b.map((p) => p.municipio), b.map((p) => p.fuente), b.map((p) => p.tipo_fuente),
          b.map((p) => p.fecha || null), b.map((p) => p.parametro), b.map((p) => p.valorNum), b.map((p) => p.unidad || null),
          b.map((p) => p.url), b.map((p) => p.notas || null), b.map((p) => p.archivo),
        ],
      );
    }
    let eliminadas = 0;
    if (flag("replace")) {
      for (const a of new Set(todas.map((p) => p.archivo))) {
        eliminadas += (await client.query(
          "DELETE FROM mediciones_externas WHERE archivo_origen = $1 AND NOT (hash_fila = ANY($2::text[]))",
          [a, todas.filter((p) => p.archivo === a).map((p) => p.hash)])).rowCount ?? 0;
      }
    }

    // ---- Resumen y archivos de salida ----
    const deColonia = todas.filter((p) => p.ambito === "colonia");
    const cuenta = <T,>(xs: T[], k: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[k(x)] = (m[k(x)] ?? 0) + 1), m), {});
    const vinculadas = deColonia.filter((p) => p.vinculo?.ok);
    const sin = deColonia.filter((p) => p.vinculo && !p.vinculo.ok);
    const coloniasUnicas = (xs: Preparada[]) => new Set(xs.map((p) => `${p.colonia}|${p.municipio}`)).size;
    const resumen = {
      archivos: archivos.map((a) => basename(a)),
      filas_importadas: todas.length,
      filas_rechazadas: rechazadas.length,
      por_ambito: cuenta(todas, (p) => p.ambito),
      filas_de_colonia: deColonia.length,
      vinculadas_por_confianza: cuenta(vinculadas, (p) => (p.vinculo as { confianza: string }).confianza),
      no_vinculadas: sin.length,
      no_vinculadas_por_motivo: cuenta(sin, (p) => (p.vinculo as { motivo: string }).motivo),
      colonias_distintas_en_fuente: coloniasUnicas(deColonia),
      colonias_distintas_vinculadas: coloniasUnicas(vinculadas),
      colonias_reales_con_dato: new Set(vinculadas.map((p) => (p.vinculo as { id: number }).id)).size,
      vinculadas_por_municipio: cuenta(vinculadas, (p) => municipioCanonico(p.municipio) ?? p.municipio),
      no_vinculadas_por_municipio: cuenta(sin, (p) => municipioCanonico(p.municipio) ?? p.municipio),
      filas_eliminadas_por_replace: eliminadas,
    };
    console.log(JSON.stringify(resumen, null, 2));
    if (rechazadas.length) console.warn("Filas rechazadas:\n  " + rechazadas.join("\n  "));

    if (!flag("sin-salida")) {
      const sufijo = esPrincipal ? "" : `_${basename(archivos[0]).replace(/\.csv$/i, "")}`;
      // Una fila por (colonia, municipio, fuente) para que sea revisable por una persona
      const grupos = new Map<string, Preparada[]>();
      for (const p of sin) {
        const k = `${p.colonia}|${p.municipio}|${p.fuente}`;
        grupos.set(k, [...(grupos.get(k) ?? []), p]);
      }
      const noVinc = [...grupos.values()].map((g) => {
        const r = g[0].vinculo as { motivo: string; candidatos: string[] };
        return {
          colonia: g[0].colonia, municipio: g[0].municipio, fuente: g[0].fuente, tipo_fuente: g[0].tipo_fuente,
          parametros: [...new Set(g.map((x) => x.parametro))].join(";"), filas: g.length,
          motivo: r.motivo, candidatos_cartografia: r.candidatos.join(" | "), url: g[0].url,
        };
      }).sort((a, b) => a.municipio.localeCompare(b.municipio) || a.colonia.localeCompare(b.colonia));
      const rutaNo = join(dirOficial, `no_vinculadas${sufijo}.csv`);
      writeFileSync(rutaNo, aCsv(["colonia", "municipio", "fuente", "tipo_fuente", "parametros", "filas", "motivo", "candidatos_cartografia", "url"], noVinc));

      const dudosas = new Map<string, Record<string, unknown>>();
      for (const p of vinculadas) {
        const v = p.vinculo as Extract<ResultadoVinculo, { ok: true }>;
        if (v.confianza === "alta") continue;
        dudosas.set(`${p.colonia}|${p.municipio}|${p.fuente}`, {
          colonia_fuente: p.colonia, municipio_fuente: p.municipio, fuente: p.fuente, colonia_id: v.id,
          colonia_cartografia: v.candidato, confianza_vinculo: v.confianza, metodo: v.metodo, similitud: v.similitud,
        });
      }
      const rutaRev = join(dirOficial, `vinculos_a_revisar${sufijo}.csv`);
      writeFileSync(rutaRev, aCsv(["colonia_fuente", "municipio_fuente", "fuente", "colonia_id", "colonia_cartografia", "confianza_vinculo", "metodo", "similitud"],
        [...dudosas.values()].sort((a, b) => String(a.confianza_vinculo).localeCompare(String(b.confianza_vinculo)) || Number(a.similitud) - Number(b.similitud))));
      console.log(`\nEscribí ${rutaNo} (${noVinc.length} colonias/fuente) y ${rutaRev} (${dudosas.size}).`);
    }

    await client.query(flag("dry-run") ? "ROLLBACK" : "COMMIT");
    if (flag("dry-run")) console.log("(dry-run: la BD no cambió)");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
