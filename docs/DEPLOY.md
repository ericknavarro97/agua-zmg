# Despliegue de Agua ZMG

Guía paso a paso para publicar el sitio. Hay dos caminos; el análisis completo de costos, límites y fuentes está en [`research/despliegue.md`](research/despliegue.md) (los precios cambian: revísalos en la página oficial el día que contrates).

| | **Plan primario** | **Plan B** |
|---|---|---|
| App | Vercel **Pro** | VPS con `docker compose` |
| Base | Neon (PostGIS) plan **Launch** | PostGIS en el mismo VPS |
| CDN | El de Vercel | Cloudflare Free delante |
| Mapa base | OpenFreeMap | OpenFreeMap |
| Costo mensual (estimación de la investigación) | ~USD 40 con 10 mil visitas, ~60-65 con 100 mil, ~140-160 con 1 millón | ~USD/EUR 5-30; el precio del VPS está **sin verificar** |
| Operación | Mínima | Tú: parches, TLS, respaldos, monitoreo |
| Cuándo | Crisis en curso, alta disponibilidad | Presupuesto mínimo o si Vercel no es opción |

Hay un **plan $0** (Vercel Hobby + Neon Free) que sirve solo para un piloto con un grupo de vecinos: Hobby prohíbe el uso comercial, se rompe cerca de 40 mil visitas al mes y Neon Free agota sus horas de cómputo en unos 17 días. **No es para el pico de la crisis.**

> **Qué NO hace esta guía:** crear cuentas, contratar servicios ni publicar nada. Cada paso es para que lo ejecute una persona con autoridad sobre el proyecto, después de resolver [DECISIONES-PENDIENTES.md](DECISIONES-PENDIENTES.md).

---

## 0. Antes de empezar

### 0.1 Decisiones humanas mínimas

Resuélvelas (o consciente y explícitamente pospónlas) antes de abrir al público; detalle y recomendación en [DECISIONES-PENDIENTES.md](DECISIONES-PENDIENTES.md):

1. **Quién es el responsable legal** (persona, asociación o colectivo): condiciona el aviso de privacidad y quién es titular de las cuentas.
2. Nombre y dominio.
3. Licencias de código y de datos.
4. Quién modera y con qué canal de contacto público/apelación.
5. Aval de un profesional de salud para la guía "Qué hacer".
6. Si el hosting es Vercel Pro (uso comercial permitido) u otro: Vercel Hobby prohíbe el uso comercial, y puede considerarse comercial si alguien recibe pago por crear o alojar el sitio (`despliegue.md` §2.3).

### 0.2 Requisitos técnicos antes del primer despliegue

- [ ] `pnpm lint`, `pnpm typecheck` (`next typegen` + `tsc --noEmit`) y `pnpm exec vitest run` pasan en `web/`.
- [ ] `pnpm build` termina sin errores **sin base de datos disponible** (el build de Docker no tiene base). Las páginas o rutas que consulten la base deben hacerlo en tiempo de petición, no en el build.
- [ ] El mapa base ya **no** usa `tile.openstreetmap.org` (su política no admite aplicaciones con tráfico alto y puede bloquear sin aviso). El código usa el estilo `positron` de OpenFreeMap, configurable con `NEXT_PUBLIC_MAP_STYLE_URL`.
- [ ] La base tiene todas las migraciones de `db/migrations/` aplicadas (`SELECT nombre FROM schema_migrations ORDER BY 1;` llega hasta el archivo más reciente) y solo colonias reales importadas.
- [ ] Variables obligatorias definidas (sección 1) y revisada la sección «Antes de publicar» (abajo).
- [ ] Páginas legales publicadas: `/privacidad`, `/acerca` (descargo "no es información oficial ni consejo médico") y `/metodologia`, con el nombre del responsable ya definido.

### 0.3 Variables de entorno

