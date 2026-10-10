# Anti-abuso y robustez estadística para Agua ZMG

**Fecha:** 2026-10-08 · **Alcance:** cómo evitar que el mapa sea manipulado (brigadeo para inflar o desinflar una colonia, bots, intereses políticos o comerciales, trolls) **sin login y sin guardar datos personales**.
**Estado:** investigación + prototipo. Todo el código y el SQL de los anexos se probó en una base propia (`agua_antiabuso*`, ya eliminadas); **no se tocó ningún archivo del proyecto** fuera de este documento. Los resultados marcados "ejecutado" salieron de esas pruebas; lo marcado "SIN VERIFICAR" no pude comprobarlo en esta sesión.

---

## 0. Resumen ejecutivo

**Premisa honesta.** Sin una autoridad que verifique identidades no se puede impedir que una persona aparente ser muchas (ataque Sybil; resultado clásico de Douceur 2002, ver §2). Lo que sí se puede es: (a) subir el costo de atacar, (b) **limitar cuánta influencia puede tener una sola red**, (c) **degradar en vez de censurar** lo sospechoso, (d) **mostrar la incertidumbre** en el mapa y (e) dejar todo **auditable y público**. Eso es lo que propone este documento.

**Diez decisiones concretas**

| # | Decisión | Dónde |
|---|----------|-------|
| 1 | La IP se toma **desde la derecha** de `X-Forwarded-For` (hoy se toma el primer valor, que el cliente puede falsificar en proxies que *agregan*). | §5.2, Anexo B |
| 2 | Identidades anónimas **HMAC con clave del día** derivada de un secreto en variable de entorno (no `sha256` con sal fija y `"dev-salt"` por defecto): `huella` (IP/64 + UA), `red` (/24 o /48 del día), `red_sem` (mismo prefijo, semanal), `ua_familia` (grueso). | §5.3, §9 |
| 3 | Un **token de formulario firmado** (HMAC, sin estado) + tiempo mínimo + **honeypot**: el bot recibe `201` falso y no se guarda nada. | §5.5–5.6 |
| 4 | `Content-Type: application/json` obligatorio + validación de `Origin`/`Sec-Fetch-Site` (hoy cualquier página web puede hacer que sus visitantes envíen reportes). | §5.4 |
| 5 | **Límites de tasa en Postgres** (ventana fija atómica con `INSERT ... ON CONFLICT`), con límites **duros** (429) y **blandos** (el reporte entra "en revisión"). Sin Redis. | §5.7 |
| 6 | Cupo de 3 colonias/día **sin carrera** (candado asesor por huella). Hoy se puede saltar con peticiones en paralelo (ejecutado: 8 de 9 pasan). | §5.8 |
| 7 | **Agregación robusta v1**: tope de peso por red, decaimiento 7 días, media recortada 20 % por masa de peso, contracción hacia un prior acotado, y **confianza sin_datos/baja/media/alta** con umbrales numéricos. SQL y oráculo TypeScript dan el mismo resultado (40 casos aleatorios, diferencia máx. 2e-9). | §6 |
| 8 | **Ráfagas**: pico estadístico por colonia + exigir ≥ 2 señales de baja diversidad antes de actuar; la acción es **degradar** (peso ×0.25), nunca ocultar. Discordancia espacial con colonias vecinas va a la cola humana. | §7 |
| 9 | **Moderación con bitácora de solo agregado** (trigger que impide `UPDATE/DELETE/TRUNCATE`), función `moderar()` como único camino, el sistema no puede ocultar con heurísticas. | §8 |
| 10 | **Metodología pública**: parámetros versionados, datos agregados diarios, vectores de prueba y estadísticas de moderación. | §10 |

**Lo que logra y lo que no (simulación ejecutada con el oráculo del Anexo B.2; reportes falsos repartidos en 2 días, sin detección)** — cuántos reportes falsos hacen falta para cambiar el color de una colonia:

| Colonia (honestos) | Cambio buscado | Falsos desde **una** red: hoy / v1 | Falsos desde **redes distintas**: hoy / v1 |
|---|---|---|---|
| 12 "grave" | color ≤ 2 | 4 / **> 400** | 4 / 5 |
| 12 "grave" | color 1 | 33 / **> 400** | 33 / 19 |
| 12 "crítica" | color ≤ 2 | 10 / **> 400** | 10 / 9 |
| 4 "leve" | color ≥ 3 | 4 / **> 400** | 4 / 4 |

La mejora es enorme contra **una sola red/dispositivo** (el caso barato) y **casi nula contra reportes falsos que parecen vecinos distintos**: ningún estimador resuelve eso sin identidad. Incluso hay una celda donde v1 es *peor* que hoy (grave → color 1: 19 falsos contra 33), porque el prior bajo (m0 ≈ 2) y el recorte acercan el resultado al extremo; es el precio de proteger a las colonias con pocos reportes (§12). Contra ese caso la defensa es otra: confianza que exige corroboración en varios días, detección por comportamiento, discordancia espacial, revisión humana, y transparencia (§7, §8, §10). Los límites quedan escritos en §12 y en dos pruebas marcadas "LÍMITE CONOCIDO".

---

## 1. Diagnóstico del código actual

Revisé `web/app/api/reportes/route.ts`, `web/lib/fingerprint.ts`, `web/app/api/colonias/scores/route.ts` y `db/migrations/001_init.sql`. Los puntos D1, D3 y D4 los **reproduje ejecutando la misma lógica contra mi base** (script desechable que replica la lógica de la ruta); no llamé al endpoint real (no levanté `next dev`).

| ID | Hallazgo | Evidencia | Gravedad |
|----|----------|-----------|----------|
| D1 | **El tope de 3 colonias/día se salta con peticiones paralelas** (`SELECT` previo y luego `INSERT`, sin candado). | Misma IP+UA, 9 colonias en paralelo → **8 aceptadas** (en secuencia: 3). | Alta |
| D2 | **La huella incluye el User-Agent**: cambiando el UA una sola IP obtiene huellas ilimitadas. | 50 User-Agent distintos desde una IP → **50 reportes** en la misma colonia. | Alta |
| D3 | **Con 3 reportes se pinta una colonia** y el promedio no es robusto. | Los 50 reportes anteriores → score 4.0 en esa colonia. | Alta |
| D4 | **Primer valor de `X-Forwarded-For`**: lo escribe el cliente cuando el proxy agrega (en lugar de reemplazar). Vercel sobrescribe la cabecera y no reenvía IPs externas (documentación de Vercel, §14); otros proxies **SIN VERIFICAR**. | Lectura de código + doc de Vercel. | Media (depende del despliegue) |
| D5 | **Cualquier sitio puede enviar reportes desde el navegador de sus visitantes**: la ruta hace `request.json()` sin revisar `Content-Type` ni `Origin`; un `fetch` con `text/plain` es una petición "simple" que no dispara preflight CORS. Cada visitante aporta una IP real distinta. | Lectura de código; semántica de `Request.json()` y CORS. **No lo ejecuté contra el servidor.** | Alta |
| D6 | `HASH_SALT` cae a `"dev-salt"` si falta, y la huella es `sha256(sal\|día\|ip\|ua)` con sal **fija**: si se filtra la base y la sal (o se usó la de desarrollo), las IPv4 se recuperan por fuerza bruta (2^32 posibilidades). | `fingerprint.ts` | Alta (privacidad) |
| D7 | El "día" es UTC (`toISOString`, `current_date`): la huella rota a las **18:00 hora de Guadalajara**, no a medianoche. Permite dos "días" en una misma tarde-noche. | `route.ts`, `001_init.sql` | Baja |
| D8 | Reenviar actualiza `creado_en = now()` (renueva el peso) y puede **reactivar** un reporte que un moderador ocultó. | `route.ts` (UPSERT) | Media |
| D9 | `comentario` se guarda tal cual (teléfonos, nombres, enlaces). Hoy no se publica; en cuanto se publique o se modere hay riesgo de doxxing/difamación/spam. | `route.ts` | Media |
| D10 | No hay forma de ocultar, restaurar ni auditar reportes; el README lista "moderación y detección de brigadeo" como pendiente. | `README.md` | Alta |
| D11 | `scores` no distingue colonias de demostración de reales (la tarea pide no mezclarlos). Fuera de mi alcance; lo anoto en §13. | `scores/route.ts` | Media |

---

## 2. Qué enseñan otros proyectos (todas las URL fueron leídas en esta sesión; ver §14)

| Proyecto / fuente | Qué hace o demuestra | Qué tomamos |
|---|---|---|
| **Waze** | Una vocera dice que los reportes falsos coordinados "serán negados por las siguientes 50 personas que pasen por la calle usando Waze pasivamente" (CBS). Personal de Waze aclara que "no está ahí" **no** baja un reporte automáticamente: se necesita cierto número de usuarios de cierto rango, y **se niega a publicar el algoritmo** "para que los abusadores no lo entiendan". | Confirmación de varios para quitar/poner, y que el sistema se **autocorrige con tráfico real**. **Divergimos** en transparencia: aquí la confianza pública exige publicar el método (§10); lo secreto son las claves, no las reglas. Ojo: en Waze hay flujo pasivo; aquí **no hay señal pasiva**, por eso necesitamos más defensas. |
| **FixMyStreet (mySociety)** | Personal designado puede, desde el propio frontal: ocultar un reporte, ocultar el nombre, ocultar fotos, editar título y cuerpo. Motivos: datos personales (teléfonos, nombres), fotos inapropiadas, groserías, contenido difamatorio, material políticamente sensible cerca de elecciones. El reporte se marca automáticamente como "moderado" y se avisa a la persona. | Catálogo de motivos de moderación (§8), marca pública de "moderado" y no publicar comentarios libres en v1. |
| **Sensor.Community / marco FILTER (Comisión Europea, nov. 2025)** | Control de calidad de sensores ciudadanos en 5 pasos: validez de rango, valor constante (8 h), detección de atípicos, correlación espacial con sensores vecinos (30 km, 30 días) y similitud con estaciones de referencia. Procesó 13.2 mil millones de observaciones. | Mismo esqueleto para reportes: ritmo/valores constantes (§7), **discordancia espacial** con colonias vecinas (§7.4) y **comparación con datos oficiales** como referencia, nunca mezclada con el puntaje ciudadano. |
| **Radanovic y Faltings (EPFL, AAMAS 2016)** | Sistema de reputación para sensores comunitarios con **cota garantizada** al daño que pueden causar sensores maliciosos; motivo: "un dueño de fábrica podría instalar sensores que reporten mal". | Acotar influencia en vez de confiar: nuestro tope por red (`k_dia`, `k_sem`). No hacemos reputación por persona (exigiría identidad persistente → privacidad). |
| **Fang et al., arXiv 2102.09171** | Ataques de envenenamiento a sistemas de crowdsourcing: clientes maliciosos mandan datos "cuidadosamente diseñados" para maximizar el error del agregado; proponen defensas. | No confiar en la media simple; asumir adversario que optimiza (por eso probamos el escenario "sofisticado" y lo declaramos límite). |
| **Liu, Mukherjee et al., arXiv 1611.06625** | En reseñas falsas, las tasas de publicación son bimodales y los grupos de spam actúan en **ráfagas** coordinadas. | Detectar ráfagas por colonia (§7) y exigir diversidad. |
| **Safecast / Fukushima (PSU)** | Medidas ciudadanas de radiación comparadas con relevamientos oficiales muestran variaciones espaciales similares y correlaciones estadísticamente significativas. | Validar la capa ciudadana contra capas oficiales cuando existan, y publicar la comparación (§10). (Cifras de sesgo cuantitativo: **SIN VERIFICAR**.) |
| **Flint (Virginia Tech)** | Repartieron 300 kits y recibieron 271 muestras; los propios vecinos hicieron que cada hogar **sellara y firmara** su kit contra manipulación; un vocero estatal descalificó a un experto de la EPA como "empleado rebelde" y pidió a los residentes "relajarse"; las autoridades tardaron meses en reconocer el problema. | La credibilidad depende de **método verificable** y de **muestras independientes**: capa separada de "muestras verificadas" (laboratorio) que no se mezcla con reportes (§10). |
| **Plausible Analytics** | Identificador diario `hash(sal_diaria + dominio + IP + UA)`; la sal se rota y borra cada 24 h; no se guardan IP ni UA en crudo. | Es el patrón que ya imita el proyecto; lo endurecemos con HMAC y retención (§9). |
| **Estadística** | Media recortada (5-25 % por cola) menos sensible a atípicos; media bayesiana `(C·m + Σx)/(C + n)` con `C` pseudo-observaciones; límite inferior de Wilson para proporciones con pocos datos (E. Miller). | Núcleo del §6. |

---

## 3. Modelo de amenazas

### 3.1 Contexto local (fuentes en §14)

- El número de colonias afectadas **depende de la fuente**: la CEDHJ habla de 600 colonias (Tonalá 251, Tlaquepaque 171, Guadalajara 168, Zapopan 65; nota de Azteca Jalisco publicada el 12/jul/2026 y actualizada hasta el 14/ago/2026) y 130 quejas formales contra SIAPA en 2026; El Financiero (13/jul/2026) cita a autoridades de salud con ~200 colonias de ~2,000. **El mapa no debe presentarse como conteo oficial** y su contador debe poder auditarse.
- Hay **incentivos materiales**: El Financiero reporta que la ciudad repartió más de 9,000 artículos (filtros, pastillas de cloro, tanques) y que había 7,500+ solicitudes contra ~4,000 atendidas. Crónica describe gasto de "miles de pesos" en agua embotellada, pipas, filtros y limpieza de tanques. Hay un mercado que puede beneficiarse de que cierta colonia salga "crítica".
- Hay **interés político visible**: un diputado federal pidió auditar a SIAPA (Crónica, 30/jun/2026). No implica que nadie vaya a manipular el mapa; sí que el mapa será citado por actores con intereses.

### 3.2 Escenarios (todos **hipotéticos**; ningún actor mencionado es acusado)

| ID | Escenario | Quién y por qué | Cómo | Daño | Defensa principal |
|----|-----------|-----------------|------|------|-------------------|
| E1 | **Inflar para recibir apoyo** | Vecinos reales que exageran a "crítica" para entrar a la lista de pipas/filtros (hay escasez comprobada) | Grupos de WhatsApp coordinan: "todos pongan 4" | Mapa pierde valor; alarma injusta | Tope por red; confianza exige días de corroboración; aviso en UI de que **el mapa no asigna apoyos**; ráfaga orgánica se pinta con "baja" |
| E2 | **Inflar o desinflar por política** | Simpatizantes de un partido/candidato/funcionario para culpar o exonerar a un municipio | Mobilización humana real o granja de cuentas | Pérdida de confianza, uso electoral | Discordancia espacial, ráfaga, tope por red; metodología pública; capa oficial separada |
| E3 | **Minimizar ("todo bien")** | Quien quiera restar gravedad (autoridad, contratistas, vecinos que protegen el valor de su vivienda) | Muchos reportes de nivel 1 en colonias específicas | Falsa calma — en salud pública **es el error más caro** | El mapa **nunca usa color "seguro"**; gris = sin datos; robustez simétrica (recorte en ambas colas); ráfagas de nivel bajo se degradan igual |
| E4 | **Proveedores** | Vendedores de agua embotellada, pipas, filtros, limpieza de cisternas | Inflar colonias para generar demanda; o denigrar a competidores en comentarios (con teléfonos/enlaces) | Distorsión comercial | Redacción automática de teléfonos/enlaces; comentarios **no se publican** en v1 |
| E5 | **Bot genérico / script** | Cualquier persona con curl | POST masivo, rotando User-Agent | Colonias falsas, saturación | Token, honeypot, tiempo mínimo, límites por huella/red, cupo atómico |
| E6 | **Drive-by desde otra web** | Un sitio hostil o un banner | `fetch` cross-site desde el navegador de miles de visitantes (IPs reales distintas) | Reportes "limpios" imposibles de distinguir por IP | `Content-Type` estricto, `Origin`/`Sec-Fetch-Site`, token que la otra página no puede leer |
| E7 | **Botnet / proxies residenciales / VPN** | Actor con recursos | Cientos de IPs, UA y tiempos humanos | Indistinguible de vecinos | **No hay defensa perfecta** (Sybil). Costo + corroboración multi-día + discordancia + revisión humana + transparencia |
| E8 | **Ataque lento y persistente** | Una persona con paciencia | 1 reporte por día desde distintas redes | Colonia tranquila se vuelve "moderada" | `red_sem` (tope semanal), `redes_sem ≥ 4/8`, discordancia espacial |
| E9 | **Troll en comentarios** | Bromistas, doxxing, difamación | Nombres de funcionarios o vecinos, insultos, spam | Daño a terceros; responsabilidad legal | Redacción automática; no publicar; moderación con motivos |
| E10 | **Pánico y sesgo de selección** (no es ataque) | Gente asustada tras una nota viral | Reportan personas cuya agua está bien; no reportan quienes no tienen problema | Sobrestima o subestima | Prior bajo, confianza por días, texto "**sin reportes ≠ agua buena**" |
| E11 | **Abuso de moderación** | Un moderador | Ocultar lo incómodo | Pérdida total de confianza | Función única `moderar()`, bitácora inmutable, motivo obligatorio, estadísticas públicas, 2.ª persona en masivos |
| E12 | **Filtración de la base** | Atacante externo / requerimiento | Volcado de reportes | Reidentificación de quien reportó síntomas de salud | HMAC con secreto fuera de la base, retención de 14 días, anonimización |

### 3.3 Capacidad del atacante vs. defensas

