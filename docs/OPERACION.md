# Operación de Agua ZMG

Manual para quien mantiene el sitio en producción: qué vigilar, cómo respaldar, qué hacer ante abuso y ante un pico de tráfico. Para instalar por primera vez, ver [DEPLOY.md](DEPLOY.md). Para decisiones que no son técnicas, ver [DECISIONES-PENDIENTES.md](DECISIONES-PENDIENTES.md).

Convención: lo marcado **(probado)** se ejecutó al preparar este documento; lo marcado **(sin probar)** es una receta razonada que hay que ensayar antes de depender de ella. Los precios y límites de terceros están en [`research/despliegue.md`](research/despliegue.md) con su fuente; revísalos el día que contrates.

---

## 1. Qué hay en producción

| Pieza | Qué hace | Si falla |
|---|---|---|
| App Next.js (Vercel o contenedor `web`) | Páginas, mapa, `POST /api/reportes`, `/admin`, API pública | El mapa no carga o no se pueden enviar reportes |
| PostgreSQL + PostGIS (Neon o contenedor `db`) | Colonias, reportes, mediciones externas, bitácora | La app responde 503 en `/api/salud`; el CDN sigue sirviendo lo último (`stale-if-error`) |
| Mapa base (OpenFreeMap) | Calles y fondo | El mapa carga sin calles; las colonias se siguen viendo (el fondo es de un tercero, **sin SLA**) |
| CDN (Vercel Edge o Cloudflare) | Absorbe la lectura (geometría, scores, API pública) | El origen recibe todo el tráfico |

Casi todo el tráfico es lectura cacheable. Lo único que siempre llega al origen es `POST /api/reportes` y `/admin`.

---

## 2. Monitoreo

### 2.1 Disponibilidad externa

Usa un servicio externo (no el mismo proveedor que aloja el sitio). Opciones gratuitas según `despliegue.md` §5: UptimeRobot (50 monitores, intervalo de 5 min) o Better Stack (10 monitores, hasta 30 s). Revisa en su página los términos para un proyecto cívico antes de depender de ellos.

Monitores recomendados:

| URL | Qué verifica | Condición de alerta |
|---|---|---|
| `/api/salud` | App y base viva | HTTP distinto de 200, o el cuerpo no contiene `"db":true` |
| `/` | La página carga | HTTP distinto de 200 |
| `/api/colonias/scores` | La agregación funciona | HTTP distinto de 200 |
| `/api/colonias/geometria` | La geometría se sirve | HTTP distinto de 200 |
| `/api/v1/resumen.csv` | La API pública responde | HTTP distinto de 200 |

`/api/salud` verifica la base de verdad (`SELECT 1`, tope de 3 s) y responde 503 si no contesta, así que sirve tanto para monitores como para el `HEALTHCHECK` del contenedor. **(probado: 200 con base viva, 503 con base inalcanzable)**

Alertas: a **al menos dos personas** por canales distintos (correo y mensajería). Que el aviso no dependa de una sola persona.

### 2.2 Verificar que el CDN absorbe la lectura

Después de cada despliegue y antes de un evento mediático:

```bash
curl -sI https://TU-DOMINIO/api/colonias/geometria | grep -i -E 'cache-control|x-vercel-cache|cf-cache-status|age'
```

Repite dos veces: la segunda debe mostrar `HIT` (Vercel: `x-vercel-cache: HIT`; Cloudflare: `cf-cache-status: HIT`). Si siempre es `MISS`, el origen está recibiendo todo el tráfico: revisa las reglas de caché (en Cloudflare hay que crear una *Cache Rule* para `/api/colonias/*` y `/api/v1/*`, porque no cachea JSON por defecto; `despliegue.md` §2.4).

### 2.3 Errores y bitácoras

- La app escribe errores del servidor a la salida estándar (`console.error`). Contenedor: `docker compose -f docker-compose.prod.yml logs -f web`. Vercel: pestaña *Logs* (la retención es corta: 1 hora en Hobby, 1 día en Pro según `despliegue.md`).
- No hay un servicio de errores (Sentry u otro) integrado en el código. Sentry tiene plan gratuito (`despliegue.md` §5), pero agregarlo implica una dependencia nueva y revisar qué datos envía; es una decisión pendiente, no un olvido.
- Los proveedores (Vercel, Cloudflare, el VPS) ven la IP del visitante en sus propios registros. Eso debe decirse en el aviso de privacidad (ver `despliegue.md` §6).