La lista completa y comentada está en [`web/.env.example`](../web/.env.example). Resumen de lo que importa en producción:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Postgres/PostGIS. En Neon, la cadena con `-pooler` para la app |
| `HASH_SALT` | **Sí** (≥ 32 caracteres) | Secreto de los HMAC anónimos. Sin él la app no procesa reportes en producción. `openssl rand -hex 32` |
| `ADMIN_TOKEN` | Sí para usar `/admin` (≥ 16 caracteres) | Sin él el panel de moderación queda deshabilitado |
| `TRUSTED_PROXY_HOPS` | Sí, verificar | Proxies de confianza delante de la app (ver sección 4.4) |
| `ORIGENES_PERMITIDOS` | Si hay más de un dominio | Dominios extra desde los que se acepta el formulario |
| `NEXT_PUBLIC_SITE_URL` | **Sí** | URL pública (enlaces de Open Graph). **Se incrusta en el build**; sin ella las vistas previas al compartir apuntan a `localhost:3000` (el build avisa) |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Opcional | Estilo del mapa base. **Se incrusta en el build.** Si cambias de proveedor, agrega su origen a `CSP_MAPA_ORIGENES` o el navegador lo bloqueará |
| `DATOS_LICENCIA_NOMBRE` / `DATOS_LICENCIA_URL` | Cuando se decida | Licencia declarada por la API pública y la página `/datos`. **Se leen al construir**; sin ellas la licencia se muestra como provisional |
| `CONTACTO_EMAIL`, `RESPONSABLE_NOMBRE`, `RESPONSABLE_DOMICILIO` | Decisión humana | Contacto y responsable que muestran `/acerca`, `/metodologia` y `/privacidad`. **Se leen al construir** |
| `AVISO_PRIVACIDAD_REVISADO`, `GUIA_REVISADA_SALUD` | Decisión humana | `1` solo si un abogado / una persona de salud revisó de verdad. **Se leen al construir** |
| `LIMITE_GLOBAL_HORA`, `MODO_ATAQUE` | Opcionales | Ver OPERACION.md §5 |

Nunca subas `.env.local` ni `.env.prod` al repositorio. Guarda los secretos en un gestor de contraseñas con acceso de al menos dos personas.

---

## Antes de publicar

Resumen de lo que debe estar resuelto **antes de abrir el sitio al público**. Hay secretos que se generan y datos del sitio que solo puede aportar una persona.

### Secretos (se generan, no se inventan a mano)

```bash
openssl rand -hex 32    # HASH_SALT (mínimo 32 caracteres) y, con otra corrida, ADMIN_TOKEN (mínimo 16)
openssl rand -hex 24    # POSTGRES_PASSWORD (plan B; solo hexadecimal porque va dentro de una URL)
```

- `HASH_SALT` y `ADMIN_TOKEN` deben ser **distintos entre sí** y distintos en cada entorno. El `.env.example` los trae vacíos a propósito; la app rechaza valores de ejemplo o cortos.
- Guárdalos en un gestor de contraseñas con acceso de al menos dos personas. Nunca en el repositorio.

### `NEXT_PUBLIC_SITE_URL` es obligatoria

URL pública del sitio sin `/` final (p. ej. `https://agua.ejemplo.org`). **Se incrusta al construir**: sin ella, las vistas previas al compartir (WhatsApp, redes) apuntan a `localhost`. En Vercel, si no se define, se usa `VERCEL_PROJECT_PRODUCTION_URL`; en Docker es un build arg. Si cambias de dominio, reconstruye.

### Variables del sitio (decisiones humanas: NO las inventes)

Estas variables se leen **al construir** (las páginas informativas se prerenderizan): en Vercel, defínelas antes del despliegue; en Docker son build args (`docker-compose.prod.yml` ya los pasa desde `.env.prod`). Cambiarlas exige **reconstruir y redesplegar**. Detalle y comentarios en [`web/.env.example`](../web/.env.example) y [`web/lib/sitio.ts`](../web/lib/sitio.ts).