| Atacante | Tope por red | Token/honeypot/tiempo | Límites de tasa | Confianza multi-día | Ráfaga | Discordancia | Humano |
|---|---|---|---|---|---|---|---|
| A. Un dispositivo, a mano | Sí | n/a | Sí | Sí | n/a | Sí | Sí |
| B. Script en una IP (UA rotando) | **Sí (decisivo)** | **Sí** | **Sí** | Sí | **Sí** | Sí | Sí |
| C. Script con muchas IPs, comportamiento de bot | Parcial | Parcial | Parcial | Sí | **Sí** | Sí | Sí |
| D. Muchas IPs y comportamiento humano simulado | No | No | No | **Retrasa** (≥ 2 días) | No | Parcial | **Única defensa real** |
| E. Movilización de vecinos reales | No (son reales) | No | No | Sí | Sí (marca "pico") | No | Sí (contexto) |

---

## 4. Principios de diseño

1. **Degradar antes que ocultar.** Lo automático solo baja el peso (×0.25) y la confianza; **ocultar es decisión humana** (o regla inequívoca como datos personales).
2. **Se oculta por *cómo* llegó, nunca por *qué* dice.** "Parece exagerado" no es motivo.
3. **Limitar influencia, no identificar personas.** Topes por red/día/semana en lugar de reputación individual.
4. **Una crisis real produce ráfagas.** La detección exige **baja diversidad**, no solo volumen.
5. **Sin color de "agua segura".** Ausencia de datos se muestra gris; incertidumbre se muestra como incertidumbre.
6. **Todo cambio es auditable** (bitácora) **y reproducible** (método versionado).
7. **Cero dependencias nuevas y cero servicios de pago**: Node `crypto`, Postgres/PostGIS, `zod`, `pg`.

---

## 5. Ingreso de reportes: capas de defensa

Código completo y probado en los Anexos A-C. El esqueleto de `POST /api/reportes` (Anexo B.6) **se ejecutó con `Request` reales contra mi base** (con `after()` simulado, porque fuera de un servidor Next lanza error): `415`, `403`, `400`, `201` falso para honeypot y formulario instantáneo, `429` al exceder cupo, y `en_revision` para clientes sin cabeceras de navegador.

### 5.1 Orden de validaciones (lo barato primero, sin tocar la base hasta lo necesario)

| Paso | Qué | Resultado | Toca BD |
|------|-----|-----------|---------|
| 1 | `Content-Type` = `application/json`; cuerpo ≤ 4 KB | `415` / `413` | No |
| 2 | `Origin`/`Sec-Fetch-Site` | `403` | No |
| 3 | `zod` (ya existe) + campos nuevos `token`, `referencia_interna` | `400` | No |
| 4 | Honeypot lleno → **`201` falso** y +1 en `descartes_dia` | no se guarda | Sí (contador) |
| 5 | Token: ausente/firma/caducado → `400`; **< 2 s → `201` falso** | no se guarda | Sí (contador) |
| 6 | Límites de tasa (huella, red, global) | `429` o `en_revision` | Sí |
| 7 | `guardarReporte` (candado, cupo, UPSERT) | `201/200/429/404` | Sí |
| 8 | `after()`: `aplicar_rafaga(colonia)` y, 1 % de las veces, `aplicar_retencion()` | — | Sí, fuera de la respuesta |

### 5.2 IP real

`ipCliente(headers, hops)` cuenta **desde la derecha**: con `TRUSTED_PROXY_HOPS=1` toma el último valor, que es el que añadió *nuestro* proxy; lo que el cliente escriba a la izquierda no cuenta (probado: `"6.6.6.6, 201.1.2.3"` → `201.1.2.3`). Si no hay IP válida se usa `0.0.0.0`: todos esos reportes comparten una sola "red" y un solo tope (falla cerrada). En Vercel basta `hops=1` porque sobrescribe la cabecera (doc de Vercel); en otro despliegue hay que **verificar con una petición real** que el proxy sobrescribe o agrega, y ajustar `hops`.

### 5.3 Identidades anónimas (nada de IP/UA se guarda)

Con `clave_día = HMAC(HASH_SALT, "dia:" + día_local)`:

| Campo | Contenido | Para qué |
|---|---|---|
| `huella` | `HMAC(clave_día, IP completa (IPv4) o /64 (IPv6) + UA)` | Un reporte por colonia/día (restricción `UNIQUE` existente) y tope por persona/dispositivo |
| `red` | `HMAC(clave_día, /24 (IPv4) o /48 (IPv6))` | Agrupar un mismo origen **ese día**: ráfagas y tope diario |
| `red_sem` | `HMAC(clave_semana, mismo prefijo)` | Tope **semanal** por red (ataque lento) |
| `ua_familia` | `navegador-so` (p. ej. `chrome-android`) | Diversidad de clientes en ráfagas; poca entropía, no identifica |
| `comentario_hash` | HMAC del comentario normalizado | Detectar copiar/pegar |
| `seg_formulario` | Segundos entre abrir el formulario y enviar | Señal de bot; no identifica |

- **IPv6:** `huella` usa el /64 porque las direcciones temporales (privacy extensions) cambian dentro del mismo /64 (probado: dos direcciones del mismo /64 → misma huella). `red` usa /48. La RFC 6177 reconoce que los sitios finales reciben "al menos un /64" y propone p. ej. /56 para hogares; /48 agrupa varios hogares y es deliberadamente conservador para frenar a quien rota /64s. `::ffff:a.b.c.d` se trata como IPv4.
- **`/24` y CGNAT:** IPv4 /24 agrupa hasta 256 direcciones, que pueden ser **vecinos reales** del mismo nodo de un proveedor, y las redes móviles con CGNAT comparten una IP entre muchos usuarios (CGNAT en general: verificado; **su prevalencia en operadores de México: SIN VERIFICAR**). Por eso los topes son *pesos* y no rechazos: `k_dia = 2` y `k_sem = 3` reducen peso pero no bloquean. **Antes de endurecer, medir** (§6.7): registrar en modo sombra qué fracción de reportes reales cae en redes con k ≥ 3.
- **Día local:** `diaLocal()` usa `America/Mexico_City` para que las huellas roten a medianoche local (D7).

### 5.4 Origen y Sec-Fetch-Site (qué frena y qué no)

`origenPermitido()`: si `Sec-Fetch-Site` existe y no es `same-origin` → rechazo; si hay `Origin` debe estar en `ORIGENES_PERMITIDOS`; si no hay ninguna de las dos → canal `sin_cabeceras` (no es un navegador moderno: entra con peso reducido). MDN: `Sec-Fetch-Site` es una cabecera prohibida que los navegadores añaden y **el JavaScript de una página no puede alterar**, soportada ampliamente desde marzo de 2023; web.dev recomienda aceptar solicitudes sin esas cabeceras (navegadores viejos) y rechazar con `403` las `cross-site`. OWASP: tratar la ausencia de cabeceras y `Origin: null` como **no evidencia** de mismo origen.

**Limitación que hay que tener presente:** esto frena **otros sitios web** que usan el navegador del visitante (E6). **No frena a un script** (curl escribe cualquier cabecera). No lo vendemos como anti-bot; es anti-CSRF/drive-by. El token (§5.5) cubre además el drive-by porque la otra página no puede leerlo (no hay CORS).

### 5.5 Token de formulario y tiempo mínimo

`GET /api/reportes/token` devuelve `iat.nonce.firma` (HMAC, sin estado, sin tabla). El cliente lo pide al abrir el formulario y lo envía; el servidor verifica firma y edad: `< 2 s` descarte silencioso, `2-5 s` entra con peso ×0.5 (`seg_formulario < 5`), `> 6 h` caducado. Un humano necesita más de 2 s para elegir gravedad. **Los umbrales 2 s y 5 s son supuestos** (SIN VERIFICAR con tiempos reales); `seg_formulario` se guarda para recalibrarlos con datos. El endpoint de token tiene su propio límite (60/h por red) y rechaza `cross-site`.

### 5.6 Honeypot

Campo `referencia_interna` (nombre poco "autocompletable") fuera de pantalla, `tabindex=-1`, `aria-hidden`, `autocomplete="off"`. Si llega con contenido: `201` falso + contador. No se le da pista al bot. Falsos positivos posibles por extensiones que autorrellenan; por eso solo se cuenta y no se banea.

### 5.7 Límites de tasa en Postgres

Ventana fija atómica (`contar()`): una fila `(clave, ventana)`; `INSERT ... ON CONFLICT DO UPDATE SET n = n + 1 WHERE n <= tope`. Probado: **60 peticiones paralelas con tope 10 → exactamente 10 pasan**; al pasarse deja de escribir (`n` se queda en `tope+1`), así un atacante no amplifica escrituras. Garantía documentada de Postgres: `ON CONFLICT DO UPDATE` ofrece resultado atómico INSERT/UPDATE aun con alta concurrencia. Alternativa **cubeta de fichas** (`ficha()`): 20 peticiones paralelas con capacidad 5 → 5 pasan; tras 2.1 s con recarga de 1/s, pasan 2. Limpieza: `aplicar_retencion()` borra ventanas de más de 2 días.

| Clave | Ventana | Blando | Duro | Efecto |
|---|---|---|---|---|
| `rep:h:<huella>` | 1 h | — | 8 | `429` (incluye reenvíos) |
| `rep:r:<red>` | 1 h | 20 | 120 | > 20: el reporte entra `en_revision`; > 120: `429` |
| `rep:g` (global) | 1 h | 1 500 | — | > 1 500: **nunca rechaza**, todo entra `en_revision` (interruptor; evita que un ataque deje fuera a vecinos reales) |
| `tok:r:<red>` | 1 h | — | 60 | `429` en el endpoint de token |
| cupo colonias/día | día | — | 3 colonias por huella | `429` (bajo candado, §5.8) |

Los números son **valores iniciales razonados, no medidos**: 8/h por huella permite corregir un reporte varias veces; 20/h y 120/h por red dan holgura a un edificio o a un CGNAT pequeño sin permitir inundar; 1 500/h global es varias veces el flujo esperado de una crisis grande (supuesto, recalibrar con tráfico real).

### 5.8 Carrera del cupo y UPSERT seguro

`guardarReporte()` toma `pg_advisory_xact_lock(hashtextextended('rep:'||huella, 0))`, revisa el cupo y escribe en la misma transacción. Probado: 9 colonias en paralelo con la misma huella → **3 creadas, 6 rechazadas** (antes: 8). El `DO UPDATE` solo actúa si el reporte **no está oculto** y tiene más de 30 s: reenviar no revive un reporte ocultado ni permite martillar el UPSERT; devuelve `sin_cambios`.

### 5.9 Alternativas evaluadas y descartadas para v1

| Alternativa | Motivo |
|---|---|
| Login, SMS, WhatsApp, correo | Contradice "sin datos personales" y deja fuera a muchas personas en plena crisis |
| CAPTCHA de terceros (reCAPTCHA, hCaptcha, Turnstile) | Dependencia externa y flujo de datos a terceros; **sus términos no los evalué (SIN VERIFICAR)** |
| Huella del dispositivo (canvas, fuentes...) | Reidentificación persistente; choca con el principio de privacidad |
| Geolocalización por IP / GPS del navegador | Falsificable (VPN, spoofing) y sensible; el GPS exige permiso y revela ubicación |
| Reputación por persona | Exige identidad persistente |
| Prueba de trabajo (estilo ALTCHA, código abierto y autoalojable según su documentación) | Un script en Node calcula SHA-256 a millones por segundo: casi no frena a un bot y sí cansa a celulares viejos. Solo como **modo bajo ataque** (§5.10). Rendimiento **SIN VERIFICAR** |

### 5.10 Modo bajo ataque (interruptor manual)

Variable `MODO_ATAQUE=1` (a implementar): todo reporte entra `en_revision`; `RED_BLANDO_HORA` baja a 5; se exige `seg_formulario ≥ 5`; el mapa muestra aviso "estamos recibiendo envíos sospechosos; la confianza de algunos datos es menor". Se activa y desactiva con registro en la bitácora (`accion='nota'`).

---

## 6. Agregación robusta (método `v1`)

### 6.1 Receta

Para una colonia, con los reportes `visible` o `en_revision` de los últimos 14 días:

1. **Peso base de cada reporte** `x_i = min(1, k_dia / n_dia, k_sem / n_sem) · f_estado · f_rápido`
   - `n_dia` = reportes de la **misma red el mismo día en esa colonia**; `n_sem` = de la misma `red_sem` en esa colonia.
   - `k_dia = 2` (un hogar con dos teléfonos), `k_sem = 3`.
   - `f_estado = 0.25` si el reporte está `en_revision` **o** si `n_dia ≥ 6` (red concentrada); si no, 1.
   - `f_rápido = 0.5` si `seg_formulario < 5`.
   - Los ocultos no entran.
2. **Decaimiento**: `w_i = x_i · 2^(−edad_días / 7)` (vida media de 7 días, como hoy).
3. **Media recortada por masa de peso**: con `W = Σ w_i`, se descarta el 20 % de `W` en cada extremo de la escala ordinal 1-4 (se recorta *peso*, no cuenta de filas, así los pesos fraccionarios no sesgan) y se promedia lo que queda → `x̄_rec`.
4. **Contracción bayesiana hacia un prior**: `n_eff = Σ x_i` (evidencia sin decaimiento), `λ = n_eff / (n_eff + C)`, `score = λ · x̄_rec + (1 − λ) · m0`, con `C = 2` y `m0` = media recortada global (ponderada por `n_eff`) de las colonias con `n_eff ≥ 6`, **acotada a [1.5, 2.5]** (un atacante no puede mover el prior fuera de ese rango); si no hay datos, `2.0`. Es la fórmula de la media bayesiana `(C·m + Σx)/(C + n)` expresada como mezcla.
5. **Confianza** (§6.3). `n_eff < 3` → `sin_datos` (gris). El color sigue siendo `round(score)` como hoy.

### 6.2 Parámetros y justificación

| Parámetro | Valor | Por qué | ¿Medido? |
|---|---|---|---|
| Ventana / vida media | 14 d / 7 d | Se conservan los del proyecto (README) | Heredado |
| Recorte `α` | 0.20 por cola | La media recortada típica descarta 5-25 % por cola (Wikipedia); 20 % tolera hasta ~1 de cada 5 reportes falsos extremos sin mover la estimación y conserva eficiencia con n pequeño. La escala tiene solo 4 niveles: más recorte la vuelve casi mediana | Simulación |
| `C` | 2 | Con `n_eff = 3` (mínimo) el prior pesa 40 %; con 12, 14 %. La regla de momentos `C ≈ σ²/τ²` (varianza dentro de colonia / entre colonias) con σ ≈ 0.9 y τ ≈ 0.6-1.0 da `C` entre 1 y 2.3 | **σ y τ son supuestos**; recalibrar (§6.7) |
| `m0` ∈ [1.5, 2.5] | 2.0 por defecto | Quien reporta es una muestra autoseleccionada con problema; centrar en 2.5 (punto medio) inflaba colonias tranquilas (en simulación 4 reportes "leves" salían con color 2) | Simulación |
| `k_dia = 2` | | Hogar con 2 dispositivos; más allá, mismo origen | Supuesto |
| `k_sem = 3` | | Frena el ataque lento de una misma red (CA-11: con 4 el score subía 1.4; con 3, 1.1) | Simulación |
| Red concentrada `n_dia ≥ 6` | ×0.25 | 6 reportes del mismo /24 en una colonia en un día ya no son un hogar | Supuesto |
| `f_estado` (revisión) | 0.25 | Sigue contando algo (si fuera 0 sería ocultar sin revisión) pero un ataque de 20 falsos pesa como 5 | Supuesto; CA-12 muestra que **aun así** mueve el score hasta que un humano confirma |
| `f_rápido` | 0.5 si < 5 s | Elegir gravedad y enviar toma más de 5 s a un humano | **Supuesto** |
| Umbral `sin_datos` | `n_eff < 3` | Conserva `MIN_REPORTES = 3` del proyecto, pero contando **evidencia independiente**, no filas | Heredado |

### 6.3 Niveles de confianza

| Nivel | Condición (todas) | Justificación | UI sugerida |
|---|---|---|---|
| `sin_datos` | `n_eff < 3` | Con 2 reportes cualquier valor es posible | Gris: "sin datos suficientes" (**no** "agua segura") |
| `baja` | `3 ≤ n_eff < 6`, **o** menos de 2 días con ≥ 1.5 de evidencia, **o** alerta de ráfaga abierta | Un solo día (p. ej. un pico) o poca evidencia: puede ser real, pero no se ha corroborado | Color con **trama rayada** y texto "pocos reportes o muy recientes"; **no cuenta** en el contador de "colonias afectadas" |
| `media` | `n_eff ≥ 6` y ≥ 2 días corroborados, pero no cumple `alta` (p. ej. `n_eff < 12`, `< 3` días, `redes_sem < 8`, más del 60 % de la evidencia en un día, o media recortada y mediana difieren > 0.75) | Evidencia suficiente en ≥ 2 días | Color sólido |
| `alta` | `n_eff ≥ 12`, ≥ 3 días corroborados, `redes_sem ≥ 8`, ningún día aporta > 60 %, `|recortada − mediana| ≤ 0.75`, sin alerta | Ver abajo | Color sólido + marca |

*Por qué estos números.* Ancho aproximado del intervalo de confianza al 95 % de la media con σ = 0.9 (supuesto): n = 3 → ±1.02; n = 6 → ±0.72; n = 12 → ±0.51; n = 25 → ±0.35. El color se redondea a unidades enteras: con ±0.5 el color es *estable* → `alta` desde 12. Con ±1 (n = 3) el color puede variar un nivel entero → `baja`. Exigir ≥ 2-3 días corroborados convierte "ráfaga de una tarde" en `baja` y obliga a un atacante a **sostener** el esfuerzo (CA-09 vs CA-10). Una "evidencia corroborada" por día es `≥ 1.5` de peso `x`.

