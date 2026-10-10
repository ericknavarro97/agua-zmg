# Cómo contribuir a Agua ZMG

Gracias por querer ayudar. Este proyecto existe para que los vecinos de la Zona Metropolitana de Guadalajara tengan un mapa honesto de cómo llega el agua a su colonia. Como toca **salud pública**, varias reglas son más estrictas de lo habitual.

Hay mucho por hacer más allá del código: revisar textos y datos, probar en el teléfono de un familiar, detectar errores de accesibilidad, traducir la jerga técnica a español llano, conectar con organizaciones. Todo cuenta.

## Reglas que no se negocian

1. **No inventes datos.** Todo dato factual (cifras, mediciones, teléfonos, direcciones, plazos, recomendaciones de salud, citas) debe tener una **fuente con URL que tú hayas verificado**. Si no puedes verificarlo, márcalo como **"SIN VERIFICAR"** o no lo incluyas. En salud pública, omitir es mejor que equivocarse.
2. **Nada de datos de relleno.** El producto solo muestra datos reales (reportes de vecinos y datos externos con su fuente). No agregues datos de ejemplo ni «de demostración» al código, a las migraciones ni a la base; para probar en local, importa las colonias reales y envía reportes de prueba.
3. **Sin datos personales.** No agregues código que guarde o registre IP, *User-Agent* completo, ubicación exacta, nombres, teléfonos o correos. Los identificadores anti-abuso son HMAC con retención limitada y se anonimizan (`pnpm purge`). No expongas huellas ni identificadores en ninguna API.
4. **El mapa muestra lo que reportan los vecinos, no "la verdad".** Nada de textos como "el agua de esta colonia es potable / no potable". Sin reportes no significa agua buena. Mantén el tono neutral: ni alarmista ni tranquilizador.
5. **Los datos externos se muestran aparte** del puntaje ciudadano, siempre con su fuente y fecha.
6. **No incluyas secretos** (`.env.local`, tokens, contraseñas, claves) en commits, issues ni capturas.

## Preparar el entorno

