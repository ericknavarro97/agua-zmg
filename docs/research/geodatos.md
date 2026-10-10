# Geodatos: polígonos de colonias de la ZMG

Fecha de la investigación: 2026-10-08. Detalle de archivos, CRS, conteos y licencias: `data/raw/README.md`.

## Resumen honesto

- **No se consiguió el dataset oficial** del IIEG (`planimetria-zmg-vuelos-1998-2001-colonias`, SHP/KML, CC-BY). Su portal `datos.jalisco.gob.mx` no tiene registro A/AAAA hoy, y Wayback Machine no archivó los archivos `colonias.zip` / `colonias.kml`.
- **Sí hay polígonos reales de colonias para los 9 municipios** pedidos, pero de otra fuente: el catálogo de colonias del INE (corte 11-dic-2020), republicado en datamx.io (ficha: licencia CC0 declarada, autor INE) con el certificado TLS del servidor vencido. Salida: `data/colonias_zmg.geojson`, **2,170 colonias**, 0 geometrías inválidas tras importar a PostGIS.
- Cobertura real medida contra las AGEB urbanas de INEGI 2025: 99% Guadalajara, 97% Tlaquepaque, 95% Zapopan, 94% Tonalá, 92% El Salto y Zapotlanejo, 85% Tlajomulco, 78% Juanacatlán, 69% Ixtlahuacán de los Membrillos. Faltan las colonias posteriores a 2020 y los límites **no son oficiales**.
- Hay un respaldo conceptualmente distinto (AGEB urbanas INEGI, 2,058) y una alterna con procedencia IIEG pero más gruesa y solo del núcleo metropolitano (1,242). **Ninguna de las dos es "colonia" en el sentido de la principal**; ver tabla.

## Fuentes que funcionaron

| Fuente | Qué dio | Resultado |
|---|---|---|
| datamx.io / codeandomexico (`colonias-ine-2020`) | 107,027 polígonos de colonia a nivel nacional, UTM 13N; 5,588 de Jalisco; **2,170 usables en la ZMG** | USADA como principal. 282 MB, se recortó a Jalisco (9.2 MB). TLS vencido (`curl -k`): integridad no verificable; licencia CC0 solo declarada por la ficha de un tercero |
| INEGI, API `gaia.inegi.org.mx/wscatgeo` (Marco Geoestadístico dic-2025) | Polígonos de los 125 municipios de Jalisco y 2,058 AGEB urbanas de los 9 municipios, lon/lat | USADA para asignar municipio y como respaldo (`ageb_urbanas_zmg.geojson`). Licencia: términos de libre uso de INEGI |
| ArcGIS Online `Datos_de_Colonias_Guadalajara` (ITESO) | 1,242 polígonos de colonia con censo 2020 (campos IIEG), núcleo AMG | ALTERNA (`colonias_zmg_iieg_alterna.geojson`). Licencia del ítem no declarada |
| Correos de México `cp_jal.zip` (https) | 2,676 polígonos de **código postal** de Jalisco, LCC ITRF2008 (EPSG:6362) | Descargado, no usado en la salida (CP no es colonia; un CP agrupa varias colonias) |
| GitHub `open-mexico/mexico-geojson` (`14-Jal.geojson`) | Los mismos polígonos de CP de Correos en GeoJSON (solo `d_codigo`), MIT | Descargado, redundante |
| datamx `colonias-mexico` (shapefile nacional 2015) | 58,227 polígonos (Jalisco 2,754; GDL 279, Zapopan 361) | Descargado, **no usado**: según su `.shp.xml` deriva de un producto comercial de CP 2012 Q2; sin licencia |
| Overpass API (OSM) con User-Agent | `place=neighbourhood/suburb/quarter` en bbox ZMG: 656 nodos, 74 polígonos, 0 relaciones | Guardado como referencia; cubre una fracción mínima |
| data.amerigeoss.org (CKAN, API v3) | Metadatos del dataset del IIEG: ids de recursos `ef044cb8-4c5d-48b1-91d8-fa2b52be31ec` (SHP) y `82d456da-3e68-4aeb-9833-e3f9b24ffbde` (KML), fecha de datos 2018-06-06 | Solo metadatos; los enlaces apuntan al portal caído |
| Wayback Machine (página del dataset) | Snapshots del dataset (2019-12-14, 2021-02-28, 2022-08-21) con los enlaces de descarga reales (`/sites/default/files/recursos/archivos/colonias.zip` y `.kml`, nodos 154/155) y contacto del IIEG | Útil para identificar el archivo; el archivo mismo NO está archivado (ver abajo) |

