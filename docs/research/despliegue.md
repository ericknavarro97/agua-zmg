# Despliegue, costos y legal: cómo publicar Agua ZMG con presupuesto casi cero

Fecha de la investigación: 2026-10-08. Todo lo que dice "verificado" se leyó en la fuente citada durante esta sesión; lo que no pude confirmar está marcado **SIN VERIFICAR**. Los precios cambian: revísalos en la página oficial el día que contrates.

> Esto no es asesoría legal ni fiscal. La sección legal es una lectura técnica de la ley vigente para orientar decisiones; antes de publicar con nombre propio, conviene que la revise un abogado (idealmente de una asociación civil o clínica jurídica universitaria).

Las referencias van como `[Fn]` y se listan con su URL al final.

---

## 0. Resumen ejecutivo

**Hallazgo central.** Casi todo el tráfico de un mapa en crisis es de lectura y cacheable: JS/CSS, la geometría de colonias (casi estática), los puntajes (cambian cada minuto o cinco) y los tiles del mapa base. Lo único que no se cachea es `POST /api/reportes`. Si el CDN absorbe la lectura y el mapa base lo sirve un tercero, el origen solo ve decenas de peticiones por segundo aunque haya miles de visitantes. El diseño del despliegue debe girar en torno a eso, no a "tener un servidor grande".

**Recomendación primaria (alta disponibilidad con operación mínima, ~USD 40 a 160/mes según tráfico):**

| Capa | Elección | Por qué |
|---|---|---|
| App | Vercel **Pro** (USD 20/mes) | Hobby se pausa 30 días al exceder límites y es solo "uso personal no comercial" [F20][F21]. En una crisis no se puede arriesgar una pausa de 30 días. |
| Base de datos | Neon (PostGIS soportado) en plan **Launch** (por uso, ~USD 20/mes encendida 24/7 al mínimo) | El plan gratuito se queda sin horas de cómputo a mitad de mes si la base nunca se duerme (cálculo en 2.2) y el cómputo se **suspende** al agotarse [F11][F12]. |
| Mapa base | **OpenFreeMap** (instancia pública, gratis, sin llaves) + plan de contingencia con **PMTiles propio en Cloudflare R2** | La política de tiles de OSM no sirve para una app en crisis [F1]; MapTiler y Stadia gratis son solo no comerciales y con cupos bajos [F8b][F9b]. |
| Geometría | GeoJSON simplificado cacheado en CDN hoy; vector tiles/PMTiles solo si pasa de ~5 MB comprimido o cuando se quiera cargar por zoom (sección 4) | Medido: ~0.4 a 0.65 MB comprimido para 2,500 colonias sintéticas. |
| Respaldo | `pg_dump` nocturno a R2 o Backblaze B2 (planes gratis) + exportar el dato abierto diario | Neon gratis solo conserva 6 horas de historia; Supabase gratis no tiene respaldos [F12][F16]. |
| Monitoreo | UptimeRobot (50 monitores, 5 min) o Better Stack (10 monitores, 30 s) + Sentry gratis | Todo gratis, ver sección 5. |
| Datos abiertos | **ODbL 1.0** para la base exportada (alternativa: CC BY 4.0) | Decisión humana, ver sección 7. |
| Código | **AGPL-3.0** (alternativa: MIT) | Decisión humana, ver sección 7. |

**Plan B (más barato, más trabajo, ~EUR 5 a 25/mes):** un VPS con `docker compose` (Next en modo `standalone` + PostGIS + Caddy/nginx) detrás de **Cloudflare Free** con reglas de caché para el JSON, mapa base OpenFreeMap/PMTiles. Detalle en 2.4. Precio del VPS **SIN VERIFICAR** (la página oficial de Hetzner mostraba los tipos como "no disponibles" y sin precio al consultarla hoy [F26][F27]).

**Plan $0 (solo piloto, no para la crisis):** Vercel Hobby + Neon Free + OpenFreeMap. Se rompe alrededor de 40,000 visitas/mes por el límite de 1 M de solicitudes CDN de Hobby (cálculo en la sección 8), y Hobby prohíbe uso comercial [F20][F21].

**Hallazgos del código actual que bloquean el lanzamiento** (no los edité; van en "Pendientes", sección 10):