*Criterio opcional para alertas fuertes (no implementado):* publicar "alerta" solo si el **límite inferior de Wilson** (95 %) de la proporción de reportes graves (≥ 3) supera 0.5 con `n_eff ≥ 12`. Valores calculados: 9 de 12 → 0.468 (no alerta); 11 de 12 → 0.646 (alerta); 3 de 3 → 0.438 (no alerta). Fuente de la idea: E. Miller (§14).

### 6.4 Resultados de simulación (determinista; ejecutado)

Escenarios de `agregacion.test.ts` (16 pruebas, todas pasan). `n_eff`, días corroborados y confianza vienen del oráculo TypeScript, idéntico al SQL.

| Caso | Escenario | Score | `n_eff` | Confianza | Lectura |
|---|---|---|---|---|---|
| CA-01 | 12 vecinos "grave" en 4 días | 2.86 | 12.0 | alta | Color 3 |
| CA-02 | 12 vecinos "crítica" | 3.65 | 12.0 | alta | Color 4 |
| CA-03 | 4 vecinos "leve" | 1.38 | 4.0 | baja | Color 1, con trama |
| CA-04 | Solo 2 reportes críticos | — | 2.0 | sin_datos | Gris |
| CA-05 | CA-03 + **30 falsos de una red /24** | 1.42 | 4.3 | baja | **No se mueve** |
| CA-06 | CA-01 + **40 falsos nivel 1 de una red** | 2.85 | 12.5 | alta | **No se mueve** |
| CA-07 | CA-03 + 30 falsos de 30 redes, ráfaga detectada | 3.28 | 11.5 | baja | Pintado con trama hasta moderación |
| CA-07b | ... y un moderador los oculta | color 1 | — | — | Vuelve al valor honesto |
| CA-08 | Igual a CA-07 **sin detectar** (atacante sofisticado) | 3.89 | 34.0 | media | **LÍMITE CONOCIDO**: 1 día → nunca `alta` |
| CA-09 | Colonia vacía + 30 falsos, 30 redes, **1 día** | 3.88 | 30.0 | baja | Aparece con trama |
| CA-10 | Colonia vacía + 30 falsos, 30 redes, **3 días** | 3.88 | 30.0 | alta | **LÍMITE CONOCIDO** (indistinguible de vecinos reales) |
| CA-11 | CA-03 + 1 falso/día × 14 días | 2.50 | 10.0 | media | Sube 1.1, nunca `alta` |
| CA-12 | CA-02 + 20 falsos nivel 1 detectados | 2.95 | 17.0 | baja | Baja hasta que un humano confirma; luego 3.65 |
| CA-13 | Reportes de hace 15 días | — | 0 | sin_datos | Fuera de ventana |
| CA-14 | 25 vecinos reales en 5 h (pico orgánico) | 3.17 | 25.0 | baja | Se pinta; trama hasta el 2.º día |
| CA-15 | CA-14 + 15 vecinos más al día siguiente | 2.98 | 40.0 | media | Se corrobora |

### 6.5 Estimador: por qué media recortada y no mediana

Probé también la mediana interpolada del agrupado de 4 niveles (con masa del prior), en una simulación previa con parámetros preliminares (por eso no la presento como tabla). Resultado mixto: la mediana exigió más falsos para el *primer* cambio de color (6 contra 4) y la media recortada para el cambio *grande* (18 contra 12); no hubo diferencia decisiva. Se eligió la **media recortada** (pedida en el diseño, continua, simple en SQL) y se usa la **mediana como verificación cruzada**: si difiere más de 0.75 de la recortada, la confianza máxima baja a `media` (distribución bimodal: desacuerdo real o ataque).

### 6.6 Rendimiento (medido en Docker local, sin afinar)

300 000 reportes en 14 días repartidos en 2 000 colonias: `scores_robustos` completa tarda ~4.4 s; refrescar `scores_vigentes` (vista materializada) ~3.9 s; `discordancia_espacial` 0.26 s; `evaluar_rafaga` por colonia ~10 ms. Con el volumen realista de una crisis (decenas de miles) debe ser una fracción de eso. El endpoint lee la vista materializada; `refrescar_scores()` refresca como máximo cada 60 s con candado asesor para que no se refresque en paralelo.

### 6.7 Calibración con datos reales (por hacer)

- Estimar σ (dentro de colonia) y τ (entre colonias) con las primeras semanas de datos y fijar `C ≈ σ²/τ²`.
- En **modo sombra** durante la primera semana: calcular v1 y la media simple en paralelo, y registrar cuántos reportes reales caen en redes con `n_dia ≥ 2` o `n_sem ≥ 3` (para saber si CGNAT castiga demasiado).
- Revisar la distribución de `seg_formulario` antes de fijar 2 s y 5 s.
- Comparar contra datos oficiales o de laboratorio cuando existan (como en Safecast): publicar la correlación y el sesgo.

---

## 7. Detección de ráfagas

### 7.1 Señales (todas se pueden calcular sin identificar a nadie)

`evaluar_rafaga(colonia)` mira la **última hora**:

- **Pico**: `n ≥ max(8, ceil(λ + 4√λ))`, con `λ` = reportes/hora típicos de esa colonia en los 7 días previos. Bajo un modelo de Poisson, la probabilidad de superar ese umbral en una hora normal es: λ=1 → 1e-5; λ=2 → 1.1e-3; λ=5 (umbral 14) → 7e-4; λ=10 (umbral 23) → 3e-4. Los datos reales suelen tener más varianza que Poisson, por eso un pico **por sí solo no hace nada** más que etiquetar.
- **Sospechosa** = pico **y al menos 2** de estas señales de baja diversidad:

| Señal | Regla | Qué captura |
|---|---|---|
| `pocas_redes` | `redes distintas / huellas distintas < 0.5` | Un mismo origen con UA rotando |
| `ua_homogeneo` | `n ≥ 10` y ≥ 90 % de la misma `ua_familia` | Script con un solo cliente |
| `ritmo_regular` | `n ≥ 6` y coeficiente de variación de intervalos `< 0.35` | Envíos programados (orgánico ≈ 1, fijo ≈ 0) |
| `formulario_rapido` | mediana de `seg_formulario < 6` | Sin lectura humana |
| `comentario_repetido` | ≥ 3 comentarios con el mismo hash | Copiar/pegar |

Exigir **2 de 5** reduce falsos positivos: una familia que reporta 9 veces desde la misma casa dispara solo `pocas_redes`.

- **Barrido de colonias** (señal adicional, consulta sin función): una misma `red` y día con ≥ 6 colonias distintas y ≥ 20 reportes. Ejecutada sobre datos sintéticos: sin falsos positivos, sintaxis verificada. Recordar que una red móvil CGNAT puede abarcar muchas colonias legítimamente: por eso se usa como **señal para la cola**, no como regla automática.

### 7.2 Acción

`aplicar_rafaga(colonia)` (llamada con `after()` tras cada INSERT): si hay ráfaga sospechosa abre **una** alerta (índice único parcial evita duplicados) y **degrada** (`en_revision`, ×0.25) los reportes `visible` de la última hora de esa colonia; la confianza de la colonia baja a `baja` mientras la alerta esté abierta. No oculta nada.

### 7.3 Qué se probó (ejecutado, `BR-01..BR-06`)

| Escenario (30 reportes en la última hora, salvo el orgánico) | Resultado |
|---|---|
| Pico orgánico: 20 redes, UAs variadas, intervalos al azar, formularios de 15-60 s | `pico = true`, `sospechosa = false` — **no se castiga una crisis real** |
| Una red, UA rotando, ritmo fijo, formularios de 1-2 s | Sospechosa: `pocas_redes`, `ritmo_regular`, `formulario_rapido` |
| 30 redes, mismo UA, ritmo fijo, formulario de 2 s, mismo comentario | Sospechosa: `ua_homogeneo`, `ritmo_regular`, `formulario_rapido`, `comentario_repetido` |
| 30 redes, UAs variadas, tiempos y formularios humanos | **NO detectada** (LÍMITE CONOCIDO) |
| Normal (3 reportes/h) | Sin pico |
| Una familia (9 reportes, misma red, UAs variadas, horarios irregulares) | Pico leve; solo `pocas_redes` → no sospechosa. (Con horarios perfectamente regulares dispararía también `ritmo_regular` y sí se marcaría) |

### 7.4 Discordancia espacial (cola humana)

Vista `discordancia_espacial`: colonias cuyo score difiere ≥ 1.5 de la media (ponderada por `n_eff`) de sus vecinas **colindantes** (`ST_Touches`) con confianza `media`/`alta`, con ≥ 3 vecinas. Probado en una rejilla 3×3: la colonia central "crítica" rodeada de 8 "leves" se marca (diferencia 2.57). **Una contaminación realmente localizada también se marcará**: la vista no cambia nada, solo manda el caso a una persona, que compara diversidad de redes y, si existen, datos oficiales o muestras verificadas. Es el equivalente de la "correlación espacial" de FILTER.

### 7.5 "Huellas nuevas"

La pregunta original pedía mirar "huellas nuevas". Con huellas **diarias** no existe memoria entre días (es la propiedad de privacidad que queremos). Lo sustituimos por: diversidad de redes y de UA dentro de la hora, regularidad del ritmo y tiempo de formulario. Si algún día se quisiera detectar dispositivos recurrentes, requeriría una huella de más de un día: **no se recomienda** (§9); `red_sem` es el único vínculo semanal y solo a nivel /24 o /48.

---

## 8. Moderación

### 8.1 Cola

Vista `cola_moderacion` (Anexo A): alertas abiertas de ráfaga (con cuántos reportes están en revisión) + colonias con discordancia espacial. Orden: **primero las vencidas (> 48 h)**, luego las más antiguas. Meta: revisar cada alerta en ≤ 24 h. Para v1 **no se construye interfaz web de moderación** (evitar superficie de autenticación): se opera con `psql`/un script CLI con rol de base de datos dedicado (`moderador`; endurecimiento propuesto, no probado: `moderar()` como `SECURITY DEFINER` y sin `UPDATE` directo sobre `reportes`).

### 8.2 Una sola vía para cambiar estados: `moderar(ids, accion, actor, motivo, regla)`

Probado (`MO-01..MO-06`):

- Acciones: `degradar` (→ `en_revision`), `ocultar` (→ `oculto`), `restaurar` (→ `visible`).
- Cambio + registro en bitácora en **una transacción**; guarda el estado anterior de cada reporte (`metricas.estado_antes`).
- `motivo` obligatorio (≥ 10 caracteres); si falla el registro no queda ningún cambio a medias.
- **El sistema solo puede degradar**; `ocultar`/`restaurar` automáticos solo con las reglas `comentario_con_datos_personales` y `expiracion_alerta`. Cualquier otra regla con `actor='sistema'` lanza excepción.
- Ocultar **más de 20** reportes exige actor `mod:<alias>` (humano). Política adicional (no automatizada): una segunda persona revisa los ocultamientos masivos en ≤ 24 h.
- Repetir una acción sin filas por cambiar devuelve 0 y no ensucia la bitácora.
- La bitácora (`moderacion_bitacora`) tiene triggers que impiden `UPDATE`, `DELETE` y `TRUNCATE`.

### 8.3 Reglas para ocultar

Se oculta **solo** con evidencia de *cómo* llegó el reporte, con el motivo escrito:

| Código | Motivo | Evidencia mínima |
|---|---|---|
| R1 `rafaga_confirmada` | Ráfaga de origen único o automatizado | ≥ 2 señales de §7.1 + revisión de un humano |
| R2 `datos_personales` | Comentario con teléfono, nombre, dirección | Redacción automática; si pasó, un humano |
| R3 `duplicado_o_prueba` | Reporte de prueba, duplicado evidente | Mismo hash/comentario y ritmo |
| R4 `spam_comercial` | Ofrece servicios | Texto |

**Nunca** se oculta por: "parece exagerado", "no me gusta el resultado", "viene de tal municipio" o presión de una autoridad, partido o proveedor. Esto va escrito en la metodología pública.

### 8.4 Restauración

1. **Manual**: cualquier moderador puede restaurar con motivo; se registra el estado anterior.
2. **Revisión semanal**: lista de todo lo `oculto` de los últimos 7 días; una segunda persona confirma o restaura.
3. **Por corroboración**: `expirar_alertas()` cierra una alerta con más de 48 h **solo si** hubo ≥ 6 redes semanales distintas con reportes `visible` posteriores; entonces restaura lo degradado con regla `expiracion_alerta`. Sin corroboración la alerta **queda abierta y vencida** (probado: la colonia 1 se restaura, la 2 no). Nunca se restaura "por cansancio".
4. **Apelación**: canal público para señalar "mi reporte no se contó" (SIN canal definido; decisión del equipo; no inventé ninguno).

### 8.5 Comentarios

En v1 el comentario **no se publica** en ninguna parte (hoy tampoco). Se redactan teléfonos, correos y enlaces antes de guardar y se borra el texto a los 30 días. Si algún día se publica, pasa antes por moderación (motivos de FixMyStreet: datos personales, difamación, groserías, material sensible).

---

## 9. Privacidad

| Dato | Se guarda | Cuánto | Cómo se protege |
|---|---|---|---|
| IP, User-Agent completo | **Nunca** | — | Solo existen en memoria durante la petición. (Los registros del *hosting* son otro asunto; revisar su retención) |
| `huella`, `red`, `red_sem`, `ua_familia`, `comentario_hash`, `seg_formulario` | Sí | **14 días** (la ventana de cálculo) y luego `NULL` | HMAC con clave del día / semana derivada de `HASH_SALT` (variable de entorno **fuera de la base**, ≥ 32 caracteres, obligatoria en producción) |
| Gravedad, síntomas, colonia, día | Sí | Indefinido (anónimos tras el día 14) | Ya sin identificador |
| `comentario` | Sí (redactado) | 30 días | Redacción y borrado |
| `limites_tasa`, `cubetas_tasa` | Sí | 2 días | Limpieza en `aplicar_retencion()` |
| `descartes_dia` | Sí | Indefinido | Solo contadores por motivo |
| Alertas | Sí | Indefinido | `metricas` solo con razones y conteos, sin identificadores |
| Bitácora | Sí | Indefinido | `reporte_ids` sin datos del reportante (tras el día 14 esos reportes ya no tienen huella) |

**Por qué HMAC y no `sha256(sal fija ...)`.** El espacio IPv4 es de 2^32 direcciones: con la base y la sal filtradas, recuperar las IP es trivial. Con HMAC cuya clave **no está en la base**, una filtración solo de la base no permite reconstruirlas. Contra una filtración que incluya la clave, la retención de 14 días limita el daño a ese lapso. Más fuerte aún (forward secrecy a lo Plausible, sal aleatoria que se borra cada 24 h) obligaría a guardar la sal en algún sitio compartido entre instancias; no la recomiendo para v1 por complejidad, pero es el siguiente paso si el riesgo lo justifica. `HASH_SALT` debe rotarse al menos cada trimestre.

**Salud y ley.** `sintomas` es información de salud. La nueva Ley Federal de Protección de Datos Personales en Posesión de los Particulares fue publicada en el DOF el 20 de marzo de 2025 y entró en vigor el 21 de marzo de 2025; la autoridad pasó a ser la Secretaría Anticorrupción y Buen Gobierno; exige aviso de privacidad (versión simplificada con enlace si la captura es electrónica); los datos de salud son sensibles (fuente: Garrigues, §14). **SIN VERIFICAR**: si un HMAC diario de IP+UA constituye dato personal bajo esa ley, ni si la ley aplica a este proyecto según quién lo opere (particular, asociación, entidad pública). Recomiendo **consultar a un abogado** y publicar un aviso de privacidad corto (qué se guarda, 14 días, cómo se anonimiza).

**Anonimización**: `aplicar_retencion()` (probada) pone `NULL` en identificadores a los 14 días y borra comentarios a los 30; los reportes conservan gravedad y colonia. `UNIQUE (colonia_id, huella, dia)` admite `NULL`.

---

## 10. Qué publicar de la metodología

Principio: **publicar las reglas y los números; mantener secretas solo las claves** (la seguridad no debe depender de ocultar el algoritmo). Contraste: Waze declara no publicar el suyo; aquí la confianza es el activo.

**Página `/metodologia` y `/api/metodologia`** (a implementar, pendiente §13):

1. Qué mide el mapa: "gravedad que *reportan vecinos*", **no** análisis de laboratorio ni conteo oficial. "Sin reportes no significa que el agua sea buena."
2. Receta de §6.1 con todos los parámetros de §6.2 en JSON versionado (`metodo: "v1"`) y registro de cambios; cada cambio de parámetros sube la versión y queda fechado.
3. Niveles de confianza (§6.3) y cómo se ven en el mapa.
4. Qué evita que un grupo domine (tope por red y por semana, corroboración multi-día) **y qué no puede evitar** (§12).
5. Qué se guarda y por cuánto tiempo (§9).
6. Moderación: motivos permitidos (§8.3), frase "no se oculta por lo que dice sino por cómo llegó", cuántos reportes se degradaron/ocultaron/restauraron por semana y por motivo (**sin contenido ni identificadores**), y que la bitácora es de solo agregado.
7. Datos abiertos: CSV diario por colonia (`id, score, confianza, n_eff, días, redes_sem, metodo, fecha`) bajo licencia abierta para que otras personas reproduzcan el cálculo.
8. **Vectores de prueba**: los casos de §11 publicados como tabla (entradas y salidas esperadas) y el código del oráculo, para que cualquiera verifique que el sistema cumple lo que dice.
9. Capas oficiales/académicas/de laboratorio **separadas** del puntaje ciudadano; si existe una comparación (correlación, sesgo), publicarla, incluido cuando salga desfavorable.
10. Una tarjeta "¿por qué esta colonia está en gris/rayada?" en cada colonia (ej.: "faltan reportes de al menos 2 días distintos").
11. Invitación a auditoría externa y canal para impugnar (a definir).