| Variable | Qué es | Quién la decide |
|---|---|---|
| `CONTACTO_EMAIL` | Correo público de contacto, moderación y apelación | Quien responde por el proyecto: debe ser un buzón que alguien lea |
| `RESPONSABLE_NOMBRE`, `RESPONSABLE_DOMICILIO` | Quién responde por el tratamiento de datos personales (aviso de privacidad) | La persona, asociación o colectivo responsable legal |
| `AVISO_PRIVACIDAD_REVISADO` | `1` **solo** si un abogado revisó el aviso de privacidad | El abogado que lo revisó |
| `GUIA_REVISADA_SALUD` | `1` **solo** si una persona de salud (médico/a, epidemiólogo/a, enfermero/a) revisó `/que-hacer` | Esa persona de salud |
| `DATOS_LICENCIA_NOMBRE`, `DATOS_LICENCIA_URL` | Licencia de los datos (API y página `/datos`) | Quien responde por el proyecto (ver [DECISIONES-PENDIENTES.md](DECISIONES-PENDIENTES.md)) |

**No inventes nada de esto.** No pongas un correo, un nombre o un domicilio que no sean reales, ni marques una revisión (`=1`) que no ocurrió, ni elijas una licencia por ti mismo para que el aviso desaparezca. Mientras falten, las páginas lo dicen con honestidad («aún por definir», aviso de borrador, licencia provisional): es lo correcto. Publicar con esos avisos es mejor que publicar con datos falsos.

### Verificación rápida

- [ ] Secretos generados y guardados; `NEXT_PUBLIC_SITE_URL` definida.
- [ ] Variables del sitio definidas **antes** de construir, o conscientemente vacías (y las páginas lo dicen).
- [ ] Base con todas las migraciones y las colonias reales importadas (sección 1.2 o 2.3).
- [ ] Tras desplegar, abre `/acerca`, `/privacidad`, `/que-hacer` y `/datos` y comprueba que muestran lo que esperas (contacto real o «aún por definir»; sin avisos de revisión que no corresponden).

---

## 1. Plan primario: Vercel Pro + Neon Launch + OpenFreeMap

> Nota honesta: los pasos de las consolas de Vercel y Neon se describen por lo que hacen; los nombres exactos de menús pueden cambiar. La infraestructura de este plan **no se probó** al preparar esta guía (sí se probaron la imagen Docker, las migraciones y los endpoints en local).

### 1.1 Base de datos en Neon

1. Crea un proyecto en Neon. Elige la región más cercana a tus usuarios que ofrezca Neon (la investigación no midió latencias a México: con el CDN delante, la región solo importa para `POST /api/reportes`). Elige PostgreSQL 16 o superior.
2. Plan **Launch** (por uso). Pon un **tope de autoescalado** de cómputo en la consola para que un pico no dispare la factura. El plan gratuito agota sus horas de cómputo a mitad de mes si la base nunca se duerme (`despliegue.md` §2.2).
3. Activa PostGIS en la base:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
   (La migración `001_init.sql` ya lo hace; en Neon puede requerirse un rol con permiso. Si la migración falla en este punto, ejecútalo a mano con el rol propietario y reintenta.)
4. Copia dos cadenas de conexión:
   - **Directa** (sin `-pooler`): para migrar e importar datos desde tu máquina.
   - **Pooler** (`…-pooler…`, PgBouncer): para la app en Vercel. Cada instancia de la app abre su propio pool y en serverless un pico agotaría las conexiones sin el pooler. Añade `?sslmode=require` si la cadena no lo trae.

### 1.2 Migraciones y datos iniciales (desde tu máquina)