1. `components/AguaApp.tsx` usa `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Esa política dice que no hay SLA, que pueden bloquear sin aviso y que los servicios comerciales o que piden donaciones deben saber que el acceso puede retirarse en cualquier momento (paráfrasis de la política) [F1]. Hay que cambiar de proveedor antes de publicar.
2. `lib/fingerprint.ts` usa `process.env.HASH_SALT ?? "dev-salt"`. Si en producción falta la variable, la "huella anónima" se calcula con una sal pública y conocida. Además la sal es estática (el día va dentro del hash, pero la sal no rota), y la huella se guarda para siempre en `reportes.huella`. Ver 6.1.
3. `app/api/colonias/geometria/route.ts` envía `Cache-Control: public, s-maxage=86400, ...`. En Vercel, `s-maxage` lo consume el CDN y el navegador recibe `max-age=0`, así que **cada visita** pega al CDN (y cuenta como solicitud CDN facturable) [F22]. Falta `max-age` corto para el navegador y `stale-if-error`.
4. `lib/db.ts` abre un `Pool` de hasta 5 conexiones por instancia. En serverless, cada instancia abre las suyas; con un pico se agotan conexiones. Con Neon hay que usar la cadena **-pooler** (PgBouncer, hasta 10,000 conexiones cliente, modo transacción) [F13].

---

## 1. Supuestos del modelo de tráfico

Todo lo de esta sección es **supuesto mío**, salvo lo medido y marcado como tal. Ajusta si la telemetría real dice otra cosa.

| Supuesto | Valor | Origen |
|---|---|---|
| "Visita" | una sesión única en el mes | definición mía |
| Peso JS de MapLibre (gzip) | 285 KB (`maplibre-gl.mjs`) + 144 KB (worker) + 10 KB (CSS) = ~439 KB | **medido** en `web/node_modules/maplibre-gl/dist` (v6.13.0) |
| JS/CSS de Next y la app | ~150 KB gzip | supuesto, medir con `next build` |
| GeoJSON de colonias (2,500, ruta actual) | 410 KB brotli / 650 KB gzip | **medido** con datos sintéticos, sección 4 |
| Transferencia desde nuestro dominio por visita | ~1.1 MB (rango 1.0 a 1.25 MB) | suma de lo anterior |
| Solicitudes al CDN por visita | 25 (HTML, ~15 chunks, geometría, scores, fuentes) | supuesto |
| Tiles de mapa base por visita | ~40 solicitudes, ~1 MB | supuesto, no medido |
| Porcentaje de visitas que reportan | 5% | supuesto |

Volúmenes derivados:

| | 10 mil visitas | 100 mil | 1 millón |
|---|---|---|---|
| Transferencia desde nuestro dominio (1.1 MB) | 11 GB | 110 GB | 1.1 TB |
| Solicitudes CDN (25/visita) | 250 mil | 2.5 M | 25 M |
| Solicitudes de tiles (40/visita) | 400 mil | 4 M | 40 M |
| `POST` de reportes (5%) | 500 | 5 mil | 50 mil |

Contexto de la escala del problema: la CEDHJ reporta ~600 colonias con agua sucia, turbia o contaminada [F46], y hay una iniciativa ciudadana con más de 10,000 firmas pidiendo comparecencia [F46]. La ZMG es una población de millones; 1 M de visitas/mes no es exagerado en un pico sostenido.

---

## 2. (a) Base de datos con PostGIS y plataforma de la app

### 2.1 Postgres administrado con PostGIS

| Proveedor | PostGIS | Plan gratis (verificado) | Riesgo para esta app | Plan de pago relevante |
|---|---|---|---|---|
| **Neon** | Sí. `CREATE EXTENSION postgis` [F10]; versiones 3.3.10 (PG14 a 16), 3.5.7 (PG17), 3.6.4 (PG18) [F14] | 100 CU-horas/proyecto/mes, 1 GB/proyecto (20 GB total), 5 GB de salida/mes, escala a cero tras 5 min **sin poder desactivarlo**, historial de 6 horas [F11][F12] | Al agotar CU-horas el cómputo **se suspende** hasta el siguiente periodo o hasta pagar [F15]. Reactivación "en unos cientos de ms" [F17]. | Launch: USD 0.106/CU-hora, USD 0.35/GB-mes, 500 GB de salida incluidos, historial hasta 7 días (restauración instantánea USD 0.20/GB-mes) [F11] |
| **Supabase** | Sí, instalar en el esquema `extensions`, no en `public` [F18] | 500 MB, 5 GB de salida, 2 proyectos activos, **se pausa tras una semana sin uso**, sin respaldos descargables [F16][F19] | Pausa por inactividad y sin respaldos; Supabase mismo desaconseja producción en el plan gratis [F19] | Pro USD 25/mes: 8 GB, respaldos diarios 7 días, sin pausa [F16][F19] |
| **Aiven** | Sí (mencionado) | 1 GB de almacenamiento, 1 GB RAM, 1 CPU, nodo único, se apaga por inactividad; "no recomendado para producción de alto tráfico" [F25] | Sin alta disponibilidad | no evaluado |
| Postgres propio en VPS | Sí (imagen `postgis/postgis:16-3.4`, la misma del `docker-compose.yml`) | n/a | Tú operas parches, respaldos y recuperación | n/a |

**Conclusión:** para producción en crisis, Neon Launch (o Supabase Pro) en vez de cualquier plan gratis. Los planes gratis sirven para el piloto y para la base de staging.

### 2.2 Por qué el plan gratis de Neon no aguanta la crisis (cálculo)

- Mínimo de cómputo: 0.25 CU [F15]. Con 100 CU-horas gratis, encendida al mínimo dura 100 / 0.25 = 400 horas = **16.7 días**.
- La base casi nunca se duerme: los endpoints cacheados `scores` (60 s) y `geometria` (24 h) generan al menos una consulta al origen por vencimiento, y los reportes llegan todo el día. Escala a cero tras 5 minutos de inactividad [F11], así que basta una consulta cada 5 minutos para mantenerla encendida.
- Launch encendida 24/7 al mínimo: 0.25 CU × 730 h × USD 0.106 = **~USD 19.4/mes** + almacenamiento (<1 GB ≈ USD 0.35) [F11]. Es un piso; si autoescala por picos, sube. Pon un tope de autoescalado en la consola.

### 2.3 Plataforma de la app: Vercel vs VPS

| Criterio | Vercel Hobby | Vercel Pro | VPS + docker compose + Cloudflare Free |
|---|---|---|---|
| Precio | USD 0 | USD 20/mes con USD 20 de crédito de uso incluido [F23] | ver 2.4 |
| Uso comercial | **Prohibido** (solo personal no comercial). "Pedir donaciones no cuenta como comercial"; sí cuenta anuncios, cobros, o que **alguien reciba pago por crear, actualizar o alojar el sitio** (incluye un empleado o consultor que escriba el código) [F21] | Permitido | n/a |
| Transferencia incluida | 100 GB/mes [F20] | 1 TB/mes en el nivel CDN incluido [F23][F24] | 20 TB incluidos en nube de Hetzner en la UE; en EE.UU. 1 a 5 TB según el tipo [F26][F27] |
| Solicitudes CDN incluidas | 1 M/mes [F20] | 1 M/mes incluido; nivel de USD 20 por 10 M; USD 100 por 50 M; USD 300 por 150 M [F24] | las absorbe Cloudflare; Free sin tope de ancho de banda documentado en lo que leí (**SIN VERIFICAR** el texto exacto, ver 2.4) |
| Qué pasa al excederlo | Esperar 30 días para volver a usar la función [F20] | Pasa de nivel el siguiente ciclo; un pico de un día no cambia el precio [F24] | depende del VPS |
| Logs de ejecución | 1 hora | 1 día [F20] | los que configures |
| WAF reglas personalizadas | hasta 3 | hasta 40 [F20] | Cloudflare Free: 1 regla de límite de tasa, ventana de 10 s, solo por IP [F29] |
| DDoS | activo por defecto [F20] | activo por defecto [F20] | Cloudflare: protección L3 a L7 sin medición en todos los planes [F30] |
| Operación | cero | cero | tú: parches, TLS, respaldos, monitoreo |
| Región cercana a México | no hay región en México en la lista de precios regionales; las más cercanas son Washington D.C., San Francisco, Portland, Cleveland, São Paulo [F28] | igual | OCI sí tiene Querétaro (`mx-queretaro-1`) y Monterrey (`mx-monterrey-1`) [F37]; Hetzner no tiene México [F26] |

Notas:

- **Hobby y uso comercial.** Esto no es "dinero sí/no" sino quién participa. Si Erick, una empresa o un consultor cobran por el desarrollo o el alojamiento de **este** sitio, la definición de Vercel lo vuelve comercial [F21]. Si es 100% voluntario y se aceptan donaciones, queda dentro. Es decisión humana y se puede consultar a soporte de Vercel (la página lo ofrece [F21]).
- **Programa de código abierto de Vercel.** Existe un programa de patrocinio con convocatoria cada 3 meses (`sponsorships@vercel.com`); no pude confirmar criterios ni beneficios [F31]. Vale preguntar si el repositorio sale como software libre.
- **Latencia a México:** no la medí. No afirmo cifras. Con CDN y JSON cacheado, la latencia de la región del origen importa solo para `POST`.

### 2.4 Plan B: VPS + docker compose + Cloudflare

Arquitectura: navegador → Cloudflare Free (DNS, TLS, caché, DDoS) → Caddy/nginx → Next (`output: 'standalone'`) → PostGIS (volumen con respaldo nocturno).

Lo verificado en la documentación de Next 16 incluida en el repo (`web/node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`): se recomienda un proxy inverso (nginx) para solicitudes malformadas, ataques de conexión lenta, límites de payload y rate limiting; `output: 'standalone'` genera un `server.js` mínimo (`.../01-app/03-api-reference/05-config/01-next-config-js/output.md`); con CDN hay que respetar `s-maxage`, el encabezado `rsc` y el parámetro `_rsc` en la clave de caché (`.../02-guides/cdn-caching.md`). Si hay más de una instancia, todas deben compartir `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (self-hosting.md).

Puntos críticos:

- **Cloudflare no cachea JSON ni HTML por defecto**, solo por extensión; hay que crear una Cache Rule para `/api/colonias/*` [F32]. Sin esa regla el VPS recibe todo el tráfico.
- **Cláusula de contenido desproporcionado:** Cloudflare puede limitar el CDN en planes Free/Pro/Business si se sirve video o "un porcentaje desproporcionado de imágenes, audio u otros archivos grandes" sin servicio de pago [F33]. JS, JSON y HTML no son eso, pero **no sirvas tiles PMTiles de mapa base por el CDN Free** más allá de lo razonable; ponlos en R2 (ver sección 3).
- **IP real del cliente:** `app/api/reportes/route.ts` toma `x-forwarded-for` (primer valor). Detrás de un proxy propio ese valor puede venir manipulado por el cliente; con Cloudflare hay que usar `CF-Connecting-IP` (no verificado en esta sesión; confirmar en su documentación). Es un cambio fuera de mi propiedad, ver Pendientes.
- **Oracle Cloud Always Free** (VM sin costo) no es base confiable: según su documentación oficial, el nivel Always Free de Ampere A1 equivale a **2 OCPU y 12 GB** (1,500 OCPU-horas y 9,000 GB-horas/mes), 200 GB de disco, 10 TB de salida/mes, y **reclaman instancias ociosas** si en 7 días CPU, red y (en A1) memoria quedan por debajo del 20% [F36]. Fuentes de terceros que dicen 4 OCPU/24 GB contradicen esa página; mando la oficial. Tiene regiones en México [F37], pero la región de origen de la cuenta es permanente y la disponibilidad de capacidad gratis **SIN VERIFICAR**.
- **Fly.io** no tiene nivel gratuito para organizaciones nuevas; shared-cpu-1x 256 MB desde USD 2.19/mes, volúmenes USD 0.15/GB, salida USD 0.02/GB [F38]. Es opción intermedia, no la evalué a fondo.
- **Hetzner:** 20 TB de tráfico incluido en la UE; los tipos de EE.UU. traen 1 a 5 TB [F26][F27]; solo se factura tráfico saliente [F39]; "la factura nunca excede el tope mensual del servidor" [F26]. **Precios en euros SIN VERIFICAR**: ambas páginas oficiales mostraron los tipos como no disponibles y sin precio hoy. Fuentes de terceros mencionan alrededor de EUR 4 a 5.4/mes para 2 vCPU y 4 GB, pero eso es dato de terceros con nombres de modelo ya reemplazados (CX23, CPX22), no lo uso en las tablas más que como orden de magnitud.

