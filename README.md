# Agua ZMG

**Mapa ciudadano de la calidad del agua en la Zona Metropolitana de Guadalajara.** Los vecinos reportan cómo llega el agua a su colonia, el mapa pinta cada colonia según esos reportes, y se complementa con datos oficiales y académicos (siempre aparte, con su fuente) y una guía de qué hacer.

> **Importante antes de usar o compartir este proyecto.**
> - Lo que muestra el mapa son **reportes de vecinos, sin verificar**: refleja percepción, no mediciones de laboratorio. **No es información oficial ni consejo médico.**
> - **Sin reportes no significa agua buena**: significa que todavía no hay suficientes.
> - Los límites de las colonias son **aproximados y no oficiales** (catálogo de colonias del INE, corte dic-2020; faltan las colonias más nuevas).
> - El producto solo muestra datos reales: reportes de vecinos y datos externos con su fuente original. No hay datos de demostración.

Contexto: octubre de 2026, crisis de agua turbia en la ZMG reportada en cientos de colonias (las cifras varían según la fuente y no hay un número oficial único; el proyecto no publica uno). La investigación que respalda las decisiones del proyecto está en [`docs/research/`](docs/research/).

## Qué hace

- **Mapa** (`/`): colonias coloreadas por gravedad (1 leve, 2 moderada, 3 grave, 4 crítica) con búsqueda, ubicación y detalle de cada colonia. Una colonia solo se pinta cuando hay evidencia suficiente; si no, aparece en gris ("sin datos suficientes"). La confianza (baja, media, alta) se comunica aparte del color.
- **Reportar**: formulario anónimo (sin cuentas): colonia, gravedad, síntomas y comentario opcional.
- **Datos externos** (en la web, «Reportes publicados»): mediciones y listados de fuentes oficiales, académicas, periodísticas y ciudadanas, **separados** del puntaje ciudadano, cada uno con su fuente original y URL (ver [`data/oficial/FUENTES.md`](data/oficial/FUENTES.md)).
- **Guía** (`/que-hacer`, `/denunciar`): qué hacer y cómo denunciar, solo con afirmaciones que tienen fuente verificada ([`docs/research/guia-contenido.md`](docs/research/guia-contenido.md)).
- **API pública abierta** (`/api/v1`): los agregados por colonia, en GeoJSON y CSV, con licencia declarada ([`docs/API.md`](docs/API.md)).
- **Panel de moderación** (`/admin`), protegido con `ADMIN_TOKEN`.

Páginas previstas: `/`, `/que-hacer`, `/denunciar`, `/metodologia`, `/datos`, `/privacidad`, `/acerca` y `/admin`. Revisa `web/app/` para ver cuáles están ya implementadas en tu copia.

## Arquitectura

```
                 ┌──────────── navegador ────────────┐
                 │  Next.js (React) + MapLibre GL     │
                 └───────────────┬────────────────────┘
                                 │  HTTPS
                  CDN (Vercel / Cloudflare)  ← absorbe la lectura cacheada
                                 │
        ┌────────────────────────▼─────────────────────────┐
        │  Next.js 16 (App Router)   web/                   │
        │   • páginas                                       │
        │   • /api/colonias/*   geometría, scores, detalle  │
        │   • /api/reportes     POST anónimo + anti-abuso   │
        │   • /api/v1/*         API pública (CORS abierto)  │
        │   • /api/salud        chequeo real de la base     │
        │   • /admin            moderación                  │
        └────────────────────────┬─────────────────────────┘
                                 │  pg (pool)
                   PostgreSQL + PostGIS   db/migrations/
                   colonias · reportes · mediciones_externas
                   rate_limits · moderacion_log
```

- **Mapa base:** OpenFreeMap (estilo `positron`, sin llaves), configurable con `NEXT_PUBLIC_MAP_STYLE_URL`. No tiene SLA; ver [`docs/research/despliegue.md`](docs/research/despliegue.md) §3.
- **Casi todo el tráfico es lectura cacheable**; lo único que siempre llega al origen es `POST /api/reportes`.
- **Estructura del repositorio**