Lo que **no** conviene publicar al detalle (juicio, no certeza): umbrales exactos del honeypot y del tiempo mínimo, para no regalar atajos a bots baratos. Sí publicar que existen.

---

## 11. Casos de prueba

Archivos listos en los anexos: `agregacion.test.ts` (16), `antiabuso.test.ts` (13) y `antiabuso.db.test.ts` (21, necesita `TEST_DATABASE_URL`). **Resultado de la corrida en mi entorno: 50 de 50 pasan, dos corridas seguidas, `tsc --strict` y `eslint` con la configuración del proyecto sin errores.** "Ejecutado" = lo cubre una de esas pruebas o un script de verificación; "Por implementar" = depende de integrar la ruta en el proyecto.

### 11.1 Agregación (ejecutado; ver §6.4 para valores)

CA-01 a CA-15 (incluye CA-07b). Aserciones: color esperado, confianza esperada y cotas de `n_eff`/score. Las dos marcadas **LÍMITE CONOCIDO** (CA-08, CA-10) *documentan* lo que el sistema no puede impedir; si algún día dejan de cumplirse porque se agregó una defensa nueva, hay que actualizar la prueba y la sección de límites.

### 11.2 Límites de tasa, ingesta y carreras (ejecutado)

| ID | Escenario | Esperado |
|----|-----------|----------|
| RL-01 | 60 peticiones paralelas, tope 10 | Exactamente 10 pasan; `n` en tabla = 11 |
| RL-02 | Cubeta capacidad 5, 20 paralelas | 5 pasan |
| IN-01 | 9 colonias en paralelo, misma huella | 3 creadas, 6 `limite_colonias` |
| IN-02 | Reenvío a los pocos segundos | `sin_cambios`; la gravedad no cambia |
| IN-03 | Reenvío sobre un reporte `oculto` | Sigue `oculto` y con la gravedad original |
| IN-04 | Colonia inexistente | `colonia_inexistente` |

### 11.3 Ráfagas (ejecutado)

BR-01 a BR-06 (§7.3; BR-06 cubre tráfico normal y una familia con horarios irregulares). BR-04 es LÍMITE CONOCIDO. BR-05 verifica: `aplicar_rafaga` degrada 30 reportes, no oculta ninguno, abre **una** alerta aunque se llame dos veces y escribe una fila en bitácora.

### 11.4 Moderación y retención (ejecutado)

| ID | Escenario | Esperado |
|----|-----------|----------|
| MO-01 | `sistema` intenta `ocultar` con regla de ráfaga; `mod:ana` oculta 5 | Excepción; 5 ocultados |
| MO-02 | Ocultar 25 reportes con actor sistema | Excepción (humano) |
| MO-03 | Motivo "x" | Excepción y 0 cambios |
| MO-04 | Restaurar 5 y repetir | 5, luego 0; bitácora guarda estado anterior (`visible`, `oculto`) |
| MO-05 | `UPDATE`/`DELETE`/`TRUNCATE` sobre bitácora | Los tres fallan |
| MO-06 | Alerta vencida con y sin 7 reportes independientes posteriores | Solo la corroborada expira y restaura (10 reportes); la otra sigue abierta |
| SC-01 | Mismos reportes en SQL y en el oráculo | Mismo score (3 decimales) y misma confianza |
| SC-02 | 5 reportes ocultos | No hay fila publicable |
| ES-01 | Rejilla 3×3, centro "crítico" y 8 vecinas "leves" | Solo la colonia 5 en `discordancia_espacial` |
| PR-01 | Reporte de 20 días y uno de hoy | El viejo queda sin huella/red/UA y conserva gravedad; el nuevo no cambia |

### 11.5 Utilidades (ejecutado, `antiabuso.test.ts`)

IP desde la derecha (`"6.6.6.6, 201.1.2.3"` → `201.1.2.3`; basura → `null`); mismo /64 → misma huella; mismo /48 → misma red; `::ffff:` como IPv4; huella estable en el día, distinta entre días; red semanal estable en la semana ISO; producción sin `HASH_SALT` lanza error; token: 5 s ok, 0.5 s `muy_rapido`, 7 h `caducado`, alterado/ausente rechazado; origen: `same-origin` ok, `cross-site`/ajeno/`null` rechazados, sin cabeceras → `sin_cabeceras`; redacción de teléfono/correo/enlace; `diaLocal` a las 02:00 UTC es el día anterior en Guadalajara.

### 11.6 Ruta HTTP (ejecutado con `Request` reales contra el esqueleto, `after()` simulado)

`text/plain` → 415; `Origin` ajeno → 403; sin token → 400; honeypot → 201 y **0 filas**, +1 contador; formulario a 500 ms → 201 y 0 filas, +1 contador; cuarta colonia del día → 429; `X-Forwarded-For: 9.9.9.9, 201.1.2.3` cuenta contra el cupo de `201.1.2.3` (el valor falsificado se ignora); cliente sin cabeceras (curl) → entra `en_revision` con canal `sin_cabeceras`; `GET /token` → 200, y desde otro sitio → 403.

### 11.7 Por implementar al integrar (aún no ejecutados)

| ID | Escenario | Esperado |
|----|-----------|----------|
| HT-01 | 130 envíos desde una misma red en una hora, huellas distintas | Los 20 primeros `visible`, hasta 120 `en_revision`, luego `429` |
| HT-02 | Tráfico global > 1 500/h | Todo nuevo `en_revision`, ningún `429` por el interruptor |
| HT-03 | `GET /api/colonias/scores` | No expone `huella`, `red` ni comentarios; incluye `confianza`, `n`, `ultimo`, `metodo` |
| HT-04 | Datos de demostración | Nunca aparecen en el mapa real ni alteran el prior global |
| HT-05 | Navegador real en Chrome, Safari iOS y Firefox | Los envíos legítimos llegan con canal `web` (no `sin_cabeceras`); confirma el comportamiento de `Origin` en POST same-origin (**SIN VERIFICAR**) |
| HT-06 | Despliegue real | `X-Forwarded-For` falsificado desde fuera no cambia la huella (confirma `TRUSTED_PROXY_HOPS`) |
| HT-07 | `MODO_ATAQUE=1` | Todo `en_revision`; aviso visible; fila en bitácora |
| HT-08 | Modo sombra una semana | Informe: fracción de reportes reales con `n_dia ≥ 2` / `n_sem ≥ 3` |

---

## 12. Límites y riesgos residuales (lo que esto NO resuelve)

1. **Atacante con muchas redes que se comporta como humano** (E7/D): indistinguible de vecinos reales (CA-08, CA-10, BR-04). En el modelo de costo, mover una colonia "grave" a "leve" necesita ~19 reportes de redes distintas (vs. 33 hoy); no es una barrera, es un costo. La única defensa fuerte es **humana + externa**: comparación con datos oficiales o muestras verificadas, y contexto.
2. **Sesgo de selección**: el mapa refleja a quienes reportan. No es prevalencia.
3. **Umbrales sin calibrar**: `C`, `σ`, 2 s/5 s, `k_*`, topes por hora son valores iniciales razonados; ver §6.7.
4. **Compromiso del estimador**: el prior bajo y el recorte hacen que, para *desinflar* una colonia grave hasta color 1 con falsos de redes distintas, v1 exija menos (19) que la media simple (33). Se aceptó a cambio de resistir a la red única y a los pocos datos; si la prioridad cambia, subir `C` o `m0` o bajar `α` mueve el equilibrio (probar con `agregacion.test.ts`).
5. **Falsos positivos contra vecinos reales**: redes CGNAT o edificios grandes pueden recibir peso reducido. Mitigado con pesos (no rechazos) y modo sombra, no eliminado.
6. **Ataque de negación al honeypot/token**: poco probable; el interruptor global nunca rechaza.
7. **Credibilidad**: un solo caso de manipulación comprobada puede desacreditar el mapa; por eso importan la transparencia y los límites declarados.
8. **El mapa no debe vincularse a la asignación de apoyos** mientras no exista una capa verificada; si lo hace, E1 se vuelve el escenario dominante.
9. Esta investigación **no auditó** el despliegue, el hosting ni el frontend.

---

## 13. Pendientes (archivos fuera de mi propiedad) y orden sugerido

No instalé nada ni edité archivos del proyecto. **Dependencias nuevas: ninguna.**

| Orden | Cambio | Quién / archivo | Notas |
|-------|--------|-----------------|-------|
| 1 | Nueva migración con el SQL del **Anexo A** (renombrar `0XX_`) | `db/migrations/` | Probada en base limpia, dentro de una transacción como lo hace `scripts/migrate.ts`; idempotente (`IF NOT EXISTS`, `OR REPLACE`) |
| 2 | Variables de entorno: `HASH_SALT` (≥ 32 caracteres, **obligatoria** en producción), `ORIGENES_PERMITIDOS` (hosts, p. ej. el dominio público), `TRUSTED_PROXY_HOPS` | `.env` (no se tocó) | Rotar `HASH_SALT` al menos cada trimestre |
| 3 | Agregar `lib/antiabuso.ts`, `lib/ingesta.ts`, `lib/tasa.ts`, `lib/agregacion.ts` (Anexos B.1-B.4) y las pruebas (B.7-B.9) | `web/lib/` | Reemplaza la lógica de `lib/fingerprint.ts` (puede quedar como alias) |
| 4 | Reemplazar `app/api/reportes/route.ts` y crear `app/api/reportes/token/route.ts` (Anexos B.5-B.6) | `web/app/api/reportes/` | Verificar que el GET del token no se cachee (`Cache-Control: no-store` ya incluido) |
| 5 | `app/api/colonias/scores/route.ts`: llamar `SELECT refrescar_scores()` y leer `scores_vigentes`; devolver `id, score, confianza, n, n_eff, ultimo, metodo`; **filtrar colonias demo vs. reales** | `web/app/api/colonias/scores/` | Hoy usa la media simple |
| 6 | `components/AguaApp.tsx`: pedir el token al abrir el formulario y enviarlo; campo honeypot `referencia_interna`; rayado para `baja`; no contar `baja` en "colonias afectadas"; mensajes para `429`; texto "sin reportes ≠ agua buena"; enlace a metodología | `web/components/` | |
| 7 | Página `/metodologia` y `/api/metodologia` (§10) | `web/app/` | |
| 8 | Script CLI de moderación y de retención (`pnpm moderar`, `pnpm retencion`) o cron que llame `aplicar_retencion()` y `expirar_alertas()` | `web/scripts/` | Hasta entonces, `aplicar_retencion()` corre en el 1 % de los POST |
| 9 | Rol de base de datos `moderador` y `moderar()` como `SECURITY DEFINER` | DBA | Endurecimiento propuesto, no probado |
| 10 | `package.json`: script `"test": "vitest run"` | `web/package.json` | vitest ya está instalado |
| 11 | `scripts/seed-demo.ts`: rellenar `red`/`red_sem` distintos en datos demo para que los topes no los penalicen | `web/scripts/` | `NULL` ya cuenta como red propia (COALESCE) |
| 12 | Actualizar README: la línea "Rate limit real (Redis/Upstash)" ya no aplica; documentar el flujo | `README.md` | |
| 13 | Pasos de producción: modo sombra una semana (§6.7), HT-05 y HT-06 antes de abrir al público | Operación | |

---

## 14. Fuentes (leídas en esta sesión)

- Waze: CBS, "Waze Disputes Claims That Users Are Reporting False Congestion" — https://www.cbsnews.com/losangeles/news/waze-refutes-claims-that-users-are-reporting-false-congestion/ · Foro de Waze, "How to fight Waze users abuses" — https://www.waze.com/discuss/t/how-to-fight-waze-users-abbuses/180437
- mySociety, nuevas funciones de moderación de FixMyStreet for Councils — https://www.mysociety.org/author/hakimcassimally/
- Comisión Europea, marco FILTER (sensor.community y PurpleAir), 6/nov/2025 — https://environment.ec.europa.eu/news/air-pollution-data-citizen-operated-sensors-improved-novel-quality-control-system-2025-11-06_en
- Radanovic y Faltings, "Limiting the Influence of Low Quality Information in Community Sensing", AAMAS 2016 — https://ifaamas.csc.liv.ac.uk/Proceedings/aamas2016/pdfs/p873.pdf
- Fang et al., "Data Poisoning Attacks and Defenses to Crowdsourcing Systems" — https://arxiv.org/abs/2102.09171
- "Modeling Review Spam Using Temporal Patterns and Co-bursting Behaviors" — https://arxiv.org/abs/1611.06625
- Safecast: Penn State, validación con datos de Fukushima — https://soda.la.psu.edu/research-papers/citizen-monitoring-during-hazards-validation-of-fukushima-radiation-measurements-geojournal-2018
- Flint: JRSS Significance — https://academic.oup.com/jrssig/article/14/2/16/7029247
- Ataque Sybil — https://en.wikipedia.org/wiki/Sybil_attack · Media recortada — https://en.wikipedia.org/wiki/Truncated_mean · Media bayesiana — https://en.wikipedia.org/wiki/Bayesian_average · E. Miller, "How Not To Sort By Average Rating" — https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
- Plausible, política de datos — https://plausible.io/data-policy
- MDN, `Sec-Fetch-Site` — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site · web.dev, Fetch Metadata — https://web.dev/articles/fetch-metadata · OWASP, CSRF Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Vercel, request headers — https://vercel.com/docs/headers/request-headers
- RFC 6177 — https://www.rfc-editor.org/rfc/rfc6177
- PostgreSQL: `INSERT ... ON CONFLICT` — https://www.postgresql.org/docs/current/sql-insert.html · agregados de conjunto ordenado — https://www.postgresql.org/docs/current/functions-aggregate.html
- ALTCHA — https://altcha.org/docs/
- Garrigues, nueva LFPDPPP — https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce
- Documentación local de Next.js 16 (`node_modules/next/dist/docs/`): `proxy`, route handlers y `after` (`after` se puede usar en Route Handlers).
- Crisis local: Azteca Jalisco (CEDHJ, 600 colonias) — https://www.aztecajalisco.com/local/suman-600-las-colonias-afectadas-por-la-mala-calidad-del-agua-en-el-amg/ · El Financiero, 13/jul/2026 — https://www.elfinanciero.com.mx/estados/2026/07/13/que-sabemos-del-agua-potable-que-huele-a-cano-y-se-ve-turbia-en-guadalajara/ · Crónica, 30/jun/2026 — https://www.cronica.com.mx/jalisco/guadalajara/2026/06/30/pide-miguel-monraz-auditoria-al-siapa-por-agua-sucia-en-casas-de-guadalajara/

**Resumen de lo SIN VERIFICAR:** valores de `σ`, `τ`, `C`; umbrales 2 s / 5 s y topes por hora; prevalencia de CGNAT en México; si el HMAC de IP+UA es dato personal bajo la LFPDPPP 2025 y a quién aplica; comportamiento de proxies distintos de Vercel con `X-Forwarded-For`; envío de `Origin` en POST same-origin en todos los navegadores objetivo; términos de CAPTCHA de terceros; costo de prueba de trabajo en navegador; cifras de sesgo de Safecast; que D5 (drive-by) funcione contra el servidor en vivo (deducido del código).

---

# Anexos (código probado)

Todo lo siguiente se ejecutó tal cual. Rutas sugeridas entre paréntesis.

## Anexo A. Migración SQL (`db/migrations/0XX_anti_abuso.sql`)

Aplicada sobre una base limpia junto con `001_init.sql` (dentro de una transacción, enviando el archivo completo en una sola `query` como hace `scripts/migrate.ts`).