---

## 3. (b) Mapa base: términos, alternativas y atribución

| Opción | Gratis y límites (verificado) | Uso comercial / de donaciones | SLA | Atribución | Veredicto |
|---|---|---|---|---|---|
| **tile.openstreetmap.org** | Sin cuota publicada; "capacidad limitada", puede bloquear **sin aviso**; sin SLA; "mejor esfuerzo" [F1] | No lo prohíbe explícitamente; servicios comerciales o que piden donaciones deben saber que el acceso puede retirarse en cualquier momento (paráfrasis) [F1] | Ninguno [F1] | Visible, esquina del mapa, enlazar a `openstreetmap.org/copyright` [F1][F2] | **No usar en producción.** Exige además `User-Agent` propio, `Referer` válido, HTTPS y caché según encabezados; prohíbe descargas masivas [F1]. |
| **OpenFreeMap** (instancia pública) | "Sin límites de vistas ni solicitudes; sin registro, llaves ni cookies" [F3][F6]. El ToS no fija umbrales [F4] | Permitido, sin restricción [F4] | **Ninguno**: "tal cual", puede descontinuarse sin aviso [F4] | "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (la parte de OpenFreeMap es opcional); MapLibre la agrega sola con los estilos oficiales [F3][F5] | **Primaria**. Estilos: `https://tiles.openfreemap.org/styles/{positron,bright,liberty}` [F5]. `positron` va bien con una capa de colores encima. Se financia con donaciones (GitHub Sponsors) [F5][F6]. |
| **Protomaps / PMTiles autoalojado** | Un solo archivo con peticiones HTTP Range; se aloja en S3/R2/estático [F7b]. Extracto regional con `pmtiles extract --bbox ... --maxzoom` [F12c]. Planeta completo ~120 GB; cada nivel de zoom duplica el tamaño aprox. [F8]. Compilaciones diarias en `maps.protomaps.com/builds`; **no hacer hotlink**, copiar a tu almacenamiento [F8] | Sí, es tuyo | El tuyo | Licencia **ODbL como Produced Work**, requiere atribución a OSM (y a Protomaps según su guía) [F8][F9] | **Contingencia / fase 2.** Necesita además fuentes (glyphs) y sprites: Protomaps los publica en `protomaps.github.io/basemaps-assets` [F9]; para independencia total hay que copiarlos también. Tamaño del extracto de la ZMG **no lo medí** (la documentación no da cifras [F12c]); medir con `pmtiles extract`. |
| **Protomaps API alojada** | "Gratis para uso no comercial; para uso comercial, hazte GitHub Sponsor"; requiere llave; CORS por llave [F10b] | No comercial | Ninguno publicado | `© OpenStreetMap` [F10b] | Alternativa; un resumen de búsqueda menciona un límite suave de 1 M de solicitudes de tiles/mes (**SIN VERIFICAR**, no lo vi en la página oficial). |
| **MapTiler Cloud** | Gratis: 5,000 sesiones de mapa/mes, 100,000 solicitudes API/mes; **uso comercial no permitido**; logo de MapTiler obligatorio; al agotar cuota **se pausa** [F8b] | Flex USD 30/mes: 25,000 sesiones, 500,000 solicitudes, comercial permitido [F8b] | 99.9% solo en plan Custom [F8b] | Logo requerido (gratis) | Insuficiente: 10 mil visitas ya exceden las 5,000 sesiones gratis. |
| **Stadia Maps** | Gratis: 200,000 créditos/mes, **sin uso comercial**; Starter USD 20 por 1 M de créditos, Standard USD 80 por 7.5 M [F9b] | Solo planes de pago | Enterprise a medida | n/d | Cuántos créditos consume cada tile: **SIN VERIFICAR** (la página de docs devolvió 403). No recomendable sin ese dato. |
| **Self-host de OpenFreeMap** | El código es MIT; hay planeta semanal; el autor lo recomienda para alto tráfico [F6][F7] | Sí | El tuyo | Igual que arriba | Solo si el uso se dispara; requiere un servidor con mucho disco (el diseño usa Btrfs con ~300 millones de archivos pequeños [F6]). |

**Por qué incluso OpenFreeMap necesita un plan de contingencia:** en 2025 un solo sitio (Wplace) generó 3,000 millones de solicitudes y 215 TB en 24 horas (100,000 solicitudes/s) y el autor tuvo que bloquearlo temporalmente; dijo que implementará límites por `Referer` y recomendó el autoalojamiento para ese caso [F7]. Agua ZMG no tendrá esa escala, pero demuestra que el servicio público puede apretar límites o caerse sin aviso y que el ToS no promete nada [F4].

**Contingencia práctica (diseño, no implementado):**

1. Estilo principal: OpenFreeMap `positron`.
2. Si falla la carga del estilo (`map.on('error')`), cargar un estilo local mínimo que dibuje solo las colonias sobre fondo liso: el mapa de colonias **sigue siendo útil sin calles**. Costo: cero.
3. Fase 2: extracto PMTiles de la ZMG en R2 (primeros 10 GB de almacenamiento, 1 M de operaciones clase A y 10 M clase B al mes gratis; salida a internet gratis [F34]).

**Atribución obligatoria en pantalla:** `© Colaboradores de OpenStreetMap` + `© OpenMapTiles` si se usa OpenFreeMap/OpenMapTiles + enlace a `openstreetmap.org/copyright` [F2][F3]. El código actual ya muestra "© Colaboradores de OpenStreetMap" para el raster; al cambiar de estilo, que el control de atribución de MapLibre no quede oculto (la política de OSM prohíbe esconderla detrás de menús [F1]).

---

## 4. (c) CDN, caché y peso de la geometría

### 4.1 Medición propia (datos SINTÉTICOS)

No hay shapefile real en `data/raw` (carpetas vacías) y `datos.jalisco.gob.mx` no resolvió DNS desde esta máquina (ni con `curl`, 2026-10-08 ~21:08 GMT), así que **no pude medir con polígonos reales**. Generé en una base propia (`agua_despliegue`, ya eliminada) 2,500 polígonos "orgánicos" (50 filas × 50 columnas de ~0.008°, con 60, 120 o 300 vértices; promedio 109 vértices/colonia, 272,500 vértices en total) y los exporté con la misma consulta que usa `app/api/colonias/geometria/route.ts`.

| Variante (sintético) | Crudo | gzip -9 | brotli -q11 |
|---|---|---|---|
| 2,500 colonias, **sin simplificar**, precisión 5 | 6.93 MB | 1.28 MB | 0.76 MB |
| 2,500, **ruta actual** (`ST_SimplifyPreserveTopology` 0.00005°, precisión 5) | 3.46 MB | 0.65 MB | **0.41 MB** |
| 2,500, tolerancia 0.0001°, precisión 5 | 2.75 MB | 0.51 MB | 0.33 MB |
| 2,500, tolerancia 0.0001°, precisión 4 | 2.56 MB | 0.38 MB | 0.25 MB |
| 2,500, tolerancia 0.0002°, precisión 4 | 1.57 MB | 0.23 MB | 0.15 MB |
| 1,500, ruta actual | 2.07 MB | 0.39 MB | 0.25 MB |
| 1,500, tolerancia 0.0001°, precisión 4 | 1.53 MB | 0.23 MB | 0.15 MB |

Interpretación y límites de esta medición:

- Los polígonos son suaves y con ruido correlacionado; los reales (de 1998 a 2001, digitalizados de ortofotos) suelen tener más ruido y ángulos rectos. Tómalo como orden de magnitud, con un factor de incertidumbre de ~2x.
- Una tolerancia de 0.00005° es ~5 m; de 0.0002° es ~20 m. A zoom de ciudad (z10 a z12) 20 m es invisible; a zoom de calle (z15+) se nota. Para pintar colonias coloreadas basta.
- La geometría es **estática**: los puntajes van en otro endpoint (`/api/colonias/scores`, ya separado). Esa separación es lo correcto: el JSON pesado casi nunca cambia y el liviano cambia cada minuto.

### 4.2 Vector tiles (`ST_AsMVT`): qué ganas y qué no

`ST_AsMVT` existe desde PostGIS 2.4 [F40]; Neon ofrece PostGIS 3.3 a 3.6 [F14], así que está disponible. Medí una función SQL `tile_mvt(z,x,y)` sobre los mismos datos sintéticos (PostGIS 3.4.3 local):

| Zoom | Tiles no vacíos (bbox 0.4° × 0.4°) | Tamaño medio (sin comprimir) | Máximo |
|---|---|---|---|
| 9 | 4 | 123 KB | 137 KB |
| 10 | 4 | 139 KB | 159 KB (66 KB con gzip) |
| 11 | 16 | 40 KB | 114 KB |
| 12 | 36 | 19 KB | 32 KB (18.6 KB con gzip en el tile medido) |
| 13 | 110 | 6.6 KB | 10 KB |

Tiempos de generación en vivo (Postgres local en docker, sin índice sobre `geom` transformada a 3857): ~170 ms por tile z10 y ~112 ms por tile z12. Se pueden bajar guardando una columna `geom_3857` indexada, pero **no los trato como cifras de producción**.

Conclusiones honestas:

1. En la vista de toda la ZMG (donde el usuario empieza), los tiles **no ahorran bytes**: las 2,500 colonias están visibles y 4 tiles z10 suman ~560 KB sin comprimir, similar a los 0.41 a 0.65 MB comprimidos del GeoJSON entero.
2. Lo que ganan los tiles es: (a) carga progresiva al acercar (z12: ~19 KB por tile), (b) menos trabajo de parseo en el móvil que un GeoJSON de varios MB, (c) poder colorear con `feature-state` por `id` sin reinsertar geometría.
3. **Cuándo migrar** (criterio propuesto, no norma): cuando el GeoJSON simplificado supere ~5 MB comprimido (≈ 10x lo medido), cuando el tiempo de primer pintado en un móvil de gama baja con 3G supere el aceptable (0.65 MB a 1.5 Mbps ≈ 3.5 s de descarga; cuenta aritmética mía), o cuando se quiera mostrar manzanas/AGEB en lugar de colonias.
4. Si migras, como la geometría no cambia: **pregenerar** los tiles una sola vez (por ejemplo con `tippecanoe` a un PMTiles; herramienta no probada en esta sesión) y servirlos estáticos desde R2/CDN, en vez de calcular `ST_AsMVT` en cada solicitud. Los puntajes siguen yendo por el endpoint JSON, unidos en el cliente por `id`.

### 4.3 Encabezados de caché recomendados

Verificado en la documentación de Vercel [F22]: con solo `Cache-Control`, Vercel consume `s-maxage` y `stale-while-revalidate`, y al navegador le llega `max-age=0`; los rangos son 1 s a 1 año; `stale-if-error` hace que el CDN sirva el contenido viejo cuando el origen devuelve 500 o falla la red. La propia página recomienda un `max-age` de 60 a 120 s en el navegador para bajar solicitudes CDN de visitantes recurrentes [F22].