## Fuentes que fallaron (con el error observado)

| Intento | Error |
|---|---|
| `https://datos.jalisco.gob.mx/` (portal del IIEG) | `curl: (6) Could not resolve host`. `dig` contra 1.1.1.1 y 8.8.8.8 devuelve solo un CNAME a `_2ae23e88be50b5a65953fc35d68c7865.bdvkfdzfbg.acm-validations.aws.` (registro de validación de certificado AWS ACM, sin A/AAAA): parece un registro DNS roto o mal migrado, no intermitente (probado varias veces entre 15:00 y 15:20 hora local) |
| Wayback: `.../recursos/archivos/colonias.zip` y `colonias.kml` (con timestamps 20191214032739, 20210228224513, 20220821153414/152853, `id_`, `/web/2/`, http y https) | HTTP 404 (página "not archived"). `archive.org/wayback/available` devuelve `archived_snapshots: {}`. El índice CDX del directorio `recursos/archivos/` lista 91 archivos y ninguno es `colonias.*` (sí existe `ckan-manzanasestatal.kml` de 2019/2021, que son manzanas, no colonias; no se descargó) |
| Wayback: URLs `/node/153/download`, `/node/154/download`, `/node/155/download` | HTTP 404 |
| Wayback CDX en varias consultas | "Internet Archive: Temporarily Offline" intermitente; otras respuestas normales |
| `sitios.iiegjalisco.gob.mx`, `geoserver.iieg.gob.mx`, `ide.jalisco.gob.mx`, `datos.tlaquepaque.gob.mx`, `datos.tonala.gob.mx` | No resuelven DNS |
| `iiegjalisco.maps.arcgis.com` | 302 a `home/index.html`; la API `portals/self` no devolvió id de organización; no se encontró ninguna capa de colonias publicada bajo esa organización |
| ArcGIS Online `zapopan` (ZapopanJ), `https://services7.arcgis.com/dPcrjOzz33KK2mrK/...` | `{"error":{"code":499,"message":"Token Required"}}` |
| `datos.zapopan.gob.mx` (DKAN) | Responde; su `catalog.xml` lista 232 datasets, **ninguno** con colonias/límites/polígonos/shp/AGEB en el título (solo CSV; hay una tabla de calles `cartografia_zapopan.csv` en GitHub `ZapopanLab/datasets` con inicio/fin/centroide en UTM: son **calles**, no colonias) |
| `datos.guadalajara.gob.mx` | Responde 200 pero es una página de declaraciones patrimoniales; `/api/3/action/package_search` da 404 |
| `datamx.codeandomexico.org` | Certificado TLS vencido (`curl: (60)`); se resolvió con `-k` solo para estos datos públicos |
| `http://www.correosdemexico.gob.mx/datosabiertos/poligonos/cp_jal.zip` | Timeout a 40 s por http; por https descarga 23.6 MB |
| `overpass-api.de` sin User-Agent | HTTP 406; con User-Agent responde, pero con 504 intermitentes bajo carga (se reintentó) |
| URL de zip de Marco Geoestadístico adivinada de `inegi.org.mx/contenidos/productos/.../889463807469_s.zip` | Página 404 de INEGI (la URL era una suposición mía); se usó la API de `wscatgeo`, que sí funciona |
| `datos.gob.mx`, `zenodo.org` | `datos.gob.mx` devolvió 403 a `curl` sin User-Agent (200 con User-Agent); no se exploró a fondo. `zenodo.org` 403 en la raíz. Kaggle y Zenodo: sin búsqueda exitosa de espejos (la búsqueda web no encontró ninguno) |
| Portales de Tlaquepaque, Tonalá, Tlajomulco, IMEPLAN, SIGA Jalisco, `iieg.gob.mx` | Respondieron 200/406 en la raíz; **solo se revisó la portada y búsquedas web**, no se hizo una exploración exhaustiva de sus catálogos. Quedan como pista pendiente, no como descartados |
| Búsqueda de espejos GitHub del shapefile del IIEG | No se encontró ninguno (WebSearch estándar, 2 consultas). No es prueba de inexistencia |

## Cómo se construyó la salida y qué debe saber quien la use