```sql
-- 0XX_anti_abuso.sql  (propuesta; el número lo asigna quien integre)

-- 1) reportes: señales anti-abuso (todas diarias/anónimas) y estado de moderación
ALTER TABLE reportes ALTER COLUMN huella DROP NOT NULL;  -- permite anonimizar tras la retención
ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS red             text,      -- HMAC DIARIO del prefijo /24 (IPv4) o /48 (IPv6)
  ADD COLUMN IF NOT EXISTS red_sem         text,      -- HMAC SEMANAL del mismo prefijo (frena ataques lentos de una misma red)
  ADD COLUMN IF NOT EXISTS ua_familia      text,      -- grueso: 'chrome-android', 'safari-ios'... (no el UA completo)
  ADD COLUMN IF NOT EXISTS comentario_hash text,      -- HMAC diario del comentario normalizado (detecta copiar/pegar)
  ADD COLUMN IF NOT EXISTS seg_formulario  integer,   -- segundos entre abrir el formulario y enviarlo
  ADD COLUMN IF NOT EXISTS canal           text NOT NULL DEFAULT 'web'
      CHECK (canal IN ('web', 'sin_cabeceras')),
  ADD COLUMN IF NOT EXISTS estado          text NOT NULL DEFAULT 'visible'
      CHECK (estado IN ('visible', 'en_revision', 'oculto')),
  ADD COLUMN IF NOT EXISTS anonimizado_en  timestamptz;
CREATE INDEX IF NOT EXISTS reportes_vigentes_idx ON reportes (colonia_id, creado_en DESC) WHERE estado <> 'oculto';
CREATE INDEX IF NOT EXISTS reportes_red_dia_idx  ON reportes (red, dia) WHERE red IS NOT NULL;
CREATE INDEX IF NOT EXISTS reportes_creado_idx   ON reportes (creado_en);

-- 2) límites de tasa: ventana fija, una fila por (clave, ventana)
CREATE TABLE IF NOT EXISTS limites_tasa (
  clave   text        NOT NULL,
  ventana timestamptz NOT NULL,
  n       integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (clave, ventana)
);

-- 2b) cubeta de fichas (alternativa a la ventana fija; útil para el interruptor global)
CREATE TABLE IF NOT EXISTS cubetas_tasa (
  clave       text PRIMARY KEY,
  fichas      double precision NOT NULL,
  actualizado timestamptz NOT NULL
);

-- 3) descartes silenciosos (honeypot, formulario demasiado rápido...): solo contadores
CREATE TABLE IF NOT EXISTS descartes_dia (
  dia    date NOT NULL,
  motivo text NOT NULL,
  n      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, motivo)
);

-- 4) alertas de abuso (las crea el detector; las cierra el sistema o un moderador)
CREATE TABLE IF NOT EXISTS alertas_abuso (
  id          bigserial PRIMARY KEY,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  colonia_id  integer REFERENCES colonias(id) ON DELETE CASCADE,
  regla       text  NOT NULL,
  metricas    jsonb NOT NULL,
  estado      text  NOT NULL DEFAULT 'abierta'
              CHECK (estado IN ('abierta', 'confirmada', 'descartada', 'expirada')),
  resuelta_en  timestamptz,
  resuelta_por text
);
CREATE UNIQUE INDEX IF NOT EXISTS alertas_abiertas_uq ON alertas_abuso (colonia_id, regla) WHERE estado = 'abierta';

-- 5) bitácora de moderación: solo se agrega, nunca se edita ni se borra
CREATE TABLE IF NOT EXISTS moderacion_bitacora (
  id            bigserial PRIMARY KEY,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actor         text   NOT NULL,                 -- 'sistema' | 'mod:<alias>'
  accion        text   NOT NULL CHECK (accion IN ('degradar', 'ocultar', 'restaurar', 'nota')),
  colonia_id    integer,
  reporte_ids   bigint[] NOT NULL DEFAULT '{}',
  regla         text,
  motivo        text   NOT NULL CHECK (char_length(motivo) >= 10),
  estado_despues text,
  metricas      jsonb
);
CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'moderacion_bitacora es solo de agregado'; END $$;
DROP TRIGGER IF EXISTS bitacora_no_mod ON moderacion_bitacora;
CREATE TRIGGER bitacora_no_mod BEFORE UPDATE OR DELETE ON moderacion_bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();
DROP TRIGGER IF EXISTS bitacora_no_trunc ON moderacion_bitacora;
CREATE TRIGGER bitacora_no_trunc BEFORE TRUNCATE ON moderacion_bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();

-- 6) moderar(): único camino para cambiar el estado de reportes; cambia y registra en una transacción
CREATE OR REPLACE FUNCTION moderar(
  p_ids bigint[], p_accion text, p_actor text, p_motivo text, p_regla text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_nuevo text;
  v_ids   bigint[];
  v_col   integer;
  v_antes jsonb;
BEGIN
  v_nuevo := CASE p_accion WHEN 'degradar' THEN 'en_revision' WHEN 'ocultar' THEN 'oculto'
                           WHEN 'restaurar' THEN 'visible' END;
  IF v_nuevo IS NULL THEN RAISE EXCEPTION 'accion invalida: %', p_accion; END IF;
  -- el sistema solo puede degradar, u ocultar por reglas de descarte inequívocas
  IF p_actor = 'sistema' AND p_accion IN ('ocultar', 'restaurar')
     AND coalesce(p_regla, '') NOT IN ('comentario_con_datos_personales', 'expiracion_alerta') THEN
    RAISE EXCEPTION 'el sistema no puede % con la regla %', p_accion, p_regla;
  END IF;
  -- ocultar en masa exige moderador humano
  IF p_accion = 'ocultar' AND cardinality(p_ids) > 20 AND p_actor NOT LIKE 'mod:%' THEN
    RAISE EXCEPTION 'ocultar >20 reportes exige moderador humano';
  END IF;
  WITH previos AS (
    SELECT id, colonia_id, estado FROM reportes
     WHERE id = ANY (p_ids) AND estado <> v_nuevo FOR UPDATE
  ), cambios AS (
    UPDATE reportes r SET estado = v_nuevo FROM previos p WHERE r.id = p.id
    RETURNING r.id
  )
  SELECT array_agg(p.id ORDER BY p.id),
         CASE WHEN count(DISTINCT p.colonia_id) = 1 THEN min(p.colonia_id) END,
         jsonb_object_agg(p.id::text, p.estado)
    INTO v_ids, v_col, v_antes
    FROM previos p JOIN cambios c USING (id);
  IF v_ids IS NULL THEN RETURN 0; END IF;
  INSERT INTO moderacion_bitacora
    (actor, accion, colonia_id, reporte_ids, regla, motivo, estado_despues, metricas)
  VALUES (p_actor, p_accion, v_col, v_ids, p_regla, p_motivo, v_nuevo,
          jsonb_build_object('estado_antes', v_antes));
  RETURN cardinality(v_ids);
END $$;


-- Vista de agregación robusta (método v1). Parámetros en el CTE `p`; cualquier cambio sube la versión.
CREATE OR REPLACE VIEW scores_robustos AS
WITH p AS (
  SELECT 14.0  AS ventana_dias,   -- ventana de reportes vigentes
         7.0   AS vida_media,     -- días en que un reporte pierde la mitad de su peso
         0.20  AS alfa,           -- fracción de PESO recortada en cada cola
         2.0   AS c_prior,        -- pseudo-reportes del prior
         2.0   AS k_dia,          -- tope de peso por (colonia, red, día)
         3.0   AS k_sem,          -- tope de peso por (colonia, red_sem) dentro de la ventana
         6     AS concentrada,    -- (colonia, red, día) con >= 6 reportes se trata como en revisión
         0.25  AS f_revision,     -- factor de un reporte en revisión
         0.5   AS f_rapido,       -- factor de un formulario llenado en < 5 s
         1.5   AS prior_min, 2.5 AS prior_max, 2.0 AS prior_def,
         3.0   AS min_n_eff
), vig AS (  -- reportes vigentes y no ocultos
  SELECT r.id, r.colonia_id, r.gravedad, r.dia,
         COALESCE(r.red, 'id:' || r.id) AS red, COALESCE(r.red_sem, 'id:' || r.id) AS red_sem,
         extract(epoch FROM (now() - r.creado_en)) / 86400.0 AS edad,
         r.estado, r.seg_formulario
    FROM reportes r, p
   WHERE r.estado <> 'oculto' AND r.creado_en > now() - make_interval(secs => p.ventana_dias * 86400)
), pesos AS (
  SELECT v.*,
         LEAST(1.0, p.k_dia / v.n_dia, p.k_sem / v.n_sem)
         * CASE WHEN v.estado = 'en_revision' OR v.n_dia >= p.concentrada THEN p.f_revision ELSE 1 END
         * CASE WHEN v.seg_formulario IS NOT NULL AND v.seg_formulario < 5 THEN p.f_rapido ELSE 1 END AS x
    FROM (SELECT *, count(*) OVER (PARTITION BY colonia_id, red, dia) AS n_dia,
                    count(*) OVER (PARTITION BY colonia_id, red_sem)  AS n_sem FROM vig) v
    CROSS JOIN p
), con_decay AS (
  SELECT *, x * power(2.0, -edad / (SELECT vida_media FROM p)) AS w FROM pesos
), bins AS (
  SELECT colonia_id, gravedad, sum(w) AS w FROM con_decay GROUP BY 1, 2
), acum AS (
  SELECT colonia_id, gravedad, w,
         sum(w) OVER (PARTITION BY colonia_id ORDER BY gravedad)       AS cum_hi,
         sum(w) OVER (PARTITION BY colonia_id ORDER BY gravedad) - w   AS cum_lo,
         sum(w) OVER (PARTITION BY colonia_id)                         AS wt
    FROM bins
), recorte AS (  -- media recortada por masa de peso + mediana ponderada
  SELECT a.colonia_id,
         sum(a.gravedad * m) / NULLIF(sum(m), 0) AS recortada,
         min(a.gravedad) FILTER (WHERE a.cum_hi >= a.wt / 2) AS mediana
    FROM acum a, p,
         LATERAL (SELECT GREATEST(0, LEAST(a.cum_hi, a.wt * (1 - p.alfa)) - GREATEST(a.cum_lo, a.wt * p.alfa)) AS m) k
   GROUP BY a.colonia_id
), por_dia AS (
  SELECT colonia_id, dia, sum(x) AS x FROM con_decay GROUP BY 1, 2
), resumen_dia AS (
  SELECT colonia_id, sum(x) AS n_eff,
         count(*) FILTER (WHERE x >= 1.5) AS dias_corrob,
         max(x) / NULLIF(sum(x), 0) AS max_dia
    FROM por_dia GROUP BY 1
), redes AS (
  SELECT colonia_id, count(DISTINCT red_sem) AS n_redes, count(*) AS n_crudo FROM con_decay GROUP BY 1
), prior AS (  -- prior global acotado: un atacante no puede moverlo fuera de [prior_min, prior_max]
  SELECT LEAST(p.prior_max, GREATEST(p.prior_min,
           COALESCE((SELECT sum(r.recortada * d.n_eff) / NULLIF(sum(d.n_eff), 0)
                       FROM recorte r JOIN resumen_dia d USING (colonia_id) WHERE d.n_eff >= 6), p.prior_def))) AS m0
    FROM p
)
SELECT r.colonia_id AS id,
       (d.n_eff / (d.n_eff + p.c_prior)) * r.recortada + (1 - d.n_eff / (d.n_eff + p.c_prior)) * pr.m0 AS score,
       r.recortada, r.mediana, d.n_eff, d.dias_corrob, d.max_dia, e.n_redes, e.n_crudo::int AS n,
       CASE
         WHEN d.n_eff < p.min_n_eff THEN 'sin_datos'
         WHEN EXISTS (SELECT 1 FROM alertas_abuso a WHERE a.colonia_id = r.colonia_id AND a.estado = 'abierta') THEN 'baja'
         WHEN d.n_eff < 6 OR d.dias_corrob < 2 THEN 'baja'
         WHEN d.n_eff < 12 OR e.n_redes < 4 OR d.dias_corrob < 3 OR d.max_dia > 0.6 THEN 'media'
         WHEN e.n_redes < 8 OR abs(r.recortada - r.mediana) > 0.75 THEN 'media'
         ELSE 'alta'
       END AS confianza,
       'v1'::text AS metodo
  FROM recorte r
  JOIN resumen_dia d USING (colonia_id)
  JOIN redes e USING (colonia_id)
  CROSS JOIN p CROSS JOIN prior pr;


-- Instantánea de scores (la lee /api/colonias/scores; se refresca cada ~60 s)
CREATE MATERIALIZED VIEW IF NOT EXISTS scores_vigentes AS SELECT * FROM scores_robustos;
CREATE UNIQUE INDEX IF NOT EXISTS scores_vigentes_id ON scores_vigentes (id);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY scores_vigentes;   (no bloquea lecturas)

-- Colonias cuyo score discrepa de sus vecinas colindantes con datos confiables: va a la cola de revisión
CREATE OR REPLACE VIEW discordancia_espacial AS
SELECT s.id, s.score, s.confianza, v.n_vecinas, v.media_vecinas, s.score - v.media_vecinas AS dif
  FROM scores_vigentes s
  CROSS JOIN LATERAL (
    SELECT count(*) AS n_vecinas, sum(sv.score * sv.n_eff) / sum(sv.n_eff) AS media_vecinas
      FROM colonias a
      JOIN colonias b ON b.id <> a.id AND ST_Touches(a.geom, b.geom)
      JOIN scores_vigentes sv ON sv.id = b.id AND sv.confianza IN ('media', 'alta')
     WHERE a.id = s.id
  ) v
 WHERE v.n_vecinas >= 3 AND abs(s.score - v.media_vecinas) >= 1.5;

-- Refresco perezoso y sin carreras: lo llama /api/colonias/scores antes de leer
CREATE TABLE IF NOT EXISTS scores_meta (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  calculado_en timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO scores_meta DEFAULT VALUES ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION refrescar_scores(p_max_edad interval DEFAULT interval '60 seconds')
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NOT pg_try_advisory_lock(727001) THEN RETURN false; END IF;   -- otro proceso ya lo está haciendo
  BEGIN
    IF (SELECT calculado_en FROM scores_meta) < now() - p_max_edad THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY scores_vigentes;
      UPDATE scores_meta SET calculado_en = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(727001);
    RAISE;
  END;
  PERFORM pg_advisory_unlock(727001);
  RETURN true;
END $$;


-- Evalúa una colonia: ¿hay un pico en la última hora y es sospechoso? (se llama tras cada INSERT)
CREATE OR REPLACE FUNCTION evaluar_rafaga(p_colonia integer)
RETURNS TABLE (n integer, umbral integer, pico boolean, sospechosa boolean, senales text[], metricas jsonb)
LANGUAGE sql STABLE AS $$
  WITH ult AS (
    SELECT huella, red, ua_familia, seg_formulario, comentario_hash,
           extract(epoch FROM creado_en - lag(creado_en) OVER (ORDER BY creado_en)) AS dt
      FROM reportes
     WHERE colonia_id = p_colonia AND estado <> 'oculto' AND creado_en >= now() - interval '60 minutes'
  ), base AS (  -- tasa típica por hora en los 7 días previos a la última hora
    SELECT count(*) / (7 * 24.0) AS lambda
      FROM reportes
     WHERE colonia_id = p_colonia AND creado_en >= now() - interval '7 days 1 hour'
                                  AND creado_en <  now() - interval '1 hour'
  ), m AS (
    SELECT count(*)::int AS n,
           count(DISTINCT red)::float / NULLIF(count(DISTINCT huella), 0)                AS rho_red,
           (SELECT max(c) FROM (SELECT count(*) c FROM ult GROUP BY ua_familia) x)::float / NULLIF(count(*), 0) AS ua_dom,
           stddev_samp(dt) / NULLIF(avg(dt), 0)                                          AS cv,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY seg_formulario)                   AS med_seg,
           (SELECT max(c) FROM (SELECT count(*) c FROM ult WHERE comentario_hash IS NOT NULL GROUP BY comentario_hash) y) AS dup
      FROM ult
  ), q AS (
    SELECT m.*, b.lambda, GREATEST(8, ceil(b.lambda + 4 * sqrt(b.lambda)))::int AS umbral FROM m, base b
  )
  SELECT q.n, q.umbral, q.n >= q.umbral AS pico,
         (q.n >= q.umbral AND cardinality(s.senales) >= 2) AS sospechosa,
         s.senales,
         jsonb_build_object('n', q.n, 'lambda_hora', round(q.lambda::numeric, 3), 'umbral', q.umbral,
                            'rho_red', round(q.rho_red::numeric, 2), 'ua_dominante', round(q.ua_dom::numeric, 2),
                            'cv_intervalos', round(q.cv::numeric, 2), 'mediana_seg_form', q.med_seg, 'comentarios_repetidos', q.dup)
    FROM q, LATERAL (SELECT array_remove(ARRAY[
           CASE WHEN q.rho_red < 0.5            THEN 'pocas_redes'      END,
           CASE WHEN q.n >= 10 AND q.ua_dom >= 0.9 THEN 'ua_homogeneo'  END,
           CASE WHEN q.n >= 6  AND q.cv < 0.35  THEN 'ritmo_regular'    END,
           CASE WHEN q.med_seg < 6              THEN 'formulario_rapido' END,
           CASE WHEN q.dup >= 3                 THEN 'comentario_repetido' END], NULL) AS senales) s;
$$;

-- Se llama tras cada INSERT de reporte: si la ráfaga es sospechosa, abre alerta y DEGRADA (no oculta) lo de la última hora
CREATE OR REPLACE FUNCTION aplicar_rafaga(p_colonia integer) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE e record; ids bigint[];
BEGIN
  SELECT * INTO e FROM evaluar_rafaga(p_colonia);
  IF NOT coalesce(e.sospechosa, false) THEN RETURN false; END IF;
  INSERT INTO alertas_abuso (colonia_id, regla, metricas)
  VALUES (p_colonia, 'rafaga_sospechosa', e.metricas || jsonb_build_object('senales', to_jsonb(e.senales)))
  ON CONFLICT (colonia_id, regla) WHERE estado = 'abierta' DO NOTHING;
  ids := ARRAY(SELECT id FROM reportes WHERE colonia_id = p_colonia AND estado = 'visible'
                AND creado_en >= now() - interval '60 minutes');
  IF cardinality(ids) > 0 THEN
    PERFORM moderar(ids, 'degradar', 'sistema', 'ráfaga sospechosa: ' || array_to_string(e.senales, ', '), 'rafaga_sospechosa');
  END IF;
  RETURN true;
END $$;


-- Cola de moderación: lo más viejo primero; las alertas vencidas (>48 h) suben a la cima
CREATE OR REPLACE VIEW cola_moderacion AS
SELECT 'alerta'::text AS tipo, a.id AS alerta_id, a.colonia_id, a.creado_en, a.regla AS motivo, a.metricas AS detalle,
       (SELECT count(*)::int FROM reportes r WHERE r.colonia_id = a.colonia_id AND r.estado = 'en_revision') AS en_revision,
       (now() - a.creado_en > interval '48 hours') AS vencida
  FROM alertas_abuso a WHERE a.estado = 'abierta'
UNION ALL
SELECT 'discordancia', NULL, d.id, now(), 'discordancia_espacial',
       jsonb_build_object('score', round(d.score::numeric, 2), 'media_vecinas', round(d.media_vecinas::numeric, 2), 'n_vecinas', d.n_vecinas),
       0, false
  FROM discordancia_espacial d
ORDER BY 8 DESC, 4;

-- Cierra alertas viejas SOLO si hubo corroboración independiente posterior (>= 6 redes semanales distintas,
-- fuera de los reportes en revisión). Sin corroboración la alerta sigue abierta y "vencida" en la cola.
CREATE OR REPLACE FUNCTION expirar_alertas() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE a record; n integer := 0; ids bigint[];
BEGIN
  FOR a IN SELECT * FROM alertas_abuso WHERE estado = 'abierta' AND creado_en < now() - interval '48 hours' LOOP
    IF (SELECT count(DISTINCT COALESCE(red_sem, 'id:' || id)) FROM reportes
         WHERE colonia_id = a.colonia_id AND estado = 'visible' AND creado_en > a.creado_en) >= 6 THEN
      ids := ARRAY(SELECT id FROM reportes WHERE colonia_id = a.colonia_id AND estado = 'en_revision' AND creado_en <= a.creado_en);
      IF cardinality(ids) > 0 THEN
        PERFORM moderar(ids, 'restaurar', 'sistema', 'alerta expirada con corroboración independiente posterior', 'expiracion_alerta');
      END IF;
      UPDATE alertas_abuso SET estado = 'expirada', resuelta_en = now(), resuelta_por = 'sistema' WHERE id = a.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;


-- Retención: lo identificable (aun siendo hashes diarios) vive lo que dura la ventana de cálculo (14 días)
CREATE OR REPLACE FUNCTION aplicar_retencion() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a int; b int; c int; d int;
BEGIN
  UPDATE reportes
     SET huella = NULL, red = NULL, red_sem = NULL, ua_familia = NULL, comentario_hash = NULL,
         seg_formulario = NULL, anonimizado_en = now()
   WHERE creado_en < now() - interval '14 days' AND anonimizado_en IS NULL;
  GET DIAGNOSTICS a = ROW_COUNT;
  UPDATE reportes SET comentario = NULL
   WHERE creado_en < now() - interval '30 days' AND comentario IS NOT NULL;
  GET DIAGNOSTICS b = ROW_COUNT;
  DELETE FROM limites_tasa WHERE ventana < now() - interval '2 days';
  GET DIAGNOSTICS c = ROW_COUNT;
  DELETE FROM cubetas_tasa WHERE actualizado < now() - interval '2 days';
  GET DIAGNOSTICS d = ROW_COUNT;
  RETURN jsonb_build_object('anonimizados', a, 'comentarios_borrados', b, 'limites_borrados', c, 'cubetas_borradas', d);
END $$;
```