| Endpoint | Hoy | Propuesta |
|---|---|---|
| `/api/colonias/geometria` | `public, s-maxage=86400, stale-while-revalidate=604800` | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=604800` |
| `/api/colonias/scores` | `public, s-maxage=60, stale-while-revalidate=300` | `public, max-age=30, s-maxage=120, stale-while-revalidate=600, stale-if-error=3600` (más tolerancia a caída de la base) |

Con `s-maxage=120`, la base recibe como máximo ~1 consulta de `scores` cada 2 minutos por región de CDN en lugar de cada 60 s; con 100,000 visitantes simultáneos la base sigue viendo lo mismo. Esto también ayuda a que Neon pueda dormirse de madrugada.

**Degradación elegante (diseño):** el cliente debe pintar la geometría aunque `scores` falle (colonias en gris "sin datos suficientes", que ya es un estado existente) y mostrar un aviso "datos desactualizados desde hh:mm". Con `stale-if-error`, si la base cae unos minutos el CDN sigue sirviendo los últimos puntajes.

---

## 5. (d) Respaldo, observabilidad y monitoreo gratuitos

| Necesidad | Herramienta | Límite gratis (verificado) | Nota |
|---|---|---|---|
| Respaldo lógico diario | `pg_dump` desde una GitHub Action programada o cron del VPS hacia **Cloudflare R2** | R2: 10 GB-mes, 1 M operaciones clase A, 10 M clase B, salida gratis [F34] | La base de reportes pesa MB; cabe de sobra. Cifrar el dump (`age`/`gpg`) antes de subir. |
| Respaldo alterno | **Backblaze B2** | Primeros 10 GB gratis; llamadas API clase A/B/C gratis; salida gratis hasta 3x el almacenamiento promedio [F44] | Segundo destino, otra empresa. |
| Historial en la base | Neon Free: 6 h (hasta 1 GB-mes) [F12]; Neon Launch: hasta 7 días [F11] | | Supabase Free: **sin** respaldos descargables; recomiendan `db dump` propio [F16][F19]. Supabase Pro: diarios 7 días [F16]. |
| Dato abierto como respaldo | Exportación diaria de puntajes agregados por colonia (CSV/GeoJSON) a R2/GitHub Releases | | Sirve a la comunidad y a la vez es un respaldo de lo publicable. **Nunca** exportar `huella`. |
| Simulacro de restauración | Restaurar el último dump en una base nueva cada mes | | Un respaldo no probado no cuenta. |
| Disponibilidad externa | **UptimeRobot** Free: 50 monitores, intervalo de 5 min, 1 página de estado [F41] | | Descrito como "para proyectos personales y sin fines de lucro"; si la política de uso comercial importa, **SIN VERIFICAR** el texto. |
| Disponibilidad externa (alterna) | **Better Stack** Free: 10 monitores, chequeos hasta cada 30 s, 1 página de estado, alertas por Slack y correo [F42] | | |
| Errores | **Sentry** Developer (gratis): 5,000 errores/mes, 1 usuario, 30 días de retención [F43] | | Un solo usuario; el equipo no comparte. |
| Métricas de uso | Vercel Analytics Hobby: 50,000 eventos/mes [F20]; **Cloudflare Web Analytics** (descrita como "privacy-first", sin cambiar DNS ni proxy [F45]) | | Que no usa cookies o huellas **SIN VERIFICAR** en esta sesión (la página no lo detalla). Para un sitio que promete no guardar datos personales, preferir analítica sin cookies o ninguna, y reflejarlo en el aviso. |
| Límite de tasa de `POST` | **Upstash Redis** Free: 256 MB, 500 K comandos/mes, 10 GB de ancho de banda; 10,000 operaciones/s [F35] | | 5 mil reportes × ~3 comandos = 15 mil comandos: sobra. Alternativa: WAF de Vercel (Hobby 3 reglas, Pro 40; límite de tasa del WAF cuesta USD 0.50 a 0.80 por M de solicitudes permitidas [F20][F28]) o Cloudflare Free (1 regla, 10 s, por IP [F29]). |
| Alerta humana | Una página `/estado` estática + hilo en redes con el estado | | Para que el equipo y la comunidad sepan si es la app, la base o el mapa base. |

---

## 6. (e) Legal en México

Referencias principales: texto vigente de la **Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)**, nueva ley publicada en el DOF el 20 de marzo de 2025, última reforma DOF 14-11-2025 [F50]. La autoridad ya no es el INAI sino la **Secretaría Anticorrupción y Buen Gobierno** (art. 2, fracción XV) [F50]. Los artículos citados abajo los leí en el PDF del texto vigente.

### 6.1 Datos personales: qué trata realmente la app

- **Definición (art. 2, V):** "cualquier información concerniente a una persona identificada o identificable ... identificable cuando su identidad pueda determinarse directa o indirectamente a través de cualquier información" [F50].
- **Sensibles (art. 2, VI):** incluye "estado de salud presente o futuro" [F50]. Los síntomas del formulario son salud. Tratar datos sensibles exige consentimiento expreso y por escrito (art. 8) **si son datos personales**; y no pueden crearse bases con datos sensibles sin justificar finalidades legítimas y concretas [F50].
- **Disociación (art. 2, IX):** procedimiento por el cual los datos "no pueden asociarse a la persona titular ni permitir, por su estructura, contenido o grado de desagregación, la identificación de la misma" [F50]. Y el art. 9, III exime de pedir consentimiento cuando los datos pasan por disociación previa [F50].
- **Lo que hoy hace el código:** calcula `sha256(HASH_SALT | día | IP | user-agent)` y guarda la huella con el reporte (`reportes.huella`, `UNIQUE (colonia_id, huella, dia)`). No guarda la IP.

**Lectura (mi interpretación, a validar con abogado):**

1. La huella es un **seudónimo**, no una disociación. Mientras exista la sal y la huella, alguien con acceso a ambas puede probar IPs (el espacio IPv4 es chico) y reidentificar a un reportante, cruzándolo con un reporte de salud. Por eso la frase "no guardamos datos personales" **no es defendible tal cual**.
2. Lo que sí es cierto y defendible: no se guarda la IP en la base, no hay cuentas, no se piden nombre, teléfono, domicilio ni ubicación exacta.
3. **Mejoras concretas** para acercarse a "disociación" real y reducir riesgo (todas fuera de mi propiedad, ver Pendientes):
   - Hacer `HASH_SALT` **obligatoria** en producción (fallar al arrancar si falta; hoy cae a `"dev-salt"`).
   - Usar HMAC-SHA256 con clave secreta en lugar de concatenar la sal, y **rotar** la clave diariamente borrando las anteriores, de modo que huellas de días pasados queden irreversibles.
   - **Purgar `huella`** (poner en `NULL`) pasados los 14 días de la ventana de cálculo; el `UNIQUE` solo necesita la huella el mismo día.
   - Publicar solo agregados por colonia con n >= 3 (ya existe) y nunca la lista de reportes individuales con fecha/hora.
   - Campo `comentario` (hasta 500 caracteres): es texto libre y puede traer nombres, direcciones, teléfonos o acusaciones contra terceros. Recomiendo **no publicarlo**, retenerlo solo para moderación y borrarlo a los 30 días, o eliminar el campo.
   - Logs de infraestructura: el proveedor (Vercel, Cloudflare) sí ve IPs. Vercel retiene logs de ejecución 1 hora en Hobby y 1 día en Pro [F20]. El aviso debe decirlo y no prometer más de lo que la infraestructura cumple.
   - No usar Google Analytics ni pixeles de terceros.

### 6.2 Aviso de privacidad simplificado

Reglas aplicables (verificadas en el texto):

- Art. 15: el aviso debe contener al menos identidad y domicilio del responsable; datos tratados (señalando los sensibles); finalidades (distinguiendo las que requieren consentimiento); opciones para limitar el uso o divulgación; mecanismos para ejercer los derechos ARCO; y cómo se avisarán cambios [F50].
- Art. 16, II: si los datos se obtienen por medio electrónico, debe darse el aviso en **modalidad simplificada**, con al menos las fracciones I a IV del art. 15 y el sitio donde consultar el aviso integral [F50].
- Art. 7: el consentimiento tácito es válido por regla general si se puso a disposición el aviso y la persona no manifiesta lo contrario; los datos sensibles piden consentimiento **expreso** (art. 8) [F50]. Para salud, el botón de enviar reporte con un texto claro encima ("al enviar aceptas...") es el mínimo razonable; **SIN VERIFICAR** si eso cumple "por escrito" en el medio electrónico, por eso la estrategia de disociación del punto 6.1 es más segura.
- El "responsable" debe tener identidad y domicilio (art. 15, I). **Hay que decidir quién es**: una persona física, una asociación civil o un colectivo con representante. Es decisión humana y condiciona también la cuenta de Vercel/Neon y la titularidad de las licencias.

Borrador (con campos entre corchetes por completar; no es texto legal revisado):

> **Aviso de privacidad simplificado.** [Nombre del responsable], con domicilio en [domicilio y correo], es responsable del tratamiento de los datos de este sitio. Al enviar un reporte recibimos: la colonia que eliges, el nivel de gravedad, los síntomas que marques (datos de salud, que son datos sensibles) y, si lo escribes, un comentario. No pedimos tu nombre, teléfono, correo, domicilio ni ubicación exacta. Para evitar reportes repetidos generamos un código a partir de tu dirección IP y navegador; no guardamos la IP y el código se [elimina a los 14 días]. Usamos estos datos solo para calcular y mostrar el nivel de afectación por colonia, y para publicar estadísticas abiertas agregadas por colonia. No los vendemos ni los compartimos con terceros, salvo [proveedores de infraestructura: Vercel/Neon/…, que registran tu IP en bitácoras técnicas por [plazo]]. Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo a [correo]. Consulta el aviso integral en [URL]. Te avisaremos de cambios en [URL].

### 6.3 Responsabilidad por contenido ciudadano

Lo verificado:

- **Daño moral (Código Civil Federal, art. 1916):** afectación en "honor, reputación, vida privada..."; el responsable debe indemnizar [F51].
- **Art. 1916 Bis:** "No estará obligado a la reparación del daño moral quien ejerza sus derechos de opinión, crítica, expresión e información, en los términos y con las limitaciones de los artículos 6o. y 7o. de la Constitución"; el demandante debe "acreditar plenamente la ilicitud de la conducta del demandado y el daño que directamente le hubiere causado" [F51]. Esto es del Código **Federal**; los códigos civiles estatales (Jalisco) no los revisé: **SIN VERIFICAR**.
- **T-MEC art. 19.17:** ninguna Parte debe tratar a un proveedor o **usuario** de un servicio informático interactivo como proveedor del contenido, para determinar responsabilidad por daños relacionados con información que el servicio almacena o distribuye, salvo que lo haya creado o desarrollado en todo o en parte [F52]. El anexo 19-A dice que no aplica a México hasta 3 años después de la entrada en vigor [F52]; el tratado entró en vigor el 1 de julio de 2020 [F53], o sea, **desde el 1 de julio de 2023**. Pero es una obligación entre Estados, no una ley mexicana que un vecino pueda invocar directamente; no encontré en esta sesión una ley mexicana equivalente a una "sección 230".
- **Jurisprudencia reciente:** la Segunda Sala de la SCJN reafirmó en diciembre de 2024 el principio de no responsabilidad de intermediarios (amparo en revisión 767/2023) según R3D [F54]. Y está/estaba pendiente el caso *Richter vs. Google* (condena de más de 5,000 millones de pesos a Google por un blog de un tercero) en la Corte; una carta de la CCIA (grupo de cabildeo industrial) de enero de 2026 decía que la resolución podía llegar en febrero [F55]. **No verifiqué cómo se resolvió**: asumir que el riesgo para intermediarios en México **no está cerrado**.

**Lectura práctica y mitigaciones (no eliminan el riesgo, lo reducen):**

1. El producto es por diseño de bajo riesgo: se publican **agregados por colonia** a partir de **campos estructurados** (gravedad 1 a 4 y síntomas de un catálogo), no acusaciones de texto libre contra personas o empresas.
2. No publicar `comentario`. Si se publica algún día: moderación previa, filtro de teléfonos/correos/URLs, y botón de "reportar contenido".
3. Canal de retiro: un correo visible para solicitudes de baja o rectificación con compromiso de respuesta (por ejemplo, 5 días hábiles; el plazo es decisión de ustedes).
4. Términos de uso breves: los reportes son declaraciones de vecinos sin verificar; prohibido enviar datos de terceros; el sitio puede retirar reportes; no hay cuentas.
5. Detección de brigadeo (ya en el README como pendiente): el riesgo de que un competidor o grupo manipule el mapa de una colonia, con su consecuencia reputacional/inmobiliaria, es mayor que el riesgo de difamación, y la mitigación es técnica (límites, umbral n >= 3, ventana de 14 días) más una nota metodológica pública.
6. Guardar el texto de los términos con fecha (versiones) para mostrar qué se aceptó.

### 6.4 Descargos de responsabilidad (texto propuesto)

Debe ir visible en el pie de la página principal y en una página `/acerca`, no solo en el aviso legal. Borrador:

> **Esto no es información oficial ni consejo médico.** Agua ZMG muestra reportes de vecinos, que no están verificados y reflejan percepción, no mediciones de laboratorio. Los colores de cada colonia son un promedio de lo que reporta la gente en los últimos 14 días y pueden no coincidir con la realidad de tu calle o tu casa. No sustituye los análisis del SIAPA, de la autoridad sanitaria ni de laboratorios acreditados. Si tienes síntomas (diarrea, vómito, fiebre, irritación de piel), consulta a un médico o a los servicios de salud. [Los datos oficiales o académicos que aparezcan se muestran aparte, con su fuente y fecha.]

Un descargo no libera de responsabilidad si el contenido es ilícito, pero fija expectativas y reduce el riesgo de que alguien tome decisiones de salud únicamente con el color del mapa. Contenido de salud específico (qué hervir, cuánto, a qué teléfono llamar) **debe llevar fuente verificada** o no incluirse; la regla del proyecto ya lo exige.

---

## 7. (f) Licencias de datos abiertos y de código (decisión del humano)

### 7.1 Qué se exportaría y qué ya trae licencia

| Componente | Origen | Estado |
|---|---|---|
| Puntajes/agregados por colonia, día, n de reportes | Propio (trabajo derivado de reportes ciudadanos) | Tú eliges licencia |
| Polígonos de colonias | IIEG, "Planimetría ZMG (vuelos 1998-2001), colonias". El README del proyecto dice CC-BY. La copia en el catálogo CKAN `data.amerigeoss.org` **no lista licencia** [F56]; `datos.jalisco.gob.mx` no resolvió DNS desde mi máquina hoy | **SIN VERIFICAR**. Hay que abrir la ficha oficial y copiar el texto de licencia y la forma de citarla antes de redistribuir geometrías. |
| Cualquier dato de OpenStreetMap (si otro agente trae nombres/límites de OSM en `data/raw/osm-overpass`) | OSM, ODbL | Mezclarlo con la base propia crea una **Base de Datos Derivada**: obliga a ODbL (ver abajo). |

### 7.2 ODbL 1.0 vs CC BY 4.0 (datos)

| Aspecto | ODbL 1.0 | CC BY 4.0 |
|---|---|---|
| Qué exige | Atribución; **compartir igual** para bases derivadas que se usen públicamente; mantener abierta (si redistribuyes una derivada con restricciones técnicas, ofrecer también la versión sin restricciones) [F47][F48] | Dar crédito, enlazar la licencia, indicar cambios [F49] |
| Obras producidas (mapas, gráficas) | No activan el compartir igual; solo aviso de procedencia (cláusula 4.5 y 4.3) [F48] | No hay copyleft |
| Pensada para | Bases de datos (derechos sui generis, contrato y copyright) | Obras creativas; desde 4.0 cubre derechos de bases de datos. CC reconoce que las condiciones de licencias CC "no aplican a usos de datos que no implican derechos de autor" [F57] |
| Compatibilidad con OSM | Es la misma licencia de OSM, sin fricción [F2] | Distinta; mezclar con OSM es problemático |
| Fricción para reúso por gobierno/medios | Media: el compartir igual puede frenar a quien quiera integrarlo a una base propietaria | Baja |
| Riesgo de que una empresa lo tome y lo cierre | Bajo en la base; lo derivado se abre | Alto: pueden reutilizar sin devolver |

Nota de compatibilidad: una discusión técnica señala que la cláusula de ODbL que permite medidas técnicas restrictivas (si se ofrece también copia libre) choca con la prohibición de CC BY de imponer "medidas tecnológicas efectivas" [F58]. Fuente secundaria; si se mezclan ambas, que lo revise un abogado.

**Recomendación (a decidir por ustedes):** **ODbL 1.0 para la base de datos exportada** de agregados por colonia, porque (1) cualquier mezcla con OSM la fuerza, (2) mantiene abiertas las mejoras que hagan otras ciudades o empresas, y (3) "Obra producida" deja libres los mapas y notas de prensa con solo citar la fuente. **CC BY 4.0** es la alternativa si la prioridad es que SIAPA, UdeG, CEDHJ o los medios lo integren sin ninguna obligación de reciprocidad. Hay que citar en ambos casos a IIEG por los polígonos, según la licencia real que se confirme. Que el derecho mexicano proteja o no las bases de datos de forma equivalente al "derecho sui generis" europeo: **SIN VERIFICAR**, consultar abogado.

### 7.3 AGPL-3.0 vs MIT (código)

| Aspecto | AGPL-3.0 | MIT |
|---|---|---|
| Permite uso comercial, modificar, distribuir | Sí [F59] | Sí [F60] |
| Condición central | Si ejecutas una versión **modificada** como servicio en red, debes ofrecer su código fuente completo a los usuarios [F59][F61] | Solo conservar el aviso de copyright y licencia [F60] |
| Efecto en forks | Un tercero que despliegue una versión mejorada debe liberarla | Puede cerrar sus mejoras |
| Adopción por gobiernos y empresas | Algunas áreas de TI evitan AGPL por política | Máxima adopción, mínima fricción |
| Responsabilidad | Sin garantía [F59] | Sin garantía [F60] |

Las dependencias directas son de licencias permisivas: `maplibre-gl` es BSD-3-Clause (verificado en su `package.json`); Next, React, pg y zod son MIT (**SIN VERIFICAR** hoy: correr `pnpm licenses list` antes de elegir).

**Recomendación (a decidir por ustedes):** **AGPL-3.0** si el objetivo es que otras ciudades (Monterrey, CDMX, etc.) reutilicen el proyecto y lo que se mejore regrese a la comunidad; **MIT** si el objetivo principal es que lo adopte el mayor número de gobiernos y organizaciones sin trabas. Aclarar en el repo que el código y los datos tienen **licencias distintas** (código AGPL/MIT; datos ODbL/CC BY) y que los polígonos de IIEG conservan la suya.

---

## 8. (g) Estimación de costo mensual

Todos los montos en USD/mes, antes de IVA y sin dominio. Fórmulas visibles; los volúmenes salen de la sección 1 (supuestos míos). Precios vigentes al 2026-10-08 según las páginas citadas.

### 8.1 Plan primario: Vercel Pro + Neon Launch + OpenFreeMap

| Concepto | 10 mil visitas | 100 mil | 1 millón |
|---|---|---|---|
| Vercel Pro (cuota de plataforma, incluye USD 20 de crédito) [F23] | 20 | 20 | 20 |
| Nivel CDN: 250 mil / 2.5 M / 25 M solicitudes. Incluido: 1 M; siguiente nivel USD 20 por 10 M; USD 100 por 50 M [F24] | 0 | +20 (el nivel se ajusta al siguiente ciclo) | +100 |
| Transferencia: 11 GB / 110 GB / 1.1 TB; nivel incluido 1 TB, niveles de pago hasta 50 TB [F24] | 0 | 0 | 0 (si cae en un nivel pagado ya está cubierta) |
| Neon Launch (0.25 CU encendida: 0.25 × 730 × 0.106 ≈ 19.4; almacenamiento <1 GB ≈ 0.35) [F11] | ~20 | ~20 a 25 | ~20 a 40 (autoescalado, ponerle tope) |
| Mapa base OpenFreeMap [F3][F4] | 0 (donación opcional) | 0 | 0 |
| Monitoreo, respaldo (R2/B2 gratis), Sentry | 0 | 0 | 0 |
| **Total aproximado** | **~40** | **~60 a 65** | **~140 a 160** |

Sensibilidades:

- Si bajan las solicitudes por visita de 25 a 10 (menos chunks, `max-age` en el navegador, tiles fuera del dominio), con 1 M de visitas serían ~10 M solicitudes, que caben en el nivel de USD 20: total ~60 a 80.
- Un pico de un día no cambia el precio: Vercel mueve de nivel solo si el **total del ciclo** excede la capacidad, y lo hace al siguiente ciclo [F24]. Antes de que se ajuste, el exceso se factura a demanda a USD 2 a 3.20 por millón de solicitudes y USD 0.15 a 0.35 por GB [F28]; cómo se combina eso con el nivel plano en el primer mes de pico: **SIN VERIFICAR**. Configurar alertas de gasto (por defecto avisa a USD 200 [F23]) y un tope en Spend Management.
- Alternativa de base: Supabase Pro USD 25 fijos (incluye USD 10 de crédito de cómputo, 8 GB, 250 GB de salida, respaldos 7 días, sin pausa) [F16].

### 8.2 Plan B: VPS + Cloudflare Free + OpenFreeMap (o PMTiles)

| Concepto | 10 mil | 100 mil | 1 millón |
|---|---|---|---|
| VPS 2 vCPU / 4 GB con Next + PostGIS (orden de magnitud EUR 4 a 10; **SIN VERIFICAR**, ver 2.4) | ~5 a 10 | ~5 a 10 | ~10 a 20 (subir de tamaño si el caché no atrapa) |
| Cloudflare Free (DNS, CDN, DDoS) [F30][F29] | 0 | 0 | 0 |
| Respaldos en R2/B2 [F34][F44] | 0 | 0 | 0 |
| Mapa base OpenFreeMap | 0 | 0 | 0 |
| Si autoaloja PMTiles en R2: operaciones clase B = 0.4 M / 4 M / 40 M, con 10 M gratis y USD 0.36 por M adicional [F34] | 0 | 0 | ~10.8 (cota superior: no descuenta lo que sirva el caché del borde) |
| **Total aproximado** | **~5 a 10** | **~5 a 10** | **~10 a 30** |

Riesgos que no aparecen en el precio: un solo servidor (punto único de falla), parches y respaldos a cargo del equipo, y que el éxito del caché depende de una Cache Rule bien hecha [F32].

### 8.3 Plan $0 (piloto)

Vercel Hobby (100 GB, 1 M solicitudes CDN, 1 M invocaciones, **no comercial**) + Neon Free + OpenFreeMap [F20][F11].

- Tope por solicitudes: 1,000,000 / 25 = **40 mil visitas/mes** (~1,300 al día).
- Tope por transferencia: 100 GB / 1.1 MB ≈ **91 mil visitas/mes**.
- Tope de Neon: 400 horas de cómputo al mínimo = **16.7 días encendida**, luego se suspende [F15].
- Al exceder en Hobby hay que esperar 30 días [F20].

Sirve para validar con un grupo de vecinos; **no** para el pico de la crisis.

---

## 9. Plan operativo mínimo para la crisis

1. Antes de abrir: decidir el responsable legal (6.2), cambiar el mapa base (3), poner `HASH_SALT` obligatoria (6.1), ajustar encabezados de caché (4.3).
2. Contratar Vercel Pro y Neon Launch con topes de gasto; usar la cadena `-pooler` de Neon [F13].
3. Cuentas y claves en un gestor de contraseñas con al menos dos personas con acceso (que el servicio no dependa de una sola).
4. UptimeRobot/Better Stack apuntando a `/`, `/api/colonias/scores` y `/api/colonias/geometria`; página de estado pública.
5. Respaldo nocturno a R2 y primer simulacro de restauración antes del lanzamiento.
6. Publicar `/acerca` con metodología (ventana 14 días, vida media 7 días, mínimo 3 reportes), descargo (6.4), aviso simplificado (6.2) y licencias (7).
7. Prueba de carga básica contra la URL final (por ejemplo `k6` o `autocannon`; **no ejecuté ninguna**) para confirmar que `x-vercel-cache` devuelve `HIT` en `scores` y `geometria`.

---

## 10. Pendientes para los dueños de los archivos (no los edité)

| Archivo / tema | Cambio propuesto | Prioridad |
|---|---|---|
| `web/components/AguaApp.tsx` | Sustituir `https://tile.openstreetmap.org/...` por el estilo vectorial de OpenFreeMap (o equivalente); mantener atribución visible; manejar fallo de carga del estilo con un fondo liso | Bloqueante |
| `web/lib/fingerprint.ts` | `HASH_SALT` obligatoria en producción (sin `"dev-salt"`); HMAC con clave secreta; rotación diaria con borrado de claves viejas | Bloqueante |
| `web/app/api/reportes/route.ts` | IP real del cliente según plataforma (Vercel o Cloudflare) en vez del primer valor de `x-forwarded-for` si hay proxy propio; límite de tasa (Upstash/WAF); decidir qué hacer con `comentario` (no publicarlo, filtrar, borrar a 30 días) | Alta |
| `db/migrations/` (nueva) | Tarea de purga de `reportes.huella` > 14 días y de `comentario` > 30 días; índice o columna `geom_3857` si se pasa a `ST_AsMVT` dinámico | Alta |
| `web/app/api/colonias/*/route.ts` | Encabezados de 4.3 (`max-age` corto + `stale-if-error`) | Alta |
| `web/lib/db.ts` | Con Neon: cadena `-pooler`, `max` bajo por instancia y manejo de arranque en frío (reintentar) | Alta |
| `web/next.config.ts` | Si hay Plan B: `output: 'standalone'`; encabezados de seguridad | Media |
| Nuevas páginas `/acerca`, `/privacidad`, `/terminos` | Contenido de 6.2, 6.3, 6.4; link en el pie; pendiente que el responsable legal confirme los datos de contacto | Alta |
| `LICENSE` / `LICENSE-DATOS` / `README` | Texto de la licencia elegida (7); cita a IIEG con la licencia confirmada | Media |
| Exportación diaria de datos abiertos | Endpoint o tarea que genere CSV/GeoJSON agregado (sin `huella`) y lo suba a R2; sirve también de respaldo | Media |
| Pruebas | Prueba de carga y verificación de `HIT` en el CDN | Alta |