### 2.4 Panel de abuso

`/admin` (requiere `ADMIN_TOKEN`) muestra la cola de reportes en revisión y las alertas de ráfaga. Revísalo a diario durante la crisis y de inmediato si el monitor avisa de picos. Ver §5 y §6.

---

## 3. Respaldos

Un respaldo que no se ha restaurado no cuenta. Haz el simulacro **antes** del lanzamiento y luego cada mes.

### 3.1 Qué respaldar

| Qué | Dónde está | Cómo |
|---|---|---|
| Base de datos completa (reportes, colonias, mediciones, bitácora de moderación) | PostgreSQL | `pg_dump` lógico nocturno, **cifrado**, a un destino fuera del proveedor de la base |
| Resumen público | `/api/v1/resumen.csv` | Descarga diaria; sirve de respaldo de lo publicable y como dato abierto. No contiene huellas |
| Secretos (`HASH_SALT`, `ADMIN_TOKEN`, contraseñas) | Gestor de contraseñas | Con acceso de al menos dos personas |
| Datos fuente (`data/*.geojson`, `data/oficial/*.csv`) | Repositorio / copia externa | Son la entrada de los scripts de importación. `data/raw/` (cientos de MB) no va al repo: conserva los `.zip` originales aparte |

Importante: la base contiene identificadores HMAC (`huella`, `red_hash`, `red_sem`) y comentarios, que se conservan (§4). **Cifra los respaldos** (p. ej. con `age` o `gpg`) y no los subas a un lugar público.

**Estado en producción (2026-10-21):** no hay respaldo propio programado; solo existe el historial de restauración de Neon. El aviso de privacidad v0.2 lo dice así. Si se programa un respaldo, actualiza el apartado «Cuánto tiempo» de `/privacidad`.

### 3.2 Respaldo y restauración con `pg_dump` **(probado en local con Docker)**