## Anexo B. TypeScript

### B.1 `web/lib/antiabuso.ts`

```ts
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

const SECRETO = () => {
  const s = process.env.HASH_SALT;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("HASH_SALT (>=32 caracteres) es obligatorio en producción");
    return "dev-solo-local-dev-solo-local-dev-solo";
  }
  return s;
};
const hmac = (clave: string, dato: string) => createHmac("sha256", clave).update(dato).digest("hex");
/** Clave del día derivada del secreto maestro: sin guardar sales en la base. */
const claveDia = (dia: string) => hmac(SECRETO(), "dia:" + dia);

/** Día calendario en hora de Guadalajara (la huella rota a medianoche local, no a las 18:00). */
export function diaLocal(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(ahora); // YYYY-MM-DD
}

/** IP del cliente. HOPS = proxies de confianza delante de la app (Vercel sobrescribe x-forwarded-for: 1). */
export function ipCliente(h: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  const xs = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // se cuenta DESDE LA DERECHA: lo que escribe el cliente queda a la izquierda y no se usa
  const ip = xs[xs.length - hops];
  return ip && (isIPv4(ip) || isIPv6(ip)) ? ip : null;
}

function v6ABigInt(ip: string): bigint {
  let s = ip.split("%")[0];
  if (s.includes(".")) { // ::ffff:1.2.3.4 y similares
    const i = s.lastIndexOf(":");
    const q = s.slice(i + 1).split(".").map(Number);
    s = s.slice(0, i + 1) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const [a, b] = s.split("::");
  const ga = a ? a.split(":") : [];
  const gb = b ? b.split(":") : [];
  const g = b === undefined ? ga : [...ga, ...Array(8 - ga.length - gb.length).fill("0"), ...gb];
  return g.reduce((acc, x) => (acc << 16n) | BigInt(parseInt(x || "0", 16)), 0n);
}

/** Prefijos de red: IPv4 → /24 para `red`, IP completa para `huella`; IPv6 → /48 y /64. */
export function prefijos(ip: string): { individual: string; red: string } {
  if (isIPv6(ip)) {
    const n = v6ABigInt(ip);
    const mapeada = n >> 32n === 0xffffn; // ::ffff:a.b.c.d es IPv4
    if (mapeada) return prefijos([24, 16, 8, 0].map((s) => Number((n >> BigInt(s)) & 0xffn)).join("."));
    return { individual: "v6/64:" + (n >> 64n).toString(16), red: "v6/48:" + (n >> 80n).toString(16) };
  }
  const o = ip.split(".");
  return { individual: "v4:" + ip, red: "v4/24:" + o.slice(0, 3).join(".") };
}

/** Familia gruesa de navegador+SO: muy poca entropía, no identifica a nadie. */
export function uaFamilia(ua: string): string {
  const so = /iPhone|iPad|iOS/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) ? "mac" : /Linux/i.test(ua) ? "linux" : "otro";
  const nav = /Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : /SamsungBrowser/.test(ua) ? "samsung" : /(Chrome|CriOS)\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "otro";
  return `${nav}-${so}`;
}

export function identidades(ip: string, ua: string, dia: string, comentario?: string) {
  const k = claveDia(dia);
  const p = prefijos(ip);
  return {
    huella: hmac(k, `h|${p.individual}|${ua}`),
    red: hmac(k, `r|${p.red}`).slice(0, 32),
    uaFamilia: uaFamilia(ua),
    comentarioHash: comentario ? hmac(k, "c|" + comentario.toLowerCase().replace(/\s+/g, " ").trim()).slice(0, 32) : null,
  };
}

/** Token de formulario sin estado: `iat.nonce.firma`. Lo emite GET /api/reportes/token. */
export function emitirToken(ahoraMs = Date.now()): string {
  const base = `${ahoraMs}.${randomBytes(8).toString("hex")}`;
  return `${base}.${hmac(SECRETO(), "tok|" + base).slice(0, 32)}`;
}
export type VeredictoToken = { ok: true; segundos: number } | { ok: false; motivo: "ausente" | "firma" | "caducado" | "muy_rapido" };
export function verificarToken(t: string | undefined, ahoraMs = Date.now(), minSeg = 2, maxHoras = 6): VeredictoToken {
  if (!t) return { ok: false, motivo: "ausente" };
  const [iat, nonce, firma] = t.split(".");
  const esperado = hmac(SECRETO(), `tok|${iat}.${nonce}`).slice(0, 32);
  if (!firma || firma.length !== esperado.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))) return { ok: false, motivo: "firma" };
  const seg = (ahoraMs - Number(iat)) / 1000;
  if (!(seg >= 0) || seg > maxHoras * 3600) return { ok: false, motivo: "caducado" };
  if (seg < minSeg) return { ok: false, motivo: "muy_rapido" };
  return { ok: true, segundos: Math.round(seg) };
}

/** Defensa contra envíos desde OTRO sitio web (CSRF/"drive-by"). No frena a scripts (curl puede mentir). */
export function origenPermitido(h: Headers, hostPermitidos: string[]): "web" | "sin_cabeceras" | null {
  const sfs = h.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin") return null; // cross-site, same-site o none: no es nuestro formulario
  const origin = h.get("origin");
  if (origin) {
    try { return hostPermitidos.includes(new URL(origin).host) ? "web" : null; } catch { return null; }
  }
  return sfs === "same-origin" ? "web" : "sin_cabeceras"; // sin Origin ni Sec-Fetch: no navegador moderno
}

/** Quita datos personales de comentarios libres antes de guardarlos (teléfonos, correos, enlaces). */
export function limpiarComentario(c: string): { texto: string; redactado: boolean } {
  const t = c
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[enlace]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/g, "[teléfono]");
  return { texto: t, redactado: t !== c };
}

/** Semana ISO ("YYYY-Www") de un día YYYY-MM-DD. */
function semanaIso(dia: string): string {
  const d = new Date(dia + "T00:00:00Z");
  const jueves = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
  const ini = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 1));
  return `${jueves.getUTCFullYear()}-W${String(Math.floor((jueves.getTime() - ini.getTime()) / 86400000 / 7) + 1).padStart(2, "0")}`;
}

/** HMAC SEMANAL del prefijo de red (/24 o /48): frena ataques lentos desde una misma red sin identificar a nadie. */
export function redSemanal(ip: string, dia: string): string {
  return hmac(hmac(SECRETO(), "sem:" + semanaIso(dia)), "r|" + prefijos(ip).red).slice(0, 32);
}
```

### B.2 `web/lib/agregacion.ts` (oráculo de la agregación; el SQL la replica)

```ts
// Referencia de agregación robusta v1: misma lógica que la vista SQL `scores_robustos` (sirve de oráculo en tests).
export const PARAMS = {
  ventanaDias: 14,
  vidaMediaDias: 7,
  alfa: 0.2,          // fracción de PESO recortada en cada cola
  C: 2,               // pseudo-reportes del prior
  priorMin: 1.5, priorMax: 2.5, priorDef: 2.0,
  kDia: 2,            // tope de peso por (colonia, red, día)
  kSem: 3,            // tope de peso por (colonia, red_sem) en la ventana
  concentrada: 6,     // (colonia, red, día) con >= 6 reportes se trata como "en revisión"
  fRevision: 0.25,
  fRapido: 0.5,       // formulario enviado en < 5 s
  minNEff: 3,
};

export type Reporte = {
  gravedad: 1 | 2 | 3 | 4;
  edadDias: number;
  red: string;      // HMAC diario del prefijo de red
  redSem: string;   // HMAC semanal del mismo prefijo
  dia: string;
  estado?: "visible" | "en_revision" | "oculto";
  segForm?: number | null;
};

export type Resultado = {
  score: number | null; recortada: number | null; mediana: number | null;
  nEff: number; diasCorrob: number; redesSem: number; maxDia: number;
  confianza: "sin_datos" | "baja" | "media" | "alta";
};

export function agregar(rs: Reporte[], o: { prior?: number; alertaAbierta?: boolean; p?: typeof PARAMS } = {}): Resultado {
  const p = o.p ?? PARAMS;
  const m0 = Math.min(p.priorMax, Math.max(p.priorMin, o.prior ?? p.priorDef));
  const act = rs.filter((r) => (r.estado ?? "visible") !== "oculto" && r.edadDias <= p.ventanaDias);
  const cuenta = (f: (r: Reporte) => string) => {
    const m = new Map<string, number>();
    for (const r of act) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
    return m;
  };
  const kDia = cuenta((r) => r.red + "|" + r.dia), kSem = cuenta((r) => r.redSem);
  const bins = [0, 0, 0, 0];
  const porDia = new Map<string, number>();
  let nEff = 0;
  for (const r of act) {
    const kd = kDia.get(r.red + "|" + r.dia)!, ks = kSem.get(r.redSem)!;
    const x =
      Math.min(1, p.kDia / kd, p.kSem / ks) *
      ((r.estado ?? "visible") === "en_revision" || kd >= p.concentrada ? p.fRevision : 1) *
      (r.segForm != null && r.segForm < 5 ? p.fRapido : 1);
    bins[r.gravedad - 1] += x * Math.pow(2, -r.edadDias / p.vidaMediaDias);
    porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + x);
    nEff += x;
  }
  const W = bins.reduce((a, b) => a + b, 0);
  const diasCorrob = [...porDia.values()].filter((v) => v >= 1.5).length;
  const maxDia = nEff > 0 ? Math.max(...porDia.values()) / nEff : 0;
  const redesSem = new Set(act.map((r) => r.redSem)).size;
  const vacio = { score: null, recortada: null, mediana: null, nEff, diasCorrob, redesSem, maxDia, confianza: "sin_datos" as const };
  if (W === 0) return vacio;
  const lo = p.alfa * W, hi = W - lo;
  let cum = 0, kept = 0, sum = 0, mediana = 4, med = false;
  for (let g = 1; g <= 4; g++) {
    const a = cum, b = cum + bins[g - 1];
    const m = Math.max(0, Math.min(b, hi) - Math.max(a, lo));
    kept += m; sum += g * m;
    if (!med && b >= W / 2) { mediana = g; med = true; }
    cum = b;
  }
  const recortada = sum / kept;
  const lambda = nEff / (nEff + p.C);
  const score = lambda * recortada + (1 - lambda) * m0;
  let confianza: Resultado["confianza"];
  if (nEff < p.minNEff) confianza = "sin_datos";
  else if (o.alertaAbierta) confianza = "baja";
  else if (nEff < 6 || diasCorrob < 2) confianza = "baja";
  else if (nEff < 12 || redesSem < 4 || diasCorrob < 3 || maxDia > 0.6) confianza = "media";
  else if (redesSem < 8 || Math.abs(recortada - mediana) > 0.75) confianza = "media";
  else confianza = "alta";
  return { score, recortada, mediana, nEff, diasCorrob, redesSem, maxDia, confianza };
}
```

### B.3 `web/lib/tasa.ts`

```ts
import type { Pool } from "pg";

/**
 * Cuenta una petición en una ventana fija y devuelve el contador `n` tras contarla.
 * Atómico (INSERT ... ON CONFLICT). Al pasar `tope` deja de escribir y devuelve `tope + 1`,
 * así un atacante no amplifica escrituras en la base. Uso: `if (await contar(...) > limite) → 429`.
 */
export async function contar(pool: Pool, clave: string, tope: number, ventanaSeg: number): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `INSERT INTO limites_tasa AS l (clave, ventana, n)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $3) * $3), 1)
     ON CONFLICT (clave, ventana) DO UPDATE SET n = l.n + 1 WHERE l.n <= $2
     RETURNING n`,
    [clave, tope, ventanaSeg],
  );
  return rows.length ? rows[0].n : tope + 1;
}

/** Cubeta de fichas (capacidad `cap`, recarga `porSeg`/s). true = hay ficha. Útil para el interruptor global. */
export async function ficha(pool: Pool, clave: string, cap: number, porSeg: number): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO cubetas_tasa AS c (clave, fichas, actualizado)
     VALUES ($1, $2::float8 - 1, now())
     ON CONFLICT (clave) DO UPDATE
       SET fichas = LEAST($2::float8, c.fichas + extract(epoch FROM now() - c.actualizado) * $3) - 1,
           actualizado = now()
       WHERE LEAST($2::float8, c.fichas + extract(epoch FROM now() - c.actualizado) * $3) >= 1
     RETURNING fichas`,
    [clave, cap, porSeg],
  );
  return rows.length > 0;
}

/** Cuenta un descarte silencioso (honeypot, formulario demasiado rápido...) sin guardar nada del visitante. */
export async function contarDescarte(pool: Pool, dia: string, motivo: string): Promise<void> {
  await pool.query(
    `INSERT INTO descartes_dia (dia, motivo, n) VALUES ($1, $2, 1)
     ON CONFLICT (dia, motivo) DO UPDATE SET n = descartes_dia.n + 1`,
    [dia, motivo],
  );
}
```

### B.4 `web/lib/ingesta.ts`

```ts
import type { Pool } from "pg";

export const MAX_COLONIAS_POR_DIA = 3;

export type NuevoReporte = {
  colonia_id: number; gravedad: number; sintomas: string[]; comentario: string | null;
  huella: string; red: string; redSem: string; uaFamilia: string; comentarioHash: string | null;
  segFormulario: number; canal: "web" | "sin_cabeceras"; dia: string;
  estado: "visible" | "en_revision"; // en_revision cuando se rebasó un límite blando
};

/** Guarda el reporte sin carreras: el cupo de colonias/día se revisa bajo un candado por huella. */
export async function guardarReporte(pool: Pool, r: NuevoReporte) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["rep:" + r.huella]);
    const { rows: previos } = await c.query("SELECT colonia_id FROM reportes WHERE huella = $1 AND dia = $2", [r.huella, r.dia]);
    const yaReporto = previos.some((p) => p.colonia_id === r.colonia_id);
    if (!yaReporto && previos.length >= MAX_COLONIAS_POR_DIA) { await c.query("ROLLBACK"); return "limite_colonias" as const; }
    const res = await c.query(
      `INSERT INTO reportes AS x (colonia_id, gravedad, sintomas, comentario, huella, dia, red, red_sem, ua_familia,
                                  comentario_hash, seg_formulario, canal, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (colonia_id, huella, dia) DO UPDATE
         SET gravedad = EXCLUDED.gravedad, sintomas = EXCLUDED.sintomas, comentario = EXCLUDED.comentario,
             comentario_hash = EXCLUDED.comentario_hash, creado_en = now()
       WHERE x.estado <> 'oculto'   -- reenviar no "revive" un reporte que un moderador ocultó
         AND now() - x.creado_en > interval '30 seconds'`,   // y no se puede martillar el UPSERT
      [r.colonia_id, r.gravedad, r.sintomas, r.comentario, r.huella, r.dia, r.red, r.redSem, r.uaFamilia,
       r.comentarioHash, r.segFormulario, r.canal, r.estado],
    );
    await c.query("COMMIT");
    if (res.rowCount === 0) return "sin_cambios" as const; // reenvío muy seguido o reporte ya moderado
    return (yaReporto ? "actualizado" : "creado") as "actualizado" | "creado";
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    if ((e as { code?: string }).code === "23503") return "colonia_inexistente" as const;
    throw e;
  } finally {
    c.release();
  }
}
```

### B.5 `web/app/api/reportes/token/route.ts`

```ts
import { pool } from "@/lib/db";
import { diaLocal, emitirToken, identidades, ipCliente, origenPermitido } from "@/lib/antiabuso";
import { contar } from "@/lib/tasa";