**needsDeps:** ninguna dependencia nueva requerida. Opcionales de operación (no del proyecto): CLI `pmtiles` y `tippecanoe` para la fase 2 de vector tiles/PMTiles.

---

## 11. Lista de lo que NO pude verificar

- Precios actuales de Hetzner (las páginas oficiales no mostraron precio), latencias a México desde cualquier proveedor.
- Licencia exacta del dataset IIEG de colonias y su ficha oficial (`datos.jalisco.gob.mx` no resolvió DNS desde mi máquina).
- Tamaño real del GeoJSON con polígonos verdaderos de las colonias (medí con datos sintéticos).
- Peso real del bundle de la app (`next build` no se corrió para no interferir con otros agentes) y tiles reales por sesión.
- Cuántos créditos consume un tile en Stadia; el límite de 1 M de tiles/mes del API de Protomaps (solo resumen de búsqueda).
- Si Cloudflare Web Analytics no usa cookies ni huellas; si UptimeRobot Free permite uso comercial.
- Cómo se resolvió *Richter vs. Google* en la SCJN; si hay legislación mexicana nueva sobre intermediarios; la regulación estatal de daño moral en Jalisco.
- Cómo factura Vercel exactamente el primer mes de un pico que excede el nivel incluido.
- Licencias de todas las dependencias (solo verifiqué `maplibre-gl`).
- Si el consentimiento tácito/por clic cumple el requisito "por escrito" del art. 8 para datos sensibles en medios electrónicos.

