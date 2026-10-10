# Datos de Agua ZMG

Todo lo de esta carpeta es **externo y real**.
Fechas de descarga y fuentes crudas: `data/raw/README.md`. Fuentes y advertencias de los datos externos: `data/oficial/FUENTES.md`.

## Qué representa cada polígono

La tabla `colonias` guarda de dónde viene cada polígono en `fuente_geom` (descrita en la tabla `fuentes_geom` y expuesta en
`/api/colonias/geometria` bajo `fuentes_geom`). **Ningún conjunto es el dataset oficial del IIEG** (no se pudo descargar; ver `docs/research/geodatos.md`).

| `fuente_geom` | Qué es | Estado |
|---|---|---|
| `ine_colonias` | Catálogo de colonias del INE (corte 11-dic-2020), republicado por terceros en datamx.io. 2,170 polígonos en los 9 municipios de la ZMG | **En uso.** Límites aproximados, no oficiales. Faltan colonias posteriores a 2020 (sobre todo Tlajomulco, Zapopan norte, Tonalá, El Salto). Nombres sin acentos. Licencia CC0 según la ficha de un tercero, sin confirmar con el INE |
| `iieg` | Colonias IIEG (capa ArcGIS de ITESO, censo 2020), 1,242 polígonos, solo el núcleo del AMG | Alterna, **no mezclar** con la principal (se traslapan). Licencia de la capa no declarada |
| `inegi_ageb` | AGEB urbanas INEGI (dic-2025) | **NO son colonias**: áreas estadísticas. Solo respaldo de cobertura |
| `sepomex` | Polígonos de código postal | **NO son colonias** |
| `osm` | OpenStreetMap (place=neighbourhood/suburb/quarter) | Cobertura mínima |
| `desconocida` | Filas importadas antes de registrar su origen | Revisar |

Cobertura de `ine_colonias` frente a AGEB urbanas INEGI 2025 (medida en la investigación): Guadalajara 99 %, Tlaquepaque 97 %, Zapopan 95 %,
Tonalá 94 %, El Salto y Zapotlanejo 92 %, Tlajomulco 85 %, Juanacatlán 78 %, Ixtlahuacán 69 %.

Calidad tras importar (2,170 polígonos, base de pruebas `agua_datos`): 0 inválidos, 0 vacíos, 0 sin municipio, 0 omitidos.
Por municipio: Zapopan 710, Tlajomulco 348, Tonalá 332, Guadalajara 295, Tlaquepaque 269, El Salto 107, Zapotlanejo 55, Ixtlahuacán 32, Juanacatlán 22.
Solapes: 23 polígonos anidados (>= 95 % dentro de otro: para ubicar un punto usar el de menor `area_m2`), 1 solape grave
(Residencial Jade x San Agustin, Tlajomulco, 91 % del menor) y 1 leve. 105 nombres se repiten dentro de un mismo municipio (220 polígonos): son colonias
distintas y se distinguen por `id_fuente` en la clave estable.

## Importar polígonos

```bash
cd web
DATABASE_URL=postgres://... pnpm migrate
DATABASE_URL=postgres://... pnpm import:colonias ../data/colonias_zmg.geojson [--replace] [--dry-run] [--reporte r.json]
```

- **Idempotente**: el upsert usa la clave `municipio|nombre` normalizados (más `#id_fuente` si hay homónimos). Reimportar no duplica ni cambia ids,
  así que los reportes de vecinos siguen apuntando a la misma colonia. Imprime cuántas son nuevas / actualizadas / sin cambios.
- `--replace` borra lo de la misma fuente que ya no viene en el archivo, **salvo colonias con reportes** (las conserva y las lista).
- Una fuente no sobrescribe polígonos de otra salvo `--sobrescribir-fuente`.
- Corrige geometrías (`ST_MakeValid` + solo polígonos + quita astillas < 1 m2) y reporta inválidas corregidas, vacías, sin municipio, duplicados unificados, solapes.

## Datos externos (`data/oficial/`)

```bash
DATABASE_URL=postgres://... pnpm import:oficial            # mediciones_externas.csv
DATABASE_URL=postgres://... pnpm import:oficial --todos    # + sin_colonia + históricos
```

Cada fila va a `mediciones_externas`, se vincula a una colonia por nombre normalizado + municipio y guarda `confianza_vinculo`:

| Confianza | Criterio |
|---|---|
| `alta` | Nombre idéntico salvo acentos, mayúsculas y puntuación, y único en el municipio |
| `media` | Idéntico tras quitar prefijos ("Colonia", "Fracc."), artículos, abreviaturas y ordinales ("1a" = "Primera"), o casi idéntico (similitud de trigramas >= 0.92) con margen sobre el segundo candidato |
| `baja` | Parecido (>= 0.55) pero no concluyente. Es un "posible": no mostrarlo como dato firme |
| (sin vínculo) | Homónimos en el municipio, municipio sin cartografía, números/secciones/puntos cardinales distintos o sin parecido razonable |

Se compara siempre dentro del mismo municipio; "Sección 1" no se vincula con "Sección 2", ni "Norte" con "Sur", ni "II" con nada.
La similitud es la de `pg_trgm`, implementada en `web/lib/oficial-normalizar.ts` (sin extensiones; con pruebas en `oficial-normalizar.test.ts`).
Salidas de cada corrida: `data/oficial/no_vinculadas.csv` (qué quedó sin vincular y por qué, con candidatos) y `data/oficial/vinculos_a_revisar.csv`
(los `media`/`baja`, para revisión humana).

Resultado con la cartografía `ine_colonias` (673 filas de `mediciones_externas.csv`): 361 `alta`, 40 `media`, 54 `baja` (455 vinculadas) y 218 sin vincular (162 sin coincidencia, 45 homónimos, 11 ambiguas). Con `--todos` (703 filas) son 461 vinculadas y 316 colonias distintas con algún dato. Del listado de 342 colonias del SIAPA se vincularon 220 (174 con `alta`);
del de la CEDHJ, 172 de 236. **La causa principal de lo no vinculado es que el catálogo INE 2020 no tiene colonias posteriores ni usa los mismos nombres.**
Las filas `reporte_calidad_deficiente` son listados administrativos o quejas, **no mediciones**; solo 2 filas de colonia tienen valor numérico.

## API que lee estos datos

- `GET /api/colonias/geometria?municipio=Zapopan,Tonala&detalle=completo|alto|medio|bajo` (por defecto `medio`).
  Medido con las 2,170 colonias reales: `completo` 2.74 MB (gzip 0.70 MB), `alto` 1.66 MB (0.37), **`medio` 1.37 MB (gzip 0.30 MB, brotli 0.25 MB a calidad 9; a calidad 11 serían 0.18 MB pero tarda ~2 s en la primera visita)**, `bajo` 1.03 MB (0.19).
  Se sirve ya comprimida, con `ETag`/304 y `Cache-Control` con `max-age`, `s-maxage` y `stale-if-error`. Los polígonos grandes van primero (los anidados se dibujan encima).
- `GET /api/colonias/[id]`: reportes agregados (misma agregación que `/api/colonias/scores`) + datos externos vinculados.
- `GET /api/oficial?colonia_id=&municipio=&parametro=&tipo=&min_vinculo=alta|media|baja&ambito=colonia|municipio|zmg` y `GET /api/oficial/resumen`.