Respaldar (contenedor `db` del compose de producción):

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U agua -Fc agua_zmg > agua_zmg-$(date +%F).dump
```

Con una base administrada (Neon u otra) usa la cadena **directa**, sin `-pooler`:

```bash
pg_dump "$DATABASE_URL_DIRECTA" -Fc -f agua_zmg-$(date +%F).dump
```

Restaurar en una base nueva (siempre prueba primero en una base de ensayo):

```bash
createdb agua_restauracion          # o CREATE DATABASE agua_restauracion;
pg_restore -d agua_restauracion --no-owner agua_zmg-2026-10-08.dump
psql agua_restauracion -c "select (select count(*) from colonias) as colonias, (select count(*) from reportes) as reportes"
```

La restauración requiere que el servidor permita `CREATE EXTENSION postgis` (el volcado la incluye). Verificado con `postgis/postgis:16-3.4`: tras restaurar, los conteos de colonias y reportes coincidieron con el origen.

### 3.3 Programarlo **(sin probar la parte de subida)**

VPS (cron del anfitrión, diario a las 03:30):

```cron
30 3 * * * cd /opt/agua-zmg && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U agua -Fc agua_zmg | age -r AGE_PUBLIC_KEY > /var/backups/agua/agua_zmg-$(date +\%F).dump.age && find /var/backups/agua -mtime +14 -delete
```

**Retención de respaldos:** los respaldos contienen huellas y comentarios. El `find -mtime +14 -delete` de arriba los expira a los 14 días; usa la misma regla de ciclo de vida (*lifecycle rule*) en el bucket externo. Cualquiera que sea el plazo, publícalo en `/privacidad`.

Luego copia `/var/backups/agua` a un almacenamiento externo (Cloudflare R2 o Backblaze B2 tienen cuota gratuita según `despliegue.md` §5; `rclone` es una herramienta común para eso). Conserva la clave privada de `age` fuera del servidor.

Vercel + Neon: Neon conserva historial para restaurar (6 h en el plan gratis; hasta 7 días en Launch, según `despliegue.md`), pero eso **no** reemplaza un respaldo propio. Programa un `pg_dump` con una tarea programada (por ejemplo, una GitHub Action con *schedule* que use la cadena directa guardada como *secret* y suba el volcado cifrado a R2/B2). Esa tarea no está incluida en el repositorio: es una decisión de dónde guardar secretos.

### 3.4 Simulacro mensual

1. Descarga el último respaldo.
2. Restáuralo en una base de ensayo (§3.2).
3. Apunta una copia local de la app a esa base (`DATABASE_URL=… pnpm dev`) y revisa que el mapa y `/api/salud` funcionan.
4. Anota fecha, duración y problemas. Borra la base de ensayo.

---

## 4. Retención de datos (`pnpm purge`)

**Política vigente (decisión del 2026-10-21, aviso de privacidad v0.2):** se conserva todo (reportes, comentarios e identificadores) como registro histórico de la comunidad. `pnpm purge` **no** está programado a propósito, y el servicio `retencion` de `docker-compose.prod.yml` solo arranca con `--profile retencion`. Lo que sigue describe la herramienta por si la política cambia; antes de programarla, cambia el aviso de privacidad.

Principio de diseño (`research/anti-abuso.md` §9): la IP y el *User-Agent* completo **nunca** se guardan. Lo que se guarda por reporte son identificadores HMAC (huella diaria, red diaria, red semanal, familia del navegador, hash del comentario) y, si el vecino lo escribió, un comentario ya depurado de teléfonos, correos y enlaces. Esos identificadores solo sirven para limitar abuso dentro de la ventana de cálculo (14 días).

`web/scripts/purge.ts` (`pnpm purge`, ya definido en `web/package.json`; sin `.env.local` ejecuta `pnpm exec tsx scripts/purge.ts` con `DATABASE_URL` en el entorno) hace la retención. Por defecto, a los **30 días** (`--dias=N`, mínimo 14 para no perder evidencia que aún cuenta en los scores):

- pone en `NULL` `huella`, `red_hash`, `red_sem`, `ua_familia` y `comentario_hash`, y marca `anonimizado_en`;
- pone en `NULL` los comentarios (texto libre: el riesgo de datos personales no desaparece con el hash);
- borra `rate_limits` de más de 2 días.

El reporte conserva colonia, gravedad y síntomas. Es idempotente y trabaja por lotes. Prueba primero con `--dry-run` (solo cuenta, no cambia nada). Si se adopta, debe correr **todos los días**: si no corre, la retención no está activa y el aviso de privacidad **no debe prometerla**.

Programación, si la política cambia **(sin probar)**:

| Despliegue | Cómo |
|---|---|
| VPS con compose | **Ya incluido, apagado**: el servicio `retencion` de `docker-compose.prod.yml` corre `purge.ts` cada 24 h si se levanta con `--profile retencion` (revisa `docker compose logs retencion`; sin probar en un VPS real). Alternativa, cron del anfitrión: `15 4 * * * cd /opt/agua-zmg && docker compose -f docker-compose.prod.yml run --rm migrate pnpm exec tsx scripts/purge.ts` (la imagen `migrate` incluye `scripts/` y ya recibe `DATABASE_URL`) |
| Vercel + Neon | GitHub Action con *schedule* diario que ejecute `pnpm exec tsx scripts/purge.ts` con `DATABASE_URL` como *secret*. Alternativa: *Cron Jobs* de Vercel apuntando a un endpoint protegido (hoy no existe: habría que crearlo) |

Comprobación mensual (solo si la retención está programada): confirma que no quedan identificadores viejos:

```sql
SELECT count(*) FROM reportes
WHERE creado_en < now() - interval '31 days' AND anonimizado_en IS NULL;   -- debe ser 0
```

Si la consulta devuelve filas, la retención no está corriendo: alerta al responsable del proyecto.

---

## 5. Runbook de abuso

Contexto: hay incentivos reales para exagerar o minimizar el mapa (apoyos escasos, reputación de zonas, disputa política). El diseño asume que **alguien lo intentará** y lo documenta en [`research/anti-abuso.md`](research/anti-abuso.md). Límite declarado: quien aparente ser muchos vecinos distintos (muchas redes, tiempos humanos, varios días) **no se puede distinguir** de vecinos reales con estos controles. Por eso la respuesta es, sobre todo, humana y transparente.

### 5.1 Señales de alerta

- Una colonia cambia de color de golpe sin que haya noticias.
- La cola de revisión en `/admin` crece rápido, o aparece una alerta de ráfaga.
- Muchos reportes casi idénticos (mismo comentario, misma hora, formularios enviados en pocos segundos).
- Una colonia muy discordante con todas sus vecinas.
- Un pico de `POST /api/reportes` en el monitor del proveedor, o respuestas 429.
- Aviso de un vecino, organización o periodista: "mi colonia aparece mal".

### 5.2 Primera hora

1. **No borres nada.** La regla del proyecto es degradar antes que ocultar. Lo automático solo manda reportes a revisión (no cuentan en el mapa); ocultar es decisión de una persona con motivo escrito.
2. Entra a `/admin` y revisa las alertas y la cola. Identifica la colonia y el rango de horas.
3. Si el ataque está en curso y es masivo, activa el **interruptor de emergencia**: define `MODO_ATAQUE=1` en el entorno y reinicia/redespliega. Mientras esté activo, **todos** los reportes nuevos entran en revisión y no mueven el mapa (el sitio sigue recibiendo reportes). Es un freno, no una solución: los reportes legítimos también quedan en cola y habrá que restaurarlos.
4. Si el volumen global es alto pero legítimo (crisis real, nota viral), **no** actives el modo ataque: ajusta `LIMITE_GLOBAL_HORA` (volumen por hora a partir del cual todo entra a revisión) y refuerza moderación.
5. Anota en tu bitácora de operación: hora, colonia, señales, decisión.

### 5.3 Análisis

Pregúntate, en este orden:

1. ¿Los reportes llegaron en una ráfaga corta y desde pocas redes? (Las señales de baja diversidad están en las alertas.)
2. ¿Hay un hecho externo que lo explique (corte, nota, marcha, mensaje en grupos vecinales)? Un pico orgánico por una noticia **no** debe castigarse: el sistema está probado para no marcar como sospechoso un pico con muchas redes y navegadores distintos.
3. ¿Coincide con datos externos de la colonia (`oficial` en la API)? Es un indicio, no una prueba: los datos externos son escasos y mayormente listados, no mediciones.
4. ¿La colonia vecina muestra lo mismo? Un "isla" extrema sin vecinas pasa a la cola humana.

### 5.4 Acciones (siempre con motivo escrito, mínimo 10 caracteres)

| Situación | Acción | Quién |
|---|---|---|
| Ráfaga clara de baja diversidad | `ocultar` los reportes de la ráfaga, con la regla citada | Moderador humano |
| Dudoso | Dejar en `revision` y esperar corroboración independiente de otros días | Moderador |
| Se comprobó que era legítimo | `restaurar` | Moderador |
| Datos personales en un comentario | Borrar el comentario (o el reporte) cuanto antes: **los comentarios se publican al instante**; tarda alrededor de un minuto en dejar de verse | Moderador |
| Ataque sostenido | `MODO_ATAQUE=1` (§5.2), publicar nota (§5.6), endurecer límites | Responsable técnico |

Todo cambio pasa por la función SQL `moderar()`, que cambia el estado y escribe la bitácora en una sola transacción; la bitácora (`moderacion_log`) es de **solo agregado** (no admite edición ni borrado). El sistema automático no puede ocultar, solo degradar.

### 5.5 Después

- Restaura lo que se degradó por error.
- Revisa si hay que ajustar umbrales (están en `web/lib/aggregation.ts` y `web/lib/ratelimit.ts`; **cambiar un parámetro de la agregación exige subir `METODO`** y documentarlo en `/metodologia`).
- Si hubo manipulación comprobada, regístralo y valora publicarlo: un caso no explicado puede desacreditar el mapa; uno explicado, lo refuerza.
- Si sospechas filtración de `HASH_SALT`: rótalo (§8). Las identidades diarias previas dejan de coincidir (puede permitir algún duplicado menor en el día de la rotación).

### 5.6 Comunicación

Texto base, ajústalo (no inventes cifras): "Detectamos actividad inusual en los reportes de [colonia/zona] entre [hora] y [hora]. Los reportes afectados están en revisión y no cuentan en el mapa mientras se verifican. Si vives ahí y tu reporte no aparece, escríbenos a [contacto público]." El canal público de apelación **aún no está definido** (ver DECISIONES-PENDIENTES.md): no lo publiques hasta tenerlo.

---

## 6. Runbook de moderación

Quién modera, con qué turnos y con qué respaldo es una decisión humana pendiente. Mientras no exista, el panel `/admin` no debería operarse "en solitario" ni sin bitácora.

### 6.1 Reglas

- **Se oculta por cómo llegó el reporte, no por lo que dice.** Motivos válidos: ráfaga/automatización, spam, datos personales o contenido ilícito en el comentario, reporte duplicado. Un reporte incómodo, exagerado o con el que no coincidimos **no** es motivo.
- El comentario libre **se muestra en la página de la colonia en cuanto se envía, sin revisión previa** (solo día y gravedad o «No llegó agua», sin hora ni identificadores), si se envió después del aviso del formulario (columna `reportes.comentario_publico`, migración 007); los anteriores nunca se publican. Se depura al recibirlo (teléfonos, correos, enlaces y @usuarios se enmascaran) y un reporte oculto o en revisión retira su comentario. Al borrarlo, la caché de la página de la colonia tarda alrededor de un minuto en soltarlo. Se conserva con el resto de los datos (§4). Moderación: `/admin` muestra todos los comentarios y permite borrarlos. Los nombres y direcciones NO se detectan automáticamente: revisa `/admin` con frecuencia.
- Acciones: `degradar` (revisión), `ocultar` (decisión humana) y `restaurar`. Todas exigen motivo de al menos 10 caracteres y quedan en la bitácora.
- Sin reportes **no** significa agua buena. Moderar a la baja una colonia legítima daña a quienes más lo necesitan.

### 6.2 Acceso al panel

- `ADMIN_TOKEN`: mínimo 16 caracteres; sin él `/admin` queda **deshabilitado**. Genera uno con `openssl rand -hex 32`.
- Inicio de sesión: cambia el token por una cookie firmada y `HttpOnly` de 8 horas. Hay límite de intentos fallidos por red: solo cuentan los intentos con credencial incorrecta (las peticiones anónimas no). Una red bloqueada recibe 429 con **cualquier** token, también el correcto, durante 15 minutos; una sesión ya abierta sigue funcionando. Si te bloqueas, espera o entra desde otra red. Aun así, el `ADMIN_TOKEN` debe ser largo y aleatorio (`openssl rand -hex 24`).
- Rotar el token cierra todas las sesiones abiertas. Hazlo cuando salga un moderador.
- Acceso por *script*: `Authorization: Bearer <ADMIN_TOKEN>`. Nunca pegues el token en chats ni tickets.

### 6.3 Rutina diaria durante la crisis

1. Abrir `/admin`, revisar alertas abiertas y cola en revisión.
2. Resolver cada alerta con acción y motivo.
3. Revisar una muestra de reportes recientes de las colonias con más actividad.
4. Revisar los comentarios nuevos: se publican al instante.
5. Anotar novedades para el siguiente turno.

### 6.4 Apelaciones

Cuando una persona diga "mi reporte no se contó", la respuesta es: se contó, está en revisión o no alcanzó el mínimo; explica por qué usando `/metodologia`. El canal para recibir estas solicitudes **no está definido** todavía.

---

## 7. Plan de pico de tráfico

La crisis puede dispararse por una nota, una marcha o un mensaje viral. Casi todo el tráfico es lectura y debe absorberlo el CDN; el origen solo ve los `POST` y el panel.

### 7.1 Antes de que ocurra (lista de verificación)

- [ ] `/api/salud` y los monitores externos activos y con alertas a dos personas.
- [ ] CDN confirmado con `HIT` (§2.2) en geometría, scores y `/api/v1/*`.
- [ ] Base con **pool de conexiones** (Neon: cadena `-pooler`) y tope de autoescalado puesto en la consola, para que un pico no dispare la factura.
- [ ] Alertas y tope de gasto configurados en el proveedor (Vercel *Spend Management*; en Neon, tope de cómputo).
- [ ] Respaldo reciente restaurado con éxito (§3.4).
- [ ] `HASH_SALT`, `ADMIN_TOKEN` y `TRUSTED_PROXY_HOPS` verificados (la IP real del visitante se lee bien; DEPLOY.md §IP real).
- [ ] Prueba de carga básica contra la URL final con `k6` o `autocannon` (herramientas ajenas al repo; **no se ejecutó ninguna al preparar este documento**). Lo que hay que comprobar: que los GET cacheados no tocan la base y que `POST /api/reportes` responde dentro de lo razonable bajo ráfagas.
- [ ] Página o hilo de estado público decidido (dónde se avisa si algo falla).

### 7.2 Durante el pico

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `/api/salud` 503 | Base saturada o suspendida | Revisar conexiones y cómputo en el proveedor; el CDN sirve lo último durante `stale-if-error`. Neon Free se suspende al agotar horas de cómputo: pasar a plan de pago |
| Muchos `MISS` en el CDN | Regla de caché mal puesta | Corregir regla (Cloudflare: Cache Rule para `/api/colonias/*` y `/api/v1/*`) |
| Mapa sin calles | Falla OpenFreeMap (no promete SLA) | El mapa de colonias sigue siendo útil. El plan de contingencia (estilo local sin calles / PMTiles propio en R2) está **diseñado pero no implementado** (`despliegue.md` §3): decidir si implementarlo antes de un evento mediático |
| 429 en reportes | Límites de tasa por red/hora | Esperado ante abuso. Si muchos vecinos legítimos comparten una red móvil, puede castigar de más; revisar la cola |
| Factura sube | Más solicitudes CDN que las incluidas | `despliegue.md` §8: un pico de un día no cambia el nivel; igual revisa topes y alertas |

### 7.3 Si el plan primario no aguanta

Plan B (VPS + Cloudflare, `docker-compose.prod.yml`): ver DEPLOY.md. Cambiar de plan en plena crisis es riesgoso; ensáyalo con anticipación en un entorno de prueba.

### 7.4 Después

Revisa el costo real contra la estimación de `despliegue.md` §8, ajusta tope de gasto y anota qué se aprendió.

---

## 8. Rotación de secretos

| Secreto | Cada cuánto | Efecto de rotarlo |
|---|---|---|
| `HASH_SALT` | Al menos cada trimestre, o ante sospecha de filtración | Las identidades HMAC de días previos ya no coinciden con las nuevas; el máximo de reportes por colonia y día podría repetirse una vez el día del cambio. La app **se niega** a procesar reportes en producción si falta o es corta/conocida |
| `ADMIN_TOKEN` | Cuando salga un moderador o ante sospecha | Cierra todas las sesiones del panel |
| Contraseña de la base | Cuando salga un administrador | Actualizar `DATABASE_URL` en la app y en los respaldos |
| Clave privada de respaldos (`age`/`gpg`) | Según su política; guarda copia segura | Los respaldos viejos solo se abren con la clave con la que se cifraron |

Genera valores con `openssl rand -hex 32`. Guárdalos en un gestor de contraseñas con acceso de al menos dos personas.

---

## 9. Mantenimiento de datos

- **Colonias:** la importación es idempotente (no cambia los ids, de modo que los reportes siguen apuntando a su colonia). Pruébala primero con `--dry-run`. Ver README, "Datos reales".
- **Datos externos** (`data/oficial/*.csv`): también idempotente (`import-oficial`). Cada fila conserva fuente y URL. Revisa `vinculos_a_revisar.csv` y `no_vinculadas.csv` que genera el script.
- **Solo datos reales:** el producto no tiene datos de demostración (la migración `006_quitar_demo.sql` eliminó los que pudiera haber en una base antigua). No cargues datos de relleno en producción.
- **Textos del sitio** (contacto, responsable, revisiones): son variables que se leen **al construir**; cambiarlas exige reconstruir y redesplegar (ver DEPLOY.md, «Antes de publicar»).
- Migraciones: se aplican con el job `migrate` (compose) o `pnpm migrate`. Son transaccionales y se registran en `schema_migrations`.

---

## 10. Incidentes comunes

| Problema | Diagnóstico | Solución |
|---|---|---|
| `/admin` responde "deshabilitado" | `ADMIN_TOKEN` ausente o con menos de 16 caracteres | Definirlo y reiniciar |
| Los reportes fallan con error del servidor en producción | `HASH_SALT` ausente, con menos de 32 caracteres o con un valor conocido de ejemplo | Definirlo (≥ 32 caracteres aleatorios) y reiniciar |
| Todos los reportes dicen "límite" o comparten una sola red | `TRUSTED_PROXY_HOPS` mal puesto: la IP leída es la del proxy | Ver DEPLOY.md, "IP real del visitante" |
| Enviar un reporte devuelve 403 "Origen no permitido" | El formulario se sirve desde un dominio que no es el de la petición (p. ej. un dominio nuevo detrás de un proxy que cambia el `Host`) | Agregarlo a `ORIGENES_PERMITIDOS` (sin `https://`) |
| Contenedor `web` "unhealthy" | La base no responde | `docker compose logs db`; comprobar `DATABASE_URL` y espacio en disco |
| El job `migrate` falla | SQL con error o base inalcanzable | `docker compose logs migrate`; la migración con error se revierte entera |
| Colonias sin pintar en el mapa | No hay reportes suficientes (esperado) o fallo de `/api/colonias/scores` | Probar la URL; recordar que sin datos suficientes se muestra en gris |
