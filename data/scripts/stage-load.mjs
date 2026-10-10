// Carga las fuentes crudas a tablas de staging en PostGIS (base de trabajo), para
// clasificar municipios, validar y generar data/colonias_zmg.geojson.
// Uso: DATABASE_URL=postgres://... node data/scripts/stage-load.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "web", "package.json"));
const { Pool } = require("pg");
const shapefile = require("shapefile");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const raw = (...p) => join(root, "data", "raw", ...p);

async function ins(table, rows) {
  for (const r of rows) {
    await pool.query(
      `INSERT INTO ${table} (props, geom) VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), $3))`,
      [JSON.stringify(r.props), JSON.stringify(r.geometry), r.srid],
    );
  }
}

async function readShp(path) {
  const src = await shapefile.open(path, undefined, { encoding: "latin1" });
  const out = [];
  for (let r = await src.read(); !r.done; r = await src.read()) out.push(r.value);
  return out;
}

async function main() {
  const mk = (t) => pool.query(`DROP TABLE IF EXISTS ${t}; CREATE TABLE ${t} (id serial primary key, props jsonb, geom geometry)`);
  for (const t of ["st_ine", "st_mun", "st_ageb", "st_cp", "st_sepo12"]) await mk(t);

  // INE 2020 (UTM 13N)
  const ine = JSON.parse(readFileSync(raw("datamx-colonias-ine-2020", "colonias_ine_2020_jalisco.geojson"), "utf8"));
  await ins("st_ine", ine.features.filter((f) => f.geometry).map((f) => ({ props: f.properties, geometry: f.geometry, srid: 32613 })));

  // Municipios INEGI (lon/lat)
  const mun = JSON.parse(readFileSync(raw("inegi-catalogo-geoestadistico", "mgem_14_jalisco.geojson"), "utf8"));
  await ins("st_mun", mun.features.map((f) => ({ props: f.properties, geometry: f.geometry, srid: 4326 })));

  // AGEB urbanas INEGI
  for (const m of ["039", "120", "098", "101", "097", "070", "051", "044", "124"]) {
    const d = JSON.parse(readFileSync(raw("inegi-catalogo-geoestadistico", `agebu_14_${m}.geojson`), "utf8"));
    await ins("st_ageb", d.features.map((f) => ({ props: f.properties, geometry: f.geometry, srid: 4326 })));
  }

  // Polígonos de CP (Correos de México). Ver .prj: Lambert Conformal Conic ITRF2008 (se detecta abajo)
  const cp = await readShp(raw("correos-cp-poligonos", "CP_14Jal_v11.shp"));
  await ins("st_cp", cp.map((f) => ({ props: f.properties, geometry: f.geometry, srid: Number(process.env.CP_SRID ?? 0) })));

  // SEPOMEX 2012 colonias (WGS84), solo Jalisco
  const s12 = await readShp(raw("datamx-colonias-mexico", "Colonias", "Colonias.shp"));
  await ins("st_sepo12", s12.filter((f) => /^jalisco$/i.test(String(f.properties.ST_NAME).trim())).map((f) => ({ props: f.properties, geometry: f.geometry, srid: 4326 })));

  for (const t of ["st_ine", "st_mun", "st_ageb", "st_cp", "st_sepo12"]) {
    const r = await pool.query(`SELECT count(*) FROM ${t}`);
    console.log(t, r.rows[0].count);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