export async function GET(request: Request) {
  const h = request.headers;
  const origenes = (process.env.ORIGENES_PERMITIDOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origenPermitido(h, origenes)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const id = identidades(ipCliente(h) ?? "0.0.0.0", h.get("user-agent") ?? "", diaLocal());
  if ((await contar(pool, `tok:r:${id.red}`, 60, 3600)) > 60) return Response.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  return Response.json({ token: emitirToken() }, { headers: { "Cache-Control": "no-store" } });
}
```

### B.6 `web/app/api/reportes/route.ts`

```ts
import { after } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { SINTOMAS } from "@/lib/severity";
import { diaLocal, identidades, ipCliente, limpiarComentario, origenPermitido, redSemanal, verificarToken } from "@/lib/antiabuso";
import { guardarReporte } from "@/lib/ingesta";
import { contar, contarDescarte } from "@/lib/tasa";

// Límites (ver docs/research/anti-abuso.md §5)
const POR_HUELLA_HORA = 8;      // envíos/hora de una misma huella (incluye reenvíos)
const RED_BLANDO_HORA = 20;     // sobre esto, los reportes de esa red entran "en revisión"
const RED_DURO_HORA = 120;      // sobre esto, 429
const GLOBAL_BLANDO_HORA = 1500; // interruptor: nunca rechaza, solo degrada

const Body = z.object({
  colonia_id: z.number().int().positive(),
  gravedad: z.number().int().min(1).max(4),
  sintomas: z.array(z.enum(SINTOMAS)).max(SINTOMAS.length).default([]),
  comentario: z.string().trim().max(500).optional(),
  token: z.string().max(200).optional(),
  // honeypot: campo que un humano nunca ve ni llena (name poco "autocompletable")
  referencia_interna: z.string().max(200).optional(),
});

const origenes = () => (process.env.ORIGENES_PERMITIDOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function POST(request: Request) {
  const h = request.headers;
  // 1) forma: solo JSON declarado (un POST "simple" desde otro sitio, text/plain, no debe llegar al parser) y tamaño acotado
  if (!(h.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Tipo de contenido no admitido" }, { status: 415 });
  }
  if (Number(h.get("content-length") ?? 0) > 4096) return Response.json({ error: "Solicitud demasiado grande" }, { status: 413 });
  // 2) origen: bloquea formularios incrustados en otros sitios (no frena scripts: curl puede mentir)
  const canal = origenPermitido(h, origenes());
  if (!canal) return Response.json({ error: "Origen no permitido" }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;
  const dia = diaLocal();

  // 3) descartes silenciosos: al bot se le responde "ok" y no se guarda nada
  const descartar = async (motivo: string) => {
    await contarDescarte(pool, dia, motivo);
    return Response.json({ ok: true }, { status: 201 });
  };
  if (b.referencia_interna) return descartar("honeypot");
  const tok = verificarToken(b.token);
  if (!tok.ok) {
    if (tok.motivo === "muy_rapido") return descartar("muy_rapido");
    return Response.json({ error: "Recarga la página e inténtalo de nuevo" }, { status: 400 });
  }

  // 4) identidades anónimas del día (nada de IP ni UA se guarda)
  const ip = ipCliente(h) ?? "0.0.0.0"; // sin IP confiable: todos caen en una sola "red" y comparten tope
  const ua = h.get("user-agent") ?? "";
  const limpio = b.comentario ? limpiarComentario(b.comentario).texto : null;
  const id = identidades(ip, ua, dia, limpio ?? undefined);

  // 5) límites de tasa (ventana fija en Postgres)
  const nHuella = await contar(pool, `rep:h:${id.huella}`, POR_HUELLA_HORA, 3600);
  if (nHuella > POR_HUELLA_HORA) return Response.json({ error: "Demasiados envíos. Intenta más tarde." }, { status: 429 });
  const nRed = await contar(pool, `rep:r:${id.red}`, RED_DURO_HORA, 3600);
  if (nRed > RED_DURO_HORA) return Response.json({ error: "Demasiados envíos desde tu red. Intenta más tarde." }, { status: 429 });
  const nGlobal = await contar(pool, "rep:g", GLOBAL_BLANDO_HORA, 3600);
  const degradar = nRed > RED_BLANDO_HORA || nGlobal > GLOBAL_BLANDO_HORA || canal === "sin_cabeceras";

  // 6) guardar (cupo de colonias/día bajo candado; reenviar no revive reportes ocultos)
  const res = await guardarReporte(pool, {
    colonia_id: b.colonia_id, gravedad: b.gravedad, sintomas: b.sintomas, comentario: limpio,
    huella: id.huella, red: id.red, redSem: redSemanal(ip, dia), uaFamilia: id.uaFamilia, comentarioHash: id.comentarioHash,
    segFormulario: tok.segundos, canal, dia, estado: degradar ? "en_revision" : "visible",
  });
  if (res === "limite_colonias") return Response.json({ error: "Llegaste al límite de reportes de hoy" }, { status: 429 });
  if (res === "colonia_inexistente") return Response.json({ error: "Colonia no encontrada" }, { status: 404 });

  // 7) detección de ráfagas y mantenimiento fuera del camino de la respuesta
  after(async () => {
    await pool.query("SELECT aplicar_rafaga($1)", [b.colonia_id]);
    if (Math.random() < 0.01) await pool.query("SELECT aplicar_retencion()");
  });
  return Response.json({ ok: true, actualizado: res !== "creado" }, { status: res === "creado" ? 201 : 200 });
}
```

### B.7 `web/lib/agregacion.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { agregar, type Reporte } from "./agregacion";

// ---- fábricas deterministas (sin azar) ----
const dia = (e: number) => "d" + Math.floor(e);
const sem = (e: number) => Math.floor(e / 7);
const hon = (patron: number[], dias: number): Reporte[] =>
  patron.map((g, i) => {
    const e = ((i + 0.5) * dias) / patron.length;
    return { gravedad: g as 1 | 2 | 3 | 4, edadDias: e, red: "h" + i, redSem: "h" + i + "w" + sem(e), dia: dia(e) };
  });
const falsos = (n: number, g: 1 | 2 | 3 | 4, red: (i: number) => string, e0: number, e1: number, extra: Partial<Reporte> = {}): Reporte[] =>
  Array.from({ length: n }, (_, i) => {
    const e = e0 + ((e1 - e0) * (i + 0.5)) / n;
    return { gravedad: g, edadDias: e, red: red(i), redSem: red(i) + "w" + sem(e), dia: dia(e), ...extra };
  });
const P3 = [3, 3, 2, 3, 4, 3, 3, 2, 3, 4, 3, 3]; // 12 vecinos: "grave"
const P4 = [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 3]; // 12 vecinos: "crítica"
const P1 = [1, 1, 2, 1];                          // 4 vecinos: "leve"
const color = (s: number | null) => (s == null ? null : Math.min(4, Math.max(1, Math.round(s))));

describe("agregación robusta v1", () => {
  it("CA-01 colonia grave honesta: color 3, confianza alta", () => {
    const r = agregar(hon(P3, 4));
    expect(color(r.score)).toBe(3); expect(r.confianza).toBe("alta"); expect(r.nEff).toBeCloseTo(12, 1);
  });
  it("CA-02 colonia crítica honesta: color 4, confianza alta", () => {
    const r = agregar(hon(P4, 4));
    expect(color(r.score)).toBe(4); expect(r.confianza).toBe("alta");
  });
  it("CA-03 pocos vecinos honestos 'leve': color 1 pero confianza baja", () => {
    const r = agregar(hon(P1, 2));
    expect(color(r.score)).toBe(1); expect(r.confianza).toBe("baja");
  });
  it("CA-04 solo 2 reportes críticos: sin datos suficientes", () => {
    expect(agregar(hon([4, 4], 1)).confianza).toBe("sin_datos");
  });
  it("CA-05 inflar con 30 reportes de UNA red /24: no mueve el color ni la confianza", () => {
    const r = agregar([...hon(P1, 2), ...falsos(30, 4, () => "bot24", 0, 0.05, { segForm: 1 })]);
    expect(color(r.score)).toBe(1); expect(r.confianza).toBe("baja"); expect(r.nEff).toBeLessThan(5);
  });
  it("CA-06 desinflar con 40 reportes de UNA red /24: el color no cambia", () => {
    const r = agregar([...hon(P3, 4), ...falsos(40, 1, () => "bot24", 0, 0.05)]);
    expect(color(r.score)).toBe(3); expect(r.nEff).toBeLessThan(13.5);
  });
  it("CA-07 ráfaga distribuida detectada (en revisión): confianza baja, no 'alta'", () => {
    const r = agregar([...hon(P1, 2), ...falsos(30, 4, (i) => "b" + i, 0, 0.05, { estado: "en_revision" })], { alertaAbierta: true });
    expect(r.confianza).toBe("baja");
  });
  it("CA-07b ... y al confirmarla un moderador (oculto) la colonia vuelve a su valor honesto", () => {
    const r = agregar([...hon(P1, 2), ...falsos(30, 4, (i) => "b" + i, 0, 0.05, { estado: "oculto" })]);
    expect(color(r.score)).toBe(1);
  });
  it("CA-08 LÍMITE CONOCIDO: ráfaga distribuida sofisticada no detectada sí mueve el color, pero como mucho a 'media' (un solo día)", () => {
    const r = agregar([...hon(P1, 2), ...falsos(30, 4, (i) => "b" + i, 0, 0.05)]);
    expect(color(r.score)).toBe(4); expect(r.confianza).not.toBe("alta");
  });
  it("CA-09 colonia vacía + 30 redes distintas en UN día: confianza baja (falta corroboración)", () => {
    const r = agregar(falsos(30, 4, (i) => "b" + i, 0, 0.05));
    expect(r.confianza).toBe("baja");
  });
  it("CA-10 LÍMITE CONOCIDO: 30 redes distintas sostenidas 3 días son indistinguibles de vecinos reales", () => {
    const r = agregar([...falsos(10, 4, (i) => "a" + i, 0, 0.9), ...falsos(10, 4, (i) => "c" + i, 1, 1.9), ...falsos(10, 4, (i) => "d" + i, 2, 2.9)]);
    expect(color(r.score)).toBe(4); expect(r.confianza).toBe("alta");
  });
  it("CA-11 ataque lento (1 dispositivo/día, 14 días) sobre colonia tranquila: confianza nunca 'alta' y el score sube < 1.2", () => {
    const lento = Array.from({ length: 14 }, (_, i): Reporte => ({ gravedad: 4, edadDias: i + 0.3, red: "lento" + i, redSem: "lento_w" + sem(i + 0.3), dia: dia(i + 0.3) }));
    const base = agregar(hon(P1, 2)).score!;
    const r = agregar([...hon(P1, 2), ...lento]);
    expect(r.confianza).not.toBe("alta"); expect(r.score! - base).toBeLessThan(1.2);
  });
  it("CA-12 desinflar distribuido detectado: confianza baja; tras ocultarlo vuelve a 'crítica'", () => {
    const f = falsos(20, 1, (i) => "b" + i, 0, 0.1, { estado: "en_revision" });
    expect(agregar([...hon(P4, 4), ...f], { alertaAbierta: true }).confianza).toBe("baja");
    expect(color(agregar([...hon(P4, 4), ...f.map((x) => ({ ...x, estado: "oculto" as const }))]).score)).toBe(4);
  });
  it("CA-13 reportes de más de 14 días no cuentan", () => {
    expect(agregar(hon(P3, 1).map((r) => ({ ...r, edadDias: r.edadDias + 15 }))).confianza).toBe("sin_datos");
  });
  it("CA-14 pico orgánico (25 vecinos reales en 5 h): se pinta, pero con confianza baja hasta que haya 2.º día", () => {
    const r = agregar(falsos(25, 3, (i) => "o" + i, 0, 0.2).map((x, i) => ({ ...x, gravedad: (i % 3 === 0 ? 4 : 3) as 3 | 4 })));
    expect(color(r.score)).toBe(3); expect(r.confianza).toBe("baja");
  });
  it("CA-15 ... y sube a 'media' cuando otros vecinos confirman al día siguiente", () => {
    const a = falsos(25, 3, (i) => "o" + i, 1, 1.2).map((x, i) => ({ ...x, gravedad: (i % 3 === 0 ? 4 : 3) as 3 | 4 }));
    const r = agregar([...a, ...falsos(15, 3, (i) => "p" + i, 0, 0.8)]);
    expect(r.confianza).toBe("media");
  });
});
```

### B.8 `web/lib/antiabuso.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  diaLocal, emitirToken, identidades, ipCliente, limpiarComentario, origenPermitido, prefijos, redSemanal, uaFamilia, verificarToken,
} from "./antiabuso";

const H = (o: Record<string, string>) => new Headers(o);
const PERMITIDOS = ["agua.example.mx"];

describe("IP del cliente", () => {
  it("cuenta desde la derecha: lo que escribe el cliente a la izquierda no se usa", () => {
    expect(ipCliente(H({ "x-forwarded-for": "6.6.6.6, 201.1.2.3" }), 1)).toBe("201.1.2.3");
    expect(ipCliente(H({ "x-forwarded-for": "6.6.6.6, 201.1.2.3, 10.0.0.1" }), 2)).toBe("201.1.2.3");
  });
  it("sin cabecera o con basura → null", () => {
    expect(ipCliente(H({}), 1)).toBeNull();
    expect(ipCliente(H({ "x-forwarded-for": "basura" }), 1)).toBeNull();
  });
});

describe("prefijos de red", () => {
  it("IPv4: huella por IP completa, red por /24", () => {
    expect(prefijos("201.1.2.3")).toEqual({ individual: "v4:201.1.2.3", red: "v4/24:201.1.2" });
  });
  it("IPv6: mismo /64 = mismo dispositivo (direcciones temporales), mismo /48 = misma red", () => {
    const a = prefijos("2806:2f0:1234:5678:aaaa:bbbb:cccc:dddd"), b = prefijos("2806:2f0:1234:5678:1111:2222:3333:4444"), c = prefijos("2806:2f0:1234:9999::1");
    expect(a.individual).toBe(b.individual);
    expect(a.individual).not.toBe(c.individual);
    expect(a.red).toBe(c.red);
  });
  it("::ffff:a.b.c.d se trata como IPv4", () => expect(prefijos("::ffff:201.1.2.3")).toEqual(prefijos("201.1.2.3")));
});

describe("identidades anónimas", () => {
  const SAL = "0123456789abcdef0123456789abcdef";
  it("deterministas dentro del día, distintas entre días y entre redes", () => {
    process.env.HASH_SALT = SAL;
    const i1 = identidades("201.1.2.3", "UA-A", "2026-10-08"), i2 = identidades("201.1.2.3", "UA-A", "2026-10-08");
    const i3 = identidades("201.1.2.3", "UA-A", "2026-10-09"), i4 = identidades("201.1.2.99", "UA-B", "2026-10-08");
    expect(i1.huella).toBe(i2.huella);
    expect(i1.huella).not.toBe(i3.huella);
    expect(i1.red).not.toBe(i3.red);
    expect(i1.huella).not.toBe(i4.huella);
    expect(i1.red).toBe(i4.red); // mismo /24 el mismo día
  });
  it("la red semanal coincide en la misma semana ISO y cambia a la siguiente", () => {
    process.env.HASH_SALT = SAL;
    expect(redSemanal("201.1.2.3", "2026-10-08")).toBe(redSemanal("201.1.2.77", "2026-10-11"));
    expect(redSemanal("201.1.2.3", "2026-10-08")).not.toBe(redSemanal("201.1.2.3", "2026-10-12"));
  });
  it("en producción exige HASH_SALT largo", () => {
    const antes = { n: process.env.NODE_ENV, s: process.env.HASH_SALT };
    (process.env as Record<string, string | undefined>).NODE_ENV = "production"; delete process.env.HASH_SALT;
    try { expect(() => identidades("1.1.1.1", "x", "2026-10-08")).toThrow(/HASH_SALT/); }
    finally { (process.env as Record<string, string | undefined>).NODE_ENV = antes.n; process.env.HASH_SALT = antes.s; }
  });
});

describe("token de formulario", () => {
  it("acepta entre 2 s y 6 h; rechaza muy rápido, caducado, alterado o ausente", () => {
    process.env.HASH_SALT = "0123456789abcdef0123456789abcdef";
    const t = emitirToken(1_000_000);
    expect(verificarToken(t, 1_005_000)).toEqual({ ok: true, segundos: 5 });
    expect(verificarToken(t, 1_000_500)).toEqual({ ok: false, motivo: "muy_rapido" });
    expect(verificarToken(t, 1_000_000 + 7 * 3600_000)).toEqual({ ok: false, motivo: "caducado" });
    expect(verificarToken(t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"), 1_005_000).ok).toBe(false);
    expect(verificarToken(undefined)).toEqual({ ok: false, motivo: "ausente" });
  });
});

describe("origen", () => {
  it("same-origin pasa; cross-site, Origin ajeno u 'null' no; sin cabeceras = 'sin_cabeceras'", () => {
    expect(origenPermitido(H({ "sec-fetch-site": "same-origin", origin: "https://agua.example.mx" }), PERMITIDOS)).toBe("web");
    expect(origenPermitido(H({ "sec-fetch-site": "cross-site", origin: "https://malo.com" }), PERMITIDOS)).toBeNull();
    expect(origenPermitido(H({ origin: "https://malo.com" }), PERMITIDOS)).toBeNull();
    expect(origenPermitido(H({ origin: "null" }), PERMITIDOS)).toBeNull();
    expect(origenPermitido(H({}), PERMITIDOS)).toBe("sin_cabeceras");
  });
});

describe("comentarios y utilidades", () => {
  it("redacta teléfonos, correos y enlaces", () => {
    expect(limpiarComentario("llamen al 33 1234 5678 o a juan@mail.com http://x.co").texto).toBe("llamen al [teléfono] o a [correo] [enlace]");
    expect(limpiarComentario("Agua café desde ayer").redactado).toBe(false);
  });
  it("el día cambia a medianoche de Guadalajara, no a las 18:00", () => {
    expect(diaLocal(new Date("2026-10-09T02:00:00Z"))).toBe("2026-10-08");
  });
  it("familia de navegador gruesa", () => {
    expect(uaFamilia("Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari/537.36")).toBe("chrome-android");
  });
});
```

### B.9 `web/lib/antiabuso.db.test.ts`

```ts
// Pruebas de integración contra Postgres. Se saltan solas si no hay TEST_DATABASE_URL.
// Preparar:  docker exec agua-zmg-db-1 psql -U agua -d postgres -c "CREATE DATABASE agua_test"
//            DATABASE_URL=postgres://agua:agua@localhost:5433/agua_test pnpm migrate
//            TEST_DATABASE_URL=postgres://agua:agua@localhost:5433/agua_test pnpm vitest run lib/antiabuso.db.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { agregar, type Reporte } from "./agregacion";
import { guardarReporte, type NuevoReporte } from "./ingesta";
import { contar, ficha } from "./tasa";

const URL = process.env.TEST_DATABASE_URL;
const pool = new Pool({ connectionString: URL, max: 20 });
afterAll(() => pool.end());

const colonia = (id: number, x = 0, y = 0) =>
  pool.query(`INSERT INTO colonias (id, nombre, geom, demo) VALUES ($1, 'c', ST_Multi(ST_MakeEnvelope($2::float8,$3::float8,$2::float8+1,$3::float8+1,4326)), true)`, [id, x, y]);
let seq = 0;
const rep = (col: number, o: Partial<{ g: number; h: string; creado: string; red: string; redSem: string; ua: string; seg: number; com: string; estado: string; dias: number }> = {}) =>
  pool.query(
    `INSERT INTO reportes (colonia_id, gravedad, huella, dia, creado_en, red, red_sem, ua_familia, seg_formulario, comentario_hash, estado)
     VALUES ($1,$2,$3, current_date - $4::int, now() - $5::interval, $6,$7,$8,$9,$10,$11)`,
    [col, o.g ?? 3, o.h ?? "h" + seq++, o.dias ?? 0, o.creado ?? "0 minutes", o.red ?? "r" + seq, o.redSem ?? "s" + seq, o.ua ?? "chrome-android", o.seg ?? 25, o.com ?? null, o.estado ?? "visible"]);
const nuevo = (colonia_id: number, huella: string): NuevoReporte => ({
  colonia_id, gravedad: 4, sintomas: [], comentario: null, huella, red: "r", redSem: "s", uaFamilia: "chrome-android",
  comentarioHash: null, segFormulario: 20, canal: "web", dia: new Date().toISOString().slice(0, 10), estado: "visible",
});

describe.skipIf(!URL)("anti-abuso en Postgres", () => {
  let base = 0; // la bitácora es solo de agregado: cada prueba mira únicamente lo que se agregó después de empezar
  beforeEach(async () => {
    await pool.query("TRUNCATE reportes, colonias, alertas_abuso, limites_tasa, cubetas_tasa RESTART IDENTITY CASCADE");
    base = Number((await pool.query("SELECT coalesce(max(id), 0) m FROM moderacion_bitacora")).rows[0].m);
  });

  describe("límites de tasa", () => {
    it("RL-01 ventana fija: 60 peticiones paralelas con tope 10 → exactamente 10 pasan", async () => {
      const ns = await Promise.all(Array.from({ length: 60 }, () => contar(pool, "t:h", 10, 3600)));
      expect(ns.filter((n) => n <= 10).length).toBe(10);
      expect((await pool.query("SELECT n FROM limites_tasa WHERE clave='t:h'")).rows[0].n).toBe(11); // deja de escribir en tope+1
    });
    it("RL-02 cubeta de fichas: capacidad 5, 20 paralelas → 5 pasan", async () => {
      const r = await Promise.all(Array.from({ length: 20 }, () => ficha(pool, "t:b", 5, 1)));
      expect(r.filter(Boolean).length).toBe(5);
    });
  });

  describe("ingesta", () => {
    it("IN-01 cupo de 3 colonias/día sin carreras (9 peticiones paralelas)", async () => {
      for (let i = 1; i <= 9; i++) await colonia(i);
      const r = await Promise.all(Array.from({ length: 9 }, (_, i) => guardarReporte(pool, nuevo(i + 1, "H1"))));
      expect(r.filter((x) => x === "creado").length).toBe(3);
      expect(r.filter((x) => x === "limite_colonias").length).toBe(6);
    });
    it("IN-02 reenviar de inmediato no cambia nada; IN-03 reenviar sobre un reporte oculto no lo revive", async () => {
      await colonia(1);
      expect(await guardarReporte(pool, nuevo(1, "H1"))).toBe("creado");
      expect(await guardarReporte(pool, { ...nuevo(1, "H1"), gravedad: 1 })).toBe("sin_cambios");
      await pool.query("UPDATE reportes SET estado='oculto', creado_en = now() - interval '1 hour'");
      await guardarReporte(pool, { ...nuevo(1, "H1"), gravedad: 1 });
      expect((await pool.query("SELECT gravedad, estado FROM reportes")).rows[0]).toEqual({ gravedad: 4, estado: "oculto" });
    });
    it("IN-04 colonia inexistente", async () => expect(await guardarReporte(pool, nuevo(999, "H2"))).toBe("colonia_inexistente"));
  });

  describe("detección de ráfagas", () => {
    const UAS = ["chrome-android", "safari-ios", "chrome-windows", "firefox-windows", "samsung-android"];
    const sospechosa = async (c: number) => (await pool.query("SELECT sospechosa, pico, senales FROM evaluar_rafaga($1)", [c])).rows[0];
    beforeEach(async () => { for (let c = 1; c <= 4; c++) await colonia(c); });

    it("BR-01 pico orgánico (20 redes, UAs variadas, tiempos al azar, formularios de 15-60 s): pico sí, sospechosa NO", async () => {
      for (let i = 0; i < 20; i++) await rep(1, { red: "o" + i, ua: UAS[i % 5], seg: 15 + ((i * 7) % 45), creado: `${(i * 37) % 55 + 1} minutes`, com: "c" + i });
      const r = await sospechosa(1);
      expect(r.pico).toBe(true); expect(r.sospechosa).toBe(false);
    });
    it("BR-02 una sola red, UA rotando, ritmo fijo, formularios de 1-2 s: sospechosa", async () => {
      for (let i = 0; i < 30; i++) await rep(2, { red: "bot24", ua: "ua" + i, seg: 1 + (i % 2), creado: `${55 - i * 1.5} minutes` });
      const r = await sospechosa(2);
      expect(r.sospechosa).toBe(true); expect(r.senales).toEqual(expect.arrayContaining(["pocas_redes", "ritmo_regular", "formulario_rapido"]));
    });
    it("BR-03 botnet distribuida con mismo UA, ritmo fijo y comentario copiado: sospechosa", async () => {
      for (let i = 0; i < 30; i++) await rep(3, { red: "n" + i, ua: "chrome-windows", seg: 2, creado: `${58 - i * 1.9} minutes`, com: "copiado" });
      expect((await sospechosa(3)).sospechosa).toBe(true);
    });
    it("BR-04 LÍMITE CONOCIDO: atacante sofisticado (redes, UAs y tiempos humanos) NO se detecta", async () => {
      for (let i = 0; i < 30; i++) await rep(4, { red: "s" + i, ua: UAS[(i * 3) % 5], seg: 12 + ((i * 11) % 40), creado: `${(i * 53) % 58 + 1} minutes` });
      const r = await sospechosa(4);
      expect(r.pico).toBe(true); expect(r.sospechosa).toBe(false);
    });
    it("BR-06 tráfico normal (3 reportes/h) no es pico; una familia (9 desde la misma red, UAs variadas) no es sospechosa", async () => {
      for (let i = 0; i < 3; i++) await rep(1, { red: "p" + i, ua: UAS[i], creado: `${10 + i * 15} minutes` });
      expect((await sospechosa(1)).pico).toBe(false);
      const minutos = [2, 3, 9, 17, 22, 31, 33, 47, 55]; // irregulares, como una familia real
      for (let i = 0; i < 9; i++) await rep(2, { red: "casa", ua: UAS[i % 5], seg: 20, creado: `${minutos[i]} minutes` });
      const f = await sospechosa(2);
      expect(f.sospechosa).toBe(false); expect(f.senales).toEqual(["pocas_redes"]);
    });
    it("BR-05 aplicar_rafaga degrada (no oculta), abre UNA alerta y registra en bitácora", async () => {
      for (let i = 0; i < 30; i++) await rep(2, { red: "bot24", ua: "ua" + i, seg: 1, creado: `${55 - i * 1.5} minutes` });
      expect((await pool.query("SELECT aplicar_rafaga(2) a")).rows[0].a).toBe(true);
      await pool.query("SELECT aplicar_rafaga(2)"); // idempotente: no duplica alerta
      expect((await pool.query("SELECT count(*)::int n FROM alertas_abuso WHERE estado='abierta'")).rows[0].n).toBe(1);
      expect((await pool.query("SELECT count(*)::int n FROM reportes WHERE estado='en_revision'")).rows[0].n).toBe(30);
      expect((await pool.query("SELECT count(*)::int n FROM reportes WHERE estado='oculto'")).rows[0].n).toBe(0);
      expect((await pool.query("SELECT actor, accion FROM moderacion_bitacora WHERE id > $1", [base])).rows).toEqual([{ actor: "sistema", accion: "degradar" }]);
    });
  });

  describe("moderación y bitácora", () => {
    beforeEach(async () => { await colonia(1); for (let i = 0; i < 25; i++) await rep(1); });
    const ids = async (n = 25) => (await pool.query("SELECT array_agg(id) a FROM (SELECT id FROM reportes ORDER BY id LIMIT $1) t", [n])).rows[0].a as number[];

    it("MO-01 el sistema no puede ocultar con reglas de heurística, y un moderador sí", async () => {
      await expect(pool.query("SELECT moderar($1,'ocultar','sistema','intento del sistema por ráfaga','rafaga_sospechosa')", [await ids()])).rejects.toThrow(/sistema no puede/);
      expect((await pool.query("SELECT moderar($1,'ocultar','mod:ana','misma red, formulario de 1 s, ritmo fijo',NULL) n", [await ids(5)])).rows[0].n).toBe(5);
    });
    it("MO-02 ocultar >20 reportes exige humano", async () => {
      await expect(pool.query("SELECT moderar($1,'ocultar','sistema','masivo sin humano en la regla','comentario_con_datos_personales')", [await ids()])).rejects.toThrow(/humano/);
    });
    it("MO-03 el motivo es obligatorio (>= 10 caracteres) y un fallo no deja cambios a medias", async () => {
      await expect(pool.query("SELECT moderar($1,'ocultar','mod:ana','x',NULL)", [await ids(3)])).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int n FROM reportes WHERE estado='oculto'")).rows[0].n).toBe(0);
    });
    it("MO-04 restaurar registra el estado anterior; repetirlo no cambia filas ni bitácora", async () => {
      await pool.query("SELECT moderar($1,'ocultar','mod:ana','confirmado como ráfaga de una sola red',NULL)", [await ids(5)]);
      expect((await pool.query("SELECT moderar($1,'restaurar','mod:ana','revisión: eran vecinos reales',NULL) n", [await ids(5)])).rows[0].n).toBe(5);
      expect((await pool.query("SELECT moderar($1,'restaurar','mod:ana','repetido sin filas por cambiar',NULL) n", [await ids(5)])).rows[0].n).toBe(0);
      const b = (await pool.query("SELECT accion, metricas->'estado_antes'->>(reporte_ids[1]::text) antes FROM moderacion_bitacora WHERE id > $1 ORDER BY id", [base])).rows;
      expect(b).toEqual([{ accion: "ocultar", antes: "visible" }, { accion: "restaurar", antes: "oculto" }]);
    });
    it("MO-05 la bitácora no se puede editar, borrar ni truncar", async () => {
      await pool.query("SELECT moderar($1,'degradar','sistema','ráfaga sospechosa: pocas_redes','rafaga_sospechosa')", [await ids(3)]);
      await expect(pool.query("UPDATE moderacion_bitacora SET motivo='manipulado xxxxxxxx'")).rejects.toThrow(/solo de agregado/);
      await expect(pool.query("DELETE FROM moderacion_bitacora")).rejects.toThrow(/solo de agregado/);
      await expect(pool.query("TRUNCATE moderacion_bitacora")).rejects.toThrow(/solo de agregado/);
    });
    it("MO-06 expirar_alertas solo restaura si hubo corroboración independiente posterior", async () => {
      await pool.query("TRUNCATE reportes, alertas_abuso RESTART IDENTITY CASCADE");
      await colonia(2);
      for (const c of [1, 2]) {
        for (let i = 0; i < 10; i++) await rep(c, { estado: "en_revision", creado: "75 hours" });
        await pool.query(`INSERT INTO alertas_abuso (colonia_id, regla, metricas, creado_en) VALUES ($1,'rafaga_sospechosa','{}', now() - interval '72 hours')`, [c]);
      }
      for (let i = 0; i < 7; i++) await rep(1, { creado: "20 hours" }); // solo la colonia 1 recibe confirmación
      expect((await pool.query("SELECT expirar_alertas() n")).rows[0].n).toBe(1);
      expect((await pool.query("SELECT count(*)::int n FROM reportes WHERE colonia_id=2 AND estado='en_revision'")).rows[0].n).toBe(10);
      expect((await pool.query("SELECT count(*)::int n FROM reportes WHERE colonia_id=1 AND estado='en_revision'")).rows[0].n).toBe(0);
    });
  });

  describe("agregación en SQL = oráculo en TypeScript", () => {
    it("SC-01 los mismos reportes dan el mismo score y confianza", async () => {
      await colonia(1);
      const rs: Reporte[] = [];
      const patron = [3, 3, 2, 3, 4, 3, 3, 2, 3, 4, 3, 3];
      patron.forEach((g, i) => { const e = ((i + 0.5) * 4) / 12; rs.push({ gravedad: g as 1 | 2 | 3 | 4, edadDias: e, red: "h" + i, redSem: "s" + i, dia: String(Math.floor(e)) }); });
      for (const r of rs) await rep(1, { g: r.gravedad, creado: `${r.edadDias * 24} hours`, red: r.red, redSem: r.redSem, dias: Math.floor(r.edadDias) });
      const sql = (await pool.query("SELECT score, confianza FROM scores_robustos WHERE id=1")).rows[0];
      // con una sola colonia el prior global de SQL es su propia media recortada (~2.9) acotada a 2.5
      const ts = agregar(rs, { prior: 2.5 });
      expect(Number(sql.score)).toBeCloseTo(ts.score!, 3);
      expect(sql.confianza).toBe(ts.confianza);
    });
    it("SC-02 reportes ocultos no cuentan; sin datos suficientes no hay fila publicable", async () => {
      await colonia(1);
      for (let i = 0; i < 5; i++) await rep(1, { g: 4, estado: "oculto" });
      expect((await pool.query("SELECT count(*)::int n FROM scores_robustos WHERE id=1")).rows[0].n).toBe(0);
    });
  });

  describe("discordancia espacial", () => {
    it("ES-01 una colonia 'crítica' rodeada de 8 colonias 'leves' confiables se manda a revisión", async () => {
      for (let i = 0; i < 9; i++) await colonia(i + 1, i % 3, Math.floor(i / 3));
      for (let c = 1; c <= 9; c++) for (let i = 0; i < 12; i++) await rep(c, { g: c === 5 ? 4 : 1, creado: `${(i + 0.5) * 8} hours`, dias: Math.floor(((i + 0.5) * 8) / 24) });
      await pool.query("REFRESH MATERIALIZED VIEW scores_vigentes");
      const d = (await pool.query("SELECT id, n_vecinas FROM discordancia_espacial")).rows;
      expect(d).toEqual([{ id: 5, n_vecinas: "8" }]);
    });
  });

  describe("retención", () => {
    it("PR-01 a los 14 días se borran huella, red y UA; la gravedad y la colonia se conservan", async () => {
      await colonia(1);
      await rep(1, { creado: "20 days", dias: 20, h: "HUELLA-VIEJA" }); await rep(1, { h: "HUELLA-NUEVA" });
      await pool.query("UPDATE reportes SET comentario='x' WHERE huella IS NOT NULL OR true");
      const r = (await pool.query("SELECT aplicar_retencion() r")).rows[0].r;
      expect(r.anonimizados).toBe(1);
      const filas = (await pool.query("SELECT huella, red, ua_familia, gravedad FROM reportes ORDER BY id")).rows;
      expect(filas[0]).toEqual({ huella: null, red: null, ua_familia: null, gravedad: 3 });
      expect(filas[1].huella).toBe("HUELLA-NUEVA");
    });
  });
});
```
