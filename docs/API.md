# API pública de Agua ZMG (v1)

Datos abiertos de **solo lectura** con la gravedad del agua por colonia en la Zona Metropolitana de Guadalajara, según los reportes de los vecinos. Pensada para medios, organizaciones, investigadores y otras aplicaciones.

- Especificación OpenAPI 3.1: [`web/public/openapi.json`](../web/public/openapi.json) (se sirve en `/openapi.json`).
- Sin llaves ni registro. CORS abierto (`Access-Control-Allow-Origin: *`).
- Solo **agregados por colonia**. La API nunca devuelve huellas, identificadores de red, comentarios ni ningún dato personal.

> **Qué significan estos datos.** Son reportes ciudadanos sin verificar: reflejan percepción, no mediciones de laboratorio. No son información oficial ni consejo médico. Que una colonia no tenga score **no** significa que el agua sea buena, sino que todavía no hay reportes suficientes. Si publicas estos datos, conserva la atribución y este matiz.

## Licencia y atribución

| | |
|---|---|
| Licencia declarada de los datos | **ODbL-1.0** ([texto](https://opendatacommons.org/licenses/odbl/1-0/)) |
| Estado | **Provisional**: es la propuesta del equipo y falta que quien responde por el proyecto la confirme (ver [DECISIONES-PENDIENTES.md](DECISIONES-PENDIENTES.md)). El campo `metadata.licencia.estado` dice `provisional` o `confirmada`. |
| Atribución | "Agua ZMG, mapa ciudadano de la calidad del agua en la ZMG (reportes de vecinos)". |
| Polígonos | Los límites de colonias son **aproximados y no oficiales**: derivan del catálogo de colonias del INE (corte dic-2020) republicado por terceros; su licencia y procedencia no están confirmadas con el INE. Ver [`data/raw/README.md`](../data/raw/README.md). |

La licencia viaja con los datos: cabecera `Link: <…>; rel="license"`, cabecera `X-Licencia`, el objeto `metadata` del JSON/GeoJSON y la columna `licencia` del CSV.

## Convenciones

- Base: el mismo origen del sitio, por ejemplo `https://TU-DOMINIO/api/v1/...`.
- Solo `GET`, `HEAD` y `OPTIONS`.
- Respuestas en UTF-8. Fechas en ISO 8601 (UTC); los días de la serie son días calendario en hora de Guadalajara (`America/Mexico_City`).
- **Caché:** `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600`. Los datos pueden tener hasta unos minutos de retraso. No hagas polling más rápido que cada 60 s.
- **Compresión y `ETag`:** GeoJSON y CSV se sirven comprimidos (brotli o gzip según `Accept-Encoding`) y con `ETag`; si repites la petición con `If-None-Match` recibes `304` sin cuerpo.
- **Errores:** JSON `{"error": "..."}` con el código HTTP correspondiente (`400` parámetro inválido, `404` no existe, `503` servicio no disponible).
- **Solo datos reales:** la API solo sirve colonias reales; no existen datos de demostración ni parámetros para incluirlos.

## Qué significan los campos

| Campo | Significado |
|---|---|
| `score` | Gravedad promedio ponderada de 1 (leve) a 4 (crítica). `null` si la colonia aún no alcanza el mínimo publicable. |
| `nivel` | `score` redondeado a entero 1-4 (el color del mapa). |
| `confianza` | `baja`, `media` o `alta`: qué tan respaldado está el score (cuánta evidencia efectiva, en cuántos días y desde cuántas redes distintas). Con `baja` el color puede cambiar con pocos reportes más. Se explica en `/metodologia`. |
| `n` | Reportes contados en la ventana vigente (14 días). `null` si no se alcanza el mínimo (no se publican conteos de 1 o 2 reportes). |
| `n_huellas` | Cuántos dispositivos distintos aportaron (un conteo; no se entregan identificadores). |
| `ultimo` | Momento del reporte más reciente contado. |
| `fuente_geom` | Procedencia del polígono (p. ej. `ine_colonias`). |

El cálculo (decaimiento por antigüedad, tope de influencia por red, media recortada, mínimo de evidencia y de huellas) vive en [`web/lib/aggregation.ts`](../web/lib/aggregation.ts) y es el **mismo** que usa el mapa. Los parámetros están versionados (`METODO = "v2"`).

## `GET /api/v1`

Índice: lista de endpoints y metadatos de licencia.

## `GET /api/v1/colonias`

`FeatureCollection` GeoJSON (EPSG:4326) con una `Feature` por colonia. El objeto `metadata` (miembro extranjero permitido por RFC 7946 §6.1) trae licencia, atribución y aviso.

| Parámetro | Valor | Efecto |
|---|---|---|
| `municipio` | texto | Filtra por municipio. Acepta el nombre oficial o variantes sin acentos ni mayúsculas (`tlaquepaque` equivale a "San Pedro Tlaquepaque"). Un nombre que no sea de la ZMG responde `400`. |
| `con_datos` | `1` | Solo colonias que ya tienen score publicable. |
| `sin_geometria` | `1` | Omite los polígonos (`geometry: null`): respuesta mucho más ligera. |

```bash
curl -s "https://TU-DOMINIO/api/v1/colonias?con_datos=1&sin_geometria=1" | jq '.features[0]'
```

```json
{
  "type": "Feature",
  "id": 1234,
  "properties": {
    "id": 1234,
    "nombre": "Ejemplo",
    "municipio": "Guadalajara",
    "fuente_geom": "ine_colonias",
    "score": 2.842,
    "nivel": 3,
    "confianza": "media",
    "n": 14,
    "n_huellas": 11,
    "ultimo": "2026-10-08T17:42:10.000Z"
  },
  "geometry": null
}
```

(Valores de ejemplo ilustrativos, no son datos reales.)

El peso de la respuesta con polígonos depende del número de colonias; viaja comprimida (gzip/brotli) por el CDN. Si solo necesitas los números, usa `sin_geometria=1` o el CSV.

## `GET /api/v1/colonias/{id}`

Detalle de una colonia.

```json
{
  "id": 1234,
  "nombre": "Ejemplo",
  "municipio": "Guadalajara",
  "fuente_geom": "ine_colonias",
  "reportes": {
    "score": 2.842, "nivel": 3, "confianza": "media",
    "n": 14, "n_huellas": 11, "ultimo": "2026-10-08T17:42:10.000Z",
    "serie": [ { "dia": "2026-10-07", "n": 3, "score": 3 } ]
  },
  "oficial": [
    {
      "fuente": "...", "tipo": "oficial", "fecha": "2026-09-30",
      "parametro": "...", "valor": null, "unidad": null,
      "url": "https://...", "confianza_vinculo": "alta", "notas": null
    }
  ],
  "metadata": { "licencia": { "nombre": "ODbL-1.0" }, "aviso": "..." }
}
```

- `reportes.serie`: últimos 30 días, un punto por día con reportes (`n` y `score` promedio simple del día). Va **vacía** si la colonia no alcanza el mínimo publicable.
- `oficial`: datos externos (oficiales, académicos, periodísticos o ciudadanos) vinculados a la colonia. **No entran al score.** Cada uno trae `fuente` y `url`; `confianza_vinculo` (`alta`/`media`/`baja`) indica qué tan seguro es que el dato corresponda a *esta* colonia (la vinculación es por nombre). `notas` (texto o `null`) lleva las advertencias de cada dato —histórico fuera de ventana, tira reactiva semicuantitativa que no sustituye al laboratorio, listado administrativo que no es una medición—: **muéstralas junto al valor**; un `valor: null` sin leer `notas` es ambiguo. Muchas filas son listados administrativos (p. ej. colonias incluidas en un programa de descuento), no mediciones: lee `parametro`, `valor` y la fuente antes de interpretarlas. Los vínculos `baja` (coincidencia dudosa de nombre) no se incluyen aquí; `/api/oficial` solo los devuelve con `?min_vinculo=baja`. Origen y límites en [`data/oficial/FUENTES.md`](../data/oficial/FUENTES.md).
- `id` inexistente: `404`. `id` no numérico: `400`.

## `GET /api/v1/resumen.csv`

Una fila por colonia, solo agregados. UTF-8, saltos CRLF, encabezado en la primera fila. Descarga con `Content-Disposition: attachment`.

Columnas: `id, nombre, municipio, score, nivel, confianza, n_reportes, n_huellas, ultimo_reporte, fecha_corte, licencia`.

Parámetros: `municipio`, `con_datos=1` (igual que arriba). Las celdas de texto que empiezan con `=`, `+`, `-` o `@` se prefijan con `'` para evitar inyección de fórmulas en hojas de cálculo.

```bash
curl -sO -J "https://TU-DOMINIO/api/v1/resumen.csv?con_datos=1"
```

## `GET /api/salud`

Chequeo de salud para monitores. No es parte de `/api/v1` ni se cachea.

```json
{ "ok": true, "db": true, "version": "0.1.0+a1b2c3d4e5f6" }
```

Responde `503` con `"ok": false, "db": false` si la base de datos no contesta (verifica la conexión de verdad con `SELECT 1`, con límite de 3 s).

## Uso responsable

- Cita la fuente y la fecha de corte (`metadata.generado` o `fecha_corte`).
- No presentes el color de una colonia como diagnóstico oficial ni como "agua potable / no potable". Es un resumen de reportes de vecinos.
- No intentes reidentificar a quien reportó. La API no expone ese dato y el proyecto anonimiza los identificadores con una tarea de retención (por defecto a los 30 días; ver OPERACION.md).
- Si encuentras un error o quieres integrar el proyecto con una organización, abre un *issue* (ver [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Para quien mantiene el código

- Código: [`web/app/api/v1/`](../web/app/api/v1/). Utilidades compartidas (CORS, caché, licencia) en `_lib/comun.ts`; consultas en `_lib/datos.ts`; CSV en `_lib/csv.ts` (con pruebas).
- Las listas se guardan 60 s en memoria por instancia y los filtros (`municipio`, `con_datos`) se aplican sobre esa copia: variar los parámetros no multiplica las consultas a la base. El cuerpo final, su `ETag` y sus versiones comprimidas se calculan una vez por minuto y combinación de parámetros (máximo 12 combinaciones en memoria).
- Si la base falla, se sirve la última copia en memoria (hasta 1 h) y, detrás de un CDN, `stale-if-error`.
- Cambiar la licencia: variables `DATOS_LICENCIA_NOMBRE` y `DATOS_LICENCIA_URL` (ver `web/.env.example`). También hay que actualizar `info.license` en `openapi.json`.
- Cambios incompatibles de formato = nueva versión de ruta (`/api/v2`), no modificar `/api/v1`.
