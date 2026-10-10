// Genera los GeoJSON finales (EPSG:4326) a partir de las tablas de staging (ver stage-load.mjs)
// y de data/raw/arcgis-iieg-colonias-amg. Uso:
//   DATABASE_URL=postgres://... node data/scripts/build-colonias.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "web", "package.json"));
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const out = (f) => join(root, "data", f);

const ZMG = [
  "Guadalajara", "Zapopan", "San Pedro Tlaquepaque", "Tonalá", "Tlajomulco de Zúñiga",
  "El Salto", "Juanacatlán", "Ixtlahuacán de los Membrillos", "Zapotlanejo",
];

// Claves INEGI de municipio -> nombre oficial (el catálogo trae variantes: "Tlaquepaque")
const CVE_MUN = {
  "039": "Guadalajara", "120": "Zapopan", "098": "San Pedro Tlaquepaque", "101": "Tonalá",
  "097": "Tlajomulco de Zúñiga", "070": "El Salto", "051": "Juanacatlán",
  "044": "Ixtlahuacán de los Membrillos", "124": "Zapotlanejo",
};

// "LOMAS DE SAN PEDRO" -> "Lomas de San Pedro" (partículas en minúscula, numerales romanos intactos)
const PART = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "en", "con", "al"]);
const ROMAN = /^(?=[ivxlcdm]+$)(?:m{0,3})(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;
function titulo(s) {
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i, arr) => {
      if (/^\s+$/.test(w) || !w) return w;
      const first = arr.findIndex((x) => x.trim()) === i;
      if (!first && PART.has(w)) return w;
      if (w.length <= 4 && ROMAN.test(w)) return w.toUpperCase();
      return w.replace(/(^|[(\-"'.])([a-zñáéíóúü])/g, (_, p, c) => p + c.toUpperCase());
    })
    .join("");
}


// Quita partes poligonales degeneradas (< ~1 m2) que dejan GeometryCollection al revalidar
const ringArea = (r) => Math.abs(r.reduce((a, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + (x * y2 - x2 * y); }, 0) / 2);
function limpiar(geom) {
  const polys = (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates)
    .filter((p) => ringArea(p[0]) - p.slice(1).reduce((a, h) => a + ringArea(h), 0) > 1e-10);
  return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
}

function fc(features, extra = {}) {
  return { type: "FeatureCollection", ...extra, features };
}
const conteo = (fs) => {
  const c = {};
  for (const f of fs) c[f.properties.municipio] = (c[f.properties.municipio] ?? 0) + 1;
  return c;
};

async function main() {
  // 1) Principal: colonias INE 2020, 9 municipios de la ZMG
  const r = await pool.query(
    `WITH base AS (
       SELECT id, props, mun,
              ST_CollectionExtract(ST_MakeValid(ST_SnapToGrid(ST_CollectionExtract(ST_MakeValid(g4326), 3), 0.000001)), 3) AS g
       FROM st_ine WHERE mun = ANY($1)
     ), limpio AS (
       SELECT *, ST_Area(g::geography) AS area_m2 FROM base WHERE NOT ST_IsEmpty(g)
     ), dedup AS (
       SELECT DISTINCT ON (mun, props->>'NOMBRE', round(area_m2), ST_AsText(ST_PointOnSurface(g))) *
       FROM limpio ORDER BY mun, props->>'NOMBRE', round(area_m2), ST_AsText(ST_PointOnSurface(g)), id
     )
     SELECT id, props->>'NOMBRE' AS nombre, props->>'CP' AS cp, props->>'ID' AS ine_id, mun, round(area_m2) AS area_m2,
            ST_AsGeoJSON(ST_Multi(g), 6) AS gj
     FROM dedup ORDER BY mun, nombre, id`,
    [ZMG],
  );
  const total = r.rowCount;
  let sinNombre = 0;
  let degeneradas = 0;
  const features = [];
  for (const x of r.rows) {
    if (/^\s*sin nombre\s*$/i.test(x.nombre)) { sinNombre++; continue; }
    const g = limpiar(JSON.parse(x.gj));
    if (!g) { degeneradas++; continue; }
    features.push({
      type: "Feature",
      properties: {
        nombre: titulo(x.nombre.trim()),
        municipio: x.mun,
        fuente: "INE 2020 (colonias.ine, via datamx.io, CC0)",
        cp: x.cp,
        area_m2: Number(x.area_m2),
        id_fuente: x.ine_id,
        nombre_fuente: x.nombre.trim(),
      },
      geometry: g,
    });
  }
  writeFileSync(out("colonias_zmg.geojson"), JSON.stringify(fc(features, { name: "colonias_zmg" })));
  console.log("colonias_zmg.geojson", features.length, "(tras dedup:", total, ", sin nombre omitidas:", sinNombre, ")", conteo(features));

  // 2) Alterna: IIEG/AMG con censo 2020 (capa ArcGIS ITESO), solo 4 municipios nucleares + colindantes
  const raw = JSON.parse(readFileSync(out("raw/arcgis-iieg-colonias-amg/colonias_amg_iieg.geojson"), "utf8"));
  const alt = [];
  for (const f of raw.features) {
    const p = f.properties;
    const mun = String(p.MUNS ?? "").trim();
    alt.push({
      type: "Feature",
      properties: {
        nombre: titulo(String(p.NOMBRE ?? "").trim()),
        municipio: mun || null,
        fuente: "IIEG (capa ArcGIS Online de ITESO, censo 2020)",
        cp: p.CP != null ? String(p.CP) : null,
        pob_total: p.POBTOT ?? null,
        id_fuente: p.NUMCOL != null ? String(p.NUMCOL) : null,
      },
      geometry: f.geometry,
    });
  }
  writeFileSync(out("colonias_zmg_iieg_alterna.geojson"), JSON.stringify(fc(alt, { name: "colonias_zmg_iieg_alterna" })));
  console.log("colonias_zmg_iieg_alterna.geojson", alt.length);

  // 3) Respaldo: AGEB urbanas INEGI (Marco Geoestadístico dic-2025)
  const a = await pool.query(
    `SELECT props, ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SnapToGrid(ST_CollectionExtract(ST_MakeValid(geom),3), 0.000001)),3)), 6) AS gj FROM st_ageb ORDER BY props->>'cvegeo'`,
  );
  const ag = a.rows.map((x) => ({ x, g: limpiar(JSON.parse(x.gj)) })).filter(({ g }) => g).map(({ x, g }) => ({
    type: "Feature",
    properties: {
      nombre: `AGEB ${x.props.cve_ageb}`,
      municipio: CVE_MUN[x.props.cve_agem] ?? x.props.nom_agem,
      fuente: "INEGI Marco Geoestadístico dic-2025 (AGEB urbana)",
      cvegeo: x.props.cvegeo,
      pob_total: Number(x.props.pobtot),
      viviendas_habitadas: Number(x.props.tvivhab),
    },
    geometry: g,
  }));
  writeFileSync(out("ageb_urbanas_zmg.geojson"), JSON.stringify(fc(ag, { name: "ageb_urbanas_zmg" })));
  console.log("ageb_urbanas_zmg.geojson", ag.length, conteo(ag));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
