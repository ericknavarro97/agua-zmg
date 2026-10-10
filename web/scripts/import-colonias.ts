/**
 * Importa polígonos de colonias (GeoJSON o Shapefile) a PostGIS. Idempotente:
 * el upsert usa una clave estable (municipio + nombre normalizados, con id_fuente
 * si hay homónimos), así que reimportar no duplica ni cambia los ids (y los reportes
 * de vecinos siguen apuntando a su colonia).
 *
 *   pnpm import:colonias <archivo.geojson|archivo.shp> [opciones]
 *
 *   --fuente-geom ine_colonias|iieg|inegi_ageb|sepomex|osm  (se detecta de la propiedad "fuente" si falta)
 *   --anio 2020            año de la fuente (por defecto el de cada fuente conocida)
 *   --srid 4326            SRID de entrada (p. ej. 32613 si el SHP viene en UTM)
 *   --name-field / --muni-field / --cp-field / --id-field   nombres de propiedad si no son los usuales
 *   --replace              borra colonias de ESTA fuente (y las de origen 'desconocida') que ya no vienen
 *                          en el archivo, salvo las que tienen reportes (esas se conservan y se avisa)
 *   --sobrescribir-fuente  permite que esta fuente reemplace el polígono de una colonia que venía de otra
 *   --dry-run              hace todo y revierte (solo imprime el reporte de calidad)
 *   --reporte ruta.json    guarda el reporte de calidad
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import * as shapefile from "shapefile";
import { claveMunicipio, municipioCanonico, normalizarTexto } from "../lib/oficial-normalizar";

type Feature = { properties: Record<string, unknown> | null; geometry: { type: string } | null };

const FUENTES: Record<string, { anio: number | null; detectar: RegExp }> = {
  ine_colonias: { anio: 2020, detectar: /\bINE\b/i },
  iieg: { anio: 2020, detectar: /IIEG/i },
  inegi_ageb: { anio: 2025, detectar: /AGEB/i },
  sepomex: { anio: null, detectar: /SEPOMEX|Correos/i },
  osm: { anio: null, detectar: /OpenStreetMap|OSM/i },
};

const NAME_CANDIDATES = ["nombre", "NOMBRE", "COLONIA", "NOM_COL", "NOM_COLONIA", "colonia", "name"];
const MUNI_CANDIDATES = ["municipio", "MUNICIPIO", "NOM_MUN", "MUN", "MUNS", "mun"];
const CP_CANDIDATES = ["cp", "CP", "d_codigo"];
const ID_CANDIDATES = ["id_fuente", "ID", "NUMCOL", "id"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function pick(props: Record<string, unknown>, forced: string | undefined, candidates: string[]): string | null {
  const key = forced ?? candidates.find((c) => c in props && props[c] != null && String(props[c]).trim() !== "");
  const v = key ? props[key] : undefined;
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s || null;
}

// "LOMAS DE SAN PEDRO" -> "Lomas de San Pedro" (solo cuando el nombre viene todo en mayúsculas)
const PART = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "en", "con", "al"]);
function titulo(s: string): string {
  if (/[a-zñáéíóúü]/.test(s)) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && PART.has(w) ? w : w.replace(/(^|[(\-"'.])([a-zñáéíóúü])/g, (_, p, c) => p + c.toUpperCase())))
    .join(" ");
}

async function readFeatures(path: string): Promise<Feature[]> {
  if (/\.shp$/i.test(path)) {
    const src = await shapefile.open(path);
    const out: Feature[] = [];
    for (let r = await src.read(); !r.done; r = await src.read()) out.push(r.value as Feature);
    return out;
  }
  if (/\.(geo)?json$/i.test(path)) {
    return JSON.parse(readFileSync(path, "utf8")).features as Feature[];
  }
  throw new Error("Formato no soportado. Usa .geojson o .shp (convierte KML con ogr2ogr/mapshaper).");
}

const SIN_NOMBRE = /^(sin nombre|s\/n|null|undefined|-+|\.+)$/i;

async function main() {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    throw new Error("Uso: pnpm import:colonias <archivo> [--fuente-geom X] [--anio N] [--srid N] [--replace] [--dry-run] (ver cabecera del script)");
  }
  const srid = Number(arg("srid") ?? 4326);
  const features = await readFeatures(path);

  // Fuente de los polígonos
  let fuente = arg("fuente-geom");
  if (!fuente) {
    const f = String(features.find((x) => x.properties?.fuente)?.properties?.fuente ?? "");
    fuente = Object.entries(FUENTES).find(([, v]) => v.detectar.test(f))?.[0];
    if (!fuente) throw new Error(`No pude detectar la fuente (propiedad "fuente": "${f}"). Pasa --fuente-geom (${Object.keys(FUENTES).join("|")}).`);
    console.log(`Fuente detectada: ${fuente}`);
  }
  if (!(fuente in FUENTES)) throw new Error(`--fuente-geom inválida: ${fuente}`);
  const anio = arg("anio") ? Number(arg("anio")) : FUENTES[fuente].anio;
  if (fuente === "inegi_ageb" || fuente === "sepomex") {
    console.warn(`AVISO: "${fuente}" NO son colonias (ver tabla fuentes_geom). Importa solo como respaldo de cobertura.`);
  }

  // Normalizar entradas (nada de BD todavía)
  const rep = {
    archivo: path, fuente_geom: fuente, anio_fuente: anio, leidas: features.length,
    omitidas_sin_geometria: 0, omitidas_sin_nombre: 0, omitidas_vacias: 0,
    sin_municipio: 0, municipio_no_zmg: 0, geometrias_invalidas_corregidas: 0,
    duplicados_exactos_unificados: 0, homonimos_desambiguados: 0,
  } as Record<string, unknown> & { omitidas_sin_geometria: number; omitidas_sin_nombre: number; sin_municipio: number; municipio_no_zmg: number };
  const filas: { ord: number; nombre: string; nn: string; muni: string | null; mn: string; cp: string | null; idf: string | null; gj: string }[] = [];
  features.forEach((f, ord) => {
    if (!f.geometry || !/Polygon/.test(f.geometry.type)) { rep.omitidas_sin_geometria++; return; }
    const props = f.properties ?? {};
    const nombreRaw = pick(props, arg("name-field"), NAME_CANDIDATES);
    if (!nombreRaw || SIN_NOMBRE.test(nombreRaw)) { rep.omitidas_sin_nombre++; return; }
    const nombre = titulo(nombreRaw);
    const muniRaw = pick(props, arg("muni-field"), MUNI_CANDIDATES);
    const canon = municipioCanonico(muniRaw);
    if (!muniRaw) rep.sin_municipio++;
    else if (!canon) rep.municipio_no_zmg++;
    const muni = canon ?? muniRaw;
    filas.push({
      ord, nombre, nn: normalizarTexto(nombre), muni, mn: claveMunicipio(muni),
      cp: pick(props, arg("cp-field"), CP_CANDIDATES), idf: pick(props, arg("id-field"), ID_CANDIDATES),
      gj: JSON.stringify(f.geometry),
    });
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const dry = flag("dry-run");
  try {
    await client.query("BEGIN");

    await client.query(`CREATE TEMP TABLE _imp (
      ord int, nombre text, nombre_norm text, municipio text, municipio_norm text, cp text, id_fuente text,
      geom geometry, valida_origen boolean, area_m2 double precision, clave text) ON COMMIT DROP`);
    for (let i = 0; i < filas.length; i += 150) {
      const b = filas.slice(i, i + 150);
      await client.query(
        `INSERT INTO _imp (ord, nombre, nombre_norm, municipio, municipio_norm, cp, id_fuente, geom, valida_origen)
         SELECT t.o, t.n, t.nn, t.m, t.mn, t.cp, t.idf, x.g, ST_IsValid(x.g)
         FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
              AS t(o, n, nn, m, mn, cp, idf, gj),
              LATERAL (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(t.gj), $9::int), 4326) AS g) x`,
        [b.map((r) => r.ord), b.map((r) => r.nombre), b.map((r) => r.nn), b.map((r) => r.muni), b.map((r) => r.mn),
          b.map((r) => r.cp), b.map((r) => r.idf), b.map((r) => r.gj), srid],
      );
    }
    // Coordenadas fuera de lon/lat: casi seguro el archivo viene en metros (UTM, LCC) y falta --srid
    const fuera = (await client.query("SELECT count(*)::int AS n FROM _imp WHERE NOT (geom @ ST_MakeEnvelope(-180, -90, 180, 90, 4326))")).rows[0].n as number;
    if (fuera > 0) throw new Error(`${fuera} geometrías con coordenadas fuera de rango lon/lat: ¿el archivo no está en WGS84? Pasa --srid (p. ej. 32613).`);
    rep.geometrias_invalidas_corregidas =(await client.query("SELECT count(*)::int AS n FROM _imp WHERE NOT valida_origen")).rows[0].n;

    // Reparar: MakeValid -> solo polígonos -> quitar astillas (< 1 m2) -> MultiPolygon
    await client.query(`UPDATE _imp SET geom = (
        SELECT ST_Multi(ST_Collect(d.geom))
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(geom), 3)) d
        WHERE ST_Area(d.geom::geography) > 1)`);
    rep.omitidas_vacias = (await client.query("DELETE FROM _imp WHERE geom IS NULL OR ST_IsEmpty(geom)")).rowCount;
    await client.query("UPDATE _imp SET area_m2 = round(ST_Area(geom::geography)::numeric)::float8, clave = municipio_norm || '|' || nombre_norm");

    // Duplicados exactos (misma clave y misma geometría): se queda el primero
    rep.duplicados_exactos_unificados = (await client.query(
      `DELETE FROM _imp a USING _imp b WHERE a.clave = b.clave AND a.ord > b.ord AND ST_Equals(a.geom, b.geom)`)).rowCount;
    // Homónimos distintos dentro del mismo municipio: la clave añade el id de la fuente (o un hash del punto interior)
    rep.homonimos_desambiguados = (await client.query(
      `UPDATE _imp SET clave = clave || '#' || COALESCE(id_fuente, md5(ST_AsText(ST_SnapToGrid(ST_PointOnSurface(geom), 0.00001))))
       WHERE clave IN (SELECT clave FROM _imp GROUP BY clave HAVING count(*) > 1)`)).rowCount;
    const dupFinal = (await client.query("SELECT count(*)::int AS n FROM (SELECT clave FROM _imp GROUP BY clave HAVING count(*) > 1) q")).rows[0].n;
    if (dupFinal > 0) throw new Error(`${dupFinal} claves siguen repetidas tras desambiguar; revisa --id-field.`);

    const sobrescribir = flag("sobrescribir-fuente");
    rep.bloqueadas_por_otra_fuente = sobrescribir ? 0 : (await client.query(
      `SELECT count(*)::int AS n FROM _imp i JOIN colonias c ON c.clave = i.clave WHERE c.fuente_geom <> $1`, [fuente])).rows[0].n;

    // UPDATE primero y luego INSERT de lo nuevo (evita gastar ids de la secuencia en cada reimportación)
    const upd = await client.query(
      `UPDATE colonias c SET
         nombre = i.nombre, municipio = i.municipio, geom = i.geom, fuente_geom = $1, anio_fuente = $2::smallint,
         nombre_norm = i.nombre_norm, municipio_norm = i.municipio_norm, cp = i.cp, area_m2 = i.area_m2,
         id_fuente = i.id_fuente, actualizada_en = now()
       FROM _imp i
       WHERE c.clave = i.clave AND (c.fuente_geom = $1 OR $3::boolean)
         AND ((c.nombre, c.municipio, c.cp, c.id_fuente, c.anio_fuente, c.fuente_geom)
              IS DISTINCT FROM (i.nombre, i.municipio, i.cp, i.id_fuente, $2::smallint, $1)
              OR NOT ST_OrderingEquals(c.geom, i.geom))`,
      [fuente, anio, sobrescribir],
    );
    const ins = await client.query(
      `INSERT INTO colonias (nombre, municipio, geom, fuente_geom, anio_fuente, clave, nombre_norm, municipio_norm, cp, area_m2, id_fuente)
       SELECT nombre, municipio, geom, $1, $2::smallint, clave, nombre_norm, municipio_norm, cp, area_m2, id_fuente
       FROM _imp i WHERE NOT EXISTS (SELECT 1 FROM colonias c WHERE c.clave = i.clave)`,
      [fuente, anio],
    );
    rep.nuevas = ins.rowCount;
    rep.actualizadas = upd.rowCount;
    const staged = (await client.query("SELECT count(*)::int AS n FROM _imp")).rows[0].n as number;
    rep.sin_cambios = staged - ins.rowCount! - upd.rowCount! - (rep.bloqueadas_por_otra_fuente as number);

    // --replace: quitar lo de esta fuente (y 'desconocida') que ya no viene, salvo lo que tiene reportes
    if (flag("replace")) {
      const sobran = `FROM colonias c WHERE c.fuente_geom IN ($1, 'desconocida')
                      AND (c.clave IS NULL OR c.clave NOT IN (SELECT clave FROM _imp))`;
      const conReportes = (await client.query(
        `SELECT c.id, c.nombre, c.municipio ${sobran} AND EXISTS (SELECT 1 FROM reportes r WHERE r.colonia_id = c.id)`, [fuente])).rows;
      rep.replace_conservadas_con_reportes = conReportes.map((r) => `${r.id} ${r.nombre} (${r.municipio})`);
      rep.replace_eliminadas = (await client.query(
        `DELETE FROM colonias WHERE id IN (SELECT c.id ${sobran} AND NOT EXISTS (SELECT 1 FROM reportes r WHERE r.colonia_id = c.id))`, [fuente])).rowCount;
    }

    // ---- Reporte de calidad sobre el estado final ----
    const q = async (sql: string, p: unknown[] = []) => (await client.query(sql, p)).rows;
    rep.en_bd_de_esta_fuente = (await q("SELECT count(*)::int AS n FROM colonias WHERE fuente_geom = $1", [fuente]))[0].n;
    rep.por_municipio = Object.fromEntries((await q(
      "SELECT coalesce(municipio,'(sin municipio)') AS m, count(*)::int AS n FROM colonias WHERE fuente_geom = $1 GROUP BY 1 ORDER BY 2 DESC", [fuente])).map((r) => [r.m, r.n]));
    rep.invalidas_en_bd = (await q("SELECT count(*)::int AS n FROM colonias WHERE NOT ST_IsValid(geom)"))[0].n;
    rep.vacias_en_bd = (await q("SELECT count(*)::int AS n FROM colonias WHERE ST_IsEmpty(geom)"))[0].n;
    rep.sin_municipio_en_bd = (await q("SELECT count(*)::int AS n FROM colonias WHERE municipio IS NULL"))[0].n;
    const sol = await q(
      `WITH p AS (
         SELECT a.id AS a_id, b.id AS b_id, a.nombre AS a_nombre, b.nombre AS b_nombre, a.municipio AS a_mun, b.municipio AS b_mun,
                ST_Area(ST_Intersection(a.geom, b.geom)) / NULLIF(LEAST(ST_Area(a.geom), ST_Area(b.geom)), 0) AS r
         FROM colonias a JOIN colonias b ON a.id < b.id AND a.geom && b.geom AND ST_Intersects(a.geom, b.geom)
         )
       SELECT * FROM p WHERE r >= 0.05 ORDER BY r DESC`);
    rep.solapes = {
      anidados_95pct_o_mas: sol.filter((s) => s.r >= 0.95).length,
      graves_25_a_95pct: sol.filter((s) => s.r >= 0.25 && s.r < 0.95).length,
      leves_5_a_25pct: sol.filter((s) => s.r < 0.25).length,
    };
    rep.solapes_graves_ejemplos = sol.filter((s) => s.r >= 0.25 && s.r < 0.95).slice(0, 10)
      .map((s) => `${s.a_nombre} (${s.a_mun}) x ${s.b_nombre} (${s.b_mun}): ${(s.r * 100).toFixed(0)}% del menor`);
    rep.nota_anidados = "Polígonos contenidos en otro: para ubicar un punto elegir el de menor area_m2.";

    await client.query(dry ? "ROLLBACK" : "COMMIT");
    console.log(JSON.stringify(rep, null, 2));
    console.log(dry ? "\n(dry-run: nada se guardó)" : "\nListo.");
    if (arg("reporte")) writeFileSync(arg("reporte")!, JSON.stringify(rep, null, 2));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