1. Se descargó el GeoJSON nacional INE 2020 (UTM 13N), se recortó a Jalisco y se cargó a PostGIS (`ST_Transform` 32613 -> 4326).
2. Municipio por intersección con los polígonos municipales INEGI (los códigos numéricos del INE no coinciden con los de INEGI: Guadalajara es 41 en INE y 039 en INEGI, etc.). Verificado: cada código INE cae ~100% en un solo municipio INEGI.
3. Limpieza: `ST_MakeValid`, extracción de polígonos, descarte de partes degeneradas, 20 "SIN NOMBRE" fuera, ~10 duplicados exactos unificados, nombres en Title Case.
4. Validación: importación con el script existente `web/scripts/import-colonias.ts` a la base propia `agua_geo`: **2,170 importadas, 0 omitidas, 0 inválidas**.

### Riesgos y límites que afectan el producto
- **Vigencia**: diciembre de 2020. Faltan fraccionamientos recientes. Si un vecino no encuentra su colonia, el producto debería ofrecerle "mi colonia no aparece".
- **Traslape y nombres repetidos**: hay polígonos pequeños dentro de otros mayores (resolver por menor `area_m2`) y 107 nombres repetidos dentro de un mismo municipio (mostrar `cp`).
- **Procedencia**: no es una publicación oficial del INE en su portal; es una copia de terceros con TLS vencido y un campo `path` que mostraba rutas locales de un proyecto ajeno. Se la trata como "aproximada, no oficial".
- **Municipios fuera de lo pedido**: no se incluyó Acatlán de Juárez ni Ixtlahuacán del Río; no se verificó qué municipios forman el AMG oficial hoy, así que no se afirma una lista oficial.
- Licencias: INEGI (libre uso con atribución) es la más clara. INE-datamx (CC0 declarada por tercero) y la capa ITESO (sin licencia) requieren confirmación antes de redistribuir. Los datos de `colonias-mexico` (derivado comercial) no deben redistribuirse.

## Pendientes y recomendaciones (fuera de mi propiedad o requieren acción humana)

1. **Pedir el archivo oficial al IIEG**: el contacto que aparece en el snapshot archivado del dataset (Wayback, 2021-02-28) es `contacto.iieg@jalisco.gob.mx`. Solicitar `colonias.zip` y confirmar licencia. (No se envió ningún correo.)
2. Reintentar `datos.jalisco.gob.mx` periódicamente; si vuelve, el SHP oficial trae `colonias` de 1998-2001 solo para Guadalajara, Zapopan, Tlaquepaque y Tonalá (según la ficha), es decir, **más viejo y de menor cobertura** que lo que ya se tiene para esos 4, aunque con nombres oficiales. Sirve sobre todo para validar nombres.
3. `web/scripts/import-colonias.ts` (no es mío) falla con `Geometry type (GeometryCollection) does not match column type (MultiPolygon)` si `ST_MakeValid` devuelve una colección (me ocurrió con `ageb_urbanas_zmg.geojson` antes de limpiar una parte degenerada). Sugerencia: `ST_Multi(ST_CollectionExtract(ST_MakeValid(...), 3))` y omitir si queda vacío.
4. La carpeta `data/raw/` pesa ~236 MB (sobre todo `datamx-colonias-mexico/Colonias` 84 MB extraído y `correos-cp-poligonos` 65 MB). Si el repositorio usa git, añadir `data/raw/` al `.gitignore` o conservar solo los `.zip` originales y `data/*.geojson` (≈8.5 MB). No hay repositorio git en la raíz hoy.
5. El producto debería mostrar la atribución: "Colonias: catálogo INE 2020 (datamx.io); municipios INEGI Marco Geoestadístico 2025".
6. Datos de demostración: `agua_geo` no contiene `demo=true`; todos los registros son reales (`demo=false`).

## Bases de datos y procesos usados
- Bases propias creadas en el contenedor `agua-zmg-db-1`: `agua_geo` (validación; queda con `colonias_zmg.geojson` importado: 2,170 filas) y `agua_geo_work` (tablas `st_*` de staging). **No se tocó `agua_zmg`.** Se pueden borrar con `DROP DATABASE agua_geo_work;` cuando ya no hagan falta.
- Scripts reproducibles: `data/scripts/stage-load.mjs` y `data/scripts/build-colonias.mjs` (sin dependencias nuevas; usan `pg` y `shapefile` de `web/node_modules`).