```bash
cd web
pnpm install
export DATABASE_URL='postgres://USUARIO:CLAVE@HOST-DIRECTO/neondb?sslmode=require'   # cadena DIRECTA

# 1) Esquema (tablas, funciones de moderación, mediciones externas). Idempotente.
pnpm exec tsx scripts/migrate.ts

# 2) Polígonos de colonias. Haz primero una corrida en seco y revisa el reporte de calidad:
pnpm exec tsx scripts/import-colonias.ts ../data/colonias_zmg.geojson --fuente-geom ine_colonias --dry-run
pnpm exec tsx scripts/import-colonias.ts ../data/colonias_zmg.geojson --fuente-geom ine_colonias

# 3) Datos externos (oficiales, académicos, periodísticos) con su fuente y URL. Opcional pero recomendado:
pnpm exec tsx scripts/import-oficial.ts --todos --dry-run
pnpm exec tsx scripts/import-oficial.ts --todos
```

Notas:

- Se usa `pnpm exec tsx …` (y no `pnpm migrate`) porque los alias de `package.json` leen `web/.env.local`, que puede no existir; así `DATABASE_URL` se toma del entorno.
- `data/colonias_zmg.geojson` contiene colonias del catálogo INE (corte dic-2020): **aproximadas y no oficiales**, sin las colonias posteriores a 2020. El sitio debe decirlo (ver [`data/raw/README.md`](../data/raw/README.md)).
- Verifica: `SELECT count(*) FROM colonias;` debe dar 2,170 con el archivo incluido, y `SELECT nombre FROM schema_migrations ORDER BY 1;` debe listar todos los archivos de `db/migrations/`.
- Las migraciones posteriores las aplica la CI después de cada push a `main` con pruebas en verde (sección 1.6); esta corrida manual solo hace falta la primera vez.

### 1.3 Proyecto en Vercel

1. Plan **Pro** (la investigación recomienda Pro para uso con hosting de un proyecto cívico con colaboradores remunerados o con tráfico de crisis; Hobby prohíbe el uso comercial y pausa por 30 días al exceder límites).
2. Importa el repositorio desde su proveedor Git (esto requiere que el código ya esté publicado en un repositorio: decisión del equipo) o despliega con la CLI de Vercel. **Root Directory: `web`.**
3. Framework: Next.js (se detecta). Comando de build por defecto (`pnpm build`; ejecuta antes `copy:maplibre`).
4. Variables de entorno (entorno *Production*): `DATABASE_URL` (cadena **pooler**), `HASH_SALT`, `ADMIN_TOKEN`, `NEXT_PUBLIC_SITE_URL`, las variables del sitio de «Antes de publicar» y las demás de la sección 0.3. En Vercel `TRUSTED_PROXY_HOPS=1`.
5. Despliega primero a una URL de *preview* contra una **base de staging** (otra rama de Neon o el plan gratuito), no contra la base de producción. Prueba la sección 3 ahí.
6. Spend Management: configura alertas y un tope de gasto en la consola (Vercel avisa por defecto a USD 200).

### 1.4 Dominio

Agrega el dominio en Vercel y crea los registros DNS que indique. Después de que resuelva, actualiza `NEXT_PUBLIC_SITE_URL` y vuelve a desplegar (se incrusta en el build). Si el dominio es distinto del que sirve el formulario, agrégalo a `ORIGENES_PERMITIDOS`.

### 1.5 Operación inicial

Sigue [OPERACION.md](OPERACION.md): monitores externos y simulacro de restauración. Los datos se conservan como registro de la comunidad (aviso de privacidad v0.2): la tarea de borrado (`scripts/purge.ts`) no se programa, y no hay copias propias además del historial de restauración de Neon.

### 1.6 Migraciones nuevas (CI)

Vercel construye y publica la app, pero **no migra la base**. Si un cambio trae una migración nueva y nadie la aplica, el código nuevo corre contra el esquema viejo (pasó con `008_nivel_limpia.sql`: los reportes «Limpia» respondían 500).