| Ruta | Contenido |
|---|---|
| `web/` | Aplicación Next.js (código, scripts, `Dockerfile`) |
| `web/app/api/` | Rutas de API (`colonias`, `reportes`, `v1`, `salud`, `admin`, `oficial`) |
| `web/lib/` | Agregación (`aggregation.ts`), anti-abuso (`fingerprint.ts`, `ratelimit.ts`), moderación, normalización de datos externos |
| `web/scripts/` | `migrate`, `import-colonias`, `import-oficial`, `purge`, `simular-ataques` |
| `db/migrations/` | Migraciones SQL versionadas (se aplican una sola vez cada una) |
| `data/` | Colonias (GeoJSON), datos externos (`data/oficial/`) y fuentes crudas (`data/raw/`, pesada) |
| `docs/` | Documentación operativa; `docs/research/` es la investigación de respaldo |
| `docker-compose.yml` | Base de datos local de desarrollo |
| `docker-compose.prod.yml` | Producción en un VPS (web + PostGIS + migraciones) |
| `.github/workflows/ci.yml` | Integración continua |

## Arranque local

Requisitos: Node.js 20.9 o superior, [pnpm](https://pnpm.io) (versión en `web/package.json`) y Docker.

```bash
docker compose up -d                  # PostGIS en localhost:5433 (usuario/clave/base: agua/agua/agua_zmg)
cd web
pnpm install
cp .env.example .env.local            # y revisa los valores (ver "Variables de entorno")
pnpm migrate                          # aplica db/migrations/*.sql (001 a 006)
pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias   # colonias reales
pnpm import:oficial --todos           # datos externos (opcional)
pnpm dev                              # http://localhost:3000
```

`pnpm migrate` y `pnpm import:colonias` leen `web/.env.local`. Si prefieres pasar `DATABASE_URL` por el entorno, ejecuta los scripts directamente: `DATABASE_URL=… pnpm exec tsx scripts/migrate.ts`.

Comprobaciones antes de enviar cambios (las mismas que corre la CI):

```bash
pnpm typecheck                    # next typegen + tsc --noEmit (los tipos de rutas se generan)
pnpm lint
pnpm exec vitest run
pnpm build
```

### Datos reales de colonias

Los polígonos están en [`data/colonias_zmg.geojson`](data/colonias_zmg.geojson) (2,170 colonias de los 9 municipios de la ZMG; catálogo INE 2020, **aproximado y no oficial**). La procedencia, cobertura y limitaciones están en [`data/README.md`](data/README.md) y [`data/raw/README.md`](data/raw/README.md). El dataset oficial del IIEG no se pudo obtener (el portal no resolvió DNS durante la investigación).

```bash
# Prueba en seco y revisa el reporte de calidad
pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias --dry-run
# Importa
pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias

# Datos externos (oficiales, académicos, periodísticos), vinculados a colonias por nombre
pnpm exec tsx --env-file=.env.local scripts/import-oficial.ts --todos --dry-run
pnpm exec tsx --env-file=.env.local scripts/import-oficial.ts --todos
```

La importación es **idempotente**: reimportar no duplica ni cambia los ids, así que los reportes siguen apuntando a su colonia. Si el archivo viene en UTM, pasa `--srid` (p. ej. `--srid 32613`). Más opciones en la cabecera de `web/scripts/import-colonias.ts`.

### Solo datos reales

- El proyecto no incluye datos de demostración: no hay sembrado falso ni colonias de mentira. La migración `006_quitar_demo.sql` borra cualquier fila demo que una base antigua pudiera tener, junto con la columna `colonias.demo` y la fuente `demo`.
- Para desarrollar, importa las colonias reales (arriba) y, si quieres ver el mapa con color, envía reportes de prueba desde el formulario en tu base local.
- Los datos externos solo se vinculan a colonias reales y se muestran con su fuente original.

## Variables de entorno

La lista completa y comentada está en [`web/.env.example`](web/.env.example). Las que importan:

| Variable | Para qué | Notas |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL/PostGIS | Con Neon, usa la cadena con `-pooler` en la app |
| `HASH_SALT` | Secreto de los HMAC anónimos anti-abuso | **Obligatoria en producción**, ≥ 32 caracteres aleatorios. En desarrollo hay un valor local |
| `ADMIN_TOKEN` | Acceso a `/admin` | ≥ 16 caracteres; sin él el panel queda deshabilitado |
| `TRUSTED_PROXY_HOPS` | Cuántos proxies hay delante de la app | La IP se lee desde la derecha de `X-Forwarded-For`; **verifícalo** al desplegar (docs/DEPLOY.md §2.4) |
| `ORIGENES_PERMITIDOS` | Dominios extra que pueden enviar el formulario | Opcional |
| `NEXT_PUBLIC_SITE_URL` | URL pública (Open Graph) | Se incrusta en el build |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Estilo del mapa base | Se incrusta en el build |
| `DATOS_LICENCIA_NOMBRE` / `DATOS_LICENCIA_URL` | Licencia declarada por la API y la página `/datos` | Por defecto ODbL-1.0, marcada **provisional**. **Se leen al construir** |
| `CONTACTO_EMAIL`, `RESPONSABLE_NOMBRE`, `RESPONSABLE_DOMICILIO` | Contacto público y responsable del tratamiento de datos | **Los aporta una persona**; se leen al construir. Mientras faltan, las páginas dicen «aún por definir» |
| `AVISO_PRIVACIDAD_REVISADO`, `GUIA_REVISADA_SALUD` | `1` solo si un abogado revisó el aviso de privacidad / una persona de salud revisó `/que-hacer` | Se leen al construir. No actives ninguna sin que la revisión haya ocurrido |
| `MODO_ATAQUE`, `LIMITE_GLOBAL_HORA` | Interruptores de emergencia | Ver [`docs/OPERACION.md`](docs/OPERACION.md) §5 |

## Cómo se calcula la gravedad

Cada reporte trae una gravedad de 1 a 4. El color de una colonia (`nivel`) es su **score** redondeado, calculado por el método **v1** (`web/lib/aggregation.ts`, parámetros versionados; cambiar uno exige subir la versión):

1. **Qué cuenta:** solo reportes `visible` y no sospechosos de los últimos 14 días. Los reportes con el campo trampa lleno o enviados instantáneamente se guardan marcados y **no cuentan** (el bot recibe la misma respuesta que un usuario normal).
2. **Peso por reporte:** limitado según cuántos reportes llegan de la misma red en esa colonia el mismo día y la misma semana (nadie puede pesar más por insistir), reducido si la red concentra muchos reportes o si el formulario se envió demasiado rápido.
3. **Decaimiento:** cada reporte pierde la mitad de su peso cada 7 días.
4. **Media recortada:** se descarta el 20 % del peso en cada extremo de la escala, para que unos pocos reportes extremos no muevan el color.
5. **Contracción hacia un prior acotado** (1.5 a 2.5): con poca evidencia el score se acerca a un valor neutro; un atacante no puede mover ese prior.
6. **Publicable:** basta un reporte completo (evidencia efectiva ≥ 1; uno enviado en menos de 5 s pesa la mitad). Con pocos reportes el color sale tenue y con confianza baja. Sin reportes, la colonia sale en gris.
7. **Confianza (baja, media, alta):** depende de la evidencia efectiva, de en cuántos días distintos y desde cuántas redes distintas llegó, de que ningún día concentre más del 60 % y de que el promedio y la mediana no discrepen. Con confianza baja el color puede cambiar con pocos reportes más.

Los umbrales son valores iniciales razonados, **no medidos**: se recalibrarán con datos reales y una semana en modo sombra ([`docs/research/anti-abuso.md`](docs/research/anti-abuso.md) §6). **Límite conocido:** quien aparente ser muchos vecinos distintos (muchas redes, tiempos humanos, varios días) no se distingue de vecinos reales; por eso existe moderación humana y transparencia del método.

### Privacidad

La IP y el *User-Agent* completo nunca se guardan. Por reporte se guardan identificadores derivados con HMAC (clave `HASH_SALT`, fuera de la base) que se **anonimizan** pasado el periodo de retención (`pnpm purge`, 30 días por defecto), y el comentario libre —depurado de teléfonos, correos y enlaces— no se publica y se borra con la misma tarea. Estos identificadores son seudónimos, no datos disociados: el aviso de privacidad debe decirlo con precisión.

## API pública

Solo lectura, CORS abierto, sin llaves, con caché y licencia declarada. Detalle en [`docs/API.md`](docs/API.md) y [`web/public/openapi.json`](web/public/openapi.json).

```bash
curl -s "http://localhost:3000/api/v1/colonias?con_datos=1&sin_geometria=1"   # GeoJSON (sin polígonos)
curl -s "http://localhost:3000/api/v1/colonias/1"                              # detalle de una colonia
curl -s "http://localhost:3000/api/v1/resumen.csv?municipio=Zapopan"           # CSV agregado
curl -s "http://localhost:3000/api/salud"                                      # {"ok":true,"db":true,"version":"…"}
```

Nunca devuelve huellas, comentarios ni datos personales. Licencia declarada de los datos: **ODbL-1.0 (provisional)**; ver [`docs/DECISIONES-PENDIENTES.md`](docs/DECISIONES-PENDIENTES.md). Si publicas o reutilizas estos datos, conserva la atribución y el aviso de que son reportes sin verificar.

## Despliegue y operación

- [`docs/DEPLOY.md`](docs/DEPLOY.md): plan primario (Vercel Pro + Neon + OpenFreeMap) y plan B (VPS con `docker-compose.prod.yml`), paso a paso.
- [`docs/OPERACION.md`](docs/OPERACION.md): monitoreo, respaldos, retención, runbooks de abuso y de moderación, plan de pico de tráfico.
- [`docs/DECISIONES-PENDIENTES.md`](docs/DECISIONES-PENDIENTES.md): lo que solo una persona puede decidir (responsable legal, licencias, hosting, quién modera, aval de salud…), con recomendación.

## Contribuir

Hay mucho por hacer y toda ayuda cuenta: código, revisión de datos y textos, pruebas en campo, accesibilidad. Lee [`CONTRIBUTING.md`](CONTRIBUTING.md). Dos reglas que no se negocian: **no inventar datos** (todo dato factual lleva fuente verificable; mejor omitir que equivocarse en salud pública) y **no presentar como real lo que no lo es** (nada de datos de relleno).

## Advertencias

- No es información oficial ni consejo médico. Ante síntomas, acude a un médico o a los servicios de salud.
- Los reportes pueden ser inexactos, exagerados o manipulados; el sistema reduce, pero no elimina, ese riesgo ([`docs/OPERACION.md`](docs/OPERACION.md) §5).
- Los límites de colonias son aproximados. Procedencia y licencia de los polígonos sin confirmar con el INE.
- El mapa base es de un tercero sin SLA.
- La guía "Qué hacer" **debe ser revisada por un profesional de salud** antes de presentarse como definitiva ([`docs/DECISIONES-PENDIENTES.md`](docs/DECISIONES-PENDIENTES.md) §8).
- El proyecto aún no tiene archivo `LICENSE`: la licencia del código y de los datos está **pendiente de decisión**.
- Fecha de referencia de esta documentación: 2026-10-08.