---

## 12. Fuentes

Verificadas durante esta sesión (2026-10-08), salvo lo marcado.

**Mapa base**
- [F1] Política de uso de tiles de OSM: https://operations.osmfoundation.org/policies/tiles/
- [F2] Derechos de autor y atribución de OSM: https://www.openstreetmap.org/copyright
- [F3] OpenFreeMap: https://openfreemap.org/
- [F4] Términos de OpenFreeMap: https://openfreemap.org/tos/
- [F5] Inicio rápido de OpenFreeMap: https://openfreemap.org/quick_start/
- [F6] Repositorio de OpenFreeMap: https://github.com/hyperknot/openfreemap
- [F7] "OpenFreeMap survived 100,000 requests per second": https://hyperknot.com/blog/openfreemap-survived-100000-requests/
- [F7b] PMTiles: https://docs.protomaps.com/pmtiles/
- [F8] Descargas del mapa base de Protomaps: https://docs.protomaps.com/basemaps/downloads
- [F9] Protomaps con MapLibre: https://docs.protomaps.com/basemaps/maplibre
- [F10b] Términos del API de Protomaps: https://protomaps.com/api
- [F8b] Precios de MapTiler: https://www.maptiler.com/cloud/pricing/
- [F9b] Precios de Stadia Maps: https://stadiamaps.com/pricing/
- [F12b] Despliegue de PMTiles: https://docs.protomaps.com/deploy/
- [F12c] CLI de PMTiles: https://docs.protomaps.com/pmtiles/cli