El workflow [`.github/workflows/migraciones.yml`](../.github/workflows/migraciones.yml) corre `scripts/migrate.ts` contra producción cuando la CI de un push a `main` termina en verde (y a mano desde la pestaña *Actions* con *Run workflow*). Solo aplica las migraciones que falten. Si la CI falla, no migra.

1. En Neon, abre el proyecto y ve a **Connect**. Desactiva *Connection pooling* y copia la cadena **directa** (sin `-pooler`). Añade `?sslmode=require` si no lo trae.
2. En GitHub, en el repositorio: *Settings → Secrets and variables → Actions → New repository secret*. Nombre: `DATABASE_URL_PRODUCCION`; valor: esa cadena.
3. Corre el workflow una vez a mano y revisa que termine en verde.

Sin el secreto el job falla a propósito, con un aviso, para que no pase desapercibido.

Vercel no espera a la CI: el código nuevo suele publicarse unos minutos **antes** de que la migración llegue. Por eso cada migración debe ser compatible con el código anterior y con el nuevo (CONTRIBUTING.md): agregar columnas con valor por omisión o relajar restricciones, nunca quitar algo que el código desplegado todavía usa. Si el código nuevo **necesita** la migración (por ejemplo, `009_sin_agua.sql`: hasta que se aplica, los reportes «Hoy no llegó agua» fallan), sube primero la migración sola a `main`, espera a que el workflow termine en verde y después sube el código.

---

## 2. Plan B: VPS con `docker compose`

Arquitectura: navegador → Cloudflare Free (DNS, TLS, caché, DDoS) → Caddy → app Next.js (modo `standalone`) → PostGIS (volumen con respaldo nocturno). Todo definido en [`docker-compose.prod.yml`](../docker-compose.prod.yml); la imagen se construye con [`web/Dockerfile`](../web/Dockerfile) (contexto: la **raíz** del repositorio).

Lo probado al preparar esta guía: construcción de las imágenes `runner` y `migrate`, la aplicación de migraciones en un Postgres real, el arranque del contenedor, el `HEALTHCHECK` y `/api/salud` (200 con base viva, 503 con base inalcanzable). **No** se probó en un VPS real, ni el perfil `caddy`/HTTPS, ni Cloudflare.

### 2.1 Servidor

- Cualquier VPS Linux con Docker y el plugin Compose. 2 vCPU y 4 GB de RAM es el orden de magnitud que usó la estimación (la base y la app comparten máquina). Los precios de Hetzner no se pudieron verificar; compara con la página oficial el día de contratar.
- Abre solo 22 (SSH, idealmente con llaves), 80 y 443. **No publiques el puerto de Postgres**: el compose no lo hace.
- Mantén el sistema operativo actualizado (parches de seguridad son tu responsabilidad en este plan).

### 2.2 Configuración

```bash
git clone <URL-DEL-REPOSITORIO> /opt/agua-zmg && cd /opt/agua-zmg
cp web/.env.example .env.prod
```

Edita `.env.prod` (solo hace falta lo siguiente; el resto tiene valores por defecto). Cambiar cualquier variable de «Antes de publicar» exige reconstruir con `--build`:

```dotenv
POSTGRES_PASSWORD=<openssl rand -hex 24>     # solo hexadecimal: va dentro de una URL
HASH_SALT=<openssl rand -hex 32>
ADMIN_TOKEN=<openssl rand -hex 32>
DOMINIO=agua.ejemplo.org                      # solo con el perfil caddy
NEXT_PUBLIC_SITE_URL=https://agua.ejemplo.org # se incrusta al construir la imagen
# Datos del sitio (decisiones humanas, ver «Antes de publicar»); se leen al construir la imagen.
# Déjalas fuera si aún no están definidas: las páginas dirán «aún por definir».
CONTACTO_EMAIL=<correo real de contacto>
RESPONSABLE_NOMBRE=<quién responde por los datos>
RESPONSABLE_DOMICILIO=<domicilio del responsable>
# AVISO_PRIVACIDAD_REVISADO=1                  # solo si un abogado lo revisó
# GUIA_REVISADA_SALUD=1                        # solo si una persona de salud revisó /que-hacer
TRUSTED_PROXY_HOPS=1                          # ver 2.4
APP_VERSION=<SHA corto del commit>            # opcional: aparece en /api/salud
```