Ver el [README](README.md#arranque-local). En resumen:

```bash
docker compose up -d
cd web
pnpm install
cp .env.example .env.local
pnpm migrate
pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias
pnpm dev
```

> **Next.js en este repo no es el que conoces.** Es la versión 16, con cambios incompatibles (por ejemplo `proxy` en vez de `middleware`, `params` asíncronos, Cache Components). **Lee `web/AGENTS.md` y la documentación incluida en `web/node_modules/next/dist/docs/` antes de escribir código de Next.** Si usas un asistente de IA, dale esas rutas.

## Flujo de trabajo

1. Abre un *issue* describiendo el problema o la propuesta antes de un cambio grande (para no duplicar esfuerzo). Para algo pequeño (una errata, un enlace roto) basta un *pull request* directo.
2. Trabaja en una rama a partir de la principal. Un cambio, un propósito.
3. Antes de enviar, corre en `web/` lo mismo que corre la CI:
   ```bash
   pnpm typecheck               # next typegen + tsc --noEmit (los tipos de rutas se generan)
   pnpm lint
   pnpm exec vitest run
   pnpm build
   ```
   `pnpm build` no debe necesitar base de datos: las páginas y rutas que consulten la base lo hacen en tiempo de petición.
4. Abre el *pull request* explicando **qué** cambia y **por qué**, cómo lo probaste y, si toca datos de salud o cifras, **la fuente**. Marca explícitamente lo que no pudiste probar.
5. La CI (`.github/workflows/ci.yml`) corre tipos, lint, pruebas, migraciones sobre PostGIS y el build, y construye las imágenes Docker. Debe pasar.

## Estilo de código

- **TypeScript estricto.** Sin `any` salvo justificación en un comentario. Valida entradas de red con `zod`.
- **Comentarios y mensajes en español**, breves, que expliquen el *porqué* (no repitan el código). Usa español de México en la interfaz.
- Mantén el estilo del código vecino. No agregues dependencias nuevas sin una razón fuerte: pregunta antes en el *issue*. Si es posible, usa Node, Postgres/PostGIS o código propio.
- **SQL**: migraciones nuevas en `db/migrations/NNN_nombre.sql` (numeración consecutiva), **idempotentes** (`IF NOT EXISTS`, `OR REPLACE`) y que no rompan datos existentes. Nunca edites una migración ya aplicada; crea una nueva. `pnpm migrate` aplica cada archivo una sola vez, dentro de una transacción.
- **Pruebas**: lo nuevo con lógica va con prueba (`vitest`). En `web/app/` usa importaciones relativas en los módulos que pruebes, porque no hay configuración de alias para vitest. La agregación y el anti-abuso tienen pruebas; si cambias un parámetro de `web/lib/aggregation.ts`, sube `METODO` y actualiza la documentación de metodología.
- **Accesibilidad**: contraste suficiente, nunca el color como único canal de información (hay patrones para confianza baja), foco visible, textos alternativos, que funcione en un teléfono modesto con datos móviles y que el HTML siga siendo útil sin JavaScript donde sea posible.

## Datos y contenido

### Datos externos (oficiales, académicos, periodísticos)

Se agregan en `data/oficial/mediciones_externas.csv` con las columnas `colonia, municipio, fuente, tipo_fuente, fecha, parametro, valor, unidad, url, notas`. Reglas:

- `tipo_fuente` ∈ `oficial`, `academica`, `periodistica`, `ciudadana`.
- `url` es obligatoria y debe ser una fuente que **abriste y leíste**. Para PDF o imágenes, anota en `notas` si lo transcribiste.
- Distingue **listados administrativos** (por ejemplo, colonias incluidas en un programa) de **mediciones** (un valor con unidad). No presentes un listado como una medición.
- No pongas valores que no estén en la fuente. Si la unidad es una suposición, dilo en `notas`.
- Detalle y advertencias en [`data/oficial/FUENTES.md`](data/oficial/FUENTES.md). La importación (`scripts/import-oficial.ts`) es idempotente y vincula a colonias por nombre; revisa los archivos de vínculos dudosos que genera.

### Polígonos de colonias

La procedencia y los límites de los polígonos están en [`data/README.md`](data/README.md). Si aportas una fuente mejor (por ejemplo, el dataset oficial del IIEG), documenta su origen, fecha y **licencia comprobada** antes de usarla. No redistribuyas capas cuya licencia no puedas confirmar.

### Guía "Qué hacer" y textos de salud

Cada afirmación lleva `[fuente: URL]` verificada ([`docs/research/guia-contenido.md`](docs/research/guia-contenido.md)). Los cambios en contenido de salud los debe revisar un profesional antes de publicarse como definitivos. No agregues teléfonos que no hayas confirmado en un sitio oficial.

### Acerca del trabajo con IA

Se vale usar asistentes de IA, pero **tú eres responsable** de lo que envías: verifica cada dato y cada cita. Una URL "plausible" que no abriste cuenta como dato inventado.

## Seguridad y abuso

- Si encuentras una vulnerabilidad, **no la publiques con detalles en un *issue* público** si permite ver datos de reportantes, saltarse la moderación o manipular el mapa. El canal de contacto de seguridad **aún no está definido** (ver [`docs/DECISIONES-PENDIENTES.md`](docs/DECISIONES-PENDIENTES.md)); mientras tanto, contacta de forma privada a quien te invitó al proyecto o a quien mantiene el repositorio.
- El diseño asume que alguien intentará manipular el mapa. Lee [`docs/research/anti-abuso.md`](docs/research/anti-abuso.md) antes de tocar `lib/aggregation.ts`, `lib/fingerprint.ts`, `lib/ratelimit.ts`, `lib/moderation.ts` o `app/api/reportes`. Cualquier cambio que facilite ocultar reportes **por lo que dicen** (en vez de por cómo llegaron) será rechazado.
- No añadas analítica ni scripts de terceros, ni pixeles de rastreo.

## Documentación

- Operación y despliegue: [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/OPERACION.md`](docs/OPERACION.md).
- API pública: [`docs/API.md`](docs/API.md) y `web/public/openapi.json`. Si cambias una ruta o un campo de `/api/v1`, actualiza ambos. Los cambios incompatibles requieren una nueva versión de ruta (`/api/v2`).
- Variables de entorno nuevas: agrégalas, con comentario, a `web/.env.example` y a la tabla del README.
- Decisiones que no son técnicas (licencias, quién modera, contacto público): no las tomes en un PR; anótalas en [`docs/DECISIONES-PENDIENTES.md`](docs/DECISIONES-PENDIENTES.md).

## Conducta

Trátate con respeto. Este proyecto convive con una disputa pública y emociones fuertes: no es un espacio para eslóganes ni acusaciones. Críticas a la metodología, a los datos o al código son bienvenidas y se responden con argumentos y fuentes. No se tolera el acoso ni la publicación de datos personales de vecinos, funcionarios o terceros.

## Licencia

El proyecto **aún no tiene archivo `LICENSE`**: la licencia del código y de los datos está pendiente de decisión (ver [`docs/DECISIONES-PENDIENTES.md`](docs/DECISIONES-PENDIENTES.md) §4). La intención es que sea software y datos abiertos. Hasta que la licencia se decida, si vas a enviar una contribución sustancial, avísalo en el *issue* para acordar cómo se licenciará.