**Base de datos**
- [F10] PostGIS en Neon: https://neon.com/docs/extensions/postgis
- [F11] Precios de Neon: https://neon.com/pricing
- [F12] Planes de Neon: https://neon.com/docs/introduction/plans
- [F13] Pool de conexiones de Neon: https://neon.com/docs/connect/connection-pooling
- [F14] Extensiones y versiones de Neon: https://neon.com/docs/extensions/pg-extensions
- [F15] Métricas de uso de Neon: https://neon.com/docs/introduction/usage-metrics
- [F17] Escala a cero de Neon: https://neon.com/docs/introduction/scale-to-zero
- [F16] Precios de Supabase: https://supabase.com/pricing y respaldos: https://supabase.com/docs/guides/platform/backups
- [F18] PostGIS en Supabase: https://supabase.com/docs/guides/database/extensions/postgis
- [F19] Lista de producción de Supabase: https://supabase.com/docs/guides/platform/going-into-prod
- [F25] Aiven PostgreSQL gratis: https://aiven.io/free-postgresql-database
- [F40] `ST_AsMVT`: https://postgis.net/docs/ST_AsMVT.html

**Plataformas y CDN**
- [F20] Plan Hobby de Vercel: https://vercel.com/docs/plans/hobby
- [F21] Directrices de uso justo de Vercel: https://vercel.com/docs/limits/fair-use-guidelines
- [F22] Encabezados Cache-Control en Vercel: https://vercel.com/docs/caching/cache-control-headers
- [F23] Plan Pro de Vercel: https://vercel.com/docs/plans/pro-plan
- [F24] Flat Rate CDN de Vercel: https://vercel.com/docs/pricing/flat-rate-cdn
- [F28] Precios regionales de Vercel: https://vercel.com/docs/pricing/regional-pricing
- [F31] Programa de código abierto de Vercel: https://vercel.com/kb/guide/can-vercel-sponsor-my-open-source-project
- [F7c] Precios de Vercel (Hobby vs Pro): https://vercel.com/pricing
- [F26] Hetzner, nube optimizada en costo: https://www.hetzner.com/cloud/cost-optimized/
- [F27] Hetzner, rendimiento regular: https://www.hetzner.com/cloud/regular-performance/
- [F39] Facturación de Hetzner Cloud: https://docs.hetzner.com/cloud/billing/faq/
- [F36] Recursos Always Free de OCI: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- [F37] Regiones de OCI: https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm
- [F38] Precios de Fly.io: https://docs.fly.io/about/pricing
- [F32] Comportamiento de caché por defecto en Cloudflare: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- [F33] Términos específicos de servicios (cláusula CDN): https://www.cloudflare.com/service-specific-terms-application-services/
- [F29] Reglas de límite de tasa de Cloudflare: https://developers.cloudflare.com/waf/rate-limiting-rules/
- [F30] Protección DDoS de Cloudflare: https://developers.cloudflare.com/ddos-protection/
- [F34] Precios de R2: https://developers.cloudflare.com/r2/pricing/
- [F34b] Precios de Workers: https://developers.cloudflare.com/workers/platform/pricing/
- [F34c] Límites de Pages: https://developers.cloudflare.com/pages/platform/limits/
- Documentación de Next incluida en el repo: `web/node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, `.../cdn-caching.md`, `.../01-app/03-api-reference/05-config/01-next-config-js/output.md`

**Monitoreo y respaldo**
- [F41] UptimeRobot: https://uptimerobot.com/pricing/
- [F42] Better Stack: https://betterstack.com/pricing
- [F43] Sentry: https://sentry.io/pricing/
- [F35] Upstash Redis: https://upstash.com/pricing/redis
- [F44] Backblaze B2: https://www.backblaze.com/cloud-storage/pricing
- [F45] Cloudflare Web Analytics: https://developers.cloudflare.com/web-analytics/

**Legal**
- [F50] LFPDPPP, texto vigente (Cámara de Diputados): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
- [F51] Código Civil Federal, arts. 1916 y 1916 Bis: https://www.diputados.gob.mx/LeyesBiblio/pdf/CCF.pdf
- [F52] T-MEC, capítulo 19 (art. 19.17 y anexo 19-A): https://ustr.gov/sites/default/files/files/agreements/FTA/USMCA/Text/19-Digital-Trade.pdf
- [F53] Entrada en vigor del T-MEC el 1 de julio de 2020 (fuente secundaria): https://www.retailconsumerproductslaw.com/2020/07/expansion-of-section-230-of-u-s-communications-decency-act-with-july-1-implementation-of-u-s-mexico-canada-agreement-usmca/
- [F54] R3D sobre la Segunda Sala de la SCJN y la no responsabilidad de intermediarios (fuente secundaria): https://r3d.mx/2024/12/04/segunda-sala-de-la-scjn-reafirma-el-principio-de-no-responsabilidad-de-intermediarios-en-favor-de-la-libertad-de-expresion/
- [F55] Carta de la CCIA sobre el caso Richter vs. Google (grupo de cabildeo, 28 de enero de 2026): https://ccianet.org/wp-content/uploads/2026/02/Letter-to-State-and-USTR-on-Mexico-Intermediary-Liability.pdf
- [F46] Cobertura de prensa de la crisis (cifras de la CEDHJ y firmas): https://www.cronica.com.mx/jalisco/guadalajara/2026/10/05/promueven-con-firmas-una-comparecencia-publica-para-que-se-explique-crisis-del-agua-sucia/ (resultado de búsqueda; no abrí la nota completa)

**Licencias**
- [F47] Resumen de ODbL: https://opendatacommons.org/licenses/odbl/summary/
- [F48] Texto de ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/
- [F49] CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- [F57] CC, datos y licencias: https://wiki.creativecommons.org/wiki/Data_and_CC_licenses
- [F58] Discusión OKFN sobre ODbL y CC (fuente secundaria): https://discuss.okfn.org/t/maintenance-and-future-of-the-open-data-commons-licences/4460
- [F59] AGPL-3.0: https://choosealicense.com/licenses/agpl-3.0/
- [F60] MIT: https://choosealicense.com/licenses/mit/
- [F61] Por qué la AGPL: https://www.gnu.org/licenses/why-affero-gpl.html
- [F56] Dataset IIEG en CKAN (sin licencia listada): https://data.amerigeoss.org/dataset/?tags=zmg

---

## Apéndice: cómo reproducir la medición de la sección 4

Base temporal propia (nunca `agua_zmg`): `CREATE DATABASE agua_despliegue`, `CREATE EXTENSION postgis`, tabla `c(id, nombre, municipio, demo, geom geometry(MultiPolygon,4326))` con 2,500 polígonos generados con `generate_series` (radio con ruido sinusoidal, 60/120/300 vértices) y exportación con la consulta de `app/api/colonias/geometria/route.ts` variando `ST_SimplifyPreserveTopology(geom, tol)` y la precisión de `ST_AsGeoJSON`. Tamaño comprimido con `gzip -9` y `brotli -q 11`. Tiles con `ST_AsMVT(ST_AsMVTGeom(ST_Transform(geom,3857), ST_TileEnvelope(z,x,y), 4096, 64, true))`. Con polígonos reales, repetir antes de decidir; la forma del dato cambia el resultado.