Compose se niega a arrancar si faltan `POSTGRES_PASSWORD`, `HASH_SALT` o `ADMIN_TOKEN`.

### 2.3 Arranque

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Orden que garantiza el compose: `db` (healthy) → `migrate` (aplica `db/migrations`, termina con éxito) → `web` (arranca). La app solo escucha en `127.0.0.1:${WEB_PORT:-3000}`; el tráfico público entra por Caddy.

HTTPS automático con Caddy (Let's Encrypt; `DOMINIO` debe apuntar ya al servidor):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile caddy up -d
```

Si en vez de Caddy usas Cloudflare Tunnel, nginx u otro proxy, apúntalo a `127.0.0.1:3000`.

Cargar datos iniciales (colonias y datos externos), una sola vez, con la imagen `migrate` (trae `tsx` y los scripts) y la carpeta `data/` montada:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
  -v "$PWD/data:/data" migrate \
  pnpm exec tsx scripts/import-colonias.ts /data/colonias_zmg.geojson --fuente-geom ine_colonias

docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
  -v "$PWD/data:/data" migrate \
  pnpm exec tsx scripts/import-oficial.ts --archivo /data/oficial/mediciones_externas.csv --sin-salida
```

(Primero prueba cada importación con `--dry-run`. `data/raw/` pesa cientos de MB y no hace falta en el servidor; copia solo `data/*.geojson` y `data/oficial/`.)

### 2.4 IP real del visitante (`TRUSTED_PROXY_HOPS`) — verificar siempre

El anti-abuso lee la IP contando **desde la derecha** de `X-Forwarded-For` y salta `TRUSTED_PROXY_HOPS` entradas. Si el valor no corresponde a tu topología:

- demasiado bajo: la "IP" es la de tu proxy → **todos los visitantes parecen la misma red** y los límites castigan a todos por igual;
- demasiado alto: se lee una entrada que escribió el visitante → **la IP se puede falsificar** y el anti-abuso se vuelve inútil.

| Topología | Valor esperado | Estado |
|---|---|---|
| Vercel | 1 (la plataforma sobrescribe `X-Forwarded-For`) | Según la investigación; **verificar** |
| VPS + Caddy directo a internet | 1 | **Verificar** |
| Cloudflare → Caddy → app | Depende de cómo Caddy trate la cabecera que manda Cloudflare. Por defecto un proxy inverso **no confía** en las cabeceras `X-Forwarded-*` entrantes y las reescribe con la IP del hop anterior (la de Cloudflare); para ver al visitante real hay que declarar los rangos de Cloudflare como proxies de confianza en Caddy. | **SIN VERIFICAR**: no se probó. Comprueba con la prueba de abajo |

Prueba (en producción, o mejor en staging): envía un reporte de prueba a una base de ensayo con una cabecera falsa y revisa que la "red" registrada cambie **por visitante real**, no por tu `curl`:

```bash
# La IP falsa no debe cambiar la identidad: si cambia, estás leyendo un valor controlado por el cliente
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://TU-DOMINIO/api/reportes \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 1.2.3.4' \
  -d '{"colonia_id":1,"gravedad":2,"sintomas":[]}'
```

y compara en la base (`SELECT red_hash FROM reportes ORDER BY id DESC LIMIT 5;`) enviando desde dos conexiones distintas (por ejemplo tu casa y datos móviles): deben dar `red_hash` distinto, y repetir con distinta cabecera falsa desde la misma conexión debe dar el **mismo** `red_hash`. (Usa un `colonia_id` de ensayo; no contamines la base real: hazlo en staging.)

### 2.5 Cloudflare delante (recomendado en este plan)

- Cloudflare **no cachea JSON ni HTML por defecto**. Sin una *Cache Rule* para `/api/colonias/*` y `/api/v1/*` (respetando el `Cache-Control` del origen), tu VPS recibe todo el tráfico (`despliegue.md` §2.4).
- Regla de límite de tasa (el plan gratuito permite una): protege `POST /api/reportes`.
- No sirvas por el CDN gratuito archivos grandes de mapas (PMTiles) más allá de lo razonable.
- Con Cloudflare delante, vuelve a leer la sección 2.4.

### 2.6 Actualizar

```bash
cd /opt/agua-zmg && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

El job `migrate` se vuelve a ejecutar y aplica solo migraciones nuevas (las anteriores quedan registradas en `schema_migrations`). Antes de actualizar, haz un respaldo (OPERACION.md §3). Revertir una migración **no** es automático: restaura el respaldo.

### 2.7 Operación

Respaldo nocturno cifrado fuera del servidor, retención diaria (`scripts/purge.ts`), monitores externos: OPERACION.md. El `HEALTHCHECK` de la imagen consulta `/api/salud`; `docker compose ps` muestra `unhealthy` si la base no responde.

---

## 3. Verificación posterior al despliegue

Sustituye `TU-DOMINIO`:

```bash
# 1. Salud: debe responder 200 con "db":true
curl -s https://TU-DOMINIO/api/salud

# 2. Caché: ejecuta DOS veces; la segunda debe decir HIT
curl -sI https://TU-DOMINIO/api/colonias/geometria | grep -i -E 'cache-control|x-vercel-cache|cf-cache-status'

# 3. API pública
curl -sI https://TU-DOMINIO/api/v1/colonias | grep -i -E 'access-control-allow-origin|link|x-licencia'
curl -s  https://TU-DOMINIO/api/v1/resumen.csv | head -3

# 4. Cabeceras de seguridad
curl -sI https://TU-DOMINIO/ | grep -i -E 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy'

# 5. Panel: sin sesión no debe dejar pasar
curl -s -o /dev/null -w '%{http_code}\n' https://TU-DOMINIO/api/admin/moderacion
```

Y a mano, en un teléfono con datos móviles: abre el mapa, busca tu colonia, envía un reporte **en staging** (no contamines producción), mira que aparezca en el panel `/admin`.

## 4. Lista de verificación de lanzamiento

- [ ] Decisiones de DECISIONES-PENDIENTES.md tomadas o pospuestas conscientemente.
- [ ] Aviso de privacidad, descargo y metodología publicados con el nombre del responsable.
- [ ] La guía "Qué hacer" revisada por un profesional de salud (o con el aviso visible de que no lo está).
- [ ] Revisada la sección «Antes de publicar» (variables del sitio, `NEXT_PUBLIC_SITE_URL`, secretos generados) y no inventado ningún dato humano.
- [ ] `HASH_SALT` (generado con `openssl rand -hex 32`; el `.env.example` lo trae vacío a propósito y la app rechaza valores de ejemplo) y `ADMIN_TOKEN` fuertes y guardados en un gestor con dos personas.
- [ ] Prueba de IP real hecha (2.4).
- [ ] CDN con `HIT` verificado.
- [ ] Monitores externos activos con alertas a dos personas.
- [ ] Respaldo restaurado con éxito en una base de ensayo.
- [ ] El apartado «Cuánto tiempo» de `/privacidad` coincide con lo que de verdad se conserva y se respalda (hoy: todo se conserva; sin tarea de borrado ni copias propias).
- [ ] Topes de gasto y de autoescalado configurados.
- [ ] Una semana en modo sombra de la agregación (calcular el método vigente y la media simple en paralelo) antes de depender del color para decisiones públicas, según `research/anti-abuso.md` §6.7.
- [ ] Prueba de carga básica ejecutada (no se ejecutó ninguna al preparar esta guía).
