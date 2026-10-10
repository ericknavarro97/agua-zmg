# Datos geográficos crudos (colonias ZMG)

Descargados el **2026-10-08**. Todo lo de esta carpeta es entrada para `data/scripts/` (ver al final) y
produce `data/colonias_zmg.geojson` (principal) y dos archivos auxiliares. Las pruebas de fuentes que
fallaron están en `docs/research/geodatos.md`.

> Aviso de cobertura: **no se pudo obtener el dataset oficial del IIEG** ("Planimetría ZMG (vuelos 1998-2001),
> colonias") porque `datos.jalisco.gob.mx` no resuelve DNS hoy y Wayback Machine no conserva los archivos.
> El archivo principal usa en su lugar las **colonias INE 2020**, republicadas por terceros (ver riesgos de procedencia).

## Salidas generadas (en `data/`)

| Archivo | Qué representa | Features | Uso |
|---|---|---|---|
| `colonias_zmg.geojson` | **Colonias** (polígonos de colonia/fraccionamiento/barrio, catálogo INE dic-2020) de los 9 municipios de la ZMG | 2,170 | **Principal** |
| `colonias_zmg_iieg_alterna.geojson` | Colonias del AMG según capa derivada del IIEG con censo 2020 (de una cuenta ArcGIS de ITESO). Algunas cruzan municipios | 1,242 | Alterna / comparación; NO mezclar con la principal (se traslapan) |
| `ageb_urbanas_zmg.geojson` | **AGEB urbanas** INEGI (NO son colonias; áreas estadísticas de ~10-60 manzanas) | 2,058 | Respaldo de cobertura / denominador de población |

Propiedades de `colonias_zmg.geojson`: `nombre` (Title Case, **sin acentos: así viene en la fuente**), `municipio` (nombre oficial INEGI),
`fuente`, `cp`, `area_m2`, `id_fuente`, `nombre_fuente` (original en MAYÚSCULAS).
CRS de salida: EPSG:4326. Geometrías redondeadas a 6 decimales (~0.1 m).

### Conteo de `colonias_zmg.geojson` por municipio
Zapopan 710 · Tlajomulco de Zúñiga 348 · Tonalá 332 · Guadalajara 295 · San Pedro Tlaquepaque 269 · El Salto 107 · Zapotlanejo 55 · Ixtlahuacán de los Membrillos 32 · Juanacatlán 22.
Municipio asignado por **intersección espacial** del punto interior de cada polígono con los polígonos municipales de INEGI (no por el código numérico de la fuente, que usa otra numeración).

### Conteo de `colonias_zmg_iieg_alterna.geojson` (campo `municipio` = lista de municipios que toca)
Zapopan 457 · Guadalajara 222 · Tonalá 173 · San Pedro Tlaquepaque 152 · el resto (~238) cruza dos o tres municipios (Guadalajara+Tlaquepaque 57, Guadalajara+Zapopan 52, Tonalá+Tlaquepaque 33, …), 3 sin municipio. Prácticamente no cubre Tlajomulco, El Salto, Juanacatlán, Ixtlahuacán ni Zapotlanejo.

## Fuentes (subcarpetas)

### `datamx-colonias-ine-2020/`  -- FUENTE DE `colonias_zmg.geojson`
- URL: https://datamx.codeandomexico.org/dataset/58330578-c1f9-4dfb-b52c-360273f9d1e2/resource/0a0aa16d-19da-4254-b72f-def51c1dd787/download/coloniasine2020.geojson
  (ficha: https://datamx.io/dataset/colonias-ine-2020). **El servidor tiene el certificado TLS vencido**; se descargó con `curl -k`. Integridad no verificable contra el origen.
- Descripción de la ficha: "GeoJSON con las colonias que maneja el INE, actualizado a 11 de diciembre de 2020". Autor declarado: INE. Licencia declarada en la ficha: **CC0** (no verificada con el INE; es una republicación de terceros).
- Original: 281,891,443 bytes, nacional (107,027 polígonos), CRS **EPSG:32613 (UTM 13N)**. Se eliminó por exceder 150 MB; sha256 del original en `ORIGINAL_SHA256.txt` (7a2cfe7b...). Se conserva `colonias_ine_2020_jalisco.geojson` (solo ENTIDAD=14, 5,588 polígonos, 9.2 MB, mismo CRS; se quitaron los campos `path`, `Geometry1_`, `Geometry2_`, que apuntaban a rutas locales del autor original).
- Campos: `ID`, `ENTIDAD`, `MUNICIPIO` (numeración INE/alfabética, NO es la clave INEGI), `NOMBRE`, `CLASIFICAC` (código numérico sin diccionario; no usado), `CP`, `OTROS_CP`, `CONTROL`, `layer`.

### `arcgis-iieg-colonias-amg/`  -- FUENTE DE `colonias_zmg_iieg_alterna.geojson`
- URL: https://services9.arcgis.com/cgX3zRbhYaPIL2qP/arcgis/rest/services/Datos_de_Colonias_Guadalajara/FeatureServer/0 (consulta paginada, `outSR=4326`, f=geojson). Item ArcGIS Online id `b6e19ae8954e47adaf8e1a65a535920d`, dueño `charlotte.smith_universidaditeso`, creado 2024-06-05.
- Procedencia: capa de un tercero (ITESO). Los campos (`NUMCOL`, `MUNS`, `NOMBRE`, `CP`, `POBTOT`, ... 231 campos de censo) coinciden con el catálogo "Información sociodemográfica por colonia, Área Metropolitana de Guadalajara" del IIEG; otra capa pública hermana (`GDL_COLONIAS_SOCIODEMOGRAFICO`, 222 polígonos de Guadalajara) declara "Datos de instituto de información estadística y geográfica (IIEG)". **La licencia del ítem no está declarada**; la del IIEG original es CC-BY según la ficha del dataset hermano. Verificar antes de redistribuir.
- 1,242 polígonos (todos `Polygon`), CRS original Web Mercator (3857), descargado en 4326. `colonias_amg_iieg.geojson` = unión de las 3 páginas; `layer_info.json` = metadatos de la capa.

### `inegi-catalogo-geoestadistico/`  -- FUENTE DE `ageb_urbanas_zmg.geojson` y de la asignación de municipio
- API pública del Catálogo Único de Claves Geoestadísticas de INEGI: `https://gaia.inegi.org.mx/wscatgeo/geo/mgem/14` (municipios de Jalisco, 125) y `https://gaia.inegi.org.mx/wscatgeo/geo/agebu/14/<cve_mun>` (AGEB urbanas) para 039 Guadalajara, 120 Zapopan, 098 Tlaquepaque, 101 Tonalá, 097 Tlajomulco, 070 El Salto, 051 Juanacatlán, 044 Ixtlahuacán de los Membrillos, 124 Zapotlanejo. Lista de municipios: `.../wscatgeo/v2/mgem/14`.
- Fuente declarada en los metadatos: "INEGI. Marco Geoestadístico, diciembre de 2025"; estadística: Censo 2020. CRS declarado `EPSG:6365`; las coordenadas vienen en grados lon/lat y se tratan como EPSG:4326 (diferencia ITRF2008 vs WGS84 < 1-2 m, irrelevante aquí).
- Licencia: "Términos de Libre Uso de la Información del INEGI" (https://www.inegi.org.mx/inegi/terminos.html: permite copiar, difundir, adaptar; exige no alterar metadatos y citar la fuente).
- AGEB urbanas descargadas: 2,058 (Guadalajara 442, Zapopan 539, Tlajomulco 384, Tlaquepaque 236, Tonalá 229, El Salto 128, Zapotlanejo 45, Ixtlahuacán 37, Juanacatlán 18).

### `correos-cp-poligonos/`  -- respaldo por código postal (SEPOMEX / Correos de México). No se usa en la salida
- URL: https://www.correosdemexico.gob.mx/datosabiertos/poligonos/cp_jal.zip (23.6 MB; http:// agota tiempo, https:// funciona). Ficha: https://datamx.io/dataset/ubicacion-y-poligonos-geograficos-de-los-codigos-postales-en-la-republica-mexicana (licencia no declarada).
- Contenido: `CP_14Jal_v11.shp/.dbf/.shx/.prj` (2,676 polígonos de **código postal**, no colonias), CRS Lambert Conformal Conic ITRF2008 (= **EPSG:6362**), campo `d_codigo`; más KML y un JPG (omitido al extraer por nombre de archivo corrupto).
- `sepomex-open-mexico/14-Jal.geojson` es el mismo dato convertido por https://github.com/open-mexico/mexico-geojson (licencia MIT del repo; el dato es de Correos): 2,676 polígonos, solo `d_codigo`.

### `datamx-colonias-mexico/`  -- NO USADO en la salida (licencia y vigencia dudosas)
- URL: https://datamx.codeandomexico.org/dataset/8ac02ebd-3a48-4e82-8042-c283e3eee1d5/resource/7b5a3b0a-4405-48d6-a4eb-d9f13bb50d3a/download/coloniasmexico.zip (24.7 MB, certificado vencido, `curl -k`). Ficha: https://datamx.io/dataset/colonias-mexico, "License not specified", 2015.
- 58,227 polígonos nacionales, WGS84; Jalisco 2,754 (Zapopan 361, Guadalajara 279, Tonalá 170, Tlaquepaque 145, Tlajomulco 97, El Salto 50). Los metadatos internos (`Colonias.shp.xml`) indican que se derivó de `MEX_2012Q2_PCB_PLY_GEN_region.shp`, un producto de **códigos postales de un proveedor comercial (2012 Q2)**: no hay evidencia de que pueda redistribuirse. Se descomprimió en `Colonias/` solo para comparar. **Recomendación: no publicar ni redistribuir derivados de este archivo.**

### `osm-overpass/`
- Overpass API (https://overpass-api.de/api/interpreter, requiere cabecera User-Agent o responde 406) consultada 2026-10-08 con bbox 20.35,-103.60,20.85,-103.15 y `place=neighbourhood|suburb|quarter`: **656 nodos, 74 vías (polígonos), 0 relaciones**. `place_zmg.json` guarda lo devuelto (cubre una fracción mínima de las colonias). Licencia ODbL (© colaboradores de OpenStreetMap). No se usó en la salida.

### Sin archivos (descargas fallidas)
- IIEG `colonias.zip` / `colonias.kml` (dataset oficial): no accesibles. Ver `docs/research/geodatos.md`.

## Calidad y validación

Importación a PostGIS (base `agua_geo`, `pnpm import:colonias ../data/colonias_zmg.geojson --name-field nombre --muni-field municipio --replace`):

| Archivo | Importadas | Omitidas | Geometrías inválidas en PostGIS (`ST_IsValid`) |
|---|---|---|---|
| `colonias_zmg.geojson` | 2,170 | 0 | 0 |
| `colonias_zmg_iieg_alterna.geojson` | 1,242 | 0 | 0 |
| `ageb_urbanas_zmg.geojson` | 2,058 | 0 | 0 |

Hallazgos sobre la fuente INE (antes de limpiar):
- 6 de 2,200 polígonos ZMG eran inválidos de origen (al menos uno con anillo sin cerrar); 1 se convirtió en `GeometryCollection`. Se corrigió con `ST_MakeValid` + `ST_CollectionExtract` y se descartaron partes degeneradas (< ~1 m2).
- 20 polígonos con nombre "SIN NOMBRE" se **omitieron** del archivo principal; ~10 duplicados exactos (mismo municipio, nombre y geometría) se unificaron.
- **Traslapes**: la teselación es casi limpia (suma de áreas vs. unión: 99.5%-99.9% en Guadalajara, Zapopan, Tlaquepaque, Tonalá), pero hay ~37 pares donde un polígono pequeño está contenido en uno grande (p. ej. fraccionamientos dentro de una colonia mayor). Para ubicar un punto, **elegir el polígono de menor `area_m2`** que lo contenga.
- **Nombres repetidos**: 107 nombres se repiten dentro del mismo municipio (224 features; p. ej. "San Juan" x5 en Tlaquepaque, "Centro" varias veces). Distinguir en la UI con `cp` o con el id interno.
- Los nombres no tienen acentos ni ñ consistentes (vienen así de la fuente).
- Pruebas puntuales: Plaza de Armas de Guadalajara cae en "Zona Centro" (Guadalajara); Andares en "Puerta De Hierro" (Zapopan); centros de Tlaquepaque, Tonalá, Tlajomulco y El Salto caen en su colonia "Centro"/"Tonala Centro".

## Limitaciones (sin maquillaje)
1. **Antigüedad**: cortes a diciembre de 2020. Colonias y fraccionamientos creados desde 2021 (muy frecuentes en Tlajomulco, Zapopan norte, Tonalá y El Salto) **no existen** en el mapa; los vecinos de ahí caerán en la colonia vecina o en ninguna.
2. **Cobertura medida** contra AGEB urbanas INEGI 2025 (área de AGEB cubierta por algún polígono de colonia): Guadalajara 99%, Tlaquepaque 97%, Zapopan 95%, Tonalá 94%, El Salto 92%, Zapotlanejo 92%, Tlajomulco 85%, Juanacatlán 78%, Ixtlahuacán de los Membrillos 69%.
3. **No es la fuente oficial del estado (IIEG)**; es el catálogo de colonias del INE republicado por un tercero con certificado vencido. Sus límites no son oficiales de catastro ni de los ayuntamientos; son aproximados. Los nombres pueden diferir de los que usa el SIAPA/IIEG.
4. La capa "alterna" tiene mejor provenencia censal (IIEG) pero cubre solo el núcleo (Guadalajara, Zapopan, Tlaquepaque, Tonalá) y agrega colonias contiguas en un solo polígono (1,242 vs 2,170).
5. Ningún dato aquí corresponde a Ixtlahuacán del Río, Acatlán de Juárez u otros municipios que algunas definiciones incluyen en el AMG; no se descargaron.

## Reproducir
```
# 1) Descomprimir cp_jal.zip y coloniasmexico.zip en su carpeta (con python zipfile; unzip falla con nombres no UTF-8)
# 2) Cargar a staging (base de trabajo con PostGIS):
CP_SRID=6362 DATABASE_URL=postgres://agua:agua@localhost:5433/agua_geo_work node data/scripts/stage-load.mjs
# 3) Generar los GeoJSON:
DATABASE_URL=postgres://agua:agua@localhost:5433/agua_geo_work node data/scripts/build-colonias.mjs
# 4) Importar a la base real (cd web):
pnpm import:colonias ../data/colonias_zmg.geojson --name-field nombre --muni-field municipio --replace
```
